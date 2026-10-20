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
import { getFirestore, doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig } from './firebase';
import { assignDeviceToUser } from './adminDeviceAssignmentService';

export { assignDeviceToUser } from './adminDeviceAssignmentService';

const AUTH_STORAGE_KEY = 'theodoisk_authenticated_user_v1';
const ALL_USERS_STORAGE_KEY = 'theodoisk_all_registered_users_v1';

export const PRESET_ACCOUNTS: Array<{
  user: AuthUser;
  password: string;
  description: string;
  permissions: string[];
}> = [];

export function isSystemAdmin(_email?: string, _username?: string): boolean {
  // Hardcoded emails have been completely removed.
  // Role verification is strictly governed by Firebase Auth Custom Claim 'admin: true'.
  return false;
}

export function isUserAdmin(user?: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

export function enforceStrictRole(user: AuthUser): AuthUser {
  return {
    ...user,
    role: user.role === 'admin' ? 'admin' : (user.role === 'manager' ? 'manager' : 'employee'),
  };
}

function getLocalUsersCache(): AuthUser[] {
  try {
    const raw = localStorage.getItem(ALL_USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const idMap = new Map<string, AuthUser>();
        parsed.forEach(u => {
          if (!u || !u.id) return;
          if (u.id === 'usr-admin-01' || u.id === 'usr-employee-01' || u.username === 'admin' || u.username === 'user') return;
          // Loại bỏ hoàn toàn các tài khoản ảo/mặc định tự sinh không có email thật
          if (!u.email || !u.email.includes('@') || u.email.endsWith('@theodoisk.com')) return;
          if (u.fullName === 'Nhân Viên' && u.email.endsWith('@theodoisk.com')) return;

          const strict = enforceStrictRole(u);
          idMap.set(strict.id, strict);
        });
        return Array.from(idMap.values());
      }
    }
  } catch {}
  return [];
}

