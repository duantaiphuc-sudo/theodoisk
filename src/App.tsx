import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  HealthTelemetry, 
  TimeCalculations, 
  AlertThresholds, 
  TelemetryLog, 
  FirebaseConnectionConfig,
  AuthUser,
  UserTaskNotification,
  MainNavTab
} from './types';
import { 
  getSavedFirebaseConfig, 
  saveFirebaseConfig, 
  subscribeToFirebaseTelemetry,
  clearFirebaseTelemetry,
  clearFirebaseHistory,
  purgeAllFirebaseHistoryCollections,
  deleteSingleTelemetryLogFromFirebase,
  subscribeToTaskNotifications,
  updateTaskStatusInFirebase,
  updateUserRealtimePresence,
  checkIsQuotaExceeded,
  onQuotaExceededChange,
} from './services/firebase';
import { getCurrentUser, saveCurrentUser, logout, fetchAllUsers, isUserAdmin, refreshCurrentUserClaims } from './services/authService';
import { playAlertChime, playErgonomicVoiceAlert } from './services/sound';
import { appendTelemetryToHistory, syncHistoricalLogs, clearLocalHistoricalRecords } from './services/historyService';
import { notificationManager } from './services/notificationService';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { LoginScreen } from './components/LoginScreen';
import { MetricCards } from './components/MetricCards';
import { PostureVisualizer } from './components/PostureVisualizer';
import { TrendChart } from './components/TrendChart';
import { TimeCounters } from './components/TimeCounters';
import { WeeklyPostureChart } from './components/WeeklyPostureChart';
import { HistoryLogs } from './components/HistoryLogs';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { SupabaseModal } from './components/SupabaseModal';
import { RaspberryPiGuideModal } from './components/RaspberryPiGuideModal';
import { AlertSettingsModal } from './components/AlertSettingsModal';
import { 
  insertTelemetryToSupabase, 
  subscribeToSupabaseRealtime,
  fetchSupabaseHistory,
  clearSupabaseHistory,
  deleteSingleLogFromSupabase,
  normalizeDateFormatted
} from './services/supabaseService';
import { UserProfileModal } from './components/UserProfileModal';
import { UserManagementModal } from './components/UserManagementModal';
import { UserTaskAlertBanner } from './components/UserTaskAlertBanner';
import { HealthChatbot } from './components/HealthChatbot';
import { AdminDashboard } from './components/AdminDashboard';
import { generateSimulatedTelemetry, SimPostureScenario } from './domain/simulationGenerator';
import { 
  Sparkles, 
  AlertTriangle, 
  Radio, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Bell, 
  FileText, 
  Plus, 
  Layers, 
  ExternalLink,
  Shield
} from 'lucide-react';

