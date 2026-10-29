import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConnectionConfig, TelemetryLog, HealthTelemetry, AuthUser } from '../types';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from './firebase';

export const DEFAULT_SUPABASE_CONFIG: SupabaseConnectionConfig = {
  url: ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim(),
  anonKey: ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim(),
  tableName: 'telemetry_logs',
  autoSync: true,
  isConnected: true,
};

/**
 * Chuẩn hóa định dạng ngày DD/MM/YYYY cho báo cáo & nhật ký
 */
export function normalizeDateFormatted(val: any): string {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(val.trim())) {
    return val.trim();
  }
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(val);
  }
}

export function getSavedSupabaseConfig(): SupabaseConnectionConfig {
  try {
    const saved = localStorage.getItem('theodoisk_supabase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { 
        ...DEFAULT_SUPABASE_CONFIG, 
        ...parsed,
        // Nếu trong localStorage để trống nhưng biến môi trường có, ưu tiên biến môi trường
        url: (parsed.url || DEFAULT_SUPABASE_CONFIG.url || '').trim(),
        anonKey: (parsed.anonKey || DEFAULT_SUPABASE_CONFIG.anonKey || '').trim(),
      };
    }
  } catch (err) {
    console.warn('Lỗi đọc cấu hình Supabase:', err);
  }
  return DEFAULT_SUPABASE_CONFIG;
}

// =========================================================================
// SINGLETON SUPABASE CLIENT (Mô hình 1 instance duy nhất, ngăn cảnh báo GoTrueClient)
// =========================================================================
let singletonSupabaseInstance: SupabaseClient | null = null;
let lastClientKey = '';

function createSingletonClient(url?: string, anonKey?: string): SupabaseClient | null {
  const cleanUrl = (url || '').trim();
  const cleanKey = (anonKey || '').trim();
  if (!cleanUrl || !cleanKey) return null;
  try {
    return createClient(cleanUrl, cleanKey, {
      auth: {
        persistSession: false, // Xóa triệt để cảnh báo Multiple GoTrueClient instances
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    });
  } catch (e) {
    console.warn('Không thể khởi tạo singleton Supabase client:', e);
    return null;
  }
}

export function getSupabaseClient(config?: SupabaseConnectionConfig): SupabaseClient | null {
  const cfg = config || getSavedSupabaseConfig();
  const cleanUrl = (cfg.url || '').trim();
  const cleanKey = (cfg.anonKey || '').trim();
  const currentKey = `${cleanUrl}_${cleanKey}`;

  if (singletonSupabaseInstance && lastClientKey === currentKey && cleanUrl && cleanKey) {
    return singletonSupabaseInstance;
  }

  if (cleanUrl && cleanKey) {
    singletonSupabaseInstance = createSingletonClient(cleanUrl, cleanKey);
    lastClientKey = currentKey;
    return singletonSupabaseInstance;
  }
  return null;
}

// Khởi tạo instance ban đầu
const initialCfg = getSavedSupabaseConfig();
if (initialCfg.url && initialCfg.anonKey) {
  singletonSupabaseInstance = createSingletonClient(initialCfg.url, initialCfg.anonKey);
  lastClientKey = `${initialCfg.url}_${initialCfg.anonKey}`;
}

export const supabase: SupabaseClient | null = singletonSupabaseInstance;

/**
 * Xây dựng headers an toàn truyền cả Supabase credentials cho Backend Server Proxy
 */
export function getSupabaseHeaders(cfg: SupabaseConnectionConfig, token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cfg.url) headers['x-supabase-url'] = cfg.url.trim();
  if (cfg.anonKey) headers['x-supabase-key'] = cfg.anonKey.trim();
  return headers;
}

/**
 * Lấy Firebase ID Token của người dùng hiện tại
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export function saveSupabaseConfig(config: SupabaseConnectionConfig): void {
  try {
    localStorage.setItem('theodoisk_supabase_config', JSON.stringify(config));
    if (config.url && config.anonKey) {
      singletonSupabaseInstance = createSingletonClient(config.url, config.anonKey);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase-config-changed', { detail: config }));
    }
  } catch (err) {
    console.error('Lỗi lưu cấu hình Supabase:', err);
  }
}

/**
 * Ngắt kết nối Supabase (Chế độ test cục bộ, không ghi log vào DB)
 */