function saveLocalUsersCache(users: AuthUser[]): void {
  try {
    const idMap = new Map<string, AuthUser>();
    users.forEach(u => {
      if (!u || !u.id) return;
      if (u.id === 'usr-admin-01' || u.id === 'usr-employee-01' || u.username === 'admin' || u.username === 'user') return;
      if (!u.email || !u.email.includes('@') || u.email.endsWith('@theodoisk.com')) return;
      if (u.fullName === 'Nhân Viên' && u.email.endsWith('@theodoisk.com')) return;
      idMap.set(u.id, enforceStrictRole(u));
    });
    const strictUsers = Array.from(idMap.values());
    localStorage.setItem(ALL_USERS_STORAGE_KEY, JSON.stringify(strictUsers));
  } catch {}
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const u: AuthUser = JSON.parse(raw);
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

export async function syncUserProfileToFirestore(user: AuthUser): Promise<void> {
  try {
    const currentList = getLocalUsersCache();
    const idx = currentList.findIndex(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (idx >= 0) {
      currentList[idx] = { ...currentList[idx], ...user };
    } else {
      currentList.push(user);
    }
    saveLocalUsersCache(currentList);

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
      isOnline: Boolean(user.isOnline),
      currentPresence: user.isOnline ? 'Present' : 'Away',
      currentPosture: user.currentPosture || 'waiting',
      currentPostureText: user.currentPostureText || '– Chờ kết nối',
      device: user.device || '',
      deviceId: user.deviceId || user.device || '',
      lastActive: new Date().toISOString(),
      lastLogin: user.lastLogin || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Lỗi đồng bộ hồ sơ user lên Firestore:', err);
  }
}

export async function fetchAllUsers(): Promise<AuthUser[]> {
  const localList = getLocalUsersCache();
  const current = getCurrentUser();
  const userMap = new Map<string, AuthUser>();

  const addOrMerge = (user: AuthUser) => {
    if (!user || !user.id) return;
    if (user.id === 'usr-admin-01' || user.id === 'usr-employee-01' || user.username === 'admin' || user.username === 'user') return;
    // Bỏ qua tài khoản giả định / mẫu không có email thật
    if (!user.email || !user.email.includes('@') || user.email.endsWith('@theodoisk.com')) return;
    if (user.fullName === 'Nhân Viên' && user.email.endsWith('@theodoisk.com')) return;

    const strict = enforceStrictRole(user);
    // Tìm kiếm xem user đã tồn tại theo ID hoặc theo email chưa
    let existingKey: string | null = null;
    if (userMap.has(strict.id)) {
      existingKey = strict.id;
    } else {
      for (const [k, u] of userMap.entries()) {
        if (u.email.toLowerCase().trim() === strict.email.toLowerCase().trim()) {
          existingKey = k;
          break;
        }
      }
    }

    if (existingKey) {
      const existing = userMap.get(existingKey)!;
      const isPlaceholderName = (name: string) => !name || name === 'Nhân Viên' || name === 'Người Dùng Hệ Thống';
      const betterFullName = isPlaceholderName(strict.fullName) ? existing.fullName : strict.fullName;
      const betterEmail = strict.email.endsWith('@theodoisk.com') ? existing.email : strict.email;

      userMap.set(existingKey, enforceStrictRole({
        ...existing,
        ...strict,
        id: existing.id || strict.id,
        fullName: betterFullName,
        email: betterEmail,
        isOnline: Boolean(existing.isOnline || strict.isOnline),
        currentPresence: (existing.currentPresence === 'Present' || strict.currentPresence === 'Present') ? 'Present' : 'Away',
        currentPosture: strict.currentPosture || existing.currentPosture || 'waiting',
        currentPostureText: strict.currentPostureText || existing.currentPostureText || '– Chờ kết nối',
        role: (existing.role === 'admin' || strict.role === 'admin') ? 'admin' : 'employee'
      }));
    } else {
      userMap.set(strict.id, strict);
    }
  };

  // Nạp user hiện tại trước để giữ định danh chuẩn
  if (current && current.email && !current.email.endsWith('@theodoisk.com')) {
    addOrMerge(current);
  }

  // Nạp danh sách đã lưu cục bộ
  localList.forEach(u => addOrMerge(u));

  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getFirestore(app);
    const usersColl = collection(db, 'users');
    const snap = await getDocs(usersColl);

    if (!snap.empty) {
      const now = Date.now();
      for (const d of snap.docs) {
        if (d.id === 'usr-admin-01' || d.id === 'usr-employee-01') continue;
        const data = d.data();
        const docEmail = data.email ? String(data.email).trim() : '';
        const docFullName = data.fullName ? String(data.fullName).trim() : '';

        // Tự động đồng bộ và sửa lại doc Firestore nếu trùng UID tài khoản admin hiện tại mà thiếu info
        if (current && d.id === current.id && (!docEmail || !docFullName)) {
          syncUserProfileToFirestore(current).catch(() => {});
        }

        // Bỏ qua doc không có email hợp lệ hoặc email mặc định theodoisk.com
        if (!docEmail || !docEmail.includes('@') || docEmail.endsWith('@theodoisk.com')) {
          continue;
        }

        const username = data.username || docEmail.split('@')[0] || d.id;
        const isAdmin = data.role === 'admin' || data.role === 'manager';
        const lastActiveTime = data.lastActive ? new Date(data.lastActive).getTime() : 0;
        const HEARTBEAT_WINDOW_MS = 60 * 1000; // 60 giây (1 phút): tab chạy nền ping mỗi 12s vẫn online, đóng tab thì 1 phút sau chuyển offline
        const isOnline = Boolean(data.isOnline) && (lastActiveTime > 0 ? (now - lastActiveTime) < HEARTBEAT_WINDOW_MS : false);

        addOrMerge({
          id: d.id,
          username,
          email: docEmail,
          fullName: docFullName || (isAdmin ? 'Quản Trị Viên' : 'Thành Viên'),
          role: isAdmin ? 'admin' : 'employee',
          department: data.department || (isAdmin ? 'Ban Điều Hành & An Toàn Lao Động' : 'Văn Phòng IoT'),
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
          deviceId: data.deviceId || data.device || '',
          sittingMinutes: Number(data.sittingMinutes) || 0,
          bpm: Number(data.bpm) || 0,
          spo2: Number(data.spo2) || 0,
          hasAlert: Boolean(data.hasAlert),
          alertReason: data.alertReason || '',
          lastActive: data.lastActive || ''
        });
      }
    }
  } catch (e) {
    console.warn('Không thể tải danh sách users từ Firestore (sử dụng bộ nhớ cục bộ):', e);
  }

  const finalUsers = Array.from(userMap.values()).map(enforceStrictRole);
  saveLocalUsersCache(finalUsers);
  return finalUsers;
}

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

export async function adminAssignDevice(userId: string, device: string): Promise<boolean> {
  try {
    const cleanDevice = device ? device.trim() : '';

    // Thực hiện gán thiết bị bằng Firestore Transaction kèm assignment_id mới authoritative
    await assignDeviceToUser(userId, cleanDevice);

    // Cập nhật bộ nhớ đệm cục bộ
    const list = getLocalUsersCache();
    
    // 1. Tước thiết bị khỏi bất kỳ tài khoản nào trước đó đang giữ cleanDevice
    if (cleanDevice) {
      list.forEach((u, i) => {
        if (u.id !== userId && (u.device === cleanDevice || u.deviceId === cleanDevice)) {
          list[i] = { ...u, device: '', deviceId: '' };
        }
      });
    }

    // 2. Gán cho userId mới
    const idx = list.findIndex(u => u.id === userId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], device: cleanDevice, deviceId: cleanDevice };
    }
    saveLocalUsersCache(list);

    // 3. Đồng bộ phiên đăng nhập hiện tại nếu bị ảnh hưởng
    const current = getCurrentUser();
    if (current) {
      if (current.id === userId) {
        const updatedCurrent = { ...current, device: cleanDevice, deviceId: cleanDevice };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedCurrent));
      } else if (cleanDevice && (current.device === cleanDevice || current.deviceId === cleanDevice)) {
        // Tài khoản hiện tại bị tước quyền gán thiết bị
        const updatedCurrent = { ...current, device: '', deviceId: '' };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedCurrent));
      }
    }

    return true;
  } catch (err) {
    console.error('Lỗi adminAssignDevice (assignDeviceToUser):', err);
    return false;
  }
}

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

