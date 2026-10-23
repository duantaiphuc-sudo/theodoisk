import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Eye, 
  Sparkles,
  Flame,
  Radio,
  UserCheck,
  ChevronRight,
  Maximize2,
  X
} from 'lucide-react';
import { AuthUser, HealthTelemetry } from '../types';
import { 
  checkFaceTemplateStatus, 
  deleteFaceTemplate, 
  FaceTemplateStatus 
} from '../services/faceService';
import { 
  requestFaceEnrollment, 
  watchFaceCommand, 
  watchFaceSession,
  formatFaceError
} from '../services/faceCommandService';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from '../services/firebase';

interface NatureFaceCardProps {
  currentUser?: AuthUser | null;
  deviceId?: string | null;
  telemetry?: HealthTelemetry;
  hasReceivedData?: boolean;
}

export const NatureFaceCard: React.FC<NatureFaceCardProps> = ({
  currentUser,
  deviceId,
  telemetry,
  hasReceivedData = true,
}) => {
  const [templateStatus, setTemplateStatus] = useState<FaceTemplateStatus | null>(null);
  const [capturedFaceImage, setCapturedFaceImage] = useState<string | null>(null);
  const [session, setSession] = useState<string>('WAIT_LOGIN');
  const [progress, setProgress] = useState<string>('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>('');
  const [successNotice, setSuccessNotice] = useState<string>('');
  const [isFaceViewerOpen, setIsFaceViewerOpen] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const watch = useRef<(() => void) | null>(null);

  const getEffectiveUid = useCallback((): string => {
    try {
      const config = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(config);
      const auth = getAuth(app);
      return auth.currentUser?.uid || currentUser?.id || '';
    } catch {
      return currentUser?.id || '';
    }
  }, [currentUser?.id]);

  const refreshTemplateStatus = useCallback(async () => {
    const uid = getEffectiveUid();
    if (!uid) return;
    try {
      const status = await checkFaceTemplateStatus(uid);
      setTemplateStatus(status);
      if (status.image && typeof status.image === 'string') {
        const formatted = status.image.startsWith('data:image') || status.image.startsWith('http') 
          ? status.image 
          : `data:image/jpeg;base64,${status.image}`;
        setCapturedFaceImage(formatted);
      } else {
        setCapturedFaceImage(null);
      }
    } catch {
      setTemplateStatus(null);
    }
  }, [getEffectiveUid]);

  useEffect(() => {
    refreshTemplateStatus();
  }, [refreshTemplateStatus]);

  useEffect(() => {
    if (!deviceId) return;
    try {
      const unsub = watchFaceSession(deviceId, data => {
        const currentSession = String(data?.status || 'WAIT_LOGIN');
        setSession(currentSession);
        setProgress(String(data?.progress || ''));
      });
      return () => {
        try { unsub(); } catch {}
        try { watch.current?.(); } catch {}
        watch.current = null;
      };
    } catch (e) {
      console.warn('Face session watch error:', e);
    }
  }, [deviceId]);

  const executeEnroll = useCallback(async () => {
    if (!deviceId || working) return;
    setWorking(true);
    setError('');
    setSuccessNotice('');

    try {
      const commandId = await requestFaceEnrollment(deviceId);
      watch.current?.();
      watch.current = watchFaceCommand(deviceId, commandId, data => {
        const status = String(data?.status || 'PENDING');
        setProgress(String(data?.progress || ''));

        if (status === 'FAILED' || status === 'SUCCEEDED') {
          setWorking(false);
          if (status === 'FAILED') {
            const rawErr = String(data?.error || '');
            setError(formatFaceError(rawErr));
          } else if (status === 'SUCCEEDED') {
            setSuccessNotice('Đăng ký khuôn mặt thành công trên Pi 4! Hãy ngồi trước camera để tự động kích hoạt phiên.');
            refreshTemplateStatus();
          }
          watch.current?.();
          watch.current = null;
        }
      });
    } catch (e: any) {
      setError(e.message || String(e));
      setWorking(false);
    }
  }, [deviceId, working, refreshTemplateStatus]);

  const handleExecuteReset = async () => {
    const targetUid = getEffectiveUid();
    if (!targetUid) return;
    setIsResetting(true);
    setError('');
    try {
      const ok = await deleteFaceTemplate(targetUid);
      if (ok) {
        setCapturedFaceImage(null);
        setShowConfirmReset(false);
        setSuccessNotice('Đã xóa mẫu khuôn mặt cũ thành công!');
        await refreshTemplateStatus();
      } else {
        setError('Không thể xóa mẫu khuôn mặt trên Firestore.');
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsResetting(false);
    }
  };

  const isVerified = session === 'VERIFIED';
  const hasVector = templateStatus?.hasVector ?? false;

  // Initial letter for big circle avatar
  const initialLetter = (currentUser?.fullName || currentUser?.username || 'U').charAt(0).toUpperCase();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0c221a] border border-emerald-500/20 text-white shadow-xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
      {/* Background ambient lighting */}
      <div className="absolute right-0 top-0 w-44 h-44 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

      {/* 1. TOP HEADER: Large Circular Avatar + Rank + XP (Image_ee54c780.png style) */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          {/* Avatar: If camera snapshot exists, show it; else big orange circle with letter T */}
          {capturedFaceImage ? (
            <div 
              onClick={() => setIsFaceViewerOpen(true)}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-teal-400 bg-slate-900 shadow-md cursor-pointer shrink-0 hover:ring-2 hover:ring-teal-300 transition"
              title="Xem ảnh khuôn mặt đã chụp từ Pi 4"
            >
              <img src={capturedFaceImage} alt="Face" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-amber-600 to-orange-500 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              {initialLetter}
            </div>
          )}

          <div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-950/80 border border-teal-500/40 text-teal-300 text-[10px] font-bold">
              <Sparkles className="w-3 h-3 text-teal-400" />
              <span>{currentUser?.role === 'admin' ? 'Quản Trị Viên' : 'Chuyên Viên'}</span>
            </div>

            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {isVerified ? '100' : '0'}
              </span>
              <span className="text-xs font-bold text-teal-400 font-mono">XP</span>
            </div>

            <p className="text-[11px] text-emerald-200/60 font-mono">
              {isVerified ? 'Phiên làm việc đã kích hoạt' : 'Cần xác thực để lên Scholar'}
            </p>
          </div>
        </div>

        {/* Live Session Status Pill */}
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            isVerified 
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
              : session === 'REVERIFY_REQUIRED'
              ? 'bg-amber-950/90 text-amber-300 border-amber-500/40'
              : 'bg-slate-900/90 text-slate-300 border-slate-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isVerified ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
            <span>{isVerified ? 'VERIFIED' : session === 'REVERIFY_REQUIRED' ? 'Tạm khóa' : 'WAIT_LOGIN'}</span>
          </span>
          <span className="text-[10px] text-emerald-200/50 font-mono">
            {deviceId || 'Chưa gán'}
          </span>
        </div>
      </div>

      {/* 2. MILESTONE LINE: Rookie -> Scholar -> Achiever -> Expert -> Master */}
      <div className="relative z-10 py-1">
        <div className="relative flex items-center justify-between">
          {/* Horizontal line */}
          <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-950 border-t border-emerald-800/30 -z-0" />
          
          {[
            { id: 'rookie', label: 'Rookie', active: true },
            { id: 'scholar', label: 'Scholar', active: isVerified },
            { id: 'achiever', label: 'Achiever', active: false },
            { id: 'expert', label: 'Expert', active: false },
            { id: 'master', label: 'Master', active: false },
          ].map((m, idx) => (
            <div key={m.id} className="relative z-10 flex flex-col items-center">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 transition-all ${
                m.active 
                  ? 'bg-teal-400 border-teal-200 shadow-sm shadow-teal-400' 
                  : 'bg-[#081b15] border-emerald-900'
              }`}>
                {m.active && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
              </div>
              <span className={`text-[9px] mt-1 font-mono ${m.active ? 'text-teal-300 font-bold' : 'text-emerald-200/40'}`}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. FACE VERIFICATION & SFace YUNET STATUS (Replacing XP earnings text) */}
      <div className="relative z-10 p-3 rounded-2xl bg-[#081b15]/90 border border-emerald-500/20 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-emerald-100/90 font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Mẫu khuôn mặt SFace (YuNet):</span>
          </span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
            hasVector 
              ? 'bg-teal-950 text-teal-300 border-teal-500/30'
              : 'bg-amber-950 text-amber-300 border-amber-500/30'
          }`}>
            {hasVector ? '✓ Đã có vector 128D' : 'Chưa có mẫu'}
          </span>
        </div>

        <p className="text-[11px] text-emerald-200/60 leading-snug">
          {hasVector 
            ? 'Raspberry Pi 4 tự động quét và xác thực khi bạn ngồi trước bàn làm việc.'
            : 'Hãy đăng ký mẫu khuôn mặt qua camera Raspberry Pi 4 để kích hoạt tự động.'}
        </p>

        {/* Action buttons inside card */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={executeEnroll}
            disabled={working || !deviceId}
            className="flex-1 py-2 px-3 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{working ? 'Đang ghi nhận...' : 'Đăng Ký Mẫu (Pi 4)'}</span>
          </button>

          {hasVector && (
            <button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              disabled={isResetting}
              className="py-2 px-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-200 text-xs font-semibold transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              Đặt lại
            </button>
          )}

          {capturedFaceImage && (
            <button
              type="button"
              onClick={() => setIsFaceViewerOpen(true)}
              className="p-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/50 text-teal-300 transition cursor-pointer"
              title="Phóng to ảnh khuôn mặt"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-rose-400 bg-rose-950/60 p-2 rounded-xl border border-rose-800/40">
            {error}
          </p>
        )}
        {successNotice && (
          <p className="text-[11px] text-teal-300 bg-teal-950/60 p-2 rounded-xl border border-teal-800/40">
            {successNotice}
          </p>
        )}
      </div>

      {/* 4. BOTTOM XP / STREAK STATS (Exact matching image_ee54c780.png) */}
      <div className="relative z-10 grid grid-cols-2 gap-2.5 pt-1">
        <div className="p-3 rounded-xl bg-[#081b15]/70 border border-emerald-500/10">
          <span className="text-[10px] text-emerald-200/50 font-mono block">Hôm nay</span>
          <span className="text-sm font-extrabold text-teal-400 font-mono">
            {isVerified ? '+100 XP' : '+0 XP'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#081b15]/70 border border-emerald-500/10">
          <span className="text-[10px] text-emerald-200/50 font-mono block">Chuỗi ngày</span>
          <div className="flex items-center gap-1 text-sm font-extrabold text-amber-400 font-mono">
            <Flame className="w-3.5 h-3.5 fill-amber-400" />
            <span>{isVerified ? '1' : '0'}</span>
          </div>
        </div>
      </div>

      {/* Modal Confirm Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0b221a] border border-emerald-500/30 rounded-2xl p-5 max-w-sm w-full text-white space-y-3">
            <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Xác nhận xóa mẫu khuôn mặt?</span>
            </h4>
            <p className="text-xs text-emerald-100/70">
              Mẫu vector 128D cũ sẽ bị gỡ bỏ khỏi Firestore. Bạn sẽ cần nhìn vào camera Pi 4 để đăng ký lại.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1.5 rounded-xl bg-emerald-950 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={isResetting}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                {isResetting ? 'Đang xóa...' : 'Xóa mẫu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Zoomed Image */}
      {isFaceViewerOpen && capturedFaceImage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b221a] border border-emerald-500/30 rounded-3xl p-5 max-w-md w-full text-white space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
              <span className="text-xs font-bold text-teal-300">Ảnh khuôn mặt (Camera Pi 4)</span>
              <button
                type="button"
                onClick={() => setIsFaceViewerOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full h-64 rounded-2xl overflow-hidden border border-teal-500/30 bg-black">
              <img src={capturedFaceImage} alt="Face zoomed" className="w-full h-full object-contain" />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsFaceViewerOpen(false)}
                className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
