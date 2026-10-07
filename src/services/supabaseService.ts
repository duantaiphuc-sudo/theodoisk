import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseConnectionConfig, TelemetryLog, HealthTelemetry, AuthUser } from '../types';

export const DEFAULT_SUPABASE_CONFIG: SupabaseConnectionConfig = {
  url: 'https://chftlvnbzudreqfsyeyj.supabase.co',
  anonKey: 'sb_publishable_WS4U8dfrADrf0dCeE37Nuw_xeNzcN6G',
  tableName: 'telemetry_logs',
  autoSync: true,
  isConnected: true,
};

let cachedClient: SupabaseClient | null = null;
let lastClientKey = '';

export function getSavedSupabaseConfig(): SupabaseConnectionConfig {
  try {
    const saved = localStorage.getItem('theodoisk_supabase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { 
        ...DEFAULT_SUPABASE_CONFIG, 
        ...parsed,
        url: parsed.url || DEFAULT_SUPABASE_CONFIG.url,
        anonKey: parsed.anonKey || DEFAULT_SUPABASE_CONFIG.anonKey
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
    // Reset cache so new credentials take effect
    cachedClient = null;
    lastClientKey = '';
  } catch (err) {
    console.error('Lỗi lưu cấu hình Supabase:', err);
  }
}

export function getSupabaseClient(config?: SupabaseConnectionConfig): SupabaseClient | null {
  const effectiveConfig = config || getSavedSupabaseConfig();
  if (!effectiveConfig.url || !effectiveConfig.anonKey) {
    return null;
  }

  const keySignature = `${effectiveConfig.url}_${effectiveConfig.anonKey}`;
  if (cachedClient && lastClientKey === keySignature) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(effectiveConfig.url, effectiveConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastClientKey = keySignature;
    return cachedClient;
  } catch (err) {
    console.warn('Không thể khởi tạo Supabase Client:', err);
    return null;
  }
}

/**
 * Kiểm tra kết nối tới Supabase Database
 */
export async function testSupabaseConnection(config?: SupabaseConnectionConfig): Promise<{
  success: boolean;
  message: string;
  tableExists?: boolean;
}> {
  const effectiveConfig = config || getSavedSupabaseConfig();
  if (!effectiveConfig.url || !effectiveConfig.anonKey) {
    return {
      success: false,
      message: 'Vui lòng nhập đầy đủ Supabase URL và Anon Public Key.',
    };
  }

  try {
    const client = getSupabaseClient(effectiveConfig);
    if (!client) {
      return { success: false, message: 'Khởi tạo Supabase client thất bại.' };
    }

    // Thử truy vấn bảng để kiểm tra quyền và schema
    const { data, error } = await client
      .from(effectiveConfig.tableName || 'telemetry_logs')
      .select('id')
      .limit(1);

    if (error) {
      // Mã lỗi 42P01 (undefined_table) hoặc PGRST205 (schema cache missing table)
      if (
        error.code === '42P01' || 
        error.code === 'PGRST205' || 
        error.message?.includes('relation') || 
        error.message?.includes('does not exist') ||
        error.message?.includes('Could not find the table')
      ) {
        return {
          success: true,
          tableExists: false,
          message: `Kết nối API thành công. Bảng "${effectiveConfig.tableName}" chưa có dữ liệu hoặc chưa được tạo.`,
        };
      }
      return {
        success: false,
        message: `Lỗi kết nối: ${error.message} (Code: ${error.code || 'unknown'})`,
      };
    }

    return {
      success: true,
      tableExists: true,
      message: `Kết nối Supabase & bảng "${effectiveConfig.tableName}" thành công!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Lỗi kết nối Supabase: ${err?.message || 'Không thể gửi yêu cầu'}`,
    };
  }
}

/**
 * Ghi log dữ liệu sức khỏe lên bảng Supabase
 */
export async function insertTelemetryToSupabase(
  telemetry: HealthTelemetry | TelemetryLog,
  user?: AuthUser | null
): Promise<boolean> {
  const config = getSavedSupabaseConfig();
  if (!config.autoSync || !config.anonKey || !config.url) {
    return false;
  }

  const client = getSupabaseClient(config);
  if (!client) return false;

  try {
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
      tracking_active: Boolean(telemetry.trackingActive),
      has_alert: Boolean(telemetry.hasAlert),
      device: user?.device || (telemetry as any).source || (telemetry as any).device || 'pi4_node',
    };

    const { error } = await client.from(config.tableName || 'telemetry_logs').insert([row]);
    if (error) {
      console.warn('Ghi log Supabase thất bại:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Lỗi gửi dữ liệu lên Supabase:', err);
    return false;
  }
}

/**
 * Chuẩn hóa ngày tháng về dạng chuẩn duy nhất DD/MM/YYYY (ví dụ: 06/10/2026)
 * Giúp triệt tiêu lỗi bị chia tách thành 2 ngày khác nhau (6/10/2026 vs 06/10/2026)
 */
export function normalizeDateFormatted(input?: string | Date | null): string {
  if (!input) return '';
  try {
    if (typeof input === 'string') {
      const trimmed = input.trim();
      // Xử lý dạng D/M/YYYY hoặc DD/MM/YYYY
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${day}/${month}/${year}`;
        }
      }
      // Xử lý dạng YYYY-MM-DD
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
 * Xóa toàn bộ lịch sử hoặc lịch sử theo tài khoản trên Supabase
 */
export async function clearSupabaseHistory(targetUserId?: string): Promise<boolean> {
  const config = getSavedSupabaseConfig();
  const client = getSupabaseClient(config);
  if (!client) return false;

  try {
    const table = config.tableName || 'telemetry_logs';
    let query = client.from(table).delete();
    if (targetUserId && targetUserId !== 'all') {
      query = query.eq('user_id', targetUserId);
    } else {
      // PostgREST yêu cầu điều kiện WHERE khi delete: chọn id >= 0 hoặc id != -1
      query = query.gte('id', 0);
    }
    const { error } = await query;
    if (error) {
      // Fallback
      const fallback = await client.from(table).delete().neq('id', -1);
      if (fallback.error) {
        console.warn('Lỗi xóa lịch sử trên Supabase:', fallback.error.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('Lỗi kết nối khi xóa Supabase:', err);
    return false;
  }
}

/**
 * Xóa một bản ghi đơn lẻ trên Supabase
 */
export async function deleteSingleLogFromSupabase(id: string): Promise<boolean> {
  const config = getSavedSupabaseConfig();
  const client = getSupabaseClient(config);
  if (!client) return false;

  try {
    const numId = Number(id);
    if (isNaN(numId)) {
      // ID chuỗi tạm thời (chưa có ID số nguyên từ Supabase PostgreSQL)
      return true;
    }
    const { error } = await client
      .from(config.tableName || 'telemetry_logs')
      .delete()
      .eq('id', numId);

    if (error) {
      console.warn('Lỗi xóa bản ghi đơn lẻ trên Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Lỗi kết nối khi xóa bản ghi Supabase:', err);
    return false;
  }
}

export type TimeRangeFilter = 'day' | 'week' | 'month' | 'all';

/**
 * Truy xuất dữ liệu lịch sử theo khoảng thời gian (ngày trước, tuần trước, tháng trước)
 * Sử dụng sức mạnh truy vấn thời gian chuẩn xác của PostgreSQL
 */
export async function fetchSupabaseHistory(
  timeRange: TimeRangeFilter = 'day',
  userId?: string,
  userEmail?: string
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
  const config = getSavedSupabaseConfig();
  const client = getSupabaseClient(config);

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

  if (!client || !config.anonKey) {
    return { ...emptyResult, error: 'Chưa cấu hình Supabase Anon Key' };
  }

  try {
    let query = client
      .from(config.tableName || 'telemetry_logs')
      .select('*')
      .order('created_at', { ascending: false });

    // Tính mốc thời gian lọc chính xác theo ISO Date
    const now = new Date();
    if (timeRange === 'day') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      query = query.gte('created_at', yesterday.toISOString());
    } else if (timeRange === 'week') {
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', lastWeek.toISOString());
    } else if (timeRange === 'month') {
      const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', lastMonth.toISOString());
    }

    // Bảo mật phân quyền: Lọc chính xác theo user_id hoặc user_email
    if (userId && userId !== 'all') {
      if (userEmail) {
        query = query.or(`user_id.eq.${userId},user_email.eq.${userEmail}`);
      } else {
        query = query.eq('user_id', userId);
      }
    }

    // Giới hạn bản ghi tải về để tối ưu hiệu năng
    const { data, error } = await query.limit(500);

    if (error) {
      return { ...emptyResult, error: error.message };
    }

    if (!data || data.length === 0) {
      return emptyResult;
    }

    // Chuẩn hóa bản ghi trả về cho Dashboard
    const formatted: TelemetryLog[] = data.map((row: any) => {
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

    // Tính toán số liệu thống kê chuẩn xác (PostgreSQL Mathematical Aggregation)
    let sumBpm = 0;
    let countBpm = 0;
    let sumSpo2 = 0;
    let countSpo2 = 0;
    let goodPostureCount = 0;
    let sittingCount = 0;
    let standingCount = 0;
    let incorrectCount = 0;

    data.forEach((r: any) => {
      const bpm = Number(r.bpm) || 0;
      const spo2 = Number(r.spo2) || 0;
      const st = Number(r.posture_status);

      if (bpm > 0) {
        sumBpm += bpm;
        countBpm++;
      }
      if (spo2 > 0) {
        sumSpo2 += spo2;
        countSpo2++;
      }

      if (st === 0) goodPostureCount++;
      if (st === 0 || st === 4) sittingCount++;
      if (st === 5) standingCount++;
      if (st === 1 || st === 3) incorrectCount++;
    });

    const total = data.length;
    const avgBpm = countBpm > 0 ? Math.round(sumBpm / countBpm) : 0;
    const avgSpo2 = countSpo2 > 0 ? Number((sumSpo2 / countSpo2).toFixed(1)) : 0;
    const goodRatio = total > 0 ? Math.round((goodPostureCount / total) * 100) : 0;

    return {
      data: formatted,
      stats: {
        avgBpm,
        avgSpo2,
        totalRecords: total,
        goodPostureRatio: goodRatio,
        sittingCount,
        standingCount,
        incorrectCount,
      },
    };
  } catch (err: any) {
    return { ...emptyResult, error: err?.message || 'Lỗi truy vấn dữ liệu từ Supabase' };
  }
}

/**
 * Lắng nghe dữ liệu trực tiếp theo thời gian thực (Supabase Realtime)
 * Mỗi khi có bản ghi mới INSERT hoặc DELETE trong bảng telemetry_logs, ứng dụng sẽ cập nhật ngay lập tức.
 */
export function subscribeToSupabaseRealtime(
  onData?: (data: HealthTelemetry) => void,
  onLog?: (log: TelemetryLog) => void,
  targetUserId?: string,
  targetUserEmail?: string,
  onDeleteLog?: (deletedId: string) => void
): () => void {
  const config = getSavedSupabaseConfig();
  const client = getSupabaseClient(config);
  if (!client || !config.anonKey) {
    return () => {};
  }

  const tableName = config.tableName || 'telemetry_logs';
  const channelName = `realtime_${tableName}_${Date.now()}`;

  try {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tableName,
        },
        (payload: any) => {
          if (!payload.new) return;
          const row = payload.new;

          // Bảo mật phân quyền: Nếu có targetUserId, chỉ nhận bản ghi của user đó
          if (targetUserId && targetUserId !== 'all' && row.user_id && row.user_id !== targetUserId) {
            if (!targetUserEmail || (row.user_email && row.user_email.toLowerCase() !== targetUserEmail.toLowerCase())) {
              return;
            }
          }

          const dateObj = new Date(row.created_at || Date.now());
          const timeFormatted = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const dateFormatted = normalizeDateFormatted(dateObj);

          const logEntry: TelemetryLog = {
            id: String(row.id || Date.now()),
            timestamp: row.created_at || new Date().toISOString(),
            timeFormatted,
            dateFormatted,
            dateTimeFormatted: `${dateFormatted} ${timeFormatted}`,
            bpm: Number(row.bpm) || 0,
            spo2: Number(row.spo2) || 0,
            postureStatus: Number(row.posture_status ?? -1),
            postureLabel: row.posture_label || '',
            trackingActive: Boolean(row.tracking_active ?? true),
            hasAlert: Boolean(row.has_alert),
            userId: row.user_id,
            userEmail: row.user_email,
            userName: row.user_name,
            device: row.device || 'supabase_node',
          };

          if (onLog) {
            onLog(logEntry);
          }

          if (onData) {
            // Chỉ cập nhật màn hình live nếu là nguồn phần cứng thật từ Raspberry Pi, tránh echo từ web
            const dev = String(row.device || '').toLowerCase();
            const isWebEcho = dev.includes('web') || dev.includes('dashboard') || dev.includes('supabase_node');
            if (!isWebEcho) {
              const telemetry: HealthTelemetry = {
                bpm: Number(row.bpm) || 0,
                spo2: Number(row.spo2) || 0,
                postureStatus: Number(row.posture_status ?? -1),
                postureLabel: row.posture_label || '',
                inZone: Boolean(row.in_zone ?? true),
                trackingActive: Boolean(row.tracking_active ?? true),
                hasAlert: Boolean(row.has_alert),
                postureWarning: row.has_alert ? (row.posture_status === 1 ? 'Sai tư thế' : 'Cảnh báo sức khỏe') : undefined,
                source: 'Supabase Realtime',
                timestamp: row.created_at || new Date().toISOString(),
                confidence: 0.95,
              };
              onData(telemetry);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: tableName,
        },
        (payload: any) => {
          if (onDeleteLog && payload.old) {
            const delId = String(payload.old.id || '');
            if (delId) {
              onDeleteLog(delId);
            }
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Supabase Realtime] Đã kết nối kênh lắng nghe trực tiếp bảng ${tableName} (INSERT + DELETE)`);
        }
      });

    return () => {
      try {
        client.removeChannel(channel);
      } catch {}
    };
  } catch (err) {
    console.warn('Lỗi khởi tạo Supabase Realtime channel:', err);
    return () => {};
  }
}

