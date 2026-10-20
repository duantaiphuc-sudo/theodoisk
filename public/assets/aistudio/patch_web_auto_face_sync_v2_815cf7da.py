#!/usr/bin/env python3
"""Patch Web >= GitHub main 1de1f2e to delegate auto login/logout to Pi.
Run from the repository root containing src/components/FaceControlPanel.tsx.
Creates a timestamped backup, never silently guesses changed code.
"""
from pathlib import Path
from datetime import datetime
import shutil

p = Path('src/components/FaceControlPanel.tsx')
if not p.exists():
    raise SystemExit('Không tìm thấy src/components/FaceControlPanel.tsx; hãy chạy ở thư mục Web.')
s = p.read_text(encoding='utf-8')
marker = 'PI_AUTHORITATIVE_AUTO_FACE_V2'
if marker in s:
    print('Web đã được vá; không cần vá lại.')
    raise SystemExit(0)
# The Web currently sends VERIFY_FACE only after seeing telemetry, and sends
# LOGOUT_FACE based on the previous telemetry; both create a circular dependency.
start_marker = '  // TỰ ĐỘNG XÁC THỰC KHI CÓ NGƯỜI & TỰ ĐỘNG ĐĂNG XUẤT KHI VẮNG MẶT'
start = s.find(start_marker)
if start < 0:
    raise SystemExit('Không tìm thấy đoạn Web tự gửi lệnh; Web có thể đã thay đổi. Không sửa tự động.')
start = s.rfind('  // =========================================================================', 0, start)
end_marker = '  async function handleExecuteReset() {'
end = s.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Không xác định được ranh giới khối cần sửa. Không ghi file.')
block=s[start:end]
if "execute('VERIFY', true)" not in block or "execute('LOGOUT', true)" not in block:
    raise SystemExit('Khối điều khiển không giống commit đã kiểm tra; không thay đổi file.')
replacement="""  // PI_AUTHORITATIVE_AUTO_FACE_V2
  // Khong gui VERIFY_FACE / LOGOUT_FACE tu trinh duyet.
  // Raspberry Pi doc camera, khoa phien va tu xac thuc lai.
  // Web chi lang nghe devices/{deviceId}/session/current.

"""
s = s[:start] + replacement + s[end:]
if 'requestFaceEnrollment' not in s or "onClick={() => execute('ENROLL')}" not in s:
    raise SystemExit('Phát hiện thiếu chức năng đăng ký: dừng, không ghi file.')
backup=p.with_name(p.name+'.backup_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
shutil.copy2(p,backup)
p.write_text(s,encoding='utf-8')
print('Đã cập nhật:',p)
print('Bản sao lưu:',backup)
print('Tiếp theo: npm run typecheck && npm run build, sau đó deploy Web.')
