import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads.js';
import QRCode from 'qrcode/lib/browser';

const DEFAULT_API_ID = 2040;
const DEFAULT_API_HASH = 'b18441a1ff607e10a989891a5462e627';

let browserClient: TelegramClient | null = null;

export async function getBrowserTelegramClient(sessionString: string): Promise<TelegramClient> {
  // Check if direct connection previously failed in this browser session
  if (typeof window !== 'undefined' && sessionStorage.getItem('teledrive_direct_failed') === 'true') {
    // We remove the hard block to allow manual retries / serverless mode
    sessionStorage.removeItem('teledrive_direct_failed');
  }

  if (browserClient) {
    try {
      if (browserClient.connected) {
        return browserClient;
      }
      await browserClient.connect();
      return browserClient;
    } catch {
      browserClient = null;
    }
  }

  // Fetch API keys from the server config with a fallback
  let apiId = DEFAULT_API_ID;
  let apiHash = DEFAULT_API_HASH;

  try {
    const res = await fetch('/api/telegram/config');
    const config = await res.json();
    if (config && config.success) {
      apiId = config.apiId;
      apiHash = config.apiHash;
    }
  } catch {
    console.warn('[BrowserClient] Failed to fetch credentials from server, falling back to Telegram Desktop defaults');
  }

  // Browser-side GramJS client connecting via WebSocket
  browserClient = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
    requestRetries: 3,
    useWSS: true, // Secure WebSocket connection
    deviceModel: 'TeleDrive Browser Client',
    systemVersion: 'Web Browser',
    appVersion: '2.0.0',
  });

  // Suppress harmless MTProto connection logs/errors from bubbling to browser console/window
  (browserClient as any)._errorHandler = () => {};

  await browserClient.connect();
  return browserClient;
}

// ==========================================
// CLIENT-SIDE QR LOGIN FLOW
// ==========================================
export interface ClientQrSession {
  sessionId: string;
  client: TelegramClient;
  status: 'pending' | 'success' | '2fa_required' | 'expired' | 'error';
  qrUrl?: string;
  qrToken?: string;
  qrDataUrl?: string;
  expires?: number;
  user?: any;
  sessionString?: string;
  error?: string;
  resolve2fa?: (password: string) => void;
  reject2fa?: (err: Error) => void;
}

export const clientQrSessions = new Map<string, ClientQrSession>();

