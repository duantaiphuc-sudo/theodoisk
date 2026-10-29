import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, Clock, Heart, Wind } from 'lucide-react';
import { TelemetryLog } from '../types';
import { aggregateTelemetryByHour, HourlyTelemetryPoint } from '../utils/hourlyAggregation';

interface TrendChartProps {
  history: TelemetryLog[];
  hrMin: number;
  hrMax: number;
  spo2Min: number;
  hasData?: boolean;
}

export const TrendChart: React.FC<TrendChartProps> = ({ history, hrMin, hrMax, spo2Min, hasData = true }) => {
  const [showHR, setShowHR] = useState(true);
  const [showSpO2, setShowSpO2] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // TỔNG HỢP THEO GIỜ LÀM VIỆC (08:00 - 18:00) thay vì vẽ theo giây
  const hourlyData = useMemo(() => {
    return aggregateTelemetryByHour(history, 8, 18);
  }, [history]);

  // Kiểm tra có ít nhất 1 giờ có dữ liệu đo thật hay không
  const activeHourlyPoints = useMemo(() => {
    return hourlyData.filter(d => d.hasData);
  }, [hourlyData]);

  // Chart coordinates
  const width = 640;
  const height = 240;
  const paddingLeft = 45;
  const paddingRight = 45;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartInnerWidth = width - paddingLeft - paddingRight;
  const chartInnerHeight = height - paddingTop - paddingBottom;

  // HR scale: 45 - 135 bpm
  const minHR = 45;
  const maxHR = 135;
  const getYForHR = (bpm: number) => {
    const clamped = Math.max(minHR, Math.min(maxHR, bpm));
    const ratio = (clamped - minHR) / (maxHR - minHR);
    return paddingTop + chartInnerHeight - ratio * chartInnerHeight;
  };

  // SpO2 scale: 85 - 100 %
  const minSpO2 = 85;
  const maxSpO2 = 100;
  const getYForSpO2 = (val: number) => {
    const clamped = Math.max(minSpO2, Math.min(maxSpO2, val));
    const ratio = (clamped - minSpO2) / (maxSpO2 - minSpO2);
    return paddingTop + chartInnerHeight - ratio * chartInnerHeight;
  };

  const getX = (index: number, total: number) => {
    if (total <= 1) return paddingLeft + chartInnerWidth / 2;
    return paddingLeft + (index / (total - 1)) * chartInnerWidth;
  };

  // Generate SVG points for Heart rate (dựa trên các giờ có dữ liệu)
  const hrPoints = useMemo(() => {
    return hourlyData
      .map((d, i) => (d.hasData && d.avgBpm > 0 ? { x: getX(i, hourlyData.length), y: getYForHR(d.avgBpm), val: d.avgBpm, point: d, index: i } : null))
      .filter(Boolean) as { x: number; y: number; val: number; point: HourlyTelemetryPoint; index: number }[];
  }, [hourlyData]);

  const hrPath = hrPoints.length > 1
    ? hrPoints.reduce((acc, curr, i, arr) => {
        if (i === 0) return `M ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
        const prev = arr[i - 1];
        const cx = (prev.x + curr.x) / 2;
        return `${acc} C ${cx.toFixed(1)},${prev.y.toFixed(1)} ${cx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
      }, '')
    : '';

  const hrArea = hrPoints.length > 1
    ? `${hrPath} L ${hrPoints[hrPoints.length - 1].x.toFixed(1)},${(paddingTop + chartInnerHeight).toFixed(1)} L ${hrPoints[0].x.toFixed(1)},${(paddingTop + chartInnerHeight).toFixed(1)} Z`
    : '';

  // Generate SVG points for SpO2 (dựa trên các giờ có dữ liệu)
  const spo2Points = useMemo(() => {
    return hourlyData
      .map((d, i) => (d.hasData && d.avgSpo2 > 0 ? { x: getX(i, hourlyData.length), y: getYForSpO2(d.avgSpo2), val: d.avgSpo2, point: d, index: i } : null))
      .filter(Boolean) as { x: number; y: number; val: number; point: HourlyTelemetryPoint; index: number }[];
  }, [hourlyData]);

  const spo2Path = spo2Points.length > 1
    ? spo2Points.reduce((acc, curr, i, arr) => {
        if (i === 0) return `M ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
        const prev = arr[i - 1];
        const cx = (prev.x + curr.x) / 2;
        return `${acc} C ${cx.toFixed(1)},${prev.y.toFixed(1)} ${cx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
      }, '')
    : '';

  // Điểm giờ gần nhất có dữ liệu
  const latestActivePoint = activeHourlyPoints[activeHourlyPoints.length - 1];

  return (
    <div className="rounded-2xl glass-panel bg-white/75 backdrop-blur-xl border border-white/60 p-4 sm:p-5 lg:p-6 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Xu Hướng Sinh Trắc Học Theo Giờ (HR & SpO₂)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Tổng hợp trung bình theo từng khung giờ làm việc trong ngày (08:00 - 18:00)</span>
          </p>
        </div>

        {/* Legend toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHR(!showHR)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showHR
                ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>BPM TB ({latestActivePoint ? `${latestActivePoint.avgBpm}` : '--'})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSpO2(!showSpO2)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showSpO2
                ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-2xs'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span>SpO₂ TB ({latestActivePoint ? `${latestActivePoint.avgSpo2}%` : '--'})</span>
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full h-[240px] bg-slate-50 rounded-xl border border-slate-200 p-2 overflow-hidden">
        {!hasData || activeHourlyPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs px-4 text-center">
            <Activity className="w-7 h-7 mb-2 text-slate-400 animate-pulse" />
            <span className="font-semibold text-slate-700">Chưa có dữ liệu đo đạc theo giờ</span>
            <span className="text-[11px] text-slate-500 mt-1 max-w-sm leading-relaxed">
              Biểu đồ sẽ tự động tính toán giá trị trung bình nhịp tim & SpO₂ theo từng khung giờ (08h, 09h, 10h...) ngay khi trạm IoT ghi nhận dữ liệu thật.
            </span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="hrGradientLightHourly" x1="0%" y1="0%" x2="0%" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + ratio * chartInnerHeight;
              const hrVal = Math.round(maxHR - ratio * (maxHR - minHR));
              const spo2Val = Math.round(maxSpO2 - ratio * (maxSpO2 - minSpO2));
              return (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  {/* Left Y-axis (Heart rate) */}
                  <text x={paddingLeft - 8} y={y + 3} fill="#e11d48" fontSize="9" textAnchor="end" fontFamily="monospace" fontWeight="bold">
                    {hrVal}
                  </text>
                  {/* Right Y-axis (SpO2) */}
                  <text x={width - paddingRight + 8} y={y + 3} fill="#0284c7" fontSize="9" textAnchor="start" fontFamily="monospace" fontWeight="bold">
                    {spo2Val}%
                  </text>
                </g>
              );
            })}

            {/* Threshold reference lines */}
            {showHR && (
              <line
                x1={paddingLeft}
                y1={getYForHR(hrMax)}
                x2={width - paddingRight}
                y2={getYForHR(hrMax)}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.7"
              />
            )}
            {showSpO2 && (
              <line
                x1={paddingLeft}
                y1={getYForSpO2(spo2Min)}
                x2={width - paddingRight}
                y2={getYForSpO2(spo2Min)}
                stroke="#0284c7"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.6"
              />
            )}

            {/* Heart Rate Wave (Hourly Average) */}
            {showHR && hrPoints.length > 1 && (
              <>
                <path d={hrArea} fill="url(#hrGradientLightHourly)" />
                <path d={hrPath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}

            {/* SpO2 Wave (Hourly Average) */}
            {showSpO2 && spo2Points.length > 1 && (
              <path d={spo2Path} fill="none" stroke="#0284c7" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" />
            )}

            {/* Hourly Columns & Interactive Dots */}
            {hourlyData.map((d, i) => {
              const x = getX(i, hourlyData.length);
              const isHovered = hoveredIndex === i;
              const hasPointData = d.hasData;

              return (
                <g key={`col-${d.hour}`}>
                  {/* Interactive hover column */}
                  <rect
                    x={x - (chartInnerWidth / hourlyData.length) / 2}
                    y={paddingTop}
                    width={chartInnerWidth / hourlyData.length}
                    height={chartInnerHeight}
                    fill={isHovered ? 'rgba(99, 102, 241, 0.08)' : 'transparent'}
                    className="cursor-pointer transition-colors"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />

                  {/* BPM Point */}
                  {showHR && hasPointData && d.avgBpm > 0 && (
                    <circle
                      cx={x}
                      cy={getYForHR(d.avgBpm)}
                      r={isHovered ? 5 : 3}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      className="transition-all pointer-events-none"
                    />
                  )}

                  {/* SpO2 Point */}
                  {showSpO2 && hasPointData && d.avgSpo2 > 0 && (
                    <circle
                      cx={x}
                      cy={getYForSpO2(d.avgSpo2)}
                      r={isHovered ? 4.5 : 2.5}
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      className="transition-all pointer-events-none"
                    />
                  )}

                  {/* X-axis labels (Hourly timestamps: 08:00, 09:00, ...) */}
                  <text
                    x={x}
                    y={height - 8}
                    fill={isHovered ? '#0f172a' : hasPointData ? '#334155' : '#94a3b8'}
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontWeight={hasPointData ? 'bold' : 'normal'}
                  >
                    {d.hourLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Hover Tooltip Overlay */}
      {hoveredIndex !== null && hourlyData[hoveredIndex] && (
        <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
              Khung giờ: {hourlyData[hoveredIndex].timeRangeLabel}
            </span>
            <span className="text-slate-500 font-medium">
              {hourlyData[hoveredIndex].hasData 
                ? `(Ghi nhận ${hourlyData[hoveredIndex].sampleCount} lượt đo)`
                : '(Chưa có dữ liệu trong khung giờ này)'}
            </span>
          </div>

          {hourlyData[hoveredIndex].hasData ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 font-mono text-rose-600 font-bold">
                <Heart className="w-3.5 h-3.5" />
                <span>{hourlyData[hoveredIndex].avgBpm > 0 ? `${hourlyData[hoveredIndex].avgBpm} BPM TB` : '--'}</span>
              </div>
              <div className="flex items-center gap-1 font-mono text-sky-600 font-bold">
                <Wind className="w-3.5 h-3.5" />
                <span>{hourlyData[hoveredIndex].avgSpo2 > 0 ? `${hourlyData[hoveredIndex].avgSpo2}% TB` : '--'}</span>
              </div>
            </div>
          ) : (
            <span className="text-slate-400 italic">Ngoài giờ đo đạc / Chưa có mẫu</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 bg-rose-500"></span>
          Trục trái: Nhịp tim trung bình theo giờ (BPM)
        </span>
        <span className="font-mono text-indigo-600 font-semibold flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Tổng hợp theo từng giờ làm việc
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 bg-sky-600"></span>
          Trục phải: SpO₂ trung bình theo giờ (%)
        </span>
      </div>
    </div>
  );
};
