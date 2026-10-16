import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebaseApp, getSavedFirebaseConfig, getAppFirestore } from './firebase';
import { FaceTemplate } from '../types';

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
    return snap.exists() && Boolean(snap.data()?.enabled);
  } catch (err) {
    console.warn('Lỗi kiểm tra mẫu khuôn mặt:', err);
    return false;
  }
}

/**
 * Lấy dữ liệu mẫu khuôn mặt của tài khoản
 */
export async function fetchFaceTemplate(userId: string): Promise<FaceTemplate | null> {
  if (!userId) return null;
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      userId,
      model: data.model || 'opencv_sface_2021dec',
      schema_version: Number(data.schema_version) || 1,
      sample_count: Number(data.sample_count) || 1,
      embedding: Array.isArray(data.embedding) ? data.embedding : [],
      enabled: Boolean(data.enabled),
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.warn('Lỗi tải mẫu khuôn mặt:', err);
    return null;
  }
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
 * Xóa mẫu khuôn mặt khỏi Firestore
 */
export async function deleteFaceTemplate(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const config = getSavedFirebaseConfig();
    const app = initializeFirebaseApp(config);
    const db = getAppFirestore(app, config);
    const docRef = doc(db, 'face_templates', userId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Lỗi xóa mẫu khuôn mặt:', err);
    return false;
  }
}
