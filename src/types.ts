export type PostureType = 'correct' | 'incorrect' | 'long_incorrect' | 'long_sitting' | 'absent' | 'standing' | 'error';

export interface HealthTelemetry {
  bpm: number;
  spo2: number;
  postureStatus: number; // -1: Lỗi/Xác nhận, 0: Đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu, 5: Đứng
  postureLabel: string;
  trackingActive: boolean;
  inZone: boolean;
  timestamp: string;
  source?: string;
  confidence?: number;
  angleNeck?: number;
  postureWarning?: string;
  hasAlert?: boolean;
  isSimulating?: boolean;
  isStale?: boolean;
  packetAgeSeconds?: number;
  image?: string;
  userId?: string;
  faceVerified?: boolean;
  updatedAt?: string;
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
  deviceId?: string;
  isOnline?: boolean;
  lastActive?: string;
  updatedAt?: string;
  currentPresence?: 'Present' | 'Away' | string;
  currentPosture?: string;
  currentPostureText?: string;
  sittingMinutes?: number;
  bpm?: number;
  spo2?: number;
  hasAlert?: boolean;
  alertReason?: string;
  hasFaceTemplate?: boolean;
}

export interface FaceTemplate {
  userId: string;
  model: string;
  schema_version: number;
  sample_count: number;
  embedding: number[];
  enabled: boolean;
  updated_at?: any;
  image?: string;
  snapshot?: string;
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
  posture?: string;
  avatar?: string;
  alertReason?: string;
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
  standingSeconds: number; // Tổng thời gian đứng làm việc
  movingSeconds: number; // Thời gian di chuyển ngoài vùng
  badPostureSeconds: number; // Thời gian sai tư thế hiện tại
  continuousSittingSeconds: number; // Thời gian ngồi liên tục
  continuousStandingSeconds: number; // Thời gian đứng liên tục trong chu kỳ Sit-Stand
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
  standingTargetSec: number; // Mục tiêu đứng (giây)
  standingResetSec?: number; // Đứng liên tục đủ thời gian này mới reset chu kỳ ngồi
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
  inZone?: boolean;
}

export type TelemetryHistoryItem = TelemetryLog;

export interface FirebaseConnectionConfig {
  projectId: string;
  apiKey: string;
  databaseURL?: string;
  collectionName: string;
  documentId: string;
  useRealtimeDb: boolean;
  autoConnect: boolean;
  firestoreDatabaseId?: string;
}

export interface SupabaseConnectionConfig {
  url: string;
  anonKey: string;
  tableName: string;
  autoSync: boolean;
  isConnected?: boolean;
}


export type NotificationType = 'task' | 'health_alert' | 'general';
export type NotificationPriority = 'normal' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'acknowledged' | 'completed';
export type MainNavTab = 'overview' | 'logs' | 'tasks' | 'admin_overview';

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
