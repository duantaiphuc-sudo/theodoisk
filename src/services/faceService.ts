import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';
import { FaceTemplate, AuthUser } from '../types';

const SNAPSHOT_STORAGE_PREFIX = 'theodoisk_face_snapshot_';
const AUTH_STORAGE_KEY = 'theodoisk_authenticated_user_v1';

/**
 * Kiểm tra tài khoản đã đăng ký mẫu khuôn mặt (YuNet + SFace) chưa
 */
export async function checkHasFaceTemplate(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    const snap = await getDoc(docRef);
    if (snap.exists() && Boolean(snap.data()?.enabled)) {
      return true;
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra mẫu khuôn mặt từ Firestore:', err);
  }

  // Fallback cache
  try {
    const cached = localStorage.getItem(SNAPSHOT_STORAGE_PREFIX + userId);
    if (cached) return true;
  } catch {}

  return false;
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
        enabled: Boolean(data.enabled),
        updated_at: data.updated_at,
        image: data.image || data.photo_url || data.snapshot || undefined,
        snapshot: data.snapshot || data.image || undefined,
      };
    }
  } catch (err) {
    console.warn('Lỗi tải mẫu khuôn mặt từ Firestore:', err);
  }

  // Nếu chưa có ảnh trong face_templates, thử tìm trong users/{userId}
  let fallbackImage: string | undefined = templateData?.image;
  if (!fallbackImage) {
    try {
      const config = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(config);
      const db = getFirestore(app);
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const udata = userSnap.data();
        if (udata.avatar && typeof udata.avatar === 'string' && udata.avatar.length > 50) {
          fallbackImage = udata.avatar;
        } else if (udata.faceSnapshot && typeof udata.faceSnapshot === 'string') {
          fallbackImage = udata.faceSnapshot;
        }
      }
    } catch {}
  }

  // Fallback cuối cùng: localStorage
  if (!fallbackImage) {
    try {
      const cached = localStorage.getItem(SNAPSHOT_STORAGE_PREFIX + userId);
      if (cached) fallbackImage = cached;
    } catch {}
  }

  if (templateData) {
    return {
      userId: templateData.userId || userId,
      model: templateData.model || 'opencv_sface_2021dec',
      schema_version: templateData.schema_version || 1,
      sample_count: templateData.sample_count || 1,
      embedding: templateData.embedding || [],
      enabled: templateData.enabled !== undefined ? templateData.enabled : true,
      updated_at: templateData.updated_at,
      image: fallbackImage,
      snapshot: fallbackImage,
    };
  }

  // Nếu không có document face_templates nhưng có ảnh lưu trữ fallback
  if (fallbackImage) {
    return {
      userId,
      model: 'opencv_sface_2021dec',
      schema_version: 1,
      sample_count: 1,
      embedding: [],
      enabled: true,
      image: fallbackImage,
      snapshot: fallbackImage,
    };
  }

  return null;
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
      if (u && (u.id === userId || !u.avatar)) {
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

    // 2. Đồng bộ vào collection users để profile hiển thị ngay
    try {
      const usersDb = getFirestore(app);
      const userRef = doc(usersDb, 'users', userId);
      await setDoc(userRef, {
        avatar: imageBase64,
        faceSnapshot: imageBase64,
        hasFaceEnrolled: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
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
