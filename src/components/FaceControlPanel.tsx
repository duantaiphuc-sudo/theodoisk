// Place in src/components/FaceControlPanel.tsx, then render
// <FaceControlPanel deviceId={currentUser?.deviceId || currentUser?.device || ''} />
import React, { useEffect, useRef, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import {
  requestFaceEnrollment, requestFaceVerification, requestFaceLogout,
  watchFaceCommand, watchFaceSession,
} from '../services/faceCommandService';
import { ScanFace, UserCheck, LogOut, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

type Command = 'ENROLL' | 'VERIFY' | 'LOGOUT';

export function FaceControlPanel({ deviceId }: { deviceId: string }) {
  const [session, setSession] = useState('WAIT_LOGIN');
  const [progress, setProgress] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const watch = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const unsub = watchFaceSession(deviceId, data => {
      setSession(String(data?.status || 'WAIT_LOGIN'));
      setProgress(String(data?.progress || ''));
    });
    return () => { unsub(); watch.current?.(); watch.current = null; };
  }, [deviceId]);

  async function execute(action: Command) {
    if (!deviceId || working) return;
    setWorking(true);
    setError('');
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
          if (status === 'FAILED') setError(String(data?.error || 'Thao tác khuôn mặt thất bại'));
          watch.current?.();
          watch.current = null;
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWorking(false);
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
            <p className="text-xs text-slate-500 mt-0.5">
              Thiết bị trạm: <span className="font-mono font-bold text-slate-700">{deviceId || 'Chưa được gán'}</span>
              {!deviceId && <span className="text-amber-700 ml-1.5">(Yêu cầu Admin gán trạm)</span>}
            </p>
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
        <div className="mt-3 flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Hàng nút thao tác với min touch target 44px */}
      <div className="mt-3.5 flex flex-wrap gap-2.5 sm:gap-3">
        <button
          type="button"
          disabled={working || !deviceId}
          onClick={() => execute('ENROLL')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 active:bg-sky-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <ScanFace className="w-4 h-4 shrink-0" />
          <span>Đăng ký khuôn mặt</span>
        </button>

        <button
          type="button"
          disabled={working || !deviceId}
          onClick={() => execute('VERIFY')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>Xác thực / Đăng nhập</span>
        </button>

        <button
          type="button"
          disabled={working || !deviceId}
          onClick={() => execute('LOGOUT')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-800 active:bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Đăng xuất thiết bị</span>
        </button>
      </div>
    </section>
  );
}