export async function initClientTelegramQr(apiId?: number, apiHash?: string): Promise<any> {
  const finalApiId = apiId || DEFAULT_API_ID;
  const finalApiHash = apiHash || DEFAULT_API_HASH;

  const sessionId = `client-qr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const client = new TelegramClient(new StringSession(''), finalApiId, finalApiHash, {
    connectionRetries: 5,
    useWSS: true,
    deviceModel: 'TeleCloud Client',
    systemVersion: 'Browser',
    appVersion: '2.0.0',
  });

  const session: ClientQrSession = {
    sessionId,
    client,
    status: 'pending',
  };
  clientQrSessions.set(sessionId, session);

  await client.connect();

  // Run the signInUserWithQrCode loop in the background
  client.signInUserWithQrCode(
    { apiId: finalApiId, apiHash: finalApiHash },
    {
      qrCode: async ({ token, expires }) => {
        // Base64url encoding manual replacement for browser buffer compatibility
        const qrToken = Buffer.from(token).toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        session.qrToken = qrToken;
        session.qrUrl = `tg://login?token=${qrToken}`;
        session.expires = expires;
        session.status = 'pending';
      },
      password: async () => {
        session.status = '2fa_required';
        return new Promise<string>((resolve, reject) => {
          session.resolve2fa = resolve;
          session.reject2fa = reject;
        });
      },
      onError: async (err) => {
        if (err.message && (err.message.includes('AUTH_USER_CANCEL') || err.message.includes('TIMEOUT'))) {
          session.status = 'expired';
          session.error = 'Phiên quét mã đã hết thời gian chờ.';
          return true;
        }
        return false;
      },
    }
  )
    .then((user: any) => {
      if (user) {
        const sessionString = (client.session as any).save() as string;
        session.status = 'success';
        session.user = {
          id: user.id.toString(),
          firstName: user.firstName || 'Telegram User',
          lastName: user.lastName || '',
          username: user.username || undefined,
          phone: user.phone || undefined,
        };
        session.sessionString = sessionString;
      }
    })
    .catch((err: any) => {
      const errMsg = err?.errorMessage || err?.message || '';
      session.status = 'error';
      session.error = errMsg || 'Lỗi xác thực quét mã QR Telegram';
    });

  // Wait for the QR code URL to be initially populated
  const startWait = Date.now();
  while (!session.qrUrl && session.status === 'pending') {
    if (Date.now() - startWait > 12000) {
      throw new Error('Không thể khởi tạo mã QR từ Telegram (WebSocket Timeout).');
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (session.status === 'error') {
    throw new Error(session.error || 'Khởi tạo MTProto QR thất bại');
  }

  if (!session.qrUrl) {
    throw new Error('Telegram MTProto không phản hồi URL mã QR.');
  }

  const svgString = await QRCode.toString(session.qrUrl, {
    type: 'svg',
    width: 280,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;

  return {
    sessionId,
    qrUrl: session.qrUrl,
    qrToken: session.qrToken,
    qrDataUrl,
    expires: session.expires,
    expiresInSeconds: 30,
  };
}

export async function pollClientTelegramQr(sessionId: string): Promise<any> {
  const session = clientQrSessions.get(sessionId);
  if (!session) {
    throw new Error('Không tìm thấy phiên quét mã.');
  }

  let qrDataUrl: string | undefined;
  if (session.qrUrl) {
    const svgString = await QRCode.toString(session.qrUrl, {
      type: 'svg',
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }

  return {
    success: true,
    status: session.status,
    qrUrl: session.qrUrl,
    qrToken: session.qrToken,
    qrDataUrl,
    expires: session.expires,
    expiresInSeconds: 30,
    user: session.user,
    sessionString: session.sessionString,
    error: session.error,
  };
}

export async function submitClient2faPassword(sessionId: string, password: string): Promise<any> {
  const session = clientQrSessions.get(sessionId);
  if (!session) {
    throw new Error('Không tìm thấy phiên quét mã.');
  }
  if (session.resolve2fa) {
    session.resolve2fa(password);
    return { success: true };
  } else {
    throw new Error('Phiên này không yêu cầu mật khẩu 2FA.');
  }
}

export async function cancelClientTelegramQr(sessionId: string): Promise<any> {
  const session = clientQrSessions.get(sessionId);
  if (session) {
    try {
      await session.client.disconnect();
    } catch {}
    clientQrSessions.delete(sessionId);
  }
}

// ==========================================
// CLIENT-SIDE PHONE LOGIN FLOW
// ==========================================
export interface ClientPhoneSession {
  sessionId: string;
  client: TelegramClient;
  phoneNumber: string;
  resolveCode?: (code: string) => void;
  resolvePassword?: (password: string) => void;
  status: 'pending' | 'awaiting_code' | 'awaiting_password' | 'success' | 'error';
  user?: any;
  sessionString?: string;
  error?: string;
}

export const clientPhoneSessions = new Map<string, ClientPhoneSession>();

export async function sendClientPhoneCode(phoneNumber: string, apiId?: number, apiHash?: string): Promise<any> {
  const finalApiId = apiId || DEFAULT_API_ID;
  const finalApiHash = apiHash || DEFAULT_API_HASH;

  const sessionId = `client-phone-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const client = new TelegramClient(new StringSession(''), finalApiId, finalApiHash, {
    connectionRetries: 5,
    useWSS: true,
    deviceModel: 'TeleCloud Client',
    systemVersion: 'Browser',
    appVersion: '2.0.0',
  });

  const session: ClientPhoneSession = {
    sessionId,
    client,
    phoneNumber,
    status: 'pending',
  };
  clientPhoneSessions.set(sessionId, session);

  await client.connect();

  // Run start in background with promise resolvers
  client.start({
    phoneNumber: () => Promise.resolve(phoneNumber),
    phoneCode: () => {
      session.status = 'awaiting_code';
      return new Promise<string>((resolve) => {
        session.resolveCode = resolve;
      });
    },
    password: () => {
      session.status = 'awaiting_password';
      return new Promise<string>((resolve) => {
        session.resolvePassword = resolve;
      });
    },
    onError: (err) => {
      session.status = 'error';
      session.error = err?.message || String(err);
    }
  }).then((user: any) => {
    if (user) {
      const sessionString = (client.session as any).save() as string;
      session.status = 'success';
      session.user = {
        id: user.id.toString(),
        firstName: user.firstName || 'Telegram User',
        lastName: user.lastName || '',
        username: user.username || undefined,
        phone: user.phone || undefined,
      };
      session.sessionString = sessionString;
    }
  }).catch((err) => {
    session.status = 'error';
    session.error = err?.message || String(err);
  });

  // Wait for the flow to reach awaiting_code state
  const startWait = Date.now();
  while ((session.status as any) === 'pending' && !session.resolveCode) {
    if (Date.now() - startWait > 12000) {
      throw new Error('Telegram MTProto: Gửi mã xác nhận quá giờ (WSS timeout).');
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if ((session.status as any) === 'error') {
    throw new Error(session.error || 'Gửi mã xác nhận thất bại');
  }

  return {
    success: true,
    sessionId,
    isCodeViaApp: true,
    message: 'Mã xác nhận đã được gửi thành công đến tài khoản Telegram của bạn.',
  };
}

export async function verifyClientPhoneCode(sessionId: string, code: string, password?: string): Promise<any> {
  const session = clientPhoneSessions.get(sessionId);
  if (!session) {
    throw new Error('Không tìm thấy phiên đăng nhập số điện thoại.');
  }

  if (session.status === 'awaiting_code' && session.resolveCode) {
    session.resolveCode(code);

    // Wait for state transition
    const startWait = Date.now();
    while (session.status === 'awaiting_code') {
      if (Date.now() - startWait > 8000) {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  if (session.status === 'awaiting_password') {
    if (password && session.resolvePassword) {
      session.resolvePassword(password);

      const startWait = Date.now();
      while (session.status === 'awaiting_password') {
        if (Date.now() - startWait > 8000) {
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
    } else {
      return {
        success: false,
        needs2fa: true,
        message: 'Tài khoản yêu cầu mật khẩu bảo mật 2 lớp (2FA).',
      };
    }
  }

  if (session.status === 'success' && session.user) {
    return {
      success: true,
      user: session.user,
      sessionString: session.sessionString,
    };
  }

  if (session.status === 'error') {
    throw new Error(session.error || 'Xác nhận mã thất bại');
  }

  throw new Error('Mã xác nhận không khớp hoặc phiên đã hết hạn.');
}

// ==========================================
// DIRECT CLIENT-SIDE FILE OPERATIONS
// ==========================================
function determineCategory(name: string, mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'tiff'].includes(ext) || mimeType.startsWith('image/')) {
    return 'image';
  }
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'].includes(ext) || mimeType.startsWith('video/')) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'].includes(ext) || mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed')) {
    return 'archive';
  }
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'sh', 'php', 'go', 'rs'].includes(ext)) {
    return 'code';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'odp'].includes(ext) || mimeType.includes('document') || mimeType.includes('pdf') || mimeType.startsWith('text/')) {
    return 'document';
  }
  return 'other';
}

export async function fetchTelegramDialogsDirect(sessionString: string) {
  const client = await getBrowserTelegramClient(sessionString);
  const dialogs = await client.getDialogs({ limit: 40 });
  const formatted = dialogs.map((d: any) => {
    const entity = d.entity || {};
    const isChannel = d.isChannel || !!entity.broadcast || false;
    const isGroup = d.isGroup || (!isChannel && !d.isUser) || false;
    const isUser = d.isUser || false;

    // Check upload permissions
    let canUpload = true;
    if (d.id?.toString() === 'me' || isUser) {
      canUpload = true;
    } else if (isChannel) {
      const isCreator = !!entity.creator;
      const hasPostRight = entity.adminRights?.postMessages !== false && (!!entity.adminRights || isCreator);
      canUpload = isCreator || hasPostRight;
    } else if (isGroup) {
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
  }
  return formatted;
}

export async function fetchTelegramFilesAndLinksDirect(
  sessionString: string,
  chatId: string = 'me',
  limit: number = 1000
): Promise<{ files: any[]; links: any[] }> {
  const client = await getBrowserTelegramClient(sessionString);

  let target: any = 'me';
  if (chatId !== 'me' && chatId !== 'dest-saved') {
    try {
      target = await client.getInputEntity(chatId);
    } catch {
      target = chatId;
    }
  }

  let resolvedTitle = (chatId === 'me' || chatId === 'dest-saved') ? 'Saved Messages (Tin nhắn đã lưu)' : 'Telegram Channel';
  try {
    if (target !== 'me') {
      const entity = await client.getEntity(target);
      if ((entity as any).title) {
        resolvedTitle = (entity as any).title;
      } else if ((entity as any).username) {
        resolvedTitle = `@${(entity as any).username}`;
      }
    }
  } catch {}

  const files: any[] = [];
  const links: any[] = [];

  const messages = await client.getMessages(target, { limit });

  for (const msg of messages) {
    if (!msg) continue;
    if (msg.message && msg.message.startsWith('[TeleCloud-Folder-Sync-v1]')) {
      continue;
    }

    // 1. Plain text links
    if (msg.message && msg.message.trim().length > 0) {
      const urlRegex = /https?:\/\/[^\s"'<>\(\)]+/gi;
      const matches = msg.message.match(urlRegex);
      if (matches) {
        let previewInfo: any = {};
        if (msg.media && msg.media.className === 'MessageMediaWebPage' && (msg.media as any).webpage) {
          const wp = (msg.media as any).webpage;
          if (wp.className !== 'WebPageEmpty' && wp.className !== 'WebPagePending') {
            previewInfo.title = wp.title || undefined;
            previewInfo.description = wp.description || undefined;
            previewInfo.siteName = wp.siteName || undefined;
          }
        }
        for (const url of matches) {
          if (!links.some(l => l.url === url && l.telegramMessageId === msg.id)) {
            links.push({
              id: `link-${chatId}-${msg.id}-${url.slice(0, 10)}`,
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

    // 2. Extract media as files
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
      fileSize = 1024 * 500;
      fileName = msg.message && msg.message.length < 60
        ? `${msg.message.trim().replace(/[\\/:*?"<>|]/g, '_')}.jpg`
        : `photo_${msg.id}.jpg`;
      isMedia = true;
    }

    if (isMedia) {
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
      const downloadUrl = `client-direct://${chatId}/${msg.id}/${encodeURIComponent(fileName)}`;
      const previewUrl = (category === 'image' || category === 'video' || category === 'audio')
        ? downloadUrl
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

  return { files, links };
}

export async function deleteTelegramMessagesDirect(
  sessionString: string,
  chatId: string,
  messageIds: number[]
): Promise<boolean> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    let target: any = 'me';
    if (chatId !== 'me' && chatId !== 'dest-saved') {
      try {
        target = await client.getInputEntity(chatId);
      } catch {
        target = chatId;
      }
    }
    await client.deleteMessages(target, messageIds, { revoke: true });
    return true;
  } catch (err) {
    console.error('Direct deleteTelegramMessages failed:', err);
    return false;
  }
}

export async function renameTelegramMessageDirect(
  sessionString: string,
  chatId: string,
  messageId: number,
  newName: string
): Promise<boolean> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    let target: any = 'me';
    if (chatId !== 'me' && chatId !== 'dest-saved') {
      try {
        target = await client.getInputEntity(chatId);
      } catch {
        target = chatId;
      }
    }
    await client.editMessage(target, {
      message: messageId,
      text: `TeleCloud Cloud: ${newName}`,
    });
    return true;
  } catch (err) {
    console.error('Direct renameTelegramMessage failed:', err);
    return false;
  }
}

export async function forwardTelegramMessageDirect(
  sessionString: string,
  fromChatId: string,
  toChatId: string,
  messageId: number
): Promise<boolean> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    let fromTarget: any = 'me';
    if (fromChatId !== 'me' && fromChatId !== 'dest-saved') {
      try {
        fromTarget = await client.getInputEntity(fromChatId);
      } catch {
        fromTarget = fromChatId;
      }
    }
    let toTarget: any = 'me';
    if (toChatId !== 'me' && toChatId !== 'dest-saved') {
      try {
        toTarget = await client.getInputEntity(toChatId);
      } catch {
        toTarget = toChatId;
      }
    }
    await client.forwardMessages(toTarget, {
      messages: [messageId],
      fromPeer: fromTarget,
    });
    return true;
  } catch (err) {
    console.error('Direct forwardTelegramMessage failed:', err);
    return false;
  }
}

export async function syncMetadataToTelegramDirect(
  sessionString: string,
  folders: any[]
): Promise<boolean> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    const metadataPayload = {
      folders,
      updatedAt: Date.now(),
    };
    const textMessage = `[TeleCloud-Folder-Sync-v1]\n${JSON.stringify(metadataPayload)}`;
    await client.sendMessage('me', { message: textMessage });
    return true;
  } catch (err) {
    console.error('Direct syncMetadataToTelegram failed:', err);
    return false;
  }
}

