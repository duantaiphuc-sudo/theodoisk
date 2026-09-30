import { AuthUser, UserRole } from '../types';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig } from './firebase';

const AUTH_STORAGE_KEY = 'theodoisk_authenticated_user_v1';
const ALL_USERS_STORAGE_KEY = 'theodoisk_all_registered_users_v1';

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
      role: 'admin',
      department: 'Ban Điều Hành & An Toàn Lao Động',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      age: 32,
      gender: 'male',
      height: 175,
      weight: 68,
      maxSittingHours: 6,
      healthNotes: 'Thể trạng tốt, theo dõi đau mỏi vai gáy định kỳ.',
      status: 'active',
    },
    password: 'admin123',
    description: 'Quyền Quản Trị Viên: Cấu hình hệ thống, sửa ngưỡng cảnh báo, hiệu chỉnh vùng camera, quản lý và xóa dữ liệu, xuất file báo cáo, quản lý toàn bộ tài khoản.',
    permissions: [
      'Toàn quyền cấu hình Firebase & thiết bị IoT',
      'Tùy chỉnh ngưỡng nhịp tim (BPM) & nồng độ oxy (SpO₂)',
      'Hiệu chỉnh vùng phát hiện (Monitor Zone) của Camera AI',
      'Quản lý tất cả tài khoản người dùng & phân quyền hệ thống',
      'Xem & xuất toàn bộ lịch sử nhân viên ra CSV / Excel',
      'Quyền xóa và dọn dẹp bộ nhớ lịch sử đo',
    ],
  },
  {
    user: {
      id: '6BpcDl3EJZd1fg6aOtl0ji9Ezst1',
      username: 'tai',
      email: 'thanhtaihtc@gmail.com',
      fullName: 'Tài Thành',
      role: 'employee',
      department: 'Phòng Phát Triển & Vận Hành IoT',
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocK2eIksljJ-UFB6rDik7bTbHxYOLiToCehxNxXzYbaoS1XC2R3r=s96-c',
      age: 28,
      gender: 'male',
      height: 170,
      weight: 65,
      maxSittingHours: 6,
      healthNotes: 'Cần duy trì tư thế ngồi thẳng và giải lao đều đặn.',
      status: 'active',
      device: 'pi4_node_2'
    },
    password: 'user123',
    description: 'Quyền Nhân Viên (Tài Thành): Theo dõi sức khỏe, nhịp tim và tư thế công thái học qua IoT.',
    permissions: [
      'Theo dõi trực tiếp nhịp tim, SpO₂ và tư thế cá nhân',
      'Nhận cảnh báo âm thanh khi ngồi sai tư thế hoặc làm việc quá lâu',
      'Cập nhật thông tin sức khỏe cá nhân (tuổi, chiều cao, cân nặng, BMI)',
      'Nhận hướng dẫn bài tập công thái học tại bàn làm việc',
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
      age: 26,
      gender: 'female',
      height: 162,
      weight: 52,
      maxSittingHours: 5,
      healthNotes: 'Cần nhắc nhở đứng dậy vươn vai sau mỗi 45 phút ngồi liên tục.',
      status: 'active',
    },
    password: 'user123',
    description: 'Quyền Người Dùng / Nhân Viên: Theo dõi sức khỏe cá nhân, tư thế ngồi trực quan, nhận nhắc nhở giải lao, trò chuyện tra cứu với Trợ lý AI.',
    permissions: [
      'Theo dõi trực tiếp nhịp tim, SpO₂ và tư thế cá nhân',
      'Nhận cảnh báo âm thanh khi ngồi sai tư thế hoặc làm việc quá lâu',
      'Cập nhật thông tin sức khỏe cá nhân (tuổi, chiều cao, cân nặng, BMI)',
      'Tra cứu lịch sử sức khỏe cá nhân với Trợ Lý AI',
      'Nhận hướng dẫn bài tập công thái học tại bàn làm việc',
    ],
  }
];

/**
 * Strict System Admin Check:
 * ONLY duantaiphuc@gmail.com (và các biến thể duantaiphuc) và admin (admin@theodoisk.com) là Quản trị viên.
 * Tất cả các tài khoản khác bắt buộc là Nhân viên (employee).
 */
