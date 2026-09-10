import React, { useState } from 'react';
import {
  X,
  Send,
  CheckCircle2,
  HardDrive,
  Users,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { DriveFile, StorageDestinationInfo, Language } from '../types';
import { translations } from '../services/i18n';

interface ForwardModalProps {
  file: DriveFile | null;
  destinations: StorageDestinationInfo[];
  onClose: () => void;
  onForwardSuccess: (targetName: string) => void;
  lang: Language;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  file,
  destinations,
  onClose,
  onForwardSuccess,
  lang,
}) => {
  if (!file) return null;

  const t = translations[lang];
  const [selectedDestId, setSelectedDestId] = useState<string>(destinations[0]?.id || '');
  const [customChat, setCustomChat] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [isForwarding, setIsForwarding] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleForward = (e: React.FormEvent) => {
    e.preventDefault();
    setIsForwarding(true);

    const targetDest = destinations.find(d => d.id === selectedDestId);
    const targetName = customChat.trim() ? customChat : (targetDest?.name || 'Telegram Chat');

    setTimeout(() => {
      setIsForwarding(false);
      setSuccessMsg(`Đã chuyển tiếp file "${file.name}" đến "${targetName}" thành công qua MTProto!`);
      setTimeout(() => {
        onForwardSuccess(targetName);
        onClose();
      }, 1200);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-800 animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {t.forwardTitle}
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

        {successMsg ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleForward} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t.selectRecipient}
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {destinations.map(dest => (
                  <label
                    key={dest.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDestId === dest.id
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="forwardTarget"
                      value={dest.id}
                      checked={selectedDestId === dest.id}
                      onChange={() => setSelectedDestId(dest.id)}
                      className="text-sky-500 focus:ring-sky-500"
                    />
                    <div className="truncate flex-1">
                      <div className="text-xs font-semibold truncate">{dest.name}</div>
                      <div className="text-[10px] text-slate-400">{dest.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Hoặc nhập Chat ID / @username khác:
              </label>
              <input
                type="text"
                value={customChat}
                onChange={e => setCustomChat(e.target.value)}
                placeholder="vd: @my_telegram_friend hoặc -100xxxxxxxx"
                className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t.addComment}
              </label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Gửi kèm ghi chú hoặc mô tả tệp tin..."
                rows={2}
                className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={isForwarding}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all flex items-center gap-2 shadow-sm shadow-sky-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isForwarding ? 'Đang chuyển tiếp...' : t.forwardBtn}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