export async function fetchMetadataFromTelegramDirect(
  sessionString: string
): Promise<{ folders: any[] }> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    let foundMetadata: any = null;
    for await (const msg of client.iterMessages('me', { limit: 50 })) {
      if (msg.message && msg.message.startsWith('[TeleCloud-Folder-Sync-v1]')) {
        try {
          const jsonPart = msg.message.substring('[TeleCloud-Folder-Sync-v1]\n'.length);
          foundMetadata = JSON.parse(jsonPart);
          break;
        } catch (e) {
          console.error('Failed to parse folder sync JSON in client:', e);
        }
      }
    }
    return { folders: foundMetadata ? (foundMetadata.folders || []) : [] };
  } catch (err) {
    console.error('Direct fetchMetadataFromTelegram failed:', err);
    return { folders: [] };
  }
}

export async function verifyTelegramMessagesDirect(
  sessionString: string,
  chatId: string,
  messageIds: number[]
): Promise<{ deletedIds: number[]; existingIds: number[] }> {
  try {
    const client = await getBrowserTelegramClient(sessionString);
    let target: any = 'me';
    if (chatId !== 'me' && chatId !== 'dest-saved') {
      try {
        target = await client.getInputEntity(chatId);
      } catch {
        target = chatId;
      }
    }
    const msgs = await client.getMessages(target, { ids: messageIds });
    const deletedIds: number[] = [];
    const existingIds: number[] = [];

    for (const id of messageIds) {
      const found: any = msgs?.find((m: any) => m && m.id === id);
      if (!found || !found.media || found.className === 'MessageEmpty' || found.empty) {
        deletedIds.push(id);
      } else {
        existingIds.push(id);
      }
    }
    return { deletedIds, existingIds };
  } catch (err) {
    console.error('Direct verifyTelegramMessages failed:', err);
    return { deletedIds: [], existingIds: messageIds };
  }
}