export function isSystemAdmin(email?: string, username?: string): boolean {
  const e = (email || '').toLowerCase().trim();
  const u = (username || '').toLowerCase().trim();
  return (
    e === 'duantaiphuc@gmail.com' ||
    e.startsWith('duantaiphuc') ||
    u === 'duantaiphuc' ||
    u === 'admin' ||
    e === 'admin@theodoisk.com' ||
    e === 'admin@gmail.com'
  );
}

export function isUserAdmin(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || isSystemAdmin(user.email, user.username);
}

export function enforceStrictRole(user: AuthUser): AuthUser {
  const isAdmin = isSystemAdmin(user.email, user.username);
  return {
    ...user,
    role: isAdmin ? 'admin' : 'employee',
  };
}

function getLocalUsersCache(): AuthUser[] {
  try {
    const raw = localStorage.getItem(ALL_USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const emailMap = new Map<string, AuthUser>();
        parsed.forEach(u => {
          const key = (u.email || u.username || u.id).trim().toLowerCase();
          emailMap.set(key, enforceStrictRole(u));
        });
        return Array.from(emailMap.values());
      }
    }
  } catch {}
  return PRESET_ACCOUNTS.map(p => enforceStrictRole(p.user));
}

function saveLocalUsersCache(users: AuthUser[]): void {
  try {
    const emailMap = new Map<string, AuthUser>();
    users.forEach(u => {
      const key = (u.email || u.username || u.id).trim().toLowerCase();
      emailMap.set(key, enforceStrictRole(u));
    });
    const strictUsers = Array.from(emailMap.values());
    localStorage.setItem(ALL_USERS_STORAGE_KEY, JSON.stringify(strictUsers));
  } catch {}
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const u: AuthUser = JSON.parse(raw);
      // Strictly enforce role: ONLY duantaiphuc@gmail.com and admin are admins
      const strictlyRoleUser = enforceStrictRole(u);
      if (strictlyRoleUser.role !== u.role) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(strictlyRoleUser));
        syncUserProfileToFirestore(strictlyRoleUser).catch(() => {});
      }
      return strictlyRoleUser;
    }
  } catch (e) {
    console.error('Failed to parse authenticated user:', e);
  }
  return null;
}

export function saveCurrentUser(user: AuthUser): void {
  try {
    const strictlyRoleUser = enforceStrictRole(user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(strictlyRoleUser));
    syncUserProfileToFirestore(strictlyRoleUser).catch(() => {});
  } catch (e) {
    console.error('Failed to save authenticated user:', e);
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);
    auth.signOut().catch(() => {});
  } catch (e) {
    console.error('Failed to logout:', e);
  }
}

/**
 * Saves or updates user profile to Firestore `users/{uid}` collection & local cache
 */
