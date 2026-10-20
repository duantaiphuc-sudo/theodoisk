import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConnectionConfig, TelemetryLog, HealthTelemetry, AuthUser } from '../types';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from './firebase';

export const DEFAULT_SUPABASE_CONFIG: SupabaseConnectionConfig = {
  url: '',
  anonKey: '',
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

function createSingletonClient(url?: string, anonKey?: string): SupabaseClient | null {
  if (!url || !anonKey) return null;
  try {
    return createClient(url, anonKey, {
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

// Khởi tạo và export 1 instance supabase duy nhất ở ngoài cùng module
const initialCfg = getSavedSupabaseConfig();
singletonSupabaseInstance = createSingletonClient(initialCfg.url, initialCfg.anonKey);

export const supabase: SupabaseClient | null = singletonSupabaseInstance;

export function getSupabaseClient(config?: SupabaseConnectionConfig): SupabaseClient | null {
  if (singletonSupabaseInstance) return singletonSupabaseInstance;
  const cfg = config || getSavedSupabaseConfig();
  if (cfg.url && cfg.anonKey) {
    singletonSupabaseInstance = createSingletonClient(cfg.url, cfg.anonKey);
    return singletonSupabaseInstance;
  }
  return null;
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
    device: user?.deviceId || user?.device || (telemetry as any).source || (telemetry as any).device || 'pi4_node',
  };

  try {
    const token = await getAuthToken();
    if (token) {
      const res = await fetch('/api/telemetry/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(row),
      });

      if (res.ok) return true;
    }
  } catch {}

  // Fallback direct insert dùng Singleton client
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.from(cfg.tableName || 'telemetry_logs').insert([row]);
    return !error;
  }

  return false;
}

export type TimeRangeFilter = 'day' | 'week' | 'month' | 'all';

/**
 * Truy xuất dữ liệu lịch sử (API First -> Fallback Direct Client)
 * Bắt lỗi 500 an toàn tuyệt đối, trả về mảng rỗng [] không bắn unhandled error
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

  // 1. Thử fetch qua Server API an toàn
  try {
    const token = await getAuthToken();
    if (token) {
      const params = new URLSearchParams();
      params.set('timeRange', timeRange);
      if (userId && userId !== 'all') params.set('userId', userId);
      params.set('limit', '300');

      const res = await fetch(`/api/telemetry/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Nếu API Server trả về lỗi 500 hoặc không thành công -> Fallback an toàn
      if (!res.ok) {
        console.warn(`[SupabaseService] /api/telemetry/history trả về mã lỗi ${res.status}. Fallback sang Supabase Direct Client.`);
      } else {
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
    console.warn('[SupabaseService] Lỗi kết nối /api/telemetry/history (sử dụng fallback an toàn):', apiErr);
  }

  // 2. Fallback Singleton Client nếu API Server không sẵn sàng hoặc trả về lỗi
  const client = getSupabaseClient();
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
      hasAlert: Boolean(row.has_alert || row.posture_status === 1 || row.posture_status === 3),
      alertType: row.alert_type || (row.posture_status === 1 ? 'Cột sống đang bị gù hoặc cúi cổ' : undefined),
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

export const SUPABASE_SQL_SETUP_SCRIPT = `-- Mã nguồn cài đặt bảng và RLS bảo mật tại supabase/schema.sql`;