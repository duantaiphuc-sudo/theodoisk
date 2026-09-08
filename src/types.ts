export type PostureType = 'correct' | 'incorrect' | 'long_incorrect' | 'long_sitting' | 'absent';

export interface HealthTelemetry {
  bpm: number;
  spo2: number;
  postureStatus: number; // 0: Đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu
  postureLabel: string;
  trackingActive: boolean;
  inZone: boolean;
  timestamp: string;
  source?: string; // 'Raspberry Pi 4' | 'Simulated' | 'Firebase'
  confidence?: number;
  angleNeck?: number;
  postureWarning?: string;
  isStale?: boolean;
  packetAgeSeconds?: number;
  image?: string; // Base64 data URL or HTTP image URL from Pi Camera / Firebase
}

export type UserRole = 'employee' | 'manager';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar?: string;
  department?: string;
}

export interface HistoricalRecord {
  id: string;
  timestamp: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  bpm: number;
  spo2: number;
  postureStatus: number;
  postureLabel: string;
  angleNeck?: number;
  postureWarning?: string;
  note?: string;
  inZone: boolean;
}

export interface TimeCalculations {
  sittingSeconds: number;
  movingSeconds: number;
  badPostureSeconds: number;
  continuousSittingSeconds: number;
}

export interface ZoneConfig {
  x1: number; // 0 - 100 (%)
  y1: number;
  x2: number;
  y2: number;
}

export interface AlertThresholds {
  hrMin: number;
  hrMax: number;
  spo2Min: number;
  incorrectPostureSec: number;
  longIncorrectSec: number;
  longSittingSec: number;
  soundEnabled: boolean;
  voiceAlertEnabled: boolean; // Phát âm thanh giọng nói tiếng Việt nhắc nhở
  outOfZoneAlertEnabled: boolean; // Nhắc nhở bằng giọng nói khi rời ngoài vùng quan sát
}

export interface TelemetryLog {
  id: string;
  timestamp: string;
  timeFormatted: string;
  bpm: number;
  spo2: number;
  postureStatus: number;
  postureLabel: string;
  trackingActive: boolean;
  hasAlert: boolean;
  alertType?: string;
}

export interface FirebaseConnectionConfig {
  projectId: string;
  apiKey: string;
  databaseURL?: string;
  collectionName: string;
  documentId: string;
  useRealtimeDb: boolean;
  autoConnect: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
}
