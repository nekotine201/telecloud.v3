import QRCode from 'qrcode/lib/browser';
import { DriveFile, DriveFolder, StorageTarget, TelegramUser, TelegramLink } from '../types';
import { determineCategory } from './storage';
import { encryptFileBuffer } from './crypto';
import {
  initClientTelegramQr,
  pollClientTelegramQr,
  submitClient2faPassword,
  cancelClientTelegramQr,
  sendClientPhoneCode,
  verifyClientPhoneCode,
  fetchTelegramDialogsDirect,
  fetchTelegramFilesAndLinksDirect,
  deleteTelegramMessagesDirect,
  renameTelegramMessageDirect,
  forwardTelegramMessageDirect,
  syncMetadataToTelegramDirect,
  fetchMetadataFromTelegramDirect,
  verifyTelegramMessagesDirect
} from './clientTelegram';

// Backend API URL Configuration for standalone and distributed deployments (e.g., Vercel frontend + Render backend)
export function getBackendApiUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('teledrive_backend_api_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

export function setBackendApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim()) {
      localStorage.removeItem('teledrive_backend_api_url');
    } else {
      localStorage.setItem('teledrive_backend_api_url', url.trim().replace(/\/+$/, ''));
    }
  }
}

export function resolveApiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const base = getBackendApiUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

