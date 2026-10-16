-- =========================================================================
-- SUPABASE POSTGRESQL SECURE SCHEMA: TELEMETRY LOGS (IoT Health System)
-- =========================================================================
-- Chạy script này trong Supabase Dashboard -> SQL Editor để bảo mật cơ sở dữ liệu.
-- Script thực hiện:
--   1. Tạo bảng telemetry_logs và các index tăng tốc truy vấn.
--   2. BẬT ROW LEVEL SECURITY (RLS).
--   3. XÓA TOÀN BỘ CÁC POLICY CŨ CÓ "USING (true)" (Ngăn chặn rò rỉ dữ liệu qua Anon Key).
--   4. KHÔNG TẠO POLICY CHO ANON (Mọi truy cập trực tiếp từ client không có quyền).
--   5. KHÔNG CẤP QUYỀN DELETE CHO CLIENT. Toàn bộ thao tác ghi và đọc đều phải
--      thông qua API Server đã xác thực Firebase ID Token (sử dụng service_role).
-- =========================================================================

-- 1. TẠO BẢNG TELEMETRY_LOGS
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

-- 2. TẠO INDEXES TRUY VẤN TỐC ĐỘ CAO
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON public.telemetry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_id ON public.telemetry_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_email ON public.telemetry_logs (user_email);

-- 3. BẬT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

-- 4. XÓA MỌI CHÍNH SÁCH CÔNG KHAI CŨ (LOẠI BỎ POLICY USING (true))
DROP POLICY IF EXISTS "Cho phép đọc dữ liệu công khai" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép ghi log từ Dashboard hoặc Raspberry Pi" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép xóa dữ liệu từ Dashboard" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon read" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon insert" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon delete" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable all for anon" ON public.telemetry_logs;

-- 5. LƯU Ý BẢO MẬT:
-- Không cấp quyền SELECT, INSERT, UPDATE, DELETE cho anon role.
-- Mọi truy vấn từ frontend Dashboard bắt buộc đi qua backend Server (/api/telemetry/log, /api/telemetry/history).
-- Backend xác thực Firebase ID Token (Bearer token) của người dùng trước khi truy cập Supabase bằng SUPABASE_SERVICE_ROLE_KEY.
-- Quyền DELETE không được cấp cho client thông thường.
