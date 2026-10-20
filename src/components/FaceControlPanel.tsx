import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from '../services/firebase';
import {
  requestFaceEnrollment, requestFaceVerification, requestFaceLogout,
  watchFaceCommand, watchFaceSession,
} from '../services/faceCommandService';
import { checkFaceTemplateStatus, deleteFaceTemplate, FaceTemplateStatus } from '../services/faceService';
import { getCurrentUser } from '../services/authService';
import type { HealthTelemetry } from '../types';
import { 
  ScanFace, 
  RotateCcw,
  HelpCircle,
  X,
  Camera,
  Eye,
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Maximize2,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  AlertCircle,
  Zap
} from 'lucide-react';

type Command = 'ENROLL' | 'VERIFY' | 'LOGOUT';

interface FaceControlPanelProps {
  deviceId: string;
  telemetry?: HealthTelemetry;
  hasReceivedData?: boolean;
}

function formatFaceError(rawError: string): string {
  const err = (rawError || '').toUpperCase();
  if (err.includes('UNSUPPORTED_FACE_TEMPLATE')) {
    return 'Lỗi mẫu khuôn mặt (UNSUPPORTED_FACE_TEMPLATE): Hệ thống phát hiện tài khoản chưa có vector đặc trưng 128 chiều (SFace 128D) để so khớp. Vui lòng ngồi trước Camera Pi 4 và bấm nút "Đăng ký khuôn mặt (Camera Pi 4)" bên dưới để camera Pi 4 quét trực tiếp và tạo vector chuẩn.';
  }
  if (err.includes('INVALID_TEMPLATE') || err.includes('VECTOR_DIM')) {
    return 'Lỗi vector đặc trưng: Dữ liệu mẫu không đúng định dạng 128 chiều SFace của OpenCV. Vui lòng bấm "Đăng ký khuôn mặt (Camera Pi 4)" để quét lại.';
  }
  if (err.includes('TEMPLATE_EXISTS')) {
    return 'Mẫu khuôn mặt của tài khoản này đã tồn tại trên hệ thống. Để quét lại khuôn mặt mới, vui lòng bấm nút "Đặt lại mẫu khuôn mặt" bên dưới để xóa mẫu cũ trước.';
  }
  if (err.includes('VERIFY_FAILED')) {
    return 'Xác thực không thành công (0/3 frame khớp): Khuôn mặt trước camera Pi 4 không khớp với mẫu đã lưu của tài khoản này. Vui lòng nhìn thẳng vào camera Pi hoặc bấm "Đặt lại mẫu khuôn mặt" để quét lại.';
  }
  if (err.includes('NO_FACE') || err.includes('FACE_NOT_FOUND')) {
    return 'Camera Pi 4 không phát hiện khuôn mặt nào trong khung hình. Vui lòng ngồi thẳng vào giữa camera.';
  }
  if (err.includes('CAMERA_ERROR')) {
    return 'Lỗi kết nối camera trên Raspberry Pi 4. Vui lòng kiểm tra lại cáp cắm USB camera.';
  }
  return rawError || 'Thao tác khuôn mặt thất bại';
}