export function disconnectSupabase(): SupabaseConnectionConfig {
  const current = getSavedSupabaseConfig();
  const updated: SupabaseConnectionConfig = {
    ...current,
    isConnected: false,
    autoSync: false,
  };
  saveSupabaseConfig(updated);
  return updated;
}

/**
 * Kết nối lại Supabase (Bật lại tự động đồng bộ vào DB)
 */
export function reconnectSupabase(): SupabaseConnectionConfig {
  const current = getSavedSupabaseConfig();
  const updated: SupabaseConnectionConfig = {
    ...current,
    isConnected: true,
    autoSync: true,
  };
  saveSupabaseConfig(updated);
  return updated;
}

/**
 * Xóa trắng toàn bộ cấu hình Supabase khỏi localStorage
 */
export function purgeSupabaseConfig(): SupabaseConnectionConfig {
  try {
    localStorage.removeItem('theodoisk_supabase_config');
    singletonSupabaseInstance = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase-config-changed', { detail: DEFAULT_SUPABASE_CONFIG }));
    }
  } catch (err) {
    console.error('Lỗi xóa cấu hình Supabase:', err);
  }
  return DEFAULT_SUPABASE_CONFIG;
}

export const clearSupabaseConfig = purgeSupabaseConfig;

/**
 * Kiểm tra kết nối tới Supabase
 */
export async function testSupabaseConnection(
  config?: SupabaseConnectionConfig
): Promise<{ success: boolean; message: string; tableExists?: boolean }> {
  const currentCfg = config || getSavedSupabaseConfig();
  if (!currentCfg.url || !currentCfg.anonKey) {
    return {
      success: false,
      message: 'Vui lòng nhập đầy đủ Supabase URL và Supabase Anon Key.',
    };
  }

  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/telemetry/history?limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.ok) {
        return {
          success: true,
          tableExists: true,
          message: 'Kết nối máy chủ API và cơ sở dữ liệu Supabase thành công!',
        };
      }
    }
  } catch {}

  // Fallback: Kiểm tra trực tiếp bằng Supabase Client Singleton
  const client = getSupabaseClient(currentCfg);
  if (!client) {
    return {
      success: false,
      message: 'Chưa cấu hình URL và Anon Key trong bảng Supabase SQL.',
    };
  }

  try {
    const tableName = currentCfg.tableName || 'telemetry_logs';
    const { error } = await client.from(tableName).select('id').limit(1);
    if (error) {
      return {
        success: false,
        message: `Lỗi kết nối Supabase: ${error.message}`,
      };
    }
    return {
      success: true,
      tableExists: true,
      message: 'Kết nối trực tiếp tới bảng Supabase thành công!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi kết nối: ${err?.message || 'Không thể liên lạc Supabase'}`,
    };
  }
}

/**
 * Ghi log dữ liệu sức khỏe (Chặn tuyệt đối khi trạng thái là Chờ xác thực khuôn mặt)
 */
export async function insertTelemetryToSupabase(
  telemetry: HealthTelemetry | TelemetryLog,
  user?: AuthUser | null
): Promise<boolean> {
  const cfg = getSavedSupabaseConfig();
  // Nếu đã ngắt kết nối (chế độ test) hoặc tắt tự động đồng bộ, không ghi vào database
  if (cfg.isConnected === false || cfg.autoSync === false) {
    return false;
  }

  // === CHẶN GHI NHẬT KÝ KHI CHỜ XÁC THỰC KHUÔN MẶT ===
  const pStatus = Number(telemetry.postureStatus ?? -1);
  const pLabel = String(telemetry.postureLabel || '').toLowerCase();
  if (
    pStatus === -1 || 
    pLabel.includes('chờ xác thực') || 
    pLabel.includes('chưa verified') || 
    pLabel.includes('phân công cho tài khoản khác')
  ) {
    return false;
  }

  const row = {
    created_at: new Date().toISOString(),
    user_id: user?.id || (telemetry as TelemetryLog).userId || 'guest',
    user_email: user?.email || (telemetry as TelemetryLog).userEmail || '',
    user_name: user?.fullName || (telemetry as TelemetryLog).userName || '',
    bpm: Number(telemetry.bpm) || 0,
    spo2: Number(telemetry.spo2) || 0,
    posture_status: pStatus,
    posture_label: telemetry.postureLabel || 'Chưa có dữ liệu',
    in_zone: Boolean((telemetry as any).inZone ?? true),
    tracking_active: Boolean(telemetry.trackingActive ?? true),
    has_alert: Boolean(telemetry.hasAlert),
    alert_type: (telemetry as TelemetryLog).alertType || null,
    device: user?.deviceId || user?.device || (telemetry as any).source || (telemetry as any).device || 'pi4_node',
  };

  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: getSupabaseHeaders(cfg, token),
        body: JSON.stringify({ ...row, supabaseConfig: cfg }),
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.success) return true;
      }
    }
  } catch (err) {
    console.warn('[SupabaseService] Proxy insert error, falling back to direct client:', err);
  }

  // Fallback direct insert dùng Singleton client
  const client = getSupabaseClient(cfg);
  if (client) {
    try {
      const { error } = await client.from(cfg.tableName || 'telemetry_logs').insert([row]);
      if (!error) return true;
      console.warn('Lỗi direct insert Supabase:', error.message);
    } catch (e) {
      console.warn('Lỗi kết nối direct Supabase:', e);
    }
  }

  return false;
}

