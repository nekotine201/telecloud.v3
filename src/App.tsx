import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Bookmark,
  Home,
  Clock,
  Star,
  Plus,
  Folder,
} from 'lucide-react';
import {
  DriveFile,
  DriveFolder,
  FilterState,
  Language,
  NavView,
  SortField,
  SortOrder,
  StorageDestinationInfo,
  StorageTarget,
  TelegramUser,
  UploadTask,
  ViewMode,
  AppSettings,
  TelegramLink,
} from './types';
import {
  loadFiles,
  saveFiles,
  loadFolders,
  saveFolders,
  loadDestinations,
  saveDestinations,
  loadPinnedDestinationIds,
  savePinnedDestinationIds,
  loadUser,
  saveUser,
  formatFileSize,
} from './services/storage';
import {
  uploadFileToTelegram,
  triggerFileDownload,
  fetchTelegramDialogs,
  fetchTelegramFiles,
  fetchTelegramFilesAndLinks,
  deleteTelegramMessage,
  deleteTelegramMessages,
  verifyTelegramMessages,
  renameTelegramMessage,
  forwardTelegramMessage,
  syncMetadataToTelegram,
  fetchMetadataFromTelegram,
} from './services/telegram';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FileManager } from './components/FileManager';
import { FilePreviewModal } from './components/FilePreviewModal';
import { UploadManager } from './components/UploadManager';
import { AuthModal } from './components/AuthModal';
import { ForwardModal } from './components/ForwardModal';
import { ShareModal } from './components/ShareModal';
import { CreateFolderModal } from './components/CreateFolderModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';

// Helper to recursively extract files and relative directory paths from Drag & Drop DataTransfer
async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<Array<{ file: File; relativePath: string }>> {
  const results: Array<{ file: File; relativePath: string }> = [];

  const items = dataTransfer.items;
  if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
    const traverseEntry = async (entry: any, currentPath = ''): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              results.push({
                file,
                relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
              });
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readEntries = async (): Promise<any[]> => {
          return new Promise(resolve => {
            dirReader.readEntries(
              (entries: any[]) => resolve(entries || []),
              () => resolve([])
            );
          });
        };

        let entries: any[] = [];
        let batch: any[];
        do {
          batch = await readEntries();
          entries = entries.concat(batch);
        } while (batch && batch.length > 0);

        const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        for (const child of entries) {
          await traverseEntry(child, dirPath);
        }
      }
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry?.();
      if (entry) {
        promises.push(traverseEntry(entry));
      }
    }
    await Promise.all(promises);
  }

  // Fallback to dataTransfer.files if items weren't supported or returned nothing
  if (results.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      results.push({
        file,
        relativePath: (file as any).webkitRelativePath || file.name,
      });
    }
  }

  return results;
}