export async function loginWithFirebaseEmail(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();



  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);

    const credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    const fbUser = credential.user;

    // Xác thực quyền quản trị qua Firebase Custom Claim 'admin'
    let isAdmin = false;
    try {
      const tokenResult = await fbUser.getIdTokenResult();
      isAdmin = Boolean(tokenResult.claims.admin === true);
    } catch {}

    const authUser: AuthUser = {
      id: fbUser.uid,
      username: cleanEmail.split('@')[0],
      email: fbUser.email || cleanEmail,
      fullName: fbUser.displayName || (isAdmin ? 'Quản Trị Viên' : 'Nhân Viên Văn Phòng'),
      role: isAdmin ? 'admin' : 'employee',
      department: isAdmin ? 'Ban Điều Hành & An Toàn Lao Động' : 'Phòng Làm Việc Văn Phòng',
      avatar: fbUser.photoURL || undefined,
    };

    saveCurrentUser(authUser);
    syncUserProfileToFirestore(authUser).catch(() => {});
    return { success: true, user: authUser };
  } catch (firebaseErr: any) {
    let msg = 'Tên đăng nhập hoặc mật khẩu không chính xác.';
    if (firebaseErr.code === 'auth/user-not-found' || firebaseErr.code === 'auth/invalid-credential') {
      msg = 'Không tìm thấy tài khoản hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.';
    } else if (firebaseErr.code === 'auth/wrong-password') {
      msg = 'Mật khẩu không chính xác. Vui lòng nhập lại.';
    } else if (firebaseErr.code === 'auth/invalid-email') {
      msg = 'Định dạng Email không hợp lệ.';
    } else if (firebaseErr.code === 'auth/operation-not-allowed') {
      msg = 'Phương thức Email/Password chưa được kích hoạt trên hệ thống.';
    } else if (firebaseErr.code === 'auth/too-many-requests') {
      msg = 'Đã thử quá nhiều lần. Vui lòng đợi trong giây lát.';
    }

    return { success: false, error: msg };
  }
}

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

export async function loginWithCredentials(
  identifier: string,
  pass: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  return loginWithFirebaseEmail(identifier, pass);
}

