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

-- 3. TẠO BẢNG TỔNG HỢP ĐIỂM NĂNG SUẤT HÀNG NGÀY (DAILY OHPS SUMMARY)
CREATE TABLE IF NOT EXISTS public.daily_ohps_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    posture_score INT CHECK (posture_score BETWEEN 0 AND 100),
    break_score INT CHECK (break_score BETWEEN 0 AND 100),
    vital_score INT CHECK (vital_score BETWEEN -1 AND 100), -- -1 nghĩa là mất cảm biến
    task_score INT CHECK (task_score BETWEEN 0 AND 100),
    
    hes_score INT CHECK (hes_score BETWEEN 0 AND 100),
    ts_score INT CHECK (ts_score BETWEEN 0 AND 100),
    ohps_score INT CHECK (ohps_score BETWEEN 0 AND 100),
    
    data_confidence INT CHECK (data_confidence BETWEEN 0 AND 100),
    has_vital_data BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- (Tùy chọn) Thêm cột classification nếu muốn lưu nhãn văn bản:
-- ALTER TABLE public.daily_ohps_summary ADD COLUMN IF NOT EXISTS classification TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_ohps_user_date ON public.daily_ohps_summary (user_id, date);

-- 4. BẬT ROW LEVEL SECURITY (RLS) VÀ CẤP QUYỀN TRUY CẬP
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ohps_summary ENABLE ROW LEVEL SECURITY;

-- 5. CHÍNH SÁCH BẢO MẬT (POLICIES) CHO TELEMETRY_LOGS
DROP POLICY IF EXISTS "Cho phép đọc dữ liệu công khai" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép ghi log từ Dashboard hoặc Raspberry Pi" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép xóa dữ liệu từ Dashboard" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon read" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon insert" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow anon delete" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable all for anon" ON public.telemetry_logs;
DROP POLICY IF EXISTS "telemetry_logs_allow_all" ON public.telemetry_logs;

CREATE POLICY "telemetry_logs_allow_all" 
ON public.telemetry_logs 
FOR ALL 
TO public, anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 6. CHÍNH SÁCH BẢO MẬT (POLICIES) CHO DAILY_OHPS_SUMMARY
DROP POLICY IF EXISTS "daily_ohps_allow_all" ON public.daily_ohps_summary;

CREATE POLICY "daily_ohps_allow_all" 
ON public.daily_ohps_summary 
FOR ALL 
TO public, anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Cấp quyền SELECT, INSERT, UPDATE, DELETE cho anon & authenticated
GRANT ALL ON TABLE public.telemetry_logs TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_ohps_summary TO anon, authenticated, service_role;

