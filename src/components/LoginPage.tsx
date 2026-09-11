import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  ShieldCheck,
  RefreshCw,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Settings2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Globe,
  Sparkles,
  Layers,
  ArrowRight,
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

interface LoginPageProps {
  onLoginSuccess: (user: TelegramUser) => void;
  lang: Language;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  onToggleLang: (newLang: Language) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  lang,
  theme,
  onToggleTheme,
  onToggleLang,
}) => {
  const t = translations[lang];
  const [authTab, setAuthTab] = useState<'qr' | 'phone'>('qr');

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
  const [show2faPassword, setShow2faPassword] = useState<boolean>(false);
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
  const [phone2faPassword, setPhone2faPassword] = useState<string>('');

  // Custom API ID / Hash
  const [showAdvancedApi, setShowAdvancedApi] = useState<boolean>(false);
  const [customApiId, setCustomApiId] = useState<string>('');
  const [customApiHash, setCustomApiHash] = useState<string>('');

  // Polling interval ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Initialize Real QR on mount or on tab switch
  const startRealQrFlow = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIs2faRequired(false);
    setTwoFactorPassword('');

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
        setErrorMessage(lang === 'vi' ? 'Kết nối máy chủ Telegram bị trễ, đang tự động kết nối lại...' : 'Connection slow, retrying automatically...');
        setTimeout(() => {
          startRealQrFlow();
        }, 2000);
      } else {
        setErrorMessage(errMsg || (lang === 'vi' ? 'Không thể kết nối đến máy chủ Telegram MTProto. Vui lòng thử lại.' : 'Failed to connect to Telegram MTProto servers. Please retry.'));
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
          setErrorMessage(rawErr || (lang === 'vi' ? 'Xảy ra lỗi trong quá trình quét mã.' : 'An error occurred during QR scan.'));
          return;
        }

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
    if (authTab === 'qr') {
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
  }, [authTab]);

  // Countdown timer in UI
  useEffect(() => {
    if (!qrCodeUrl || is2faRequired) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrCodeUrl, is2faRequired]);

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
      setErrorMessage(err.message || (lang === 'vi' ? 'Mật khẩu xác thực 2 bước không chính xác' : 'Invalid 2FA password'));
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
      setErrorMessage(err.message || (lang === 'vi' ? 'Không thể gửi mã xác nhận. Vui lòng kiểm tra lại số điện thoại.' : 'Failed to send confirmation code. Please check phone number.'));
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
        phone2faNeeded ? phone2faPassword : undefined
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
          phone: result.user.phone || phoneNumber,
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
      setErrorMessage(err.message || (lang === 'vi' ? 'Mã xác nhận hoặc mật khẩu 2FA không chính xác' : 'Invalid code or 2FA password'));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-slate-100 to-sky-50 dark:from-[#090d16] dark:via-[#0f172a] dark:to-[#071328] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md bg-white/70 dark:bg-[#0f172a]/70 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-15 h-10 overflow-hidden shrink-0">
            <img src="https://i.ibb.co/Q3XgxBmK/logo-telecloud.webp" alt="TeleCloud Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-base sm:text-lg tracking-tight text-slate-900 dark:text-white">TeleCloud</span>
              <span className="text-[7px] sm:text-[10px] uppercase font-bold tracking-wider px-1 sm:px-2 py-0 sm:py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                unlimited
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'vi' ? 'Created by Quang vu' : 'Created by Quang vu'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* MTProto Status Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Telegram MTProto DC5</span>
          </div>

          {/* Theme Toggle */}
          <button
            id="login-theme-toggle"
            onClick={onToggleTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Language Switch */}
          <button
            id="login-lang-toggle"
            onClick={() => onToggleLang(lang === 'vi' ? 'en' : 'vi')}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'vi' ? 'EN' : 'VI'}</span>
          </button>
        </div>
      </header>

      {/* Main Login Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-white/95 dark:bg-[#111927]/95 border border-slate-200 dark:border-slate-800/90 rounded-3xl shadow-2xl shadow-slate-300/40 dark:shadow-black/60 overflow-hidden backdrop-blur-xl">
            {/* Header / Intro */}
            <div className="p-6 sm:p-7 text-center border-b border-slate-100 dark:border-slate-800/80">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-sky-500 mb-3 border border-sky-100 dark:border-sky-900/50">
                <QrCode className="w-7 h-7" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {lang === 'vi' ? 'Đăng nhập với Telegram' : 'Log in to Telegram'}
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {lang === 'vi'
                  ? 'Quét mã QR bằng ứng dụng Telegram trên điện thoại để bắt đầu sử dụng ổ đĩa không giới hạn'
                  : 'Scan the QR code with your Telegram mobile app to access your unlimited storage'}
              </p>


            </div>


              <div className="p-6 sm:p-7">
                {/* Error Banner */}
                {errorMessage && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
                    <div className="flex-1">
                      <p className="font-semibold">{errorMessage}</p>
                      <button
                        onClick={startRealQrFlow}
                        className="mt-1.5 underline font-bold text-rose-600 dark:text-rose-400 hover:opacity-80"
                      >
                        {lang === 'vi' ? 'Thử lại kết nối MTProto' : 'Retry MTProto connection'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 2FA Prompt if required */}
                {is2faRequired ? (
                  <form onSubmit={handleVerify2fa} className="space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-center">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-2">
                        <Lock className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                        {lang === 'vi' ? 'Tài khoản yêu cầu mật khẩu 2FA' : 'Two-Step Verification (2FA)'}
                      </h3>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        {lang === 'vi'
                          ? 'Telegram của bạn có đặt Cloud Password. Vui lòng nhập mật khẩu để hoàn tất.'
                          : 'Your Telegram account has a Cloud Password enabled. Enter it to finish logging in.'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        {lang === 'vi' ? 'Mật khẩu Cloud Password' : '2FA Cloud Password'}
                      </label>
                      <div className="relative">
                        <input
                          id="qr-2fa-input"
                          type={show2faPassword ? 'text' : 'password'}
                          value={twoFactorPassword}
                          onChange={e => setTwoFactorPassword(e.target.value)}
                          placeholder={lang === 'vi' ? 'Nhập mật khẩu 2FA của bạn...' : 'Enter 2FA password...'}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none pr-10"
                          autoFocus
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShow2faPassword(!show2faPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {show2faPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      id="qr-2fa-submit-btn"
                      type="submit"
                      disabled={isSubmitting2fa || !twoFactorPassword}
                      className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25"
                    >
                      {isSubmitting2fa ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{lang === 'vi' ? 'Đang xác thực...' : 'Verifying...'}</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>{lang === 'vi' ? 'Xác nhận & Đăng nhập' : 'Verify & Log In'}</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Standard QR Display */
                  <div className="flex flex-col items-center">
                    {/* QR Frame Container */}
                    <div className="relative p-3.5 bg-white rounded-3xl shadow-xl border border-slate-200/80 group">
                      {/* Corner Accents */}
                      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-sky-500 rounded-tl-lg"></div>
                      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-sky-500 rounded-tr-lg"></div>
                      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-sky-500 rounded-bl-lg"></div>
                      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-sky-500 rounded-br-lg"></div>

                      {isLoading ? (
                        <div className="w-64 h-64 flex flex-col items-center justify-center bg-slate-50 rounded-2xl gap-3">
                          <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
                          <span className="text-xs font-semibold text-slate-500">
                            {lang === 'vi' ? 'Đang tạo mã QR Telegram...' : 'Generating Telegram QR...'}
                          </span>
                        </div>
                      ) : qrCodeUrl ? (
                        <div className="relative w-64 h-64 overflow-hidden rounded-2xl">
                          <img
                            src={qrCodeUrl}
                            alt="Telegram MTProto QR Code"
                            className="w-full h-full object-contain"
                          />
                          {/* Animated Scan Line */}
                          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent shadow-[0_0_8px_#0ea5e9] animate-bounce pointer-events-none opacity-60"></div>
                        </div>
                      ) : (
                        <div className="w-64 h-64 flex flex-col items-center justify-center bg-slate-50 rounded-2xl gap-2 p-4 text-center">
                          <AlertCircle className="w-8 h-8 text-slate-400" />
                          <span className="text-xs text-slate-500">
                            {lang === 'vi' ? 'Chưa tải được mã' : 'QR code unavailable'}
                          </span>
                          <button
                            onClick={startRealQrFlow}
                            className="mt-2 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500"
                          >
                            {lang === 'vi' ? 'Tạo mã mới' : 'Generate QR'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Status & Countdown */}
                    <div className="mt-4 flex items-center justify-between w-full px-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-semibold">
                          {lang === 'vi' ? 'Đang chờ quét...' : 'Waiting for scan...'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">
                          {lang === 'vi' ? `Hết hạn sau ${countdown}s` : `Expires in ${countdown}s`}
                        </span>
                        <button
                          id="btn-refresh-qr"
                          onClick={startRealQrFlow}
                          className="p-1 rounded-lg text-slate-400 hover:text-sky-500 transition-colors"
                          title={lang === 'vi' ? 'Làm mới mã QR' : 'Refresh QR Code'}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Desktop Deep Link */}
                    {qrDeepLink && (
                      <a
                        href={qrDeepLink}
                        className="mt-4 w-full py-2.5 rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/60 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{lang === 'vi' ? 'Mở Telegram trên máy này để kết nối' : 'Open Telegram App on this device'}</span>
                      </a>
                    )}

                    {/* Instructions */}
                    <div className="mt-6 w-full pt-5 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 text-left">
                        {lang === 'vi' ? 'Hướng dẫn quét mã' : 'How to scan'}
                      </div>
                      <div className="space-y-2.5 text-xs text-left">
                        <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center flex-shrink-0 text-[11px]">
                            1
                          </span>
                          <span>
                            {lang === 'vi' ? (
                              <>Mở ứng dụng <strong>Telegram</strong> trên điện thoại</>
                            ) : (
                              <>Open the <strong>Telegram</strong> app on your phone</>
                            )}
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center flex-shrink-0 text-[11px]">
                            2
                          </span>
                          <span>
                            {lang === 'vi' ? (
                              <>Vào <strong>Cài đặt</strong> (Settings) ➔ <strong>Thiết bị</strong> (Devices)</>
                            ) : (
                              <>Go to <strong>Settings</strong> ➔ <strong>Devices</strong></>
                            )}
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5 text-slate-600 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center flex-shrink-0 text-[11px]">
                            3
                          </span>
                          <span>
                            {lang === 'vi' ? (
                              <>Chọn <strong>Liên kết thiết bị máy tính</strong> và quét mã QR này</>
                            ) : (
                              <>Tap <strong>Link Desktop Device</strong> and scan this QR code</>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            {/* Advanced API ID / Hash (Collapsible) */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30">
              <button
                id="btn-toggle-advanced-api"
                onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-medium py-1"
              >
                <div className="flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{lang === 'vi' ? 'Cấu hình API nâng cao (Tùy chọn)' : 'Advanced API credentials (Optional)'}</span>
                </div>
                {showAdvancedApi ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showAdvancedApi && (
                <div className="mt-3 space-y-2.5 pb-2 text-xs">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'vi'
                      ? 'Mặc định TeleCloud sử dụng API MTProto chính thức có sẵn. Nếu muốn dùng App riêng từ my.telegram.org, hãy điền bên dưới:'
                      : 'By default TeleCloud uses official MTProto credentials. Enter below only if using your own my.telegram.org app:'}
                  </p>
                  <div>
                    <input
                      type="text"
                      placeholder="Telegram API ID (VD: 2040)"
                      value={customApiId}
                      onChange={e => setCustomApiId(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      placeholder="Telegram API Hash"
                      value={customApiHash}
                      onChange={e => setCustomApiHash(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={startRealQrFlow}
                    className="w-full py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {lang === 'vi' ? 'Áp dụng & Tạo lại mã QR' : 'Apply & Regenerate QR'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Security & Feature Guarantees */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-sky-500 mx-auto mb-1" />
              <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                {lang === 'vi' ? 'Dung lượng vô tận' : 'Unlimited Storage'}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'vi' ? 'Tận dụng hạ tầng đám mây Telegram' : 'Powered by Telegram cloud'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
              <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                {lang === 'vi' ? 'MTProto chính hãng' : 'Native MTProto'}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'vi' ? 'Kết nối mã hóa Data Center DC5' : 'Direct encrypted DC5 connection'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
              <Lock className="w-4 h-4 text-purple-500 mx-auto mb-1" />
              <div className="font-bold text-xs text-slate-800 dark:text-slate-200">
                {lang === 'vi' ? 'Bảo mật tuyệt đối' : '100% Private'}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'vi' ? 'Không lưu mật khẩu trung gian' : 'No intermediate credentials saved'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
