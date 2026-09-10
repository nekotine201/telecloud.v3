import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Smartphone,
  QrCode,
  Key,
  ShieldCheck,
  Send,
  RefreshCw,
  CheckCircle2,
  Lock,
  ExternalLink,
  Bot,
  User,
  LogOut,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Settings2,
  Check,
  Phone,
  MessageSquareCode,
  ArrowRight
} from 'lucide-react';
import { TelegramUser, Language } from '../types';
import {
  initRealTelegramQr,
  pollRealTelegramQr,
  submit2faPassword,
  cancelRealTelegramQr,
  sendPhoneCode,
  verifyPhoneCode,
} from '../services/telegram';
import { translations } from '../services/i18n';

interface AuthModalProps {
  user: TelegramUser | null;
  onClose: () => void;
  onLoginSuccess: (user: TelegramUser) => void;
  onLogout: () => void;
  lang: Language;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  user,
  onClose,
  onLoginSuccess,
  onLogout,
  lang,
}) => {
  const t = translations[lang];
  const [authTab, setAuthTab] = useState<'qr' | 'phone' | 'bot'>('qr');

  // Real QR MTProto States
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [qrDeepLink, setQrDeepLink] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(30);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 2FA state
  const [is2faRequired, setIs2faRequired] = useState<boolean>(false);
  const [twoFactorPassword, setTwoFactorPassword] = useState<string>('');
  const [isSubmitting2fa, setIsSubmitting2fa] = useState<boolean>(false);

  // Phone number login states
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<'enter_phone' | 'enter_code'>('enter_phone');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isCodeViaApp, setIsCodeViaApp] = useState<boolean>(true);
  const [isSendingCode, setIsSendingCode] = useState<boolean>(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState<boolean>(false);
  const [phone2faNeeded, setPhone2faNeeded] = useState<boolean>(false);

  // Custom API ID / Hash
  const [showAdvancedApi, setShowAdvancedApi] = useState<boolean>(false);
  const [customApiId, setCustomApiId] = useState<string>('');
  const [customApiHash, setCustomApiHash] = useState<string>('');

  // Bot Token state
  const [botToken, setBotToken] = useState<string>('');

  // Polling interval ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Initialize Real QR on mount or on tab switch
  const startRealQrFlow = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIs2faRequired(false);

    // Clean up previous polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (currentSessionIdRef.current) {
      cancelRealTelegramQr(currentSessionIdRef.current);
    }

    try {
      const apiIdNum = customApiId.trim() ? Number(customApiId.trim()) : undefined;
      const apiHashStr = customApiHash.trim() ? customApiHash.trim() : undefined;

      const result = await initRealTelegramQr(apiIdNum, apiHashStr);
      setSessionId(result.sessionId);
      currentSessionIdRef.current = result.sessionId;
      setQrCodeUrl(result.qrDataUrl);
      setQrDeepLink(result.qrUrl);
      setCountdown(result.expiresInSeconds || 30);

      // Start continuous non-destructive polling
      startPolling(result.sessionId);
    } catch (err: any) {
      const errMsg = err?.message || '';
      console.warn('Telegram MTProto QR init status:', errMsg);
      if (errMsg.includes('TIMEOUT') || errMsg.includes('trễ') || errMsg.includes('timeout')) {
        setErrorMessage('Kết nối máy chủ Telegram bị trễ, đang tự động kết nối lại...');
        setTimeout(() => {
          startRealQrFlow();
        }, 2000);
      } else {
        setErrorMessage(errMsg || 'Không thể kết nối đến máy chủ Telegram MTProto. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = (sid: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusData = await pollRealTelegramQr(sid);

        if (statusData.status === 'success' && statusData.user) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          const loggedInUser: TelegramUser = {
            id: statusData.user.id,
            firstName: statusData.user.firstName,
            lastName: statusData.user.lastName,
            username: statusData.user.username,
            phone: statusData.user.phone,
            avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${statusData.user.id}`,
            isPremium: true,
            dcId: 5,
            authDate: Date.now(),
            sessionString: statusData.sessionString,
            sessionToken: statusData.sessionString,
          };

          onLoginSuccess(loggedInUser);
          return;
        }

        if (statusData.status === '2fa_required') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIs2faRequired(true);
          return;
        }

        if (statusData.status === 'expired') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          startRealQrFlow();
          return;
        }

        if (statusData.status === 'error') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          const rawErr = statusData.error || '';
          if (rawErr.includes('TIMEOUT') || rawErr.includes('hết hạn') || rawErr.includes('timeout')) {
            startRealQrFlow();
            return;
          }
          setErrorMessage(rawErr || 'Xảy ra lỗi trong quá trình quét mã.');
          return;
        }

        // Still pending: check if QR updated by GramJS background loop or countdown
        if (statusData.qrDataUrl && statusData.qrDataUrl !== qrCodeUrl) {
          setQrCodeUrl(statusData.qrDataUrl);
        }
        if (statusData.qrUrl) {
          setQrDeepLink(statusData.qrUrl);
        }
        if (statusData.expiresInSeconds !== undefined) {
          setCountdown(statusData.expiresInSeconds);
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 1500);
  };

  useEffect(() => {
    if (!user && authTab === 'qr') {
      startRealQrFlow();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (currentSessionIdRef.current) {
        cancelRealTelegramQr(currentSessionIdRef.current);
      }
    };
  }, [user, authTab]);

  // Countdown timer in UI
  useEffect(() => {
    if (user || !qrCodeUrl || is2faRequired) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [user, qrCodeUrl, is2faRequired]);

  // Handle 2FA submission for QR
  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !twoFactorPassword) return;

    setIsSubmitting2fa(true);
    setErrorMessage(null);
    try {
      const result = await submit2faPassword(sessionId, twoFactorPassword);
      if (result.success && result.user) {
        const loggedInUser: TelegramUser = {
          id: result.user.id,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          username: result.user.username,
          phone: result.user.phone,
          avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${result.user.id}`,
          isPremium: true,
          dcId: 5,
          authDate: Date.now(),
          sessionString: result.sessionString,
          sessionToken: result.sessionString,
        };
        onLoginSuccess(loggedInUser);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Mật khẩu xác thực 2 bước không chính xác');
    } finally {
      setIsSubmitting2fa(false);
    }
  };

  // Handle phone number submission
  const handleSendPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsSendingCode(true);
    setErrorMessage(null);
    try {
      const apiIdNum = customApiId.trim() ? Number(customApiId.trim()) : undefined;
      const apiHashStr = customApiHash.trim() ? customApiHash.trim() : undefined;

      const result = await sendPhoneCode(phoneNumber.trim(), apiIdNum, apiHashStr);
      setPhoneSessionId(result.sessionId);
      setIsCodeViaApp(result.isCodeViaApp);
      setPhoneStep('enter_code');
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể gửi mã xác nhận. Vui lòng kiểm tra lại số điện thoại (ví dụ: +84987654321).');
    } finally {
      setIsSendingCode(false);
    }
  };

  // Handle verification code submission
  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneSessionId || !verificationCode.trim()) return;

    setIsVerifyingCode(true);
    setErrorMessage(null);
    try {
      const result = await verifyPhoneCode(
        phoneSessionId,
        verificationCode.trim(),
        twoFactorPassword ? twoFactorPassword : undefined
      );

      if (result.needs2fa) {
        setPhone2faNeeded(true);
        setIsVerifyingCode(false);
        return;
      }

      if (result.success && result.user) {
        const loggedInUser: TelegramUser = {
          id: result.user.id,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          username: result.user.username,
          phone: result.user.phone,
          avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${result.user.id}`,
          isPremium: true,
          dcId: 5,
          authDate: Date.now(),
          sessionString: result.sessionString,
          sessionToken: result.sessionString,
        };
        onLoginSuccess(loggedInUser);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Mã xác nhận hoặc mật khẩu 2FA không chính xác');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  // Bot login
  const handleBotLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim()) return;
    const botUser: TelegramUser = {
      id: 'bot-' + Date.now().toString().slice(-6),
      firstName: 'TeleCloud Storage Bot',
      username: 'telecloud_cloud_bot',
      avatarUrl: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?auto=format&fit=crop&w=200&q=80',
      isPremium: false,
      dcId: 5,
      authDate: Date.now(),
      sessionToken: botToken,
    };
    onLoginSuccess(botUser);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border bg-white border-slate-200 dark:bg-[#111928] dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-sm">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{user ? t.accountConnected : 'Đăng nhập Telegram MTProto'}</span>
                {!user && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    MTProto Live
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">Kết nối trực tiếp Telegram Datacenters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {user ? (
            /* Connected Profile View */
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
                <img
                  src={user.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`}
                  alt={user.firstName}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-sky-500 shadow-md"
                />
                <div>
                  <div className="font-bold text-base text-slate-900 dark:text-white">
                    {user.firstName} {user.lastName || ''}
                  </div>
                  {user.username && (
                    <div className="text-xs text-sky-500 font-medium">@{user.username}</div>
                  )}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    User ID: <span className="font-mono">{user.id}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Trạng thái kết nối:</span>
                  <span className="text-emerald-500 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đã xác thực Telegram MTProto
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Bộ nhớ đám mây:</span>
                  <span className="font-semibold text-sky-500">Không giới hạn (Unlimited Storage)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Vị trí lưu trữ mặc định:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Tin nhắn đã lưu (Saved Messages)</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                >
                  Đóng
                </button>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 flex items-center gap-1.5 shadow-sm"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.logout}</span>
                </button>
              </div>
            </div>
          ) : is2faRequired ? (
            /* 2FA Password Verification Screen */
            <form onSubmit={handleVerify2fa} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Xác thực 2 bước (2FA)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tài khoản Telegram của bạn đã bật bảo mật mật khẩu đám mây (Cloud Password). Vui lòng nhập mật khẩu để hoàn tất:
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <input
                  type="password"
                  autoFocus
                  value={twoFactorPassword}
                  onChange={e => setTwoFactorPassword(e.target.value)}
                  placeholder="Nhập mật khẩu 2FA của Telegram..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIs2faRequired(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting2fa || !twoFactorPassword}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isSubmitting2fa ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang kiểm tra...</span>
                    </>
                  ) : (
                    <span>Xác nhận mật khẩu</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Login Methods */
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setAuthTab('qr')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    authTab === 'qr'
                      ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Quét mã QR</span>
                </button>
                <button
                  onClick={() => setAuthTab('phone')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    authTab === 'phone'
                      ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Số điện thoại</span>
                </button>
                <button
                  onClick={() => setAuthTab('bot')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    authTab === 'bot'
                      ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Bot Token</span>
                </button>
              </div>

              {/* REAL MTProto QR Tab */}
              {authTab === 'qr' && (
                <div className="flex flex-col items-center text-center space-y-3.5">
                  {errorMessage && (
                    <div className="w-full p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 text-left">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <div>{errorMessage}</div>
                        <div className="text-[11px] text-rose-500 font-medium">
                          Mẹo: Bạn cũng có thể chuyển sang tab <strong>"Số điện thoại"</strong> ở trên để nhận mã trực tiếp qua Telegram mà không cần quét camera.
                        </div>
                      </div>
                      <button
                        onClick={startRealQrFlow}
                        className="px-2 py-1 rounded bg-rose-600 text-white font-semibold text-[10px] shrink-0"
                      >
                        Thử lại
                      </button>
                    </div>
                  )}

                  {/* QR Image Frame */}
                  <div className="relative p-3 rounded-2xl bg-white border-2 border-slate-200 shadow-md">
                    {isLoading ? (
                      <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
                        <span className="text-xs font-medium">Đang kết nối máy chủ Telegram...</span>
                      </div>
                    ) : qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="Telegram MTProto Login QR Code"
                        className="w-56 h-56 rounded-lg select-none"
                      />
                    ) : (
                      <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                    )}

                    {/* Telegram Icon in Center of QR */}
                    {!isLoading && qrCodeUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-11 h-11 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg border-2 border-white">
                          <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Real-time Status Badge */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      Đang đợi quét... (Làm mới sau: <strong className="text-sky-500">{countdown}s</strong>)
                    </span>
                    <button
                      onClick={startRealQrFlow}
                      disabled={isLoading}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-sky-500 transition-colors"
                      title="Làm mới mã ngay"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* 3 Steps instructions */}
                  <div className="text-left w-full space-y-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>Mở ứng dụng <strong>Telegram</strong> trên điện thoại</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>Vào <strong>Cài đặt</strong> (Settings) &gt; <strong>Thiết bị</strong> (Devices)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>Chọn <strong>Liên kết thiết bị</strong> (Link Desktop Device) và quét mã trên</span>
                    </div>
                  </div>

                  {/* Alternative quick link */}
                  <div className="w-full pt-1">
                    <button
                      type="button"
                      onClick={() => setAuthTab('phone')}
                      className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Phone className="w-3.5 h-3.5 text-sky-500" />
                      <span>Không quét được camera? Đăng nhập bằng Số điện thoại</span>
                    </button>
                  </div>

                  {/* Deep link direct open button */}
                  {qrDeepLink && (
                    <a
                      href={qrDeepLink}
                      className="w-full py-2 px-3 rounded-xl text-[11px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-sky-200/80 dark:border-sky-800/80 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Mở liên kết trực tiếp trên Telegram Desktop</span>
                    </a>
                  )}

                  {/* Advanced API ID / Hash Configuration */}
                  <div className="w-full pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 mx-auto"
                    >
                      <Settings2 className="w-3 h-3" />
                      <span>Sử dụng API ID & Hash riêng (my.telegram.org)</span>
                      {showAdvancedApi ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {showAdvancedApi && (
                      <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-left space-y-2.5 text-xs animate-in fade-in duration-150">
                        <p className="text-[11px] text-slate-400">
                          Mặc định sử dụng API chính thức. Bạn có thể nhập API riêng của mình từ my.telegram.org:
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">API ID:</label>
                            <input
                              type="text"
                              value={customApiId}
                              onChange={e => setCustomApiId(e.target.value)}
                              placeholder="2040"
                              className="w-full px-2.5 py-1.5 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">API Hash:</label>
                            <input
                              type="text"
                              value={customApiHash}
                              onChange={e => setCustomApiHash(e.target.value)}
                              placeholder="b18441a1ff..."
                              className="w-full px-2.5 py-1.5 rounded-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={startRealQrFlow}
                          className="w-full py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600"
                        >
                          Áp dụng & Tạo lại mã QR
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Phone Number Login Tab */}
              {authTab === 'phone' && (
                <div className="space-y-4">
                  {errorMessage && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {phoneStep === 'enter_phone' ? (
                    <form onSubmit={handleSendPhoneCode} className="space-y-3.5">
                      <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 text-xs text-sky-700 dark:text-sky-300 flex items-start gap-2">
                        <MessageSquareCode className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          Telegram sẽ gửi mã xác nhận 5 chữ số trực tiếp vào tin nhắn Telegram trên điện thoại của bạn.
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Số điện thoại (Kèm mã quốc gia):
                        </label>
                        <input
                          type="tel"
                          autoFocus
                          value={phoneNumber}
                          onChange={e => setPhoneNumber(e.target.value)}
                          placeholder="+84 987 654 321"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                          required
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Ví dụ: +84987654321 cho Việt Nam (+84)
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={isSendingCode || !phoneNumber.trim()}
                        className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        {isSendingCode ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang gửi mã...</span>
                          </>
                        ) : (
                          <>
                            <span>Gửi mã xác nhận</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyPhoneCode} className="space-y-3.5">
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          {isCodeViaApp
                            ? `Mã xác nhận đã gửi đến ứng dụng Telegram của số ${phoneNumber}. Vui lòng mở Telegram để xem mã.`
                            : `Mã xác nhận đã gửi qua tin nhắn SMS tới ${phoneNumber}.`}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Mã xác nhận (5 chữ số):
                        </label>
                        <input
                          type="text"
                          autoFocus
                          value={verificationCode}
                          onChange={e => setVerificationCode(e.target.value)}
                          placeholder="12345"
                          className="w-full px-3.5 py-2.5 text-center text-base tracking-widest font-mono rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                          maxLength={6}
                          required
                        />
                      </div>

                      {phone2faNeeded && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Mật khẩu đám mây (2FA Password):
                          </label>
                          <input
                            type="password"
                            value={twoFactorPassword}
                            onChange={e => setTwoFactorPassword(e.target.value)}
                            placeholder="Nhập mật khẩu 2FA..."
                            className="w-full px-3.5 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                            required
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPhoneStep('enter_phone')}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                        >
                          Đổi số điện thoại
                        </button>
                        <button
                          type="submit"
                          disabled={isVerifyingCode || !verificationCode.trim()}
                          className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          {isVerifyingCode ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang xác nhận...</span>
                            </>
                          ) : (
                            <span>Đăng nhập ngay</span>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Bot Token Login Tab */}
              {authTab === 'bot' && (
                <form onSubmit={handleBotLogin} className="space-y-4">
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 text-xs text-sky-700 dark:text-sky-300">
                    Bạn có thể tạo bot lưu trữ riêng trên <strong>@BotFather</strong> và dán Bot Token vào đây để làm kho chứa dữ liệu.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Telegram Bot Token:
                    </label>
                    <input
                      type="text"
                      value={botToken}
                      onChange={e => setBotToken(e.target.value)}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz..."
                      className="w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 font-mono"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all shadow-sm"
                  >
                    Đăng nhập bằng Bot
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
