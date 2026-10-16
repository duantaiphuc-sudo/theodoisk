import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { TelemetryLog } from '../types';

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

  // Take the most recent 24 points in chronological order (left to right)
  const chartData = useMemo(() => {
    return [...history].slice(0, 24).reverse();
  }, [history]);

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

  // Generate SVG path for Heart rate
  const hrPoints = chartData
    .map((d, i) => (d.bpm > 0 ? { x: getX(i, chartData.length), y: getYForHR(d.bpm), val: d.bpm } : null))
    .filter(Boolean) as { x: number; y: number; val: number }[];

  const hrPath = hrPoints.length > 1
    ? hrPoints.reduce((acc, curr, i, arr) => {
        if (i === 0) return `M ${curr.x},${curr.y}`;
        const prev = arr[i - 1];
        const cx = (prev.x + curr.x) / 2;
        return `${acc} C ${cx},${prev.y} ${cx},${curr.y} ${curr.x},${curr.y}`;
      }, '')
    : '';

  const hrArea = hrPoints.length > 1
    ? `${hrPath} L ${hrPoints[hrPoints.length - 1].x},${paddingTop + chartInnerHeight} L ${hrPoints[0].x},${paddingTop + chartInnerHeight} Z`
    : '';

  // Generate SVG path for SpO2
  const spo2Points = chartData
    .map((d, i) => (d.spo2 > 0 ? { x: getX(i, chartData.length), y: getYForSpO2(d.spo2), val: d.spo2 } : null))
    .filter(Boolean) as { x: number; y: number; val: number }[];

  const spo2Path = spo2Points.length > 1
    ? spo2Points.reduce((acc, curr, i, arr) => {
        if (i === 0) return `M ${curr.x},${curr.y}`;
        const prev = arr[i - 1];
        const cx = (prev.x + curr.x) / 2;
        return `${acc} C ${cx},${prev.y} ${cx},${curr.y} ${curr.x},${curr.y}`;
      }, '')
    : '';

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 lg:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Xu Hướng Sinh Trắc Học (HR & SpO₂)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Biểu đồ đồng bộ thời gian thực từ cảm biến MAX30102 qua Firebase</p>
        </div>

        {/* Legend toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHR(!showHR)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showHR
                ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>BPM ({chartData[chartData.length - 1]?.bpm || '--'})</span>
          </button>

          <button
            onClick={() => setShowSpO2(!showSpO2)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showSpO2
                ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-2xs'
                : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span>SpO₂ ({chartData[chartData.length - 1]?.spo2 ? `${chartData[chartData.length - 1].spo2}%` : '--'})</span>
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full h-[240px] bg-slate-50 rounded-xl border border-slate-200 p-2 overflow-hidden">
        {!hasData || chartData.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs px-4 text-center">
            <Activity className="w-7 h-7 mb-2 text-slate-400 animate-pulse" />
            <span className="font-semibold text-slate-700">Chưa có dữ liệu lịch sử đo</span>
            <span className="text-[11px] text-slate-500 mt-1 max-w-sm">
              Biểu đồ nhịp tim & SpO₂ sẽ tự động bắt đầu vẽ ngay khi Raspberry Pi 4 hoặc bộ cảm biến truyền gói tin đầu tiên.
            </span>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="hrGradientLight" x1="0%" y1="0%" x2="0%" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
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

            {/* Heart Rate Wave */}
            {showHR && hrPoints.length > 1 && (
              <>
                <path d={hrArea} fill="url(#hrGradientLight)" />
                <path d={hrPath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
                {hrPoints.map((pt, idx) => (
                  <circle
                    key={`hr-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === hrPoints.length - 1 ? 4 : 2}
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth={idx === hrPoints.length - 1 ? 2 : 0}
                  />
                ))}
              </>
            )}

            {/* SpO2 Wave */}
            {showSpO2 && spo2Points.length > 1 && (
              <>
                <path d={spo2Path} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
                {spo2Points.map((pt, idx) => (
                  <circle
                    key={`spo2-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === spo2Points.length - 1 ? 4 : 2}
                    fill="#0284c7"
                    stroke="#ffffff"
                    strokeWidth={idx === spo2Points.length - 1 ? 2 : 0}
                  />
                ))}
              </>
            )}

            {/* X-axis labels (Time) */}
            {chartData.map((d, i) => {
              if (i % Math.ceil(chartData.length / 5) === 0 || i === chartData.length - 1) {
                const x = getX(i, chartData.length);
                return (
                  <text
                    key={`time-${i}`}
                    x={x}
                    y={height - 8}
                    fill="#64748b"
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {d.timeFormatted || '00:00'}
                  </text>
                );
              }
              return null;
            })}
          </svg>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 bg-rose-500"></span>
          Trục trái: Nhịp tim (BPM)
        </span>
        <span className="font-mono text-slate-400">20 mẫu gần nhất • Tần số 1-2s</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 bg-sky-600"></span>
          Trục phải: SpO₂ (%)
        </span>
      </div>
    </div>
  );
};
