import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from '../services/firebase';
import {
  requestFaceEnrollment, requestFaceVerification, requestFaceLogout,
  watchFaceCommand, watchFaceSession,
} from '../services/faceCommandService';
import { checkHasFaceTemplate, deleteFaceTemplate } from '../services/faceService';
import { getCurrentUser } from '../services/authService';
import { 
  ScanFace, 
  UserCheck, 
  LogOut, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert,
  RotateCcw,
  Sparkles,
  HelpCircle,
  X
} from 'lucide-react';

type Command = 'ENROLL' | 'VERIFY' | 'LOGOUT';

function formatFaceError(rawError: string): string {
  const err = (rawError || '').toUpperCase();
  if (err.includes('TEMPLATE_EXISTS')) {
    return 'Mẫu khuôn mặt của tài khoản này đã tồn tại trên hệ thống. Để quét lại khuôn mặt mới, vui lòng bấm nút "Đặt lại mẫu khuôn mặt" bên dưới để xóa mẫu cũ trước.';
  }
  if (err.includes('VERIFY_FAILED')) {
    return 'Xác thực không thành công (0/3 frame khớp): Khuôn mặt trước camera không khớp với mẫu đã lưu của tài khoản này. Vui lòng nhìn thẳng vào camera hoặc bấm "Đặt lại mẫu khuôn mặt" để quét lại.';
  }
  if (err.includes('NO_FACE') || err.includes('FACE_NOT_FOUND')) {
    return 'Camera không phát hiện khuôn mặt nào trong khung hình. Vui lòng ngồi thẳng vào giữa camera.';
  }
  if (err.includes('CAMERA_ERROR')) {
    return 'Lỗi kết nối camera trên Raspberry Pi 4. Vui lòng kiểm tra lại cáp cắm USB camera.';
  }
  return rawError || 'Thao tác khuôn mặt thất bại';
}

