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
  hasAlert?: boolean;
  isSimulating?: boolean;
  isStale?: boolean;
  packetAgeSeconds?: number;
  image?: string; // Base64 data URL or HTTP image URL from Pi Camera / Firebase
}

export type UserRole = 'admin' | 'manager' | 'employee';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  phoneNumber?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  height?: number; // cm
  weight?: number; // kg
  maxSittingHours?: number; // Mục tiêu thời gian ngồi tối đa (tiếng)
  healthNotes?: string;
  status?: 'active' | 'suspended';
  lastLogin?: string;
  createdAt?: string;
  device?: string;
  isOnline?: boolean;
  lastActive?: string;
  currentPresence?: 'Present' | 'Away' | string;
  currentPosture?: string;
  currentPostureText?: string;
  sittingMinutes?: number;
  bpm?: number;
  spo2?: number;
  hasAlert?: boolean;
  alertReason?: string;
}

export interface EmployeeNodeStatus {
  id: string;
  name: string;
  email?: string;
  device?: string;
  bpm?: number;
  spo2?: number;
  postureStatus?: number;
  postureLabel?: string;
  postureText?: string;
  isOnline?: boolean;
  hasAlert?: boolean;
  alertType?: string;
  lastActive?: string;
  currentPresence?: string;
  presence?: string;
  sittingMinutes?: number;
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
  browserNotificationEnabled: boolean; // Gửi thông báo trình duyệt kể cả khi ẩn/thu nhỏ cửa sổ
}

export interface TelemetryLog {
  id: string;
  timestamp: string;
  timeFormatted: string;
  dateFormatted?: string; // DD/MM/YYYY
  dateTimeFormatted?: string; // DD/MM/YYYY HH:mm:ss
  bpm: number;
  spo2: number;
  postureStatus: number;
  postureLabel: string;
  trackingActive: boolean;
  hasAlert: boolean;
  alertType?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  device?: string;
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

export type NotificationType = 'task' | 'health_alert' | 'general';
export type NotificationPriority = 'normal' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'acknowledged' | 'completed';
export type MainNavTab = 'overview' | 'zone' | 'logs' | 'tasks' | 'admin_overview';

export interface UserTelemetryLive {
  userId: string;
  userEmail: string;
  userName: string;
  department?: string;
  avatar?: string;
  bpm: number;
  spo2: number;
  postureStatus: number;
  postureLabel: string;
  trackingActive: boolean;
  inZone: boolean;
  timestamp: string;
  isSimulating: boolean;
  source: string;
  hasAlert: boolean;
  alertType?: string;
  angleNeck?: number;
  postureWarning?: string;
  image?: string;
  sittingSeconds?: number;
  badPostureSeconds?: number;
  updatedAt?: string;
}

export interface UserTaskNotification {
  id: string;
  targetUserId: string; // 'all' or specific user id / email
  targetUserName?: string;
  senderId: string;
  senderName: string;
  type: NotificationType;
  title: string;
  content: string;
  priority: NotificationPriority;
  status: TaskStatus;
  deadline?: string;
  createdAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
}
