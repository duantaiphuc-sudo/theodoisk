import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from '../services/firebase';
import {
  requestFaceEnrollment, requestFaceVerification, requestFaceLogout,
  watchFaceCommand, watchFaceSession,
} from '../services/faceCommandService';
import { checkHasFaceTemplate, deleteFaceTemplate, fetchFaceTemplate, saveFaceSnapshot } from '../services/faceService';
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
  HelpCircle,
  X,
  Camera,
  Eye,
  Download,
  Maximize2,
  Sparkles,
  VideoOff
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
  const [capturedFaceImage, setCapturedFaceImage] = useState<string | null>(null);
  const [isModalImageOpen, setIsModalImageOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  
  // Webcam web capture support (Chụp ảnh mẫu đối chiếu nhận diện cho Pi 4)
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      const tmpl = await fetchFaceTemplate(uid);
      if (tmpl && tmpl.enabled) {
        setHasTemplate(true);
        const img = tmpl.image || tmpl.snapshot;
        if (img && typeof img === 'string') {
          const formatted = img.startsWith('data:image') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`;
          setCapturedFaceImage(formatted);
        }
      } else {
        setHasTemplate(false);
      }
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

  // Clean up webcam on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startWebcam = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      setIsWebcamActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err: any) {
      setError('Không thể mở Webcam trình duyệt: ' + (err.message || 'Vui lòng cho phép quyền truy cập camera trong cài đặt trình duyệt.'));
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsWebcamActive(false);
    setReviewSnapshot(null);
  };

  // Bước 1: Chụp ảnh hiện tại từ webcam để người dùng xem lại (Review)
  const takeSnapshotForReview = () => {
    if (!videoRef.current) return;
    setError('');
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể tạo canvas chụp ảnh');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      setReviewSnapshot(base64);
    } catch (e: any) {
      setError('Lỗi khi chụp khung hình: ' + (e.message || String(e)));
    }
  };

  // Bước 2a: Chụp lại (Hủy ảnh đang review, tiếp tục phát video trực tiếp)
  const retakeSnapshot = () => {
    setReviewSnapshot(null);
    setError('');
    if (videoRef.current && streamRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Bước 2b: Lưu ảnh đã review lên hệ thống (Dùng cho Raspberry Pi 4 đối chiếu nhận diện thực tế, KHÔNG đổi avatar)
  const saveReviewedSnapshot = async () => {
    if (!reviewSnapshot) return;
    setIsSavingSnapshot(true);
    setError('');
    try {
      const uid = getEffectiveUid();
      if (!uid) throw new Error('Không tìm thấy UID tài khoản người dùng.');

      // Lưu vào collection face_templates/{uid} cho Raspberry Pi 4 tải về đối chiếu
      await saveFaceSnapshot(uid, reviewSnapshot);
      setCapturedFaceImage(reviewSnapshot);
      setHasTemplate(true);
      setSuccessNotice('Đã lưu ảnh khuôn mặt mẫu thành công! Khi hệ thống bật, Raspberry Pi 4 sẽ lấy ảnh này để đối chiếu nhận diện thực tế.');
      stopWebcam();
    } catch (e: any) {
      setError('Lỗi khi lưu ảnh mẫu khuôn mặt: ' + (e.message || String(e)));
    } finally {
      setIsSavingSnapshot(false);
    }
  };

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

        // Kiểm tra xem Pi 4 có gửi kèm ảnh chụp khuôn mặt base64 không
        const rawImg = (data as any)?.image || (data as any)?.snapshot || (data as any)?.face_image || (data as any)?.frame;
        if (typeof rawImg === 'string' && rawImg.length > 30) {
          const formatted = rawImg.startsWith('data:image') || rawImg.startsWith('http') ? rawImg : `data:image/jpeg;base64,${rawImg}`;
          setCapturedFaceImage(formatted);
        }

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
        setCapturedFaceImage(null);
        setShowConfirmReset(false);
        setSuccessNotice('Đã xóa mẫu khuôn mặt cũ thành công! Hãy ngồi thẳng trước camera và bấm nút "Đăng ký khuôn mặt".');
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
      {/* Header Panel */}
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
              Xác thực khuôn mặt Camera (SFace YuNet)
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
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
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

      {/* KHUNG HIỂN THỊ HÌNH ẢNH KHUÔN MẶT ĐÃ CHỤP TỪ CAMERA */}
      <div className="mt-4 p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-sky-600" />
            <span>Hình ảnh khuôn mặt đã chụp & đăng ký</span>
          </span>
          <div className="flex items-center gap-2">
            {!isWebcamActive ? (
              <button
                type="button"
                onClick={startWebcam}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                title="Bật webcam trên trình duyệt để chụp ảnh trực tiếp"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Chụp bằng Webcam Web</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopWebcam}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <VideoOff className="w-3.5 h-3.5 text-rose-500" />
                <span>Tắt Webcam</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Webcam Stream Area or Review Area */}
        {isWebcamActive && (
          <div className="mb-4 p-3.5 bg-slate-900 rounded-xl flex flex-col items-center justify-center text-white relative overflow-hidden animate-fadeIn">
            {!reviewSnapshot ? (
              // Trạng thái 1: Webcam đang phát trực tiếp để người dùng căn chỉnh khuôn mặt
              <>
                <div className="relative w-full max-w-[420px] aspect-4/3 rounded-lg overflow-hidden border-2 border-sky-400 bg-black flex items-center justify-center">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  />
                  {/* Khung ngắm khuôn mặt */}
                  <div className="absolute inset-4 border border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
                    <div className="w-28 h-28 border-2 border-dashed border-sky-400/80 rounded-full animate-pulse"></div>
                  </div>
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    Webcam Trực Tiếp
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 mt-2 text-center">
                  Nhìn thẳng vào webcam, đảm bảo đủ ánh sáng rồi bấm <b>"Chụp ảnh"</b> để xem lại trước khi lưu.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={takeSnapshotForReview}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Chụp ảnh</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopWebcam}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </>
            ) : (
              // Trạng thái 2: Đã chụp, hiện khung để người dùng REVIEW (Xem lại) -> Lưu hoặc Chụp lại
              <>
                <div className="relative w-full max-w-[420px] aspect-4/3 rounded-lg overflow-hidden border-2 border-emerald-400 bg-black flex items-center justify-center">
                  <img 
                    src={reviewSnapshot} 
                    alt="Xem lại ảnh chụp" 
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded bg-emerald-600/90 text-[10px] font-bold text-white flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Khung xem lại ảnh (Review)
                  </span>
                </div>

                <div className="mt-2 text-center max-w-sm">
                  <p className="text-xs font-semibold text-emerald-400">
                    Ảnh chụp đã sẵn sàng! Bạn có muốn lưu ảnh này không?
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Ảnh này chỉ lưu làm mẫu đối chiếu nhận diện cho Raspberry Pi 4 khi bạn ngồi vào bàn (không phải ảnh đại diện).
                  </p>
                </div>

                <div className="mt-3.5 flex items-center gap-2.5 flex-wrap justify-center">
                  <button
                    type="button"
                    disabled={isSavingSnapshot}
                    onClick={saveReviewedSnapshot}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingSnapshot ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{isSavingSnapshot ? 'Đang lưu ảnh...' : 'Lưu ảnh này'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSnapshot}
                    onClick={retakeSnapshot}
                    className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Chụp lại</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSnapshot}
                    onClick={stopWebcam}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Image Preview & Info Grid */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          {capturedFaceImage ? (
            <div className="relative group shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border-2 border-sky-400/80 bg-slate-900 shadow-sm relative">
                <img 
                  src={capturedFaceImage} 
                  alt="Ảnh khuôn mặt đã đăng ký" 
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={() => setIsModalImageOpen(true)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-semibold cursor-pointer"
                  title="Nhấn để phóng to ảnh"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Phóng to</span>
                </button>
              </div>
              <span className="absolute -bottom-2 -right-2 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold shadow-xs flex items-center gap-1 border border-white">
                <CheckCircle2 className="w-2.5 h-2.5" /> SFace
              </span>
            </div>
          ) : (
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 flex flex-col items-center justify-center text-slate-400 shrink-0 text-center p-2">
              <Camera className="w-6 h-6 mb-1 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-500">Chưa có ảnh khuôn mặt</span>
            </div>
          )}

          {/* Details & Actions */}
          <div className="flex-1 text-xs text-slate-600 space-y-1.5 w-full">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                {capturedFaceImage ? 'Đã lưu ảnh khuôn mặt mẫu' : 'Chưa có ảnh mẫu lưu trữ'}
              </span>
              {capturedFaceImage && (
                <button
                  type="button"
                  onClick={() => setIsModalImageOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-800 hover:underline cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Xem chi tiết ảnh</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {capturedFaceImage 
                ? 'Hình ảnh này được camera Pi 4 (hoặc webcam) ghi lại và dùng thuật toán YuNet trích xuất 128 chiều đặc trưng SFace để đối soát mỗi khi bạn ngồi vào bàn làm việc.'
                : 'Để camera Pi 4 có thể tự động nhận diện bạn khi ngồi vào bàn, vui lòng bấm nút "Đăng ký khuôn mặt" hoặc dùng nút "Chụp bằng Webcam Web" ở trên.'}
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200/80 text-[10px] font-mono text-slate-700">
                Chuẩn: YuNet + SFace (OpenCV)
              </span>
              {capturedFaceImage && (
                <a
                  href={capturedFaceImage}
                  download="khuon-mat-mau.jpg"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded transition cursor-pointer"
                  title="Tải ảnh khuôn mặt về máy"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải ảnh về</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hàng nút thao tác với min touch target 44px */}
      <div className="mt-3.5 flex flex-wrap gap-2.5 sm:gap-3">
        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('ENROLL')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 active:bg-sky-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          title="Yêu cầu camera Raspberry Pi 4 chụp và tạo mẫu khuôn mặt"
        >
          <ScanFace className="w-4 h-4 shrink-0" />
          <span>Đăng ký khuôn mặt (Camera Pi 4)</span>
        </button>

        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('VERIFY')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          title="Bật camera Pi 4 để nhận diện và xác thực phiên làm việc"
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

      {/* MODAL PHÓNG TO ẢNH KHUÔN MẶT ĐÃ CHỤP */}
      {isModalImageOpen && capturedFaceImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scaleUp">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs sm:text-sm font-bold tracking-tight">Chi tiết ảnh khuôn mặt camera</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsModalImageOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col items-center">
              <div className="w-full max-h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
                <img 
                  src={capturedFaceImage} 
                  alt="Ảnh khuôn mặt chi tiết" 
                  className="max-h-[380px] w-auto object-contain"
                />
              </div>

              <div className="w-full mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tài khoản:</span>
                  <span className="font-semibold text-slate-900">{currentUser?.fullName || 'Người dùng'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Thuật toán:</span>
                  <span className="font-mono text-indigo-700">YuNet Detector + SFace 128D</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trạng thái:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Mẫu hợp lệ trên hệ thống
                  </span>
                </div>
              </div>

              <div className="w-full mt-3 flex items-center justify-end gap-2">
                <a
                  href={capturedFaceImage}
                  download="anh-khuon-mat.jpg"
                  className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh về máy</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsModalImageOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