export async function syncUserProfileToFirestore(user: AuthUser): Promise<void> {
  try {
    // 1. Update local cache
    const currentList = getLocalUsersCache();
    const idx = currentList.findIndex(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      currentList[idx] = { ...currentList[idx], ...user };
    } else {
      currentList.push(user);
    }
    saveLocalUsersCache(currentList);

    // 2. Push to Firestore
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, {
      uid: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department || 'Nhân viên Văn Phòng IoT',
      avatar: user.avatar || '',
      phoneNumber: user.phoneNumber || '',
      age: Number(user.age) || 28,
      gender: user.gender || 'male',
      height: Number(user.height) || 170,
      weight: Number(user.weight) || 65,
      maxSittingHours: Number(user.maxSittingHours) || 6,
      healthNotes: user.healthNotes || '',
      status: user.status || 'active',
      isOnline: true,
      currentPresence: 'Present',
      currentPosture: user.currentPosture || 'waiting',
      currentPostureText: user.currentPostureText || '– Chờ kết nối',
      lastActive: new Date().toISOString(),
      lastLogin: user.lastLogin || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Lỗi đồng bộ hồ sơ user lên Firestore:', err);
  }
}

/**
 * Fetch all registered users from Firestore `users` collection,
 * merged with local cache & presets.
 */
export async function fetchAllUsers(): Promise<AuthUser[]> {
  const localList = getLocalUsersCache();
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const usersColl = collection(db, 'users');
    const snap = await getDocs(usersColl);

    if (!snap.empty) {
      const now = Date.now();
      const firestoreUsers: AuthUser[] = snap.docs.map(d => {
        const data = d.data();
        const email = data.email || `${d.id}@theodoisk.com`;
        const username = data.username || (data.email ? data.email.split('@')[0] : d.id);
        const isAdmin = isSystemAdmin(email, username);
        const lastActiveTime = data.lastActive ? new Date(data.lastActive).getTime() : 0;
        const isOnline = Boolean(data.isOnline) && (lastActiveTime > 0 ? Math.abs(now - lastActiveTime) < 15 * 60 * 1000 : true);
        return {
          id: d.id,
          username,
          email,
          fullName: data.fullName || 'Người Dùng Hệ Thống',
          role: isAdmin ? 'admin' : 'employee',
          department: data.department || 'Văn Phòng IoT',
          avatar: data.avatar || '',
          phoneNumber: data.phoneNumber || '',
          age: Number(data.age) || 28,
          gender: data.gender || 'male',
          height: Number(data.height) || 170,
          weight: Number(data.weight) || 65,
          maxSittingHours: Number(data.maxSittingHours) || 6,
          healthNotes: data.healthNotes || '',
          status: data.status || 'active',
          lastLogin: data.lastLogin || data.updatedAt || '',
          createdAt: data.createdAt || data.updatedAt || '',
          isOnline,
          currentPresence: isOnline ? 'Present' : 'Away',
          currentPosture: data.currentPosture || 'waiting',
          currentPostureText: data.currentPostureText || '– Chờ kết nối',
          device: data.device || '',
          sittingMinutes: Number(data.sittingMinutes) || 0,
          bpm: Number(data.bpm) || 0,
          spo2: Number(data.spo2) || 0,
          hasAlert: Boolean(data.hasAlert),
          alertReason: data.alertReason || '',
          lastActive: data.lastActive || ''
        };
      });

      // Merge firestore with local - strictly deduplicated by email
      const map = new Map<string, AuthUser>();
      const addOrMerge = (user: AuthUser) => {
        const key = (user.email || user.username || user.id).trim().toLowerCase();
        if (map.has(key)) {
          const existing = map.get(key)!;
          map.set(key, enforceStrictRole({
            ...existing,
            ...user,
            id: existing.id || user.id,
            isOnline: Boolean(existing.isOnline || user.isOnline),
            currentPresence: (existing.currentPresence === 'Present' || user.currentPresence === 'Present') ? 'Present' : 'Away',
            currentPosture: user.currentPosture || existing.currentPosture || 'waiting',
            currentPostureText: user.currentPostureText || existing.currentPostureText || '– Chờ kết nối',
            role: (existing.role === 'admin' || user.role === 'admin') ? 'admin' : 'employee'
          }));
        } else {
          map.set(key, enforceStrictRole(user));
        }
      };

      PRESET_ACCOUNTS.forEach(p => addOrMerge(p.user));
      localList.forEach(u => addOrMerge(u));
      firestoreUsers.forEach(u => addOrMerge(u));

      const merged = Array.from(map.values()).map(enforceStrictRole);
      saveLocalUsersCache(merged);
      return merged;
    }
  } catch (e) {
    console.warn('Không thể tải danh sách users từ Firestore (sử dụng bộ nhớ cục bộ):', e);
  }
  return localList.map(enforceStrictRole);
}

/**
 * Admin: Update user details in Firestore & local cache
 */
export async function adminUpdateUser(updatedUser: AuthUser): Promise<boolean> {
  try {
    const strictlyRoleUser = enforceStrictRole(updatedUser);
    const list = getLocalUsersCache();
    const idx = list.findIndex(u => u.id === strictlyRoleUser.id);
    if (idx >= 0) {
      list[idx] = strictlyRoleUser;
    } else {
      list.push(strictlyRoleUser);
    }
    saveLocalUsersCache(list);

    // If updating current logged in user, update session as well
    const current = getCurrentUser();
    if (current && current.id === strictlyRoleUser.id) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(strictlyRoleUser));
    }

    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const sanitizedUser: Record<string, any> = {};
    for (const [k, v] of Object.entries(strictlyRoleUser)) {
      if (v !== undefined) sanitizedUser[k] = v;
    }
    await setDoc(doc(db, 'users', strictlyRoleUser.id), {
      ...sanitizedUser,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return true;
  } catch (err) {
    console.error('Lỗi adminUpdateUser:', err);
    return false;
  }
}

/**
 * Admin: Delete user from Firestore & local cache
 */