export type TimeRangeFilter = 'day' | 'week' | 'month' | 'all';

/**
 * Truy xuất dữ liệu lịch sử (API First -> Fallback Direct Client)
 * Bắt lỗi an toàn tuyệt đối, trả về mảng rỗng [] không bắn unhandled error
 */
export async function fetchSupabaseHistory(
  timeRange: TimeRangeFilter = 'day',
  userId?: string,
  _userEmail?: string
): Promise<{ data: TelemetryLog[]; stats: any; error?: string }> {
  const emptyResult = {
    data: [],
    stats: {
      avgBpm: 0,
      avgSpo2: 0,
      totalRecords: 0,
      goodPostureRatio: 0,
      sittingCount: 0,
      standingCount: 0,
      incorrectCount: 0,
    },
  };

  const cfg = getSavedSupabaseConfig();

  // 1. Thử fetch qua Server API an toàn với thông tin credentials truyền kèm
  try {
    const token = await getAuthToken();
    if (token) {
      const params = new URLSearchParams();
      params.set('timeRange', timeRange);
      if (userId && userId !== 'all') params.set('userId', userId);
      params.set('limit', '300');

      const res = await fetch(`/api/telemetry/history?${params.toString()}`, {
        headers: getSupabaseHeaders(cfg, token)
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result = await res.json();
          const rawData = result?.data || [];
          if (Array.isArray(rawData) && rawData.length > 0) {
            const formatted = mapRawDataToTelemetryLogs(rawData);
            return {
              data: formatted,
              stats: result.stats || calculateStats(formatted),
            };
          }
        }
      }
    }
  } catch (apiErr) {
    console.warn('[SupabaseService] Lỗi kết nối /api/telemetry/history (sử dụng fallback direct client):', apiErr);
  }

  // 2. Fallback Singleton Client nếu API Server không sẵn sàng hoặc không có dữ liệu
  const client = getSupabaseClient(cfg);
  if (!client) {
    return emptyResult;
  }

  try {
    const cfg = getSavedSupabaseConfig();
    let queryBuilder = client
      .from(cfg.tableName || 'telemetry_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (userId && userId !== 'all') {
      queryBuilder = queryBuilder.eq('user_id', userId);
    }

    const { data: rawData, error } = await queryBuilder;
    if (error) {
      console.warn('Lỗi truy vấn Supabase Singleton Client:', error.message);
      return emptyResult;
    }

    const formatted = mapRawDataToTelemetryLogs(rawData || []);
    return {
      data: formatted,
      stats: calculateStats(formatted),
    };
  } catch (directErr) {
    console.warn('[SupabaseService] Lỗi truy vấn Supabase Direct Client:', directErr);
    return emptyResult;
  }
}