export default function App() {
  // Primary States
  const [user, setUser] = useState<TelegramUser | null>(() => loadUser());
  const [files, setFiles] = useState<DriveFile[]>(() => loadFiles());
  const [links, setLinks] = useState<TelegramLink[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>(() => loadFolders());
  const [pinnedDestinationIds, setPinnedDestinationIds] = useState<string[]>(() => loadPinnedDestinationIds());
  const [destinations, setDestinations] = useState<StorageDestinationInfo[]>(() => {
    const raw = loadDestinations();
    const pinned = loadPinnedDestinationIds();
    return raw.map(d => ({
      ...d,
      isPinned: pinned.includes(d.id),
      canUpload: d.canUpload !== false,
    }));
  });
  const [currentDestinationId, setCurrentDestinationId] = useState<string>(() => destinations[0]?.id || 'dest-saved');
  const [isSyncing, setIsSyncing] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<NavView>('saved');

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category: 'all',
    fileTypeFilter: 'all',
    sizeFilter: 'all',
    dateFilter: 'all',
    storageTarget: 'all',
  });

  const [viewMode, setViewMode] = useState<ViewMode>('details');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // App Settings (Theme, Language, Rate limit, etc.)
  const [settings, setSettings] = useState<AppSettings>(() => ({
    theme: (localStorage.getItem('teledrive_theme_v1') as any) || 'light',
    language: (localStorage.getItem('teledrive_lang_v1') as any) || 'vi',
    showRateLimit: false,
    downloadLocation: 'C:\\Users\\User\\Downloads',
    askWhereToSave: false,
  }));

  // Upload tasks
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modals
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [forwardFile, setForwardFile] = useState<DriveFile | null>(null);
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  // Hidden File Inputs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [isEncryptedNextUpload, setIsEncryptedNextUpload] = useState(false);

  // Toast message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Sync Theme to HTML root class
  useEffect(() => {
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('teledrive_theme_v1', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    localStorage.setItem('teledrive_lang_v1', settings.language);
  }, [settings.language]);

  // Sync state to storage
  useEffect(() => {
    saveFiles(files);
  }, [files]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    saveDestinations(destinations);
  }, [destinations]);

  useEffect(() => {
    saveUser(user);
  }, [user]);

  // Calculate total storage uploaded
  const totalUploadedBytes = files.reduce((sum, f) => sum + f.size, 0);
  const usedStorageFormatted = formatFileSize(totalUploadedBytes);

  // Sync files & dialogs from Telegram MTProto (including deleted files synchronization)
  const handleSyncFiles = async (destChatId?: string, silent = false, overrideSession?: string) => {
    const session = overrideSession || user?.sessionString;
    if (!session) {
      if (!silent) {
        showToast('Vui lòng đăng nhập Telegram để đồng bộ tệp Cloud');
        setShowAuthModal(true);
      }
      return;
    }

    const currentDest = destinations.find(d => d.id === currentDestinationId) || destinations[0];
    const targetChatId = destChatId || (currentDest?.type === 'saved' ? 'me' : currentDest?.chatId || 'me');
    const activeDest = destinations.find(d =>
      (targetChatId === 'me' || targetChatId === 'dest-saved') ? d.type === 'saved' : d.chatId === targetChatId
    ) || currentDest;

    setIsSyncing(true);
    if (!silent) {
      showToast('Đang quét và đồng bộ tệp từ Telegram Cloud...');
    }

    try {
      // 1. Fetch real files and links from Telegram MTProto
      const { files: cloudFiles, links: cloudLinks } = await fetchTelegramFilesAndLinks(session, targetChatId, 1000);
      setLinks(cloudLinks);
      const cloudMsgIds = new Set(
        cloudFiles
          .map(f => f.telegramMessageId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
      );

      const isTargetChat = (f: DriveFile) => {
        if (targetChatId === 'me' || targetChatId === 'dest-saved') {
          if (f.storageTarget === 'channel' || f.storageTarget === 'group') return false;
          return f.telegramChatId === 'me' || f.telegramChatId === 'dest-saved' || f.storageTarget === 'saved' || !f.telegramChatId;
        }
        const cleanTargetId = String(targetChatId).trim().replace(/^-100/, '').replace(/^-/, '');
        const cleanFileChatId = String(f.telegramChatId || '').trim().replace(/^-100/, '').replace(/^-/, '');
        return (
          f.telegramChatId === targetChatId ||
          Boolean(cleanTargetId && cleanFileChatId && cleanTargetId === cleanFileChatId) ||
          Boolean(f.storageName && activeDest?.name && f.storageName.toLowerCase() === activeDest.name.toLowerCase())
        );
      };

      // 2. Identify local files in this chat that might have been deleted on Telegram
      const localFilesThisChat = files.filter(f => isTargetChat(f) && typeof f.telegramMessageId === 'number' && f.telegramMessageId > 0);
      const potentiallyDeletedIds = localFilesThisChat
        .map(f => f.telegramMessageId!)
        .filter(msgId => !cloudMsgIds.has(msgId));

      let confirmedDeletedIds = new Set<number>();

      if (potentiallyDeletedIds.length > 0) {
        // Verify with Telegram directly via verifyTelegramMessages
        try {
          const verification = await verifyTelegramMessages(user.sessionString, targetChatId, potentiallyDeletedIds);
          if (verification.deletedIds && verification.deletedIds.length > 0) {
            confirmedDeletedIds = new Set(verification.deletedIds);
          } else if (cloudFiles.length > 0) {
            // Full chat scan succeeded and didn't include these messages -> deleted on Telegram
            confirmedDeletedIds = new Set(potentiallyDeletedIds);
          }
        } catch {
          if (cloudFiles.length > 0) {
            confirmedDeletedIds = new Set(potentiallyDeletedIds);
          }
        }
      }

      // If user deleted ALL files in this chat on Telegram
      if (cloudFiles.length === 0 && localFilesThisChat.length > 0) {
        try {
          const verification = await verifyTelegramMessages(
            session,
            targetChatId,
            localFilesThisChat.map(f => f.telegramMessageId!)
          );
          if (verification.deletedIds && verification.deletedIds.length > 0) {
            confirmedDeletedIds = new Set(verification.deletedIds);
          }
        } catch {
          // If verification fails or is empty, keep them
        }
      }

      // 3. Update files state: prune deleted files and merge active files
      let deletedCount = 0;
      let newCount = 0;

      setFiles(prev => {
        const otherChatFiles = prev.filter(f => !isTargetChat(f));
        const existingThisChat = prev.filter(f => {
          if (!isTargetChat(f)) return false;
          if (f.telegramMessageId && confirmedDeletedIds.has(f.telegramMessageId)) {
            deletedCount++;
            return false; // Remove deleted from Telegram!
          }
          if (f.isDeleted) {
            return false; // Purge old soft-deleted files as trash is removed
          }
          return true;
        });

        // Map existing by telegramMessageId to retain user's folder assignment, stars, etc.
        const existingMap = new Map<number, DriveFile>();
        existingThisChat.forEach(f => {
          if (f.telegramMessageId) {
            existingMap.set(f.telegramMessageId, f);
          }
        });

        const isSavedChat = targetChatId === 'me' || targetChatId === 'dest-saved';
        const mergedThisChat: DriveFile[] = [];
        for (const cf of cloudFiles) {
          if (cf.telegramMessageId && confirmedDeletedIds.has(cf.telegramMessageId)) {
            continue;
          }

          const existing = cf.telegramMessageId ? existingMap.get(cf.telegramMessageId) : undefined;
          const fileToPush: DriveFile = {
            ...cf,
            telegramChatId: targetChatId,
            storageTarget: isSavedChat ? 'saved' : (activeDest?.type || 'channel'),
            storageName: isSavedChat ? 'Saved Messages (Tin nhắn đã lưu)' : (activeDest?.name || 'Telegram Channel'),
            name: existing?.name || cf.name,
            folderId: existing?.folderId || null,
            isStarred: existing?.isStarred || false,
          };

          if (existing) {
            mergedThisChat.push(fileToPush);
            existingMap.delete(cf.telegramMessageId!);
          } else {
            newCount++;
            mergedThisChat.push(fileToPush);
          }
        }

        // Keep any remaining local files (e.g. not in confirmedDeletedIds)
        const remainingUnmatched = Array.from(existingMap.values()).filter(
          f => !f.telegramMessageId || !confirmedDeletedIds.has(f.telegramMessageId)
        );

        return [...mergedThisChat, ...remainingUnmatched, ...otherChatFiles];
      });

      // Feedback toast
      if (deletedCount > 0 && newCount > 0) {
        showToast(`Đồng bộ Telegram: +${newCount} tệp mới, đã xóa ${deletedCount} tệp đã xóa trên Telegram`);
      } else if (deletedCount > 0) {
        showToast(`Đã đồng bộ: Tự động xóa ${deletedCount} tệp không còn trên Telegram`);
      } else if (newCount > 0) {
        showToast(`Đã đồng bộ thành công: Tìm thấy ${newCount} tệp mới từ Telegram!`);
      } else if (!silent) {
        showToast(`Đã đồng bộ: Tất cả tệp đã khớp hoàn toàn với Telegram!`);
      }

      // 4. Also refresh channels and groups list with permissions & pin state
      try {
        const dialogs = await fetchTelegramDialogs(session);
        const pinned = loadPinnedDestinationIds();
        const channelDests: StorageDestinationInfo[] = dialogs
          .filter(d => d.isChannel || d.isGroup)
          .map(d => ({
            id: `tg-${d.id}`,
            name: d.title,
            type: (d.isChannel ? 'channel' : 'group') as StorageTarget,
            chatId: d.id,
            description: d.isChannel ? 'Kênh Telegram Cloud' : 'Nhóm chat Telegram',
            canUpload: d.canUpload !== false,
            participantsCount: d.participantsCount,
            unreadCount: d.unreadCount,
            isPinned: pinned.includes(`tg-${d.id}`),
          }));

        if (channelDests.length > 0) {
          setDestinations(prev => {
            const savedDest = prev.find(p => p.type === 'saved') || {
              id: 'dest-saved',
              name: 'Saved Messages (Tin nhắn đã lưu)',
              type: 'saved',
              chatId: 'me',
              description: 'Lưu trữ riêng tư chỉ một mình bạn thấy',
              isDefault: true,
              canUpload: true,
            };
            return [savedDest, ...channelDests];
          });
        }
      } catch (e) {
        console.warn('Failed to refresh dialogs during sync:', e);
      }

      // 5. Sync folder structure from Telegram Saved Messages
      try {
        const cloudMeta = await fetchMetadataFromTelegram(session);
        if (cloudMeta && cloudMeta.folders && cloudMeta.folders.length > 0) {
          // If local folders are empty OR it's a manual sync (not silent)
          if (folders.length === 0 || !silent) {
            setFolders(cloudMeta.folders);
            if (!silent) {
              showToast('Đã tải và đồng bộ cấu trúc thư mục từ Telegram!');
            }
          }
        }
      } catch (fErr) {
        console.warn('Failed to sync folders from Telegram during sync:', fErr);
      }
    } catch (err: any) {
      console.error('File sync failed:', err);
      if (!silent) {
        showToast(`Đồng bộ thất bại: ${err.message || 'Lỗi kết nối'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Pin for a destination channel
  const handleTogglePinDestination = (destId: string) => {
    setPinnedDestinationIds(prev => {
      const next = prev.includes(destId) ? prev.filter(id => id !== destId) : [...prev, destId];
      savePinnedDestinationIds(next);
      return next;
    });
    setDestinations(prev =>
      prev.map(d => (d.id === destId ? { ...d, isPinned: !d.isPinned } : d))
    );
    const target = destinations.find(d => d.id === destId);
    if (target) {
      showToast(target.isPinned ? `Đã bỏ ghim "${target.name}"` : `Đã ghim "${target.name}" lên thanh bên`);
    }
  };

  // Select destination from dropdown or pinned list
  const handleSelectDestination = (destId: string) => {
    setCurrentDestinationId(destId);
    setCurrentView('saved');
    setCurrentFolderId(null);
    const selected = destinations.find(d => d.id === destId);
    if (selected && user?.sessionString) {
      handleSyncFiles(selected.type === 'saved' ? 'me' : selected.chatId, false);
    }
  };

  // Manual refresh of destinations
  const handleRefreshDestinations = async () => {
    if (!user?.sessionString) return;
    try {
      showToast('Đang tải danh sách kênh và quyền tải lên...');
      const dialogs = await fetchTelegramDialogs(user.sessionString);
      const pinned = loadPinnedDestinationIds();
      const channelDests: StorageDestinationInfo[] = dialogs
        .filter(d => d.isChannel || d.isGroup)
        .map(d => ({
          id: `tg-${d.id}`,
          name: d.title,
          type: (d.isChannel ? 'channel' : 'group') as StorageTarget,
          chatId: d.id,
          description: d.isChannel ? 'Kênh Telegram Cloud' : 'Nhóm chat Telegram',
          canUpload: d.canUpload !== false,
          participantsCount: d.participantsCount,
          unreadCount: d.unreadCount,
          isPinned: pinned.includes(`tg-${d.id}`),
        }));

      setDestinations([
        {
          id: 'dest-saved',
          name: 'Saved Messages (Tin nhắn đã lưu)',
          type: 'saved',
          chatId: 'me',
          description: 'Lưu trữ riêng tư chỉ một mình bạn thấy',
          isDefault: true,
          canUpload: true,
        },
        ...channelDests,
      ]);
      showToast('Đã làm mới danh sách kênh Telegram thành công!');
    } catch (err: any) {
      showToast(`Không thể tải danh sách kênh: ${err.message || 'Lỗi mạng'}`);
    }
  };

  // Auto-sync files from Telegram when session is loaded
  useEffect(() => {
    if (user?.sessionString) {
      handleSyncFiles(undefined, true);
    }
  }, [user?.sessionString]);

  // Auto-sync when user switches back to this browser tab (e.g. after deleting files in Telegram app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.sessionString) {
        handleSyncFiles(undefined, true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.sessionString, currentDestinationId]);

  // Periodic background check to keep in sync with Telegram
  useEffect(() => {
    if (!user?.sessionString) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleSyncFiles(undefined, true);
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [user?.sessionString, currentDestinationId]);

  // Drag & drop handlers on root container
  const handleDragEnter = (e: React.DragEvent) => {
    // If dragging an internal file to move it into a folder, don't trigger upload overlay
    if (e.dataTransfer.types.includes('application/x-teledrive-file-id')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-teledrive-file-id')) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    setIsDragOver(false);
    if (e.dataTransfer.types.includes('application/x-teledrive-file-id')) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const items = await extractFilesFromDataTransfer(e.dataTransfer);
      if (items.length > 0) {
        handleProcessFiles(items, false);
      }
    } catch (err) {
      console.error('Failed to extract files from drop:', err);
    }
  };

  // Open file upload dialog
  const handleOpenFileUpload = (isEncrypted = false) => {
    setIsEncryptedNextUpload(isEncrypted);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleOpenFolderUpload = () => {
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    }
  };

  // Handle uploaded files (single files, batch files, and full folder hierarchies)
  const handleProcessFiles = async (
    items: Array<File | { file: File; relativePath?: string }>,
    isEncrypted = false
  ) => {
    if (items.length === 0) return;

    const normalizedItems: Array<{ file: File; relativePath?: string }> = items.map(it => {
      if (it instanceof File) {
        return { file: it, relativePath: (it as any).webkitRelativePath || it.name };
      }
      return it;
    });

    const activeDest = destinations.find(d => d.id === currentDestinationId) || destinations[0];
    const FOLDER_COLORS = ['#0284c7', '#0d9488', '#e11d48', '#d97706', '#7c3aed', '#2563eb'];

    // 1. Reconstruct folder hierarchy if uploading folders with relative paths
    const newFolders: DriveFolder[] = [];
    const folderCache = new Map<string, string>(); // `${parentFolderId}:::${folderName}` -> folderId

    folders.forEach(f => {
      if (!f.isDeleted) {
        folderCache.set(`${f.parentId || 'root'}:::${f.name}`, f.id);
      }
    });

    const getOrCreateFolderId = (folderSegments: string[]): string | null => {
      let currentParent = currentFolderId;
      for (const seg of folderSegments) {
        const cleanSeg = seg.trim();
        if (!cleanSeg) continue;
        const key = `${currentParent || 'root'}:::${cleanSeg}`;
        let foundId = folderCache.get(key);
        if (!foundId) {
          foundId = `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const brandNewFolder: DriveFolder = {
            id: foundId,
            name: cleanSeg,
            parentId: currentParent,
            color: FOLDER_COLORS[(folders.length + newFolders.length) % FOLDER_COLORS.length],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isStarred: false,
            isDeleted: false,
          };
          newFolders.push(brandNewFolder);
          folderCache.set(key, foundId);
        }
        currentParent = foundId;
      }
      return currentParent;
    };

    // Determine target folderId for each file
    const fileTargets: Array<{ file: File; relativePath: string; targetFolderId: string | null }> = [];

    for (const item of normalizedItems) {
      const rel = (item.relativePath || item.file.name).replace(/\\/g, '/');
      const parts = rel.split('/').filter(Boolean);

      if (parts.length > 1) {
        const folderSegments = parts.slice(0, -1);
        const targetFolderId = getOrCreateFolderId(folderSegments);
        fileTargets.push({ file: item.file, relativePath: rel, targetFolderId });
      } else {
        fileTargets.push({ file: item.file, relativePath: rel, targetFolderId: currentFolderId });
      }
    }

    if (newFolders.length > 0) {
      const nextFolders = [...newFolders, ...folders];
      setFolders(nextFolders);
      showToast(`Đã tự động tạo ${newFolders.length} thư mục theo cấu trúc tệp`);
      syncFoldersWithCloud(nextFolders);
    }

    // 2. Upload files in sequence with live progress and cancel support
    for (const { file, relativePath, targetFolderId } of fileTargets) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const abortController = new AbortController();

      const newTask: UploadTask = {
        id: taskId,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: isEncrypted ? 'encrypting' : 'uploading',
        speed: '0 MB/s',
        eta: '...',
        targetName: activeDest.name,
        targetType: activeDest.type,
        isEncrypted,
        folderId: targetFolderId,
        folderPath: relativePath,
        abortController,
      };

      setUploadTasks(prev => [newTask, ...prev]);

      try {
        const driveFile = await uploadFileToTelegram(
          file,
          activeDest.name,
          activeDest.type,
          targetFolderId,
          isEncrypted,
          user?.sessionString,
          undefined,
          (progress, speed, eta, stageMessage) => {
            setUploadTasks(prev =>
              prev.map(t =>
                t.id === taskId
                  ? {
                      ...t,
                      progress,
                      speed,
                      eta,
                      stageMessage,
                      status: progress >= 100 ? 'completed' : 'uploading',
                    }
                  : t
              )
            );
          },
          abortController.signal,
          activeDest.type === 'saved' ? 'me' : activeDest.chatId
        );

        const enrichedFile: DriveFile = {
          ...driveFile,
          telegramChatId: activeDest.type === 'saved' ? 'me' : activeDest.chatId,
          storageTarget: activeDest.type,
          storageName: activeDest.name,
        };

        // Add file immediately to state
        setFiles(prev => [enrichedFile, ...prev]);

        if (file.size > 50 * 1024 * 1024) {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.8 },
          });
        }

        showToast(`Tệp "${file.name}" đã tải lên Telegram Cloud thành công!`);
      } catch (err: any) {
        if (abortController.signal.aborted || err?.message?.includes('bị dừng') || err?.message?.includes('hủy')) {
          console.log('Upload cancelled by user');
          setUploadTasks(prev => prev.filter(t => t.id !== taskId));
        } else {
          console.error('Upload failed', err);
          setUploadTasks(prev =>
            prev.map(t => (t.id === taskId ? { ...t, status: 'error', error: err?.message || 'Lỗi tải lên' } : t))
          );
        }
      }
    }
  };

  // Helper to sync folder metadata to Telegram Saved Messages
  const syncFoldersWithCloud = async (foldersToSync: DriveFolder[]) => {
    if (user?.sessionString) {
      try {
        await syncMetadataToTelegram(user.sessionString, foldersToSync);
      } catch (e) {
        console.warn('Failed to sync folders to Telegram Cloud:', e);
      }
    }
  };

  // Create new folder
  const handleCreateFolder = (name: string, color: string) => {
    const newFolder: DriveFolder = {
      id: `folder-${Date.now()}`,
      name,
      parentId: currentFolderId,
      color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isStarred: false,
      isDeleted: false,
    };
    const nextFolders = [newFolder, ...folders];
    setFolders(nextFolders);
    showToast(`Đã tạo thư mục "${name}"`);
    syncFoldersWithCloud(nextFolders);
  };

  // File item actions
  const handleDownloadFile = async (file: DriveFile) => {
    if (user?.sessionString && file.telegramMessageId) {
      try {
        setDownloadingFileId(file.id);
        setDownloadProgress(0);
        showToast(`Đang tải trực tiếp siêu tốc từ Telegram: ${file.name}...`);

        const { downloadFileDirectlyFromTelegram } = await import('./services/clientTelegram');
        
        const blob = await downloadFileDirectlyFromTelegram(
          user.sessionString,
          file.telegramChatId || 'me',
          file.telegramMessageId,
          file.name,
          (pct) => {
            setDownloadProgress(pct);
          }
        );

        // Trigger local download using Blob URL
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        showToast(`✓ Đã tải xong trực tiếp: ${file.name}`);
        return;
      } catch (err: any) {
        console.warn('Direct MTProto download failed, falling back to proxy:', err);
      } finally {
        setDownloadingFileId(null);
      }
    }

    // Proxy-based fallback
    triggerFileDownload(file);
    showToast(`Đang tải về (qua Proxy): ${file.name}`);
  };

  const handleToggleStarFile = (file: DriveFile) => {
    setFiles(prev =>
      prev.map(f => (f.id === file.id ? { ...f, isStarred: !f.isStarred } : f))
    );
  };

  const handleToggleStarFolder = (folder: DriveFolder) => {
    const nextFolders = folders.map(f => (f.id === folder.id ? { ...f, isStarred: !f.isStarred } : f));
    setFolders(nextFolders);
    syncFoldersWithCloud(nextFolders);
  };

  const handleDeleteFile = async (file: DriveFile) => {
    if (user?.sessionString && file.telegramMessageId) {
      deleteTelegramMessage(
        user.sessionString,
        file.telegramChatId || 'me',
        file.telegramMessageId
      );
    }
    setFiles(prev => prev.filter(f => f.id !== file.id));
    showToast(`Đã xoá tệp "${file.name}" khỏi Telegram`);
  };

  const handleDeleteBatchFiles = (filesToDelete: DriveFile[]) => {
    if (!filesToDelete || filesToDelete.length === 0) return;
    const idsToDelete = new Set(filesToDelete.map(f => f.id));

    if (user?.sessionString) {
      const byChat = new Map<string, number[]>();
      filesToDelete.forEach(f => {
        if (f.telegramMessageId) {
          const cId = f.telegramChatId || 'me';
          const list = byChat.get(cId) || [];
          list.push(f.telegramMessageId);
          byChat.set(cId, list);
        }
      });
      byChat.forEach((msgIds, cId) => {
        deleteTelegramMessages(user.sessionString!, cId, msgIds);
      });
    }
    setFiles(prev => prev.filter(f => !idsToDelete.has(f.id)));
    showToast(`Đã xoá ${filesToDelete.length} tệp đã chọn khỏi Telegram`);
  };

  const handleRenameFile = async (file: DriveFile, newName: string) => {
    if (user?.sessionString && file.telegramMessageId) {
      renameTelegramMessage(
        user.sessionString,
        file.telegramChatId || 'me',
        file.telegramMessageId,
        newName
      );
    }
    setFiles(prev =>
      prev.map(f => (f.id === file.id ? { ...f, name: newName, updatedAt: Date.now() } : f))
    );
    showToast(`Đã đổi tên tệp thành "${newName}"`);
  };

  const handleDuplicateFile = (file: DriveFile) => {
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const base = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
    const duplicated: DriveFile = {
      ...file,
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${base} (bản sao)${ext}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setFiles(prev => [duplicated, ...prev]);
    showToast(`Đã tạo bản sao "${duplicated.name}"`);
  };

  const handleMoveFileToFolder = (file: DriveFile, folderId: string | null) => {
    const targetFolder = folderId ? folders.find(f => f.id === folderId) : null;
    const destName = targetFolder ? targetFolder.name : 'Trang chủ';
    setFiles(prev =>
      prev.map(f => (f.id === file.id ? { ...f, folderId, updatedAt: Date.now() } : f))
    );
    showToast(`Đã chuyển "${file.name}" vào thư mục "${destName}"`);
  };

  const handleDeleteFolder = (folderId: string) => {
    const folderToDelete = folders.find(f => f.id === folderId);
    const folderName = folderToDelete ? folderToDelete.name : '';

    // Move files inside this folder up to its parent folder (or root)
    const parentId = folderToDelete?.parentId || null;
    setFiles(prev =>
      prev.map(f => (f.folderId === folderId ? { ...f, folderId: parentId } : f))
    );

    // Delete subfolders as well or move them up
    const nextFolders = folders
      .filter(f => f.id !== folderId)
      .map(f => (f.parentId === folderId ? { ...f, parentId } : f));
    setFolders(nextFolders);

    // If currently inside this folder, navigate back to parent or root
    if (currentFolderId === folderId) {
      setCurrentFolderId(parentId);
    }

    showToast(`Đã xoá thư mục "${folderName}"`);
    syncFoldersWithCloud(nextFolders);
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    const nextFolders = folders.map(f => (f.id === folderId ? { ...f, name: newName, updatedAt: Date.now() } : f));
    setFolders(nextFolders);
    showToast(`Đã đổi tên thư mục thành "${newName}"`);
    syncFoldersWithCloud(nextFolders);
  };

  const handleCancelTask = (taskId: string) => {
    setUploadTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      if (task?.abortController) {
        task.abortController.abort();
      }
      return prev.filter(t => t.id !== taskId);
    });
  };

  const handleClearCompletedTasks = () => {
    setUploadTasks(prev => prev.filter(t => t.status === 'uploading' || t.status === 'encrypting'));
  };

  const handleLogout = () => {
    setUser(null);
    saveUser(null);
    try {
      localStorage.removeItem('teledrive_user_v1');
      localStorage.removeItem('teledrive_files_v1');
      localStorage.removeItem('teledrive_folders_v1');
    } catch {}
    setFiles([]);
    setFolders([]);
    setShowAuthModal(false);
    showToast('Đã đăng xuất tài khoản thành công');
  };

  // Dedicated Login Screen when user is not authenticated
  if (!user) {
    return (
      <div className={`min-h-screen ${settings.theme === 'dark' ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <LoginPage
          onLoginSuccess={async (newUser) => {
            setUser(newUser);
            saveUser(newUser);
            showToast(`Chào mừng ${newUser.firstName}! Đang đồng bộ hóa tệp từ Telegram...`);
            try {
              confetti({ particleCount: 70, spread: 70 });
            } catch {}
            if (newUser.sessionString) {
              handleSyncFiles(undefined, false, newUser.sessionString);
            }
          }}
          lang={settings.language}
          theme={settings.theme}
          onToggleTheme={() => {
            const next = settings.theme === 'dark' ? 'light' : 'dark';
            setSettings(prev => ({ ...prev, theme: next }));
          }}
          onToggleLang={(newLang) => {
            setSettings(prev => ({ ...prev, language: newLang }));
          }}
        />
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900/90 text-white rounded-2xl shadow-xl text-sm font-medium backdrop-blur-sm border border-slate-700/50 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="w-2 h-2 rounded-full bg-sky-400" />
            {toastMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      id="teledrive-root"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-[#0b1120] text-slate-800 dark:text-slate-100 font-sans"
    >
      {/* Hidden file inputs for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            handleProcessFiles(Array.from(e.target.files), isEncryptedNextUpload);
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            const items = (Array.from(e.target.files) as File[]).map((file: File) => ({
              file,
              relativePath: (file as any).webkitRelativePath || file.name,
            }));
            handleProcessFiles(items, false);
          }
        }}
      />

      {/* Top Header */}
      <Header
        user={user}
        filters={filters}
        onUpdateFilters={partial => setFilters(prev => ({ ...prev, ...partial }))}
        theme={settings.theme}
        onToggleTheme={() => {
          const next = settings.theme === 'dark' ? 'light' : 'dark';
          setSettings(prev => ({ ...prev, theme: next }));
        }}
        lang={settings.language}
        onToggleLang={newLang => {
          setSettings(prev => ({ ...prev, language: newLang }));
        }}
        onOpenAuth={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        isMobileSidebarOpen={isMobileSidebarOpen}
      />

      {/* Main Body: Sidebar + File Manager */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentView={currentView}
          onSelectView={view => {
            setCurrentView(view);
            if (view !== 'all') {
              setCurrentFolderId(null);
            }
          }}
          destinations={destinations}
          currentDestinationId={currentDestinationId}
          onSelectDestination={handleSelectDestination}
          onTogglePinDestination={handleTogglePinDestination}
          onRefreshDestinations={handleRefreshDestinations}
          onOpenFileUpload={handleOpenFileUpload}
          onOpenFolderUpload={handleOpenFolderUpload}
          onOpenCreateFolder={() => setShowCreateFolderModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onSyncCloud={() => handleSyncFiles(undefined, false)}
          usedStorageFormatted={usedStorageFormatted}
          filesCount={files.length}
          isSyncing={isSyncing}
          showRateLimit={settings.showRateLimit}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <FileManager
          files={files}
          folders={folders}
          telegramLinks={links}
          currentFolderId={currentFolderId}
          currentView={currentView}
          activeDestination={destinations.find(d => d.id === currentDestinationId) || destinations[0]}
          filters={filters}
          onUpdateFilters={partial => setFilters(prev => ({ ...prev, ...partial }))}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          sortField={sortField}
          sortOrder={sortOrder}
          onChangeSort={field => {
            if (sortField === field) {
              setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
            } else {
              setSortField(field);
              setSortOrder('asc');
            }
          }}
          onNavigateFolder={setCurrentFolderId}
          onOpenFilePreview={setPreviewFile}
          onDownloadFile={handleDownloadFile}
          onForwardFile={setForwardFile}
          onToggleStarFile={handleToggleStarFile}
          onToggleStarFolder={handleToggleStarFolder}
          onDeleteFile={handleDeleteFile}
          onDeleteBatchFiles={handleDeleteBatchFiles}
          onRenameFile={handleRenameFile}
          onDuplicateFile={handleDuplicateFile}
          onMoveFileToFolder={handleMoveFileToFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onOpenFileUpload={handleOpenFileUpload}
          onOpenFolderUpload={handleOpenFolderUpload}
          onOpenCreateFolder={() => setShowCreateFolderModal(true)}
          isDragOver={isDragOver}
          lang={settings.language}
          isSyncing={isSyncing}
          onSync={() => handleSyncFiles()}
        />
      </div>

      {/* Mobile Bottom Navigation Bar (Visible only on mobile screens) */}
      <nav
        id="mobile-bottom-navbar"
        aria-label="Mobile navigation"
        className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md px-3 py-1 flex items-center justify-between z-30 shrink-0 select-none shadow-lg"
      >
        <button
          onClick={() => {
            setCurrentView('saved');
            setCurrentFolderId(null);
          }}
          className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-colors ${
            currentView === 'saved'
              ? 'text-sky-600 dark:text-sky-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Bookmark className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Saved</span>
        </button>

        <button
          onClick={() => {
            setCurrentView('all');
            setCurrentFolderId(null);
          }}
          className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-colors ${
            currentView === 'all'
              ? 'text-sky-600 dark:text-sky-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>

        {/* Central Floating Action Button */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => handleOpenFileUpload(false)}
            className="flex items-center justify-center -mt-5 w-12 h-12 rounded-full bg-gradient-to-tr from-sky-600 to-sky-500 text-white shadow-lg active:scale-95 transition-transform"
            title="Tải tệp lên"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        <button
          onClick={() => {
            setCurrentView('recent');
            setCurrentFolderId(null);
          }}
          className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-colors ${
            currentView === 'recent'
              ? 'text-sky-600 dark:text-sky-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Gần đây</span>
        </button>

        <button
          onClick={() => {
            setCurrentView('starred');
            setCurrentFolderId(null);
          }}
          className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-colors ${
            currentView === 'starred'
              ? 'text-sky-600 dark:text-sky-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Star className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Dấu sao</span>
        </button>
      </nav>

      {/* Upload Manager Floating Bottom-Right Widget */}
      <UploadManager
        tasks={uploadTasks}
        onCancelTask={handleCancelTask}
        onClearCompleted={handleClearCompletedTasks}
        lang={settings.language}
      />

      {/* Modals */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadFile}
          onForward={file => {
            setPreviewFile(null);
            setForwardFile(file);
          }}
          onShare={file => {
            setPreviewFile(null);
            setShareFile(file);
          }}
          onToggleStar={handleToggleStarFile}
          lang={settings.language}
        />
      )}

      {forwardFile && (
        <ForwardModal
          file={forwardFile}
          destinations={destinations}
          onClose={() => setForwardFile(null)}
          onForwardSuccess={async targetName => {
            if (user?.sessionString && forwardFile.telegramMessageId) {
              const targetDest = destinations.find(d => d.name === targetName);
              const toChatId = targetDest?.chatId || 'me';
              await forwardTelegramMessage(
                user.sessionString,
                forwardFile.telegramChatId || 'me',
                toChatId,
                forwardFile.telegramMessageId
              );
            }
            showToast(`Đã chuyển tiếp "${forwardFile.name}" sang ${targetName}`);
          }}
          lang={settings.language}
        />
      )}

      {shareFile && (
        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
          lang={settings.language}
        />
      )}

      {showAuthModal && (
        <AuthModal
          user={user}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={async (newUser) => {
            setUser(newUser);
            setShowAuthModal(false);
            showToast(`Chào mừng ${newUser.firstName}! Đang đồng bộ hóa tệp từ Telegram...`);
            confetti({ particleCount: 70, spread: 70 });

            if (newUser.sessionString) {
              handleSyncFiles(undefined, false, newUser.sessionString);
            }
          }}
          onLogout={handleLogout}
          lang={settings.language}
        />
      )}

      {showCreateFolderModal && (
        <CreateFolderModal
          onClose={() => setShowCreateFolderModal(false)}
          onCreateFolder={handleCreateFolder}
          lang={settings.language}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          settings={settings}
          onUpdateSettings={partial => setSettings(prev => ({ ...prev, ...partial }))}
        />
      )}

      {/* Floating Download Progress Panel */}
      {downloadingFileId && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-200/80 backdrop-blur-md w-72 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 truncate max-w-[180px]">
              {files.find(f => f.id === downloadingFileId)?.name || 'Đang tải tệp...'}
            </span>
            <span className="text-2xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
              {downloadProgress}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-sky-500 h-full rounded-full transition-all duration-150 ease-out" 
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <span className="text-2xs text-slate-500">
            Đang tải trực tiếp Telegram DC (Bảo mật & Siêu tốc)
          </span>
        </div>
      )}

      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 py-2.5 px-4 rounded-2xl bg-slate-900/90 text-white text-xs font-semibold shadow-xl border border-slate-700/80 backdrop-blur-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
