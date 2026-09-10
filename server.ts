import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Logger, LogLevel } from 'telegram/extensions/Logger';

// Process-wide suppression of benign MTProto internal socket timeout / cancellation rejections
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason || '');
  if (msg.includes('TIMEOUT') || msg.includes('AUTH_USER_CANCEL')) {
    return;
  }
  console.warn('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err || '');
  if (msg.includes('TIMEOUT') || msg.includes('AUTH_USER_CANCEL')) {
    return;
  }
  console.error('[Server] Uncaught Exception:', err);
});

// Custom SafeGramLogger that silences internal GramJS ping loop timeouts
class SafeGramLogger extends Logger {
  constructor() {
    super(LogLevel.NONE);
  }
  override canSend(): boolean {
    return false;
  }
  override log(): void {}
  override error(message: string): void {
    if (typeof message === 'string' && (message.includes('TIMEOUT') || message.includes('AUTH_USER_CANCEL'))) {
      return;
    }
  }
}
const safeGramLogger = new SafeGramLogger();

// Temporary directory for chunked uploads
const UPLOADS_TEMP_DIR = path.join(os.tmpdir(), 'teledrive_chunks');
if (!fs.existsSync(UPLOADS_TEMP_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_TEMP_DIR, { recursive: true });
  } catch {}
}

// Default official Telegram Desktop API credentials
const DEFAULT_API_ID = 2040;
const DEFAULT_API_HASH = 'b18441a1ff607e10a989891a5462e627';

interface ActiveQrSession {
  sessionId: string;
  client: TelegramClient;
  apiId: number;
  apiHash: string;
  qrUrl: string;
  qrToken: string;
  expires: number;
  status: 'pending' | 'success' | '2fa_required' | 'expired' | 'error';
  user?: {
    id: string;
    firstName: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
  sessionString?: string;
  twoFactorHint?: string;
  resolve2fa?: (password: string) => void;
  reject2fa?: (err: Error) => void;
  error?: string;
  createdAt: number;
  lastActive: number;
}

interface ActivePhoneSession {
  sessionId: string;
  client: TelegramClient;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash: string;
  isCodeViaApp: boolean;
  createdAt: number;
  lastActive: number;
}

const qrSessions = new Map<string, ActiveQrSession>();
const phoneSessions = new Map<string, ActivePhoneSession>();

interface CachedClient {
  client: TelegramClient;
  lastActive: number;
}
const clientCache = new Map<string, CachedClient>();
const clientDialogsCache = new Map<string, { dialogs: any[]; timestamp: number }>();
const resolvedEntityCache = new Map<string, { entity: any; timestamp: number }>();
const thumbnailCache = new Map<string, { buffer: Buffer; mimeType: string; timestamp: number }>();

async function getTelegramClient(sessionString: string): Promise<TelegramClient> {
  const existing = clientCache.get(sessionString);
  if (existing) {
    if (existing.client.connected) {
      existing.lastActive = Date.now();
      return existing.client;
    }
    try {
      await existing.client.connect();
      if (existing.client.connected) {
        existing.lastActive = Date.now();
        return existing.client;
      }
    } catch {}
  }

  const client = new TelegramClient(new StringSession(sessionString), DEFAULT_API_ID, DEFAULT_API_HASH, {
    connectionRetries: 3,
    requestRetries: 2,
    retryDelay: 1000,
    autoReconnect: true,
    deviceModel: 'TeleDrive Web',
    systemVersion: 'Chrome / Web',
    appVersion: '2.0.0',
    baseLogger: safeGramLogger,
  });
  client.setLogLevel(LogLevel.NONE);
  (client as any)._errorHandler = (err: any) => {
    // Suppress benign MTProto ping loop timeouts
    if (err && (err.message === 'TIMEOUT' || String(err).includes('TIMEOUT'))) {
      return;
    }
  };
  await client.connect();
  clientCache.set(sessionString, { client, lastActive: Date.now() });
  return client;
}

async function resolveEntity(client: TelegramClient, chatId?: string, sessionKey?: string): Promise<any> {
  if (!chatId || chatId === 'me' || chatId === 'dest-saved') {
    return 'me';
  }
  // Safeguard against placeholder or demo channel/group IDs
  if (chatId.includes('1987654321') || chatId.includes('1234567890')) {
    return 'me';
  }

  const cleanId = chatId.trim();
  const cacheKey = `${sessionKey || ''}:${cleanId}`;

  // Check in-memory entity cache (5-minute TTL)
  const cached = resolvedEntityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.entity;
  }

  // 1. Try direct client.getInputEntity first (very fast, zero network overhead if in session peer cache)
  try {
    const ent = await client.getInputEntity(cleanId);
    if (ent) {
      resolvedEntityCache.set(cacheKey, { entity: ent, timestamp: Date.now() });
      return ent;
    }
  } catch {}

  try {
    const asNum = Number(cleanId);
    if (!isNaN(asNum)) {
      const ent = await client.getInputEntity(asNum);
      if (ent) {
        resolvedEntityCache.set(cacheKey, { entity: ent, timestamp: Date.now() });
        return ent;
      }
    }
  } catch {}

  try {
    const asBig = BigInt(cleanId);
    const ent = await client.getInputEntity(asBig as any);
    if (ent) {
      resolvedEntityCache.set(cacheKey, { entity: ent, timestamp: Date.now() });
      return ent;
    }
  } catch {}

  // 2. Only if direct entity lookup fails, check cached dialogs
  let dialogs: any[] = [];
  const cachedDialogs = sessionKey ? clientDialogsCache.get(sessionKey) : undefined;
  if (cachedDialogs && Date.now() - cachedDialogs.timestamp < 5 * 60 * 1000) {
    dialogs = cachedDialogs.dialogs;
  } else {
    try {
      dialogs = await Promise.race([
        client.getDialogs({ limit: 40 }),
        new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('Dialogs fetch timeout')), 5000))
      ]);
      if (sessionKey && dialogs) {
        clientDialogsCache.set(sessionKey, { dialogs, timestamp: Date.now() });
      }
    } catch (err: any) {
      console.warn('[resolveEntity] dialogs lookup skipped or timed out:', err?.message);
    }
  }

  if (dialogs && dialogs.length > 0) {
    const match = dialogs.find(d => {
      const dId = d.id?.toString();
      const entId = d.entity?.id?.toString();
      if (dId === cleanId || entId === cleanId) return true;
      const rawTarget = cleanId.replace(/^-100/, '').replace(/^-/, '');
      const rawDId = (dId || '').replace(/^-100/, '').replace(/^-/, '');
      const rawEntId = (entId || '').replace(/^-100/, '').replace(/^-/, '');
      return Boolean(rawTarget && (rawTarget === rawDId || rawTarget === rawEntId));
    });

    if (match) {
      const ent = match.inputEntity || match.entity;
      resolvedEntityCache.set(cacheKey, { entity: ent, timestamp: Date.now() });
      return ent;
    }
  }

  return 'me';
}

