import React, { useState } from 'react';
import {
  UploadCloud,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Lock,
  Folder,
  Clock,
  Zap
} from 'lucide-react';
import { UploadTask, Language } from '../types';
import { formatFileSize } from '../services/storage';
import { translations } from '../services/i18n';

interface UploadManagerProps {
  tasks: UploadTask[];
  onCancelTask: (taskId: string) => void;
  onClearCompleted: () => void;
  lang: Language;
}

export const UploadManager: React.FC<UploadManagerProps> = ({
  tasks,
  onCancelTask,
  onClearCompleted,
  lang,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const t = translations[lang];

  if (tasks.length === 0) return null;

  const activeTasks = tasks.filter(t => t.status === 'uploading' || t.status === 'encrypting');
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  return (
    <div
      id="upload-manager-floating"
      className="fixed bottom-4 right-4 z-40 w-96 max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl border overflow-hidden bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-700 animate-in slide-in-from-bottom-5 duration-200"
    >
      {/* Header bar */}
      <div
        onClick={() => setIsMinimized(!isMinimized)}
        className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400">
            <UploadCloud className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span>{t.uploadingTitle}</span>
              {activeTasks.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              {activeTasks.length > 0
                ? `${activeTasks.length} ${t.filesRemaining}`
                : `${completedCount} hoàn tất${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={e => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white"
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              onClearCompleted();
            }}
            className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white"
            title="Đóng / Xóa đã xong"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Task List */}
      {!isMinimized && (
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2 space-y-1">
          {tasks.map(task => {
            const loadedBytes = Math.round((task.progress / 100) * task.size);
            const folderPart = task.folderPath && task.folderPath.includes('/')
              ? task.folderPath.substring(0, task.folderPath.lastIndexOf('/'))
              : null;

            return (
              <div key={task.id} className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate flex-1 min-w-0">
                    {folderPart && (
                      <div className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 font-medium truncate mb-0.5">
                        <Folder className="w-3 h-3 shrink-0" />
                        <span className="truncate">{folderPart}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 truncate">
                      {task.isEncrypted && (
                        <Lock className="w-3 h-3 text-amber-500 shrink-0" title="Mã hoá AES-256" />
                      )}
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {task.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>{formatFileSize(loadedBytes)} / {formatFileSize(task.size)}</span>
                      <span>•</span>
                      {task.stageMessage ? (
                        <span className="text-sky-600 dark:text-sky-400 font-medium truncate">{task.stageMessage}</span>
                      ) : (
                        <span>{task.targetName}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : task.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-500" title={task.error} />
                    ) : (
                      <button
                        onClick={() => onCancelTask(task.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                        title="Huỷ tải lên"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {task.status !== 'completed' && task.status !== 'error' && (
                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 transition-all duration-200 rounded-full"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-sky-500" />
                        <span>{task.speed}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{task.eta}</span>
                      </div>
                      <span className="font-bold text-sky-500">{task.progress}%</span>
                    </div>
                  </div>
                )}

                {task.status === 'completed' && (
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <span>✓ Đã lưu vào Saved Messages của Telegram</span>
                  </div>
                )}

                {task.status === 'error' && (
                  <div className="text-[10px] text-rose-500 font-medium truncate flex items-center gap-1">
                    <span>{task.error || 'Lỗi khi tải tệp lên'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