export function FaceControlPanel({ deviceId }: { deviceId: string }) {
  const [session, setSession] = useState('WAIT_LOGIN');
  const [progress, setProgress] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const watch = useRef<Unsubscribe | null>(null);

  const currentUser = getCurrentUser();

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
      const exists = await checkHasFaceTemplate(uid);
      setHasTemplate(exists);
    } catch {
      setHasTemplate(null);
    }
  }, [getEffectiveUid]);

  useEffect(() => {
    refreshTemplateStatus();
  }, [refreshTemplateStatus]);

  useEffect(() => {
    if (!deviceId) return;
    try {
      const unsub = watchFaceSession(deviceId, data => {
        setSession(String(data?.status || 'WAIT_LOGIN'));
        setProgress(String(data?.progress || ''));
      });
      return () => {
        try { unsub(); } catch {}
        try { watch.current?.(); } catch {}
        watch.current = null;
      };
    } catch (e) {
      console.warn('FaceControlPanel error:', e);
    }
  }, [deviceId]);

  async function execute(action: Command) {
    if (!deviceId || working) return;
    setWorking(true);
    setError('');
    setSuccessNotice('');
    setCommandStatus('PENDING');
    try {
      const commandId = action === 'ENROLL' ? await requestFaceEnrollment(deviceId)
        : action === 'VERIFY' ? await requestFaceVerification(deviceId)
        : await requestFaceLogout(deviceId);
      watch.current?.();
      watch.current = watchFaceCommand(deviceId, commandId, data => {
        const status = String(data?.status || 'PENDING');
        setCommandStatus(status + (data?.progress ? ` (${String(data.progress)})` : ''));
        if (status === 'FAILED' || status === 'SUCCEEDED') {
          setWorking(false);
          if (status === 'FAILED') {
            const rawErr = String(data?.error || '');
            setError(formatFaceError(rawErr));
          } else if (status === 'SUCCEEDED') {
            if (action === 'ENROLL') {
              setSuccessNotice('Đăng ký khuôn mặt thành công! Bây giờ bạn có thể bấm "Xác thực / Đăng nhập".');
              refreshTemplateStatus();
            } else if (action === 'VERIFY') {
              setSuccessNotice('Xác thực thành công! Phiên làm việc đã kích hoạt.');
            } else if (action === 'LOGOUT') {
              setSuccessNotice('Đã đăng xuất thiết bị an toàn.');
            }
          }
          watch.current?.();
          watch.current = null;
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWorking(false);
    }
  }

  async function handleExecuteReset() {
    const targetUid = getEffectiveUid();
    if (!targetUid) {
      setError('Không tìm thấy UID tài khoản để xóa mẫu khuôn mặt. Vui lòng đăng nhập lại.');
      return;
    }

    setIsResetting(true);
    setError('');
    setSuccessNotice('');
    try {
      const ok = await deleteFaceTemplate(targetUid);
      if (ok) {
        setHasTemplate(false);
        setShowConfirmReset(false);
        setSuccessNotice('Đã xóa mẫu khuôn mặt cũ thành công! Hãy ngồi thẳng trước camera Pi 4 và bấm nút "Đăng ký khuôn mặt".');
        setTimeout(() => refreshTemplateStatus(), 1000);
      } else {
        setError('Không thể xóa mẫu khuôn mặt trên Firestore. Vui lòng kiểm tra quyền tài khoản.');
      }
    } catch (err: any) {
      setError('Lỗi khi xóa mẫu: ' + (err.message || String(err)));
    } finally {
      setIsResetting(false);
    }
  }

  const isVerified = session === 'VERIFIED';
  const isWaitLogin = session === 'WAIT_LOGIN';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-all hover:border-slate-300" aria-label="Xác thực khuôn mặt">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isVerified 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          }`}>
            <ScanFace className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Xác thực khuôn mặt Raspberry Pi (Ver 5)
              {isVerified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đã xác thực
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>
                Thiết bị trạm: <span className="font-mono font-bold text-slate-700">{deviceId || 'Chưa được gán'}</span>
                {!deviceId && <span className="text-amber-700 ml-1.5">(Yêu cầu Admin gán trạm)</span>}
              </span>
              {hasTemplate !== null && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  hasTemplate 
                    ? 'bg-sky-50 text-sky-800 border-sky-200' 
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {hasTemplate ? 'Đã có mẫu khuôn mặt' : 'Chưa có mẫu khuôn mặt'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Trạng thái phiên làm việc */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <span className="text-xs text-slate-500 font-medium">Phiên IoT:</span>
          <span 
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
              isVerified
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : isWaitLogin
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
            role="status"
          >
            {isVerified ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : isWaitLogin ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
            )}
            <span>
              {session === 'VERIFIED' ? 'ĐÃ XÁC THỰC' : session === 'WAIT_LOGIN' ? 'CHỜ XÁC THỰC' : session}
              {progress ? ` (${progress})` : ''}
            </span>
          </span>
        </div>
      </div>

      {/* Thông báo tiến trình lệnh hoặc lỗi */}
      {commandStatus && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
          <Loader2 className={`w-3.5 h-3.5 text-indigo-600 ${working ? 'animate-spin' : ''}`} />
          <span>Tiến trình lệnh: <b className="font-mono">{commandStatus}</b></span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl leading-relaxed" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">{error}</span>
          </div>
        </div>
      )}

      {successNotice && (
        <div className="mt-3 flex items-start gap-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl leading-relaxed animate-fadeIn" role="status">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">{successNotice}</span>
          </div>
        </div>
      )}

      {/* Hộp xác nhận xóa mẫu inline không dùng window.confirm */}
      {showConfirmReset && (
        <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-2 text-amber-950 font-medium">
            <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Xác nhận xóa mẫu khuôn mặt cũ của tài khoản để đăng ký lại từ đầu?</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              disabled={isResetting}
              onClick={handleExecuteReset}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Đang xóa...' : 'Xóa mẫu cũ'}</span>
            </button>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setShowConfirmReset(false)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy</span>
            </button>
          </div>
        </div>
      )}

      {/* Hàng nút thao tác với min touch target 44px */}
      <div className="mt-3.5 flex flex-wrap gap-2.5 sm:gap-3">
        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('ENROLL')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 active:bg-sky-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <ScanFace className="w-4 h-4 shrink-0" />
          <span>Đăng ký khuôn mặt</span>
        </button>

        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('VERIFY')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>Xác thực / Đăng nhập</span>
        </button>

        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('LOGOUT')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-800 active:bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Đăng xuất thiết bị</span>
        </button>

        {/* Nút đặt lại mẫu khuôn mặt */}
        <button
          type="button"
          disabled={working || isResetting}
          onClick={() => setShowConfirmReset(prev => !prev)}
          className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border ${
            showConfirmReset 
              ? 'bg-amber-100 text-amber-950 border-amber-400' 
              : 'bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-900 border-amber-300'
          }`}
          title="Xóa mẫu khuôn mặt đã lưu của tài khoản này để quét lại mẫu mới"
        >
          <RotateCcw className={`w-4 h-4 shrink-0 text-amber-700 ${isResetting ? 'animate-spin' : ''}`} />
          <span>Đặt lại mẫu khuôn mặt (Reset)</span>
        </button>
      </div>
    </section>
  );
}