export default function App() {
  // 0. Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());
  const isManager = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager' || isUserAdmin(currentUser)));
  const [selectedHistoryAccount, setSelectedHistoryAccount] = useState<string>(() => {
    const user = getCurrentUser();
    const isMgr = Boolean(user && (user.role === 'admin' || user.role === 'manager' || isUserAdmin(user)));
    return isMgr ? 'all' : (user?.id || 'all');
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);

  // 1. Firebase Configuration State
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConnectionConfig>(getSavedFirebaseConfig());
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simPostureMode, setSimPostureMode] = useState<SimPostureScenario>('auto');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    refreshCurrentUserClaims().then(updated => {
      if (updated && updated.role !== currentUser?.role) {
        setCurrentUser(updated);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser && !isManager && selectedHistoryAccount !== currentUser.id) {
      setSelectedHistoryAccount(currentUser.id);
    }
  }, [currentUser, isManager, selectedHistoryAccount]);

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
    saveCurrentUser(user);
    const isMgr = Boolean(user.role === 'admin' || user.role === 'manager' || isUserAdmin(user));
    setSelectedHistoryAccount(isMgr ? 'all' : user.id);
    if (firebaseConfig.autoConnect) {
      updateUserRealtimePresence(firebaseConfig, user.id, {
        isOnline: true,
        lastActive: new Date().toISOString(),
        currentPresence: 'Present',
        currentPosture: 'waiting',
        currentPostureText: '– Chờ kết nối',
        sittingMinutes: 0,
        bpm: 0,
        spo2: 0,
        hasAlert: false,
        device: user.device || (user.role === 'admin' ? 'pi4_node_1' : 'pi4_node_2')
      }).catch(() => {});
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      updateUserRealtimePresence(firebaseConfig, currentUser.id, {
        isOnline: false,
        currentPresence: 'Away',
        currentPosture: 'waiting',
        currentPostureText: '– Chờ kết nối',
        bpm: 0,
        spo2: 0,
        sittingMinutes: 0
      }).catch(() => {});
    }
    logout();
    setCurrentUser(null);
  };

  // Data reception state - When false, display empty indicators across UI
  const [hasReceivedData, setHasReceivedData] = useState<boolean>(false);
  const [isClearingFirebase, setIsClearingFirebase] = useState(false);
  const [clearNotice, setClearNotice] = useState<string | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(() => checkIsQuotaExceeded());

  useEffect(() => {
    return onQuotaExceededChange((exceeded) => {
      setIsQuotaExceeded(exceeded);
    });
  }, []);

  // 2. Modals State
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
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
          browserNotificationEnabled: true,
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
      standingTargetSec: 300,
      soundEnabled: true,
      voiceAlertEnabled: true,
      outOfZoneAlertEnabled: true,
      browserNotificationEnabled: true,
    };
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
    standingSeconds: 0,
    movingSeconds: 0,
    badPostureSeconds: 0,
    continuousSittingSeconds: 0,
    continuousStandingSeconds: 0,
  });

  // Main vertical sidebar navigation tab: 'overview' | 'zone' | 'logs' | 'tasks'
  const [mainNavTab, setMainNavTab] = useState<MainNavTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Mobile quick view filter tab inside overview
  const [mobileActiveTab, setMobileActiveTab] = useState<'all' | 'biometrics' | 'posture' | 'timers'>('all');

  // 8. History Log Records with local persistence scoped per user account
  const [history, setHistory] = useState<TelemetryLog[]>(() => {
    try {
      const user = getCurrentUser();
      const storageKey = user ? `theodoisk_history_${user.id}` : 'theodoisk_history_guest';
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Strictly ensure only records belonging to this user are kept
          return parsed.filter(l => 
            !user || !l.userId || l.userId === user.id || 
            (l.userEmail && user.email && l.userEmail.toLowerCase() === user.email.toLowerCase())
          );
        }
      }
    } catch (e) {
      console.error('Error loading history from localStorage:', e);
    }
    return [];
  });
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  // When user switches or logs in/out, load THAT user's private history
  useEffect(() => {
    if (!currentUser) {
      setHistory([]);
      return;
    }
    try {
      const storageKey = `theodoisk_history_${currentUser.id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const userOnly = parsed.filter(l => 
            (l.userId && l.userId === currentUser.id) || 
            (l.userEmail && currentUser.email && l.userEmail.toLowerCase() === currentUser.email.toLowerCase())
          );
          setHistory(userOnly);
          return;
        }
      }
    } catch (e) {}
    setHistory([]);
  }, [currentUser?.id]);

  // 9. Task & Broadcast Notifications State
  const [taskNotifications, setTaskNotifications] = useState<UserTaskNotification[]>([]);

  // Subscribe to real-time task notifications from Firebase Firestore
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeToTaskNotifications(firebaseConfig, currentUser.id, (notifs) => {
      setTaskNotifications(notifs);
    });
    return () => unsub();
  }, [currentUser, firebaseConfig]);

  // Refs for audio throttle & last alert timestamp & Firebase history throttle
  const lastAlertPlayedRef = useRef<number>(0);
  const lastPostureVoiceRef = useRef<number>(0);
  const lastZoneVoiceRef = useRef<number>(0);
  const lastVitalVoiceRef = useRef<number>(0);
  const lastInZoneStatusRef = useRef<boolean>(true);
  const lastFirebaseHistorySaveRef = useRef<number>(0);
  const lastSavedMetricsRef = useRef<{ bpm: number; spo2: number }>({ bpm: 0, spo2: 0 });
  const lastPostureStatusRef = useRef<number>(-1);
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const timeStatsRef = useRef(timeStats);
  timeStatsRef.current = timeStats;
  const isSimulatingRef = useRef(isSimulating);
  isSimulatingRef.current = isSimulating;
  const lastProcessedPacketTimestampRef = useRef<string>('');

  const [allRegisteredUsers, setAllRegisteredUsers] = useState<AuthUser[]>([]);

  useEffect(() => {
    fetchAllUsers().then(users => {
      if (users && users.length > 0) {
        setAllRegisteredUsers(users);
      }
    }).catch(() => {});
  }, [firebaseConfig]);

  // Save thresholds & zone when changed
  useEffect(() => {
    localStorage.setItem('theodoisk_thresholds', JSON.stringify(thresholds));
  }, [thresholds]);


  // Persist history records to localStorage on every state change (strictly scoped per user)
  useEffect(() => {
    if (!currentUser) return;
    try {
      const storageKey = `theodoisk_history_${currentUser.id}`;
      const userOnly = history.filter(l => 
        !l.userId || l.userId === currentUser.id || 
        (l.userEmail && l.userEmail.toLowerCase() === currentUser.email.toLowerCase())
      );
      localStorage.setItem(storageKey, JSON.stringify(userOnly.slice(0, 200)));
    } catch (e) {
      console.error('Error saving history to localStorage:', e);
    }
  }, [history, currentUser?.id]);

  // Handle new incoming telemetry packet
  const handleIncomingTelemetry = useCallback((data: HealthTelemetry) => {
    // Deduplicate exact same packet repeatedly emitted by Firestore cache
    if (data.timestamp && data.timestamp === lastProcessedPacketTimestampRef.current) {
      return;
    }
    lastProcessedPacketTimestampRef.current = data.timestamp || '';

    // Only consider packet empty if posture is unknown/cleared (-1) AND no sensors, verifying status, or camera frames are present
    const isVerifying = data.postureStatus === -1 && (data.postureLabel?.toLowerCase().includes('xác nhận') || data.trackingActive);
    const isEmptyPacket = (data.postureStatus === -1 && !isVerifying) && data.bpm === 0 && data.spo2 === 0 && !data.trackingActive && !data.image;

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

    // 4. Browser Notification API (Triggers system notification even when browser window is minimized or user is on another tab)
    if (hasAlert && currentThresholds.browserNotificationEnabled) {
      let notifTitle = '⚠️ Cảnh Báo Sức Khỏe - HealthOffice';
      let notifBody = '';

      if (isBadPosture) {
        notifTitle = data.postureStatus === 3 ? '🚨 Cảnh Báo: Sai Tư Thế Quá Lâu!' : '⚠️ Nhắc Nhở Tư Thế Ngồi';
        notifBody = data.postureStatus === 3
          ? 'Bạn đang ngồi sai tư thế liên tục hơn 2 phút. Hãy ngồi thẳng lưng để bảo vệ cột sống!'
          : 'Phát hiện tư thế gù lưng hoặc nghiêng vẹo. Xin hãy điều chỉnh lại tư thế ngồi!';
      } else if (isAbnormalHR) {
        notifTitle = '❤️ Cảnh Báo Nhịp Tim Bất Thường';
        notifBody = `Nhịp tim hiện tại là ${data.bpm} bpm (${alertType}). Hãy thả lỏng và hít thở đều!`;
      } else if (isAbnormalSpO2) {
        notifTitle = '🫁 Cảnh Báo Nồng Độ Oxy SpO₂ Thấp';
        notifBody = `Nồng độ oxy SpO₂ đang ở mức ${data.spo2}%. Hãy hít thở sâu hoặc kiểm tra lại cảm biến!`;
      } else if (isOutOfZone && currentThresholds.outOfZoneAlertEnabled) {
        notifTitle = '👀 Nhắc Nhở Vùng Giám Sát';
        notifBody = 'Bạn đang ngồi lệch hoặc ra ngoài vùng camera AI. Hãy ngồi vào vị trí để tiếp tục đo!';
      }

      if (notifBody) {
        notificationManager.sendNotification({
          title: notifTitle,
          body: notifBody,
          tag: alertType || 'health_alert',
        });
      }
    }

    lastInZoneStatusRef.current = data.inZone;

    // Create telemetry log entry with full date and time
    const packetDate = data.timestamp ? new Date(data.timestamp) : new Date();
    const validPacketDate = isNaN(packetDate.getTime()) ? new Date() : packetDate;
    const timeFormatted = validPacketDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateFormatted = normalizeDateFormatted(validPacketDate);
    const dateTimeFormatted = `${dateFormatted} ${timeFormatted}`;

    const activeUser = currentUserRef.current;
    const newEntry: TelemetryLog = {
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: validPacketDate.toISOString(),
      timeFormatted,
      dateFormatted,
      dateTimeFormatted,
      bpm: data.bpm,
      spo2: data.spo2,
      postureStatus: data.postureStatus,
      postureLabel: data.postureLabel,
      trackingActive: data.trackingActive,
      hasAlert,
      alertType,
      userId: activeUser?.id,
      userEmail: activeUser?.email,
      userName: activeUser?.fullName || activeUser?.username,
      device: firebaseConfig.documentId || 'pi4_node_1'
    };

    // Add to local history (deduplicating rapid identical samples within 2 seconds)
    setHistory(prev => {
      const active = currentUserRef.current;
      const userOnlyPrev = active 
        ? prev.filter(l => !l.userId || l.userId === active.id || (l.userEmail && l.userEmail.toLowerCase() === active.email.toLowerCase()))
        : prev;

      if (userOnlyPrev.length > 0) {
        const first = userOnlyPrev[0];
        const sameMetrics = first.bpm === newEntry.bpm && first.spo2 === newEntry.spo2 && first.postureStatus === newEntry.postureStatus;
        const timeDiff = Math.abs(new Date(newEntry.timestamp).getTime() - new Date(first.timestamp).getTime());
        if (sameMetrics && timeDiff < 2000) {
          return userOnlyPrev;
        }
      }
      return [newEntry, ...userOnlyPrev.slice(0, 299)];
    });

    // Realtime broadcast to Firestore directly on every telemetry update (Fast-path, eliminates latency)
    const hasLiveSignal = Boolean(
      data && (
        data.postureStatus >= 0 ||
        data.bpm > 0 ||
        data.spo2 > 0 ||
        (data.inZone && data.trackingActive)
      )
    );
    const isCameraUntracked = isOutOfZone || data.trackingActive === false;
    const isAbsent = hasLiveSignal && (data.postureStatus === 2 || isCameraUntracked);
    const isStanding = hasLiveSignal && !isAbsent && (data.postureStatus === 5 || data.postureLabel?.toLowerCase().includes('đứng'));
    const isBad = hasLiveSignal && !isAbsent && (data.postureStatus === 1 || data.postureStatus === 3);

    const presence: 'Present' | 'Away' = 'Present'; // Active logged-in session is always Present (Đang hoạt động)
    const posture: 'correct' | 'incorrect' | 'absent' | 'waiting' | 'standing' = !hasLiveSignal
      ? 'waiting'
      : (isVerifying ? 'waiting' : (isAbsent ? 'absent' : (isStanding ? 'standing' : (isBad ? 'incorrect' : 'correct'))));
    const postureText = !hasLiveSignal
      ? '– Chờ kết nối'
      : (isVerifying ? '– Đang xác nhận' : (isAbsent ? '– Ngoài vùng' : (isStanding ? '↑ Đứng' : (isBad ? '⚠ Sai' : '✓ Đúng'))));

    if (activeUser && firebaseConfig.autoConnect) {
      updateUserRealtimePresence(firebaseConfig, activeUser.id, {
        isOnline: true,
        lastActive: new Date().toISOString(),
        currentPresence: presence,
        currentPosture: posture,
        currentPostureText: postureText,
        sittingMinutes: Math.floor((timeStatsRef.current.sittingSeconds || 0) / 60),
        bpm: (isAbsent || !hasLiveSignal) ? 0 : data.bpm,
        spo2: (isAbsent || !hasLiveSignal) ? 0 : data.spo2,
        hasAlert: hasLiveSignal && !isAbsent && (isBad || (data.bpm > 0 && (data.bpm < currentThresholds.hrMin || data.bpm > currentThresholds.hrMax))),
        alertReason: hasLiveSignal && !isAbsent && isBad ? (data.postureWarning || 'Cột sống đang bị gù hoặc cúi cổ') : '',
        device: firebaseConfig.documentId || (activeUser.role === 'admin' ? 'pi4_node_1' : 'pi4_node_2')
      }).catch(() => {});
    }

    // === SUPABASE-FIRST STORAGE STRATEGY ===
    // Lưu lịch sử telemetry vào Supabase PostgreSQL là nguồn chính.
    // Firebase chỉ dùng để đồng bộ trạng thái présence (online/offline) ở trên.
    // KHÔNG ghi lịch sử đo đạc lên Firestore để tối ưu hóa hạn mức 50k read/write/ngày.
    const isSimulated = isSimulatingRef.current || data.source?.includes('Giả Lập') || data.source?.includes('Simulated');
    const isStale = Boolean(data.isStale);

    const nowTime = Date.now();
    const timeSinceLastRemote = nowTime - lastFirebaseHistorySaveRef.current;
    const postureChanged = lastPostureStatusRef.current !== -1 && lastPostureStatusRef.current !== data.postureStatus;
    lastPostureStatusRef.current = data.postureStatus;

    const metricsChanged = 
      Math.abs(data.bpm - lastSavedMetricsRef.current.bpm) >= 2 ||
      Math.abs(data.spo2 - lastSavedMetricsRef.current.spo2) >= 1;

    const hasValidMetrics = data.bpm > 0 || data.spo2 > 0 || (data.postureStatus !== undefined && data.postureStatus >= 0);

    // Ghi vào Supabase PostgreSQL:
    // - Tự động đồng bộ liên tục: Khi có cảnh báo, tư thế đổi, nhịp tim/SpO2 biến thiên, hoặc mỗi 5 giây
    const shouldSaveSupabase = activeUser && hasValidMetrics && !isStale && (
      hasAlert || 
      postureChanged || 
      metricsChanged || 
      timeSinceLastRemote >= (isSimulated ? 6000 : 5000)
    );

    if (shouldSaveSupabase) {
      lastFirebaseHistorySaveRef.current = nowTime;
      lastSavedMetricsRef.current = { bpm: data.bpm, spo2: data.spo2 };
      insertTelemetryToSupabase(newEntry, activeUser).catch(() => {});
    }
  }, [firebaseConfig]);

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

  // Subscribe to Supabase Realtime Telemetry (WebSocket / postgres_changes)
  useEffect(() => {
    if (isSimulating) return;

    const unsubSupabase = subscribeToSupabaseRealtime(
      undefined, // Không nạp audit log làm dữ liệu cảm biến live để tránh lỗi tự nhảy số
      (newLog) => {
        if (!currentUser) return;
        const isEmployee = currentUser.role === 'employee';
        const matchesUser = (newLog.userId && newLog.userId === currentUser.id) ||
          (newLog.userEmail && currentUser.email && newLog.userEmail.toLowerCase() === currentUser.email.toLowerCase());

        // Nếu là nhân viên: CHỈ nhận bản ghi của chính tài khoản mình
        // Nếu là quản trị viên: Nhận bản ghi để giám sát
        if (matchesUser || !isEmployee) {
          setHistory(prev => {
            if (prev.some(l => l.id === newLog.id || (l.id && l.id === newLog.id))) return prev;
            return [newLog, ...prev.filter(l => l.id !== newLog.id).slice(0, 299)];
          });
        }
      },
      currentUser?.id,
      currentUser?.email,
      (deletedId) => {
        // Khi một bản ghi bị xóa trên Supabase Table Editor -> xóa ngay tức thì trên Web!
        setHistory(prev => {
          const updated = prev.filter(l => l.id !== deletedId);
          if (currentUser?.id) {
            try {
              localStorage.setItem(`theodoisk_history_${currentUser.id}`, JSON.stringify(updated));
            } catch {}
          }
          return updated;
        });
      }
    );

    return () => {
      unsubSupabase();
    };
  }, [isSimulating, currentUser?.id, currentUser?.email]);

  // Fetch lịch sử từ Supabase PostgreSQL khi đăng nhập / khi user thay đổi
  // Supabase PostgreSQL là nguồn dữ liệu chuẩn duy nhất (Single Source of Truth)
  useEffect(() => {
    if (!currentUser) return;

    setIsSyncingHistory(true);
    const curId = currentUser.id;
    const curEmail = (currentUser.email || '').toLowerCase().trim();

    fetchSupabaseHistory('all', curId, currentUser.email)
      .then(result => {
        if (result.data) {
          // Lấy đúng danh sách bản ghi từ Supabase PostgreSQL
          const userOnly = result.data.filter(l =>
            !curId || !l.userId || l.userId === curId ||
            (l.userEmail && l.userEmail.toLowerCase() === curEmail)
          );

          setHistory(userOnly);
          syncHistoricalLogs(userOnly);

          try {
            if (userOnly.length > 0) {
              localStorage.setItem(`theodoisk_history_${curId}`, JSON.stringify(userOnly));
            } else {
              localStorage.removeItem(`theodoisk_history_${curId}`);
            }
          } catch {}
        }
        if (result.error) {
          console.warn('[Supabase] Lỗi tải lịch sử:', result.error);
        }
      })
      .finally(() => {
        setIsSyncingHistory(false);
      });
  }, [currentUser?.id]);

  // Second timer loop for web-calculated activity times
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStats(prev => {
        const current = telemetryRef.current;
        const currentThresh = thresholdsRef.current;

        // Nếu chưa có dữ liệu hoặc không hoạt động theo dõi: Dừng toàn bộ bộ đếm thời gian, không tự động nhảy giây
        const hasActiveData = current.trackingActive && current.postureStatus !== -1;
        if (!hasActiveData) {
          return prev;
        }

        // In seat / active
        const isStanding = current.trackingActive && current.postureStatus === 5;
        const isSeated = current.trackingActive && current.postureStatus !== 2 && current.postureStatus !== -1 && current.postureStatus !== 5;
        const isMoving = current.trackingActive && (current.postureStatus === 2 || !current.inZone);
        const isBad = isSeated && (current.postureStatus === 1 || current.postureStatus === 3);

        const newBad = isBad ? prev.badPostureSeconds + 1 : 0;
        const newSitting = isSeated ? prev.sittingSeconds + 1 : prev.sittingSeconds;
        const newStanding = isStanding ? (prev.standingSeconds || 0) + 1 : (prev.standingSeconds || 0);
        const newMoving = isMoving ? prev.movingSeconds + 1 : prev.movingSeconds;
        const newContinuous = isSeated ? prev.continuousSittingSeconds + 1 : 0;
        const newContinuousStanding = isStanding ? (prev.continuousStandingSeconds || 0) + 1 : 0;

        const targetStandingSec = currentThresh.standingTargetSec || 300;
        const targetStandingMin = Math.max(1, Math.round(targetStandingSec / 60));

        // 1. Trigger chime & voice alert if crossing bad posture limit
        if (newBad === currentThresh.incorrectPostureSec && (currentThresh.soundEnabled || currentThresh.voiceAlertEnabled)) {
          playErgonomicVoiceAlert('long_incorrect', {
            playChime: currentThresh.soundEnabled,
            playVoice: currentThresh.voiceAlertEnabled,
          });
        } 
        // 2. Trigger sit-to-stand prompt when continuous sitting reaches threshold
        else if (newContinuous === currentThresh.longSittingSec && (currentThresh.soundEnabled || currentThresh.voiceAlertEnabled)) {
          playErgonomicVoiceAlert('sit_to_stand_prompt', {
            playChime: currentThresh.soundEnabled,
            playVoice: currentThresh.voiceAlertEnabled,
            customMessage: `Cảnh báo: Bạn đã ngồi làm việc liên tục ${Math.floor(currentThresh.longSittingSec / 60)} phút! Xin hãy đứng dậy làm việc trong ${targetStandingMin} phút để bảo vệ cột sống và giải phóng áp lực đĩa đệm nhé!`
          });

          if (currentThresh.browserNotificationEnabled) {
            notificationManager.sendNotification({
              title: '⏰ Hãy đứng dậy làm việc!',
              body: `Bạn đã ngồi liên tục ${Math.floor(currentThresh.longSittingSec / 60)} phút. Khuyến nghị đứng dậy làm việc trong ${targetStandingMin} phút nhé!`,
              tag: 'sit_to_stand_alert',
              requireInteraction: true
            });
          }
        }
        // 3. Trigger standing goal reached notification when user stood for the target duration
        else if (newContinuousStanding === targetStandingSec && (currentThresh.soundEnabled || currentThresh.voiceAlertEnabled)) {
          playErgonomicVoiceAlert('standing_goal_reached', {
            playChime: currentThresh.soundEnabled,
            playVoice: currentThresh.voiceAlertEnabled,
            customMessage: `Tuyệt vời! Bạn đã hoàn thành ${targetStandingMin} phút đứng làm việc theo mục tiêu. Bạn có thể ngồi xuống tiếp tục công việc rồi nhé!`
          });

          if (currentThresh.browserNotificationEnabled) {
            notificationManager.sendNotification({
              title: '🎉 Hoàn thành mục tiêu đứng!',
              body: `Bạn đã đứng đủ ${targetStandingMin} phút. Cột sống đã được giải phóng áp lực, bạn có thể ngồi xuống tiếp tục làm việc!`,
              tag: 'standing_goal_reached'
            });
          }
        }

        return {
          sittingSeconds: newSitting,
          standingSeconds: newStanding,
          movingSeconds: newMoving,
          badPostureSeconds: newBad,
          continuousSittingSeconds: newContinuous,
          continuousStandingSeconds: newContinuousStanding,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Simulation mode (generates realistic Raspberry Pi 4 sensor fluctuations)
  useEffect(() => {
    if (!isSimulating) {
      setTelemetry(prev => {
        if (prev.source?.includes('Giả Lập') || prev.source?.includes('Simulated')) {
          setHasReceivedData(false);
          setLastUpdate(null);
          return {
            bpm: 0,
            spo2: 0,
            postureStatus: -1,
            postureLabel: 'Chưa có dữ liệu',
            trackingActive: false,
            inZone: false,
            timestamp: new Date().toISOString(),
            source: 'Chờ Raspberry Pi 4...',
            confidence: 0,
          };
        }
        return prev;
      });
      return;
    }

    setIsConnected(true);
    let step = 0;

    // Immediately emit initial sample so user doesn't wait 2 seconds for feedback
    const initialSim = generateSimulatedTelemetry(0, simPostureMode);
    handleIncomingTelemetry({
      ...initialSim,
      timestamp: new Date().toISOString(),
    });

    const simInterval = setInterval(() => {
      step++;
      const simData = generateSimulatedTelemetry(step, simPostureMode);
      handleIncomingTelemetry({
        ...simData,
        timestamp: new Date().toISOString(),
      });
    }, 2000);

    return () => clearInterval(simInterval);
  }, [isSimulating, simPostureMode, handleIncomingTelemetry]);

  const lastPresenceKeyRef = useRef<string>('');
  const lastPresenceSyncTimeRef = useRef<number>(0);

  // Synchronize presence and live metrics to Firestore user account (throttled & state-driven)
  useEffect(() => {
    if (!currentUser || checkIsQuotaExceeded()) return;

    const hasLiveSignal = Boolean(
      telemetry && (
        telemetry.postureStatus >= 0 ||
        telemetry.bpm > 0 ||
        telemetry.spo2 > 0 ||
        (telemetry.inZone && telemetry.trackingActive)
      )
    );

    const isOutOfZone = telemetry.inZone === false || telemetry.trackingActive === false;
    const isAbsent = hasLiveSignal && (telemetry.postureStatus === 2 || isOutOfZone);
    const isStanding = telemetry.postureStatus === 5;
    const isBad = hasLiveSignal && !isAbsent && (telemetry.postureStatus === 1 || telemetry.postureStatus === 3);

    const presence: 'Present' | 'Away' = hasLiveSignal ? 'Present' : 'Away';
    const posture: 'correct' | 'incorrect' | 'absent' | 'waiting' = !hasLiveSignal
      ? 'waiting'
      : (isStanding ? 'correct' : isAbsent ? 'absent' : (isBad ? 'incorrect' : 'correct'));
    const postureText = !hasLiveSignal
      ? '– Chờ kết nối'
      : (isStanding ? '– Đứng' : isAbsent ? '– Ngoài vùng' : (isBad ? '⚠ Sai' : '✓ Đúng'));

    const stateKey = `${currentUser.id}_${presence}_${posture}_${telemetry.postureStatus}_${isBad}`;
    const now = Date.now();
    const isStateChanged = lastPresenceKeyRef.current !== stateKey;
    const isIntervalElapsed = now - lastPresenceSyncTimeRef.current > 45000;

    if (!isStateChanged && !isIntervalElapsed) {
      return;
    }

    lastPresenceKeyRef.current = stateKey;
    lastPresenceSyncTimeRef.current = now;

    updateUserRealtimePresence(firebaseConfig, currentUser.id, {
      isOnline: true,
      lastActive: new Date().toISOString(),
      currentPresence: presence,
      currentPosture: posture,
      currentPostureText: postureText,
      posture_status: telemetry.postureStatus,
      postureStatus: telemetry.postureStatus,
      posture_label: telemetry.postureLabel,
      postureLabel: telemetry.postureLabel,
      in_zone: telemetry.inZone,
      inZone: telemetry.inZone,
      tracking_active: telemetry.trackingActive,
      trackingActive: telemetry.trackingActive,
      posture_warning: telemetry.postureWarning || '',
      postureWarning: telemetry.postureWarning || '',
      angle_neck: telemetry.angleNeck || 0,
      angleNeck: telemetry.angleNeck || 0,
      isSimulating: isSimulating,
      is_simulating: isSimulating,
      sittingMinutes: Math.floor((timeStats.sittingSeconds || 0) / 60),
      bpm: (isAbsent || !hasLiveSignal) ? 0 : telemetry.bpm,
      spo2: (isAbsent || !hasLiveSignal) ? 0 : telemetry.spo2,
      hasAlert: hasLiveSignal && (isBad || (telemetry.bpm > 0 && (telemetry.bpm < thresholds.hrMin || telemetry.bpm > thresholds.hrMax))),
      alertReason: hasLiveSignal && isBad ? (telemetry.postureWarning || 'Cột sống đang bị gù hoặc cúi cổ') : '',
      device: currentUser.device || (currentUser.role === 'admin' ? 'pi4_node_1' : 'pi4_node_2'),
      timestamp: new Date().toISOString()
    }).catch(() => {});
  }, [currentUser?.id, firebaseConfig, telemetry.postureStatus, telemetry.inZone, telemetry.trackingActive, isSimulating]);

  const handleResetTimers = () => {
    setTimeStats({
      sittingSeconds: 0,
      standingSeconds: 0,
      movingSeconds: 0,
      badPostureSeconds: 0,
      continuousSittingSeconds: 0,
      continuousStandingSeconds: 0,
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
      const curId = currentUser?.id;
      const curEmail = (currentUser?.email || '').toLowerCase();
      // Tải lịch sử mới nhất từ Supabase PostgreSQL (nguồn chính)
      const result = await fetchSupabaseHistory('all', curId, currentUser?.email);

      if (result.error) {
        setClearNotice(`Lỗi tải lịch sử từ Supabase: ${result.error}`);
        setTimeout(() => setClearNotice(null), 4000);
        return;
      }

      if (result.data) {
        // Lấy đúng danh sách bản ghi chuẩn từ Supabase PostgreSQL
        const userOnly = result.data.filter(l =>
          !curId || !l.userId || l.userId === curId ||
          (l.userEmail && l.userEmail.toLowerCase() === curEmail)
        );

        setHistory(userOnly);
        syncHistoricalLogs(userOnly);

        if (curId) {
          try {
            if (userOnly.length > 0) {
              localStorage.setItem(`theodoisk_history_${curId}`, JSON.stringify(userOnly));
            } else {
              localStorage.removeItem(`theodoisk_history_${curId}`);
            }
          } catch {}
        }

        if (userOnly.length > 0) {
          setClearNotice(`Đã đồng bộ thành công ${userOnly.length} bản ghi từ Supabase PostgreSQL! (TB: ${result.stats.avgBpm} BPM • ${result.stats.avgSpo2}% SpO₂)`);
        } else {
          setClearNotice('Đã đồng bộ với Supabase: Bảng dữ liệu hiện đang trống (0 bản ghi).');
        }
        setTimeout(() => setClearNotice(null), 4500);
      }
    } catch (err: any) {
      console.warn('Lỗi tải lịch sử Supabase:', err);
      setClearNotice(`Lỗi tải lịch sử: ${err.message || 'Kiểm tra kết nối Supabase'}`);
      setTimeout(() => setClearNotice(null), 4000);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const handleBatchUploadAllToSupabase = async () => {
    if (history.length === 0) {
      setClearNotice('Chưa có dữ liệu nào trong lịch sử để lưu lên Supabase!');
      setTimeout(() => setClearNotice(null), 3000);
      return;
    }
    setIsSyncingHistory(true);
    try {
      const activeUser = currentUserRef.current;
      let successCount = 0;
      // Gửi tuần tự để tránh rate limit, giới hạn 50 bản ghi mỗi lần batch
      const batch = history.slice(0, 50);
      await Promise.allSettled(
        batch.map(entry =>
          insertTelemetryToSupabase(entry, activeUser).then(ok => { if (ok) successCount++; })
        )
      );
      setClearNotice(`Đã đẩy thành công ${successCount}/${batch.length} bản ghi lên Supabase PostgreSQL!`);
      setTimeout(() => setClearNotice(null), 5000);
    } catch (err: any) {
      setClearNotice(`Lỗi đẩy dữ liệu lên Supabase: ${err?.message || 'Kiểm tra mạng'}`);
      setTimeout(() => setClearNotice(null), 4000);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  const handleDeleteSingleLog = async (logId: string) => {
    const targetLog = history.find(item => item.id === logId);
    const logOwnerId = targetLog?.userId || (targetLog as any)?.user_id || currentUser?.id;

    setHistory(prev => {
      const updated = prev.filter(item => item.id !== logId);
      if (logOwnerId) {
        try {
          localStorage.setItem(
            `theodoisk_history_${logOwnerId}`,
            JSON.stringify(updated.filter(i => (i.userId || (i as any).user_id) === logOwnerId))
          );
        } catch {}
      }
      if (currentUser && currentUser.id !== logOwnerId) {
        try {
          localStorage.setItem(
            `theodoisk_history_${currentUser.id}`,
            JSON.stringify(updated.filter(i => (i.userId || (i as any).user_id) === currentUser.id))
          );
        } catch {}
      }
      return updated;
    });
    try {
      await Promise.allSettled([
        deleteSingleTelemetryLogFromFirebase(firebaseConfig, logId, logOwnerId),
        deleteSingleLogFromSupabase(logId)
      ]);
      setClearNotice('Đã xóa bản ghi thành công khỏi thiết bị, Firebase và Supabase.');
      setTimeout(() => setClearNotice(null), 3000);
    } catch (err: any) {
      console.warn('Lỗi khi xóa bản ghi đơn lẻ:', err);
      setClearNotice('Đã xóa bản ghi khỏi thiết bị.');
      setTimeout(() => setClearNotice(null), 3000);
    }
  };

  const handleClearHistory = async (targetAccount?: string) => {
    setIsClearingFirebase(true);
    // BẢO VỆ TUYỆT ĐỐI: Chỉ khi targetAccount === 'all' mới là xóa tất cả!
    // Mặc định nếu không truyền hoặc undefined thì CHỈ xóa cho tài khoản cá nhân hiện tại (currentUser.id)
    const isClearingAll = targetAccount === 'all';
    const rawTarget = isClearingAll ? undefined : (targetAccount || currentUser?.id);

    const targetUserObj = rawTarget
      ? allRegisteredUsers.find(u => u.id === rawTarget || u.email?.toLowerCase() === rawTarget.toLowerCase())
      : undefined;
    const targetUserId = targetUserObj?.id || (rawTarget && !rawTarget.includes('@') ? rawTarget : currentUser?.id);
    const targetEmail = targetUserObj?.email || (rawTarget && rawTarget.includes('@') ? rawTarget : currentUser?.email);

    if (isClearingAll) {
      setHistory([]);
    } else if (targetUserId || targetEmail) {
      setHistory(prev => prev.filter(item => {
        const uId = item.userId || (item as any).user_id;
        const uEmail = (item.userEmail || '').toLowerCase();
        const matchId = targetUserId && uId === targetUserId;
        const matchEmail = targetEmail && uEmail && uEmail === targetEmail.toLowerCase();
        return !(matchId || matchEmail);
      }));
    }

    try {
      if (isClearingAll) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('theodoisk_history_') || k.startsWith('theodoisk_historical_records') || k.startsWith('theodoisk_telemetry_history'))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        clearLocalHistoricalRecords('all');
      } else if (targetUserId || targetEmail) {
        if (targetUserId) {
          localStorage.removeItem(`theodoisk_history_${targetUserId}`);
        }
        clearLocalHistoricalRecords(targetUserId, targetEmail);
      }
    } catch (e) {
      console.warn('Lỗi dọn dẹp localStorage:', e);
    }

    try {
      if (isClearingAll) {
        await Promise.allSettled([
          clearFirebaseHistory(firebaseConfig, undefined, true),
          clearSupabaseHistory('all')
        ]);
        setClearNotice('Đã dọn sạch hoàn toàn lịch sử của tất cả tài khoản.');
      } else if (targetUserId || targetEmail) {
        await Promise.allSettled([
          clearFirebaseHistory(firebaseConfig, targetUserId, false, targetEmail),
          clearSupabaseHistory(targetUserId, targetEmail)
        ]);
        setClearNotice(`Đã xóa sạch lịch sử của tài khoản ${targetUserObj?.fullName || targetEmail || targetUserId || 'được chọn'}.`);
      }
      setTimeout(() => setClearNotice(null), 4500);
    } catch (err: any) {
      console.warn('Lỗi xóa lịch sử:', err);
      setClearNotice('Đã xóa lịch sử bộ nhớ trong máy.');
      setTimeout(() => setClearNotice(null), 4000);
    } finally {
      setIsClearingFirebase(false);
    }
  };

  // Task notification filtering
  const userTasks = (taskNotifications || []).filter(n => {
    if (!currentUser) return false;
    return n.targetUserId === 'all' || 
           n.targetUserId === currentUser.id || 
           n.targetUserId === currentUser.email ||
           n.targetUserId === currentUser.username;
  });
  const pendingTasksCount = userTasks.filter(t => t.status !== 'completed').length;

  const handleCompleteTask = async (taskId: string) => {
    await updateTaskStatusInFirebase(firebaseConfig, taskId, 'completed');
    setTaskNotifications(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t));
  };

  const handleAcknowledgeTask = async (taskId: string) => {
    await updateTaskStatusInFirebase(firebaseConfig, taskId, 'acknowledged');
    setTaskNotifications(prev => prev.map(t => t.id === taskId ? { ...t, status: 'acknowledged', acknowledgedAt: new Date().toISOString() } : t));
  };

  // If user is not authenticated, show LoginScreen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex selection:bg-sky-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* 1. Left Vertical Sidebar: Fixed on desktop, Drawer on mobile */}
      <Sidebar
        activeTab={mainNavTab}
        setActiveTab={setMainNavTab}
        currentUser={currentUser}
        isManager={isManager}
        pendingTasksCount={pendingTasksCount}
        totalLogsCount={history.length}
        isConnected={isConnected}
        isSimulating={isSimulating}
        toggleSimulation={() => setIsSimulating(!isSimulating)}
        soundEnabled={thresholds.soundEnabled}
        toggleSound={() => setThresholds(t => ({ ...t, soundEnabled: !t.soundEnabled }))}
        onOpenUserManagement={() => isManager && setIsUserManagementOpen(true)}
        onOpenSettings={() => isManager && setIsSettingsModalOpen(true)}
        onOpenRpiGuide={() => isManager && setIsRpiGuideModalOpen(true)}
        onOpenFirebase={() => isManager && setIsFirebaseModalOpen(true)}
        onOpenSupabase={() => isManager && setIsSupabaseModalOpen(true)}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onOpenMobile={() => setMobileSidebarOpen(true)}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
      />

      {/* 2. Main Content Wrapper: Accommodates sidebar width on desktop */}
      <div className={`flex-1 flex flex-col min-w-0 w-full transition-[padding] duration-300 ${sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        {/* Top Header Bar */}
        <TopNav
          activeTab={mainNavTab}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          currentUser={currentUser}
          isConnected={isConnected}
          isSimulating={isSimulating}
          toggleSimulation={() => setIsSimulating(!isSimulating)}
          soundEnabled={thresholds.soundEnabled}
          toggleSound={() => setThresholds(t => ({ ...t, soundEnabled: !t.soundEnabled }))}
          lastUpdate={lastUpdate}
          pendingTasksCount={pendingTasksCount}
          onOpenTasks={() => setMainNavTab('tasks')}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Content Dashboard */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8 space-y-4 sm:space-y-6">
          {/* Firestore Quota Exceeded Notification */}
          {isQuotaExceeded && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <div>
                  <span className="font-bold">Đã đạt hạn mức miễn phí Firestore hôm nay (50.000 lượt).</span>
                  <span className="text-amber-800 ml-1">Hệ thống đã tự động kích hoạt bộ đệm an toàn (Local Storage / RTDB). Mọi chức năng đo tư thế, đếm thời gian và cảnh báo vẫn hoạt động bình thường!</span>
                </div>
              </div>
            </div>
          )}

          {/* Success clear notification */}
          {clearNotice && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs shadow-xs">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {clearNotice}
              </span>
              <button onClick={() => setClearNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer">✕</button>
            </div>
          )}

          {/* TAB 1: OVERVIEW (Trang chủ) */}
          {mainNavTab === 'overview' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Banner when Firebase has data from previous sessions or stale data */}
              {hasReceivedData && !isSimulating && (
                <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs shadow-xs transition-all ${
                  telemetry.isStale
                    ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      telemetry.isStale 
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-sky-50 text-sky-600 border-sky-200'
                    }`}>
                      {telemetry.isStale ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <Radio className="w-4 h-4 text-sky-600 animate-pulse" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {telemetry.isStale ? 'Bản Ghi Lưu Trên Firebase' : 'Dữ Liệu Trực Tuyến Từ Firebase'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          telemetry.isStale
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}>
                          {telemetry.isStale ? '⚠️ Bản ghi cũ (Pi 4 Offline)' : 'Trực tuyến'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
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
                        className="w-full sm:w-auto justify-center px-3 py-1.5 rounded-lg font-semibold bg-rose-600 hover:bg-rose-700 text-white transition shadow-xs flex items-center gap-1.5 text-xs cursor-pointer"
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3.5 sm:px-4 py-3 rounded-xl bg-white border border-sky-200 text-slate-800 text-xs shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-200">
                      <Radio className="w-4 h-4 animate-pulse text-sky-600" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block text-xs sm:text-sm">
                        Đang chờ luồng dữ liệu từ Raspberry Pi 4 (Collection: devices • Doc: {firebaseConfig.documentId || 'pi4_node_1'})
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Màn hình đang ở chế độ chờ sạch sẽ. Khi có dữ liệu gửi lên từ cảm biến, các chỉ số sẽ tự động cập nhật ngay tức thì.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      onClick={() => setIsSimulating(true)}
                      className="w-full sm:w-auto justify-center px-3 py-1.5 rounded-lg font-semibold bg-sky-600 hover:bg-sky-700 text-white transition shadow-xs text-xs cursor-pointer"
                    >
                      Bật Giả Lập Thử Nghiệm
                    </button>
                  </div>
                </div>
              )}

              {/* Notification bar if simulation is active */}
              {isSimulating && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-amber-900 shadow-xs space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">
                        <b>Chế độ giả lập Pi 4 đang bật:</b> Thử nghiệm các trạng thái tư thế và cảm biến đo đạc.
                      </span>
                    </div>
                    <button
                      onClick={() => setIsSimulating(false)}
                      className="px-3 py-1 rounded-xl text-xs font-bold text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 shadow-2xs transition cursor-pointer self-end sm:self-auto"
                    >
                      Dừng giả lập
                    </button>
                  </div>

                  {/* Posture Scenario Switcher */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-amber-200/70 text-xs">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mr-1">
                      Kịch bản kiểm thử:
                    </span>
                    <button
                      onClick={() => setSimPostureMode('auto')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        simPostureMode === 'auto'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-amber-100/70 border border-amber-200'
                      }`}
                      title="Tự động luân phiên: Đúng (12s) -> Sai (12s) -> Không có người (12s)"
                    >
                      🔄 Vòng lặp tự động (Đúng ⇄ Sai ⇄ Vắng)
                    </button>

                    <button
                      onClick={() => setSimPostureMode('correct')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        simPostureMode === 'correct'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
                      }`}
                      title="Giả lập tư thế ngồi chuẩn thẳng lưng, nhịp tim và SpO2 ổn định"
                    >
                      ✓ Tư thế Đúng
                    </button>

                    <button
                      onClick={() => setSimPostureMode('standing')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        simPostureMode === 'standing'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200'
                      }`}
                      title="Giả lập tư thế đứng làm việc (Sit-stand, giải phóng cột sống, nhịp tim ~82)"
                    >
                      🚶 Tư thế Đứng
                    </button>

                    <button
                      onClick={() => setSimPostureMode('incorrect')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        simPostureMode === 'incorrect'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
                      }`}
                      title="Giả lập tư thế ngồi gù lưng, cúi đầu kích hoạt cảnh báo giọng nói"
                    >
                      ⚠ Tư thế Sai (Cúi gù)
                    </button>

                    <button
                      onClick={() => setSimPostureMode('absent')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        simPostureMode === 'absent'
                          ? 'bg-slate-700 text-white shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
                      }`}
                      title="Giả lập không có người tại bàn làm việc (Rời khỏi ghế, nhịp tim 0, SpO2 0)"
                    >
                      🚫 Rời khỏi ghế (Ngoài vùng)
                    </button>

                    <button
                      onClick={() => setSimPostureMode('long_incorrect')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        simPostureMode === 'long_incorrect'
                          ? 'bg-rose-800 text-white shadow-2xs'
                          : 'bg-white text-rose-900 hover:bg-rose-50 border border-rose-300'
                      }`}
                      title="Giả lập ngồi sai tư thế kéo dài quá ngưỡng cho phép"
                    >
                      🚨 Sai tư thế lâu
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile Thumb Navigation Segmented Tabs (Light Mode High Contrast) */}
              <div className="sm:hidden flex items-center gap-1 p-1 rounded-xl bg-slate-200/80 border border-slate-300/70 overflow-x-auto shadow-inner scrollbar-none">
                {[
                  { id: 'all', label: 'Tất Cả' },
                  { id: 'biometrics', label: 'Chỉ Số' },
                  { id: 'posture', label: 'Tư Thế' },
                  { id: 'timers', label: 'Thời Gian' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setMobileActiveTab(tab.id as any)}
                    className={`flex-1 min-w-[70px] py-2 px-2 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer text-center shrink-0 ${
                      mobileActiveTab === tab.id
                        ? 'bg-white text-sky-700 shadow-xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 1. Metric Cards (Heart Rate, SpO2, Posture, Monitor Zone) */}
              <div className={`${mobileActiveTab !== 'all' && mobileActiveTab !== 'biometrics' ? 'hidden sm:block' : 'block'}`}>
                <MetricCards 
                  telemetry={telemetry} 
                  thresholds={thresholds} 
                  hasData={hasReceivedData} 
                />
              </div>

              {/* 2. Middle Row: Anatomical Posture Visualizer & Trend Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                <div className={`lg:col-span-6 ${mobileActiveTab !== 'all' && mobileActiveTab !== 'posture' ? 'hidden sm:block' : 'block'}`}>
                  <PostureVisualizer 
                    telemetry={telemetry} 
                    hasData={hasReceivedData} 
                  />
                </div>
                <div className={`lg:col-span-6 ${mobileActiveTab !== 'all' && mobileActiveTab !== 'biometrics' ? 'hidden sm:block' : 'block'}`}>
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
              <div className={`${mobileActiveTab !== 'all' && mobileActiveTab !== 'timers' ? 'hidden sm:block' : 'block'}`}>
                <TimeCounters
                  timeStats={timeStats}
                  thresholds={thresholds}
                  onResetTimers={handleResetTimers}
                  hasData={hasReceivedData}
                />
              </div>
            </div>
          )}

          {/* TAB 3: HISTORY AUDIT LOGS (Nhật ký dữ liệu) */}
          {mainNavTab === 'logs' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Informative Header Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                        Nhật Ký Dữ Liệu & Lịch Sử Đo Đạc
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
                        Tổng hợp lịch sử bản ghi telemetry (Nhịp tim, SpO2, Tư thế ngồi, Thời gian) được đồng bộ thời gian thực từ Raspberry Pi 4 lên Firebase Firestore.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-mono font-bold border border-slate-200">
                      Tổng số bản ghi: {history.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Full Width History Audit Logs */}
              <HistoryLogs
                history={history}
                currentUser={currentUser}
                selectedAccountFilter={selectedHistoryAccount}
                onSelectAccountFilter={setSelectedHistoryAccount}
                onClearHistory={handleClearHistory}
                onDeleteSingleLog={handleDeleteSingleLog}
                onRefreshHistory={handleRefreshHistory}
                isSyncing={isSyncingHistory}
                isManager={isManager}
                onOpenSupabase={() => setIsSupabaseModalOpen(true)}
              />
            </div>
          )}

          {/* TAB 4: TASKS & NOTIFICATIONS (Giao việc & Task) */}
          {mainNavTab === 'tasks' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Header Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                      Giao Việc & Nhắc Nhở Nhiệm Vụ
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Danh sách các nhiệm vụ, bài tập công thái học hoặc cảnh báo được quản lý phân công cho tài khoản của bạn.
                    </p>
                  </div>
                </div>

                {isManager && (
                  <button
                    onClick={() => setIsUserManagementOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tạo Task Mới</span>
                  </button>
                )}
              </div>

              {/* Task Cards List */}
              {userTasks.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white border border-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Không có nhiệm vụ nào cần xử lý</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Tất cả nhiệm vụ và bài tập nhắc nhở sức khỏe đã được hoàn thành. Hãy duy trì tư thế ngồi thẳng lưng!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userTasks.map(task => {
                    const isCompleted = task.status === 'completed';
                    const isUrgent = task.priority === 'urgent';
                    const isHigh = task.priority === 'high';

                    return (
                      <div
                        key={task.id}
                        className={`p-4 sm:p-5 rounded-2xl bg-white border transition-all ${
                          isCompleted
                            ? 'border-slate-200/70 bg-slate-50/50 opacity-75'
                            : isUrgent
                            ? 'border-rose-300 shadow-xs ring-1 ring-rose-200'
                            : isHigh
                            ? 'border-amber-300 shadow-xs'
                            : 'border-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isUrgent
                                  ? 'bg-rose-100 text-rose-800'
                                  : isHigh
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {task.priority === 'urgent' ? 'Khẩn cấp' : task.priority === 'high' ? 'Ưu tiên cao' : 'Bình thường'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : task.status === 'acknowledged'
                                  ? 'bg-sky-100 text-sky-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isCompleted ? '✓ Đã hoàn thành' : task.status === 'acknowledged' ? 'Đang thực hiện' : 'Chờ xử lý'}
                            </span>
                          </div>

                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <h4 className={`text-sm sm:text-base font-bold text-slate-900 ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                          {task.title}
                        </h4>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {task.content}
                        </p>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <span className="text-[11px]">
                            Giao bởi: <b className="text-slate-700">{task.senderName}</b>
                          </span>

                          {!isCompleted && (
                            <div className="flex items-center gap-2">
                              {task.status === 'pending' && (
                                <button
                                  onClick={() => handleAcknowledgeTask(task.id)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition cursor-pointer"
                                >
                                  Tiếp nhận
                                </button>
                              )}
                              <button
                                onClick={() => handleCompleteTask(task.id)}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Hoàn thành</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ADMIN DASHBOARD (Danh mục quản trị) */}
          {mainNavTab === 'admin_overview' && (
            isManager && currentUser ? (
              <AdminDashboard
                currentUser={currentUser}
                firebaseConfig={firebaseConfig}
                currentTelemetry={telemetry}
                isSimulating={isSimulating}
                history={history as any}
                onOpenUserManagementModal={() => setIsUserManagementOpen(true)}
                onOpenTaskModalWithUser={(_user) => {
                  setIsUserManagementOpen(true);
                }}
                onViewUserHistory={(user) => {
                  setSelectedHistoryAccount(user.id);
                  setMainNavTab('logs');
                }}
                onWipeAllData={async () => {
                  await clearFirebaseTelemetry(firebaseConfig);
                  if (currentUser) {
                    await clearFirebaseHistory(firebaseConfig, currentUser.id, false, currentUser.email);
                    await clearSupabaseHistory(currentUser.id, currentUser.email);
                    clearLocalHistoricalRecords(currentUser.id, currentUser.email);
                    setHistory(prev => prev.filter(i => {
                      const uId = i.userId || (i as any).user_id;
                      const uEmail = (i.userEmail || '').toLowerCase();
                      return uId !== currentUser.id && uEmail !== (currentUser.email || '').toLowerCase();
                    }));
                  }
                }}
              />
            ) : (
              <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center space-y-4 max-w-lg mx-auto my-12 shadow-sm">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-amber-600" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Khu Vực Dành Riêng Cho Quản Trị Viên</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tài khoản của bạn ({currentUser.fullName}) có vai trò <b>Nhân viên</b> nên không có quyền truy cập Danh mục quản trị hệ thống.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMainNavTab('overview')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm cursor-pointer"
                >
                  Quay Lại Trang Chủ
                </button>
              </div>
            )
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 sm:py-5 text-center text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© Hệ Thống Theo Dõi Sức Khỏe & Tư Thế Thông Minh • Kết Nối Raspberry Pi 4</p>
            {isManager ? (
              <div className="flex items-center gap-3 text-slate-600">
                <button onClick={() => setIsFirebaseModalOpen(true)} className="hover:text-sky-600 transition cursor-pointer">
                  Cấu hình Firebase
                </button>
                <span>•</span>
                <button onClick={() => setIsRpiGuideModalOpen(true)} className="hover:text-sky-600 transition cursor-pointer">
                  Hướng dẫn Pi 4
                </button>
                <span>•</span>
                <button onClick={() => setIsSettingsModalOpen(true)} className="hover:text-sky-600 transition cursor-pointer">
                  Ngưỡng đo cảnh báo
                </button>
                <span>•</span>
                <button onClick={() => setIsUserManagementOpen(true)} className="hover:text-indigo-600 text-indigo-700 font-semibold transition cursor-pointer">
                  Quản lý tài khoản
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-600 text-xs">
                <span>Tài khoản: <b className="text-slate-900">{currentUser.fullName}</b> (Nhân viên)</span>
                <span>•</span>
                <button onClick={() => setIsProfileModalOpen(true)} className="text-sky-600 hover:underline cursor-pointer">
                  Hồ sơ sức khỏe
                </button>
                <span>•</span>
                <button onClick={handleLogout} className="text-rose-600 hover:underline cursor-pointer">
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Floating AI Ergonomic Health Chatbot with Data Retrieval */}
      <HealthChatbot
        telemetry={telemetry}
        role={currentUser.role}
        sittingSeconds={timeStats.sittingSeconds}
        badPostureSeconds={timeStats.badPostureSeconds}
        hasData={hasReceivedData}
        userName={currentUser.fullName}
        userId={currentUser.id}
        history={history}
        timeStats={timeStats}
        allUsers={allRegisteredUsers}
      />

      {/* On-screen Realtime Task & Broadcast Notification Banner */}
      <UserTaskAlertBanner
        notifications={taskNotifications}
        currentUser={currentUser}
        firebaseConfig={firebaseConfig}
      />

      {/* User Health Profile Modal (Age, Weight, Height, Target Metrics) */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onUpdateUser={(updated) => {
          setCurrentUser(updated);
          saveCurrentUser(updated);
        }}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
      />

      {/* Admin User Management Modal (List of logged-in accounts, role assignment, and task assignments) */}
      {isManager && (
        <UserManagementModal
          isOpen={isUserManagementOpen}
          onClose={() => setIsUserManagementOpen(false)}
          currentUser={currentUser}
          firebaseConfig={firebaseConfig}
        />
      )}

      {/* Supabase Connection & Time-Series Analytics Modal */}
      <SupabaseModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        currentUser={currentUser}
        onNavigateToAdminQuery={() => setMainNavTab('admin_overview')}
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
