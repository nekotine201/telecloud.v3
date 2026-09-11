import React, { useState } from 'react';
import {
  Search,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  HelpCircle,
  Bell,
  Check,
  Send,
  Menu,
  X,
} from 'lucide-react';
import { TelegramUser, Language, FilterState } from '../types';

export const TELEGRAM_LOGO_URL = 'https://i.ibb.co/Q3XgxBmK/logo-telecloud.webp';

interface HeaderProps {
  user: TelegramUser | null;
  filters: FilterState;
  onUpdateFilters: (partial: Partial<FilterState>) => void;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: (lang: Language) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onToggleMobileSidebar?: () => void;
  isMobileSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  filters,
  onUpdateFilters,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onOpenAuth,
  onLogout,
  onToggleMobileSidebar,
  isMobileSidebarOpen = false,
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header
      id="teledrive-header"
      className="h-14 px-3 sm:px-4 md:px-6 flex items-center justify-between border-b transition-colors duration-200 z-30 shrink-0 select-none bg-white border-slate-200 dark:bg-[#0f172a] dark:border-slate-800"
    >
      {/* Left: Mobile Hamburger + Brand Logo */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Toggle */}
        <button
          id="mobile-sidebar-toggle"
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          title="Mở menu điều hướng"
        >
          {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Brand Logo with requested Telegram icon */}
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => onUpdateFilters({ search: '', category: 'all' })}
        >
          <div className="w-8 h-8 relative flex items-center justify-center shrink-0">
            <img
              src="https://i.ibb.co/Q3XgxBmK/logo-telecloud.webp"
              onError={e => {
                (e.target as HTMLImageElement).src = TELEGRAM_LOGO_URL;
              }}
              alt="Telegram Cloud Drive Logo"
              className="w-8 h-8 rounded-full object-contain transition-transform group-hover:scale-105 drop-shadow-xs"
            />
          </div>

          <span className="hidden sm:flex font-bold text-base sm:text-lg text-slate-800 dark:text-white tracking-tight items-center gap-1.5">
            <span>TeleCloud</span>
            <span className="hidden lg:inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              Drive
            </span>
          </span>
        </div>
      </div>

      {/* Centered Search Box - Desktop & Tablets */}
      <div className="hidden sm:flex flex-1 max-w-lg md:max-w-xl mx-3 md:mx-8 relative items-center">
        <div className="w-full flex items-center px-3.5 py-1.5 md:py-2 text-xs md:text-sm rounded-full bg-slate-100 dark:bg-slate-800/80 border border-transparent focus-within:border-sky-500 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all">
          <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
          <input
            id="global-search-input"
            type="text"
            value={filters.search}
            onChange={e => onUpdateFilters({ search: e.target.value })}
            placeholder="Tìm kiếm tệp, hình ảnh, video..."
            className="w-full bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-xs md:text-sm"
          />
          {filters.search && (
            <button
              onClick={() => onUpdateFilters({ search: '' })}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1 ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Right Navigation & Utility Icons */}
      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
        {/* Mobile Search Toggle Button */}
        <button
          onClick={() => setShowMobileSearch(!showMobileSearch)}
          className="sm:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          title="Tìm kiếm"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          id="theme-toggle-button"
          onClick={onToggleTheme}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          title="Chế độ sáng/tối"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Help icon (desktop only) */}
        <button
          onClick={() => setShowHelpModal(true)}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          title="Trợ giúp"
        >
          <HelpCircle className="w-4 h-4 text-slate-500" />
        </button>

        {/* User Account / Avatar */}
        {user ? (
          <div className="relative ml-1">
            <button
              id="user-profile-button"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center rounded-full border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-sky-400 transition-all p-0.5"
            >
              <img
                src={user.avatarUrl || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=100&q=80'}
                alt={user.firstName}
                className="w-7 h-7 rounded-full object-cover"
              />
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-xl border p-3 z-50 bg-white border-slate-200 dark:bg-[#1e293b] dark:border-slate-700">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <img
                    src={user.avatarUrl || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=100&q=80'}
                    alt={user.firstName}
                    className="w-10 h-10 rounded-full object-cover border border-sky-400"
                  />
                  <div className="overflow-hidden">
                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {user.firstName} {user.lastName || ''}
                    </div>
                    <div className="text-xs text-sky-500 font-medium truncate">@{user.username || 'user'}</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Telegram MTProto DC{user.dcId || 5}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Đăng xuất tài khoản</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="ml-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            <span>Đăng nhập</span>
          </button>
        )}
      </div>

      {/* Mobile Search Bar Dropdown */}
      {showMobileSearch && (
        <div className="sm:hidden absolute top-14 left-0 right-0 p-2.5 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 shadow-md z-40 animate-in slide-in-from-top-2">
          <div className="flex items-center px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              autoFocus
              value={filters.search}
              onChange={e => onUpdateFilters({ search: e.target.value })}
              placeholder="Tìm kiếm tệp, hình ảnh..."
              className="w-full bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-xs"
            />
            {filters.search && (
              <button
                onClick={() => onUpdateFilters({ search: '' })}
                className="text-xs text-slate-400 px-1 ml-1"
              >
                ✕
              </button>
            )}
            <button
              onClick={() => setShowMobileSearch(false)}
              className="ml-2 text-xs text-sky-600 dark:text-sky-400 font-medium shrink-0"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-2">
              TeleCloud - Telegram Cloud Storage
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              TeleCloud biến tài khoản Telegram của bạn thành ổ đĩa đám mây không giới hạn dung lượng lưu trữ hoàn toàn miễn phí. Tất cả tệp tin được lưu trực tiếp vào mục <strong>Saved Messages</strong> hoặc kênh riêng tư của bạn.
            </p>
            <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-5">
              <div>✓ Dung lượng: Không giới hạn</div>
              <div>✓ Giới hạn kích thước mỗi file: 2 GB</div>
              <div>✓ Bảo mật: Trực tiếp qua Telegram MTProto</div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 font-medium text-slate-600 dark:text-slate-300">
                Cần thêm trợ giúp? Liên hệ qua Facebook: <a href="https://www.facebook.com/Greenlight.2001/" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">@Quang vu</a>
              </div>
            </div>
            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
