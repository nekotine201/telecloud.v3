import React, { useState } from 'react';
import { X, HardDrive, Cloud, Users, Send } from 'lucide-react';
import { StorageDestinationInfo, StorageTarget } from '../types';

interface AddDestinationModalProps {
  onClose: () => void;
  onAddDestination: (dest: StorageDestinationInfo) => void;
}

export const AddDestinationModal: React.FC<AddDestinationModalProps> = ({
  onClose,
  onAddDestination,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<StorageTarget>('channel');
  const [chatId, setChatId] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !chatId.trim()) return;

    const newDest: StorageDestinationInfo = {
      id: `dest-${Date.now()}`,
      name: name.trim(),
      type,
      chatId: chatId.trim(),
      description: description.trim() || (type === 'channel' ? 'Kênh Telegram lưu trữ riêng' : 'Nhóm chat Telegram'),
    };

    onAddDestination(newDest);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-800 animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Thêm kênh lưu trữ Telegram
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 text-xs text-sky-700 dark:text-sky-300">
            Bạn có thể tạo một <strong>Channel</strong> hoặc <strong>Group</strong> riêng tư trên Telegram và thêm TeleCloud Bot hoặc tài khoản của bạn vào đó làm ổ cứng lưu trữ.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên kênh / Mô tả ổ đĩa:
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="vd: Kho Phim HD hoặc Dự Án 2026..."
              className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Loại điểm lưu trữ:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('channel')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  type === 'channel'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Cloud className="w-4 h-4" />
                <span>Kênh (Channel)</span>
              </button>
              <button
                type="button"
                onClick={() => setType('group')}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  type === 'group'
                    ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Nhóm (Group)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Telegram Chat ID hoặc Channel Username:
            </label>
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="vd: -10023456789 hoặc @my_backup_cloud"
              className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono"
              required
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
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm"
            >
              Lưu điểm đến
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
