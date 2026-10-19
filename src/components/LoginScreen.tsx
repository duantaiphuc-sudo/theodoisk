import React, { useState } from 'react';
import { 
  Activity, 
  Lock, 
  User, 
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Heart,
  Wind,
  UserCheck,
  Clock,
  Cpu,
  Camera,
  Layers,
  HelpCircle,
  X,
  CheckCircle2,
  Shield,
  Menu,
  Info,
  Mail,
  KeyRound,
  Check,
  Copy,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { AuthUser } from '../types';
import { 
  loginWithFirebaseEmail, 
  registerWithFirebaseEmail,
  loginWithGoogle
} from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

type HeaderModalType = 'overview' | 'sensor' | 'camera' | 'hardware' | 'guide' | null;

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [activeModal, setActiveModal] = useState<HeaderModalType>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'email' | 'register'>('email');

  // Register states
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'employee' | 'manager'>('employee');
  const [regLoading, setRegLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  // Close modals or login on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLoginModalOpen(false);
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Background image handling:
  // Uses /nenweb.png directly from public/
  const bgImage = '/nenweb.png';
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  React.useEffect(() => {
    try {
      // Clear any legacy custom background stored previously
      localStorage.removeItem('theodoisk_login_bg');
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailLoading(true);
    try {
      // Use Firebase Email login with preset fallback
      const res = await loginWithFirebaseEmail(identifier.trim(), password);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi đăng nhập Email. Vui lòng kiểm tra lại.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!regEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ Email hợp lệ.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }
    setRegLoading(true);
    try {
      const res = await registerWithFirebaseEmail(regEmail, regPassword, regFullName, regRole);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Đăng ký không thành công. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi đăng ký tài khoản Firebase.');
    } finally {
      setRegLoading(false);
    }
  };


  const handleCopyDomain = () => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      navigator.clipboard.writeText(hostname).then(() => {
        setCopiedDomain(true);
        setTimeout(() => setCopiedDomain(false), 3000);
      });
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleError(null);
    setIsUnauthorizedDomain(false);
    setGoogleLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setGoogleError(res.error || 'Đăng nhập Google không thành công. Vui lòng thử lại.');
        if (res.isUnauthorizedDomain) {
          setIsUnauthorizedDomain(true);
        }
      }
    } catch (err: any) {
      setGoogleError(err?.message || 'Không thể kết nối dịch vụ Google Sign-In.');
      setIsUnauthorizedDomain(true);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleOpenModal = (modal: HeaderModalType) => {
    setActiveModal(modal);
    setMobileMenuOpen(false);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col font-sans select-none overflow-x-hidden">
      {/* 1. FULL-SCREEN BACKGROUND LAYER (Desktop: 100% sharp full-bleed wallpaper; Mobile: soft ambient light background) */}
      <div className="fixed inset-0 w-full h-full z-0 overflow-hidden bg-slate-100">
        {!imageLoadFailed ? (
          <>
            {/* Desktop Wallpaper: 100% sharp, zero blur, object-cover centered */}
            <img 
              src={bgImage} 
              alt="Giám sát sức khỏe văn phòng" 
              className="hidden sm:block w-full h-full object-cover object-center pointer-events-none"
              loading="eager"
              onError={() => setImageLoadFailed(true)}
              referrerPolicy="no-referrer"
            />
            {/* Mobile Ambient Glow: Soft light ambiance matching the sunny room tones */}
            <div className="sm:hidden absolute inset-0 bg-gradient-to-b from-sky-100/70 via-slate-50 to-slate-100 pointer-events-none" />
            <img 
              src={bgImage} 
              alt="Ambient" 
              className="sm:hidden absolute inset-0 w-full h-full object-cover blur-3xl opacity-20 scale-110 pointer-events-none"
              aria-hidden="true"
            />
          </>
        ) : (
          /* High-Fidelity Vector Scene matching nenweb.png if /nenweb.png file is not yet placed in public */
          <div className="relative w-full h-full bg-gradient-to-br from-sky-100 via-white to-amber-50 flex items-center justify-between p-8 overflow-hidden pointer-events-none">
            {/* Sunlit window rays */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-200/40 via-transparent to-transparent" />
            <div className="absolute top-12 left-12 text-slate-800 space-y-2 max-w-md hidden lg:block">
              <h2 className="text-3xl font-extrabold tracking-tight">
                Giám sát sức khỏe <span className="text-sky-600">văn phòng</span>
              </h2>
              <p className="text-sm text-slate-600">
                Theo dõi nhịp tim • SpO2 • Tư thế • Thời gian ngồi
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. TOP HEADER NAVIGATION (Balanced, single-line, all interactive) */}
      <header className="relative z-30 w-full border-b border-white/40 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Brand (Clickable -> Opens Overview) */}
          <button
            onClick={() => handleOpenModal('overview')}
            className="flex items-center gap-2 sm:gap-3 shrink-0 group text-left cursor-pointer transition active:scale-95"
            title="Nhấp để xem Tổng quan hệ thống"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0 group-hover:rotate-6 transition-transform">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-sm sm:text-base lg:text-lg tracking-tight text-slate-900 group-hover:text-sky-600 transition whitespace-nowrap">
                  HealthOffice
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">
                  Pi 4 IoT
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden xl:block whitespace-nowrap">
                Giám sát nhịp tim, SpO2 & Tư thế công thái học
              </p>
            </div>
          </button>

          {/* Desktop Interactive Nav Items (Balanced & Single-line) */}
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2.5 shrink-0">
            <button
              onClick={() => handleOpenModal('overview')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold text-slate-700 hover:text-sky-700 hover:bg-slate-100/90 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="whitespace-nowrap">Tổng quan</span>
            </button>

            <button
              onClick={() => handleOpenModal('sensor')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold text-slate-700 hover:text-rose-700 hover:bg-slate-100/90 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Heart className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="whitespace-nowrap">Cảm biến MAX30102</span>
            </button>

            <button
              onClick={() => handleOpenModal('camera')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold text-slate-700 hover:text-emerald-700 hover:bg-slate-100/90 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="whitespace-nowrap">Camera Tư Thế</span>
            </button>

            <button
              onClick={() => handleOpenModal('hardware')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold text-slate-700 hover:text-indigo-700 hover:bg-slate-100/90 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="whitespace-nowrap">Phần cứng Pi 4</span>
            </button>

            <button
              onClick={() => handleOpenModal('guide')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs xl:text-sm font-semibold text-slate-700 hover:text-amber-700 hover:bg-slate-100/90 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap">Hướng dẫn</span>
            </button>
          </nav>

          {/* Right Header Status / Action */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Status indicator */}
            <button
              onClick={() => handleOpenModal('overview')}
              className="hidden xl:inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="whitespace-nowrap">Hệ thống trực tuyến</span>
            </button>

            {/* Header Login Button (Prominent, responsive, no wrapping) */}
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white shadow-md shadow-sky-500/20 active:scale-95 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Nhấp để mở khung đăng nhập"
            >
              <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="whitespace-nowrap">Đăng Nhập</span>
            </button>

            {/* Mobile Hamburger Toggle (Ensured visible & accessible on all screens) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer shrink-0 active:scale-95"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200/80 bg-white/95 backdrop-blur-md px-4 py-3 space-y-2 animate-fadeIn shadow-lg">
            {/* Prominent Login Button for Mobile */}
            <button
              onClick={() => {
                setIsLoginModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md cursor-pointer mb-2 whitespace-nowrap"
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Đăng Nhập Hệ Thống</span>
            </button>

            <button
              onClick={() => handleOpenModal('overview')}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition whitespace-nowrap"
            >
              <Layers className="w-4 h-4 text-sky-600 shrink-0" />
              <span className="whitespace-nowrap">Tổng quan hệ thống</span>
            </button>

            <button
              onClick={() => handleOpenModal('sensor')}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition whitespace-nowrap"
            >
              <Heart className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="whitespace-nowrap">Cảm biến MAX30102</span>
            </button>

            <button
              onClick={() => handleOpenModal('camera')}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="whitespace-nowrap">Camera Tư Thế</span>
            </button>

            <button
              onClick={() => handleOpenModal('hardware')}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition whitespace-nowrap"
            >
              <Cpu className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="whitespace-nowrap">Phần cứng Raspberry Pi 4</span>
            </button>

            <button
              onClick={() => handleOpenModal('guide')}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition whitespace-nowrap"
            >
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap">Hướng dẫn đăng nhập & phân quyền</span>
            </button>
          </div>
        )}
      </header>

      {/* 3. MAIN BODY (Desktop: full view with modal trigger; Mobile: uncropped 16:9 hero card & welcome CTA) */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center p-3.5 sm:p-6 lg:p-8">
        {/* MOBILE HERO SHOWCASE & QUICK ACCESS (Displayed on mobile screens: perfectly uncropped 16:9 with all 4 cards & office worker complete!) */}
        {!isLoginModalOpen && (
          <div className="sm:hidden w-full max-w-sm mx-auto space-y-3 animate-fadeIn py-1">
            {/* 16:9 Uncropped Hero Frame (Clean, zero overlapping badges, zero buttons) */}
            <div className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200/90 bg-white">
              <div className="relative aspect-[1672/941] w-full bg-slate-100 overflow-hidden">
                <img
                  src={bgImage}
                  alt="Không gian giám sát sức khỏe văn phòng"
                  className="w-full h-full object-contain pointer-events-none"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Mobile Welcome & CTA Card */}
            <div className="w-full rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm p-4 text-slate-800 space-y-3">
              <div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-700 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200">
                  <Activity className="w-3 h-3 text-sky-600" />
                  <span>Raspberry Pi 4 • Firebase IoT</span>
                </span>
                <h1 className="text-base font-extrabold text-slate-900 mt-1.5 tracking-tight leading-snug">
                  Giám Sát Sức Khỏe & Tư Thế Thông Minh
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  Đo nhịp tim, SpO₂ tự động và phân tích góc nghiêng cột sống công thái học theo thời gian thực.
                </p>
              </div>

              {/* Prominent Login CTA Button */}
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white shadow-md shadow-sky-500/25 active:scale-[0.98] transition cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Đăng Nhập Vào Hệ Thống</span>
              </button>

              {/* 4 Feature Badges in 2x2 grid */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => handleOpenModal('sensor')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100 transition text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <Heart className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block text-[11px] truncate">MAX30102</span>
                    <span className="text-[10px] text-slate-500 block truncate">Nhịp tim & SpO₂</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModal('camera')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100 transition text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block text-[11px] truncate">Camera Tư Thế</span>
                    <span className="text-[10px] text-slate-500 block truncate">Tư thế cột sống</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModal('guide')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100 transition text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block text-[11px] truncate">Giải Lao</span>
                    <span className="text-[10px] text-slate-500 block truncate">Nhắc nhở tự động</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenModal('hardware')}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100 transition text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block text-[11px] truncate">Pi 4 IoT</span>
                    <span className="text-[10px] text-slate-500 block truncate">Đồng bộ đám mây</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LOGIN MODAL */}
        {isLoginModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/40 backdrop-blur-xs animate-fadeIn pointer-events-auto">
            {/* Backdrop click to close */}
            <div 
              className="absolute inset-0 cursor-pointer" 
              onClick={() => setIsLoginModalOpen(false)} 
              title="Nhấp vào ngoài để đóng ô đăng nhập"
            />

            <div className="relative z-10 w-full max-w-[420px] rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl shadow-slate-900/20 p-6 sm:p-8 text-slate-900 animate-fadeIn pointer-events-auto">
              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Đóng ô đăng nhập (Xem hình nền)"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Card Header */}
              <div className="text-center space-y-1.5 pb-3 border-b border-slate-100">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                  {authMethod === 'register' ? 'Đăng Ký Tài Khoản' : 'Đăng Nhập'}
                </h2>
                <p className="text-xs text-slate-500">
                  Hệ thống giám sát sức khỏe & tư thế văn phòng IoT (Firebase Backend)
                </p>
              </div>



              {/* Method Selector Tabs */}
              <div className="mt-3 flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => { setAuthMethod('email'); setError(null); }}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'email' 
                      ? 'bg-white text-sky-700 font-bold shadow-xs border border-slate-200/60' 
                      : 'hover:text-slate-900'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email / ID</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMethod('register'); setError(null); }}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'register' 
                      ? 'bg-white text-sky-700 font-bold shadow-xs border border-slate-200/60' 
                      : 'hover:text-slate-900'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Tạo mới</span>
                </button>
              </div>

              {/* METHOD 1: EMAIL & PASSWORD LOGIN */}
              {authMethod === 'email' && (
                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                  {/* Identifier input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email đăng nhập
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={identifier}
                        onChange={e => { setIdentifier(e.target.value); setError(null); }}
                        placeholder="email@example.com"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-inner"
                        required
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* Password input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(null); }}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-inner font-mono"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Toggle password visibility"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember & Help */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer"
                      />
                      <span>Ghi nhớ phiên</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => handleOpenModal('guide')}
                      className="text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
                    >
                      Hướng dẫn?
                    </button>
                  </div>

                  {/* Error banner for Email Auth */}
                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex flex-col gap-2 animate-fadeIn">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-snug">{error}</span>
                      </div>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white transition shadow-md shadow-sky-600/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
                  >
                    <span>{emailLoading ? 'Đang xác thực Firebase...' : 'Đăng Nhập'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}


              {/* METHOD 3: REGISTER NEW ACCOUNT (EMAIL/PASSWORD) */}
              {authMethod === 'register' && (
                <form onSubmit={handleRegister} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và Tên
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={e => setRegFullName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-inner"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Địa chỉ Email
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="tenban@example.com"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-inner"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (tối thiểu 6 ký tự)
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition shadow-inner font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Vai trò người dùng
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRegRole('employee')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          regRole === 'employee' 
                            ? 'bg-sky-50 border-sky-500 text-sky-700 font-bold' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Nhân viên
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegRole('manager')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          regRole === 'manager' 
                            ? 'bg-sky-50 border-sky-500 text-sky-700 font-bold' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Quản trị (Admin)
                      </button>
                    </div>
                  </div>

                  {/* Error banner */}
                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-snug">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white transition shadow-md shadow-sky-600/20 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-60"
                  >
                    <span>{regLoading ? 'Đang tạo tài khoản...' : 'Hoàn Tất Đăng Ký'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  <span className="bg-white px-2.5">Hoặc đăng nhập nhanh với</span>
                </div>
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs hover:border-slate-400 transition active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>{googleLoading ? 'Đang kết nối tài khoản Google...' : 'Đăng nhập bằng tài khoản Google'}</span>
              </button>

              {/* Specialized Unauthorized Domain Helper Card */}
              {isUnauthorizedDomain && (
                <div className="mt-3 p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-amber-900 text-xs">
                        Tên miền deploy chưa được cấp quyền trong Firebase Auth
                      </div>
                      <p className="text-[11px] text-amber-800/90 leading-relaxed">
                        Do chính sách bảo mật của Firebase, tên miền <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono font-bold text-amber-950 text-[10px] break-all">{typeof window !== 'undefined' ? window.location.hostname : 'hiện tại'}</code> cần được thêm vào mục <b>Authorized domains</b> trong Firebase Console.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="py-1.5 px-2.5 rounded-lg bg-white hover:bg-amber-100/50 border border-amber-300 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
                    >
                      {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-700" />}
                      <span>{copiedDomain ? 'Đã sao chép!' : 'Chép Tên Miền'}</span>
                    </button>
                    <a
                      href="https://console.firebase.google.com/project/theodoisk-66ddb/authentication/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95 shadow-2xs"
                    >
                      <span>Mở Firebase</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Other Google Errors (popup blocked, closed, etc.) */}
              {googleError && !isUnauthorizedDomain && (
                <div className="mt-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex flex-col gap-2 animate-fadeIn">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-snug">{googleError}</span>
                  </div>
                </div>
              )}


            </div>
          </div>
        )}
      </main>

      {/* 4. MODALS FOR HEADER ITEMS */}
      {/* Overview Modal */}
      {activeModal === 'overview' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Tổng Quan Kiến Trúc Hệ Thống</h3>
                  <p className="text-xs text-slate-500">Nền tảng giám sát sức khỏe & tư thế công thái học IoT</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200">
                <h4 className="font-bold text-sky-900 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sky-600" /> Mục tiêu & Ứng dụng thực tế:
                </h4>
                <p className="text-slate-600">
                  Hệ thống kết hợp phần cứng biên <b>Raspberry Pi 4 Model B</b>, cảm biến đo thể tích máu <b>MAX30102</b> và mô hình thị giác máy tính <b>MediaPipe</b> nhằm bảo vệ toàn diện cột sống, nhịp tim và nồng độ oxy trong máu cho người làm việc văn phòng.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-700 font-bold">
                    <Heart className="w-4 h-4" />
                    <span>Cảm biến Sinh hiệu MAX30102</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Đo trực tiếp nhịp tim (BPM) và độ bão hòa oxy trong máu (SpO2) qua mao mạch đầu ngón tay với tần số lấy mẫu lên đến 400Hz.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold">
                    <Camera className="w-4 h-4" />
                    <span>Camera Tư Thế</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Nhận diện 33 điểm mốc sinh trắc 3D theo thời gian thực (30 FPS), tính toán góc gập cổ và độ nghiêng vai để nhắc nhở điều chỉnh tư thế.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                    <Clock className="w-4 h-4" />
                    <span>Theo dõi Thời gian Ngồi</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Áp dụng quy tắc công thái học 20-20-20 và cảnh báo khi ngồi liên tục quá 45 phút mà không đứng dậy vận động.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-sky-700 font-bold">
                    <Layers className="w-4 h-4" />
                    <span>Đồng bộ Đám mây Firebase</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Lưu trữ tức thời vào tài liệu Firestore, hỗ trợ cảnh báo giọng nói tiếng Việt đa tầng và truy xuất báo cáo CSV.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sensor Modal */}
      {activeModal === 'sensor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                  <Heart className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Chi Tiết Kỹ Thuật Cảm Biến MAX30102</h3>
                  <p className="text-xs text-slate-500">Nguyên lý quang phổ và sơ đồ đấu nối vi điều khiển</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                <h4 className="font-bold text-rose-900 mb-1">Nguyên lý quang phổ học (PPG):</h4>
                <p className="text-slate-600">
                  Cảm biến tích hợp 2 đèn LED có bước sóng khác nhau: <b>LED Đỏ (660 nm)</b> và <b>LED Hồng ngoại (880 nm)</b>. Hemoglobin chứa oxy (HbO2) hấp thụ nhiều ánh sáng hồng ngoại hơn, trong khi Hemoglobin không chứa oxy (Hb) hấp thụ nhiều ánh sáng đỏ hơn. Bằng cách đo tỉ số hấp thụ xung AC/DC, hệ thống tính toán chính xác độ bão hòa SpO2 (%).
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Sơ đồ kết nối I2C giữa MAX30102 và Raspberry Pi 4:</h4>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-rose-600 font-bold">VIN</span> → Chân Pin 1 (3.3V)
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-slate-600 font-bold">GND</span> → Chân Pin 6 hoặc 9 (GND)
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-sky-600 font-bold">SDA</span> → Chân Pin 3 (GPIO 2 / I2C1)
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-emerald-600 font-bold">SCL</span> → Chân Pin 5 (GPIO 3 / I2C1)
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900">Thông số hoạt động:</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-[11px]">
                  <li>Dải đo nhịp tim: 30 - 240 BPM (Độ chính xác: ±1 BPM)</li>
                  <li>Dải đo nồng độ oxy SpO2: 70% - 100% (Độ chính xác: ±1.5%)</li>
                  <li>Điện áp hoạt động: 1.8V - 3.3V DC (Giao tiếp I2C tiêu chuẩn)</li>
                  <li>Dòng điện tiêu thụ: &lt; 1.2 mA trong chế độ đo liên tục</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera AI Modal */}
      {activeModal === 'camera' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Camera Giám Sát Tư Thế & Thị Giác Máy Tính</h3>
                  <p className="text-xs text-slate-500">Mô hình MediaPipe Pose 33 điểm mốc công thái học</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <h4 className="font-bold text-emerald-900 mb-1">Mô hình nhận diện MediaPipe BlazePose:</h4>
                <p className="text-slate-600">
                  Thuật toán trích xuất 33 điểm mốc cơ thể (khớp vai, tai, mũi, cột sống, hông) theo không gian 3 chiều (x, y, z) tại biên trên Raspberry Pi 4 mà không cần gửi video lên máy chủ đám mây, đảm bảo 100% sự riêng tư.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-900">Tiêu chuẩn phân loại tư thế:</h4>
                <div className="space-y-2 text-[11px]">
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Tư thế Chuẩn (Mã 0):</span> Lưng tựa sát vào tựa ghế, góc nghiêng cổ so với phương thẳng đứng &lt; 15°, hai vai cân bằng song song mặt bàn.
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 text-rose-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Tư thế Cúi gù / Lệch (Mã 1):</span> Đầu chúi về phía trước màn hình (góc cổ &gt; 30° kéo dài trên 5 giây) hoặc vai nghiêng lệch quá 10°.
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Ngoài vùng camera (Mã 2):</span> Người dùng rời khỏi vị trí làm việc hoặc nằm ngoài vùng camera quan sát.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hardware Modal */}
      {activeModal === 'hardware' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Phần Cứng Raspberry Pi 4 Model B</h3>
                  <p className="text-xs text-slate-500">Trung tâm xử lý biên Edge Computing</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">CPU / SoC</p>
                  <p className="font-bold text-slate-900">Broadcom BCM2711</p>
                  <p className="text-slate-600 text-[10px]">4x Cortex-A72 @ 1.5GHz</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">RAM</p>
                  <p className="font-bold text-slate-900">4GB LPDDR4-3200</p>
                  <p className="text-slate-600 text-[10px]">Tối ưu cho thị giác máy tính</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Cổng Camera</p>
                  <p className="font-bold text-slate-900">MIPI CSI 2-lane</p>
                  <p className="text-slate-600 text-[10px]">Hỗ trợ Camera v2 / v3 1080p</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-slate-500 text-[10px]">Kết nối mạng</p>
                  <p className="font-bold text-slate-900">Wi-Fi Dual-band + GigE</p>
                  <p className="text-slate-600 text-[10px]">2.4 / 5.0 GHz 802.11ac</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1 text-slate-700">
                <p className="font-bold text-indigo-900">Môi trường thực thi phần mềm:</p>
                <p className="text-slate-600 text-[11px]">
                  Hệ điều hành Raspberry Pi OS (64-bit), môi trường Python 3.11, gói SDK <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-indigo-700">firebase-admin</code>, <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-indigo-700">opencv-python</code> và <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-indigo-700">mediapipe</code>.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {activeModal === 'guide' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-800 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Giới Thiệu Hệ Thống Giám Sát Sức Khỏe IoT</h3>
                  <p className="text-xs text-slate-500">Nền tảng theo dõi công thái học & sinh trắc học thời gian thực</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    Theo Dõi Tư Thế Công Thái Học & Sinh Trắc Học
                  </span>
                  <p className="text-slate-600 text-[11px]">
                    Hệ thống tự động phân tích tư thế ngồi (chuẩn, cúi đầu, gù lưng, nghiêng), đo nhịp tim (BPM) và nồng độ oxy trong máu (SpO₂) từ cảm biến Raspberry Pi 4.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-sky-600" />
                    Đồng Bộ & Lưu Trữ Lịch Sử
                  </span>
                  <p className="text-slate-600 text-[11px]">
                    Dữ liệu thời gian thực được kết nối trực tiếp, các bản ghi lịch sử đo đạc được lưu trữ tập trung trên cơ sở dữ liệu Supabase PostgreSQL Cloud để tra cứu bất kỳ lúc nào.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-xs cursor-pointer"
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