export interface DirectUploadOptions {
  file: File;
  sessionString: string;
  chatId: string;
  caption?: string;
  onProgress?: (progress: number, speedMB: string, eta: string) => void;
  signal?: AbortSignal;
}

export async function uploadFileDirectlyToTelegram(options: DirectUploadOptions): Promise<any> {
  const { file, sessionString, chatId, caption, onProgress, signal } = options;

  const client = await getBrowserTelegramClient(sessionString);

  // Convert browser HTML5 File/Blob to a Node-compatible Buffer so GramJS CustomFile can slice it
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const customFile = new CustomFile(file.name, file.size, '', buffer);

  let target: any = 'me';
  if (chatId !== 'me' && chatId !== 'dest-saved') {
    try {
      target = await client.getInputEntity(chatId);
    } catch {
      target = chatId;
    }
  }

  const startTime = Date.now();

  const progressCallback = (fraction: number) => {
    if (signal?.aborted) {
      throw new Error('USER_CANCELED');
    }
    const pct = Math.min(100, Math.max(0, Math.round(fraction * 100)));
    const currentBytes = fraction * file.size;
    const elapsedSec = Math.max(0.2, (Date.now() - startTime) / 1000);
    const speedBytes = currentBytes / elapsedSec;
    const speedMB = (speedBytes / (1024 * 1024)).toFixed(1);
    const remainingBytes = Math.max(0, file.size - currentBytes);
    const remainingSec = Math.max(1, Math.round(remainingBytes / Math.max(1, speedBytes)));
    const eta = remainingSec > 60 ? `${Math.ceil(remainingSec / 60)}m` : `${remainingSec}s`;

    if (onProgress) {
      onProgress(pct, `${speedMB} MB/s`, eta);
    }
  };

  const result = await client.sendFile(target, {
    file: customFile,
    caption: caption || `TeleDrive Cloud: ${file.name}`,
    forceDocument: true,
    workers: 4,
    progressCallback,
  });

  return result;
}

function getMimeTypeByFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'mov': 'video/quicktime',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export async function downloadFileDirectlyFromTelegram(
  sessionString: string,
  chatId: string,
  messageId: number,
  fileName: string,
  onProgress?: (progress: number) => void,
  thumbnail?: boolean
): Promise<Blob> {
  const client = await getBrowserTelegramClient(sessionString);

  let target: any = 'me';
  if (chatId !== 'me' && chatId !== 'dest-saved') {
    try {
      target = await client.getInputEntity(chatId);
    } catch {
      target = chatId;
    }
  }

  const messages = await client.getMessages(target, { ids: [messageId] });
  if (!messages || messages.length === 0) {
    throw new Error('Không thể tìm thấy tệp được yêu cầu trên Telegram');
  }
  const message = messages[0];

  const downloadOptions: any = {
    progressCallback: (downloaded: any, total: any) => {
      const totalNum = Number(total) || 0;
      const downloadedNum = Number(downloaded) || 0;
      const pct = totalNum > 0 ? Math.min(100, Math.round((downloadedNum / totalNum) * 100)) : 0;
      if (onProgress) onProgress(pct);
    }
  };

  if (thumbnail && message.media) {
    if (message.media.className === 'MessageMediaDocument' && (message.media as any).document) {
      const doc = (message.media as any).document;
      if (doc.thumbs && doc.thumbs.length > 0) {
        // Use the smallest thumbnail for ultra-fast listing previews
        downloadOptions.thumb = doc.thumbs[0];
      }
    } else if (message.media.className === 'MessageMediaPhoto' && (message.media as any).photo) {
      const photo = (message.media as any).photo;
      if (photo.sizes && photo.sizes.length > 0) {
        const sizes = photo.sizes;
        const thumbObj = sizes.find((s: any) => s.type === 's') || sizes.find((s: any) => s.type === 'm') || sizes[0];
        downloadOptions.thumb = thumbObj;
      }
    }
  }

  let buffer;
  try {
    buffer = await client.downloadMedia(message, downloadOptions);
  } catch (err) {
    if (thumbnail) {
      console.warn('Direct thumbnail download failed, falling back to full media:', err);
      // Fallback: download full media directly
      buffer = await client.downloadMedia(message, {
        progressCallback: downloadOptions.progressCallback
      });
    } else {
      throw err;
    }
  }

  if (!buffer) {
    throw new Error('Không thể tải tệp từ Telegram (Trống)');
  }

  const mimeType = getMimeTypeByFileName(fileName);
  return new Blob([buffer], { type: mimeType });
}
