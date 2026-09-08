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
  clearFirebaseTelemetry,
  fetchFirebaseHistory,
  subscribeToFirebaseHistory,
  saveTelemetryHistoryToFirebase,
  clearFirebaseHistory,
  getHistoryCollectionName,
} from './services/firebase';
import { getCurrentUser, saveCurrentUser, logout } from './services/authService';
import { playAlertChime, playErgonomicVoiceAlert } from './services/sound';
import { appendTelemetryToHistory, syncHistoricalLogs, clearLocalHistoricalRecords } from './services/historyService';
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
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          soundEnabled: true,
          voiceAlertEnabled: true,
          outOfZoneAlertEnabled: true,
          ...parsed,
        };
      }
    } catch {}
    return {
      hrMin: 50,
      hrMax: 110,
      spo2Min: 94,
      incorrectPostureSec: 30,
      longIncorrectSec: 120,
      longSittingSec: 3600,
      soundEnabled: true,
      voiceAlertEnabled: true,
      outOfZoneAlertEnabled: true,
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

  // 8. History Log Records with local persistence fallback
  const [history, setHistory] = useState<TelemetryLog[]>(() => {
    try {
      const saved = localStorage.getItem('theodoisk_telemetry_history_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading history from localStorage:', e);
    }
    return [];
  });
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  // Refs for audio throttle & last alert timestamp & Firebase history throttle
  const lastAlertPlayedRef = useRef<number>(0);
  const lastPostureVoiceRef = useRef<number>(0);
  const lastZoneVoiceRef = useRef<number>(0);
  const lastVitalVoiceRef = useRef<number>(0);
  const lastInZoneStatusRef = useRef<boolean>(true);
  const lastFirebaseHistorySaveRef = useRef<number>(0);
  const lastPostureStatusRef = useRef<number>(-1);
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

  // Persist history records to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem('theodoisk_telemetry_history_v2', JSON.stringify(history.slice(0, 200)));
    } catch (e) {
      console.error('Error saving history to localStorage:', e);
    }
  }, [history]);

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

    const isBadPosture = data.postureStatus === 1 || data.postureStatus === 3;
    const isOutOfZone = data.inZone === false || data.postureStatus === 2;
    const isAbnormalHR = data.bpm > 0 && (data.bpm < currentThresholds.hrMin || data.bpm > currentThresholds.hrMax);
    const isAbnormalSpO2 = data.spo2 > 0 && data.spo2 < currentThresholds.spo2Min;

    if (isAbnormalHR) {
      hasAlert = true;
      alertType = data.bpm < currentThresholds.hrMin ? 'Nhịp tim chậm' : 'Nhịp tim nhanh';
    } else if (isAbnormalSpO2) {
      hasAlert = true;
      alertType = 'Thiếu oxy SpO₂';
    } else if (isBadPosture) {
      hasAlert = true;
      alertType = data.postureStatus === 3 ? 'Sai tư thế lâu' : 'Sai tư thế';
    } else if (isOutOfZone && currentThresholds.outOfZoneAlertEnabled && data.trackingActive !== false) {
      hasAlert = true;
      alertType = 'Ngoài vùng quan sát';
    }

    // Audio chime & Vietnamese voice alert triggers
    const now = Date.now();
    const canPlayAudio = currentThresholds.soundEnabled;
    const canPlayVoice = currentThresholds.voiceAlertEnabled;

    if (canPlayAudio || canPlayVoice) {
      // 1. Alert for Incorrect Posture ("Xin hãy ngồi thẳng lưng lên!")
      if (isBadPosture) {
        const postureJustChanged = lastPostureStatusRef.current !== data.postureStatus && lastPostureStatusRef.current === 0;
        const timeSinceLastVoice = now - lastPostureVoiceRef.current;
        if (postureJustChanged || timeSinceLastVoice > 12000) {
          lastPostureVoiceRef.current = now;
          lastAlertPlayedRef.current = now;
          playErgonomicVoiceAlert(data.postureStatus === 3 ? 'long_incorrect' : 'posture_incorrect', {
            playChime: canPlayAudio,
            playVoice: canPlayVoice,
          });
        }
      }
      // 2. Alert for Out of Observation Zone ("Bạn đang ngồi ngoài vùng quan sát, xin hãy ngồi lại vào vị trí quan sát!")
      else if (isOutOfZone && currentThresholds.outOfZoneAlertEnabled) {
        const zoneJustChanged = lastInZoneStatusRef.current !== false;
        const timeSinceLastZoneVoice = now - lastZoneVoiceRef.current;
        if (zoneJustChanged || timeSinceLastZoneVoice > 15000) {
          lastZoneVoiceRef.current = now;
          lastAlertPlayedRef.current = now;
          playErgonomicVoiceAlert('out_of_zone', {
            playChime: canPlayAudio,
            playVoice: canPlayVoice,
          });
        }
      }
      // 3. Alert for abnormal vitals (HR or SpO2)
      else if ((isAbnormalHR || isAbnormalSpO2) && now - lastVitalVoiceRef.current > 15000) {
        lastVitalVoiceRef.current = now;
        lastAlertPlayedRef.current = now;
        playErgonomicVoiceAlert('vital_abnormal', {
          playChime: canPlayAudio,
          playVoice: canPlayVoice,
          customMessage: `Cảnh báo: ${alertType}! Xin hãy kiểm tra lại trạng thái cơ thể!`,
        });
      }
    }

    lastInZoneStatusRef.current = data.inZone;

    // Create telemetry log entry
    const newEntry: TelemetryLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: data.timestamp || new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('vi-VN'),
      bpm: data.bpm,
      spo2: data.spo2,
      postureStatus: data.postureStatus,
      postureLabel: data.postureLabel,
      trackingActive: data.trackingActive,
      hasAlert,
      alertType,
    };

    // Add to local history (deduplicating rapid identical samples)
    setHistory(prev => {
      if (prev.length > 0) {
        const first = prev[0];
        const sameMetrics = first.bpm === newEntry.bpm && first.spo2 === newEntry.spo2 && first.postureStatus === newEntry.postureStatus;
        const timeDiff = Math.abs(new Date(newEntry.timestamp).getTime() - new Date(first.timestamp).getTime());
        if (sameMetrics && timeDiff < 3000) {
          return prev;
        }
      }
      return [newEntry, ...prev.slice(0, 199)];
    });

    // Save to Firebase Firestore / RTDB history collection:
    // We write to Firebase if:
    // 1. There is an active alert (abnormal posture or vital sign)
    // 2. Posture status changed (e.g. from Good to Bad)
    // 3. Or at least 25 seconds elapsed since last Firebase history write (heartbeat recording)
    const nowTime = Date.now();
    const timeSinceLastRemote = nowTime - lastFirebaseHistorySaveRef.current;
    const postureChanged = lastPostureStatusRef.current !== -1 && lastPostureStatusRef.current !== data.postureStatus;
    lastPostureStatusRef.current = data.postureStatus;

    const shouldSaveRemote = (data.bpm > 0 || data.spo2 > 0 || data.postureStatus >= 0) &&
      (hasAlert || postureChanged || timeSinceLastRemote > 25000);

    if (shouldSaveRemote && firebaseConfig.autoConnect && !isSimulating) {
      lastFirebaseHistorySaveRef.current = nowTime;
      saveTelemetryHistoryToFirebase(firebaseConfig, newEntry).catch(err => {
        console.warn('Ghi log lịch sử Firebase thất bại:', err);
      });
    }
  }, [firebaseConfig, isSimulating]);

  // Subscribe to Firebase Live Telemetry
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

  // Fetch & Subscribe to Firebase History Collection
  useEffect(() => {
    let unsubHistory: (() => void) | null = null;

    if (firebaseConfig.autoConnect && !isSimulating) {
      setIsSyncingHistory(true);
      fetchFirebaseHistory(firebaseConfig, 100)
        .then(remoteLogs => {
          if (remoteLogs && remoteLogs.length > 0) {
            setHistory(prev => {
              const map = new Map<string, TelemetryLog>();
              remoteLogs.forEach(l => map.set(l.timestamp, l));
              prev.forEach(l => {
                if (!map.has(l.timestamp)) map.set(l.timestamp, l);
              });
              const merged = Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 200);
              syncHistoricalLogs(merged);
              return merged;
            });
          }
        })
        .finally(() => {
          setIsSyncingHistory(false);
        });

      unsubHistory = subscribeToFirebaseHistory(
        firebaseConfig,
        remoteLogs => {
          if (remoteLogs && remoteLogs.length > 0) {
            setHistory(prev => {
              const map = new Map<string, TelemetryLog>();
              remoteLogs.forEach(l => map.set(l.timestamp, l));
              prev.forEach(l => {
                if (!map.has(l.timestamp)) map.set(l.timestamp, l);
              });
              const merged = Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 200);
              syncHistoricalLogs(merged);
              return merged;
            });
          }
        },
        err => {
          console.warn('Thông báo lắng nghe lịch sử Firebase:', err);
        }
      );
    }

    return () => {
      if (unsubHistory) unsubHistory();
    };
  }, [firebaseConfig, isSimulating]);

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

        // Trigger chime & voice alert if crossing bad posture limit or continuous sitting
        if (newBad === currentThresh.incorrectPostureSec && (currentThresh.soundEnabled || currentThresh.voiceAlertEnabled)) {
          playErgonomicVoiceAlert('long_incorrect', {
            playChime: currentThresh.soundEnabled,
            playVoice: currentThresh.voiceAlertEnabled,
          });
        } else if (newContinuous === currentThresh.longSittingSec && (currentThresh.soundEnabled || currentThresh.voiceAlertEnabled)) {
          playErgonomicVoiceAlert('long_sitting', {
            playChime: currentThresh.soundEnabled,
            playVoice: currentThresh.voiceAlertEnabled,
          });
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

      // Posture cycle:
      // 0 - 14: Tư thế ĐÚNG (inZone = true)
      // 15 - 21: Tư thế SAI (inZone = true) -> Kích hoạt nhắc nhở: "Xin hãy ngồi thẳng lưng lên!"
      // 22 - 27: NGOÀI VÙNG QUAN SÁT (inZone = false) -> Kích hoạt nhắc nhở: "Bạn đang ngồi ngoài vùng quan sát..."
      let simPosture = 0;
      let label = 'Tư thế ĐÚNG';
      let angle = 158;
      let inZone = true;
      let warning: string | undefined = undefined;

      const cycle = step % 28;
      if (cycle >= 14 && cycle < 21) {
        simPosture = 1;
        label = 'Tư thế SAI (Cúi gù)';
        angle = 125;
        warning = 'Cột sống đang bị gù hoặc cúi cổ';
      } else if (cycle >= 21) {
        simPosture = 2;
        label = 'NGOÀI VÙNG QUAN SÁT';
        inZone = false;
        angle = 0;
        warning = 'Người ngồi lệch ngoài vùng quan sát của Camera';
      }

      handleIncomingTelemetry({
        bpm: jitterBpm,
        spo2: jitterSpO2,
        postureStatus: simPosture,
        postureLabel: label,
        trackingActive: simPosture !== 2,
        inZone: inZone,
        timestamp: new Date().toISOString(),
        source: 'Raspberry Pi 4 (Giả Lập)',
        confidence: inZone ? 97 : 12,
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

  const handleRefreshHistory = async () => {
    setIsSyncingHistory(true);
    try {
      const remoteLogs = await fetchFirebaseHistory(firebaseConfig, 100);
      if (remoteLogs && remoteLogs.length > 0) {
        setHistory(prev => {
          const map = new Map<string, TelemetryLog>();
          remoteLogs.forEach(l => map.set(l.timestamp, l));
          prev.forEach(l => {
            if (!map.has(l.timestamp)) map.set(l.timestamp, l);
          });
          const merged = Array.from(map.values())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 200);
          syncHistoricalLogs(merged);
          return merged;
        });
        setClearNotice(`Đã tải về ${remoteLogs.length} bản ghi lịch sử lưu trên Firebase Firestore!`);
        setTimeout(() => setClearNotice(null), 4000);
      } else {
        setClearNotice('Chưa có bản ghi lịch sử nào trên Firebase Firestore.');
        setTimeout(() => setClearNotice(null), 3000);
      }
    } catch (err: any) {
      console.warn('Lỗi đồng bộ lịch sử:', err);
      setClearNotice(`Lỗi đồng bộ lịch sử: ${err.message || 'Kiểm tra kết nối Firebase'}`);
      setTimeout(() => setClearNotice(null), 4000);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const handleSaveSnapshot = () => {
    if (telemetry.bpm === 0 && telemetry.spo2 === 0 && telemetry.postureStatus === -1) {
      setClearNotice('Chưa có số liệu đang hoạt động để lưu mốc!');
      setTimeout(() => setClearNotice(null), 3000);
      return;
    }

    const snapEntry: TelemetryLog = {
      id: `snap-${Date.now()}`,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('vi-VN'),
      bpm: telemetry.bpm,
      spo2: telemetry.spo2,
      postureStatus: telemetry.postureStatus,
      postureLabel: telemetry.postureLabel,
      trackingActive: telemetry.trackingActive,
      hasAlert: telemetry.postureStatus === 1 || telemetry.postureStatus === 3 || (telemetry.bpm > 0 && (telemetry.bpm < thresholds.hrMin || telemetry.bpm > thresholds.hrMax)),
      alertType: telemetry.postureStatus === 1 ? 'Sai tư thế' : undefined,
    };

    setHistory(prev => [snapEntry, ...prev.slice(0, 199)]);
    saveTelemetryHistoryToFirebase(firebaseConfig, snapEntry).catch(() => {});
    setClearNotice('Đã lưu mốc dữ liệu hiện tại vào Firebase Firestore và bộ nhớ thiết bị!');
    setTimeout(() => setClearNotice(null), 4000);
  };

  const handleClearHistory = async () => {
    setHistory([]);
    try {
      localStorage.removeItem('theodoisk_telemetry_history_v2');
    } catch {}
    clearLocalHistoricalRecords();

    try {
      await clearFirebaseHistory(firebaseConfig);
      setClearNotice('Đã xóa sạch toàn bộ lịch sử trên thiết bị và Firebase Firestore.');
      setTimeout(() => setClearNotice(null), 4000);
    } catch (err) {
      console.warn('Lỗi xóa lịch sử từ Firebase:', err);
      setClearNotice('Đã xóa lịch sử bộ nhớ trong máy.');
      setTimeout(() => setClearNotice(null), 4000);
    }
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
        voiceAlertEnabled={thresholds.voiceAlertEnabled}
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
          onClearHistory={handleClearHistory}
          onRefreshHistory={handleRefreshHistory}
          onSaveSnapshot={handleSaveSnapshot}
          isSyncing={isSyncingHistory}
          firebaseHistoryCollection={getHistoryCollectionName(firebaseConfig)}
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
