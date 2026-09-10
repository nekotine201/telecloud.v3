import React, { useState } from 'react';
import {
  X,
  Settings,
  Sun,
  Moon,
  Laptop,
} from 'lucide-react';
import { AppSettings, Language } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        id="settings-modal"
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#182234] dark:border-slate-700 animate-in zoom-in-95 duration-150 flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Cài đặt
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 dark:text-slate-200 max-h-[80vh]">
          {/* Theme Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-900 dark:text-white block">
              Giao diện
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium ${
                  settings.theme === 'light'
                    ? 'border-sky-500 bg-sky-50/50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Sáng</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium ${
                  settings.theme === 'dark'
                    ? 'border-sky-500 bg-sky-50/50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                <span>Tối</span>
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'system' })}
                className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-medium ${
                  settings.theme === 'system'
                    ? 'border-sky-500 bg-sky-50/50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Laptop className="w-4 h-4 text-slate-500" />
                <span>Hệ thống</span>
              </button>
            </div>
          </div>

          {/* Language Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-900 dark:text-white block">
              Ngôn ngữ
            </label>
            <select
              value={settings.language}
              onChange={e => onUpdateSettings({ language: e.target.value as Language })}
              className="w-full px-3 py-2 text-xs rounded-xl border bg-white border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Rate Limit Toggle */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Hiển thị Rate Limit
              </div>
              <div className="text-[11px] text-slate-400">
                Hiển thị thanh giới hạn request ở sidebar
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showRateLimit}
                onChange={e => onUpdateSettings({ showRateLimit: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {/* Download Location */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Vị trí tải xuống
            </div>
            <div className="text-[11px] text-slate-400">
              Thư mục lưu file khi tải xuống
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={settings.downloadLocation}
                onChange={e => onUpdateSettings({ downloadLocation: e.target.value })}
                className="flex-1 px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-200 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 italic">
                sidebar.browserDefault
              </span>
            </div>
          </div>

          {/* Ask where to save */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Ask where to save
              </div>
              <div className="text-[11px] text-slate-400">
                Ask for save location before each download
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.askWhereToSave}
                onChange={e => onUpdateSettings({ askWhereToSave: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {/* App Info */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-white">
              Thông tin ứng dụng
            </div>
            <div className="text-xs space-y-1.5 text-slate-500 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Phiên bản</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">1.0.0-web</span>
              </div>
              <div className="flex justify-between">
                <span>Platform</span>
                <span className="text-slate-700 dark:text-slate-200">Web (Vercel)</span>
              </div>
              <div className="flex justify-between">
                <span>Storage</span>
                <span className="text-slate-700 dark:text-slate-200">Telegram Cloud</span>
              </div>
              <div className="flex justify-between">
                <span>Max file</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">2 GB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/30">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 active:scale-98 transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
