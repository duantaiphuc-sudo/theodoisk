import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  HealthTelemetry, 
  UserRole, 
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
import { playAlertChime } from './services/sound';
import { getCurrentUser, logout } from './services/authService';
import { appendTelemetryToHistory } from './services/historyService';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
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
import { Sparkles, Shield, AlertTriangle, Cpu, Radio, RotateCcw, Trash2 } from 'lucide-react';

export default function App() {
  // 1. Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [role, setRole] = useState<UserRole>(() => currentUser?.role || 'employee');

  // Sync role when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setRole(currentUser.role);
    }
  }, [currentUser]);

  // 2. Firebase Configuration State
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConnectionConfig>(getSavedFirebaseConfig());
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Data reception state - When false, display empty indicators across UI
  const [hasReceivedData, setHasReceivedData] = useState<boolean>(false);
  const [isClearingFirebase, setIsClearingFirebase] = useState(false);
  const [clearNotice, setClearNotice] = useState<string | null>(null);

  // 3. Modals State
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isRpiGuideModalOpen, setIsRpiGuideModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 4. Alert Thresholds State
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

  // 5. Zone Configuration State
  const [zone, setZone] = useState<ZoneConfig>(() => {
    try {
      const saved = localStorage.getItem('theodoisk_zone');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x1: 20, y1: 10, x2: 80, y2: 90 };
  });

  // 6. Live Telemetry State (Starts empty until device or simulation pushes data)
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
    // If packet represents an empty/cleared state
    if ((data.bpm === 0 && data.spo2 === 0 && !data.trackingActive) || data.postureStatus === -1) {
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

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
  };

  // If not logged in, show dedicated 2-role login screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={user => setCurrentUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white">
      {/* Top Navigation */}
      <Header
        role={role}
        setRole={setRole}
        currentUser={currentUser}
        onLogout={handleLogout}
        isConnected={isConnected}
        isSimulating={isSimulating}
        toggleSimulation={() => setIsSimulating(!isSimulating)}
        firebaseConfig={firebaseConfig}
        onOpenFirebaseModal={() => setIsFirebaseModalOpen(true)}
        onOpenRpiGuideModal={() => setIsRpiGuideModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        soundEnabled={thresholds.soundEnabled}
        toggleSound={() => setThresholds(t => ({ ...t, soundEnabled: !t.soundEnabled }))}
        lastUpdate={lastUpdate}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Success clear notification */}
        {clearNotice && (
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs shadow-md">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              {clearNotice}
            </span>
            <button onClick={() => setClearNotice(null)} className="text-emerald-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Banner when Firebase has data from previous sessions or stale data */}
        {hasReceivedData && !isSimulating && (
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl border text-xs shadow-lg transition-all ${
            telemetry.isStale
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-slate-900/80 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                telemetry.isStale 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              }`}>
                {telemetry.isStale ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <Radio className="w-5 h-5 text-sky-400 animate-pulse" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">
                    {telemetry.isStale ? 'Bản Ghi Cũ Đang Lưu Trên Firebase' : 'Dữ Liệu Đang Đồng Bộ Từ Firebase'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    telemetry.isStale
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {telemetry.isStale ? '⚠️ Pi 4 Hiện Đang Offline / Chưa Bật' : 'Trực tuyến'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {telemetry.isStale
                    ? `Dữ liệu bạn đang nhìn thấy (${telemetry.bpm} bpm, ${telemetry.spo2}% SpO₂) là bản ghi cũ còn lưu trên Cloud Firestore (devices/pi4_node_1). Do Pi 4 hiện chưa gửi gói tin mới nên hệ thống hiển thị số liệu cũ này. Bạn có thể xóa bản ghi cũ này về trạng thái chờ (--).`
                    : `Đồng bộ từ document "${firebaseConfig.documentId || 'pi4_node_1'}". Cập nhật lúc ${lastUpdate}. Bạn có thể xóa về trạng thái chờ bất cứ lúc nào.`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                onClick={handleClearFirebaseData}
                disabled={isClearingFirebase}
                title="Xóa bản ghi cũ trên Firestore và đưa màn hình về trạng thái chờ (--)"
                className="px-3.5 py-2 rounded-xl font-semibold bg-rose-600/90 hover:bg-rose-500 text-white transition shadow-sm flex items-center gap-1.5 text-xs"
              >
                <Trash2 className={`w-3.5 h-3.5 ${isClearingFirebase ? 'animate-spin' : ''}`} />
                <span>{isClearingFirebase ? 'Đang xóa...' : 'Xóa Dữ Liệu Cũ Về Trống (--) '}</span>
              </button>
            </div>
          </div>
        )}

        {/* Empty data notification bar when no packet has arrived yet */}
        {!hasReceivedData && !isSimulating && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/90 border border-sky-500/30 text-sky-200 text-xs shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
                <Radio className="w-5 h-5 animate-pulse text-sky-400" />
              </div>
              <div>
                <span className="font-bold text-white block text-sm">
                  Đang chờ luồng dữ liệu từ Raspberry Pi 4 (Collection: devices • Doc: pi4_node_1)
                </span>
                <span className="text-slate-400 text-xs">
                  Khi chưa có dữ liệu gửi lên từ cảm biến, toàn bộ các mục được giữ trống theo đúng yêu cầu. Bạn có thể bật thử nghiệm giả lập bất kỳ lúc nào.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSimulating(true)}
                className="px-3.5 py-2 rounded-xl font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
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

        {/* 4. Monitor Zone & Calibration (Special visualizer + controls for Manager) */}
        <MonitorZoneCard
          zone={zone}
          setZone={setZone}
          telemetry={telemetry}
          isManager={role === 'manager'}
        />

        {/* 5. History Audit Logs & CSV Export */}
        <HistoryLogs
          history={history}
          onClearHistory={() => setHistory([])}
          isManager={role === 'manager'}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2025 Office Health & Posture Monitor • Tích hợp Firebase & Raspberry Pi 4</p>
          <div className="flex items-center gap-4 text-slate-400">
            {role === 'manager' && (
              <button onClick={() => setIsFirebaseModalOpen(true)} className="hover:text-sky-400 transition">
                Cấu hình Firebase
              </button>
            )}
            {role === 'manager' && <span>•</span>}
            <button onClick={() => setIsRpiGuideModalOpen(true)} className="hover:text-sky-400 transition">
              Hướng dẫn Pi 4
            </button>
            {role === 'manager' && <span>•</span>}
            {role === 'manager' && (
              <button onClick={() => setIsSettingsModalOpen(true)} className="hover:text-sky-400 transition">
                Ngưỡng đo
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Floating AI Ergonomic Health Chatbot with Data Retrieval */}
      <HealthChatbot
        telemetry={telemetry}
        role={role}
        sittingSeconds={timeStats.sittingSeconds}
        badPostureSeconds={timeStats.badPostureSeconds}
        hasData={hasReceivedData}
        userName={currentUser.fullName}
      />

      {/* Modals */}
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
    </div>
  );
}
