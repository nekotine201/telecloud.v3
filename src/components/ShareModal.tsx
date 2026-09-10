import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Link,
  Lock,
  Clock,
  Eye,
  Send
} from 'lucide-react';
import { DriveFile, Language } from '../types';
import { translations } from '../services/i18n';

interface ShareModalProps {
  file: DriveFile | null;
  onClose: () => void;
  lang: Language;
}

export const ShareModal: React.FC<ShareModalProps> = ({ file, onClose, lang }) => {
  if (!file) return null;

  const t = translations[lang];
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTgLink, setCopiedTgLink] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');

  const teledriveLink = `https://teledrive.app/s/${file.id}`;
  const telegramDirectLink = `https://t.me/c/${file.telegramChatId.replace('-100', '')}/${file.telegramMessageId}`;

  const handleCopyLink = (text: string, isTg: boolean) => {
    navigator.clipboard.writeText(text);
    if (isTg) {
      setCopiedTgLink(true);
      setTimeout(() => setCopiedTgLink(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-800 animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.shareTitle}
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-xs">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.shareSub}
          </p>

          {/* Primary TeleCloud Link */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Liên kết TeleCloud trực tiếp:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 truncate">
                {teledriveLink}
              </div>
              <button
                onClick={() => handleCopyLink(teledriveLink, false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? t.copied : t.copyLink}</span>
              </button>
            </div>
          </div>

          {/* Telegram Deep Link */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Send className="w-3 h-3 text-sky-500" />
              <span>{t.directTelegramLink}:</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 truncate">
                {telegramDirectLink}
              </div>
              <button
                onClick={() => handleCopyLink(telegramDirectLink, true)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedTgLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTgLink ? 'Đã chép' : 'Chép'}</span>
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>Đặt mật khẩu bảo vệ liên kết</span>
              </span>
              <input
                type="checkbox"
                checked={isPasswordProtected}
                onChange={e => setIsPasswordProtected(e.target.checked)}
                className="rounded text-sky-500 focus:ring-sky-500"
              />
            </label>

            {isPasswordProtected && (
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mã pin hoặc mật khẩu..."
                className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono"
              />
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
            >
              Hoàn tất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
