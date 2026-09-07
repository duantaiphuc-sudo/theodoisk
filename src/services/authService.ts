import { AuthUser, UserRole } from '../types';

const AUTH_STORAGE_KEY = 'theodoisk_authenticated_user_v1';

export const PRESET_ACCOUNTS: Array<{
  user: AuthUser;
  password: string;
  description: string;
  permissions: string[];
}> = [
  {
    user: {
      id: 'usr-admin-01',
      username: 'admin',
      email: 'admin@theodoisk.com',
      fullName: 'Nguyễn Văn Quản Lý (Admin)',
      role: 'manager',
      department: 'Ban Điều Hành & An Toàn Lao Động',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    password: 'admin123',
    description: 'Quyền Quản Trị Viên tối cao: Cấu hình hệ thống, sửa ngưỡng cảnh báo, hiệu chỉnh vùng camera, quản lý và xóa dữ liệu, xuất file báo cáo.',
    permissions: [
      'Toàn quyền cấu hình Firebase & thiết bị IoT',
      'Tùy chỉnh ngưỡng nhịp tim (BPM) & nồng độ oxy (SpO₂)',
      'Hiệu chỉnh vùng phát hiện (Monitor Zone) của Camera AI',
      'Xem & xuất toàn bộ lịch sử nhân viên ra CSV / Excel',
      'Quyền xóa và dọn dẹp bộ nhớ lịch sử đo',
    ],
  },
  {
    user: {
      id: 'usr-employee-01',
      username: 'user',
      email: 'user@theodoisk.com',
      fullName: 'Trần Thị Nhân Viên (User)',
      role: 'employee',
      department: 'Phòng Phát Triển Sản Phẩm (R&D)',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    },
    password: 'user123',
    description: 'Quyền Người Dùng / Nhân Viên: Theo dõi sức khỏe cá nhân, tư thế ngồi trực quan, nhận nhắc nhở giải lao, trò chuyện tra cứu với Trợ lý AI.',
    permissions: [
      'Theo dõi trực tiếp nhịp tim, SpO₂ và tư thế cá nhân',
      'Nhận cảnh báo âm thanh khi ngồi sai tư thế hoặc làm việc quá lâu',
      'Tra cứu lịch sử sức khỏe cá nhân với Trợ Lý AI (1 giờ trước, 3 ngày trước...)',
      'Nhận hướng dẫn bài tập công thái học tại bàn làm việc',
      'Được bảo vệ dữ liệu cấu hình hệ thống khỏi bị thay đổi ngoài ý muốn',
    ],
  },
];

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse authenticated user:', e);
  }
  return null;
}

export function saveCurrentUser(user: AuthUser): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save authenticated user:', e);
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to logout:', e);
  }
}

export function loginWithCredentials(
  identifier: string,
  pass: string
): { success: boolean; user?: AuthUser; error?: string } {
  const cleanId = identifier.trim().toLowerCase();
  const found = PRESET_ACCOUNTS.find(
    acc =>
      (acc.user.username.toLowerCase() === cleanId || acc.user.email.toLowerCase() === cleanId) &&
      acc.password === pass
  );

  if (found) {
    saveCurrentUser(found.user);
    return { success: true, user: found.user };
  }

  return {
    success: false,
    error: 'Tên đăng nhập hoặc mật khẩu không chính xác. Hãy dùng tài khoản admin / admin123 hoặc user / user123.',
  };
}

export function loginAsPreset(role: UserRole): AuthUser {
  const preset = PRESET_ACCOUNTS.find(a => a.user.role === role) || PRESET_ACCOUNTS[0];
  saveCurrentUser(preset.user);
  return preset.user;
}