export async function adminDeleteUser(userId: string): Promise<boolean> {
  try {
    const list = getLocalUsersCache().filter(u => u.id !== userId);
    saveLocalUsersCache(list);

    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    await deleteDoc(doc(db, 'users', userId));
    return true;
  } catch (err) {
    console.error('Lỗi adminDeleteUser:', err);
    return false;
  }
}

/**
 * Admin: Create a new user account
 */
export async function adminCreateUser(newUser: AuthUser): Promise<boolean> {
  try {
    const list = getLocalUsersCache();
    list.push(newUser);
    saveLocalUsersCache(list);

    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const sanitizedNewUser: Record<string, any> = {};
    for (const [k, v] of Object.entries(newUser)) {
      if (v !== undefined) sanitizedNewUser[k] = v;
    }
    await setDoc(doc(db, 'users', newUser.id), {
      ...sanitizedNewUser,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return true;
  } catch (err) {
    console.error('Lỗi adminCreateUser:', err);
    return false;
  }
}

/**
 * Login with Email & Password via Firebase Authentication
 * If Firebase Auth is not yet populated, it seamlessly falls back to preset accounts.
 */
export async function loginWithFirebaseEmail(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check preset / local accounts first for instant resilience
  const foundPreset = PRESET_ACCOUNTS.find(
    acc =>
      (acc.user.username.toLowerCase() === cleanEmail || acc.user.email.toLowerCase() === cleanEmail) &&
      acc.password === pass
  );

  if (foundPreset) {
    saveCurrentUser(foundPreset.user);
    syncUserProfileToFirestore(foundPreset.user).catch(() => {});
    return { success: true, user: foundPreset.user };
  }

  // 2. Try Firebase Email/Password Auth
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);

    const credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    const fbUser = credential.user;

    const isManager = cleanEmail.includes('admin') || cleanEmail.includes('quanly') || cleanEmail === 'duantaiphuc@gmail.com';
    const authUser: AuthUser = {
      id: fbUser.uid,
      username: cleanEmail.split('@')[0],
      email: fbUser.email || cleanEmail,
      fullName: fbUser.displayName || (isManager ? 'Đoàn Tài Phúc (Admin)' : 'Nhân Viên Văn Phòng'),
      role: isManager ? 'admin' : 'employee',
      department: isManager ? 'Ban Điều Hành & An Toàn Lao Động' : 'Phòng Làm Việc Văn Phòng',
      avatar: fbUser.photoURL || undefined,
    };

    saveCurrentUser(authUser);
    syncUserProfileToFirestore(authUser).catch(() => {});
    return { success: true, user: authUser };
  } catch (firebaseErr: any) {
    console.warn('Firebase Email Auth attempt:', firebaseErr.code, firebaseErr.message);

    let msg = 'Tên đăng nhập hoặc mật khẩu không chính xác.';
    if (firebaseErr.code === 'auth/user-not-found' || firebaseErr.code === 'auth/invalid-credential') {
      msg = 'Không tìm thấy tài khoản hoặc mật khẩu không đúng. Vui lòng kiểm tra lại hoặc dùng tài khoản admin/user.';
    } else if (firebaseErr.code === 'auth/wrong-password') {
      msg = 'Mật khẩu không chính xác. Vui lòng nhập lại.';
    } else if (firebaseErr.code === 'auth/invalid-email') {
      msg = 'Định dạng Email không hợp lệ (ví dụ: admin@theodoisk.com hoặc dùng tài khoản nhanh bên dưới).';
    } else if (firebaseErr.code === 'auth/operation-not-allowed') {
      msg = 'Dự án Firebase chưa bật phương thức Email/Password. Bạn có thể sử dụng nút Đăng nhập nhanh bên dưới.';
    } else if (firebaseErr.code === 'auth/too-many-requests') {
      msg = 'Đã thử quá nhiều lần. Vui lòng đợi trong giây lát hoặc đăng nhập nhanh với tài khoản mẫu.';
    }

    return { success: false, error: msg };
  }
}

/**
 * Register a new user with Email & Password via Firebase Authentication
 */
