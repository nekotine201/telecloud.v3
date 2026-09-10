import React from 'react';
import {
  X,
  ShieldCheck,
  ServerOff,
  Cpu,
  Database,
  Lock,
  Wifi,
  Key,
  CheckCircle2,
  ExternalLink,
  Code2
} from 'lucide-react';
import { Language } from '../types';
import { translations } from '../services/i18n';

interface SecurityModalProps {
  onClose: () => void;
  lang: Language;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({ onClose, lang }) => {
  const t = translations[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-800 animate-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {t.securityTitle}
              </h3>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                100% Client-Side • Trực tiếp Telegram MTProto • Zero Server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-600 dark:text-slate-300 text-xs">
          {/* Architecture Visual Diagram */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
              Mô hình kết nối không máy chủ trung gian (Zero Middleman Architecture)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center pt-2">
              {/* Box 1: Browser */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
                  <Cpu className="w-4 h-4" />
                </div>
                <div className="font-bold text-xs text-white">Trình duyệt của bạn</div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Chạy React 19 + GramJS + IndexedDB trên máy người dùng
                </p>
              </div>

              {/* Arrow Connection */}
              <div className="text-center py-2 flex flex-col items-center">
                <span className="text-[10px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800">
                  WebSockets WSS MTProto
                </span>
                <div className="w-full border-t border-dashed border-emerald-500/40 my-2" />
                <span className="text-[10px] text-slate-400">
                  ⚡ Không qua bất kỳ máy chủ nào
                </span>
              </div>

              {/* Box 2: Telegram Datacenter */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-center space-y-1.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                  <ServerOff className="w-4 h-4" />
                </div>
                <div className="font-bold text-xs text-white">Telegram Datacenters</div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Lưu trữ đám mây không giới hạn (DC1 - DC5) lên đến 2GB/file
                </p>
              </div>
            </div>
          </div>

          {/* Core Guarantees */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ServerOff className="w-4 h-4 text-emerald-500" />
                <span>Không có Backend Server</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                TeleCloud hoạt động hoàn toàn tĩnh (Static Single Page App). Không có máy chủ Node/Python trung gian nào đứng giữa bạn và Telegram để có thể bị hack hay đánh cắp dữ liệu.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Database className="w-4 h-4 text-sky-500" />
                <span>Session lưu tại thiết bị (IndexedDB)</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Khóa phiên xác thực MTProto chỉ tồn tại trong IndexedDB của trình duyệt cục bộ. Bạn đóng tab hoặc xoá cache là phiên biến mất, không ai có thể can thiệp.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Lock className="w-4 h-4 text-amber-500" />
                <span>Lớp mã hoá file AES-256 (Tùy chọn)</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                Hỗ trợ mã hoá AES-GCM 256-bit chuẩn Web Crypto trực tiếp trên trình duyệt trước khi upload. Kể cả Telegram cũng chỉ nhận được chuỗi bytes mã hoá!
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Code2 className="w-4 h-4 text-purple-500" />
                <span>Mã nguồn mở (MIT License)</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                100% mã nguồn mở, cho phép cộng đồng kiểm tra tính toàn vẹn (Code Audit) và tự host trên Vercel, Netlify hoặc Cloudflare Pages mà không mất phí.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm"
          >
            Đã hiểu & Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
};
