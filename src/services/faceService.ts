import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';
import { FaceTemplate, AuthUser } from '../types';

const SNAPSHOT_STORAGE_PREFIX = 'theodoisk_face_snapshot_';
const AUTH_STORAGE_KEY = 'theodoisk_authenticated_user_v1';

export interface FaceTemplateStatus {
  hasDoc: boolean;
  hasVector: boolean;
  hasImage: boolean;
  vectorDim: number;
  model: string;
  image?: string;
  enabled: boolean;
}

/**
 * Kiểm tra chi tiết trạng thái mẫu khuôn mặt: đã có vector 128D hay chỉ có ảnh chụp
 */
export async function checkFaceTemplateStatus(userId: string): Promise<FaceTemplateStatus> {
  if (!userId) {
    return { hasDoc: false, hasVector: false, hasImage: false, vectorDim: 0, model: '', enabled: false };
  }

  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const embedding = Array.isArray(data.embedding) ? data.embedding : [];
      const img = data.image || data.photo_url || data.snapshot || undefined;
      const hasVector = embedding.length === 128;
      const enabled = Boolean(data.enabled !== false);

      return {
        hasDoc: true,
        hasVector,
        hasImage: Boolean(img),
        vectorDim: embedding.length,
        model: String(data.model || 'opencv_sface_2021dec'),
        image: img,
        enabled,
      };
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra chi tiết mẫu khuôn mặt từ Firestore:', err);
  }

  // Nếu không có document trong face_templates -> Chưa đăng ký mẫu
  return {
    hasDoc: false,
    hasVector: false,
    hasImage: false,
    vectorDim: 0,
    model: 'opencv_sface_2021dec',
    image: undefined,
    enabled: false,
  };
}

/**
 * Kiểm tra tài khoản đã đăng ký mẫu khuôn mặt (YuNet + SFace) chưa
 */
export async function checkHasFaceTemplate(userId: string): Promise<boolean> {
  const status = await checkFaceTemplateStatus(userId);
  return status.hasDoc && status.enabled;
}

/**
 * Lấy dữ liệu mẫu khuôn mặt của tài khoản
 */
export async function fetchFaceTemplate(userId: string): Promise<FaceTemplate | null> {
  if (!userId) return null;
  let templateData: Partial<FaceTemplate> | null = null;

  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      templateData = {
        userId,
        model: data.model || 'opencv_sface_2021dec',
        schema_version: Number(data.schema_version) || 1,
        sample_count: Number(data.sample_count) || 1,
        embedding: Array.isArray(data.embedding) ? data.embedding : [],
        enabled: Boolean(data.enabled !== false),
        updated_at: data.updated_at,
        image: data.image || data.photo_url || data.snapshot || undefined,
        snapshot: data.snapshot || data.image || undefined,
      };
    }
  } catch (err) {
    console.warn('Lỗi tải mẫu khuôn mặt từ Firestore:', err);
  }

  // Nếu người dùng KHÔNG có document face_templates trong Firestore -> Chưa có mẫu khuôn mặt!
  // Tuyệt đối KHÔNG lấy avatar (ảnh đại diện người dùng) để thay thế!
  if (!templateData) {
    return null;
  }

  // Nếu có document face_templates nhưng trường image/snapshot bị trống,
  // chỉ kiểm tra xem users/{userId} có lưu ảnh trích xuất chuyên dụng `faceSnapshot` hay không.
  // Tuyệt đối không lấy `avatar` (ảnh đại diện cá nhân)!
  let faceImage = templateData.image || templateData.snapshot;
  if (!faceImage) {
    try {
      const config = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(config);
      const db = getFirestore(app);
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const udata = userSnap.data();
        if (udata.faceSnapshot && typeof udata.faceSnapshot === 'string') {
          faceImage = udata.faceSnapshot;
        }
      }
    } catch {}
  }

  return {
    userId: templateData.userId || userId,
    model: templateData.model || 'opencv_sface_2021dec',
    schema_version: templateData.schema_version || 1,
    sample_count: templateData.sample_count || 1,
    embedding: templateData.embedding || [],
    enabled: templateData.enabled !== undefined ? templateData.enabled : true,
    updated_at: templateData.updated_at,
    image: faceImage,
    snapshot: faceImage,
  };
}

/**
 * Cập nhật hoặc lưu mẫu vector khuôn mặt 128D
 */
export async function saveFaceTemplate(
  userId: string,
  embedding: number[],
  model: string = 'opencv_sface_2021dec'
): Promise<boolean> {
  if (!userId || !Array.isArray(embedding) || embedding.length === 0) return false;
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    await setDoc(docRef, {
      userId,
      model,
      schema_version: 1,
      sample_count: 5,
      embedding,
      enabled: true,
      updated_at: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('Lỗi lưu mẫu khuôn mặt:', err);
    return false;
  }
}

/**
 * Lưu trực tiếp ảnh chụp khuôn mặt (Base64 JPEG) lên Firestore face_templates & users
 */
export async function saveFaceSnapshot(
  userId: string,
  imageBase64: string,
  model: string = 'opencv_sface_2021dec'
): Promise<boolean> {
  if (!userId || !imageBase64) return false;

  // Luôn lưu vào LocalStorage để lập tức hiển thị không bao giờ mất
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_PREFIX + userId, imageBase64);
    const rawAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (rawAuth) {
      const u: AuthUser = JSON.parse(rawAuth);
      if (u && !u.avatar) {
        u.avatar = imageBase64;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
      }
    }
  } catch (e) {
    console.warn('Lỗi lưu ảnh vào localStorage:', e);
  }

  // Lưu lên Firestore
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);

    // 1. Lưu vào face_templates
    const docRef = doc(db, 'face_templates', userId);
    await setDoc(docRef, {
      userId,
      model,
      image: imageBase64,
      snapshot: imageBase64,
      photo_url: imageBase64,
      enabled: true,
      updated_at: serverTimestamp(),
    }, { merge: true });

    // 2. Đồng bộ vào collection users (Lưu riêng faceSnapshot, không ghi đè avatar đã có của người dùng)
    try {
      const usersDb = getFirestore(app);
      const userRef = doc(usersDb, 'users', userId);
      const userSnap = await getDoc(userRef);
      const userUpdate: Record<string, any> = {
        faceSnapshot: imageBase64,
        hasFaceEnrolled: true,
        updatedAt: new Date().toISOString()
      };
      if (userSnap.exists() && !userSnap.data()?.avatar) {
        userUpdate.avatar = imageBase64;
      }
      await setDoc(userRef, userUpdate, { merge: true });
    } catch (userSyncErr) {
      console.warn('Cảnh báo đồng bộ avatar user:', userSyncErr);
    }

    return true;
  } catch (err) {
    console.error('Lỗi lưu ảnh chụp khuôn mặt lên Firestore:', err);
    // Vẫn trả về true nếu đã lưu thành công vào localStorage
    return true;
  }
}

/**
 * Xóa mẫu khuôn mặt khỏi Firestore và bộ nhớ tạm
 */
export async function deleteFaceTemplate(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    localStorage.removeItem(SNAPSHOT_STORAGE_PREFIX + userId);
  } catch {}

  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    await deleteDoc(docRef);

    try {
      const usersDb = getFirestore(app);
      const userRef = doc(usersDb, 'users', userId);
      await setDoc(userRef, {
        hasFaceEnrolled: false,
        faceSnapshot: null,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch {}

    return true;
  } catch (err) {
    console.error('Lỗi xóa mẫu khuôn mặt:', err);
    return false;
  }
}
