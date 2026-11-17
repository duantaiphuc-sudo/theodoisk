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
import { COMMON_MEDICAL_CONDITIONS, calculateAdaptiveThresholds } from '../utils/adaptiveThresholds';
import { Stethoscope, Sparkles } from 'lucide-react';
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
  const [regGender, setRegGender] = useState<'male' | 'female'>('male');
  const [regAge, setRegAge] = useState<number>(27);
  const [regConditions, setRegConditions] = useState<string[]>([]);
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
  // Uses user's original /nenweb.png with zero blur or fog layer
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
      const res = await registerWithFirebaseEmail(regEmail, regPassword, regFullName, regRole, {
        gender: regGender,
        age: regAge,
        medicalConditions: regConditions,
      });
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
    <div className="relative min-h-screen w-full flex flex-col font-sans select-none overflow-x-hidden bg-[#FDFBF7] text-slate-900">
      {/* 0. CRISP TECH OFFICE BACKGROUND LAYER (NO BLUR, NO FOG OVERLAY) */}
      {!imageLoadFailed && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <img
            src={bgImage}
            alt="Văn phòng công nghệ thông minh"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
            onError={() => setImageLoadFailed(true)}
          />
        </div>
      )}

      {/* 1. FLOATING NEO-BRUTALIST HEADER BAR */}
      <div className="relative z-30 w-full max-w-[1200px] mx-auto px-3 sm:px-6 pt-3 sm:pt-5">
        <header className="w-full rounded-2xl bg-white/55 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] px-3.5 sm:px-5 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <button
            type="button"
            onClick={() => handleOpenModal('overview')}
            className="flex items-center gap-2 sm:gap-2.5 shrink-0 group text-left cursor-pointer transition active:translate-y-0.5"
            title="Nhấp để xem Tổng quan hệ thống"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#22C55E] to-[#16A34A] border-2 border-slate-900 shadow-[0_2px_0_#0F172A] flex items-center justify-center text-white shrink-0 group-hover:rotate-3 transition-transform">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.4]" />
            </div>
            <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-sm sm:text-base lg:text-lg tracking-tight text-slate-950 whitespace-nowrap">
                Health<span className="text-[#16A34A]">Office</span>
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#B2F5BE] text-slate-900 border-[1.5px] border-slate-800 whitespace-nowrap hidden sm:inline-flex">
                Pi 4 IoT
              </span>
            </div>
          </button>

          {/* Desktop Center Nav Items */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenModal('overview')}
              className="px-3 py-1.5 rounded-xl text-xs xl:text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-[#FAF7F0] transition cursor-pointer whitespace-nowrap"
            >
              Tổng quan
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal('sensor')}
              className="px-3 py-1.5 rounded-xl text-xs xl:text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-[#FAF7F0] transition cursor-pointer whitespace-nowrap"
            >
              MAX30102
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal('camera')}
              className="px-3 py-1.5 rounded-xl text-xs xl:text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-[#FAF7F0] transition cursor-pointer whitespace-nowrap"
            >
              Camera Tư Thế
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal('hardware')}
              className="px-3 py-1.5 rounded-xl text-xs xl:text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-[#FAF7F0] transition cursor-pointer whitespace-nowrap"
            >
              Phần cứng
            </button>
            <button
              type="button"
              onClick={() => handleOpenModal('guide')}
              className="px-3 py-1.5 rounded-xl text-xs xl:text-sm font-bold text-slate-700 hover:text-slate-950 hover:bg-[#FAF7F0] transition cursor-pointer whitespace-nowrap"
            >
              Hướng dẫn
            </button>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('register');
                setIsLoginModalOpen(true);
              }}
              className="hidden sm:inline-flex items-center px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 hover:text-[#16B364] transition cursor-pointer whitespace-nowrap"
            >
              Đăng ký
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMethod('email');
                setIsLoginModalOpen(true);
              }}
              className="tactile-btn-primary min-h-10 sm:min-h-10 px-3.5 sm:px-5 rounded-xl text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Nhấp để mở khung đăng nhập"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Đăng nhập</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden min-h-10 min-w-10 flex items-center justify-center rounded-xl tactile-btn-white cursor-pointer shrink-0"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 rounded-2xl bg-white border-2 border-slate-800 shadow-[0_4px_0_#1E293B] p-3 space-y-1.5 animate-fadeIn">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('email');
                setIsLoginModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full min-h-11 tactile-btn-primary rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer mb-2 whitespace-nowrap"
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>Đăng Nhập Hệ Thống</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('overview')}
              className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-xs font-bold text-slate-800 hover:bg-[#FAF7F0] border border-transparent hover:border-slate-800 transition whitespace-nowrap"
            >
              <Layers className="w-4 h-4 text-[#16B364] shrink-0" />
              <span>Tổng quan hệ thống</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('sensor')}
              className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-xs font-bold text-slate-800 hover:bg-[#FAF7F0] border border-transparent hover:border-slate-800 transition whitespace-nowrap"
            >
              <Heart className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Cảm biến MAX30102</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('camera')}
              className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-xs font-bold text-slate-800 hover:bg-[#FAF7F0] border border-transparent hover:border-slate-800 transition whitespace-nowrap"
            >
              <Camera className="w-4 h-4 text-sky-700 shrink-0" />
              <span>Camera Tư Thế</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('hardware')}
              className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-xs font-bold text-slate-800 hover:bg-[#FAF7F0] border border-transparent hover:border-slate-800 transition whitespace-nowrap"
            >
              <Cpu className="w-4 h-4 text-slate-800 shrink-0" />
              <span>Phần cứng Raspberry Pi 4</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('guide')}
              className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-xs font-bold text-slate-800 hover:bg-[#FAF7F0] border border-transparent hover:border-slate-800 transition whitespace-nowrap"
            >
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Hướng dẫn hệ thống</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. HERO SECTION (CREAM CANVAS MATCHING REFERENCE STYLE) */}
      <main className="relative z-20 flex-1 flex flex-col">
        <section className="w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-12 sm:pt-12 sm:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Hero Left Copy (Transparent container so /nenweb.png background shows clearly with zero blur) */}
            <div className="lg:col-span-6 space-y-5 text-left rounded-2xl bg-white/45 border-2 border-slate-800 shadow-[0_6px_0_#1E293B] p-5 sm:p-7">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[11px] sm:text-xs font-extrabold text-slate-900 shadow-[0_2px_0_#1E293B]">
                <span className="w-2 h-2 rounded-full bg-[#16B364] border border-slate-900 shrink-0" />
                <span>Mới: Giám sát sức khỏe & tư thế với Edge AI</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950 leading-[1.12]">
                Theo dõi sức khỏe,{' '}
                <span className="text-[#16B364]">mọi lúc mọi nơi</span>
                , bảo vệ cột sống!
              </h1>

              <p className="text-sm sm:text-base text-slate-800 leading-relaxed max-w-lg font-semibold">
                Kết hợp Raspberry Pi 4, cảm biến sinh trắc học MAX30102 và nhận diện tư thế MediaPipe theo thời gian thực — giúp nhân viên văn phòng duy trì nhịp tim ổn định và thói quen đứng ngồi khoa học.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('email');
                    setIsLoginModalOpen(true);
                  }}
                  className="tactile-btn-primary min-h-12 px-5 sm:px-6 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span>Đăng nhập ngay</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('register');
                    setIsLoginModalOpen(true);
                  }}
                  className="tactile-btn-secondary min-h-12 px-5 sm:px-6 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span>Tạo tài khoản mới</span>
                </button>
              </div>

              {/* Quick Telemetry Highlight Numbers */}
              <div className="grid grid-cols-3 gap-4 pt-3 max-w-md border-t-2 border-slate-800/20">
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-950 tabular-nums">400Hz</div>
                  <div className="text-[11px] font-bold text-slate-800 mt-0.5">Lấy mẫu MAX30102</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-950 tabular-nums">33 điểm</div>
                  <div className="text-[11px] font-bold text-slate-800 mt-0.5">Mốc cột sống 3D</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-950 tabular-nums">128D</div>
                  <div className="text-[11px] font-bold text-slate-800 mt-0.5">Xác thực SFace</div>
                </div>
              </div>
            </div>

            {/* Hero Right Tactile Preview Card (Mirrors image_f0ee8e85.png) */}
            <div className="lg:col-span-6 relative px-2 sm:px-4">
              {/* Floating Top-Right Coral Badge */}
              <div className="hidden sm:flex absolute -top-4 right-1 z-20 w-12 h-12 rounded-xl bg-[#FBC2C8] border-2 border-slate-800 shadow-[0_3px_0_#1E293B] items-center justify-center rotate-6">
                <Heart className="w-5 h-5 text-slate-900" />
              </div>

              {/* Floating Mid-Right Mint Badge */}
              <div className="hidden sm:flex absolute top-1/2 -translate-y-1/2 -right-1 z-20 w-9 h-9 rounded-full bg-[#B2F5BE] border-2 border-slate-800 shadow-[0_3px_0_#1E293B] items-center justify-center">
                <Sparkles className="w-4 h-4 text-slate-900" />
              </div>

              {/* Floating Bottom-Left Sky Badge */}
              <div className="hidden sm:flex absolute -bottom-4 left-0 z-20 w-11 h-11 rounded-xl bg-[#BAE0EC] border-2 border-slate-800 shadow-[0_3px_0_#1E293B] items-center justify-center -rotate-6">
                <Camera className="w-5 h-5 text-slate-900" />
              </div>

              {/* Main Tactile Showcase Card (Transparent over crisp background) */}
              <div className="relative z-10 rounded-2xl bg-white/50 border-2 border-slate-800 shadow-[0_6px_0_#1E293B] p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#BAE0EC] border-2 border-slate-800 flex items-center justify-center text-slate-900 shrink-0">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-950 truncate">
                      Trạm Giám Sát Văn Phòng Pi 4
                    </h2>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                      Nhịp tim • SpO₂ • Tư thế • Chu kỳ Đứng-Ngồi
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[10px] font-extrabold text-slate-900 whitespace-nowrap shrink-0">
                    Trực tuyến
                  </span>
                </div>

                {/* Progress Track */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800">Chỉ số hiệu suất công thái học (OHPS)</span>
                    <span className="font-mono font-extrabold text-[#16A34A] tabular-nums">88%</span>
                  </div>
                  <div className="tactile-progress-track">
                    <div className="tactile-progress-fill" style={{ width: '88%' }} />
                  </div>
                </div>

                {/* 3 Live Metric Preview Chips */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white/55 border-[1.5px] border-slate-800 text-center">
                    <div className="text-[10px] font-bold uppercase text-slate-700">Nhịp tim</div>
                    <div className="text-sm sm:text-base font-extrabold font-mono text-slate-950 tabular-nums mt-0.5">72 BPM</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/55 border-[1.5px] border-slate-800 text-center">
                    <div className="text-[10px] font-bold uppercase text-slate-700">SpO₂</div>
                    <div className="text-sm sm:text-base font-extrabold font-mono text-slate-950 tabular-nums mt-0.5">98%</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/55 border-[1.5px] border-slate-800 text-center">
                    <div className="text-[10px] font-bold uppercase text-slate-700">Tư thế</div>
                    <div className="text-sm sm:text-base font-extrabold text-[#16A34A] mt-0.5">Chuẩn S</div>
                  </div>
                </div>

                {/* Primary Card Action */}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('email');
                    setIsLoginModalOpen(true);
                  }}
                  className="w-full min-h-11 tactile-btn-primary rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Mở Bảng Điều Khiển Sức Khỏe</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 3. LOWER FEATURE CARDS SECTION (TRANSPARENT SO BACKGROUND SHOWS CLEARLY) */}
        <section className="w-full bg-transparent border-t-2 border-slate-800/40 py-10 sm:py-14 px-4 sm:px-6 lg:px-8 flex-1">
          <div className="max-w-[1160px] mx-auto space-y-8">
            <div className="text-center space-y-2.5 max-w-2xl mx-auto rounded-2xl bg-white/45 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] px-5 py-4">
              <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-[#BAE0EC] border-[1.5px] border-slate-800 text-xs font-extrabold text-slate-900">
                Các mô-đun cốt lõi
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
                Khám phá hệ sinh thái giám sát thông minh
              </h2>
              <p className="text-xs sm:text-sm text-slate-800 font-semibold">
                Nhấp vào từng mô-đun bên dưới để xem thông số kỹ thuật phần cứng và luồng xử lý dữ liệu thời gian thực.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <button
                type="button"
                onClick={() => handleOpenModal('sensor')}
                className="text-left p-5 rounded-2xl bg-white/50 hover:bg-white/65 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] hover:-translate-y-0.5 transition flex items-start justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#FBC2C8] border-2 border-slate-800 flex items-center justify-center text-slate-900 shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-950">
                      Cảm biến Sinh trắc học MAX30102
                    </h3>
                    <p className="text-xs text-slate-800 mt-0.5 font-semibold">
                      Đo nhịp tim (BPM) & nồng độ oxy SpO₂ quang phổ học PPG qua giao tiếp I2C.
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] font-bold text-slate-700">
                      <span>400Hz</span>
                      <span>•</span>
                      <span>LED 660/880nm</span>
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[11px] font-extrabold text-slate-900 whitespace-nowrap shrink-0">
                  ★ PPG
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModal('camera')}
                className="text-left p-5 rounded-2xl bg-white/50 hover:bg-white/65 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] hover:-translate-y-0.5 transition flex items-start justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#BAE0EC] border-2 border-slate-800 flex items-center justify-center text-slate-900 shrink-0">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-950">
                      Camera Tư Thế & Nhận Diện Khuôn Mặt
                    </h3>
                    <p className="text-xs text-slate-800 mt-0.5 font-semibold">
                      MediaPipe 33 điểm mốc 3D kết hợp vector SFace 128D phát hiện ngồi sai & người lạ.
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] font-bold text-slate-700">
                      <span>30 FPS</span>
                      <span>•</span>
                      <span>Xử lý tại biên</span>
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[11px] font-extrabold text-slate-900 whitespace-nowrap shrink-0">
                  ★ Vision
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModal('hardware')}
                className="text-left p-5 rounded-2xl bg-white/50 hover:bg-white/65 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] hover:-translate-y-0.5 transition flex items-start justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#B2F5BE] border-2 border-slate-800 flex items-center justify-center text-slate-900 shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-950">
                      Bộ Xử Lý Biên Raspberry Pi 4
                    </h3>
                    <p className="text-xs text-slate-800 mt-0.5 font-semibold">
                      Broadcom BCM2711 chạy Python 3.11 đồng bộ trực tiếp Firestore & Supabase Cloud.
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] font-bold text-slate-700">
                      <span>4GB RAM</span>
                      <span>•</span>
                      <span>Raspberry Pi OS</span>
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[11px] font-extrabold text-slate-900 whitespace-nowrap shrink-0">
                  ★ Edge
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenModal('guide')}
                className="text-left p-5 rounded-2xl bg-white/50 hover:bg-white/65 border-2 border-slate-800 shadow-[0_4px_0_#1E293B] hover:-translate-y-0.5 transition flex items-start justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#FDE68A] border-2 border-slate-800 flex items-center justify-center text-slate-900 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-950">
                      AI Dự Đoán & Chu Kỳ Sit-Stand
                    </h3>
                    <p className="text-xs text-slate-800 mt-0.5 font-semibold">
                      Phân tích xu hướng kiệt sức, cảnh báo giọng nói đa tầng & trợ lý sức khỏe 24/7.
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-[11px] font-bold text-slate-700">
                      <span>20-20-20</span>
                      <span>•</span>
                      <span>Gemini & ML Engine</span>
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#B2F5BE] border-[1.5px] border-slate-800 text-[11px] font-extrabold text-slate-900 whitespace-nowrap shrink-0">
                  ★ AI 4.0
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* LOGIN MODAL (NEO-BRUTALIST BORDERED CARD) */}
        {isLoginModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/55 backdrop-blur-xs animate-fadeIn pointer-events-auto">
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={() => setIsLoginModalOpen(false)}
              title="Nhấp vào ngoài để đóng ô đăng nhập"
            />

            <div className="relative z-10 w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] p-5 sm:p-7 text-slate-900 animate-fadeIn pointer-events-auto">
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(false)}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer"
                title="Đóng ô đăng nhập"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center space-y-1.5 pb-3 border-b-2 border-slate-800">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#16B364] border-2 border-slate-900 shadow-[0_3px_0_#0F172A] flex items-center justify-center text-white">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-950">
                  {authMethod === 'register' ? 'Đăng Ký Tài Khoản' : 'Đăng Nhập'}
                </h2>
                <p className="text-xs font-medium text-slate-600">
                  Hệ thống giám sát sức khỏe & tư thế văn phòng IoT
                </p>
              </div>

              {/* Method Selector Tabs */}
              <div className="mt-3.5 flex items-center p-1 bg-[#FAF7F0] rounded-xl border-2 border-slate-800 text-xs font-bold text-slate-700 gap-1">
                <button
                  type="button"
                  onClick={() => { setAuthMethod('email'); setError(null); }}
                  className={`flex-1 py-2 px-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'email'
                      ? 'bg-[#16B364] text-white border-[1.5px] border-slate-900 shadow-[0_2px_0_#0F172A]'
                      : 'hover:bg-white text-slate-700'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email / ID</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMethod('register'); setError(null); }}
                  className={`flex-1 py-2 px-2 rounded-lg text-center transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMethod === 'register'
                      ? 'bg-[#16B364] text-white border-[1.5px] border-slate-900 shadow-[0_2px_0_#0F172A]'
                      : 'hover:bg-white text-slate-700'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Tạo mới</span>
                </button>
              </div>

              {/* METHOD 1: EMAIL & PASSWORD LOGIN */}
              {authMethod === 'email' && (
                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      Email đăng nhập
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={identifier}
                        onChange={e => { setIdentifier(e.target.value); setError(null); }}
                        placeholder="email@example.com"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#16B364]/40 transition"
                        required
                      />
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(null); }}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#16B364]/40 transition font-mono"
                        required
                      />
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Toggle password visibility"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-1 cursor-pointer transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#16B364] border-2 border-slate-800 cursor-pointer"
                      />
                      <span>Ghi nhớ phiên</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => handleOpenModal('guide')}
                      className="text-[#16B364] hover:underline font-extrabold cursor-pointer"
                    >
                      Hướng dẫn?
                    </button>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-[#FBC2C8]/50 border-2 border-rose-700 text-rose-950 text-xs font-bold flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
                      <span className="leading-snug">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="w-full min-h-11 tactile-btn-primary rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-60"
                  >
                    <span>{emailLoading ? 'Đang xác thực Firebase...' : 'Đăng Nhập'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* METHOD 2: REGISTER NEW ACCOUNT */}
              {authMethod === 'register' && (
                <form onSubmit={handleRegister} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      Họ và Tên
                    </label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={e => setRegFullName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/40 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      Địa chỉ Email
                    </label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="tenban@example.com"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/40 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      Mật khẩu (tối thiểu 6 ký tự)
                    </label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#16B364]/40 transition font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-800 mb-1">
                        Giới tính
                      </label>
                      <select
                        value={regGender}
                        onChange={e => setRegGender(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs font-semibold focus:outline-none cursor-pointer"
                      >
                        <option value="male">Nam (Male)</option>
                        <option value="female">Nữ (Female)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-800 mb-1">
                        Độ tuổi
                      </label>
                      <input
                        type="number"
                        min="16"
                        max="85"
                        value={regAge}
                        onChange={e => setRegAge(parseInt(e.target.value) || 25)}
                        className="w-full px-3 py-2 rounded-xl bg-white border-2 border-slate-800 text-slate-900 text-xs font-mono font-bold focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#FAF7F0] border-2 border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-rose-600" />
                        <span>Tiền sử bệnh nền:</span>
                      </span>
                      <span className="text-[10px] text-slate-900 font-extrabold bg-[#BAE0EC] px-2 py-0.5 rounded-full border border-slate-800">
                        Tự căn chỉnh ngưỡng
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {COMMON_MEDICAL_CONDITIONS.map(cond => {
                        const isSelected = regConditions.includes(cond.id);
                        return (
                          <button
                            key={cond.id}
                            type="button"
                            onClick={() => {
                              setRegConditions(prev =>
                                isSelected ? prev.filter(x => x !== cond.id) : [...prev, cond.id]
                              );
                            }}
                            className={`p-1.5 rounded-lg text-left text-xs border-[1.5px] transition flex items-center gap-2 cursor-pointer ${
                              isSelected
                                ? 'bg-[#FBC2C8]/60 border-slate-800 text-slate-950 font-bold'
                                : 'bg-white border-slate-300 text-slate-700 hover:border-slate-800'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 text-[10px] border border-slate-800 ${
                              isSelected ? 'bg-[#16B364] text-white' : 'bg-white'
                            }`}>
                              {isSelected ? '✓' : ''}
                            </span>
                            <span className="truncate text-[11px]">{cond.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      Vai trò người dùng
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRegRole('employee')}
                        className={`py-2 px-2 rounded-xl text-xs font-extrabold border-2 transition cursor-pointer ${
                          regRole === 'employee'
                            ? 'bg-[#BAE0EC] border-slate-900 text-slate-950 shadow-[0_2px_0_#0F172A]'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-800'
                        }`}
                      >
                        Nhân viên
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegRole('manager')}
                        className={`py-2 px-2 rounded-xl text-xs font-extrabold border-2 transition cursor-pointer ${
                          regRole === 'manager'
                            ? 'bg-[#BAE0EC] border-slate-900 text-slate-950 shadow-[0_2px_0_#0F172A]'
                            : 'bg-white border-slate-300 text-slate-600 hover:border-slate-800'
                        }`}
                      >
                        Quản trị (Admin)
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-[#FBC2C8]/50 border-2 border-rose-700 text-rose-950 text-xs font-bold flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />
                      <span className="leading-snug">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full min-h-11 tactile-btn-primary rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-60"
                  >
                    <span>{regLoading ? 'Đang tạo tài khoản...' : 'Hoàn Tất Đăng Ký'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-extrabold tracking-wider text-slate-500">
                  <span className="bg-white px-2.5">Hoặc đăng nhập nhanh với</span>
                </div>
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full min-h-11 tactile-btn-white rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                <span>{googleLoading ? 'Đang kết nối tài khoản Google...' : 'Đăng nhập bằng tài khoản Google'}</span>
              </button>

              {isUnauthorizedDomain && (
                <div className="mt-3 p-3.5 rounded-2xl bg-[#FDE68A]/50 border-2 border-slate-800 text-slate-900 text-xs space-y-2.5 animate-fadeIn">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-extrabold text-slate-950 text-xs">
                        Tên miền deploy chưa được cấp quyền trong Firebase Auth
                      </div>
                      <p className="text-[11px] text-slate-800 leading-relaxed">
                        Tên miền <code className="px-1.5 py-0.5 rounded bg-white border border-slate-800 font-mono font-bold text-slate-950 text-[10px] break-all">{typeof window !== 'undefined' ? window.location.hostname : 'hiện tại'}</code> cần được thêm vào <b>Authorized domains</b> trong Firebase Console.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="tactile-btn-white py-1.5 px-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedDomain ? <Check className="w-3.5 h-3.5 text-[#16B364]" /> : <Copy className="w-3.5 h-3.5 text-slate-800" />}
                      <span>{copiedDomain ? 'Đã sao chép!' : 'Chép Tên Miền'}</span>
                    </button>
                    <a
                      href="https://console.firebase.google.com/project/theodoisk-66ddb/authentication/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tactile-btn-primary py-1.5 px-2.5 rounded-lg text-[11px] flex items-center justify-center gap-1.5"
                    >
                      <span>Mở Firebase</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {googleError && !isUnauthorizedDomain && (
                <div className="mt-2.5 p-3 rounded-xl bg-[#FBC2C8]/50 border-2 border-rose-700 text-rose-950 text-xs font-bold flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{googleError}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 4. NEO-BRUTALIST INFO MODALS */}
      {activeModal === 'overview' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] border-2 border-slate-800 flex items-center justify-center text-slate-900">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Tổng Quan Kiến Trúc Hệ Thống</h3>
                  <p className="text-xs font-medium text-slate-600">Nền tảng giám sát sức khỏe & tư thế công thái học IoT</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-[#B2F5BE]/50 border-2 border-slate-800">
                <h4 className="font-extrabold text-slate-950 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#16B364]" /> Mục tiêu & Ứng dụng thực tế:
                </h4>
                <p className="text-slate-800 font-medium">
                  Hệ thống kết hợp phần cứng biên <b>Raspberry Pi 4 Model B</b>, cảm biến đo thể tích máu <b>MAX30102</b> và mô hình thị giác máy tính <b>MediaPipe</b> nhằm bảo vệ toàn diện cột sống, nhịp tim và nồng độ oxy trong máu cho người làm việc văn phòng.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-white border-2 border-slate-800 shadow-[0_3px_0_#1E293B] space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 font-extrabold">
                    <Heart className="w-4 h-4 text-rose-600" />
                    <span>Cảm biến Sinh hiệu MAX30102</span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-medium">Đo nhịp tim (BPM) và độ bão hòa oxy SpO2 qua mao mạch đầu ngón tay ở tần số 400Hz.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white border-2 border-slate-800 shadow-[0_3px_0_#1E293B] space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 font-extrabold">
                    <Camera className="w-4 h-4 text-[#16B364]" />
                    <span>Camera Tư Thế</span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-medium">Nhận diện 33 điểm mốc 3D thời gian thực, tính góc cổ & độ nghiêng vai.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white border-2 border-slate-800 shadow-[0_3px_0_#1E293B] space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 font-extrabold">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Theo dõi Thời gian Ngồi</span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-medium">Áp dụng quy tắc 20-20-20 và nhắc nhở chu kỳ Sit-Stand khoa học.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-white border-2 border-slate-800 shadow-[0_3px_0_#1E293B] space-y-1.5">
                  <div className="flex items-center gap-2 text-slate-950 font-extrabold">
                    <Layers className="w-4 h-4 text-sky-700" />
                    <span>Đồng bộ Đám mây Firebase</span>
                  </div>
                  <p className="text-slate-600 text-[11px] font-medium">Lưu trữ Firestore tức thời, cảnh báo giọng nói đa tầng và xuất báo cáo CSV.</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t-2 border-slate-800 bg-[#FDFBF7] flex justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="tactile-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'sensor' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FBC2C8] border-2 border-slate-800 flex items-center justify-center text-slate-900">
                  <Heart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Chi Tiết Kỹ Thuật Cảm Biến MAX30102</h3>
                  <p className="text-xs font-medium text-slate-600">Nguyên lý quang phổ và sơ đồ đấu nối I2C</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-[#FBC2C8]/40 border-2 border-slate-800">
                <h4 className="font-extrabold text-slate-950 mb-1">Nguyên lý quang phổ học (PPG):</h4>
                <p className="text-slate-800 font-medium">
                  Cảm biến tích hợp <b>LED Đỏ (660 nm)</b> và <b>LED Hồng ngoại (880 nm)</b>. Tỉ số hấp thụ xung AC/DC cho phép tính chính xác độ bão hòa oxy SpO2 (%) và nhịp tim (BPM).
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF7F0] border-2 border-slate-800 space-y-2">
                <h4 className="font-extrabold text-slate-950">Sơ đồ kết nối I2C với Raspberry Pi 4:</h4>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded-lg bg-white border-[1.5px] border-slate-800"><span className="text-rose-600 font-bold">VIN</span> → Pin 1 (3.3V)</div>
                  <div className="p-2 rounded-lg bg-white border-[1.5px] border-slate-800"><span className="text-slate-800 font-bold">GND</span> → Pin 6 / 9</div>
                  <div className="p-2 rounded-lg bg-white border-[1.5px] border-slate-800"><span className="text-sky-700 font-bold">SDA</span> → Pin 3 (GPIO 2)</div>
                  <div className="p-2 rounded-lg bg-white border-[1.5px] border-slate-800"><span className="text-[#16B364] font-bold">SCL</span> → Pin 5 (GPIO 3)</div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t-2 border-slate-800 bg-[#FDFBF7] flex justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="tactile-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'camera' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#BAE0EC] border-2 border-slate-800 flex items-center justify-center text-slate-900">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Camera Giám Sát Tư Thế & Thị Giác Máy Tính</h3>
                  <p className="text-xs font-medium text-slate-600">MediaPipe Pose 33 điểm mốc + SFace 128D</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-[#B2F5BE]/60 border-2 border-slate-800 text-slate-900">
                <b>Tư thế Chuẩn (Mã 0):</b> Lưng tựa sát ghế, góc nghiêng cổ &lt; 15°, hai vai cân bằng song song mặt bàn.
              </div>
              <div className="p-3.5 rounded-xl bg-[#FBC2C8]/50 border-2 border-slate-800 text-slate-900">
                <b>Tư thế Cúi gù / Lệch (Mã 1):</b> Đầu chúi về phía trước màn hình (góc cổ &gt; 30°).
              </div>
              <div className="p-3.5 rounded-xl bg-[#FDE68A]/50 border-2 border-slate-800 text-slate-900">
                <b>Ngoài vùng camera (Mã 2):</b> Người dùng rời khỏi vị trí làm việc hoặc nằm ngoài vùng quan sát.
              </div>
            </div>
            <div className="p-4 border-t-2 border-slate-800 bg-[#FDFBF7] flex justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="tactile-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'hardware' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#B2F5BE] border-2 border-slate-800 flex items-center justify-center text-slate-900">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Phần Cứng Raspberry Pi 4 Model B</h3>
                  <p className="text-xs font-medium text-slate-600">Trung tâm xử lý biên Edge Computing</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div className="p-3 rounded-xl bg-[#FAF7F0] border-2 border-slate-800">
                  <p className="text-slate-500 text-[10px]">CPU / SoC</p>
                  <p className="font-extrabold text-slate-950">Broadcom BCM2711</p>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF7F0] border-2 border-slate-800">
                  <p className="text-slate-500 text-[10px]">RAM</p>
                  <p className="font-extrabold text-slate-950">4GB LPDDR4-3200</p>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF7F0] border-2 border-slate-800">
                  <p className="text-slate-500 text-[10px]">Camera</p>
                  <p className="font-extrabold text-slate-950">USB / MIPI CSI 1080p</p>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF7F0] border-2 border-slate-800">
                  <p className="text-slate-500 text-[10px]">Mạng</p>
                  <p className="font-extrabold text-slate-950">Wi-Fi Dual-band + GigE</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t-2 border-slate-800 bg-[#FDFBF7] flex justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="tactile-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'guide' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border-2 border-slate-800 shadow-[0_8px_0_#1E293B] text-slate-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b-2 border-slate-800 bg-[#FDFBF7]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FDE68A] border-2 border-slate-800 flex items-center justify-center text-slate-900">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Giới Thiệu Hệ Thống Giám Sát Sức Khỏe IoT</h3>
                  <p className="text-xs font-medium text-slate-600">Nền tảng theo dõi công thái học & sinh trắc học thời gian thực</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 text-xs leading-relaxed text-slate-700">
              <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-2 border-slate-800 space-y-1.5">
                <span className="font-extrabold text-slate-950 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#16B364]" /> Theo Dõi Tư Thế & Sinh Trắc Học
                </span>
                <p className="text-slate-700 text-[11px] font-medium">
                  Phân tích tư thế ngồi (chuẩn, cúi đầu, gù lưng), nhịp tim (BPM) và nồng độ oxy trong máu (SpO₂) từ trạm Raspberry Pi 4.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#FAF7F0] border-2 border-slate-800 space-y-1.5">
                <span className="font-extrabold text-slate-950 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-sky-700" /> Đồng Bộ Đám Mây Thời Gian Thực
                </span>
                <p className="text-slate-700 text-[11px] font-medium">
                  Dữ liệu realtime đồng bộ trực tiếp Firestore & Supabase PostgreSQL Cloud, hỗ trợ AI dự đoán xu hướng sức khỏe.
                </p>
              </div>
            </div>
            <div className="p-4 border-t-2 border-slate-800 bg-[#FDFBF7] flex justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="tactile-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer">
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
