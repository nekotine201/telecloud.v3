import React, { useState, useEffect } from 'react';
import {
  Folder,
  File,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Archive,
  Code2,
  Star,
  Download,
  Send,
  MoreVertical,
  Trash2,
  ArrowUpDown,
  RefreshCw,
  Copy,
  Edit2,
  FolderInput,
  Info,
  CheckSquare,
  Square,
  LayoutGrid,
  Grid3X3,
  List as ListIcon,
  AlignJustify,
  Check,
  Plus,
  ChevronRight,
  ArrowLeft,
  Play,
  X,
  Layers,
  Sparkles,
  Filter,
  ShieldCheck,
  Eye,
  Link,
} from 'lucide-react';
import {
  DriveFile,
  DriveFolder,
  FilterState,
  FileTypeFilter,
  StorageDestinationInfo,
  Language,
  NavView,
  SortField,
  SortOrder,
  ViewMode,
  TelegramLink,
} from '../types';
import { formatFileSize, formatDate } from '../services/storage';
import { resolveApiUrl } from '../services/telegram';

class TaskQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private limit = 2; // Allow at most 2 simultaneous downloads for GramJS stability

  add(task: () => Promise<void>) {
    this.queue.push(task);
    this.runNext();
  }

  private runNext() {
    if (this.activeCount >= this.limit || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    task().finally(() => {
      this.activeCount--;
      this.runNext();
    });
  }
}

const directDownloadQueue = new TaskQueue();

const ClientDirectImage: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    let localUrl: string | null = null;

    const loadDirectImg = () => {
      directDownloadQueue.add(async () => {
        if (!active) return;
        try {
          const match = src.match(/^client-direct:\/\/([^/]+)\/([^/]+)\/(.+)$/);
          if (!match) return;
          const chatId = match[1];
          const messageId = parseInt(match[2], 10);
          const fileName = decodeURIComponent(match[3]);

          const { loadUser } = await import('../services/storage');
          const userObj = loadUser();
          if (!userObj?.sessionString) return;

          setLoading(true);
          const { downloadFileDirectlyFromTelegram } = await import('../services/clientTelegram');
          const blob = await downloadFileDirectlyFromTelegram(
            userObj.sessionString,
            chatId,
            messageId,
            fileName,
            undefined,
            true
          );

          if (active) {
            localUrl = URL.createObjectURL(blob);
            setBlobUrl(localUrl);
          }
        } catch (err) {
          console.error('Failed to load client direct thumbnail:', err);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      });
    };

    loadDirectImg();

    return () => {
      active = false;
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900/40">
        <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900/40 text-slate-400">
        <ImageIcon className="w-4 h-4" />
      </div>
    );
  }

  return <img src={blobUrl} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" />;
};

export function getFileExt(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function matchesFileTypeFilter(file: DriveFile, filterType: FileTypeFilter): boolean {
  if (filterType === 'all') return true;
  const ext = getFileExt(file.name);

  if (filterType === 'image') {
    return file.category === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'tiff'].includes(ext);
  }
  if (filterType === 'zip') {
    return file.category === 'archive' || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'tgz'].includes(ext);
  }
  if (filterType === 'video') {
    return file.category === 'video' || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v', '3gp', 'ts'].includes(ext);
  }
  if (filterType === 'audio') {
    return file.category === 'audio' || ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'opus'].includes(ext);
  }
  if (filterType === 'psd') {
    return ['psd', 'psb'].includes(ext);
  }
  if (filterType === 'ai') {
    return ['ai', 'eps'].includes(ext);
  }
  if (filterType === 'document') {
    return file.category === 'document' || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext);
  }
  return true;
}

interface FileManagerProps {
  files: DriveFile[];
  folders: DriveFolder[];
  telegramLinks?: TelegramLink[];
  currentFolderId: string | null;
  currentView: NavView;
  activeDestination?: StorageDestinationInfo;
  filters: FilterState;
  onUpdateFilters: (partial: Partial<FilterState>) => void;
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onChangeSort: (field: SortField) => void;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenFilePreview: (file: DriveFile) => void;
  onDownloadFile: (file: DriveFile) => void;
  onForwardFile: (file: DriveFile) => void;
  onToggleStarFile: (file: DriveFile) => void;
  onToggleStarFolder: (folder: DriveFolder) => void;
  onDeleteFile: (file: DriveFile, permanent?: boolean) => void;
  onDeleteBatchFiles?: (files: DriveFile[], permanent?: boolean) => void;
  onRenameFile: (file: DriveFile, newName: string) => void;
  onDuplicateFile: (file: DriveFile) => void;
  onMoveFileToFolder: (file: DriveFile, folderId: string | null) => void;
  onDeleteFolder?: (folderId: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onOpenFileUpload: () => void;
  onOpenFolderUpload?: () => void;
  onOpenCreateFolder: () => void;
  isDragOver: boolean;
  lang: Language;
  isSyncing?: boolean;
  onSync?: () => void;
}

export const FileManager: React.FC<FileManagerProps> = ({
  files,
  folders,
  telegramLinks = [],
  currentFolderId,
  currentView,
  activeDestination,
  filters,
  onUpdateFilters,
  viewMode,
  onToggleViewMode,
  sortField,
  sortOrder,
  onChangeSort,
  onNavigateFolder,
  onOpenFilePreview,
  onDownloadFile,
  onForwardFile,
  onToggleStarFile,
  onToggleStarFolder,
  onDeleteFile,
  onDeleteBatchFiles,
  onRenameFile,
  onDuplicateFile,
  onMoveFileToFolder,
  onDeleteFolder,
  onRenameFolder,
  onOpenFileUpload,
  onOpenFolderUpload,
  onOpenCreateFolder,
  isDragOver,
  lang,
  isSyncing = false,
  onSync,
}) => {
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: DriveFile | null;
    folder: DriveFolder | null;
  } | null>(null);

