import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  HealthTelemetry, 
  TimeCalculations, 
  ZoneConfig, 
  AlertThresholds, 
  TelemetryLog, 
  FirebaseConnectionConfig,
  AuthUser
} from './types';
import { 
  getSavedFirebaseConfig, 
  saveFirebaseConfig, 
  subscribeToFirebaseTelemetry,
  clearFirebaseTelemetry
} from './services/firebase';
import { getCurrentUser, saveCurrentUser, logout } from './services/authService';
import { playAlertChime } from './services/sound';
import { appendTelemetryToHistory } from './services/historyService';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { MetricCards } from './components/MetricCards';
import { PostureVisualizer } from './components/PostureVisualizer';
import { TrendChart } from './components/TrendChart';
import { TimeCounters } from './components/TimeCounters';
import { MonitorZoneCard } from './components/MonitorZoneCard';
import { HistoryLogs } from './components/HistoryLogs';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { RaspberryPiGuideModal } from './components/RaspberryPiGuideModal';
import { AlertSettingsModal } from './components/AlertSettingsModal';
import { HealthChatbot } from './components/HealthChatbot';
import { Sparkles, AlertTriangle, Radio, Trash2 } from 'lucide-react';

export default function App() {
  // 0. Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const isManager = currentUser?.role === 'manager';

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    saveCurrentUser(user);
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
  };

  // 1. Firebase Configuration State
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConnectionConfig>(getSavedFirebaseConfig());
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Data reception state - When false, display empty indicators across UI
  const [hasReceivedData, setHasReceivedData] = useState<boolean>(false);
  const [isClearingFirebase, setIsClearingFirebase] = useState(false);
  const [clearNotice, setClearNotice] = useState<string | null>(null);

  // 2. Modals State
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isRpiGuideModalOpen, setIsRpiGuideModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 3. Alert Thresholds State
  const [thresholds, setThresholds] = useState<AlertThresholds>(() => {
    try {
      const saved = localStorage.getItem('theodoisk_thresholds');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      hrMin: 50,
      hrMax: 110,
      spo2Min: 94,
      incorrectPostureSec: 30,
      longIncorrectSec: 120,
      longSittingSec: 3600,
      soundEnabled: true,
    };
  });

  // 4. Zone Configuration State
  const [zone, setZone] = useState<ZoneConfig>(() => {
    try {
      const saved = localStorage.getItem('theodoisk_zone');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x1: 20, y1: 10, x2: 80, y2: 90 };
  });

  // 5. Live Telemetry State (Starts empty until device or simulation pushes data)
  const [telemetry, setTelemetry] = useState<HealthTelemetry>({
    bpm: 0,
    spo2: 0,
    postureStatus: -1,
    postureLabel: 'Chưa có dữ liệu',
    trackingActive: false,
    inZone: false,
    timestamp: new Date().toISOString(),
    source: 'Chờ Raspberry Pi 4...',
    confidence: 0,
  });

  // 7. Time Statistics State
  const [timeStats, setTimeStats] = useState<TimeCalculations>({
    sittingSeconds: 0,
    movingSeconds: 0,
    badPostureSeconds: 0,
    continuousSittingSeconds: 0,
  });

  // 8. History Log Records
  const [history, setHistory] = useState<TelemetryLog[]>([]);

  // Refs for audio throttle & last alert timestamp
  const lastAlertPlayedRef = useRef<number>(0);
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;

  // Save thresholds & zone when changed
  useEffect(() => {
    localStorage.setItem('theodoisk_thresholds', JSON.stringify(thresholds));
  }, [thresholds]);

  useEffect(() => {
    localStorage.setItem('theodoisk_zone', JSON.stringify(zone));
  }, [zone]);

  // Handle new incoming telemetry packet
  const handleIncomingTelemetry = useCallback((data: HealthTelemetry) => {
    // Only consider packet empty if posture is unknown/cleared (-1) AND no sensors or camera frames are present
    const isEmptyPacket = data.postureStatus === -1 && data.bpm === 0 && data.spo2 === 0 && !data.trackingActive && !data.image;

    if (isEmptyPacket) {
      setTelemetry(data);
      setHasReceivedData(false);
      setLastUpdate(new Date().toLocaleTimeString('vi-VN'));
      setIsConnected(true);
      return;
    }

    setTelemetry(data);
    setHasReceivedData(true);
    setLastUpdate(new Date().toLocaleTimeString('vi-VN'));
    setIsConnected(true);

    // Save to historical records repository for chatbot data retrieval
    appendTelemetryToHistory(data);

    // Evaluate for immediate alerts
    const currentThresholds = thresholdsRef.current;
    let hasAlert = false;
    let alertType = '';

    if (data.bpm > 0 && (data.bpm < currentThresholds.hrMin || data.bpm > currentThresholds.hrMax)) {
      hasAlert = true;
      alertType = data.bpm < currentThresholds.hrMin ? 'Nhịp tim chậm' : 'Nhịp tim nhanh';
    } else if (data.spo2 > 0 && data.spo2 < currentThresholds.spo2Min) {
      hasAlert = true;
      alertType = 'Thiếu oxy SpO₂';
    } else if (data.postureStatus === 1 || data.postureStatus === 3) {
      hasAlert = true;
      alertType = data.postureStatus === 3 ? 'Sai tư thế lâu' : 'Sai tư thế';
    }

    // Audio chime with throttle (min 10s between audio alerts)
    if (hasAlert && currentThresholds.soundEnabled) {
      const now = Date.now();
      if (now - lastAlertPlayedRef.current > 10000) {
        lastAlertPlayedRef.current = now;
        playAlertChime(data.postureStatus === 3 ? 'danger' : 'warning');
      }
    }

    // Add to history
    setHistory(prev => {
      const newEntry: TelemetryLog = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: data.timestamp,
        timeFormatted: new Date().toLocaleTimeString('vi-VN'),
        bpm: data.bpm,
        spo2: data.spo2,
        postureStatus: data.postureStatus,
        postureLabel: data.postureLabel,
        trackingActive: data.trackingActive,
        hasAlert,
        alertType,
      };
      return [newEntry, ...prev.slice(0, 49)];
    });
  }, []);

  // Subscribe to Firebase on mount or config change
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (firebaseConfig.autoConnect && !isSimulating) {
      unsubscribe = subscribeToFirebaseTelemetry(
        firebaseConfig,
        data => {
          handleIncomingTelemetry(data);
        },
        err => {
          console.warn('Firebase sync warning (fallback to active state):', err);
          setIsConnected(false);
        }
      );
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [firebaseConfig, isSimulating, handleIncomingTelemetry]);

  // Second timer loop for web-calculated activity times
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStats(prev => {
        const current = telemetryRef.current;
        const currentThresh = thresholdsRef.current;

        // In seat / active
        const isSeated = current.trackingActive && current.postureStatus !== 2 && current.postureStatus !== -1;
        const isBad = isSeated && (current.postureStatus === 1 || current.postureStatus === 3);

        const newBad = isBad ? prev.badPostureSeconds + 1 : 0;
        const newSitting = isSeated ? prev.sittingSeconds + 1 : prev.sittingSeconds;
        const newMoving = !isSeated ? prev.movingSeconds + 1 : prev.movingSeconds;
        const newContinuous = isSeated ? prev.continuousSittingSeconds + 1 : 0;

        // Trigger chime if crossing bad posture limit
        if (newBad === currentThresh.incorrectPostureSec && currentThresh.soundEnabled) {
          playAlertChime('danger');
        } else if (newContinuous === currentThresh.longSittingSec && currentThresh.soundEnabled) {
          playAlertChime('reminder');
        }

        return {
          sittingSeconds: newSitting,
          movingSeconds: newMoving,
          badPostureSeconds: newBad,
          continuousSittingSeconds: newContinuous,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Simulation mode (generates realistic Raspberry Pi 4 sensor fluctuations)
  useEffect(() => {
    if (!isSimulating) return;

    setIsConnected(true);
    let step = 0;

    const simInterval = setInterval(() => {
      step++;
      // Natural jitter for heart rate & spo2
      const jitterBpm = Math.round(74 + Math.sin(step * 0.3) * 6 + (Math.random() - 0.5) * 3);
      const jitterSpO2 = Number((98.2 + Math.cos(step * 0.2) * 0.8 + (Math.random() - 0.5) * 0.3).toFixed(1));

      // Posture cycle: Mostly good (0), occasionally slouching (1), or brief absent (2)
      let simPosture = 0;
      let label = 'Tư thế ĐÚNG';
      let angle = 158;
      let warning: string | undefined = undefined;

      if (step % 20 > 14) {
        simPosture = 1;
        label = 'Tư thế SAI';
        angle = 125;
        warning = 'Cot song dang bi gu hoac cui co';
      } else if (step % 45 === 0) {
        simPosture = 4;
        label = 'NGỒI LÀM VIỆC QUÁ LÂU';
        angle = 140;
        warning = 'Cần đứng dậy vận động sau 45 phút';
      }

      handleIncomingTelemetry({
        bpm: jitterBpm,
        spo2: jitterSpO2,
        postureStatus: simPosture,
        postureLabel: label,
        trackingActive: true,
        inZone: true,
        timestamp: new Date().toISOString(),
        source: 'Raspberry Pi 4 (Giả Lập)',
        confidence: 97,
        angleNeck: angle,
        postureWarning: warning,
      });
    }, 2000);

    return () => clearInterval(simInterval);
  }, [isSimulating, handleIncomingTelemetry]);

  const handleResetTimers = () => {
    setTimeStats({
      sittingSeconds: 0,
      movingSeconds: 0,
      badPostureSeconds: 0,
      continuousSittingSeconds: 0,
    });
  };

  const handleClearFirebaseData = async () => {
    setIsClearingFirebase(true);
    try {
      await clearFirebaseTelemetry(firebaseConfig);
      setTelemetry({
        bpm: 0,
        spo2: 0,
        postureStatus: -1,
        postureLabel: 'Chưa có dữ liệu',
        trackingActive: false,
        inZone: false,
        timestamp: new Date().toISOString(),
        source: 'Chờ Raspberry Pi 4...',
        confidence: 0,
      });
      setHasReceivedData(false);
      setClearNotice('Đã xóa dữ liệu cũ trên Firebase Firestore! Màn hình đã quay về trạng thái rỗng chờ thiết bị kết nối.');
      setTimeout(() => setClearNotice(null), 6000);
    } catch (err: any) {
      alert(`Lỗi xóa dữ liệu trên Firebase: ${err.message || 'Kiểm tra quyền ghi'}`);
    } finally {
      setIsClearingFirebase(false);
    }
  };

  const handleSaveFirebaseConfig = (newCfg: FirebaseConnectionConfig) => {
    setFirebaseConfig(newCfg);
    saveFirebaseConfig(newCfg);
  };

  // If user is not authenticated, show LoginScreen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* Top Navigation */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        isConnected={isConnected}
        isSimulating={isSimulating}
        toggleSimulation={() => setIsSimulating(!isSimulating)}
        firebaseConfig={firebaseConfig}
        onOpenFirebaseModal={() => isManager && setIsFirebaseModalOpen(true)}
        onOpenRpiGuideModal={() => isManager && setIsRpiGuideModalOpen(true)}
        onOpenSettingsModal={() => isManager && setIsSettingsModalOpen(true)}
        soundEnabled={thresholds.soundEnabled}
        toggleSound={() => setThresholds(t => ({ ...t, soundEnabled: !t.soundEnabled }))}
        lastUpdate={lastUpdate}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 overflow-hidden">
        {/* Success clear notification */}
        {clearNotice && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs shadow-md">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              {clearNotice}
            </span>
            <button onClick={() => setClearNotice(null)} className="text-emerald-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Banner when Firebase has data from previous sessions or stale data */}
        {hasReceivedData && !isSimulating && (
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs shadow-md transition-all ${
            telemetry.isStale
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                telemetry.isStale 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              }`}>
                {telemetry.isStale ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <Radio className="w-4 h-4 text-sky-400 animate-pulse" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-xs sm:text-sm">
                    {telemetry.isStale ? 'Bản Ghi Lưu Trên Firebase' : 'Dữ Liệu Trực Tuyến Từ Firebase'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                    telemetry.isStale
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {telemetry.isStale ? '⚠️ Bản ghi cũ (Pi 4 Offline)' : 'Trực tuyến'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {telemetry.isStale
                    ? `Dữ liệu (${telemetry.bpm} bpm, ${telemetry.spo2}% SpO₂) là bản ghi trước đó từ devices/${firebaseConfig.documentId || 'pi4_node_1'}. Bấm nút bên cạnh để đưa màn hình về trạng thái chờ rỗng (--).`
                    : `Đồng bộ từ document "${firebaseConfig.documentId || 'pi4_node_1'}". Cập nhật lúc ${lastUpdate}.`}
                </p>
              </div>
            </div>
            {isManager && (
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleClearFirebaseData}
                  disabled={isClearingFirebase}
                  title="Xóa bản ghi cũ trên Firestore và đưa màn hình về trạng thái chờ (--)"
                  className="w-full sm:w-auto justify-center px-3 py-1.5 rounded-lg font-semibold bg-rose-600/90 hover:bg-rose-500 text-white transition shadow-sm flex items-center gap-1.5 text-xs"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isClearingFirebase ? 'animate-spin' : ''}`} />
                  <span>{isClearingFirebase ? 'Đang xóa...' : 'Xóa Về Trống (--)'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty data notification bar when no packet has arrived yet */}
        {!hasReceivedData && !isSimulating && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3.5 sm:px-4 py-3 rounded-xl bg-slate-900/80 border border-sky-500/30 text-sky-200 text-xs shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
                <Radio className="w-4 h-4 animate-pulse text-sky-400" />
              </div>
              <div>
                <span className="font-bold text-white block text-xs sm:text-sm">
                  Đang chờ luồng dữ liệu từ Raspberry Pi 4 (Collection: devices • Doc: {firebaseConfig.documentId || 'pi4_node_1'})
                </span>
                <span className="text-slate-400 text-[11px]">
                  Màn hình đang ở chế độ chờ sạch sẽ. Khi có dữ liệu gửi lên từ cảm biến, các chỉ số sẽ tự động cập nhật ngay tức thì.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setIsSimulating(true)}
                className="w-full sm:w-auto justify-center px-3 py-1.5 rounded-lg font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm text-xs"
              >
                Bật Giả Lập Thử Nghiệm
              </button>
            </div>
          </div>
        )}

        {/* Notification bar if simulation is active */}
        {isSimulating && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
              <span>
                <b>Chế độ mô phỏng đang bật:</b> Đang tạo dữ liệu nhịp tim và tư thế tự động để bạn kiểm thử toàn bộ giao diện và âm thanh cảnh báo.
              </span>
            </div>
            <button
              onClick={() => setIsSimulating(false)}
              className="underline font-semibold hover:text-white ml-2"
            >
              Chuyển về lắng nghe Firebase thực tế
            </button>
          </div>
        )}

        {/* 1. Metric Cards (Heart Rate, SpO2, Posture, Monitor Zone) */}
        <MetricCards 
          telemetry={telemetry} 
          thresholds={thresholds} 
          hasData={hasReceivedData} 
        />

        {/* 2. Middle Row: Anatomical Posture Visualizer & Trend Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <PostureVisualizer 
              telemetry={telemetry} 
              hasData={hasReceivedData} 
            />
          </div>
          <div className="lg:col-span-6">
            <TrendChart
              history={history}
              hrMin={thresholds.hrMin}
              hrMax={thresholds.hrMax}
              spo2Min={thresholds.spo2Min}
              hasData={hasReceivedData}
            />
          </div>
        </div>

        {/* 3. Activity Timers (Sitting, Moving, Bad Posture, Continuous) */}
        <TimeCounters
          timeStats={timeStats}
          thresholds={thresholds}
          onResetTimers={handleResetTimers}
          hasData={hasReceivedData}
        />

        {/* 4. Monitor Zone & Calibration */}
        <MonitorZoneCard
          zone={zone}
          setZone={setZone}
          telemetry={telemetry}
          isManager={isManager}
        />

        {/* 5. History Audit Logs & CSV Export */}
        <HistoryLogs
          history={history}
          onClearHistory={() => setHistory([])}
          isManager={isManager}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 sm:py-5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© Hệ Thống Theo Dõi Sức Khỏe & Tư Thế Thông Minh • Kết Nối Raspberry Pi 4</p>
          {isManager ? (
            <div className="flex items-center gap-3 text-slate-400">
              <button onClick={() => setIsFirebaseModalOpen(true)} className="hover:text-sky-400 transition">
                Cấu hình Firebase
              </button>
              <span>•</span>
              <button onClick={() => setIsRpiGuideModalOpen(true)} className="hover:text-sky-400 transition">
                Hướng dẫn Pi 4
              </button>
              <span>•</span>
              <button onClick={() => setIsSettingsModalOpen(true)} className="hover:text-sky-400 transition">
                Ngưỡng đo cảnh báo
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <span>Tài khoản: <b>{currentUser.fullName}</b> (Nhân viên)</span>
              <span>•</span>
              <button onClick={handleLogout} className="text-sky-400 hover:underline">
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Floating AI Ergonomic Health Chatbot with Data Retrieval */}
      <HealthChatbot
        telemetry={telemetry}
        role={currentUser.role}
        sittingSeconds={timeStats.sittingSeconds}
        badPostureSeconds={timeStats.badPostureSeconds}
        hasData={hasReceivedData}
        userName={currentUser.fullName}
      />

      {/* Modals (Only Manager has access) */}
      {isManager && (
        <>
          <FirebaseConfigModal
            isOpen={isFirebaseModalOpen}
            onClose={() => setIsFirebaseModalOpen(false)}
            config={firebaseConfig}
            onSaveConfig={handleSaveFirebaseConfig}
            isConnected={isConnected}
          />

          <RaspberryPiGuideModal
            isOpen={isRpiGuideModalOpen}
            onClose={() => setIsRpiGuideModalOpen(false)}
            projectId={firebaseConfig.projectId}
          />

          <AlertSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            thresholds={thresholds}
            onSave={setThresholds}
          />
        </>
      )}
    </div>
  );
}
