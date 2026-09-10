import React, { useState } from 'react';
import {
  FolderPlus,
  UploadCloud,
  FolderUp,
  Home,
  Clock,
  Star,
  FileText,
  CloudUpload,
  CloudDownload,
  Settings as SettingsIcon,
  Plus,
  Bookmark,
  RefreshCw,
  X,
  ChevronDown,
  Pin,
  Check,
  MessageSquare,
  Users,
  Eye,
  ShieldCheck,
  Sparkles,
  Link,
} from 'lucide-react';
import { NavView, Language, StorageDestinationInfo } from '../types';

interface SidebarProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  destinations?: StorageDestinationInfo[];
  currentDestinationId?: string;
  onSelectDestination?: (destId: string) => void;
  onTogglePinDestination?: (destId: string) => void;
  onRefreshDestinations?: () => void;
  onOpenFileUpload: () => void;
  onOpenFolderUpload: () => void;
  onOpenCreateFolder: () => void;
  onOpenSettings: () => void;
  onSyncCloud: () => void;
  usedStorageFormatted: string;
  filesCount: number;
  lastSyncTime?: string;
  isSyncing?: boolean;
  showRateLimit?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  destinations = [],
  currentDestinationId,
  onSelectDestination,
  onTogglePinDestination,
  onRefreshDestinations,
  onOpenFileUpload,
  onOpenFolderUpload,
  onOpenCreateFolder,
  onOpenSettings,
  onSyncCloud,
  usedStorageFormatted,
  filesCount,
  lastSyncTime = '9/10/2026, 12:21:07 PM',
  isSyncing = false,
  showRateLimit = false,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);

  const activeDestination = destinations.find(d => d.id === currentDestinationId) || destinations[0];
  const pinnedDestinations = destinations.filter(d => d.isPinned && d.type !== 'saved');

  const handleSelectNav = (view: NavView) => {
    onSelectView(view);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const content = (
    <div className="flex flex-col h-full justify-between select-none">
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        {/* "+ Tải lên" Dropdown Button */}
        <div className="relative">
          <button
            id="new-action-dropdown-button"
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs shadow-xs bg-sky-600 hover:bg-sky-500 text-white dark:bg-sky-600 dark:hover:bg-sky-500 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Tải lên & Tạo mới</span>
          </button>

          {showNewMenu && (
            <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl shadow-xl border p-1 z-50 bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenCreateFolder();
                  if (onCloseMobile) onCloseMobile();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors"
              >
                <FolderPlus className="w-4 h-4 text-sky-500" />
                <span>Thư mục mới</span>
              </button>

              <button
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenFileUpload();
                  if (onCloseMobile) onCloseMobile();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors"
              >
                <UploadCloud className="w-4 h-4 text-emerald-500" />
                <span>Tải tệp lên</span>
              </button>

              <button
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenFolderUpload();
                  if (onCloseMobile) onCloseMobile();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors"
              >
                <FolderUp className="w-4 h-4 text-amber-500" />
                <span>Tải thư mục lên</span>
              </button>
            </div>
          )}
        </div>

        {/* Primary Navigation */}
        <div className="space-y-1">
          {/* Saved Messages & Destinations Dropdown Container */}
          <div className="relative">
            <div
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                currentView === 'saved' && (!activeDestination || activeDestination.type === 'saved')
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <button
                onClick={() => {
                  if (onSelectDestination) onSelectDestination('dest-saved');
                  handleSelectNav('saved');
                }}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                title="Mở thư mục lưu trữ Saved Messages"
              >
                <Bookmark className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="truncate">Saved Messages</span>
              </button>

              {/* Toggle Sổ xuống button */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setShowDestinationDropdown(prev => !prev);
                }}
                className={`p-1 rounded-md transition-colors ${
                  showDestinationDropdown
                    ? 'bg-sky-200/60 text-sky-700 dark:bg-sky-800/50 dark:text-sky-300'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                }`}
                title="Sổ xuống danh sách kênh & quyền tải lên"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    showDestinationDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {/* Sổ xuống Dropdown Menu */}
            {showDestinationDropdown && (
              <div className="absolute top-full left-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl shadow-xl border p-2 z-50 bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700 animate-in fade-in zoom-in-95 duration-100 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                  <span>Nơi lưu trữ Telegram</span>
                  {onRefreshDestinations && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRefreshDestinations();
                      }}
                      className="flex items-center gap-1 text-[10px] lowercase text-sky-600 dark:text-sky-400 hover:underline"
                      title="Làm mới danh sách kênh"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Làm mới</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {destinations.map(dest => {
                    const isSelected = dest.id === currentDestinationId;
                    const canUpload = dest.canUpload !== false;

                    return (
                      <div
                        key={dest.id}
                        onClick={() => {
                          if (onSelectDestination) onSelectDestination(dest.id);
                          handleSelectNav('saved');
                          setShowDestinationDropdown(false);
                        }}
                        className={`w-full group cursor-pointer p-2 rounded-xl text-xs flex items-start justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 font-medium border border-sky-200 dark:border-sky-800/60'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-transparent'
                        }`}
                      >
                        {/* Icon & Title */}
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="mt-0.5 shrink-0">
                            {dest.type === 'saved' ? (
                              <div className="w-6 h-6 rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400 flex items-center justify-center">
                                <Bookmark className="w-3.5 h-3.5" />
                              </div>
                            ) : dest.type === 'group' ? (
                              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center justify-center">
                                <Users className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 flex items-center justify-center">
                                <MessageSquare className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-xs text-slate-800 dark:text-slate-100">
                                {dest.name}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                            </div>

                            {/* Subtitle / Subscribers */}
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              {dest.type === 'saved'
                                ? 'Tin nhắn đã lưu (Riêng tư)'
                                : dest.participantsCount
                                ? `${dest.participantsCount} người đăng ký`
                                : dest.description || 'Kênh Telegram Cloud'}
                            </div>

                            {/* Quyền tải lên badge */}
                            <div className="mt-1 flex items-center gap-1">
                              {canUpload ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  <span>Quyền tải lên (Folder chung)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                                  <Eye className="w-2.5 h-2.5" />
                                  <span>Chỉ xem</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Pin Button */}
                        {dest.type !== 'saved' && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (onTogglePinDestination) onTogglePinDestination(dest.id);
                            }}
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              dest.isPinned
                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-60 group-hover:opacity-100'
                            }`}
                            title={dest.isPinned ? 'Bỏ ghim kênh này' : 'Ghim kênh phụ này'}
                          >
                            <Pin
                              className={`w-3.5 h-3.5 ${dest.isPinned ? 'fill-amber-500' : ''}`}
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Kênh phụ đã ghim (Pinned Channels Quick Access) */}
          {pinnedDestinations.length > 0 && (
            <div className="pt-2 pb-1 space-y-1">
              <div className="flex items-center justify-between px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                  <span>Kênh đã ghim</span>
                </span>
                <span className="text-[10px] font-normal">({pinnedDestinations.length})</span>
              </div>

              {pinnedDestinations.map(dest => {
                const isSelected = currentView === 'saved' && currentDestinationId === dest.id;
                const canUpload = dest.canUpload !== false;

                return (
                  <div
                    key={`pinned-${dest.id}`}
                    className={`group/pin flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (onSelectDestination) onSelectDestination(dest.id);
                        handleSelectNav('saved');
                      }}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      title={`${dest.name} - ${canUpload ? 'Có quyền tải lên (Folder chung)' : 'Chỉ xem'}`}
                    >
                      <div className="w-5 h-5 rounded-md bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400 flex items-center justify-center shrink-0">
                        {dest.type === 'group' ? (
                          <Users className="w-3 h-3" />
                        ) : (
                          <MessageSquare className="w-3 h-3" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <div className="truncate text-xs">{dest.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          {canUpload ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Tải lên</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">● Xem</span>
                          )}
                          {dest.participantsCount && (
                            <span>• {dest.participantsCount} mem</span>
                          )}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        if (onTogglePinDestination) onTogglePinDestination(dest.id);
                      }}
                      className="opacity-0 group-hover/pin:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-500 transition-opacity"
                      title="Bỏ ghim kênh này"
                    >
                      <Pin className="w-3 h-3 fill-amber-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => handleSelectNav('all')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              currentView === 'all'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Home className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Trang chủ</span>
          </button>

          <button
            onClick={() => handleSelectNav('recent')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              currentView === 'recent'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Gần đây</span>
          </button>

          <button
            onClick={() => handleSelectNav('starred')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              currentView === 'starred'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Star className="w-4 h-4 text-amber-500" />
            <span>Có gắn dấu sao</span>
          </button>
        </div>

        {/* Documents Item */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-1">
          <button
            onClick={() => handleSelectNav('document')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              currentView === 'document'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Tài liệu</span>
          </button>

          <button
            onClick={() => handleSelectNav('links')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
              currentView === 'links'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Link className="w-4 h-4 text-slate-500" />
            <span>Quản lý liên kết</span>
          </button>
        </div>

        {/* Cloud Sync Section */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Cloud Sync
          </div>

          <button
            onClick={() => {
              onSyncCloud();
              if (onCloseMobile) onCloseMobile();
            }}
            disabled={isSyncing}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-sky-500 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync cloud</span>
          </button>

          <div className="px-3 py-1 text-[10px] text-slate-400">
            Lần sync cuối: {lastSyncTime}
          </div>
        </div>

        {/* Settings Button */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <button
            onClick={() => {
              onOpenSettings();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <SettingsIcon className="w-4 h-4 text-slate-500" />
            <span>Cài đặt</span>
          </button>
        </div>

        {/* Optional Rate Limit bar if enabled in settings */}
        {showRateLimit && (
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Rate Limit MTProto</span>
              <span className="text-emerald-500 font-mono">100% OK</span>
            </div>
            <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="w-1/12 h-full bg-emerald-500 rounded-full"></div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Storage Info */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
        <div className="font-semibold text-slate-800 dark:text-slate-200">
          {usedStorageFormatted} <span className="font-normal text-slate-400">· {filesCount} files</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Telegram Cloud · Không giới hạn
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar: hidden on mobile */}
      <aside
        id="teledrive-sidebar"
        className="hidden md:flex w-60 border-r shrink-0 flex-col justify-between select-none bg-white border-slate-200 dark:bg-[#0f172a] dark:border-slate-800"
      >
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />
          {/* Slide-out Drawer */}
          <div className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="font-bold text-sm text-slate-800 dark:text-white">Menu TeleCloud</span>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {content}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