export function FaceControlPanel({ deviceId, telemetry, hasReceivedData }: FaceControlPanelProps) {
  const [session, setSession] = useState('WAIT_LOGIN');
  const [progress, setProgress] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  
  // Trạng thái mẫu khuôn mặt từ Firestore (được chụp và gửi từ Pi 4)
  const [templateStatus, setTemplateStatus] = useState<FaceTemplateStatus | null>(null);
  const [capturedFaceImage, setCapturedFaceImage] = useState<string | null>(null);
  
  // Điều khiển ẩn/hiện khung xem ảnh chụp khuôn mặt từ Pi (mặc định thu gọn)
  const [isFaceViewerOpen, setIsFaceViewerOpen] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [isModalZoomOpen, setIsModalZoomOpen] = useState(false);
  
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Tham chiếu tự động xác thực và đăng xuất
  const lastAutoVerifyAttemptRef = useRef<number>(0);
  const lastAutoLogoutAttemptRef = useRef<number>(0);
  const consecutiveAbsentTicksRef = useRef<number>(0);
  const isAutoExecutingRef = useRef<boolean>(false);

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
      console.warn('FaceControlPanel error:', e);
    }
  }, [deviceId]);

  const execute = useCallback(async (action: Command, isAuto = false) => {
    if (!deviceId || working) return;
    setWorking(true);
    isAutoExecutingRef.current = isAuto;
    if (!isAuto) {
      setError('');
      setSuccessNotice('');
    }
    setCommandStatus(isAuto ? `Đang tự động ${action === 'VERIFY' ? 'xác thực...' : 'đăng xuất...'}` : 'PENDING');
    
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
          isAutoExecutingRef.current = false;
          
          if (status === 'FAILED') {
            const rawErr = String(data?.error || '');
            if (!isAuto) {
              setError(formatFaceError(rawErr));
            } else {
              // Trong chế độ tự động, chỉ ghi nhận nhẹ nhàng không làm phiền người dùng
              if (rawErr.includes('NO_FACE')) {
                setProgress('Đang chờ người dùng trước camera Pi 4...');
              } else if (rawErr.includes('VERIFY_FAILED')) {
                setProgress('Đang chờ khuôn mặt khớp với tài khoản...');
              }
            }
          } else if (status === 'SUCCEEDED') {
            if (action === 'ENROLL') {
              setSuccessNotice('Đăng ký khuôn mặt thành công trên Pi 4! Đã lưu vector 128 chiều SFace và ảnh chụp. Bạn có thể bấm "Xem ảnh đã chụp" để kiểm tra ảnh.');
              refreshTemplateStatus();
              setIsFaceViewerOpen(true);
            } else if (action === 'VERIFY') {
              setSuccessNotice(isAuto ? '⚡ Đã tự động nhận diện khuôn mặt và kích hoạt phiên làm việc!' : 'Xác thực khuôn mặt thành công! Phiên làm việc đã kích hoạt.');
              setError('');
            } else if (action === 'LOGOUT') {
              setSuccessNotice(isAuto ? '⚡ Đã tự động đăng xuất thiết bị do người dùng vắng mặt.' : 'Đã đăng xuất thiết bị an toàn.');
            }
          }
          watch.current?.();
          watch.current = null;
        }
      });
    } catch (e) {
      if (!isAuto) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setWorking(false);
      isAutoExecutingRef.current = false;
    }
  }, [deviceId, working, refreshTemplateStatus]);

  // =========================================================================
  // TỰ ĐỘNG XÁC THỰC KHI CÓ NGƯỜI & TỰ ĐỘNG ĐĂNG XUẤT KHI VẮNG MẶT
  // =========================================================================
  useEffect(() => {
    if (!deviceId || working || isResetting) return;

    const hasVector = templateStatus?.hasVector === true;
    const now = Date.now();

    // Xác định trạng thái vắng mặt từ gói telemetry nhận từ Firebase
    const isExplicitlyAbsent = Boolean(
      telemetry && (
        telemetry.postureStatus === 2 || 
        (telemetry.inZone === false && telemetry.trackingActive === false) ||
        (telemetry.postureLabel && (
          telemetry.postureLabel.toLowerCase().includes('vắng') || 
          telemetry.postureLabel.toLowerCase().includes('ngoài vùng') ||
          telemetry.postureLabel.toLowerCase().includes('absent')
        ))
      )
    );

    // TRƯỜNG HỢP 1: KHI CÓ NGƯỜI THÌ TỰ ĐỘNG XÁC THỰC
    // Điều kiện: Phiên chưa VERIFIED, tài khoản đã có mẫu vector SFace 128D, 
    // và nhận được tín hiệu dữ liệu từ Firebase mà không phải là vắng mặt
    const isVerifiedSession = session === 'VERIFIED';
    const isWaitOrReverify = session === 'WAIT_LOGIN' || session === 'REVERIFY_REQUIRED';

    if (isWaitOrReverify && hasVector) {
      const isPersonDetected = !isExplicitlyAbsent && (
        hasReceivedData || 
        (telemetry && (telemetry.bpm > 0 || telemetry.postureStatus >= 0 || telemetry.inZone || telemetry.trackingActive))
      );

      if (isPersonDetected) {
        // Giới hạn tần suất thử tự động xác thực: tối thiểu cách nhau 12 giây
        if (now - lastAutoVerifyAttemptRef.current > 12000) {
          lastAutoVerifyAttemptRef.current = now;
          execute('VERIFY', true);
        }
      }
    }

    // TRƯỜNG HỢP 2: KHI VẮNG MẶT THÌ TỰ ĐỘNG ĐĂNG XUẤT
    // Điều kiện: Phiên đang VERIFIED, nhưng dữ liệu telemetry gửi về liên tục báo vắng mặt
    if (isVerifiedSession && telemetry) {
      if (isExplicitlyAbsent) {
        consecutiveAbsentTicksRef.current += 1;
        // Xác nhận vắng mặt liên tục qua 3 nhịp cập nhật (~5-8 giây) để tránh giật lag khi đổi tư thế
        if (consecutiveAbsentTicksRef.current >= 3) {
          if (now - lastAutoLogoutAttemptRef.current > 15000) {
            lastAutoLogoutAttemptRef.current = now;
            consecutiveAbsentTicksRef.current = 0;
            execute('LOGOUT', true);
          }
        }
      } else {
        // Người dùng đã quay lại hoặc đang ngồi đúng vị trí
        consecutiveAbsentTicksRef.current = 0;
      }
    }
  }, [deviceId, session, telemetry, hasReceivedData, templateStatus?.hasVector, working, isResetting, execute]);

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
        setCapturedFaceImage(null);
        setShowConfirmReset(false);
        setIsFaceViewerOpen(false);
        setSuccessNotice('Đã xóa mẫu khuôn mặt cũ thành công! Hãy ngồi thẳng trước camera Pi 4 và bấm nút "Đăng ký khuôn mặt (Camera Pi 4)".');
        await refreshTemplateStatus();
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

  const hasVector = templateStatus?.hasVector === true;
  const hasImageOnly = templateStatus?.hasImage === true && !hasVector;

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
              Xác thực khuôn mặt Camera Pi 4 (SFace YuNet)
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

      {/* THANH TRẠNG THÁI MẪU KHUÔN MẶT THU GỌN */}
      <div className="mt-3.5 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Thumbnail ảnh chụp từ Pi nếu có */}
          {capturedFaceImage ? (
            <button
              type="button"
              onClick={() => setIsFaceViewerOpen(prev => !prev)}
              className="w-9 h-9 rounded-lg overflow-hidden border border-sky-300 shrink-0 bg-slate-900 shadow-xs cursor-pointer hover:ring-2 hover:ring-sky-400 transition"
              title="Nhấn để xem lại ảnh do Camera Pi 4 chụp"
            >
              <img src={capturedFaceImage} alt="Ảnh do Pi 4 chụp" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0 text-slate-500">
              <Camera className="w-4 h-4" />
            </div>
          )}

          {/* Nhãn trạng thái mẫu */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-800">Mẫu nhận diện:</span>
              {hasVector ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Đã có vector 128D (SFace Pi 4)
                </span>
              ) : hasImageOnly ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-bold">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Chỉ có ảnh (Chưa có vector 128D)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium">
                  Chưa có mẫu khuôn mặt
                </span>
              )}
            </div>
            
            <span className="text-[10px] text-slate-500 mt-0.5">
              {capturedFaceImage 
                ? 'Đã lưu trữ ảnh chụp từ Camera Pi 4 trên Firestore.'
                : 'Ngồi trước Camera Pi 4 rồi bấm nút "Đăng ký khuôn mặt (Camera Pi 4)" bên dưới.'}
            </span>
          </div>
        </div>

        {/* Nút Xem lại ảnh đã chụp (Chỉ hiện khi ấn mới mở bung ra) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {capturedFaceImage && (
            <button
              type="button"
              onClick={() => setIsFaceViewerOpen(prev => !prev)}
              className="min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold shadow-xs transition cursor-pointer"
              title="Xem lại ảnh khuôn mặt do Camera Pi 4 chụp"
            >
              <Eye className="w-3.5 h-3.5 text-sky-600" />
              <span>{isFaceViewerOpen ? 'Thu gọn ảnh' : 'Xem ảnh đã chụp'}</span>
              {isFaceViewerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExplanationOpen(prev => !prev)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
            title="Xem cơ chế lưu và tự động xác thực"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* THANH CHỈ BÁO CƠ CHẾ TỰ ĐỘNG THÔNG MINH */}
      <div className="mt-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-sky-100 text-sky-700">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-slate-800">Cơ chế tự động:</span>
          <span className="text-slate-600">
            {isVerified
              ? 'Tự động duy trì phiên & tự động đăng xuất khi vắng mặt'
              : hasVector
              ? 'Tự động quét & xác thực ngay khi có người ngồi trước camera'
              : 'Đăng ký khuôn mặt trước để kích hoạt cơ chế tự động'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
            isVerified 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isVerified ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {isVerified ? 'Đã kết nối phiên' : 'Chờ người trước camera'}
          </span>
        </div>
      </div>

      {/* KHUNG GIẢI THÍCH CHI TIẾT CÁCH HOẠT ĐỘNG (Ẩn/Hiện khi bấm icon Info) */}
      {isExplanationOpen && (
        <div className="mt-3 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 leading-relaxed animate-fadeIn">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <p className="font-bold text-indigo-900">Cơ chế nhận diện tự động & lưu ảnh Camera Pi 4:</p>
              <p className="text-slate-700">
                1. <b>Tự động xác thực:</b> Khi bạn ngồi trước camera Raspberry Pi 4, hệ thống Web nhận diện sự có mặt và tự động kích hoạt nhận dạng khuôn mặt (SFace 128D) để mở khóa phiên làm việc.
              </p>
              <p className="text-slate-700">
                2. <b>Tự động đăng xuất:</b> Khi bạn đứng dậy rời khỏi trạm (vắng mặt quá thời gian quy định), hệ thống tự động khóa phiên và ẩn dữ liệu sinh trắc học để bảo mật.
              </p>
              <p className="text-slate-700">
                3. <b>Xem lại ảnh:</b> Ảnh khuôn mặt do camera Pi 4 chụp trong lần đăng ký được lưu tại Firestore và hiển thị qua nút <b>"Xem ảnh đã chụp"</b>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsExplanationOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* KHUNG XEM LẠI ẢNH ĐÃ CHỤP TỪ CAMERA PI 4 (CHỈ HIỆN KHI ẤN XEM, CÒN LẠI THU GỌN HOÀN TOÀN) */}
      {isFaceViewerOpen && capturedFaceImage && (
        <div className="mt-3.5 p-4 rounded-xl bg-slate-50 border border-slate-200 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-sky-600" />
              <span>Ảnh khuôn mặt do Camera Raspberry Pi 4 chụp</span>
            </span>
            <button
              type="button"
              onClick={() => setIsFaceViewerOpen(false)}
              className="min-h-8 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-white border border-slate-200 transition cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Thu gọn lại</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Ảnh chụp từ Pi */}
            <div className="relative group shrink-0">
              <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-xl overflow-hidden border-2 border-sky-400 bg-slate-900 shadow-sm relative">
                <img 
                  src={capturedFaceImage} 
                  alt="Ảnh do Camera Pi 4 chụp" 
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={() => setIsModalZoomOpen(true)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-semibold cursor-pointer"
                  title="Bấm để phóng to xem chi tiết"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Phóng to</span>
                </button>
              </div>
              <span className={`absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full text-white text-[10px] font-bold shadow-xs flex items-center gap-1 border border-white ${
                hasVector ? 'bg-emerald-600' : 'bg-amber-600'
              }`}>
                {hasVector ? '✓ SFace 128D' : 'Ảnh mẫu Pi 4'}
              </span>
            </div>

            {/* Thông số kỹ thuật của mẫu */}
            <div className="flex-1 text-xs text-slate-600 space-y-2 w-full">
              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Tài khoản:</span>
                  <span className="font-semibold text-slate-900">{currentUser?.fullName || 'Người dùng'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nguồn chụp:</span>
                  <span className="font-semibold text-sky-700 flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Camera USB Raspberry Pi 4
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Mô hình nhận diện:</span>
                  <span className="font-mono text-indigo-700">{templateStatus?.model || 'opencv_sface_2021dec'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Vector đặc trưng:</span>
                  <span className={`font-semibold ${hasVector ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {hasVector ? '128 chiều float32 (Hợp lệ)' : 'Chưa có vector (Cần quét lại)'}
                  </span>
                </div>
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalZoomOpen(true)}
                  className="min-h-9 inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Phóng to toàn màn hình</span>
                </button>

                <a
                  href={capturedFaceImage}
                  download="anh-khuon-mat-pi4.jpg"
                  className="min-h-9 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh về máy</span>
                </a>

                <button
                  type="button"
                  onClick={() => setIsFaceViewerOpen(false)}
                  className="min-h-9 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer ml-auto"
                >
                  <span>Thu gọn khung này</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thông báo tiến trình lệnh hoặc lỗi */}
      {commandStatus && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
          <Loader2 className={`w-3.5 h-3.5 text-indigo-600 ${working ? 'animate-spin' : ''}`} />
          <span>Tiến trình lệnh: <b className="font-mono">{commandStatus}</b></span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl leading-relaxed animate-fadeIn" role="alert">
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

      {/* Hộp xác nhận xóa mẫu inline */}
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
              className="min-h-11 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Đang xóa...' : 'Xóa mẫu cũ'}</span>
            </button>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setShowConfirmReset(false)}
              className="min-h-11 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy</span>
            </button>
          </div>
        </div>
      )}

      {/* HÀNG NÚT THAO TÁC CÒN LẠI (ĐÃ BỎ CÁC NÚT THỦ CÔNG XÁC THỰC/ĐĂNG XUẤT) */}
      <div className="mt-3.5 flex flex-wrap gap-2.5 sm:gap-3">
        {/* Nút đăng ký chính qua Camera Pi 4 (Giữ lại để đăng ký mẫu ban đầu) */}
        <button
          type="button"
          disabled={working || isResetting || !deviceId}
          onClick={() => execute('ENROLL')}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 hover:bg-sky-800 active:bg-sky-900 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          title="Yêu cầu camera Raspberry Pi 4 chụp và tạo vector khuôn mặt 128 chiều"
        >
          <ScanFace className="w-4 h-4 shrink-0" />
          <span>Đăng ký khuôn mặt (Camera Pi 4)</span>
        </button>

        {/* Nút đặt lại mẫu khuôn mặt */}
        <button
          type="button"
          disabled={working || isResetting}
          onClick={() => setShowConfirmReset(prev => !prev)}
          className={`min-h-11 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer border ${
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

      {/* MODAL PHÓNG TO ẢNH KHUÔN MẶT ĐÃ CHỤP TỪ PI 4 */}
      {isModalZoomOpen && capturedFaceImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scaleUp">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs sm:text-sm font-bold tracking-tight">Ảnh khuôn mặt từ Camera Pi 4</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsModalZoomOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-950 flex flex-col items-center justify-center">
              <div className="max-h-96 w-full rounded-xl overflow-hidden flex items-center justify-center bg-black">
                <img 
                  src={capturedFaceImage} 
                  alt="Ảnh chi tiết từ Camera Pi 4" 
                  className="max-h-96 max-w-full object-contain"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {hasVector ? '✓ Mẫu SFace 128 chiều' : 'Ảnh mẫu Pi 4'}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={capturedFaceImage}
                  download="anh-khuon-mat-pi4.jpg"
                  className="min-h-10 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải ảnh</span>
                </a>
                <button
                  type="button"
                  onClick={() => setIsModalZoomOpen(false)}
                  className="min-h-10 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition cursor-pointer"
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