function determineCategory(fileName: string, mimeType?: string): 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = (mimeType || '').toLowerCase();

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext)) {
    return 'audio';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'md'].includes(ext)) {
    return 'document';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) {
    return 'archive';
  }
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json', 'cpp', 'c', 'java', 'go', 'rs', 'php', 'sql', 'sh'].includes(ext)) {
    return 'code';
  }
  return 'other';
}

// Cleanup stale sessions older than 10 minutes and old upload temp files
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of qrSessions.entries()) {
    if (now - session.lastActive > 10 * 60 * 1000) {
      try {
        session.client.disconnect();
      } catch {}
      qrSessions.delete(id);
    }
  }
  for (const [id, session] of phoneSessions.entries()) {
    if (now - session.lastActive > 10 * 60 * 1000) {
      try {
        session.client.disconnect();
      } catch {}
      phoneSessions.delete(id);
    }
  }
  for (const [key, item] of clientCache.entries()) {
    if (now - item.lastActive > 15 * 60 * 1000) {
      try {
        item.client.disconnect();
      } catch {}
      clientCache.delete(key);
    }
  }

  // Clean stale upload temp files older than 1 hour
  try {
    if (fs.existsSync(UPLOADS_TEMP_DIR)) {
      const files = fs.readdirSync(UPLOADS_TEMP_DIR);
      for (const file of files) {
        const filePath = path.join(UPLOADS_TEMP_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {}
}, 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS middleware for cross-origin frontend support (e.g., Vercel frontend -> Render backend)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json());

  // Configure Multer for file uploads in memory
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file via direct HTTP
  });

  // Health check
  app.get(['/api/health', '/healthz'], (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Config endpoint for client-side direct connections
  app.get('/api/telegram/config', (req, res) => {
    res.json({
      success: true,
      apiId: DEFAULT_API_ID,
      apiHash: DEFAULT_API_HASH,
    });
  });

  // ==========================================
  // 1. Initialize Real Telegram QR Code Session
  // ==========================================
  app.post('/api/telegram/qr/init', async (req, res) => {
    try {
      const apiId = Number(req.body.apiId) || DEFAULT_API_ID;
      const apiHash = req.body.apiHash?.trim() || DEFAULT_API_HASH;

      const sessionId = `qr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const stringSession = new StringSession('');

      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        deviceModel: 'TeleDrive Desktop',
        systemVersion: 'Windows 11',
        appVersion: '5.0.0 x64',
        langCode: 'en',
        systemLangCode: 'en',
        baseLogger: safeGramLogger,
      });
      client.setLogLevel(LogLevel.NONE);
      (client as any)._errorHandler = (err: any) => {
        if (err && (err.message === 'TIMEOUT' || String(err).includes('TIMEOUT'))) return;
      };

      await client.connect();

      const activeSession: ActiveQrSession = {
        sessionId,
        client,
        apiId,
        apiHash,
        qrUrl: '',
        qrToken: '',
        expires: 0,
        status: 'pending',
        createdAt: Date.now(),
        lastActive: Date.now(),
      };

      qrSessions.set(sessionId, activeSession);

      // Start the official GramJS signInUserWithQrCode loop in background
      client.signInUserWithQrCode(
        { apiId, apiHash },
        {
          qrCode: async ({ token, expires }) => {
            const qrToken = Buffer.from(token).toString('base64url');
            activeSession.qrToken = qrToken;
            activeSession.qrUrl = `tg://login?token=${qrToken}`;
            activeSession.expires = expires;
            activeSession.status = 'pending';
          },
          password: async (hint) => {
            activeSession.status = '2fa_required';
            activeSession.twoFactorHint = hint;
            return new Promise<string>((resolve, reject) => {
              activeSession.resolve2fa = resolve;
              activeSession.reject2fa = reject;
            });
          },
          onError: async (err) => {
            if (err.message && (err.message.includes('AUTH_USER_CANCEL') || err.message.includes('TIMEOUT'))) {
              activeSession.status = 'expired';
              activeSession.error = 'Phiên quét mã đã hết thời gian chờ.';
              return true;
            }
            return false;
          },
        }
      )
        .then((user: any) => {
          if (user) {
            const sessionString = (client.session as any).save() as string;
            activeSession.status = 'success';
            activeSession.user = {
              id: user.id.toString(),
              firstName: user.firstName || 'Telegram User',
              lastName: user.lastName || '',
              username: user.username || undefined,
              phone: user.phone || undefined,
            };
            activeSession.sessionString = sessionString;
          }
        })
        .catch((err: any) => {
          const errMsg = err?.errorMessage || err?.message || '';
          if (errMsg === 'TIMEOUT' || errMsg.includes('TIMEOUT')) {
            if (activeSession.status !== 'success') {
              activeSession.status = 'expired';
              activeSession.error = 'Phiên quét mã đã hết hạn. Đang làm mới mã QR...';
            }
            return;
          }
          if (activeSession.status !== 'success') {
            activeSession.status = 'error';
            activeSession.error = errMsg || 'Lỗi xác thực quét mã QR Telegram';
          }
        });

      // Wait until the initial QR token is generated by GramJS
      const startTime = Date.now();
      while (!activeSession.qrUrl && activeSession.status === 'pending') {
        if (Date.now() - startTime > 20000) {
          throw new Error('Telegram MTProto: Máy chủ phản hồi chậm, vui lòng thử lại');
        }
        await new Promise(r => setTimeout(r, 100));
      }

      res.json({
        success: true,
        sessionId,
        qrUrl: activeSession.qrUrl,
        qrToken: activeSession.qrToken,
        expires: activeSession.expires,
        expiresInSeconds: Math.max(0, activeSession.expires - Math.floor(Date.now() / 1000)),
      });
    } catch (err: any) {
      console.error('[MTProto] QR Init failed:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Không thể khởi tạo mã QR MTProto Telegram',
      });
    }
  });

  // ==========================================
  // 2. Poll Status of QR Code Session (Passive & Non-destructive)
  // ==========================================
  app.get('/api/telegram/qr/status', (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId || !qrSessions.has(sessionId)) {
      return res.status(404).json({ success: false, error: 'Session not found or expired' });
    }

    const session = qrSessions.get(sessionId)!;
    session.lastActive = Date.now();

    res.json({
      success: true,
      status: session.status,
      qrUrl: session.qrUrl,
      qrToken: session.qrToken,
      expires: session.expires,
      expiresInSeconds: Math.max(0, session.expires - Math.floor(Date.now() / 1000)),
      user: session.user,
      sessionString: session.sessionString,
      twoFactorHint: session.twoFactorHint,
      error: session.error,
    });
  });

  // ==========================================
  // 3. Complete 2FA Password Check
  // ==========================================
  app.post('/api/telegram/qr/2fa', async (req, res) => {
    const { sessionId, password } = req.body;
    if (!sessionId || !qrSessions.has(sessionId)) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const session = qrSessions.get(sessionId)!;
    if (session.resolve2fa) {
      session.resolve2fa(password);

      // Wait up to 6 seconds for resolution
      const start = Date.now();
      while (session.status === '2fa_required' && Date.now() - start < 6000) {
        await new Promise(r => setTimeout(r, 150));
      }

      if (session.status === 'success') {
        return res.json({
          success: true,
          user: session.user,
          sessionString: session.sessionString,
        });
      } else if (session.status === 'error') {
        return res.status(400).json({
          success: false,
          error: session.error || 'Mật khẩu xác thực 2 bước không chính xác',
        });
      }
    }

    res.json({ success: true, status: session.status });
  });

  // ==========================================
  // 4. Cancel / Close QR Session
  // ==========================================
  app.post('/api/telegram/qr/cancel', async (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && qrSessions.has(sessionId)) {
      const session = qrSessions.get(sessionId)!;
      try {
        if (session.reject2fa) session.reject2fa(new Error('AUTH_USER_CANCEL'));
        await session.client.disconnect();
      } catch {}
      qrSessions.delete(sessionId);
    }
    res.json({ success: true });
  });

  // ==========================================
  // 5. Phone Number + Code Login Flow
  // ==========================================
  app.post('/api/telegram/phone/send-code', async (req, res) => {
    try {
      const { phoneNumber, apiId: customApiId, apiHash: customApiHash } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập số điện thoại (kèm mã quốc gia, ví dụ +84...)' });
      }

      const apiId = customApiId ? Number(customApiId) : DEFAULT_API_ID;
      const apiHash = customApiHash ? String(customApiHash).trim() : DEFAULT_API_HASH;

      const sessionId = `phone-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
        deviceModel: 'TeleDrive Desktop',
        systemVersion: 'Windows 11',
        appVersion: '5.0.0 x64',
        baseLogger: safeGramLogger,
      });
      client.setLogLevel(LogLevel.NONE);
      (client as any)._errorHandler = (err: any) => {
        if (err && (err.message === 'TIMEOUT' || String(err).includes('TIMEOUT'))) return;
      };

      await client.connect();

      const result = await client.sendCode(
        { apiId, apiHash },
        phoneNumber.trim()
      );

      phoneSessions.set(sessionId, {
        sessionId,
        client,
        apiId,
        apiHash,
        phoneNumber: phoneNumber.trim(),
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp,
        createdAt: Date.now(),
        lastActive: Date.now(),
      });

      res.json({
        success: true,
        sessionId,
        isCodeViaApp: result.isCodeViaApp,
        message: result.isCodeViaApp
          ? 'Mã xác nhận đã được gửi đến ứng dụng Telegram của bạn'
          : 'Mã xác nhận đã được gửi qua tin nhắn SMS',
      });
    } catch (err: any) {
      console.error('[MTProto Phone] sendCode failed:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'Không thể gửi mã xác nhận. Vui lòng kiểm tra lại số điện thoại.',
      });
    }
  });

  app.post('/api/telegram/phone/verify-code', async (req, res) => {
    try {
      const { sessionId, code, password } = req.body;
      if (!sessionId || !phoneSessions.has(sessionId)) {
        return res.status(404).json({ success: false, error: 'Phiên đăng nhập không tồn tại hoặc đã hết hạn.' });
      }

      const session = phoneSessions.get(sessionId)!;
      session.lastActive = Date.now();

      try {
        const user = await session.client.invoke(
          new Api.auth.SignIn({
            phoneNumber: session.phoneNumber,
            phoneCodeHash: session.phoneCodeHash,
            phoneCode: code.trim(),
          })
        ) as any;

        const sessionString = (session.client.session as any).save() as string;
        const tgUser = user.user || user;

        res.json({
          success: true,
          user: {
            id: tgUser.id.toString(),
            firstName: tgUser.firstName || 'Telegram User',
            lastName: tgUser.lastName || '',
            username: tgUser.username || undefined,
            phone: tgUser.phone || session.phoneNumber,
          },
          sessionString,
        });
      } catch (err: any) {
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (!password) {
            return res.json({
              success: false,
              needs2fa: true,
              message: 'Tài khoản có bảo mật xác thực 2 bước (2FA). Vui lòng nhập mật khẩu đám mây.',
            });
          }

          // Verify 2FA password
          const user = await (session.client as any).signInWithPassword(
            { apiId: session.apiId, apiHash: session.apiHash },
            { password }
          ) as any;

          const sessionString = (session.client.session as any).save() as string;
          const tgUser = user.user || user;

          return res.json({
            success: true,
            user: {
              id: tgUser.id.toString(),
              firstName: tgUser.firstName || 'Telegram User',
              lastName: tgUser.lastName || '',
              username: tgUser.username || undefined,
              phone: tgUser.phone || session.phoneNumber,
            },
            sessionString,
          });
        }
        throw err;
      }
    } catch (err: any) {
      console.error('[MTProto Phone] verify failed:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'Mã xác nhận hoặc mật khẩu 2FA không chính xác',
      });
    }
  });

  // ==========================================
  // 6. Verify & Get Profile from Session String
  // ==========================================
  app.get('/api/telegram/me', async (req, res) => {
    const sessionString = req.query.session as string;
    if (!sessionString) {
      return res.status(400).json({ success: false, error: 'Session string is required' });
    }

    let client: TelegramClient | null = null;
    try {
      client = new TelegramClient(new StringSession(sessionString), DEFAULT_API_ID, DEFAULT_API_HASH, {
        connectionRetries: 3,
        baseLogger: safeGramLogger,
      });
      client.setLogLevel(LogLevel.NONE);
      (client as any)._errorHandler = (err: any) => {
        if (err && (err.message === 'TIMEOUT' || String(err).includes('TIMEOUT'))) return;
      };
      await client.connect();
      const me = await client.getMe() as any;

      if (!me) {
        return res.status(401).json({ success: false, error: 'Session invalid or expired' });
      }

      res.json({
        success: true,
        user: {
          id: me.id.toString(),
          firstName: me.firstName || 'Telegram User',
          lastName: me.lastName || '',
          username: me.username || undefined,
          phone: me.phone || undefined,
        },
      });
    } catch (err: any) {
      console.error('[MTProto] GetMe failed:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch {}
      }
    }
  });

  // ==========================================
  // 7. List User Channels & Groups
  // ==========================================
  app.get('/api/telegram/dialogs', async (req, res) => {
    const sessionString = req.query.session as string;
    if (!sessionString) {
      return res.status(400).json({ success: false, error: 'Session string is required' });
    }

    try {
      const client = await getTelegramClient(sessionString);
      let dialogs: any[] = [];
      try {
        dialogs = await client.getDialogs({ limit: 40 });
        if (dialogs && dialogs.length > 0) {
          clientDialogsCache.set(sessionString, { dialogs, timestamp: Date.now() });
        }
      } catch (dErr: any) {
        console.warn('[MTProto] client.getDialogs error (CHANNEL_INVALID or similar, continuing with fallback):', dErr?.message);
      }

      const formatted = dialogs.map((d: any) => {
        const entity = d.entity || {};
        const isChannel = d.isChannel || !!entity.broadcast || false;
        const isGroup = d.isGroup || (!isChannel && !d.isUser) || false;
        const isUser = d.isUser || false;

        // Check upload permissions for channel / group
        let canUpload = true;
        if (d.id?.toString() === 'me' || isUser) {
          canUpload = true;
        } else if (isChannel) {
          // Channel: Creator or Admin with postMessages can upload
          const isCreator = !!entity.creator;
          const hasPostRight = entity.adminRights?.postMessages !== false && (!!entity.adminRights || isCreator);
          canUpload = isCreator || hasPostRight;
        } else if (isGroup) {
          // Group / megagroup: Anyone unless banned from sending media
          const isBanned = entity.defaultBannedRights?.sendMessages || entity.defaultBannedRights?.sendMedia;
          canUpload = !isBanned || !!entity.creator || !!entity.adminRights;
        }

        const participantsCount = entity.participantsCount || entity.membersCount || undefined;

        return {
          id: d.id?.toString(),
          title: d.title || d.name || 'Chat',
          isChannel,
          isGroup,
          isUser,
          unreadCount: d.unreadCount || 0,
          participantsCount,
          canUpload,
        };
      });

      // Always include 'Saved Messages' if not present
      if (!formatted.some(d => d.id === 'me' || d.title?.toLowerCase().includes('saved'))) {
        formatted.unshift({
          id: 'me',
          title: 'Saved Messages (Tin nhắn đã lưu)',
          isChannel: false,
          isGroup: false,
          isUser: true,
          unreadCount: 0,
          participantsCount: undefined,
          canUpload: true,
        });
      } else {
        const saved = formatted.find(d => d.id === 'me' || d.title?.toLowerCase().includes('saved'));
        if (saved) saved.canUpload = true;
      }

      res.json({ success: true, dialogs: formatted });
    } catch (err: any) {
      console.error('[MTProto] GetDialogs failed:', err);
      res.json({
        success: true,
        dialogs: [
          {
            id: 'me',
            title: 'Saved Messages (Tin nhắn đã lưu)',
            isChannel: false,
            isGroup: false,
            isUser: true,
            unreadCount: 0,
          },
        ],
      });
    }
  });

  // ==========================================
  // 7b. Sync Metadata (Folders, settings) to Telegram Saved Messages
  // ==========================================
  app.post('/api/telegram/sync-metadata', async (req, res) => {
    const { session, folders } = req.body;
    if (!session) {
      return res.status(400).json({ success: false, error: 'Session string is required' });
    }
    if (!Array.isArray(folders)) {
      return res.status(400).json({ success: false, error: 'Folders must be an array' });
    }

    try {
      const client = await getTelegramClient(session);
      const metadataPayload = {
        folders,
        updatedAt: Date.now(),
      };
      const textMessage = `[TeleCloud-Folder-Sync-v1]\n${JSON.stringify(metadataPayload)}`;
      
      // Send the text message to Saved Messages ('me')
      await client.sendMessage('me', { message: textMessage });
      
      res.json({ success: true, message: 'Metadata synced successfully to Saved Messages' });
    } catch (err: any) {
      console.error('[MTProto] Sync metadata failed:', err?.message || err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to sync metadata to Telegram' });
    }
  });

  app.get('/api/telegram/sync-metadata', async (req, res) => {
    const sessionString = req.query.session as string;
    if (!sessionString) {
      return res.status(400).json({ success: false, error: 'Session string is required' });
    }

    try {
      const client = await getTelegramClient(sessionString);
      let foundMetadata: any = null;

      // Look at the last 50 messages in Saved Messages to find the latest folder sync message
      for await (const msg of client.iterMessages('me', { limit: 50 })) {
        if (msg.message && msg.message.startsWith('[TeleCloud-Folder-Sync-v1]')) {
          try {
            const jsonPart = msg.message.substring('[TeleCloud-Folder-Sync-v1]\n'.length);
            foundMetadata = JSON.parse(jsonPart);
            break; // Found the latest one
          } catch (e) {
            console.error('[MTProto] Failed to parse folder sync JSON from message:', e);
          }
        }
      }

      if (foundMetadata) {
        res.json({ success: true, folders: foundMetadata.folders || [] });
      } else {
        res.json({ success: true, folders: [], message: 'No sync message found' });
      }
    } catch (err: any) {
      console.error('[MTProto] Fetch metadata failed:', err?.message || err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch metadata from Telegram' });
    }
  });

  // ==========================================
  // 8. Fetch/Sync Files from Telegram Cloud
  // ==========================================
  app.get('/api/telegram/files', async (req, res) => {
    const sessionString = req.query.session as string;
    const chatId = (req.query.chatId as string) || 'me';
    const limit = Math.min(1000, Math.max(20, parseInt(req.query.limit as string) || 500));

    if (!sessionString) {
      return res.status(400).json({ success: false, error: 'Session string is required' });
    }

    try {
      const client = await getTelegramClient(sessionString);
      const target = await resolveEntity(client, chatId, sessionString.slice(0, 20));

      // Determine chat title for storageName if possible
      let resolvedTitle = (chatId === 'me' || chatId === 'dest-saved') ? 'Saved Messages (Tin nhắn đã lưu)' : 'Telegram Channel';
      try {
        if (target !== 'me') {
          if ((target as any)?.title) {
            resolvedTitle = (target as any).title;
          } else if ((target as any)?.username) {
            resolvedTitle = `@${(target as any).username}`;
          }
        }
      } catch {}

      // Iterate through message history to capture files and links with 18s time guard to prevent gateway 504 timeouts
      const files: any[] = [];
      const links: any[] = [];
      const scanStartTime = Date.now();

      try {
        for await (const msg of client.iterMessages(target, { limit })) {
          if (Date.now() - scanStartTime > 18000) {
            console.log(`[MTProto] Message scan completed safely under 18s guard: ${files.length} files found, ${links.length} links found`);
            break;
          }
          if (!msg) continue;

          // Ignore folder/metadata synchronization messages
          if (msg.message && msg.message.startsWith('[TeleCloud-Folder-Sync-v1]')) {
            continue;
          }

          // 1. Extract plain-text links/hyperlinks from message body or caption
          if (msg.message && msg.message.trim().length > 0) {
            const urlRegex = /https?:\/\/[^\s"'<>\(\)]+/gi;
            const matches = msg.message.match(urlRegex);
            if (matches) {
              // Extract webpage preview if available
              let previewInfo: any = {};
              if (msg.media && msg.media.className === 'MessageMediaWebPage' && (msg.media as any).webpage) {
                const wp = (msg.media as any).webpage;
                if (wp.className !== 'WebPageEmpty' && wp.className !== 'WebPagePending') {
                  previewInfo.title = wp.title || undefined;
                  previewInfo.description = wp.description || undefined;
                  previewInfo.siteName = wp.siteName || undefined;
                  if (wp.photo) {
                    previewInfo.previewUrl = `/api/telegram/download?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId)}&messageId=${msg.id}&preview=1&inline=1`;
                  }
                }
              } else if (msg.media && msg.media.className === 'MessageMediaPhoto') {
                // If there's a standalone photo attached to the link message, we can use it as preview
                previewInfo.previewUrl = `/api/telegram/download?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId)}&messageId=${msg.id}&preview=1&inline=1`;
              }

              for (const url of matches) {
                // Avoid duplicating exactly the same link in the list if from the same message
                if (!links.some(l => l.url === url && l.telegramMessageId === msg.id)) {
                  links.push({
                    id: `link-${chatId}-${msg.id}-${Buffer.from(url.slice(0, Math.min(15, url.length))).toString('hex')}`,
                    url: url,
                    messageText: msg.message,
                    telegramMessageId: msg.id,
                    telegramChatId: chatId,
                    createdAt: (msg.date || Date.now() / 1000) * 1000,
                    ...previewInfo,
                  });
                }
              }
            }
          }

          // 2. If message has media, extract it as a file
          if (!msg.media) continue;

          let fileName = '';
          let fileSize = 0;
          let mimeType = 'application/octet-stream';
          let isMedia = false;

          if (msg.media.className === 'MessageMediaDocument' && (msg.media as any).document) {
            const doc = (msg.media as any).document;
            mimeType = doc.mimeType || 'application/octet-stream';
            fileSize = Number(doc.size) || 0;
            const fnAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename');
            const videoAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeVideo');
            const audioAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeAudio');

            if (fnAttr?.fileName) {
              fileName = fnAttr.fileName;
            } else if (msg.message && msg.message.trim().length > 0 && msg.message.trim().length < 80) {
              fileName = msg.message.trim();
            } else if (videoAttr) {
              fileName = `video_${msg.id}.mp4`;
            } else if (audioAttr) {
              const title = audioAttr.title || `audio_${msg.id}`;
              const performer = audioAttr.performer ? `${audioAttr.performer} - ` : '';
              fileName = `${performer}${title}.mp3`;
            } else {
              fileName = `file_${msg.id}`;
            }
            isMedia = true;
          } else if (msg.media.className === 'MessageMediaPhoto') {
            mimeType = 'image/jpeg';
            fileSize = 1024 * 500; // estimated photo size
            fileName = msg.message && msg.message.length < 60
              ? `${msg.message.trim().replace(/[\\/:*?"<>|]/g, '_')}.jpg`
              : `photo_${msg.id}.jpg`;
            isMedia = true;
          }

          if (isMedia) {
            // Clean file name
            fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
            if (!fileName.includes('.')) {
              if (mimeType.includes('pdf')) fileName += '.pdf';
              else if (mimeType.includes('png')) fileName += '.png';
              else if (mimeType.includes('jpeg')) fileName += '.jpg';
              else if (mimeType.includes('zip')) fileName += '.zip';
              else if (mimeType.includes('mp4')) fileName += '.mp4';
              else if (mimeType.includes('mp3')) fileName += '.mp3';
            }

            const category = determineCategory(fileName, mimeType);
            const downloadUrl = `/api/telegram/download?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId)}&messageId=${msg.id}&filename=${encodeURIComponent(fileName)}`;
            const previewUrl = (category === 'image' || category === 'video' || category === 'audio')
              ? `${downloadUrl}&preview=1`
              : undefined;

            files.push({
              id: `tg-${chatId}-${msg.id}`,
              name: fileName,
              size: fileSize,
              category,
              mimeType,
              folderId: null,
              createdAt: (msg.date || Date.now() / 1000) * 1000,
              updatedAt: (msg.date || Date.now() / 1000) * 1000,
              telegramMessageId: msg.id,
              telegramChatId: chatId,
              storageTarget: (chatId === 'me' || chatId === 'dest-saved') ? 'saved' : 'channel',
              storageName: resolvedTitle,
              isEncrypted: false,
              isStarred: false,
              isTrash: false,
              downloadUrl,
              previewUrl,
              description: msg.message || undefined,
            });
          }
        }
      } catch (iterErr: any) {
        console.warn('[MTProto] Message iteration stopped or partially completed:', iterErr?.message);
      }

      res.json({
        success: true,
        files,
        links,
        totalFiles: files.length,
        totalLinks: links.length,
      });
    } catch (err: any) {
      console.error('[MTProto] GetFiles failed:', err?.message || err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch files from Telegram' });
    }
  });

  // ==========================================
  // 9. Download / Stream Media from Telegram MTProto
  // ==========================================
  class ConcurrencyQueue {
    private active = 0;
    private limit = 3; // Limit parallel MTProto downloads to 3 for stability and speed
    private waiting: (() => void)[] = [];

    async run<T>(task: () => Promise<T>): Promise<T> {
      if (this.active >= this.limit) {
        await new Promise<void>((resolve) => this.waiting.push(resolve));
      }
      this.active++;
      try {
        return await task();
      } finally {
        this.active--;
        const next = this.waiting.shift();
        if (next) next();
      }
    }
  }

  const downloadQueue = new ConcurrencyQueue();

  app.get('/api/telegram/download', async (req, res) => {
    const sessionString = req.query.session as string;
    const chatId = (req.query.chatId as string) || 'me';
    const messageId = parseInt(req.query.messageId as string);
    const filename = (req.query.filename as string) || `telegram_file_${messageId}`;
    const preview = req.query.preview === '1';
    const inline = req.query.inline === '1';

    if (!sessionString || !messageId) {
      return res.status(400).json({ success: false, error: 'session and messageId are required' });
    }

    const thumbKey = `${sessionString.slice(0, 16)}:${chatId}:${messageId}`;
    if (preview && thumbnailCache.has(thumbKey)) {
      const cached = thumbnailCache.get(thumbKey)!;
      res.setHeader('Content-Type', cached.mimeType);
      res.setHeader('Content-Length', cached.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      return res.end(cached.buffer);
    }

    try {
      const client = await getTelegramClient(sessionString);
      const target = await resolveEntity(client, chatId, sessionString.slice(0, 20));

      const msgs = await client.getMessages(target, { ids: [messageId] });
      const msg = msgs && msgs[0];

      if (!msg || !msg.media) {
        return res.status(404).json({ success: false, error: 'File or media not found in Telegram chat' });
      }

      let mimeType = 'application/octet-stream';
      let downloadOptions: any = {};

      if (msg.media.className === 'MessageMediaDocument' && (msg.media as any).document) {
        const doc = (msg.media as any).document;
        mimeType = doc.mimeType || mimeType;

        if (preview) {
          // If preview, use thumbnail if available to prevent downloading huge files
          if (doc.thumbs && doc.thumbs.length > 0) {
            // Find the smallest/medium thumbnail (usually the first one in doc.thumbs, e.g. type 's' or 'm') to maximize loading speed
            downloadOptions.thumb = doc.thumbs[0];
            mimeType = 'image/jpeg';
          } else {
            // For large documents/videos without thumbnails, do not attempt to download full file for a preview
            const docSize = Number(doc.size) || 0;
            if (docSize > 10 * 1024 * 1024) {
              return res.status(404).json({ success: false, error: 'No thumbnail available for preview' });
            }
          }
        }
      } else if (msg.media.className === 'MessageMediaPhoto' && (msg.media as any).photo) {
        mimeType = 'image/jpeg';
        if (preview) {
          const photo = (msg.media as any).photo;
          if (photo.sizes && photo.sizes.length > 0) {
            const sizes = photo.sizes;
            // Prefer 's' (small, ~5-10KB) or 'm' (medium, ~15-25KB) for incredibly fast listing/grid loading
            const thumbObj = sizes.find((s: any) => s.type === 's') || sizes.find((s: any) => s.type === 'm') || sizes[0];
            downloadOptions.thumb = thumbObj;
          }
        }
      } else if (msg.media.className === 'MessageMediaPhoto') {
        mimeType = 'image/jpeg';
      } else if (msg.media.className === 'MessageMediaWebPage') {
        mimeType = 'image/jpeg';
      }

      // Download buffer with timeout guard and single retry
      let buffer: Buffer | undefined;
      try {
        buffer = await downloadQueue.run(async () => {
          return await Promise.race([
            client.downloadMedia(msg, downloadOptions) as Promise<Buffer>,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Download timeout (upload.GetFile)')), preview ? 30000 : 60000)
            )
          ]);
        });
      } catch (dlErr: any) {
        console.warn(`[MTProto] Initial download with thumb/options failed (${dlErr?.message || dlErr}), retrying with full media fallback...`);
        // Retry once WITHOUT downloadOptions (full media fallback)
        try {
          buffer = await downloadQueue.run(async () => {
            return await Promise.race([
              client.downloadMedia(msg, {}) as Promise<Buffer>,
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Fallback download timeout')), 30000)
              )
            ]);
          });
        } catch (retryErr: any) {
          console.error('[MTProto] Full media download fallback also failed:', retryErr?.message || retryErr);
        }
      }

      if (!buffer || buffer.length === 0) {
        return res.status(500).json({ success: false, error: 'Unable to download media from Telegram' });
      }

      // If this was a preview, cache it
      if (preview && buffer.length < 5 * 1024 * 1024) {
        thumbnailCache.set(thumbKey, { buffer, mimeType, timestamp: Date.now() });
      }

      const safeFilename = filename.replace(/["\r\n]/g, '_');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      if (preview || inline) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      res.setHeader(
        'Content-Disposition',
        `${(preview || inline) ? 'inline' : 'attachment'}; filename="${encodeURIComponent(safeFilename)}"`
      );

      res.end(buffer);
    } catch (err: any) {
      console.error('[MTProto] Download failed:', err?.message || err);
      res.status(500).json({ success: false, error: err?.message || 'Download failed' });
    }
  });

  // Configure Multer for chunk uploads (max 25MB per chunk)
  const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  // Track in-progress chunk upload sequential writes
  const uploadLocks = new Map<string, Promise<void>>();

  // Background Telegram upload jobs to avoid HTTP timeouts and provide live progress
  interface TelegramUploadJob {
    uploadId: string;
    cleanFileName: string;
    status: 'pending' | 'uploading_to_telegram' | 'completed' | 'error';
    progress: number; // 0 to 100
    speedMB: string;
    eta: string;
    error?: string;
    result?: {
      success?: boolean;
      messageId: number;
      chatId: any;
      fileSize: number;
      fileName: string;
      downloadUrl: string;
    };
    isCanceled?: boolean;
    startTime: number;
  }
  const activeUploadJobs = new Map<string, TelegramUploadJob>();

  // ==========================================
  // 10a. Chunked Upload to Telegram MTProto (Supports up to 2GB)
  // ==========================================
  app.post('/api/telegram/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
    const {
      uploadId,
      chunkIndex: chunkIdxStr,
      totalChunks: totalChunksStr,
      fileName,
      fileSize: fileSizeStr,
      sessionString,
      chatId,
      caption,
    } = req.body;
    const chunkFile = req.file;

    if (!uploadId || !chunkFile || chunkIdxStr === undefined || !totalChunksStr) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin phân đoạn tải lên (uploadId, chunk, chunkIndex, totalChunks)',
      });
    }

    if (!sessionString) {
      return res.status(400).json({
        success: false,
        error: 'Cần đăng nhập Telegram để lưu tệp vào Saved Messages',
      });
    }

    const chunkIndex = parseInt(chunkIdxStr);
    const totalChunks = parseInt(totalChunksStr);
    const fileSize = parseInt(fileSizeStr) || 0;
    const cleanFileName = (fileName || 'file').replace(/[\\/:*?"<>|]/g, '_');
    const partPath = path.join(UPLOADS_TEMP_DIR, `${uploadId}.part`);

    try {
      // Synchronize writing chunks sequentially to disk
      const prevLock = uploadLocks.get(uploadId) || Promise.resolve();
      const currentLock = prevLock.then(async () => {
        if (chunkIndex === 0 && fs.existsSync(partPath)) {
          try {
            fs.unlinkSync(partPath);
          } catch {}
        }
        await fs.promises.appendFile(partPath, chunkFile.buffer);
      });
      uploadLocks.set(uploadId, currentLock);
      await currentLock;

      // If more chunks are expected, acknowledge receipt immediately
      if (chunkIndex < totalChunks - 1) {
        return res.json({
          success: true,
          chunkReceived: chunkIndex,
          totalChunks,
          nextChunk: chunkIndex + 1,
        });
      }

      // Last chunk received! All bytes are assembled on disk.
      uploadLocks.delete(uploadId);
      const finalFilePath = path.join(UPLOADS_TEMP_DIR, `${uploadId}_${cleanFileName}`);
      if (fs.existsSync(finalFilePath)) {
        try {
          fs.unlinkSync(finalFilePath);
        } catch {}
      }
      await fs.promises.rename(partPath, finalFilePath);

      // Register the background job
      const job: TelegramUploadJob = {
        uploadId,
        cleanFileName,
        status: 'uploading_to_telegram',
        progress: 1,
        speedMB: '0.0 MB/s',
        eta: 'Đang kết nối...',
        startTime: Date.now(),
      };
      activeUploadJobs.set(uploadId, job);

      // Return immediately to client so HTTP connection does NOT block or timeout
      res.json({
        success: true,
        allChunksReceived: true,
        uploadId,
        status: 'processing',
      });

      // Start the background upload directly from disk to Telegram via MTProto
      (async () => {
        try {
          const actualSize = (await fs.promises.stat(finalFilePath)).size;
          console.log(`[MTProto Chunked Upload] Assembled file "${cleanFileName}" (${actualSize} bytes). Uploading directly to Telegram (${chatId || 'me'})...`);

          const client = await getTelegramClient(sessionString);
          const target = await resolveEntity(client, chatId);

          const { CustomFile } = await import('telegram/client/uploads.js');
          const customFile = new CustomFile(cleanFileName, actualSize, finalFilePath);

          const tgStartTime = Date.now();
          const progressCallback = (fraction: number) => {
            if (job.isCanceled) {
              (progressCallback as any).isCanceled = true;
              throw new Error('USER_CANCELED');
            }
            const pct = Math.min(99, Math.max(1, Math.round(fraction * 100)));
            const currentBytes = fraction * actualSize;
            const elapsedSec = Math.max(0.2, (Date.now() - tgStartTime) / 1000);
            const speedBytes = currentBytes / elapsedSec;
            const speedMB = (speedBytes / (1024 * 1024)).toFixed(1);
            const remainingBytes = Math.max(0, actualSize - currentBytes);
            const remainingSec = Math.max(1, Math.round(remainingBytes / Math.max(1, speedBytes)));
            const eta = remainingSec > 60 ? `${Math.ceil(remainingSec / 60)}m` : `${remainingSec}s`;

            job.progress = pct;
            job.speedMB = `${speedMB} MB/s`;
            job.eta = eta;
          };

          // Send file to Telegram directly from disk via MTProto with 4 concurrent workers for speed
          const resultMessage = (await (client as any).sendFile(target, {
            file: customFile,
            caption: caption || `TeleDrive Cloud: ${cleanFileName}`,
            forceDocument: true,
            workers: 4,
            progressCallback,
          })) as any;

          console.log(`[MTProto Chunked Upload] Successfully uploaded "${cleanFileName}" to Telegram! MessageId: ${resultMessage.id}`);

          // Clean up temp file
          try {
            if (fs.existsSync(finalFilePath)) {
              await fs.promises.unlink(finalFilePath);
            }
          } catch {}

          const downloadUrl = `/api/telegram/download?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId || 'me')}&messageId=${resultMessage.id}&filename=${encodeURIComponent(cleanFileName)}`;

          job.status = 'completed';
          job.progress = 100;
          job.speedMB = 'Xong';
          job.eta = '0s';
          job.result = {
            success: true,
            messageId: resultMessage.id,
            chatId: target,
            fileSize: fileSize || resultMessage?.media?.document?.size || actualSize,
            fileName: cleanFileName,
            downloadUrl,
          };

          setTimeout(() => activeUploadJobs.delete(uploadId), 10 * 60 * 1000);
        } catch (err: any) {
          console.error('[MTProto Chunked Upload] Error uploading file to Telegram:', err);
          try {
            if (fs.existsSync(finalFilePath)) await fs.promises.unlink(finalFilePath);
          } catch {}
          job.status = 'error';
          job.error = err.errorMessage || err.message || 'Lỗi khi gửi tệp lên Telegram MTProto';
          setTimeout(() => activeUploadJobs.delete(uploadId), 5 * 60 * 1000);
        }
      })();
    } catch (err: any) {
      console.error('[MTProto Chunked Upload] Error saving chunk:', err);
      uploadLocks.delete(uploadId);
      try {
        if (fs.existsSync(partPath)) await fs.promises.unlink(partPath);
        const finalFilePath = path.join(UPLOADS_TEMP_DIR, `${uploadId}_${cleanFileName}`);
        if (fs.existsSync(finalFilePath)) await fs.promises.unlink(finalFilePath);
      } catch {}

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: err.errorMessage || err.message || 'Lỗi khi ghi phần tệp lên máy chủ',
        });
      }
    }
  });

  // Check upload job status (for real-time progress & completion)
  app.get('/api/telegram/upload-status', (req, res) => {
    const uploadId = req.query.uploadId as string;
    if (!uploadId) {
      return res.status(400).json({ success: false, error: 'Thiếu uploadId' });
    }
    const job = activeUploadJobs.get(uploadId);
    if (!job) {
      return res.json({ success: false, status: 'unknown' });
    }
    return res.json({
      success: true,
      status: job.status,
      progress: job.progress,
      speedMB: job.speedMB,
      eta: job.eta,
      result: job.result,
      error: job.error,
    });
  });

  // Cancel chunk upload and cleanup disk
  app.post('/api/telegram/upload-cancel', async (req, res) => {
    const { uploadId } = req.body;
    if (uploadId) {
      uploadLocks.delete(uploadId);
      const job = activeUploadJobs.get(uploadId);
      if (job) {
        job.isCanceled = true;
        job.status = 'error';
        job.error = 'Đã hủy bởi người dùng';
      }
      try {
        const partPath = path.join(UPLOADS_TEMP_DIR, `${uploadId}.part`);
        if (fs.existsSync(partPath)) await fs.promises.unlink(partPath);
        const files = await fs.promises.readdir(UPLOADS_TEMP_DIR);
        for (const f of files) {
          if (f.startsWith(uploadId)) {
            await fs.promises.unlink(path.join(UPLOADS_TEMP_DIR, f));
          }
        }
      } catch {}
    }
    res.json({ success: true });
  });

  // ==========================================
  // 10b. Upload Single File to Telegram (Direct)
  // ==========================================
  app.post('/api/telegram/upload', upload.single('file'), async (req, res) => {
    const sessionString = req.body.sessionString;
    const chatId = req.body.chatId; // "me" for Saved Messages, or channel/group ID
    const caption = req.body.caption;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    if (!sessionString) {
      return res.status(400).json({ success: false, error: 'Telegram session is required' });
    }

    const cleanFileName = uploadedFile.originalname.replace(/[\\/:*?"<>|]/g, '_');
    const tempFilePath = path.join(UPLOADS_TEMP_DIR, `single_${Date.now()}_${cleanFileName}`);

    try {
      // Write to temp file on disk so GramJS streams it cleanly
      await fs.promises.writeFile(tempFilePath, uploadedFile.buffer);

      const client = await getTelegramClient(sessionString);
      const target = await resolveEntity(client, chatId);

      const resultMessage = (await (client as any).sendFile(target, {
        file: tempFilePath,
        caption: caption || `TeleDrive Cloud: ${cleanFileName}`,
        forceDocument: true,
        workers: 4,
      })) as any;

      try {
        if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
      } catch {}

      const downloadUrl = `/api/telegram/download?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId || 'me')}&messageId=${resultMessage.id}&filename=${encodeURIComponent(cleanFileName)}`;

      res.json({
        success: true,
        messageId: resultMessage.id,
        chatId: target,
        fileSize: uploadedFile.size,
        fileName: cleanFileName,
        downloadUrl,
      });
    } catch (err: any) {
      console.error('[MTProto] Direct upload error:', err);
      try {
        if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
      } catch {}
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // 11. Delete Message/File from Telegram
  // ==========================================
  app.post('/api/telegram/delete', async (req, res) => {
    const { sessionString, chatId, messageId, messageIds } = req.body;
    if (!sessionString || (!messageId && (!Array.isArray(messageIds) || messageIds.length === 0))) {
      return res.status(400).json({ success: false, error: 'sessionString and messageId(s) are required' });
    }

    try {
      if (chatId?.includes('1987654321') || chatId?.includes('1234567890')) {
        return res.json({ success: true, simulated: true });
      }

      const client = await getTelegramClient(sessionString);
      const target = await resolveEntity(client, chatId);
      const idsToDelete = Array.isArray(messageIds)
        ? messageIds.map(Number).filter(n => !isNaN(n))
        : [Number(messageId)];

      try {
        await client.deleteMessages(target, idsToDelete, { revoke: true });
      } catch (delErr: any) {
        console.warn('[MTProto] Telegram deleteMessages warning (ignored):', delErr?.message);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.warn('[MTProto] Delete failed (returning success to allow local deletion):', err?.message);
      res.json({ success: true, warning: err?.message });
    }
  });

  // ==========================================
  // 11b. Verify Messages Existence (Check Deleted Files on Telegram)
  // ==========================================
  app.post('/api/telegram/verify-messages', async (req, res) => {
    const { session, chatId, messageIds } = req.body;
    if (!session || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, error: 'session and messageIds array are required' });
    }

    try {
      const client = await getTelegramClient(session);
      const target = await resolveEntity(client, chatId);

      const idsToCheck = messageIds.slice(0, 500).map(Number).filter(n => !isNaN(n));
      const msgs = await client.getMessages(target, { ids: idsToCheck });

      const deletedIds: number[] = [];
      const existingIds: number[] = [];

      for (const id of idsToCheck) {
        const found: any = msgs?.find((m: any) => m && m.id === id);
        if (!found || !found.media || found.className === 'MessageEmpty' || found.empty) {
          deletedIds.push(id);
        } else {
          existingIds.push(id);
        }
      }

      res.json({
        success: true,
        deletedIds,
        existingIds,
      });
    } catch (err: any) {
      console.warn('[MTProto] Verify messages failed:', err?.message);
      res.json({ success: true, deletedIds: [], existingIds: messageIds });
    }
  });

  // ==========================================
  // 12. Rename / Edit Caption on Telegram
  // ==========================================
  app.post('/api/telegram/rename', async (req, res) => {
    const { sessionString, chatId, messageId, newName } = req.body;
    if (!sessionString || !messageId || !newName) {
      return res.status(400).json({ success: false, error: 'sessionString, messageId, and newName are required' });
    }

    try {
      if (chatId?.includes('1987654321') || chatId?.includes('1234567890')) {
        return res.json({ success: true, newName, simulated: true });
      }

      const client = await getTelegramClient(sessionString);
      const target = await resolveEntity(client, chatId);
      try {
        await client.editMessage(target, {
          message: Number(messageId),
          text: `TeleDrive Cloud: ${newName}`,
        });
      } catch (editErr: any) {
        console.warn('[MTProto] Telegram editMessage warning (ignored):', editErr?.message);
      }
      res.json({ success: true, newName });
    } catch (err: any) {
      console.warn('[MTProto] Rename failed (returning success for local state):', err?.message);
      res.json({ success: true, newName, warning: err?.message });
    }
  });

  // ==========================================
  // 13. Forward File / Message in Telegram
  // ==========================================
  app.post('/api/telegram/forward', async (req, res) => {
    const { sessionString, fromChatId, toChatId, messageId } = req.body;
    if (!sessionString || !toChatId || !messageId) {
      return res.status(400).json({ success: false, error: 'sessionString, toChatId, and messageId are required' });
    }

    try {
      const client = await getTelegramClient(sessionString);
      const fromTarget = await resolveEntity(client, fromChatId);
      const toTarget = await resolveEntity(client, toChatId);
      try {
        const result = await client.forwardMessages(toTarget, {
          messages: [Number(messageId)],
          fromPeer: fromTarget,
        });
        res.json({ success: true, result });
      } catch (fwdErr: any) {
        console.warn('[MTProto] Telegram forwardMessages warning:', fwdErr?.message);
        res.json({ success: true, warning: fwdErr?.message });
      }
    } catch (err: any) {
      console.error('[MTProto] Forward failed:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // 9. Vite Middleware for SPA Frontend
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TeleDrive Server] MTProto Backend listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server Error] Failed to start:', err);
});