export async function registerWithFirebaseEmail(
  email: string,
  pass: string,
  fullName: string,
  role: UserRole = 'employee'
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);

    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (fullName) {
      await updateProfile(cred.user, { displayName: fullName });
    }

    const authUser: AuthUser = {
      id: cred.user.uid,
      username: email.split('@')[0],
      email: cred.user.email || email,
      fullName: fullName || cred.user.displayName || 'Nhân Viên Mới',
      role: role,
      department: role === 'manager' ? 'Ban Quản Trị Hệ Thống' : 'Phòng Làm Việc Văn Phòng',
    };

    saveCurrentUser(authUser);
    await syncUserProfileToFirestore(authUser);
    return { success: true, user: authUser };
  } catch (err: any) {
    console.error('Lỗi đăng ký Firebase Email:', err);
    let msg = 'Đăng ký thất bại. Vui lòng thử lại.';
    if (err.code === 'auth/email-already-in-use') {
      msg = 'Email này đã được đăng ký. Bạn có thể đăng nhập ngay.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Mật khẩu quá ngắn. Vui lòng đặt mật khẩu ít nhất 6 ký tự.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Định dạng email không hợp lệ.';
    }
    return { success: false, error: msg };
  }
}

/**
 * Legacy credentials adapter
 */
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
    syncUserProfileToFirestore(found.user).catch(() => {});
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
  syncUserProfileToFirestore(preset.user).catch(() => {});
  return preset.user;
}

/**
 * Login with Google via Firebase Authentication
 */
export async function loginWithGoogle(): Promise<{ 
  success: boolean; 
  user?: AuthUser; 
  error?: string; 
  canQuickFallback?: boolean;
  isUnauthorizedDomain?: boolean;
  currentDomain?: string;
}> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const firebaseUser = result.user;

    const email = firebaseUser.email || '';
    const isManager = email.toLowerCase().includes('admin') || 
                      email.toLowerCase().includes('quanly') || 
                      email.toLowerCase().includes('duantaiphuc');

    const googleUser: AuthUser = {
      id: firebaseUser.uid,
      username: email ? email.split('@')[0] : 'google_user',
      email: email || 'duantaiphuc@gmail.com',
      fullName: firebaseUser.displayName || 'Tài khoản Google (Đoàn Tài Phúc)',
      role: isManager ? 'admin' : 'employee',
      avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      department: isManager ? 'Ban Quản Trị Hệ Thống' : 'Phòng Làm Việc Văn Phòng',
    };

    saveCurrentUser(googleUser);
    syncUserProfileToFirestore(googleUser).catch(() => {});
    return { success: true, user: googleUser };
  } catch (err: any) {
    console.warn('Lỗi đăng nhập Google Auth:', err);
    let errorMessage = 'Không thể kết nối với Google. Vui lòng thử lại.';
    let canQuickFallback = false;
    let isUnauthorizedDomain = false;
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

    if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
      errorMessage = `Tên miền hiện tại ("${currentDomain}") chưa được cấp phép trong Firebase Auth (Settings → Authorized domains).`;
      canQuickFallback = true;
      isUnauthorizedDomain = true;
    } else if (err.code === 'auth/configuration-not-found' || err.message?.includes('configuration-not-found')) {
      errorMessage = 'Dự án Firebase chưa bật nhà cung cấp Google trong Firebase Console (Authentication → Sign-in method → Bật Google). Bạn có thể dùng nút Đăng nhập nhanh bên dưới.';
      canQuickFallback = true;
    } else if (err.code === 'auth/popup-blocked') {
      errorMessage = 'Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup để đăng nhập bằng Google.';
      canQuickFallback = true;
    } else if (err.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.';
      canQuickFallback = true;
    } else if (err.code === 'auth/cancelled-popup-request') {
      errorMessage = 'Yêu cầu đăng nhập Google đã bị hủy.';
    } else if (err.message) {
      errorMessage = err.message;
      canQuickFallback = true;
    }
    return { success: false, error: errorMessage, canQuickFallback, isUnauthorizedDomain, currentDomain };
  }
}

/**
 * Fast Google sign-in fallback
 */
export function loginWithGoogleFallback(email = 'duantaiphuc@gmail.com', name = 'Tài khoản Google (Đoàn Tài Phúc)'): AuthUser {
  const googleUser: AuthUser = {
    id: 'usr-duantaiphuc',
    username: email.split('@')[0],
    email: email,
    fullName: name,
    role: 'admin', // Always elevate to Admin as requested
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    department: 'Ban Quản Trị & Nghiên Cứu IoT',
    age: 27,
    gender: 'male',
    height: 172,
    weight: 65,
    maxSittingHours: 6,
    healthNotes: 'Cần duy trì tư thế ngồi thẳng và nghỉ ngơi giãn cơ đều đặn.',
    status: 'active',
    lastLogin: new Date().toISOString()
  };
  saveCurrentUser(googleUser);
  syncUserProfileToFirestore(googleUser).catch(() => {});
  return googleUser;
}