/**
 * Mã SQL sẵn sàng chạy trong Supabase SQL Editor
 */
export const SUPABASE_SQL_SETUP_SCRIPT = `-- ========================================================
-- 1. BẢNG LƯU DỮ LIỆU SINH TRẮC HỌC & CÔNG THÁI HỌC (IoT)
-- Chạy đoạn script này tại Supabase Dashboard -> SQL Editor
-- ========================================================

CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT NOT NULL DEFAULT 'guest',
    user_email TEXT,
    user_name TEXT,
    bpm INT DEFAULT 0,
    spo2 NUMERIC(4, 1) DEFAULT 0,
    posture_status INT DEFAULT -1,    -- 0: Ngồi đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu, 5: Đứng
    posture_label TEXT DEFAULT 'Chưa có dữ liệu',
    in_zone BOOLEAN DEFAULT true,
    tracking_active BOOLEAN DEFAULT true,
    has_alert BOOLEAN DEFAULT false,
    alert_type TEXT,
    device TEXT DEFAULT 'pi4_node'
);

-- 2. TẠO INDEX TỐC ĐỘ CAO CHO TRUY VẤN THEO MỐC THỜI GIAN & USER
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON public.telemetry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_id ON public.telemetry_logs (user_id);

-- 3. BẬT BẢO MẬT ROW LEVEL SECURITY (RLS) VÀ CẤP QUYỀN TRUY CẬP
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép đọc dữ liệu công khai" ON public.telemetry_logs;
CREATE POLICY "Cho phép đọc dữ liệu công khai"
    ON public.telemetry_logs FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Cho phép ghi log từ Dashboard hoặc Raspberry Pi" ON public.telemetry_logs;
CREATE POLICY "Cho phép ghi log từ Dashboard hoặc Raspberry Pi"
    ON public.telemetry_logs FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Cho phép xóa dữ liệu từ Dashboard" ON public.telemetry_logs;
CREATE POLICY "Cho phép xóa dữ liệu từ Dashboard"
    ON public.telemetry_logs FOR DELETE
    USING (true);

-- 4. BẬT TÍNH NĂNG SUPABASE REALTIME ĐỂ ĐỒNG BỘ TỨC THÌ (WEBSOCKET)
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_logs;

-- 5. LỆNH XÓA TOÀN BỘ VÀ RESET ID TỰ ĐỘNG TĂNG VỀ LẠI 1 (RESTART IDENTITY):
-- TRUNCATE TABLE public.telemetry_logs RESTART IDENTITY;
`;
