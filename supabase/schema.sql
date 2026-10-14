-- ====================================================================
-- HỆ THỐNG THEO DÕI SỨC KHỎE & CÔNG THÁI HỌC IOT (SUPABASE SCHEMA)
-- Tệp: supabase/schema.sql
-- 
-- Hướng dẫn chạy:
-- 1. Truy cập https://supabase.com -> Đăng nhập vào dự án của bạn
-- 2. Chọn mục SQL Editor -> New Query
-- 3. Dán toàn bộ nội dung tệp này vào và bấm RUN
-- ====================================================================

-- 1. BẢNG LƯU DỮ LIỆU SINH TRẮC HỌC VÀ CÔNG THÁI HỌC (TELEMETRY LOGS)
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT NOT NULL,
    user_email TEXT,
    user_name TEXT,
    bpm INT DEFAULT 0,
    spo2 NUMERIC(4, 1) DEFAULT 0,
    posture_status INT DEFAULT -1,    -- 0: Đúng, 1: Sai, 2: Vắng, 3: Sai lâu, 4: Ngồi lâu, 5: Đứng
    posture_label TEXT DEFAULT 'Chưa có dữ liệu',
    in_zone BOOLEAN DEFAULT true,
    tracking_active BOOLEAN DEFAULT true,
    has_alert BOOLEAN DEFAULT false,
    alert_type TEXT,
    device TEXT DEFAULT 'pi4_node'
);

-- 2. TẠO INDEXES TỐC ĐỘ CAO CHO TRUY VẤN THEO THỜI GIAN VÀ USER ID
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON public.telemetry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_id ON public.telemetry_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_created ON public.telemetry_logs (user_id, created_at DESC);

-- 3. BẬT BẢO MẬT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

-- 4. XÓA TOÀN BỘ CÁC CHÍNH SÁCH CŨ NGUY HIỂM VỚI 'USING (true)'
DROP POLICY IF EXISTS "Cho phép đọc dữ liệu công khai" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép ghi log từ Dashboard hoặc Raspberry Pi" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Cho phép xóa dữ liệu từ Dashboard" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public read access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.telemetry_logs;

-- 5. THU HỒI QUYỀN TRUY CẬP TRỰC TIẾP CỦA ROLE ANON (CLIENT)
-- Client web tuyệt đối KHÔNG được gọi trực tiếp qua Supabase Anon Key.
-- Mọi thao tác truy xuất hoặc ghi log phải thông qua Backend API (/api/telemetry/log, /api/telemetry/history)
-- được xác thực bằng Firebase ID Token và thực hiện bằng SUPABASE_SERVICE_ROLE_KEY.
REVOKE ALL ON public.telemetry_logs FROM anon;
GRANT ALL ON public.telemetry_logs TO service_role;

-- 6. TÍNH NĂNG SUPABASE REALTIME (TÙY CHỌN CHO BACKEND LISTENER)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_logs;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE public.telemetry_logs IS 'Bảng lưu trữ lịch sử đo sức khỏe và tư thế công thái học. RLS được kích hoạt nghiêm ngặt và chỉ cho phép service_role truy cập từ backend.';