/**
 * Setup invisible reCAPTCHA for Phone Authentication
 */
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved - allow signInWithPhoneNumber
      },
      'expired-callback': () => {
        recaptchaVerifier = null;
      }
    });
  }
  return recaptchaVerifier;
}

/**
 * Send SMS verification code to phone number via Firebase Authentication
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  containerId = 'recaptcha-container'
): Promise<{ success: boolean; confirmationResult?: ConfirmationResult; error?: string; canFallback?: boolean }> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);

    // Format phone number to E.164 (e.g. +84912345678)
    let formattedPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+84' + formattedPhone.slice(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const appVerifier = setupRecaptcha(containerId);
    const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
    return { success: true, confirmationResult: confirmation };
  } catch (err: any) {
    console.warn('Lỗi gửi mã xác thực số điện thoại:', err);
    let msg = 'Không thể gửi mã SMS. Vui lòng kiểm tra số điện thoại.';
    let canFallback = false;

    if (err.code === 'auth/invalid-phone-number') {
      msg = 'Số điện thoại không đúng định dạng. Ví dụ hợp lệ: 0912345678 hoặc +84912345678';
    } else if (err.code === 'auth/operation-not-allowed') {
      msg = 'Firebase Authentication chưa bật tính năng Xác thực qua Số điện thoại (Authentication → Sign-in method → Phone). Bạn có thể dùng mã thử nghiệm.';
      canFallback = true;
    } else if (err.code === 'auth/quota-exceeded') {
      msg = 'Hạn ngạch gửi tin nhắn SMS của Firebase đã vượt mức hôm nay. Vui lòng thử cách đăng nhập khác.';
      canFallback = true;
    } else if (err.message) {
      msg = err.message;
      canFallback = true;
    }

    return { success: false, error: msg, canFallback };
  }
}

/**
 * Verify SMS verification code from Firebase Phone Auth
 */
export async function verifyPhoneCode(
  confirmationResult: ConfirmationResult,
  verificationCode: string,
  phoneNumber: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const credential = await confirmationResult.confirm(verificationCode);
    const fbUser = credential.user;

    const authUser: AuthUser = {
      id: fbUser.uid,
      username: `phone_${phoneNumber.replace(/\D/g, '').slice(-4)}`,
      email: `${phoneNumber.replace(/\D/g, '')}@phone.theodoisk.com`,
      fullName: `Người Dùng (${phoneNumber})`,
      role: 'employee',
      department: 'Phòng Làm Việc Văn Phòng',
      phoneNumber: fbUser.phoneNumber || phoneNumber,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    };

    saveCurrentUser(authUser);
    syncUserProfileToFirestore(authUser).catch(() => {});
    return { success: true, user: authUser };
  } catch (err: any) {
    console.error('Lỗi xác thực mã SMS:', err);
    let msg = 'Mã xác thực OTP không chính xác hoặc đã hết hạn.';
    if (err.code === 'auth/invalid-verification-code') {
      msg = 'Mã xác thực OTP không đúng. Vui lòng kiểm tra tin nhắn.';
    } else if (err.code === 'auth/code-expired') {
      msg = 'Mã xác thực đã hết hạn. Vui lòng bấm gửi lại mã.';
    }
    return { success: false, error: msg };
  }
}

/**
 * Instant Phone Login fallback for fast demo / testing
 */
export function loginWithPhoneFallback(phoneNumber: string): AuthUser {
  const cleanPhone = phoneNumber.trim();
  const phoneUser: AuthUser = {
    id: `phone-${Date.now()}`,
    username: `phone_${cleanPhone.replace(/\D/g, '').slice(-4)}`,
    email: `${cleanPhone.replace(/\D/g, '')}@phone.theodoisk.com`,
    fullName: `Người Dùng (${cleanPhone})`,
    role: 'employee',
    phoneNumber: cleanPhone,
    department: 'Nhân viên Văn Phòng IoT',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
  };
  saveCurrentUser(phoneUser);
  syncUserProfileToFirestore(phoneUser).catch(() => {});
  return phoneUser;
}
