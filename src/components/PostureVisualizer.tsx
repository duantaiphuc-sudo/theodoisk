import React, { useState } from 'react';
import { CheckCircle, AlertOctagon, Info, CameraOff, Camera, UserX, Volume2, UserCheck } from 'lucide-react';
import { HealthTelemetry } from '../types';
import { playErgonomicVoiceAlert } from '../services/sound';

interface PostureVisualizerProps {
  telemetry: HealthTelemetry;
  hasData?: boolean;
}

export const PostureVisualizer: React.FC<PostureVisualizerProps> = ({ telemetry, hasData = true }) => {
  const { postureStatus, postureLabel, image, inZone, trackingActive } = telemetry;
  const [viewMode, setViewMode] = useState<'skeleton' | 'camera'>('skeleton');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const handleTestPostureVoice = () => {
    setIsPlayingVoice(true);
    playErgonomicVoiceAlert('posture_incorrect');
    setTimeout(() => setIsPlayingVoice(false), 2500);
  };

  // Auto switch to camera view if an image is provided from Pi 4
  React.useEffect(() => {
    if (image && viewMode === 'skeleton') {
      setViewMode('camera');
    }
  }, [image]);

  if (!hasData || postureStatus === -1) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-5 lg:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
              <span>Mô Hình & Chẩn Đoán Tư Thế</span>
              <span className="text-[11px] sm:text-xs font-normal text-slate-500">AI Skeleton Analysis</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Trực quan hóa tư thế cột sống & góc nghiêng cổ từ camera</p>
          </div>
          <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            Chờ luồng Camera Pi 4
          </span>
        </div>

        <div className="relative h-[230px] rounded-xl bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
            <CameraOff className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Chưa có dữ liệu tư thế từ Camera AI</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Hệ thống đang chờ nhận diện các mốc giải phẫu MediaPipe từ Raspberry Pi 4. Khung xương và góc gập cột sống sẽ xuất hiện ngay khi có dữ liệu.
          </p>
        </div>

        <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-600 shrink-0" />
          <span>Lời khuyên công thái học thời gian thực sẽ tự động xuất hiện khi nhận diện tư thế người ngồi.</span>
        </div>
      </div>
    );
  }

  // Ergonomic advice mapping
  const adviceMap: Record<number, { title: string; desc: string; tip: string; color: string }> = {
    0: {
      title: 'Tư thế ngồi chuẩn công thái học',
      desc: 'Cột sống ở trạng thái tự nhiên chữ S, mắt ngang 1/3 trên màn hình, góc khuỷu tay và đầu gối ~90 độ.',
      tip: 'Hãy duy trì hít thở sâu và chớp mắt thường xuyên để tránh mỏi mắt.',
      color: 'emerald',
    },
    1: {
      title: 'Cảnh báo: Cột sống đang bị gù hoặc cúi cổ',
      desc: 'Phát hiện đầu nhô về phía trước (Forward Head Posture) hoặc lưng cong quá mức tạo áp lực lên đốt sống cổ C1-C7.',
      tip: 'Hành động ngay: Đẩy lưng sát tựa ghế, nâng cằm nhẹ, điều chỉnh độ cao ghế.',
      color: 'rose',
    },
    3: {
      title: 'Nguy hiểm: Sai tư thế kéo dài liên tục!',
      desc: 'Duy trì tư thế sai hơn 60 giây gây co thắt cơ vai gáy, chèn ép dây thần kinh và suy giảm lưu thông máu.',
      tip: 'Hãy dừng công việc 30 giây: Xoay vai 5 vòng ra sau, ngửa cổ nhìn trần nhà.',
      color: 'rose',
    },
    4: {
      title: 'Cảnh báo: Ngồi một chỗ quá thời gian khuyến nghị',
      desc: 'Bạn đã ngồi làm việc liên tục vượt ngưỡng an toàn. Nguy cơ tắc nghẽn tĩnh mạch chi dưới và thoái hóa cột sống.',
      tip: 'Quy tắc 20-20-20: Đứng dậy đi lấy nước, vươn vai và nhìn xa 6 mét trong 20 giây.',
      color: 'amber',
    },
    5: {
      title: 'Tư thế đứng làm việc (Sit-Stand Mode)',
      desc: 'Bạn đang đứng làm việc. Tư thế đứng giúp giải phóng áp lực lên các đĩa đệm thắt lưng L1-L5, kích hoạt tuần hoàn máu và đốt cháy calo.',
      tip: 'Giữ hai chân vững chắc rộng bằng vai, màn hình nâng ngang tầm mắt để giữ cột sống thẳng tự nhiên.',
      color: 'indigo',
    },
    2: {
      title: 'Chưa phát hiện nhân viên trong vùng giám sát',
      desc: 'Camera AI chưa nhận diện được người ngồi trong khung hình Monitor Zone. Không có người ở bàn làm việc.',
      tip: 'Vui lòng ngồi vào vị trí làm việc trước camera để bắt đầu theo dõi tư thế tự động.',
      color: 'slate',
    },
  };

  const isOutOfZone = inZone === false || trackingActive === false;
  const isAbsent = postureStatus === 2 || isOutOfZone;

  const currentAdvice = isAbsent ? adviceMap[2] : (adviceMap[postureStatus] || adviceMap[0]);

  const isStanding = !isAbsent && postureStatus === 5;
  const isGood = !isAbsent && postureStatus === 0;
  const isBad = !isAbsent && (postureStatus === 1 || postureStatus === 3);
  const isSittingLong = !isAbsent && postureStatus === 4;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 lg:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Mô Hình & Chẩn Đoán Tư Thế</span>
            <span className="text-[11px] sm:text-xs font-normal text-slate-500">AI Skeleton Analysis</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Phân tích góc nghiêng cột sống và khoảng cách thị giác theo thời gian thực</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('skeleton')}
              title="Xem mô hình giải phẫu tư thế ngồi"
              className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'skeleton' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-sky-600" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              title="Xem hình ảnh trực tiếp từ Camera AI"
              className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'camera' ? 'bg-sky-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera</span>
              {image && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
            </button>
          </div>

          <button
            type="button"
            onClick={handleTestPostureVoice}
            disabled={isPlayingVoice}
            title="Nghe thử âm thanh nhắc nhở khi ngồi sai tư thế"
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
              isPlayingVoice
                ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlayingVoice ? 'text-rose-600' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Âm thanh nhắc:</span>
            <span>Ngồi thẳng lên</span>
          </button>

          <span className={`px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
            isAbsent ? 'bg-amber-100 text-amber-800 border-amber-300' :
            isGood ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
            isBad ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse' :
            isSittingLong ? 'bg-amber-100 text-amber-800 border-amber-300' :
            'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            {isAbsent ? 'NGOÀI VÙNG CAMERA' : postureLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Visual Container: SVG Skeleton Animation OR Real Camera Frame */}
        {viewMode === 'camera' ? (
          <div className="md:col-span-5 flex flex-col items-center justify-center rounded-xl bg-slate-900 border border-slate-200 min-h-[260px] h-[260px] relative overflow-hidden group shadow-inner">
            {image ? (
              <>
                <img
                  src={image}
                  alt="Pi 4 Camera AI Frame"
                  className="w-full h-full object-contain bg-black"
                />
                {/* Live Badge Overlay */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-emerald-400 z-10 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span>PI4_CAMERA • TRỰC TIẾP</span>
                </div>

                <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between gap-2 bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs z-10">
                  <span className="font-semibold text-white flex items-center gap-1.5 truncate">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isGood ? 'bg-emerald-400' : isBad ? 'bg-rose-400' : 'bg-amber-400'}`}></span>
                    <span className="truncate">{postureLabel}</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-300 shrink-0 whitespace-nowrap">
                    {telemetry.timestamp ? new Date(telemetry.timestamp).toLocaleTimeString('vi-VN') : ''}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-5 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-2.5">
                  <CameraOff className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">Chưa nhận được khung ảnh từ Pi 4</h4>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                  Raspberry Pi 4 có thể nén ảnh JPEG và gửi Base64 qua trường <code className="text-sky-300 font-mono font-bold">image</code> lên Firebase.
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode('skeleton')}
                  className="mt-3 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 transition cursor-pointer flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Xem mô hình mô phỏng</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 border border-slate-200 min-h-[260px] relative overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none opacity-60"></div>

            {/* Thumbnail PiP if real camera image exists */}
            {image && (
              <div 
                onClick={() => setViewMode('camera')}
                title="Bấm để xem camera thật"
                className="absolute top-2 right-2 w-16 h-12 rounded-lg border-2 border-sky-500 overflow-hidden cursor-pointer shadow-md hover:scale-105 transition z-20 group"
              >
                <img src={image} alt="Camera Pip" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </div>
            )}

            {/* SVG Anatomical Figure */}
            <svg viewBox="0 0 240 220" className="w-full max-w-[220px] h-auto drop-shadow-sm transition-all duration-500">
              <defs>
                <linearGradient id="spineGoodLight" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="spineBadLight" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#b91c1c" />
                </linearGradient>
              </defs>

              {/* Desk & Monitor Graphic */}
              <rect x="175" y="110" width="8" height="85" rx="3" fill="#cbd5e1" />
              <rect x="150" y="115" width="55" height="5" rx="2" fill="#94a3b8" />
              {/* Monitor */}
              <rect x="170" y="70" width="6" height="45" rx="2" fill="#64748b" />
              <path d="M165 72 L165 110" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />
              <rect x="155" y="105" width="22" height="4" rx="1" fill="#94a3b8" />

              {/* Chair Base */}
              <path d="M50 150 L110 150 L105 195 L55 195 Z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2" />
              <rect x="75" y="195" width="10" height="20" fill="#94a3b8" />
              <path d="M55 215 L105 215" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />

              {/* Ergonomic Chair Backrest */}
              <path d="M55 75 Q60 115 65 150" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" fill="none" />

              {!isAbsent ? (
                <g className="transition-all duration-700">
                  {/* Head */}
                  <circle
                    cx={isBad ? 108 : 95}
                    cy={isBad ? 54 : (isStanding ? 38 : 45)}
                    r="16"
                    fill={isBad ? '#fee2e2' : (isStanding ? '#e0e7ff' : '#d1fae5')}
                    stroke={isBad ? '#ef4444' : (isStanding ? '#6366f1' : '#10b981')}
                    strokeWidth="3"
                  />
                  
                  {/* Eye Sight Line */}
                  <line
                    x1={isBad ? 116 : 103}
                    y1={isBad ? 55 : (isStanding ? 39 : 46)}
                    x2="165"
                    y2="85"
                    stroke={isBad ? '#ef4444' : (isStanding ? '#6366f1' : '#0284c7')}
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />

                  {/* Neck & Spine Path */}
                  {isBad ? (
                    // Slouching curved forward spine
                    <path
                      d="M102 68 Q118 95 90 120 T78 155"
                      fill="none"
                      stroke="url(#spineBadLight)"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  ) : isStanding ? (
                    // Tall upright standing spine
                    <path
                      d="M95 54 L95 135"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  ) : (
                    // Upright ergonomic spinal curve (sitting)
                    <path
                      d="M93 61 Q95 90 90 115 T82 155"
                      fill="none"
                      stroke="url(#spineGoodLight)"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Shoulders & Arms */}
                  <path
                    d={isBad ? "M98 85 L125 105 L155 115" : (isStanding ? "M95 70 L120 95 L152 110" : "M92 75 L120 100 L152 115")}
                    fill="none"
                    stroke={isBad ? "#f87171" : (isStanding ? "#6366f1" : "#10b981")}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Thighs & Legs */}
                  {isStanding ? (
                    // Straight standing legs down to floor
                    <path
                      d="M95 135 L95 210"
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  ) : (
                    // Seated thighs and bent legs
                    <path
                      d="M80 155 L125 155 L130 198"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Feet */}
                  <path d={isStanding ? "M95 210 L115 210" : "M125 198 L142 198"} stroke="#475569" strokeWidth="4" strokeLinecap="round" />

                  {/* Stress Point Alert Indicators if bad */}
                  {isBad && (
                    <>
                      <circle cx="110" cy="85" r="5" fill="#ef4444" className="animate-ping" />
                      <circle cx="110" cy="85" r="4" fill="#dc2626" />
                    </>
                  )}
                </g>
              ) : (
                // Empty seat graphic when outside zone or absent
                <g className="transition-all duration-500">
                  {/* Dashed outline of empty seating spot */}
                  <circle cx="95" cy="50" r="16" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
                  <path d="M95 68 L95 145" stroke="#94a3b8" strokeWidth="4" strokeDasharray="5 5" opacity="0.6" />
                </g>
              )}
            </svg>
          </div>
        )}

        {/* Diagnostic Explanation & Ergonomic Advice */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${
                isAbsent ? 'bg-amber-100 text-amber-700' :
                isStanding ? 'bg-indigo-100 text-indigo-700' :
                isGood ? 'bg-emerald-100 text-emerald-700' :
                isBad ? 'bg-rose-100 text-rose-700' :
                isSittingLong ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {isAbsent ? <UserX className="w-4 h-4" /> : isStanding ? <UserCheck className="w-4 h-4" /> : isGood ? <CheckCircle className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
              </span>
              <h3 className="text-sm font-bold text-slate-900">{currentAdvice.title}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              {currentAdvice.desc}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
            <div className="flex items-center gap-1.5 text-sky-800 text-xs font-bold mb-1">
              <Info className="w-3.5 h-3.5 text-sky-600" />
              <span>Khuyến nghị từ Bác sĩ Công thái học:</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {currentAdvice.tip}
            </p>
          </div>

          {/* Mini Checklist */}
          {isAbsent ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-slate-700">Trạng thái: Tạm dừng đo</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                <span className="text-slate-700">Camera AI: Quét tìm đối tượng</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span className="text-slate-500">Vị trí ghế: Đang trống</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-slate-700">Tự động nhận diện khi vào</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className="text-slate-700">Góc gập khuỷu tay 90°</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-500' : isBad ? 'bg-rose-500' : 'bg-slate-300'}`}></span>
                <span className="text-slate-700">Khoảng cách màn hình 50-70cm</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-500' : isSittingLong ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                <span className="text-slate-700">Hai bàn chân áp sàn</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className="text-slate-700">Tựa thắt lưng đàn hồi</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
