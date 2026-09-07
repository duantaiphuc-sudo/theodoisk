import React, { useState } from 'react';
import { CheckCircle, AlertOctagon, Info, Flame, Eye, ArrowUpRight, CameraOff, Camera, Maximize2, Shield, Radio, UserX } from 'lucide-react';
import { HealthTelemetry } from '../types';

interface PostureVisualizerProps {
  telemetry: HealthTelemetry;
  hasData?: boolean;
}

export const PostureVisualizer: React.FC<PostureVisualizerProps> = ({ telemetry, hasData = true }) => {
  const { postureStatus, postureLabel, image, inZone, trackingActive } = telemetry;
  const [viewMode, setViewMode] = useState<'skeleton' | 'camera'>('skeleton');
  const [isZoomed, setIsZoomed] = useState(false);

  // Auto switch to camera view if an image is provided from Pi 4
  React.useEffect(() => {
    if (image && viewMode === 'skeleton') {
      setViewMode('camera');
    }
  }, [image]);

  if (!hasData || postureStatus === -1) {
    return (
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Mô Hình & Chẩn Đoán Tư Thế</span>
              <span className="text-xs font-normal text-slate-400">AI Skeleton Analysis</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Trực quan hóa tư thế cột sống & góc nghiêng cổ từ camera</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Chờ luồng Camera Pi 4
          </span>
        </div>

        <div className="relative h-[230px] rounded-xl bg-slate-950/60 border border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-500 mb-3">
            <CameraOff className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">Chưa có dữ liệu tư thế từ Camera AI</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            Hệ thống đang chờ nhận diện các mốc giải phẫu MediaPipe từ Raspberry Pi 4. Khung xương và góc gập cột sống sẽ xuất hiện ngay khi có dữ liệu.
          </p>
        </div>

        <div className="mt-4 p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-500 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 shrink-0" />
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

  const isGood = !isAbsent && postureStatus === 0;
  const isBad = !isAbsent && (postureStatus === 1 || postureStatus === 3);
  const isSittingLong = !isAbsent && postureStatus === 4;

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>Mô Hình & Chẩn Đoán Tư Thế</span>
            <span className="text-xs font-normal text-slate-400">AI Skeleton Analysis</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Phân tích góc nghiêng cột sống và khoảng cách thị giác theo thời gian thực</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('skeleton')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                viewMode === 'skeleton' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Mô hình 2D</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                viewMode === 'camera' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera Thật</span>
              {image && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
            </button>
          </div>

          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border ${
            isAbsent ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
            isGood ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
            isBad ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse' :
            isSittingLong ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
            'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {isAbsent ? 'VẮNG MẶT / NGOÀI VÙNG' : postureLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Visual Container: SVG Skeleton Animation OR Real Camera Frame */}
        {viewMode === 'camera' ? (
          <div className="md:col-span-5 flex flex-col items-center justify-center rounded-xl bg-slate-950/80 border border-slate-800 min-h-[260px] h-[260px] relative overflow-hidden group">
            {image ? (
              <>
                <img
                  src={image}
                  alt="Pi 4 Camera AI Frame"
                  className="w-full h-full object-contain bg-black"
                />
                {/* Live Badge Overlay */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  <span>PI4_CAMERA • LIVE</span>
                </div>

                <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsZoomed(true)}
                    className="p-1.5 rounded-lg bg-black/70 hover:bg-slate-800 text-white transition border border-white/10"
                    title="Phóng to ảnh camera"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="absolute bottom-2.5 inset-x-2.5 flex items-center justify-between bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-400' : isBad ? 'bg-rose-400' : 'bg-amber-400'}`}></span>
                    {postureLabel}
                  </span>
                  <span className="text-[11px] font-mono text-slate-300">
                    {telemetry.timestamp ? new Date(telemetry.timestamp).toLocaleTimeString('vi-VN') : ''}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-5 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2.5">
                  <CameraOff className="w-6 h-6 text-slate-400" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">Chưa nhận được khung ảnh từ Pi 4</h4>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
                  Raspberry Pi 4 có thể nén ảnh JPEG và gửi Base64 qua trường <code className="text-sky-300 font-mono font-bold">image</code> lên Firebase.
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode('skeleton')}
                  className="mt-3 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 transition"
                >
                  Xem mô hình đồ họa 2D
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 min-h-[260px] relative overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none"></div>

            {/* Thumbnail PiP if real camera image exists */}
            {image && (
              <div 
                onClick={() => setViewMode('camera')}
                title="Bấm để xem camera thật"
                className="absolute top-2 right-2 w-16 h-12 rounded-lg border-2 border-sky-400/80 overflow-hidden cursor-pointer shadow-lg hover:scale-105 transition z-20 group"
              >
                <img src={image} alt="Camera Pip" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </div>
            )}

          {/* SVG Anatomical Figure */}
          <svg viewBox="0 0 240 220" className="w-full max-w-[220px] h-auto drop-shadow-lg transition-all duration-500">
            <defs>
              <linearGradient id="spineGood" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="spineBad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Desk & Monitor Graphic */}
            <rect x="175" y="110" width="8" height="85" rx="3" fill="#334155" />
            <rect x="150" y="115" width="55" height="5" rx="2" fill="#475569" />
            {/* Monitor */}
            <rect x="170" y="70" width="6" height="45" rx="2" fill="#64748b" />
            <path d="M165 72 L165 110" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />
            <rect x="155" y="105" width="22" height="4" rx="1" fill="#475569" />

            {/* Chair Base */}
            <path d="M50 150 L110 150 L105 195 L55 195 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" />
            <rect x="75" y="195" width="10" height="20" fill="#334155" />
            <path d="M55 215 L105 215" stroke="#475569" strokeWidth="4" strokeLinecap="round" />

            {/* Ergonomic Chair Backrest */}
            <path d="M55 75 Q60 115 65 150" stroke="#334155" strokeWidth="8" strokeLinecap="round" fill="none" />

            {!isAbsent ? (
              <g className="transition-all duration-700">
                {/* Head */}
                <circle
                  cx={isBad ? 108 : 95}
                  cy={isBad ? 54 : 45}
                  r="16"
                  fill={isBad ? '#fca5a5' : '#a7f3d0'}
                  stroke={isBad ? '#ef4444' : '#10b981'}
                  strokeWidth="3"
                  filter={isBad ? 'url(#glow)' : undefined}
                />
                
                {/* Eye Sight Line */}
                <line
                  x1={isBad ? 116 : 103}
                  y1={isBad ? 55 : 46}
                  x2="165"
                  y2="85"
                  stroke={isBad ? '#ef4444' : '#38bdf8'}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />

                {/* Neck & Spine Path */}
                {isBad ? (
                  // Slouching curved forward spine
                  <path
                    d="M102 68 Q118 95 90 120 T78 155"
                    fill="none"
                    stroke="url(#spineBad)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />
                ) : (
                  // Upright ergonomic spinal curve
                  <path
                    d="M93 61 Q95 90 90 115 T82 155"
                    fill="none"
                    stroke="url(#spineGood)"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                )}

                {/* Shoulders & Arms */}
                <path
                  d={isBad ? "M98 85 L125 105 L155 115" : "M92 75 L120 100 L152 115"}
                  fill="none"
                  stroke={isBad ? "#f87171" : "#6ee7b7"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Thighs & Legs */}
                <path
                  d="M80 155 L125 155 L130 198"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Feet */}
                <path d="M125 198 L142 198" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />

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
                <circle cx="95" cy="50" r="16" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="4 4" opacity="0.4" />
                <path d="M95 68 L95 145" stroke="#64748b" strokeWidth="4" strokeDasharray="5 5" opacity="0.4" />
                
                {/* Yellow Empty Seat Indicator Badge */}
                <rect x="35" y="88" width="130" height="36" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
                <text x="100" y="103" fill="#fbbf24" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                  NGOÀI VÙNG GIÁM SÁT
                </text>
                <text x="100" y="117" fill="#94a3b8" fontSize="8.5" fontFamily="sans-serif" textAnchor="middle">
                  (Ghế trống • Chưa có người)
                </text>
              </g>
            )}
          </svg>

          {/* Real-time Indicator Tag */}
          <div className="mt-2 text-center">
            <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md ${
              isAbsent ? 'text-amber-400 bg-amber-950/60 border border-amber-500/30' :
              isGood ? 'text-emerald-400 bg-emerald-950/60' :
              isBad ? 'text-rose-400 bg-rose-950/60' :
              isSittingLong ? 'text-amber-400 bg-amber-950/60' : 'text-slate-500'
            }`}>
              {isAbsent ? 'Chờ đối tượng ngồi vào vùng' :
               isGood ? '✓ Góc cột sống 105° (Tối ưu)' :
               isBad ? '⚠ Góc cúi cổ > 32° (Có nguy cơ)' :
               isSittingLong ? '⏰ Cần giải lao 5 phút' : 'Chờ đối tượng vào vùng'}
            </span>
          </div>
        </div>
        )}

        {/* Diagnostic Explanation & Ergonomic Advice */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${
                isAbsent ? 'bg-amber-500/15 text-amber-400' :
                isGood ? 'bg-emerald-500/15 text-emerald-400' :
                isBad ? 'bg-rose-500/15 text-rose-400' :
                isSittingLong ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {isAbsent ? <UserX className="w-4 h-4" /> : isGood ? <CheckCircle className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
              </span>
              <h3 className="text-sm font-bold text-slate-100">{currentAdvice.title}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-800">
              {currentAdvice.desc}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 via-slate-900/60 to-indigo-950/40 border border-sky-800/40">
            <div className="flex items-center gap-1.5 text-sky-400 text-xs font-semibold mb-1">
              <Info className="w-3.5 h-3.5" />
              <span>Khuyến nghị từ Bác sĩ Công thái học:</span>
            </div>
            <p className="text-xs text-sky-200/90 leading-relaxed">
              {currentAdvice.tip}
            </p>
          </div>

          {/* Mini Checklist */}
          {isAbsent ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span className="text-slate-300">Trạng thái: Tạm dừng đo</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                <span className="text-slate-300">Camera AI: Quét tìm đối tượng</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                <span className="text-slate-400">Vị trí ghế: Đang trống</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-slate-300">Tự động nhận diện khi vào</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <span className="text-slate-300">Góc gập khuỷu tay 90°</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-400' : isBad ? 'bg-rose-500' : 'bg-slate-600'}`}></span>
                <span className="text-slate-300">Khoảng cách màn hình 50-70cm</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-400' : isSittingLong ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
                <span className="text-slate-300">Hai bàn chân áp sàn</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${isGood ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <span className="text-slate-300">Tựa thắt lưng đàn hồi</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-screen Zoom Modal for Camera Image */}
      {isZoomed && image && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-sky-400" />
                <span className="font-bold text-white text-sm">Khung Hình Camera AI Trực Tiếp (Raspberry Pi 4)</span>
                <span className="text-[11px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                  LIVE FRAME
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsZoomed(false)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Đóng (✕)
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center min-h-[360px] max-h-[75vh] overflow-hidden">
              <img
                src={image}
                alt="Enlarged Pi Camera Frame"
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Trạng thái: <b className="text-white">{postureLabel}</b></span>
              <span>Cập nhật: <b className="text-sky-300 font-mono">{telemetry.timestamp ? new Date(telemetry.timestamp).toLocaleTimeString('vi-VN') : ''}</b></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
