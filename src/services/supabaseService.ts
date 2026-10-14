import { createClient } from '@supabase/supabase-js';
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
 * Tạo Supabase Direct Client làm phương án dự phòng cho AI Studio Preview
 */
function getDirectSupabaseClient(config?: SupabaseConnectionConfig) {
  const cfg = config || getSavedSupabaseConfig();
  if (cfg.url && cfg.anonKey) {
    try {
      return createClient(cfg.url, cfg.anonKey);
    } catch (e) {
      console.warn('Không thể khởi tạo Direct Supabase Client:', e);
    }
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

export function saveSupabaseConfig(config: SupabaseConnectionConfig): void {
  try {
    localStorage.setItem('theodoisk_supabase_config', JSON.stringify(config));
  } catch (err) {
    console.error('Lỗi lưu cấu hình Supabase:', err);
  }
}

/**
 * Chuẩn hóa ngày tháng về dạng chuẩn duy nhất DD/MM/YYYY (ví dụ: 14/10/2026)
 */
export function normalizeDateFormatted(input?: string | Date | null): string {
  if (!input) return '';
  try {
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${day}/${month}/${year}`;
        }
      }
      if (trimmed.includes('-') && !trimmed.includes('T') && trimmed.length >= 10) {
        const parts = trimmed.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
      }
    }
    const d = typeof input === 'string' ? new Date(input) : input;
    if (d instanceof Date && !isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {}
  return String(input || '');
}

/**
 * Kiểm tra kết nối tới Supabase (Thử qua API trước, fallback trực tiếp SDK)
 */
export async function testSupabaseConnection(config?: SupabaseConnectionConfig): Promise<{
  success: boolean;
  message: string;
  tableExists?: boolean;
}> {
  const currentCfg = config || getSavedSupabaseConfig();
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

  // Fallback: Kiểm tra trực tiếp bằng Supabase Client nếu gọi API thất bại (trên AI Studio Preview)
  const client = getDirectSupabaseClient(currentCfg);
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
 * Ghi log dữ liệu sức khỏe
 */
export async function insertTelemetryToSupabase(
  telemetry: HealthTelemetry | TelemetryLog,
  user?: AuthUser | null
): Promise<boolean> {
  const row = {
    created_at: new Date().toISOString(),
    user_id: user?.id || (telemetry as TelemetryLog).userId || 'guest',
    user_email: user?.email || (telemetry as TelemetryLog).userEmail || '',
    user_name: user?.fullName || (telemetry as TelemetryLog).userName || '',
    bpm: Number(telemetry.bpm) || 0,
    spo2: Number(telemetry.spo2) || 0,
    posture_status: Number(telemetry.postureStatus ?? -1),
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

  // Fallback direct insert
  const client = getDirectSupabaseClient();
  if (client) {
    const cfg = getSavedSupabaseConfig();
    const { error } = await client.from(cfg.tableName || 'telemetry_logs').insert([row]);
    return !error;
  }

  return false;
}

export type TimeRangeFilter = 'day' | 'week' | 'month' | 'all';

/**
 * Truy xuất dữ liệu lịch sử (API First -> Fallback Direct Client)
 */
export async function fetchSupabaseHistory(
  timeRange: TimeRangeFilter = 'day',
  userId?: string,
  _userEmail?: string
): Promise<{
  data: TelemetryLog[];
  stats: {
    avgBpm: number;
    avgSpo2: number;
    totalRecords: number;
    goodPostureRatio: number;
    sittingCount: number;
    standingCount: number;
    incorrectCount: number;
  };
  error?: string;
}> {
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

  // Thử fetch qua Server API trước
  try {
    const token = await getAuthToken();
    if (token) {
      const params = new URLSearchParams();
      params.set('timeRange', timeRange);
      if (userId) params.set('userId', userId);
      params.set('limit', '300');

      const res = await fetch(`/api/telemetry/history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.ok) {
        const result = await res.json();
        const rawData = result?.data || [];
        const formatted = mapRawDataToTelemetryLogs(rawData);
        return {
          data: formatted,
          stats: result.stats || calculateStats(formatted),
        };
      }
    }
  } catch {}

  // Fallback Direct Client nếu API Server không sẵn sàng (Ví dụ trên AI Studio Preview)
  const client = getDirectSupabaseClient();
  if (!client) {
    return { 
      ...emptyResult, 
      error: 'Vui lòng mở cài đặt Supabase SQL và dán URL + Anon Key để kết nối.' 
    };
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
      return { ...emptyResult, error: `Supa Query Error: ${error.message}` };
    }

    const formatted = mapRawDataToTelemetryLogs(rawData || []);
    return {
      data: formatted,
      stats: calculateStats(formatted),
    };
  } catch (err: any) {
    return { ...emptyResult, error: err?.message || 'Lỗi truy vấn dữ liệu từ Supabase' };
  }
}

function mapRawDataToTelemetryLogs(rawData: any[]): TelemetryLog[] {
  return rawData.map((row: any) => {
    const dateObj = new Date(row.created_at || Date.now());
    const timeFormatted = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateFormatted = normalizeDateFormatted(dateObj);
    return {
      id: String(row.id),
      timestamp: row.created_at,
      timeFormatted,
      dateFormatted,
      dateTimeFormatted: `${dateFormatted} ${timeFormatted}`,
      bpm: Number(row.bpm) || 0,
      spo2: Number(row.spo2) || 0,
      postureStatus: Number(row.posture_status ?? -1),
      postureLabel: row.posture_label || '',
      trackingActive: Boolean(row.tracking_active),
      hasAlert: Boolean(row.has_alert),
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      device: row.device,
    };
  });
}

function calculateStats(logs: TelemetryLog[]) {
  if (!logs.length) {
    return { avgBpm: 0, avgSpo2: 0, totalRecords: 0, goodPostureRatio: 0, sittingCount: 0, standingCount: 0, incorrectCount: 0 };
  }
  let sumBpm = 0, sumSpo2 = 0, goodCount = 0, sitting = 0, standing = 0, incorrect = 0;
  logs.forEach(l => {
    sumBpm += l.bpm;
    sumSpo2 += l.spo2;
    if (l.postureStatus === 0) { goodCount++; sitting++; }
    else if (l.postureStatus === 1) { goodCount++; standing++; }
    else if (l.postureStatus > 1) { incorrect++; }
  });
  return {
    avgBpm: Math.round(sumBpm / logs.length),
    avgSpo2: Number((sumSpo2 / logs.length).toFixed(1)),
    totalRecords: logs.length,
    goodPostureRatio: Math.round((goodCount / logs.length) * 100),
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

  const client = getDirectSupabaseClient();
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

  const client = getDirectSupabaseClient();
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
  _targetUserId?: string,
  _targetUserEmail?: string,
  _onDeleteLog?: (deletedId: string) => void
): () => void {
  let isCancelled = false;
  let lastSeenId = '';

  const poll = async () => {
    if (isCancelled) return;
    const res = await fetchSupabaseHistory('day');
    if (res.data && res.data.length > 0) {
      const latest = res.data[0];
      if (lastSeenId && latest.id !== lastSeenId && onLog) {
        onLog(latest);
      }
      lastSeenId = latest.id;
    }
  };

  const intervalId = setInterval(poll, 15000);
  return () => {
    isCancelled = true;
    clearInterval(intervalId);
  };
}

export const SUPABASE_SQL_SETUP_SCRIPT = `-- Mã nguồn cài đặt bảng và RLS bảo mật tại supabase/schema.sql`;