export function mapRawDataToTelemetryLogs(rawData: any[]): TelemetryLog[] {
  return rawData.map((row: any) => {
    const d = new Date(row.created_at || row.timestamp || Date.now());
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const timeFormatted = validDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const day = String(validDate.getDate()).padStart(2, '0');
    const month = String(validDate.getMonth() + 1).padStart(2, '0');
    const year = validDate.getFullYear();
    const dateFormatted = `${day}/${month}/${year}`;

    return {
      id: String(row.id || `supa-${validDate.getTime()}-${Math.random().toString(36).substr(2, 5)}`),
      timestamp: validDate.toISOString(),
      timeFormatted,
      dateFormatted,
      dateTimeFormatted: `${dateFormatted} ${timeFormatted}`,
      bpm: Number(row.bpm) || 0,
      spo2: Number(row.spo2) || 0,
      postureStatus: Number(row.posture_status ?? -1),
      postureLabel: row.posture_label || 'Tư thế ĐÚNG',
      trackingActive: Boolean(row.tracking_active ?? true),
      hasAlert: Boolean(
        row.has_alert || 
        row.posture_status === 3 || 
        (Number(row.bpm) > 0 && (Number(row.bpm) > 100 || Number(row.bpm) < 50)) ||
        (Number(row.spo2) > 0 && Number(row.spo2) < 95)
      ),
      alertType: row.alert_type || (
        row.posture_status === 3 
          ? 'Sai tư thế lâu (>2 phút)' 
          : (Number(row.bpm) > 100 ? 'Nhịp tim nhanh' : Number(row.bpm) > 0 && Number(row.bpm) < 50 ? 'Nhịp tim chậm' : Number(row.spo2) > 0 && Number(row.spo2) < 95 ? 'Thiếu oxy SpO₂' : undefined)
      ),
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      device: row.device || 'pi4_node'
    };
  });
}

function calculateStats(logs: TelemetryLog[]) {
  const validBpm = logs.filter(l => l.bpm > 0);
  const validSpo2 = logs.filter(l => l.spo2 > 0);
  const avgBpm = validBpm.length > 0 ? Math.round(validBpm.reduce((acc, l) => acc + l.bpm, 0) / validBpm.length) : 0;
  const avgSpo2 = validSpo2.length > 0 ? Number((validSpo2.reduce((acc, l) => acc + l.spo2, 0) / validSpo2.length).toFixed(1)) : 0;
  const good = logs.filter(l => l.postureStatus === 0).length;
  const goodPostureRatio = logs.length > 0 ? Math.round((good / logs.length) * 100) : 0;
  const sitting = logs.filter(l => l.postureStatus === 0 || l.postureStatus === 4).length;
  const standing = logs.filter(l => l.postureStatus === 5).length;
  const incorrect = logs.filter(l => l.postureStatus === 1 || l.postureStatus === 3).length;

  return {
    avgBpm,
    avgSpo2,
    totalRecords: logs.length,
    goodPostureRatio,
    sittingCount: sitting,
    standingCount: standing,
    incorrectCount: incorrect,
  };
}

export async function clearSupabaseHistory(targetUserId?: string, _targetUserEmail?: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch(`/api/telemetry/history?userId=${encodeURIComponent(targetUserId || 'all')}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) return true;
    }
  } catch {}

  const client = getSupabaseClient();
  if (client) {
    const cfg = getSavedSupabaseConfig();
    let q = client.from(cfg.tableName || 'telemetry_logs').delete();
    if (targetUserId && targetUserId !== 'all') {
      q = q.eq('user_id', targetUserId);
    } else {
      q = q.neq('id', '0');
    }
    const { error } = await q;
    return !error;
  }
  return false;
}

export async function deleteSingleLogFromSupabase(id: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch(`/api/telemetry/history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) return true;
    }
  } catch {}

  const client = getSupabaseClient();
  if (client) {
    const cfg = getSavedSupabaseConfig();
    const { error } = await client.from(cfg.tableName || 'telemetry_logs').delete().eq('id', id);
    return !error;
  }
  return false;
}

export function subscribeToSupabaseRealtime(
  _onData?: (data: HealthTelemetry) => void,
  onLog?: (log: TelemetryLog) => void,
  targetUserId?: string,
  targetUserEmail?: string,
  _onDeleteLog?: (deletedId: string) => void
): () => void {
  let isCancelled = false;
  let lastSeenId = '';
  let errorCount = 0;

  const poll = async () => {
    if (isCancelled) return;
    if (errorCount >= 2 && Math.random() > 0.3) return;

    try {
      const res = await fetchSupabaseHistory('day', targetUserId, targetUserEmail);
      if (res.error) {
        errorCount++;
      } else {
        errorCount = 0;
      }
      if (res.data && res.data.length > 0) {
        const latest = res.data[0];
        if (lastSeenId && latest.id !== lastSeenId && onLog) {
          onLog(latest);
        }
        lastSeenId = latest.id;
      }
    } catch {
      errorCount++;
    }
  };

  const intervalId = setInterval(poll, 15000);
  return () => {
    isCancelled = true;
    clearInterval(intervalId);
  };
}