  // Dropdown States for Header
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);

  // Multi-select state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);

  // Rename modal state
  const [renamingFile, setRenamingFile] = useState<DriveFile | null>(null);
  const [newFileName, setNewFileName] = useState('');

  // Folder rename & delete modal state
  const [renamingFolder, setRenamingFolder] = useState<DriveFolder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [deletingFolder, setDeletingFolder] = useState<DriveFolder | null>(null);

  // Drag & drop file to folder state
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBack, setDragOverBack] = useState(false);

  // Move modal state
  const [movingFile, setMovingFile] = useState<DriveFile | null>(null);

  // Copy link feedback state
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [copiedTgId, setCopiedTgId] = useState<string | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutside = () => {
      setContextMenu(null);
      setShowSortMenu(false);
      setShowViewMenu(false);
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  // Helper to reliably check if a file belongs to the active destination (Saved Messages vs specific Channel/Group)
  const isFileInDestination = (file: DriveFile, dest?: StorageDestinationInfo): boolean => {
    if (!dest || dest.type === 'saved' || dest.id === 'dest-saved') {
      // Saved Messages: exclude files that belong to another channel or group
      if (file.storageTarget === 'channel' || file.storageTarget === 'group') return false;
      if (file.telegramChatId && file.telegramChatId !== 'me' && file.telegramChatId !== 'dest-saved') return false;
      return true;
    }

    // Specific Channel or Group:
    const destChatId = String(dest.chatId || '').trim();
    const fileChatId = String(file.telegramChatId || '').trim();

    if (fileChatId && destChatId) {
      if (fileChatId === destChatId) return true;
      const cleanDestId = destChatId.replace(/^-100/, '').replace(/^-/, '');
      const cleanFileId = fileChatId.replace(/^-100/, '').replace(/^-/, '');
      if (cleanDestId && cleanFileId && cleanDestId === cleanFileId) return true;
    }

    if (file.storageName && dest.name && file.storageName.toLowerCase() === dest.name.toLowerCase()) {
      return true;
    }

    return false;
  };

  // Compute files in current scope to determine counts for file type filter chips
  const currentScopeFiles = files.filter(file => {
    if (file.isDeleted) return false;
    if (!isFileInDestination(file, activeDestination)) return false;
    if (currentFolderId) return file.folderId === currentFolderId;
    if (currentView === 'saved') {
      return true;
    }
    if (currentView === 'starred') return file.isStarred;
    if (currentView === 'recent' || currentView === 'links') return true;
    if (currentView === 'document') return file.category === 'document' || Boolean(file.name.match(/\.(docx|pdf|txt|xlsx|pptx)$/i));
    return true;
  });

  const fileTypeCounts = {
    all: currentScopeFiles.length,
    image: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'image')).length,
    zip: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'zip')).length,
    video: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'video')).length,
    audio: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'audio')).length,
    psd: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'psd')).length,
    ai: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'ai')).length,
    document: currentScopeFiles.filter(f => matchesFileTypeFilter(f, 'document')).length,
  };

  // Filter files
  const filteredFiles = files.filter(file => {
    // Always restrict to active destination first
    if (!isFileInDestination(file, activeDestination)) return false;

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchName = file.name.toLowerCase().includes(q);
      const matchStorage = file.storageName.toLowerCase().includes(q);
      if (!matchName && !matchStorage) return false;
    }

    // Inside a specific folder
    if (currentFolderId) {
      return file.folderId === currentFolderId && !file.isDeleted;
    }

    // View filter
    if (currentView === 'saved') {
      // already filtered by isFileInDestination above
    } else if (currentView === 'recent') {
      if (file.isDeleted) return false;
    } else if (currentView === 'links') {
      if (file.isDeleted) return false;
    } else if (currentView === 'starred') {
      if (!file.isStarred || file.isDeleted) return false;
    } else if (currentView === 'document') {
      if ((file.category !== 'document' && !file.name.match(/\.(docx|pdf|txt|xlsx|pptx)$/i)) || file.isDeleted) return false;
    } else if (currentView !== 'all') {
      if (file.category !== currentView || file.isDeleted) return false;
    }

    // File Type Filter (Ảnh, Zip, Video, Audio, PSD, AI, Tài liệu)
    const activeTypeFilter = filters.fileTypeFilter || 'all';
    if (activeTypeFilter !== 'all') {
      if (!matchesFileTypeFilter(file, activeTypeFilter)) return false;
    }

    return !file.isDeleted;
  });

  // Sort files
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (currentView === 'recent') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    let res = 0;
    if (sortField === 'name') {
      res = a.name.localeCompare(b.name);
    } else if (sortField === 'size') {
      res = a.size - b.size;
    } else if (sortField === 'date') {
      res = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
    return sortOrder === 'asc' ? res : -res;
  });

  // Folders to display: visible in 'saved' and 'all', or when navigating inside folders
  const displayedFolders = folders.filter(f => {
    if (currentView === 'starred') return f.isStarred && !f.isDeleted;
    if (currentView === 'recent' || currentView === 'document' || currentView === 'links') return false;
    return f.parentId === currentFolderId && !f.isDeleted;
  });

  // Current active folder object
  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  // Current View Title
  const getViewTitle = () => {
    if (currentFolder) {
      return currentFolder.name;
    }
    switch (currentView) {
      case 'saved':
        return activeDestination ? activeDestination.name : 'Saved Messages';
      case 'recent':
        return 'Gần đây';
      case 'starred':
        return 'Có gắn dấu sao';
      case 'document':
        return 'Tài liệu';
      case 'links':
        return 'Quản lý liên kết';
      default:
        return 'Trang chủ';
    }
  };

  // Right-click handler
  const handleContextMenu = (e: React.MouseEvent, file?: DriveFile, folder?: DriveFolder) => {
    e.preventDefault();
    e.stopPropagation();
    const isMobile = window.innerWidth < 640;
    setContextMenu({
      x: isMobile ? 0 : Math.min(Math.max(10, e.clientX), window.innerWidth - 240),
      y: isMobile ? 0 : Math.min(Math.max(10, e.clientY), window.innerHeight - 380),
      file: file || null,
      folder: folder || null,
    });
  };

  const toggleSelectFile = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFileIds.size === sortedFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(sortedFiles.map(f => f.id)));
    }
  };

  const handleBatchDownload = () => {
    const toDownload = sortedFiles.filter(f => selectedFileIds.has(f.id));
    toDownload.forEach(f => onDownloadFile(f));
  };

  const handleBatchDelete = () => {
    if (selectedFileIds.size === 0) return;
    setShowBatchDeleteModal(true);
  };

  const executeBatchDelete = () => {
    const toDelete = sortedFiles.filter(f => selectedFileIds.has(f.id));
    if (toDelete.length > 0) {
      if (onDeleteBatchFiles) {
        onDeleteBatchFiles(toDelete);
      } else {
        toDelete.forEach(f => onDeleteFile(f));
      }
    }
    setSelectedFileIds(new Set());
    setIsMultiSelectMode(false);
    setShowBatchDeleteModal(false);
  };

  // Helper for small icons (table / list)
  const renderSmallFileIcon = (file: DriveFile) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (file.category === 'video' || ['mp4', 'mkv', 'mov', 'webm'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
          <Video className="w-4 h-4" />
        </div>
      );
    }
    if (file.category === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      const rawImgUrl = file.thumbnailUrl || file.previewUrl;
      const isClientDirect = rawImgUrl?.startsWith('client-direct://');
      const imgUrl = (rawImgUrl && !isClientDirect) ? resolveApiUrl(rawImgUrl) : '';
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center shrink-0 overflow-hidden">
          {isClientDirect && rawImgUrl ? (
            <ClientDirectImage src={rawImgUrl} alt="" className="w-full h-full object-cover" />
          ) : imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
        </div>
      );
    }
    if (ext === 'pdf') {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      );
    }
    if (['doc', 'docx'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
      );
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <Archive className="w-4 h-4" />
        </div>
      );
    }
    if (['psd', 'psb'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 font-black text-[10px] flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
          Ps
        </div>
      );
    }
    if (['ai', 'eps'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 font-black text-[10px] flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800">
          Ai
        </div>
      );
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'json', 'html', 'css'].includes(ext)) {
      return (
        <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-500 dark:bg-cyan-950/40 dark:text-cyan-400 flex items-center justify-center shrink-0">
          <Code2 className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex items-center justify-center shrink-0">
        <File className="w-4 h-4" />
      </div>
    );
  };

  // Helper for large preview card thumbnail (LARGE & MEDIUM ICONS)
  const renderLargePreview = (file: DriveFile, isLarge: boolean) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const rawImgUrl = file.thumbnailUrl || file.previewUrl;
    const isClientDirect = rawImgUrl?.startsWith('client-direct://');
    const imgUrl = (rawImgUrl && !isClientDirect) ? resolveApiUrl(rawImgUrl) : '';
    const isImg = file.category === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
    const isVid = file.category === 'video' || ['mp4', 'mkv', 'mov', 'webm'].includes(ext);

    const heightClass = isLarge ? 'h-48' : 'h-32';

    if ((isImg || isVid) && (imgUrl || (isClientDirect && rawImgUrl))) {
      return (
        <div className={`w-full ${heightClass} relative overflow-hidden bg-slate-100 dark:bg-slate-900 rounded-t-xl group/thumb`}>
          {isClientDirect && rawImgUrl ? (
            <ClientDirectImage
              src={rawImgUrl}
              alt={file.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <img
              src={imgUrl}
              alt={file.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          )}
          {isVid && (
            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white flex items-center justify-center shadow-lg">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (isVid) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-950/30 dark:to-rose-900/20 text-red-500 rounded-t-xl relative`}>
          <Video className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300">
            VIDEO {ext}
          </span>
        </div>
      );
    }

    if (isImg) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/30 dark:to-orange-900/20 text-amber-500 rounded-t-xl relative`}>
          <ImageIcon className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
            {ext}
          </span>
        </div>
      );
    }

    if (ext === 'pdf') {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 to-red-100 dark:from-rose-950/30 dark:to-red-900/20 text-rose-500 rounded-t-xl`}>
          <FileText className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
            PDF
          </span>
        </div>
      );
    }

    if (['doc', 'docx'].includes(ext)) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-sky-100 dark:from-blue-950/30 dark:to-sky-900/20 text-blue-500 rounded-t-xl`}>
          <FileText className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
            WORD
          </span>
        </div>
      );
    }

    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-950/30 dark:to-teal-900/20 text-emerald-500 rounded-t-xl`}>
          <Archive className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
            ARCHIVE
          </span>
        </div>
      );
    }

    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950/30 dark:to-violet-900/20 text-purple-500 rounded-t-xl`}>
          <Music className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
          <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
            AUDIO
          </span>
        </div>
      );
    }

    if (['psd', 'psb'].includes(ext)) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-t-xl relative overflow-hidden`}>
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center font-black text-2xl text-blue-300 shadow-inner">
            Ps
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30">
            PHOTOSHOP
          </span>
        </div>
      );
    }

    if (['ai', 'eps'].includes(ext)) {
      return (
        <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-gradient-to-br from-amber-900 to-orange-950 text-white rounded-t-xl relative overflow-hidden`}>
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center font-black text-2xl text-amber-300 shadow-inner">
            Ai
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/30">
            ILLUSTRATOR
          </span>
        </div>
      );
    }

    return (
      <div className={`w-full ${heightClass} flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/60 text-slate-400 rounded-t-xl`}>
        <File className={isLarge ? 'w-16 h-16' : 'w-10 h-10'} />
        <span className="text-[11px] font-bold uppercase tracking-wider mt-2 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
          {ext || 'FILE'}
        </span>
      </div>
    );
  };

  return (
    <div
      id="teledrive-file-manager"
      className={`flex-1 flex flex-col h-full overflow-hidden select-none bg-white text-slate-800 dark:bg-[#0b1120] dark:text-slate-100 transition-colors ${
        isDragOver ? 'ring-2 ring-sky-500 ring-inset bg-sky-50/20' : ''
      }`}
    >
      {/* Top Header Bar */}
      <div className="h-14 px-3 sm:px-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-white dark:bg-[#0f172a]/80">
        {/* Left: Breadcrumbs / Title & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {currentFolderId ? (
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                onClick={() => onNavigateFolder(currentFolder?.parentId || null)}
                onDragOver={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverBack(true);
                }}
                onDragLeave={() => setDragOverBack(false)}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverBack(false);
                  const fileId = e.dataTransfer.getData('application/x-teledrive-file-id') || e.dataTransfer.getData('text/plain') || draggedFileId;
                  if (fileId) {
                    const fileToMove = files.find(f => f.id === fileId);
                    if (fileToMove) {
                      onMoveFileToFolder(fileToMove, currentFolder?.parentId || null);
                    }
                  }
                }}
                className={`flex items-center gap-1 text-xs font-semibold p-1 sm:px-2 sm:py-1 rounded-lg transition-all shrink-0 ${
                  dragOverBack
                    ? 'bg-sky-500 text-white ring-2 ring-sky-300 animate-pulse'
                    : 'text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Quay lại (hoặc kéo tệp thả vào đây để chuyển ra thư mục cha)"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Quay lại</span>
              </button>
              <span className="text-slate-400 shrink-0">/</span>
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-1.5 truncate">
                <Folder className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500 shrink-0" />
                <span className="truncate">{getViewTitle()}</span>
              </h2>

              {/* Folder action buttons in header */}
              {currentFolder && (
                <div className="flex items-center gap-0.5 ml-1 shrink-0">
                  <button
                    onClick={() => {
                      setRenamingFolder(currentFolder);
                      setNewFolderName(currentFolder.name);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Đổi tên thư mục"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingFolder(currentFolder)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Xoá thư mục này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white tracking-tight truncate">
                {getViewTitle()}
              </h2>
              {currentView === 'saved' && activeDestination && (
                activeDestination.canUpload !== false ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50 shrink-0">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Quyền tải lên (Folder chung)</span>
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50 shrink-0">
                    <Eye className="w-3 h-3" />
                    <span>Chỉ xem</span>
                  </span>
                )
              )}
            </div>
          )}

          {/* Quét button */}
          {onSync && (
            <button
              id="header-scan-button"
              onClick={onSync}
              disabled={isSyncing}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-2xs transition-all active:scale-95 shrink-0"
              title="Quét lại toàn bộ tệp từ Telegram"
            >
              <RefreshCw className={`w-3 h-3 text-slate-600 dark:text-slate-300 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Quét</span>
            </button>
          )}

          {/* Nút bật/tắt Chọn nhiều file */}
          <button
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) setSelectedFileIds(new Set());
            }}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-lg border transition-all shrink-0 ${
              isMultiSelectMode
                ? 'bg-sky-50 border-sky-300 text-sky-600 dark:bg-sky-950/50 dark:border-sky-700 dark:text-sky-400'
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
            title="Bật/tắt chế độ chọn nhiều file"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chọn nhiều</span>
          </button>
        </div>

        {/* Right: Item Count, Sort Button, View Mode Button */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
            {sortedFiles.length + displayedFolders.length} mục
          </span>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={e => {
                e.stopPropagation();
                setShowSortMenu(!showSortMenu);
                setShowViewMenu(false);
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title="Sắp xếp"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl shadow-lg border p-1 z-50 bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    onChangeSort('name');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                    sortField === 'name' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Tên</span>
                  {sortField === 'name' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>
                <button
                  onClick={() => {
                    onChangeSort('date');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                    sortField === 'date' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Thời gian tạo</span>
                  {sortField === 'date' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>
                <button
                  onClick={() => {
                    onChangeSort('size');
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                    sortField === 'size' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>Kích thước</span>
                  {sortField === 'size' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>
              </div>
            )}
          </div>

          {/* View Mode Dropdown */}
          <div className="relative">
            <button
              onClick={e => {
                e.stopPropagation();
                setShowViewMenu(!showViewMenu);
                setShowSortMenu(false);
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title="Chế độ xem"
            >
              {viewMode === 'details' && <AlignJustify className="w-4 h-4" />}
              {viewMode === 'list' && <ListIcon className="w-4 h-4" />}
              {viewMode === 'large_icons' && <Square className="w-4 h-4" />}
              {viewMode === 'medium_icons' && <LayoutGrid className="w-4 h-4" />}
              {viewMode === 'small_icons' && <Grid3X3 className="w-4 h-4" />}
            </button>

            {showViewMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl shadow-lg border p-1 z-50 bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    onToggleViewMode('large_icons');
                    setShowViewMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                    viewMode === 'large_icons' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Square className="w-4 h-4 text-slate-500" />
                    <span>Biểu tượng lớn</span>
                  </div>
                  {viewMode === 'large_icons' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>

                <button
                  onClick={() => {
                    onToggleViewMode('medium_icons');
                    setShowViewMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                    viewMode === 'medium_icons' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <LayoutGrid className="w-4 h-4 text-slate-500" />
                    <span>Biểu tượng vừa</span>
                  </div>
                  {viewMode === 'medium_icons' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>

                <button
                  onClick={() => {
                    onToggleViewMode('small_icons');
                    setShowViewMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                    viewMode === 'small_icons' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Grid3X3 className="w-4 h-4 text-slate-500" />
                    <span>Biểu tượng nhỏ</span>
                  </div>
                  {viewMode === 'small_icons' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>

                <button
                  onClick={() => {
                    onToggleViewMode('list');
                    setShowViewMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                    viewMode === 'list' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ListIcon className="w-4 h-4 text-slate-500" />
                    <span>Danh sách</span>
                  </div>
                  {viewMode === 'list' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>

                <button
                  onClick={() => {
                    onToggleViewMode('details');
                    setShowViewMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                    viewMode === 'details' ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <AlignJustify className="w-4 h-4 text-slate-500" />
                    <span>Chi tiết</span>
                  </div>
                  {viewMode === 'details' && <Check className="w-3.5 h-3.5 text-sky-500" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File Type Filter Bar (Ảnh, Zip, Video, Audio, PSD, AI, Tài liệu) */}
      <div className="px-3 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium shrink-0 mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-wider">Lọc:</span>
        </div>

        {[
          { id: 'all', label: 'Tất cả', icon: null },
          { id: 'image', label: 'Ảnh', icon: <ImageIcon className="w-3.5 h-3.5 text-amber-500" /> },
          { id: 'zip', label: 'Zip / Nén', icon: <Archive className="w-3.5 h-3.5 text-emerald-500" /> },
          { id: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5 text-red-500" /> },
          { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5 text-purple-500" /> },
          {
            id: 'psd',
            label: 'PSD',
            icon: (
              <span className="w-3.5 h-3.5 rounded bg-blue-600 text-[8px] font-black text-white flex items-center justify-center">
                Ps
              </span>
            ),
          },
          {
            id: 'ai',
            label: 'AI',
            icon: (
              <span className="w-3.5 h-3.5 rounded bg-amber-600 text-[8px] font-black text-white flex items-center justify-center">
                Ai
              </span>
            ),
          },
          { id: 'document', label: 'Tài liệu', icon: <FileText className="w-3.5 h-3.5 text-blue-500" /> },
        ].map(chip => {
          const isActive = (filters.fileTypeFilter || 'all') === chip.id;
          const count = fileTypeCounts[chip.id as keyof typeof fileTypeCounts] ?? 0;

          return (
            <button
              key={chip.id}
              onClick={() => onUpdateFilters({ fileTypeFilter: chip.id as FileTypeFilter })}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-sky-600 text-white font-semibold shadow-xs ring-1 ring-sky-500'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/60 font-medium'
              }`}
            >
              {chip.icon}
              <span>{chip.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Multi-Select Floating Action Bar */}
      {isMultiSelectMode && (
        <div className="px-6 py-2.5 bg-sky-50 border-b border-sky-100 dark:bg-sky-950/50 dark:border-sky-900/60 flex items-center justify-between text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-300 hover:underline"
            >
              {selectedFileIds.size === sortedFiles.length ? (
                <CheckSquare className="w-4 h-4 text-sky-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {selectedFileIds.size === sortedFiles.length
                  ? 'Bỏ chọn tất cả'
                  : `Chọn tất cả (${sortedFiles.length})`}
              </span>
            </button>
            <span className="text-slate-400">|</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Đã chọn: <span className="text-sky-600 dark:text-sky-400">{selectedFileIds.size}</span> tệp
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedFileIds.size > 0 && (
              <>
                <button
                  onClick={handleBatchDownload}
                  className="px-3 py-1 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500 flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải xuống ({selectedFileIds.size})</span>
                </button>

                <button
                  onClick={handleBatchDelete}
                  className="px-3 py-1 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-500 flex items-center gap-1.5 shadow-xs transition-colors"
                  title="Xóa các tệp đã chọn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa ({selectedFileIds.size})</span>
                </button>
              </>
            )}

            <button
              onClick={() => {
                setIsMultiSelectMode(false);
                setSelectedFileIds(new Set());
              }}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Đóng chọn nhiều"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0b1120]">
        {currentView === 'links' ? (
          <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Quản lý liên kết TeleCloud
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Trích xuất và quản lý tất cả các liên kết URL xuất hiện trong tin nhắn, bài viết của kênh Telegram.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 font-semibold bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-sky-100 dark:border-sky-800 shrink-0">
                <span>Tổng số liên kết:</span>
                <span className="font-bold">{telegramLinks.length}</span>
              </div>
            </div>

            {telegramLinks.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/10">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                  <Link className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Không tìm thấy liên kết nào</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">Hãy quét (đồng bộ) kênh để tự động phát hiện và trích xuất tất cả các đường dẫn URL chia sẻ.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {telegramLinks.map(link => {
                  const telegramDirectLink = `https://t.me/c/${link.telegramChatId.replace('-100', '')}/${link.telegramMessageId}`;
                  const isCopiedLink = copiedShareId === link.id;

                  return (
                    <div key={`link-card-${link.id}`} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-sky-300 dark:hover:border-sky-800 transition-all shadow-2xs">
                      <div className="flex flex-col sm:flex-row items-start gap-4 min-w-0 flex-1 w-full">
                        {/* Thumbnail or Icon */}
                        {link.previewUrl ? (
                          <div className="w-full sm:w-28 h-28 sm:h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800 shrink-0 relative shadow-2xs">
                            <img
                              src={resolveApiUrl(link.previewUrl)}
                              alt={link.title || 'Link preview'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              onError={(e) => {
                                // If image fails to load, fallback gracefully to a placeholder
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 text-sky-500 rounded-xl flex items-center justify-center shrink-0 border border-slate-150/50 dark:border-slate-750">
                            <Link className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            {link.siteName && (
                              <span className="text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono">
                                {link.siteName}
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-850 text-slate-500 px-1.5 py-0.5 rounded-md font-semibold">
                              Tin nhắn #{link.telegramMessageId}
                            </span>
                          </div>

                          {link.title ? (
                            <div className="space-y-1">
                              <h4 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-tight">
                                {link.title}
                              </h4>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-xs text-sky-600 dark:text-sky-400 hover:underline truncate max-w-md sm:max-w-xl block font-mono"
                                title={link.url}
                              >
                                {link.url}
                              </a>
                            </div>
                          ) : (
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-bold text-xs sm:text-sm text-sky-600 dark:text-sky-400 hover:underline truncate max-w-md sm:max-w-xl block leading-normal"
                              title={link.url}
                            >
                              {link.url}
                            </a>
                          )}

                          {link.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                              {link.description}
                            </p>
                          )}

                          {/* Context / Caption snippet where link was found */}
                          {link.messageText && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50/50 dark:bg-slate-950/20 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 leading-relaxed whitespace-pre-wrap">
                              "{link.messageText}"
                            </div>
                          )}

                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2">
                            <span>{formatDate(link.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action buttons */}
                      <div className="flex sm:flex-row md:flex-col items-center gap-2 w-full md:w-auto shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 dark:border-slate-800/60">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(link.url);
                            setCopiedShareId(link.id);
                            setTimeout(() => setCopiedShareId(null), 2000);
                          }}
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
                        >
                          {isCopiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-500 font-semibold">Đã sao chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Sao chép</span>
                            </>
                          )}
                        </button>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-900/40 dark:text-sky-300 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Mở liên kết</span>
                        </a>
                        <a
                          href={telegramDirectLink}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 dark:bg-slate-900 dark:hover:bg-slate-850 dark:text-slate-400 rounded-xl text-xs font-semibold border border-slate-200/60 dark:border-slate-800/80 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Xem tin nhắn gốc</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : sortedFiles.length === 0 && displayedFolders.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <File className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Không có tệp nào ở đây
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {activeDestination && activeDestination.type !== 'saved'
                ? `Kênh "${activeDestination.name}" hiện chưa có tệp nào được đồng bộ.`
                : 'Kéo thả file vào đây hoặc nhấn "Quét" để tải tệp từ tài khoản Telegram của bạn.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
              <button
                onClick={onOpenFileUpload}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tải tệp lên</span>
              </button>
              {onOpenFolderUpload && (
                <button
                  onClick={onOpenFolderUpload}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tải thư mục lên</span>
                </button>
              )}
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={isSyncing}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Quét từ Telegram</span>
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'details' ? (
          /* Table View: Details */
          <table className="w-full text-left text-xs border-collapse">
            <thead className="text-[12px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 sticky top-0 bg-white dark:bg-[#0b1120] z-10">
              <tr>
                {isMultiSelectMode && <th className="w-10 py-3 px-4"></th>}
                <th
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => onChangeSort('name')}
                >
                  <div className="flex items-center gap-1">
                    <span>Tên</span>
                    {sortField === 'name' && (
                      <span className="text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th className="py-3 px-4 hidden sm:table-cell">Chủ sở hữu</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white"
                  onClick={() => onChangeSort('date')}
                >
                  <div className="flex items-center gap-1">
                    <span>Thời gian tạo</span>
                    {sortField === 'date' && (
                      <span className="text-[10px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
                <th className="py-3 px-4 hidden md:table-cell">Chủ sở hữu / Vị trí</th>
                <th className="py-3 px-4 text-right w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
              {/* Folders first */}
              {displayedFolders.map(folder => (
                <tr
                  key={folder.id}
                  onClick={() => onNavigateFolder(folder.id)}
                  onContextMenu={e => handleContextMenu(e, undefined, folder)}
                  onDragOver={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fileId = e.dataTransfer.getData('application/x-teledrive-file-id') || e.dataTransfer.getData('text/plain') || draggedFileId;
                    setDragOverFolderId(null);
                    setDraggedFileId(null);
                    if (fileId) {
                      const fileToMove = files.find(f => f.id === fileId);
                      if (fileToMove) {
                        onMoveFileToFolder(fileToMove, folder.id);
                      }
                    }
                  }}
                  className={`transition-all cursor-pointer group ${
                    dragOverFolderId === folder.id
                      ? 'bg-sky-100 dark:bg-sky-950/80 ring-2 ring-sky-500 font-semibold'
                      : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {isMultiSelectMode && <td className="py-2.5 px-4"></td>}
                  <td className="py-2.5 px-4 flex items-center gap-3">
                    <Folder className={`w-5 h-5 shrink-0 ${
                      dragOverFolderId === folder.id
                        ? 'text-sky-600 fill-sky-200 animate-bounce'
                        : 'text-slate-500 fill-slate-200 dark:fill-slate-700'
                    }`} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {folder.name}
                    </span>
                    {dragOverFolderId === folder.id && (
                      <span className="text-[10px] bg-sky-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse shrink-0">
                        Thả để chuyển vào
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                    tôi
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                    {formatDate(folder.updatedAt, lang)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell">-</td>
                  <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleContextMenu(e, undefined, folder)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      title="Tùy chọn thư mục"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Files */}
              {sortedFiles.map(file => (
                <tr
                  key={file.id}
                  draggable={!isMultiSelectMode}
                  onDragStart={e => {
                    e.dataTransfer.setData('application/x-teledrive-file-id', file.id);
                    e.dataTransfer.setData('text/plain', file.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedFileId(file.id);
                  }}
                  onDragEnd={() => {
                    setDraggedFileId(null);
                    setDragOverFolderId(null);
                  }}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleSelectFile(file.id);
                    } else if (window.innerWidth < 768) {
                      onOpenFilePreview(file);
                    }
                  }}
                  onDoubleClick={() => onOpenFilePreview(file)}
                  onContextMenu={e => handleContextMenu(e, file)}
                  className={`hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${
                    selectedFileIds.has(file.id) ? 'bg-sky-50 dark:bg-sky-950/30' : ''
                  } ${draggedFileId === file.id ? 'opacity-40' : ''}`}
                >
                  {isMultiSelectMode && (
                    <td className="py-2.5 px-4" onClick={e => e.stopPropagation()}>
                      <button onClick={e => toggleSelectFile(file.id, e)}>
                        {selectedFileIds.has(file.id) ? (
                          <CheckSquare className="w-4 h-4 text-sky-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </td>
                  )}
                  <td className="py-2.5 px-4 flex items-center gap-3">
                    {renderSmallFileIcon(file)}
                    <span className="font-normal text-slate-800 dark:text-slate-200 truncate max-w-xs md:max-w-md">
                      {file.name}
                    </span>
                    {file.isStarred && (
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                    me
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">
                    {formatDate(file.updatedAt, lang)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 hidden md:table-cell truncate max-w-[160px]">
                    {file.storageName || 'Saved Messages'}
                  </td>
                  <td className="py-2.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleContextMenu(e, file)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      title="Tùy chọn"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="p-3 sm:p-4 space-y-1">
            {/* Folders */}
            {displayedFolders.map(folder => (
              <div
                key={folder.id}
                onClick={() => onNavigateFolder(folder.id)}
                onContextMenu={e => handleContextMenu(e, undefined, folder)}
                onDragOver={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                }}
                onDragLeave={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const fileId = e.dataTransfer.getData('application/x-teledrive-file-id') || e.dataTransfer.getData('text/plain') || draggedFileId;
                  setDragOverFolderId(null);
                  setDraggedFileId(null);
                  if (fileId) {
                    const fileToMove = files.find(f => f.id === fileId);
                    if (fileToMove) {
                      onMoveFileToFolder(fileToMove, folder.id);
                    }
                  }
                }}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer group ${
                  dragOverFolderId === folder.id
                    ? 'bg-sky-100 dark:bg-sky-950/80 ring-2 ring-sky-500 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3 truncate min-w-0">
                  <Folder className={`w-5 h-5 shrink-0 ${
                    dragOverFolderId === folder.id
                      ? 'text-sky-600 fill-sky-200 animate-bounce'
                      : 'text-slate-500 fill-slate-200 dark:fill-slate-700'
                  }`} />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {folder.name}
                  </span>
                  {dragOverFolderId === folder.id && (
                    <span className="text-[10px] bg-sky-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse shrink-0">
                      Thả để chuyển vào
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-400 shrink-0">
                  <span className="hidden sm:inline">{formatDate(folder.updatedAt, lang)}</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleContextMenu(e, undefined, folder);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    title="Tùy chọn thư mục"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Files */}
            {sortedFiles.map(file => (
              <div
                key={file.id}
                draggable={!isMultiSelectMode}
                onDragStart={e => {
                  e.dataTransfer.setData('application/x-teledrive-file-id', file.id);
                  e.dataTransfer.setData('text/plain', file.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggedFileId(file.id);
                }}
                onDragEnd={() => {
                  setDraggedFileId(null);
                  setDragOverFolderId(null);
                }}
                onClick={() => {
                  if (isMultiSelectMode) {
                    toggleSelectFile(file.id);
                  } else if (window.innerWidth < 768) {
                    onOpenFilePreview(file);
                  }
                }}
                onDoubleClick={() => onOpenFilePreview(file)}
                onContextMenu={e => handleContextMenu(e, file)}
                className={`flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer group transition-colors ${
                  selectedFileIds.has(file.id) ? 'bg-sky-50 dark:bg-sky-950/30' : ''
                } ${draggedFileId === file.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 truncate min-w-0">
                  {isMultiSelectMode && (
                    <button onClick={e => toggleSelectFile(file.id, e)} className="shrink-0">
                      {selectedFileIds.has(file.id) ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  )}
                  {renderSmallFileIcon(file)}
                  <span className="text-xs text-slate-800 dark:text-slate-200 truncate">
                    {file.name}
                  </span>
                  {file.isStarred && (
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-400 shrink-0">
                  <span className="text-[11px] sm:text-xs">{formatFileSize(file.size)}</span>
                  <span className="hidden sm:inline">{formatDate(file.updatedAt, lang)}</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleContextMenu(e, file);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    title="Tùy chọn"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Grid Views: Large, Medium, Small Icons */
          <div className="p-3 sm:p-6 space-y-5 sm:space-y-6">
            {/* Folders in Grid */}
            {displayedFolders.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5 sm:mb-3">
                  Thư mục ({displayedFolders.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
                  {displayedFolders.map(folder => (
                    <div
                      key={folder.id}
                      onClick={() => onNavigateFolder(folder.id)}
                      onContextMenu={e => handleContextMenu(e, undefined, folder)}
                      onDragOver={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                      }}
                      onDragLeave={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const fileId = e.dataTransfer.getData('application/x-teledrive-file-id') || e.dataTransfer.getData('text/plain') || draggedFileId;
                        setDragOverFolderId(null);
                        setDraggedFileId(null);
                        if (fileId) {
                          const fileToMove = files.find(f => f.id === fileId);
                          if (fileToMove) {
                            onMoveFileToFolder(fileToMove, folder.id);
                          }
                        }
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer group ${
                        dragOverFolderId === folder.id
                          ? 'border-sky-500 ring-2 ring-sky-500 bg-sky-100 dark:bg-sky-950/80 shadow-md scale-105'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Folder className={`w-5 h-5 shrink-0 ${
                          dragOverFolderId === folder.id
                            ? 'text-sky-600 fill-sky-200 animate-bounce'
                            : 'text-slate-500 fill-slate-300 dark:fill-slate-600'
                        }`} />
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex-1">
                          {folder.name}
                        </span>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleContextMenu(e, undefined, folder);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                        title="Tùy chọn thư mục"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Grid */}
            <div>
              {displayedFolders.length > 0 && (
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2.5 sm:mb-3">
                  Tệp tin ({sortedFiles.length})
                </h3>
              )}
              <div
                className={`grid gap-3 sm:gap-4 ${
                  viewMode === 'large_icons'
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                    : viewMode === 'medium_icons'
                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                    : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
                }`}
              >
                {sortedFiles.map(file => (
                  <div
                    key={file.id}
                    draggable={!isMultiSelectMode}
                    onDragStart={e => {
                      e.dataTransfer.setData('application/x-teledrive-file-id', file.id);
                      e.dataTransfer.setData('text/plain', file.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedFileId(file.id);
                    }}
                    onDragEnd={() => {
                      setDraggedFileId(null);
                      setDragOverFolderId(null);
                    }}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        toggleSelectFile(file.id);
                      } else if (window.innerWidth < 768) {
                        onOpenFilePreview(file);
                      }
                    }}
                    onDoubleClick={() => onOpenFilePreview(file)}
                    onContextMenu={e => handleContextMenu(e, file)}
                    className={`group relative rounded-2xl border transition-all flex flex-col cursor-pointer overflow-hidden ${
                      selectedFileIds.has(file.id)
                        ? 'border-sky-500 ring-2 ring-sky-500/30 bg-sky-50/50 dark:bg-sky-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-sky-400 hover:shadow-md'
                    } ${draggedFileId === file.id ? 'opacity-40' : ''}`}
                  >
                    {/* Checkbox for multi-select */}
                    {isMultiSelectMode && (
                      <button
                        onClick={e => toggleSelectFile(file.id, e)}
                        className="absolute top-2.5 left-2.5 z-20 p-1 rounded-lg bg-white/90 dark:bg-slate-900/90 shadow-xs"
                      >
                        {selectedFileIds.has(file.id) ? (
                          <CheckSquare className="w-4 h-4 text-sky-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    )}

                    {/* Star badge */}
                    {file.isStarred && (
                      <div className="absolute top-2.5 right-2.5 z-10 p-1 rounded-full bg-white/90 dark:bg-slate-900/90 shadow-xs">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      </div>
                    )}

                    {/* Large / Medium / Small Thumbnail Preview Frame */}
                    {viewMode === 'small_icons' ? (
                      <div className="p-3 flex items-center justify-center py-4 bg-slate-50 dark:bg-slate-900/40">
                        {renderSmallFileIcon(file)}
                      </div>
                    ) : (
                      renderLargePreview(file, viewMode === 'large_icons')
                    )}

                    {/* Bottom Info Section */}
                    <div className="p-2.5 sm:p-3.5 bg-white dark:bg-[#161f30] flex flex-col flex-1 justify-between border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {renderSmallFileIcon(file)}
                          <span
                            className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate flex-1"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleContextMenu(e, file);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                          title="Tùy chọn"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDate(file.updatedAt, lang)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu / Mobile Action Sheet */}
      {contextMenu && (
        <div
          id="file-context-menu-backdrop"
          className="fixed inset-0 z-50 flex sm:block sm:inset-auto bg-black/40 sm:bg-transparent backdrop-blur-xs sm:backdrop-blur-none items-end justify-center"
          style={window.innerWidth >= 640 ? { top: `${contextMenu.y}px`, left: `${contextMenu.x}px` } : undefined}
          onClick={() => setContextMenu(null)}
        >
          <div
            id="file-context-menu"
            className="w-full sm:w-56 rounded-t-3xl sm:rounded-2xl shadow-2xl sm:shadow-xl border bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700 py-3 sm:py-1.5 text-xs animate-in slide-in-from-bottom sm:zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile item preview header */}
            <div className="sm:hidden px-4 pb-3 mb-1 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                {contextMenu.folder ? (
                  <Folder className="w-5 h-5 text-sky-500 shrink-0" />
                ) : (
                  contextMenu.file && renderSmallFileIcon(contextMenu.file)
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 dark:text-slate-100 truncate text-xs">
                    {contextMenu.folder ? contextMenu.folder.name : contextMenu.file?.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {contextMenu.folder ? 'Thư mục' : formatFileSize(contextMenu.file?.size || 0)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setContextMenu(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {contextMenu.file && (
              <>
                {/* Tải xuống */}
                <button
                  onClick={() => {
                    onDownloadFile(contextMenu.file!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Tải xuống</span>
                </button>

                {/* Đổi tên */}
                <button
                  onClick={() => {
                    setRenamingFile(contextMenu.file);
                    setNewFileName(contextMenu.file!.name);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center justify-between text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Edit2 className="w-4 h-4 text-slate-500" />
                    <span>Đổi tên</span>
                  </div>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">Ctrl+Alt+E</span>
                </button>

                {/* Thêm / Bỏ gắn dấu sao */}
                <button
                  onClick={() => {
                    onToggleStarFile(contextMenu.file!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Star
                    className={`w-4 h-4 ${
                      contextMenu.file.isStarred
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-500'
                    }`}
                  />
                  <span>
                    {contextMenu.file.isStarred
                      ? 'Xóa khỏi mục có gắn dấu sao'
                      : 'Thêm vào mục có gắn dấu sao'}
                  </span>
                </button>

                {/* Chọn nhiều file */}
                <button
                  onClick={() => {
                    setIsMultiSelectMode(true);
                    setSelectedFileIds(new Set([contextMenu.file!.id]));
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <CheckSquare className="w-4 h-4 text-slate-500" />
                  <span>Chọn nhiều file</span>
                </button>

                {/* Tạo bản sao */}
                <button
                  onClick={() => {
                    onDuplicateFile(contextMenu.file!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center justify-between text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Tạo bản sao</span>
                  </div>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">Ctrl+C</span>
                </button>

                {/* Chuyển tiếp */}
                <button
                  onClick={() => {
                    onForwardFile(contextMenu.file!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Send className="w-4 h-4 text-slate-500" />
                  <span>Chuyển tiếp</span>
                </button>

                {/* Di chuyển đến thư mục */}
                <button
                  onClick={() => {
                    setMovingFile(contextMenu.file);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <FolderInput className="w-4 h-4 text-slate-500" />
                  <span>Di chuyển đến thư mục</span>
                </button>

                {/* Thông tin về tệp */}
                <button
                  onClick={() => {
                    onOpenFilePreview(contextMenu.file!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Info className="w-4 h-4 text-slate-500" />
                  <span>Xem chi tiết tệp</span>
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-700/80" />

                {/* Xóa vĩnh viễn */}
                <button
                  onClick={() => {
                    onDeleteFile(contextMenu.file!, true);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center justify-between text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>Xóa tệp</span>
                  </div>
                  <span className="text-[10px] text-rose-400 hidden sm:inline">Delete</span>
                </button>
              </>
            )}

            {contextMenu.folder && (
              <>
                <button
                  onClick={() => {
                    onNavigateFolder(contextMenu.folder!.id);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Folder className="w-4 h-4 text-sky-500" />
                  <span>Mở thư mục</span>
                </button>
                <button
                  onClick={() => {
                    setRenamingFolder(contextMenu.folder);
                    setNewFolderName(contextMenu.folder!.name);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-slate-500" />
                  <span>Đổi tên thư mục</span>
                </button>
                <button
                  onClick={() => {
                    onToggleStarFolder(contextMenu.folder!);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Star
                    className={`w-4 h-4 ${
                      contextMenu.folder.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                    }`}
                  />
                  <span>
                    {contextMenu.folder.isStarred ? 'Xóa khỏi mục có gắn sao' : 'Gắn dấu sao'}
                  </span>
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-700/80" />
                <button
                  onClick={() => {
                    setDeletingFolder(contextMenu.folder);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors font-medium"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  <span>Xóa thư mục</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Rename File Dialog */}
      {renamingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              Đổi tên tệp
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setRenamingFile(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (newFileName.trim()) {
                    onRenameFile(renamingFile, newFileName.trim());
                  }
                  setRenamingFile(null);
                }}
                className="px-4 py-2 rounded-xl text-white bg-sky-600 hover:bg-sky-500 font-semibold"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Folder Dialog */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              Đổi tên thư mục
            </h3>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setRenamingFolder(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (newFolderName.trim() && onRenameFolder) {
                    onRenameFolder(renamingFolder.id, newFolderName.trim());
                  }
                  setRenamingFolder(null);
                }}
                className="px-4 py-2 rounded-xl text-white bg-sky-600 hover:bg-sky-500 font-semibold"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Dialog */}
      {deletingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1.5">
              Xóa thư mục
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Bạn có chắc muốn xóa thư mục <strong className="text-slate-800 dark:text-slate-200 font-semibold">"{deletingFolder.name}"</strong>? Các tệp bên trong sẽ được chuyển về thư mục cấp trên (không bị mất).
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setDeletingFolder(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (onDeleteFolder) {
                    onDeleteFolder(deletingFolder.id);
                  }
                  setDeletingFolder(null);
                }}
                className="px-4 py-2 rounded-xl text-white bg-rose-600 hover:bg-rose-500 font-semibold"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder Dialog */}
      {movingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
              Di chuyển tệp vào thư mục
            </h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto mb-4 text-xs">
              <button
                onClick={() => {
                  onMoveFileToFolder(movingFile, null);
                  setMovingFile(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <Folder className="w-4 h-4 text-sky-500" />
                <span>Thư mục gốc (Trang chủ)</span>
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    onMoveFileToFolder(movingFile, f.id);
                    setMovingFile(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <Folder className="w-4 h-4 text-slate-400" />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setMovingFile(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Batch Delete Confirmation Dialog */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1.5">
              Xác nhận xóa {selectedFileIds.size} tệp đã chọn
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Các tệp này sẽ được xóa vĩnh viễn khỏi Telegram Cloud và danh sách TeleCloud của bạn. Thao tác này không thể hoàn tác.
            </p>

            {/* List of files being deleted preview */}
            <div className="max-h-32 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 mb-4 space-y-1 text-xs border border-slate-100 dark:border-slate-700/60">
              {sortedFiles
                .filter(f => selectedFileIds.has(f.id))
                .slice(0, 5)
                .map(f => (
                  <div key={f.id} className="flex items-center gap-2 truncate text-slate-700 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
              {selectedFileIds.size > 5 && (
                <div className="text-[11px] text-slate-400 italic pl-3.5">
                  + và {selectedFileIds.size - 5} tệp khác...
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => executeBatchDelete()}
                className="px-3.5 py-2 rounded-xl text-white bg-rose-600 hover:bg-rose-500 font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác nhận xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
