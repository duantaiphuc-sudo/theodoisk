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
 * Lấy Firebase ID Token của người dùng hiện tại để gửi kèm request lên server
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
 * Chuẩn hóa ngày tháng về dạng chuẩn duy nhất DD/MM/YYYY (ví dụ: 06/10/2026)
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
 * Kiểm tra kết nối tới Supabase thông qua server API đã xác thực
 */
export async function testSupabaseConnection(_config?: SupabaseConnectionConfig): Promise<{
  success: boolean;
  message: string;
  tableExists?: boolean;
}> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return {
        success: false,
        message: 'Vui lòng đăng nhập tài khoản để kiểm tra kết nối với cơ sở dữ liệu.',
      };
    }

    const res = await fetch('/api/telemetry/history?limit=1', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      return {
        success: true,
        tableExists: true,
        message: 'Kết nối máy chủ và cơ sở dữ liệu Supabase thành công!',
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: false,
      message: data.error || `Máy chủ phản hồi mã lỗi: ${res.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi kết nối máy chủ: ${err?.message || 'Không thể liên lạc API'}`,
    };
  }
}

/**
 * Ghi log dữ liệu sức khỏe thông qua API server an toàn (POST /api/telemetry/log)
 */
export async function insertTelemetryToSupabase(
  telemetry: HealthTelemetry | TelemetryLog,
  user?: AuthUser | null
): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (!token) return false;

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

    const res = await fetch('/api/telemetry/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(row),
    });

    return res.ok;
  } catch (err) {
    console.warn('Lỗi gửi dữ liệu lên server /api/telemetry/log:', err);
    return false;
  }
}

export type TimeRangeFilter = 'day' | 'week' | 'month' | 'all';

/**
 * Truy xuất dữ liệu lịch sử thông qua API server an toàn (GET /api/telemetry/history)
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

  try {
    const token = await getAuthToken();
    if (!token) {
      return { ...emptyResult, error: 'Chưa đăng nhập tài khoản' };
    }

    const params = new URLSearchParams();
    params.set('timeRange', timeRange);
    if (userId) {
      params.set('userId', userId);
    }
    params.set('limit', '300');

    const res = await fetch(`/api/telemetry/history?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ...emptyResult, error: errData.error || `Server trả về mã lỗi ${res.status}` };
    }

    const result = await res.json();
    const rawData = result.data || [];

    const formatted: TelemetryLog[] = rawData.map((row: any) => {
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

    return {
      data: formatted,
      stats: result.stats || emptyResult.stats,
    };
  } catch (err: any) {
    return { ...emptyResult, error: err?.message || 'Lỗi truy vấn dữ liệu từ API máy chủ' };
  }
}

/**
 * Xóa toàn bộ lịch sử hoặc lịch sử theo tài khoản (Chỉ Admin mới có quyền trên server)
 */
export async function clearSupabaseHistory(targetUserId?: string, _targetUserEmail?: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (!token) return false;

    const res = await fetch(`/api/telemetry/history?userId=${encodeURIComponent(targetUserId || 'all')}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return res.ok;
  } catch (err) {
    console.warn('Lỗi kết nối khi xóa lịch sử Supabase:', err);
    return false;
  }
}

/**
 * Xóa một bản ghi đơn lẻ trên Supabase (Chỉ Admin mới có quyền trên server)
 */
export async function deleteSingleLogFromSupabase(id: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    if (!token) return false;

    const res = await fetch(`/api/telemetry/history?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return res.ok;
  } catch (err) {
    console.warn('Lỗi kết nối khi xóa bản ghi Supabase:', err);
    return false;
  }
}

/**
 * Đồng bộ dữ liệu lịch sử theo chu kỳ qua server API (Zero-Trust RLS, không dùng Anon Key)
 */
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
    try {
      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch('/api/telemetry/history?limit=5', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;

      const result = await res.json();
      const logs = result.data || [];
      if (logs.length > 0) {
        const latest = logs[0];
        const dateObj = new Date(latest.created_at || Date.now());
        const timeFormatted = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateFormatted = normalizeDateFormatted(dateObj);

        const formattedLog: TelemetryLog = {
          id: String(latest.id),
          timestamp: latest.created_at,
          timeFormatted,
          dateFormatted,
          dateTimeFormatted: `${dateFormatted} ${timeFormatted}`,
          bpm: Number(latest.bpm) || 0,
          spo2: Number(latest.spo2) || 0,
          postureStatus: Number(latest.posture_status ?? -1),
          postureLabel: latest.posture_label || '',
          trackingActive: Boolean(latest.tracking_active),
          hasAlert: Boolean(latest.has_alert),
          userId: latest.user_id,
          userEmail: latest.user_email,
          userName: latest.user_name,
          device: latest.device,
        };

        if (lastSeenId && String(latest.id) !== lastSeenId && onLog) {
          onLog(formattedLog);
        }
        lastSeenId = String(latest.id);
      }
    } catch {}
  };

  const intervalId = setInterval(poll, 15000);
  return () => {
    isCancelled = true;
    clearInterval(intervalId);
  };
}

/**
 * Script SQL an toàn cho Supabase SQL Editor
 */
export const SUPABASE_SQL_SETUP_SCRIPT = `-- Xem chi tiết và chạy toàn bộ mã bảo mật tại tệp supabase/schema.sql
-- Hoặc sao chép nội dung trong thư mục supabase/schema.sql vào Supabase SQL Editor.
`;