export interface OHPSSyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
  score?: number;
}

/**
 * Đồng bộ thủ công hoặc tự động điểm OHPS vào bảng daily_ohps_summary trên Supabase
 * Hỗ trợ Dual-path: Thử qua Server Proxy (/api/telemetry/ohps-summary) trước,
 * nếu server không sẵn sàng hoặc thiếu env thì fallback sang Supabase Direct Client.
 */
export async function syncOHPSToSupabase(
  userId: string,
  summary: {
    date?: string;
    posture_score: number;
    break_score: number;
    vital_score: number;
    task_score?: number;
    hes_score?: number;
    ts_score?: number;
    ohps_score: number;
    data_confidence?: number;
    has_vital_data?: boolean;
    classification?: string;
  }
): Promise<OHPSSyncResult> {
  const cfg = getSavedSupabaseConfig();
  if (!userId) {
    return { success: false, message: 'Chưa xác định tài khoản người dùng.' };
  }

  const cleanUrl = (cfg.url || '').trim();
  const cleanKey = (cfg.anonKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    return { 
      success: false, 
      message: 'Chưa cấu hình Supabase URL hoặc Anon Key. Vui lòng vào Cấu hình Supabase để kết nối.' 
    };
  }

  const todayStr = summary.date || new Date().toISOString().slice(0, 10);
  const postureScore = Math.min(100, Math.max(0, Math.round(Number(summary.posture_score) || 0)));
  const breakScore = Math.min(100, Math.max(0, Math.round(Number(summary.break_score) || 0)));
  const hasVital = summary.has_vital_data !== false && summary.vital_score !== -1;
  const vitalScore = hasVital 
    ? Math.min(100, Math.max(0, Math.round(Number(summary.vital_score) || 0))) 
    : -1;
  const taskScore = Math.min(100, Math.max(0, Math.round(Number(summary.task_score) || 0)));
  const hesScore = Math.min(100, Math.max(0, Math.round(Number(summary.hes_score ?? summary.ohps_score) || 0)));
  const tsScore = Math.min(100, Math.max(0, Math.round(Number(summary.ts_score ?? summary.task_score ?? 0) || 0)));
  const ohpsScore = Math.min(100, Math.max(0, Math.round(Number(summary.ohps_score) || 0)));
  const dataConfidence = Math.min(100, Math.max(0, Math.round(Number(summary.data_confidence ?? 100))));

  // Payload khớp 100% với schema bảng public.daily_ohps_summary của Supabase
  const payload = {
    user_id: userId,
    date: todayStr,
    posture_score: postureScore,
    break_score: breakScore,
    vital_score: vitalScore,
    task_score: taskScore,
    hes_score: hesScore,
    ts_score: tsScore,
    ohps_score: ohpsScore,
    data_confidence: dataConfidence,
    has_vital_data: hasVital,
    supabaseConfig: cfg
  };

  // 1. Thử qua backend API endpoint (/api/telemetry/ohps-summary)
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/telemetry/ohps-summary', {
        method: 'POST',
        headers: getSupabaseHeaders(cfg, token),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.success) {
          const nowStr = new Date().toLocaleTimeString('vi-VN');
          return {
            success: true,
            message: `Đã đồng bộ điểm OHPS (${ohpsScore}đ) vào Supabase thành công!`,
            timestamp: nowStr,
            score: ohpsScore
          };
        }
      }
    }
  } catch (apiErr) {
    console.warn('[SupabaseService] API sync OHPS error, fallback direct client:', apiErr);
  }

  // 2. Fallback trực tiếp qua Direct Supabase Client
  const client = getSupabaseClient(cfg);
  if (!client) {
    return {
      success: false,
      message: 'Không thể kết nối Supabase client. Vui lòng kiểm tra lại URL và Anon Key.'
    };
  }

  try {
    // Chỉ truyền đúng các trường có trong bảng daily_ohps_summary
    const rowToUpsert = {
      user_id: userId,
      date: todayStr,
      posture_score: postureScore,
      break_score: breakScore,
      vital_score: vitalScore,
      task_score: taskScore,
      hes_score: hesScore,
      ts_score: tsScore,
      ohps_score: ohpsScore,
      data_confidence: dataConfidence,
      has_vital_data: hasVital
    };

    let res = await client
      .from('daily_ohps_summary')
      .upsert([rowToUpsert], { onConflict: 'user_id,date' });

    if (res.error) {
      console.warn('[SupabaseService] Lỗi upsert onConflict, thử insert trực tiếp:', res.error.message);
      // Fallback: Thử insert trực tiếp nếu bảng chưa hỗ trợ upsert conflict syntax
      const res2 = await client.from('daily_ohps_summary').insert([rowToUpsert]);
      if (res2.error) {
        // Fallback: Cập nhật nếu bản ghi ngày hôm đó đã tồn tại
        const res3 = await client
          .from('daily_ohps_summary')
          .update(rowToUpsert)
          .eq('user_id', userId)
          .eq('date', todayStr);

        if (res3.error) {
          return {
            success: false,
            message: `Lỗi Supabase: ${res.error.message || res3.error.message}`
          };
        }
      }
    }

    const nowStr = new Date().toLocaleTimeString('vi-VN');
    return {
      success: true,
      message: `Đã đồng bộ trực tiếp điểm OHPS (${ohpsScore}đ) vào Supabase thành công!`,
      timestamp: nowStr,
      score: ohpsScore
    };
  } catch (directErr: any) {
    return {
      success: false,
      message: `Lỗi đồng bộ: ${directErr?.message || 'Không thể liên lạc Supabase'}`
    };
  }
}