// Centralized safe fetch helper that prevents HTML parsing crashes (e.g. Vercel 404 "The page could not be found")
export async function safeFetchJson<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const fullUrl = resolveApiUrl(endpoint);
  let res: Response;
  try {
    res = await fetch(fullUrl, options);
  } catch (netErr: any) {
    const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (isVercel && !getBackendApiUrl()) {
      throw new Error(
        'Không thể kết nối đến máy chủ Backend. Vui lòng thử lại bằng cách sử dụng kết nối trực tiếp.'
      );
    }
    throw new Error(netErr?.message || 'Lỗi mạng khi kết nối đến máy chủ Telegram MTProto.');
  }

  const rawText = await res.text().catch(() => '');
  let data: any = null;

  if (rawText && rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Non-JSON response, typically Vercel 404 HTML "The page could not be found"
      const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
      const isHtml =
        rawText.includes('<html') ||
        rawText.includes('<!DOCTYPE') ||
        rawText.includes('The page c') ||
        rawText.startsWith('The page') ||
        res.status === 404;

      if (isVercel || isHtml) {
        throw new Error(
          'Không tìm thấy dịch vụ MTProto Backend (' +
            endpoint +
            '). Sử dụng kết nối trực tiếp client-side thay thế.'
        );
      }
      throw new Error(`Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}). Vui lòng thử lại.`);
    }
  }

  if (data?.isVercelServerless || data?.isVercel) {
    throw new Error(
      data.error ||
        'Vercel Serverless không hỗ trợ tiến trình socket MTProto chạy liên tục. Sử dụng kết nối trực tiếp client-side thay thế.'
    );
  }

  if (!res.ok) {
    const errMsg = data?.error || data?.message || `Lỗi máy chủ (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

// Real Telegram MTProto QR Initialization
export async function initRealTelegramQr(apiId?: number, apiHash?: string): Promise<{
  sessionId: string;
  qrUrl: string;
  qrToken: string;
  qrDataUrl: string;
  expires: number;
  expiresInSeconds: number;
}> {
  if (!getBackendApiUrl()) {
    return initClientTelegramQr(apiId, apiHash);
  }

  const data = await safeFetchJson<any>('/api/telegram/qr/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiId, apiHash }),
  });

  if (!data || !data.success) {
    const rawError = data?.error || '';
    if (rawError === 'TIMEOUT' || rawError.includes('TIMEOUT')) {
      throw new Error('Kết nối tới máy chủ Telegram bị trễ. Đang tự động kết nối lại...');
    }
    throw new Error(rawError || 'Khởi tạo MTProto QR thất bại');
  }

  if (!data.qrUrl) {
    throw new Error('Máy chủ Backend không phản hồi URL mã QR Telegram.');
  }

  const svgString = await QRCode.toString(data.qrUrl, {
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
    sessionId: data.sessionId,
    qrUrl: data.qrUrl,
    qrToken: data.qrToken,
    qrDataUrl,
    expires: data.expires,
    expiresInSeconds: data.expiresInSeconds,
  };
}

// Poll Real Telegram MTProto QR Status
export async function pollRealTelegramQr(sessionId: string): Promise<{
  status: 'pending' | 'success' | '2fa_required' | 'expired' | 'error';
  qrUrl?: string;
  qrToken?: string;
  qrDataUrl?: string;
  expires?: number;
  expiresInSeconds?: number;
  user?: {
    id: string;
    firstName: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
  sessionString?: string;
  error?: string;
}> {
  if (!getBackendApiUrl() || sessionId.startsWith('client-qr-')) {
    return pollClientTelegramQr(sessionId);
  }

  const data = await safeFetchJson<any>(`/api/telegram/qr/status?sessionId=${encodeURIComponent(sessionId)}`);
  if (!data || !data.success) {
    throw new Error(data?.error || 'Kiểm tra trạng thái quét thất bại');
  }

  let qrDataUrl: string | undefined;
  if (data.qrUrl) {
    const svgString = await QRCode.toString(data.qrUrl, {
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
    status: data.status,
    qrUrl: data.qrUrl,
    qrToken: data.qrToken,
    qrDataUrl,
    expires: data.expires,
    expiresInSeconds: data.expiresInSeconds,
    user: data.user,
    sessionString: data.sessionString,
    error: data.error,
  };
}

// Submit 2FA Cloud Password
export async function submit2faPassword(sessionId: string, password: string) {
  if (!getBackendApiUrl() || sessionId.startsWith('client-qr-')) {
    return submitClient2faPassword(sessionId, password);
  }

  const data = await safeFetchJson<any>('/api/telegram/qr/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, password }),
  });
  if (!data || !data.success) {
    throw new Error(data?.error || 'Mật khẩu 2FA không chính xác');
  }
  return data;
}

// Cancel QR session
export async function cancelRealTelegramQr(sessionId: string) {
  if (!getBackendApiUrl() || sessionId.startsWith('client-qr-')) {
    return cancelClientTelegramQr(sessionId);
  }

  try {
    await safeFetchJson('/api/telegram/qr/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  } catch {}
}

// Phone number login flow
export async function sendPhoneCode(phoneNumber: string, apiId?: number, apiHash?: string): Promise<{
  sessionId: string;
  isCodeViaApp: boolean;
  message: string;
}> {
  if (!getBackendApiUrl()) {
    return sendClientPhoneCode(phoneNumber, apiId, apiHash);
  }

  const data = await safeFetchJson<any>('/api/telegram/phone/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, apiId, apiHash }),
  });
  if (!data || !data.success) {
    throw new Error(data?.error || 'Gửi mã xác nhận thất bại');
  }
  return data;
}

export async function verifyPhoneCode(sessionId: string, code: string, password?: string): Promise<{
  success: boolean;
  needs2fa?: boolean;
  message?: string;
  user?: {
    id: string;
    firstName: string;
    lastName?: string;
    username?: string;
    phone?: string;
  };
  sessionString?: string;
  error?: string;
}> {
  if (!getBackendApiUrl() || sessionId.startsWith('client-phone-')) {
    return verifyClientPhoneCode(sessionId, code, password);
  }

  const data = await safeFetchJson<any>('/api/telegram/phone/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, code, password }),
  });
  if (!data || (!data.success && !data.needs2fa)) {
    throw new Error(data?.error || 'Xác nhận mã thất bại');
  }
  return data;
}

// Fetch real dialogs/channels from Telegram account
export async function fetchTelegramDialogs(sessionString: string) {
  if (!getBackendApiUrl()) {
    return fetchTelegramDialogsDirect(sessionString);
  }

  const data = await safeFetchJson<any>(`/api/telegram/dialogs?session=${encodeURIComponent(sessionString)}`);
  if (!data || !data.success) {
    throw new Error(data?.error || 'Không thể tải danh sách kênh');
  }
  return data.dialogs as Array<{
    id: string;
    title: string;
    isChannel: boolean;
    isGroup: boolean;
    isUser: boolean;
    unreadCount: number;
    participantsCount?: number;
    canUpload?: boolean;
  }>;
}

// Fetch real files and links from Telegram MTProto
export async function fetchTelegramFilesAndLinks(
  sessionString: string,
  chatId: string = 'me',
  limit: number = 1000
): Promise<{ files: DriveFile[]; links: TelegramLink[] }> {
  if (!getBackendApiUrl()) {
    return fetchTelegramFilesAndLinksDirect(sessionString, chatId, limit);
  }

  const data = await safeFetchJson<any>(
    `/api/telegram/files?session=${encodeURIComponent(sessionString)}&chatId=${encodeURIComponent(chatId)}&limit=${limit}`
  );

  if (!data || !data.success) {
    throw new Error(data?.error || 'Không thể đồng bộ tệp từ Telegram Cloud');
  }
  return {
    files: (data.files || []) as DriveFile[],
    links: (data.links || []) as TelegramLink[],
  };
}

// Fetch real files/media from Telegram MTProto
export async function fetchTelegramFiles(
  sessionString: string,
  chatId: string = 'me',
  limit: number = 1000
): Promise<DriveFile[]> {
  const res = await fetchTelegramFilesAndLinks(sessionString, chatId, limit);
  return res.files;
}

// Upload file to Telegram (with MTProto chunking if session exists, otherwise smooth local simulation)
export async function uploadFileToTelegram(
  file: File,
  targetName: string,
  targetType: StorageTarget,
  folderId: string | null,
  isEncrypted: boolean,
  sessionString?: string,
  passphrase?: string,
  onProgress?: (progress: number, speed: string, eta: string, stageMessage?: string) => void,
  abortSignal?: AbortSignal,
  targetChatId?: string
): Promise<DriveFile> {
  const totalSize = file.size;
  let fileToUpload: Blob = file;

  if (isEncrypted) {
    // Encrypt client-side first
    if (onProgress) onProgress(5, 'Đang mã hoá...', '...', 'Đang mã hoá AES-256 client-side');
    const buffer = await file.arrayBuffer();
    const { encryptedBlob } = await encryptFileBuffer(buffer, passphrase);
    fileToUpload = encryptedBlob;
  }

  // If real Telegram sessionString is provided, try Direct Browser-to-Telegram MTProto Upload first
  if (sessionString) {
    try {
      if (onProgress) {
        onProgress(2, 'Đang kết nối...', '...', 'Đang mở cổng kết nối trực tiếp đến Telegram DC (WebSocket)...');
      }
      const { uploadFileDirectlyToTelegram } = await import('./clientTelegram');

      // We wrap the blob/file in a File object if it is an encrypted Blob
      const fileObjectToUpload = (fileToUpload instanceof File) 
        ? fileToUpload 
        : new File([fileToUpload], file.name, { type: file.type || 'application/octet-stream' });

      const result = await uploadFileDirectlyToTelegram({
        file: fileObjectToUpload,
        sessionString,
        chatId: targetType === 'saved' ? 'me' : (targetChatId || targetName),
        caption: `TeleCloud Cloud: ${file.name}`,
        onProgress: (pct, speed, eta) => {
          if (onProgress) {
            onProgress(pct, speed, eta, `Tốc độ tối đa trực tiếp: ${pct}%`);
          }
        },
        signal: abortSignal,
      });

      if (!result) {
        throw new Error('Không nhận được phản hồi từ Telegram MTProto');
      }

      const cleanFileName = file.name.replace(/[\\/:*?"<>|]/g, '_');
      const doc = result.media?.document || {};
      const actualSize = doc.size || fileToUpload.size;
      const downloadUrl = `client-direct://${targetType === 'saved' ? 'me' : (targetChatId || targetName)}/${result.id}/${encodeURIComponent(cleanFileName)}`;

      const driveFile: DriveFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        size: actualSize,
        category: determineCategory(file.name, file.type || 'application/octet-stream'),
        mimeType: file.type || 'application/octet-stream',
        folderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        telegramMessageId: result.id,
        telegramChatId: targetType === 'saved' ? 'me' : (targetChatId || targetName),
        storageTarget: targetType,
        storageName: targetName,
        isEncrypted,
        downloadUrl,
      };

      return driveFile;
    } catch (directErr: any) {
      if (directErr.message?.includes('USER_CANCELED') || abortSignal?.aborted) {
        throw new Error('Quá trình tải tệp đã bị dừng');
      }
      console.warn('[Upload] Direct browser MTProto upload failed, falling back to server-side chunked upload:', directErr);
      if (!getBackendApiUrl()) {
        throw new Error(`Tải tệp trực tiếp qua WebSocket thất bại: ${directErr.message || directErr}`);
      }
    }

    // Server-side chunked upload fallback
    const uploadId = `up-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk - optimal for web proxies & Cloud Run
    const totalChunks = Math.max(1, Math.ceil(fileToUpload.size / CHUNK_SIZE));
    const startTime = Date.now();
    let currentXhr: XMLHttpRequest | null = null;
    const effectiveChatId = targetType === 'saved' ? 'me' : (targetChatId || targetName);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        if (currentXhr) {
          currentXhr.abort();
        }
        fetch('/api/telegram/upload-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId }),
        }).catch(() => {});
      });
    }

    try {
      let finalData: any = null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (abortSignal?.aborted) {
          throw new Error('Tải lên đã bị hủy bởi người dùng');
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(fileToUpload.size, start + CHUNK_SIZE);
        const chunkBlob = fileToUpload.slice(start, end);

        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('fileName', file.name);
        formData.append('fileSize', String(fileToUpload.size));
        formData.append('sessionString', sessionString);
        formData.append('chatId', effectiveChatId);
        formData.append('caption', `TeleCloud Cloud: ${file.name}`);
        formData.append('chunk', chunkBlob, `${file.name}.part${chunkIndex}`);

        // Upload chunk via XMLHttpRequest to capture real progress
        const chunkResponse = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          currentXhr = xhr;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
              const currentLoaded = start + e.loaded;
              // Stage 1: Browser to Server (0% -> 50%)
              const stage1Percent = Math.min(50, Math.max(1, Math.round((currentLoaded / totalSize) * 50)));
              const elapsedSec = (Date.now() - startTime) / 1000;
              const speedBytes = currentLoaded / Math.max(0.1, elapsedSec);
              const currentSpeedMB = (speedBytes / (1024 * 1024)).toFixed(1);
              const speedStr = `${currentSpeedMB} MB/s`;

              const remainingBytes = Math.max(0, totalSize - currentLoaded);
              const remainingSec = Math.max(1, Math.round(remainingBytes / Math.max(1, speedBytes)));
              const etaStr = remainingSec > 60 ? `${Math.ceil(remainingSec / 60)}m` : `${remainingSec}s`;

              const chunkPct = Math.round((currentLoaded / totalSize) * 100);
              onProgress(stage1Percent, speedStr, etaStr, `Đang tải lên bộ đệm... (${chunkPct}%)`);
            }
          };

          xhr.onload = () => {
            currentXhr = null;
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const json = JSON.parse(xhr.responseText);
                if (json.success) {
                  resolve(json);
                } else {
                  reject(new Error(json.error || `Lỗi máy chủ (${xhr.status})`));
                }
              } catch (parseErr) {
                reject(new Error('Phản hồi không hợp lệ từ máy chủ tải lên'));
              }
            } else {
              try {
                const json = JSON.parse(xhr.responseText);
                reject(new Error(json.error || `HTTP lỗi ${xhr.status}`));
              } catch {
                reject(new Error(`Tải lên thất bại với mã lỗi HTTP ${xhr.status}`));
              }
            }
          };

          xhr.onerror = () => {
            currentXhr = null;
            reject(new Error('Mất kết nối mạng khi tải tệp lên máy chủ'));
          };

          xhr.onabort = () => {
            currentXhr = null;
            reject(new Error('Quá trình tải tệp đã bị dừng'));
          };

          xhr.open('POST', resolveApiUrl('/api/telegram/upload-chunk'));
          xhr.send(formData);
        });

        // When all chunks have been received by the server, track Telegram MTProto upload in background
        if (chunkIndex === totalChunks - 1) {
          if (onProgress) {
            onProgress(50, 'Đang chuẩn bị...', '...', 'Đang lưu vào Telegram Cloud (MTProto)...');
          }

          let isDone = false;
          let unknownCount = 0;
          while (!isDone) {
            if (abortSignal?.aborted) {
              safeFetchJson('/api/telegram/upload-cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId }),
              }).catch(() => {});
              throw new Error('Quá trình tải tệp đã bị dừng');
            }

            await new Promise(r => setTimeout(r, 750));

            try {
              const statusData = await safeFetchJson<any>(`/api/telegram/upload-status?uploadId=${encodeURIComponent(uploadId)}`);
              if (statusData.status === 'completed') {
                finalData = statusData.result
                  ? { success: true, ...statusData.result }
                  : { success: true };
                isDone = true;
                if (onProgress) {
                  onProgress(100, 'Xong', '0s', '✓ Đã lưu vào Telegram');
                }
                break;
              } else if (statusData.status === 'error') {
                throw new Error(statusData.error || 'Lỗi khi gửi tệp lên Telegram');
              } else if (statusData.status === 'uploading_to_telegram') {
                unknownCount = 0;
                const tgPct = statusData.progress || 1;
                // Scale 0..100% MTProto progress to 50%..99%
                const overallPct = Math.min(99, Math.max(50, 50 + Math.round(tgPct * 0.49)));
                if (onProgress) {
                  onProgress(
                    overallPct,
                    statusData.speedMB || 'Đang truyền...',
                    statusData.eta || 'Vài giây',
                    `Đang lưu vào Telegram Cloud: ${tgPct}%`
                  );
                }
              } else if (statusData.status === 'unknown') {
                unknownCount++;
                if (unknownCount > 15) {
                  throw new Error('Không tìm thấy phiên tải lên trên máy chủ');
                }
              }
            } catch (pollErr: any) {
              if (pollErr.message?.includes('hủy') || pollErr.message?.includes('bị dừng')) throw pollErr;
              if (pollErr.message?.includes('Lỗi khi gửi tệp lên Telegram') || pollErr.message?.includes('Không tìm thấy')) throw pollErr;
            }
          }
        }
      }

      if (!finalData || (!finalData.success && !finalData.messageId)) {
        throw new Error(finalData?.error || 'Không nhận được xác nhận từ Telegram');
      }

      if (onProgress) {
        onProgress(100, 'Đã hoàn tất', '0s');
      }

      let previewUrl: string | undefined = finalData.downloadUrl ? `${finalData.downloadUrl}&preview=1` : undefined;
      if (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
        previewUrl = URL.createObjectURL(file);
      }

      return {
        id: `tg-${effectiveChatId}-${finalData.messageId}`,
        name: file.name,
        size: file.size,
        category: determineCategory(file.name, file.type),
        mimeType: file.type || 'application/octet-stream',
        folderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        telegramMessageId: Number(finalData.messageId),
        telegramChatId: effectiveChatId,
        storageTarget: targetType,
        storageName: targetType === 'saved' ? 'Saved Messages (Tin nhắn đã lưu)' : targetName,
        isEncrypted,
        encryptionAlgorithm: isEncrypted ? 'AES-256-GCM' : undefined,
        isStarred: false,
        downloadUrl: finalData.downloadUrl,
        previewUrl,
        localBlob: file,
      };
    } catch (err: any) {
      if (abortSignal?.aborted || err?.message?.includes('bị dừng') || err?.message?.includes('hủy')) {
        throw new Error('Quá trình tải tệp đã bị dừng');
      }
      console.error('[Upload] Real MTProto chunked upload error:', err);
      throw err;
    }
  }

  // User is not logged in with Telegram
  throw new Error('Vui lòng đăng nhập tài khoản Telegram để tải tệp lên Cloud.');
}

// Download file trigger
export function triggerFileDownload(file: DriveFile) {
  if (file.downloadUrl) {
    if (file.downloadUrl.startsWith('client-direct://')) {
      // Direct connection helper
      console.warn('[DirectDownload] Please use Direct WebSocket Download built in UI.');
      return;
    }
    const fullDownloadUrl = resolveApiUrl(file.downloadUrl);
    const a = document.createElement('a');
    a.href = fullDownloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  if (file.localBlob) {
    const url = URL.createObjectURL(file.localBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }

  const sampleContent = `TeleCloud Telegram Cloud File: ${file.name}\nMessage ID: ${file.telegramMessageId}\nSize: ${file.size} bytes\nDirect MTProto Transport.`;
  const blob = new Blob([sampleContent], { type: file.mimeType || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Delete Message from Telegram
export async function deleteTelegramMessage(
  sessionString: string,
  chatId: string,
  messageId: number
): Promise<boolean> {
  if (!getBackendApiUrl()) {
    return deleteTelegramMessagesDirect(sessionString, chatId, [messageId]);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString, chatId, messageId }),
    });
    return !!data?.success;
  } catch (err) {
    console.error('deleteTelegramMessage failed:', err);
    return false;
  }
}

// Batch Delete Messages from Telegram
export async function deleteTelegramMessages(
  sessionString: string,
  chatId: string,
  messageIds: number[]
): Promise<boolean> {
  if (!messageIds || messageIds.length === 0) return true;
  if (!getBackendApiUrl()) {
    return deleteTelegramMessagesDirect(sessionString, chatId, messageIds);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString, chatId, messageIds }),
    });
    return !!data?.success;
  } catch (err) {
    console.error('deleteTelegramMessages failed:', err);
    return false;
  }
}

// Verify whether messages still exist or were deleted on Telegram
export async function verifyTelegramMessages(
  sessionString: string,
  chatId: string,
  messageIds: number[]
): Promise<{ deletedIds: number[]; existingIds: number[] }> {
  if (!messageIds || messageIds.length === 0) return { deletedIds: [], existingIds: [] };
  if (!getBackendApiUrl()) {
    return verifyTelegramMessagesDirect(sessionString, chatId, messageIds);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/verify-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionString, chatId, messageIds }),
    });
    if (data?.success) {
      return {
        deletedIds: data.deletedIds || [],
        existingIds: data.existingIds || [],
      };
    }
  } catch (err) {
    console.error('verifyTelegramMessages failed:', err);
  }
  return { deletedIds: [], existingIds: messageIds };
}

// Rename Telegram message caption
export async function renameTelegramMessage(
  sessionString: string,
  chatId: string,
  messageId: number,
  newName: string
): Promise<boolean> {
  if (!getBackendApiUrl()) {
    return renameTelegramMessageDirect(sessionString, chatId, messageId, newName);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString, chatId, messageId, newName }),
    });
    return !!data?.success;
  } catch (err) {
    console.error('renameTelegramMessage failed:', err);
    return false;
  }
}

// Forward Telegram message
export async function forwardTelegramMessage(
  sessionString: string,
  fromChatId: string,
  toChatId: string,
  messageId: number
): Promise<boolean> {
  if (!getBackendApiUrl()) {
    return forwardTelegramMessageDirect(sessionString, fromChatId, toChatId, messageId);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString, fromChatId, toChatId, messageId }),
    });
    return !!data?.success;
  } catch (err) {
    console.error('forwardTelegramMessage failed:', err);
    return false;
  }
}

// Sync folder metadata to Telegram
export async function syncMetadataToTelegram(
  sessionString: string,
  folders: DriveFolder[]
): Promise<boolean> {
  if (!getBackendApiUrl()) {
    return syncMetadataToTelegramDirect(sessionString, folders);
  }

  try {
    const data = await safeFetchJson<any>('/api/telegram/sync-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: sessionString, folders }),
    });
    return !!data?.success;
  } catch (err) {
    console.error('syncMetadataToTelegram failed:', err);
    return false;
  }
}

// Fetch folder metadata from Telegram
export async function fetchMetadataFromTelegram(
  sessionString: string
): Promise<{ folders: DriveFolder[] }> {
  if (!getBackendApiUrl()) {
    return fetchMetadataFromTelegramDirect(sessionString);
  }

  try {
    const data = await safeFetchJson<any>(
      `/api/telegram/sync-metadata?session=${encodeURIComponent(sessionString)}`
    );
    if (data && data.success) {
      return { folders: data.folders || [] };
    }
    return { folders: [] };
  } catch (err) {
    console.error('fetchMetadataFromTelegram failed:', err);
    return { folders: [] };
  }
}
