import { DriveFile, DriveFolder, StorageDestinationInfo, TelegramUser } from '../types';

const FILES_KEY = 'teledrive_files_v1';
const FOLDERS_KEY = 'teledrive_folders_v1';
const DESTINATIONS_KEY = 'teledrive_destinations_v1';
const USER_KEY = 'teledrive_user_v1';
const THEME_KEY = 'teledrive_theme_v1';
const LANG_KEY = 'teledrive_lang_v1';

export const DEFAULT_DESTINATIONS: StorageDestinationInfo[] = [
  {
    id: 'dest-saved',
    name: 'Saved Messages (Tin nhắn đã lưu)',
    type: 'saved',
    chatId: 'me',
    description: 'Lưu trữ riêng tư chỉ một mình bạn thấy',
    isDefault: true,
  },
  {
    id: 'dest-channel-vault',
    name: 'Kênh Riêng Tư (Cloud Vault)',
    type: 'channel',
    chatId: 'me',
    description: 'Kênh Telegram lưu trữ riêng biệt',
  },
  {
    id: 'dest-group-work',
    name: 'Nhóm Sao Lưu & Chia Sẻ',
    type: 'group',
    chatId: 'me',
    description: 'Nhóm chia sẻ và sao lưu tài liệu',
  },
];

export const DEFAULT_USER: TelegramUser | null = null;

const INITIAL_FOLDERS: DriveFolder[] = [];

const INITIAL_FILES: DriveFile[] = [];

export function determineCategory(filename: string, mimeType: string): DriveFile['category'] {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'avif'].includes(ext) || mimeType.startsWith('image/')) {
    return 'image';
  }
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v'].includes(ext) || mimeType.startsWith('video/')) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext) || mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'md', 'epub'].includes(ext) || mimeType.includes('pdf') || mimeType.includes('document')) {
    return 'document';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) {
    return 'archive';
  }
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'go', 'rs', 'c', 'cpp', 'java', 'sql', 'sh', 'yaml', 'yml'].includes(ext)) {
    return 'code';
  }
  return 'other';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val >= 10 || i === 0 ? val.toFixed(1) : val.toFixed(2)} ${sizes[i]}`;
}

export function formatDate(timestamp: number, lang: 'vi' | 'en' = 'vi'): string {
  const d = new Date(timestamp);
  if (lang === 'vi') {
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Storage helpers
function sanitizeFileForStorage(f: any): DriveFile {
  return {
    id: String(f.id || `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(f.name || 'Untitled'),
    size: typeof f.size === 'number' && !isNaN(f.size) ? f.size : 0,
    category: f.category || 'other',
    mimeType: String(f.mimeType || 'application/octet-stream'),
    folderId: f.folderId ? String(f.folderId) : null,
    createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
    updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : Date.now(),
    telegramMessageId: typeof f.telegramMessageId === 'number' ? f.telegramMessageId : 0,
    telegramChatId: String(f.telegramChatId || 'me'),
    storageTarget: f.storageTarget || 'saved',
    storageName: String(f.storageName || 'Saved Messages'),
    isEncrypted: Boolean(f.isEncrypted),
    encryptionAlgorithm: f.encryptionAlgorithm ? String(f.encryptionAlgorithm) : undefined,
    isStarred: Boolean(f.isStarred),
    isDeleted: Boolean(f.isDeleted),
    downloadUrl: typeof f.downloadUrl === 'string' ? f.downloadUrl : undefined,
    // Do not persist temporary blob: URLs to localStorage as they expire
    previewUrl: typeof f.previewUrl === 'string' && !f.previewUrl.startsWith('blob:') ? f.previewUrl : undefined,
    description: typeof f.description === 'string' ? f.description : undefined,
  };
}

function sanitizeFolderForStorage(f: any): DriveFolder {
  return {
    id: String(f.id || `folder-${Date.now()}`),
    name: String(f.name || 'Folder'),
    parentId: f.parentId ? String(f.parentId) : null,
    color: typeof f.color === 'string' ? f.color : '#64748b',
    createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
    updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : Date.now(),
    isStarred: Boolean(f.isStarred),
    isDeleted: Boolean(f.isDeleted),
  };
}

export function loadFiles(): DriveFile[] {
  try {
    const saved = localStorage.getItem(FILES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map(sanitizeFileForStorage)
          .filter((f: DriveFile) => !f.isDeleted && !f.id.startsWith('file-screenshot-'));
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveFiles(files: DriveFile[]) {
  try {
    if (!Array.isArray(files)) return;
    const cleanFiles = files.map(sanitizeFileForStorage);
    localStorage.setItem(FILES_KEY, JSON.stringify(cleanFiles));
  } catch (e) {
    console.error('Failed to save files to localStorage', e);
  }
}

export function loadFolders(): DriveFolder[] {
  try {
    const saved = localStorage.getItem(FOLDERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map(sanitizeFolderForStorage)
          .filter((f: DriveFolder) => !f.id.startsWith('folder-bobo') && !f.id.startsWith('folder-chem-gio') && !f.id.startsWith('folder-anh-cuoi'));
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveFolders(folders: DriveFolder[]) {
  try {
    if (!Array.isArray(folders)) return;
    const cleanFolders = folders.map(sanitizeFolderForStorage);
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(cleanFolders));
  } catch (e) {
    console.error('Failed to save folders to localStorage', e);
  }
}

export function loadDestinations(): StorageDestinationInfo[] {
  try {
    const saved = localStorage.getItem(DESTINATIONS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_DESTINATIONS;
}

export function saveDestinations(destinations: StorageDestinationInfo[]) {
  try {
    if (!Array.isArray(destinations)) return;
    localStorage.setItem(DESTINATIONS_KEY, JSON.stringify(destinations));
  } catch (e) {
    console.error('Failed to save destinations', e);
  }
}

export function loadUser(): TelegramUser | null {
  try {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Only recognize genuine users with active MTProto sessionString and ignore fake demo accounts
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.sessionString &&
        parsed.id !== 1048576 &&
        parsed.username !== 'quangvu_works'
      ) {
        return parsed;
      }
      // Demo user or invalid session string detected: remove it immediately
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // fallback
  }
  return null;
}

export function saveUser(user: TelegramUser | null) {
  try {
    if (user && user.sessionString && user.id !== 1048576) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch (e) {
    console.error('Failed to save user', e);
  }
}

export function loadTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // fallback
  }
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'dark'; // TeleCloud looks very sleek and modern in deep Telegram dark mode
}

export function saveTheme(theme: 'dark' | 'light') {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function loadSavedLang(): 'vi' | 'en' {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return 'vi';
}

export function saveSavedLang(lang: 'vi' | 'en') {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

const PINNED_DESTINATIONS_KEY = 'teledrive_pinned_destinations_v1';

export function loadPinnedDestinationIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_DESTINATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePinnedDestinationIds(ids: string[]) {
  try {
    localStorage.setItem(PINNED_DESTINATIONS_KEY, JSON.stringify(ids));
  } catch {}
}