export async function upsertDailyOHPSSummaryToSupabase(
  userId: string,
  summary: {
    date?: string;
    posture_score: number;
    break_score: number;
    vital_score: number;
    task_score?: number;
    hes_score?: number;
    ts_score?: number;
    ohps_score: number;
    data_confidence?: number;
    has_vital_data?: boolean;
    classification?: string;
  }
): Promise<boolean> {
  const result = await syncOHPSToSupabase(userId, summary);
  return result.success;
}

/**
 * Đọc bản ghi điểm OHPS đã lưu trong ngày từ bảng daily_ohps_summary trên Supabase
 */
export async function fetchDailyOHPSSummaryFromSupabase(
  userId: string,
  date?: string
): Promise<any | null> {
  const cfg = getSavedSupabaseConfig();
  const todayStr = date || new Date().toISOString().slice(0, 10);

  // 1. Thử qua backend API endpoint
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch(`/api/telemetry/ohps-summary?userId=${encodeURIComponent(userId)}&limit=1`, {
        headers: getSupabaseHeaders(cfg, token)
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          const match = json.data.find((r: any) => r.date === todayStr) || json.data[0];
          if (match) return match;
        }
      }
    }
  } catch (apiErr) {
    console.warn('[SupabaseService] Lỗi fetch OHPS qua API:', apiErr);
  }

  // 2. Fallback Direct Supabase Client
  const client = getSupabaseClient(cfg);
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('daily_ohps_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('date', todayStr)
      .maybeSingle();

    if (error) {
      console.warn('Lỗi query daily_ohps_summary từ Supabase direct:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Lỗi đọc daily_ohps_summary từ Supabase direct:', err);
    return null;
  }
}

/**
 * Đọc toàn bộ các bản ghi lịch sử OHPS thực tế (tối đa 7 ngày gần nhất) từ bảng daily_ohps_summary trên Supabase
 * KHÔNG tạo số liệu giả lập - Chỉ trả về đúng những ngày đã có trong database
 */
export async function fetchDailyOHPSHistoryFromSupabase(
  userId: string,
  limitDays: number = 7
): Promise<any[]> {
  const cfg = getSavedSupabaseConfig();
  if (!userId) return [];

  // 1. Thử qua backend API endpoint (/api/telemetry/ohps-summary)
  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch(`/api/telemetry/ohps-summary?userId=${encodeURIComponent(userId)}&limit=${limitDays}`, {
        headers: getSupabaseHeaders(cfg, token)
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          return json.data.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
      }
    }
  } catch (apiErr) {
    console.warn('[SupabaseService] Lỗi fetch OHPS history qua API:', apiErr);
  }

  // 2. Fallback Direct Supabase Client
  const client = getSupabaseClient(cfg);
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('daily_ohps_summary')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(limitDays);

    if (error) {
      console.warn('Lỗi query daily_ohps_summary history từ Supabase direct:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('Lỗi đọc daily_ohps_summary history từ Supabase direct:', err);
    return [];
  }
}

export const SUPABASE_SQL_SETUP_SCRIPT = `-- Mã nguồn cài đặt bảng và RLS bảo mật tại supabase/schema.sql`;