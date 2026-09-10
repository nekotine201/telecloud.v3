export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'other';

export type StorageTarget = 'saved' | 'channel' | 'group';

export type FileTypeFilter = 'all' | 'image' | 'zip' | 'video' | 'audio' | 'psd' | 'ai' | 'document';

export interface StorageDestinationInfo {
  id: string;
  name: string;
  type: StorageTarget;
  chatId: string;
  description?: string;
  isDefault?: boolean;
  canUpload?: boolean;
  isPinned?: boolean;
  participantsCount?: number;
  unreadCount?: number;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number; // bytes
  category: FileCategory;
  mimeType: string;
  folderId: string | null; // null means root
  createdAt: number;
  updatedAt: number;
  telegramMessageId: number;
  telegramChatId: string;
  storageTarget: StorageTarget;
  storageName: string;
  isEncrypted: boolean;
  encryptionAlgorithm?: string;
  isStarred?: boolean;
  isTrash?: boolean;
  downloadUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  localBlob?: Blob;
  isDeleted?: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null; // null means root
  color: string;
  createdAt: number;
  updatedAt: number;
  isStarred?: boolean;
  isTrash?: boolean;
  isDeleted?: boolean;
}

export interface TelegramUser {
  id: number | string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatarUrl?: string;
  isPremium?: boolean;
  dcId?: number;
  authDate?: number;
  sessionToken?: string;
  sessionString?: string;
}

export interface UploadTask {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number; // 0 to 100
  status: 'encrypting' | 'uploading' | 'completed' | 'error' | 'paused';
  speed: string; // e.g. "12.4 MB/s"
  eta: string; // e.g. "4s"
  stageMessage?: string;
  targetName: string;
  targetType: StorageTarget;
  isEncrypted: boolean;
  folderId: string | null;
  folderPath?: string;
  abortController?: AbortController;
  error?: string;
}

export type ViewMode = 'large_icons' | 'medium_icons' | 'small_icons' | 'list' | 'details';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: Language;
  showRateLimit: boolean;
  downloadLocation: string;
  askWhereToSave: boolean;
}

export type NavView = 'all' | 'saved' | 'recent' | 'starred' | 'document' | 'links' | FileCategory;

export interface TelegramLink {
  id: string;
  url: string;
  messageText: string;
  telegramMessageId: number;
  telegramChatId: string;
  createdAt: number;
  previewUrl?: string;
  title?: string;
  description?: string;
  siteName?: string;
}


export type SortField = 'name' | 'date' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface FilterState {
  search: string;
  category: FileCategory | 'all';
  fileTypeFilter?: FileTypeFilter;
  sizeFilter: 'all' | 'small' | 'medium' | 'large' | 'huge'; // <10MB, 10-100MB, 100MB-1GB, >1GB
  dateFilter: 'all' | 'today' | 'week' | 'month' | 'year';
  storageTarget: string; // 'all' or specific destination ID
}

export type Language = 'vi' | 'en';