export function loginAsPreset(_role: UserRole): AuthUser {
  const current = getCurrentUser();
  if (current) return current;
  throw new Error('Chức năng tài khoản mẫu đã bị vô hiệu hóa để bảo đảm an toàn.');
}

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
    // Xác thực quyền admin qua Firebase Custom Claim 'admin' từ ID Token
    let isAdmin = false;
    try {
      const tokenResult = await firebaseUser.getIdTokenResult();
      isAdmin = Boolean(tokenResult.claims.admin === true);
    } catch {}

    const googleUser: AuthUser = {
      id: firebaseUser.uid,
      username: email ? email.split('@')[0] : 'google_user',
      email: email,
      fullName: firebaseUser.displayName || (isAdmin ? 'Quản Trị Viên' : 'Thành Viên Google'),
      role: isAdmin ? 'admin' : 'employee',
      avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      department: isAdmin ? 'Ban Quản Trị Hệ Thống' : 'Phòng Làm Việc Văn Phòng',
    };

    saveCurrentUser(googleUser);
    syncUserProfileToFirestore(googleUser).catch(() => {});
    return { success: true, user: googleUser };
  } catch (err: any) {
    let errorMessage = 'Không thể kết nối với Google. Vui lòng thử lại.';
    let isUnauthorizedDomain = false;
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

    if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
      errorMessage = `Tên miền hiện tại ("${currentDomain}") chưa được cấp phép trong Firebase Auth (Settings → Authorized domains).`;
      isUnauthorizedDomain = true;
    } else if (err.code === 'auth/configuration-not-found' || err.message?.includes('configuration-not-found')) {
      errorMessage = 'Dự án Firebase chưa bật nhà cung cấp Google trong Firebase Console.';
    } else if (err.code === 'auth/popup-blocked') {
      errorMessage = 'Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cho phép popup.';
    } else if (err.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.';
    } else if (err.code === 'auth/cancelled-popup-request') {
      errorMessage = 'Yêu cầu đăng nhập Google đã bị hủy.';
    } else if (err.message) {
      errorMessage = err.message;
    }
    return { success: false, error: errorMessage, canQuickFallback: false, isUnauthorizedDomain, currentDomain };
  }
}

let recaptchaVerifier: RecaptchaVerifier | null = null;

export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  const config = getSavedFirebaseConfig();
  const app = initializeFirebaseApp(config);
  const auth = getAuth(app);

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        recaptchaVerifier = null;
      }
    });
  }
  return recaptchaVerifier;
}

export async function sendPhoneVerificationCode(
  phoneNumber: string,
  containerId = 'recaptcha-container'
): Promise<{ success: boolean; confirmationResult?: ConfirmationResult; error?: string; canFallback?: boolean }> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);

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
    let msg = 'Không thể gửi mã SMS. Vui lòng kiểm tra số điện thoại.';
    if (err.code === 'auth/invalid-phone-number') {
      msg = 'Số điện thoại không đúng định dạng. Ví dụ hợp lệ: 0912345678 hoặc +84912345678';
    } else if (err.code === 'auth/operation-not-allowed') {
      msg = 'Firebase Authentication chưa bật tính năng Xác thực qua Số điện thoại.';
    } else if (err.code === 'auth/quota-exceeded') {
      msg = 'Hạn ngạch gửi tin nhắn SMS của Firebase đã vượt mức hôm nay.';
    } else if (err.message) {
      msg = err.message;
    }
    return { success: false, error: msg, canFallback: false };
  }
}

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
    let msg = 'Mã xác thực OTP không chính xác hoặc đã hết hạn.';
    if (err.code === 'auth/invalid-verification-code') {
      msg = 'Mã xác thực OTP không đúng. Vui lòng kiểm tra tin nhắn.';
    } else if (err.code === 'auth/code-expired') {
      msg = 'Mã xác thực đã hết hạn. Vui lòng bấm gửi lại mã.';
    }
    return { success: false, error: msg };
  }
}

export async function refreshCurrentUserClaims(): Promise<AuthUser | null> {
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const auth = getAuth(app);
    const fbUser = auth.currentUser;
    if (!fbUser) return null;
    const tokenResult = await fbUser.getIdTokenResult(true);
    const isAdmin = Boolean(tokenResult.claims.admin === true);
    const current = getCurrentUser();
    if (current && current.id === fbUser.uid) {
      const updated: AuthUser = {
        ...current,
        role: isAdmin ? 'admin' : (current.role === 'admin' ? 'employee' : current.role),
      };
      saveCurrentUser(updated);
      return updated;
    }
  } catch (e) {
    console.warn('Lỗi làm mới token claim:', e);
  }
  return null;
}
