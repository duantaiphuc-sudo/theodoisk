import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Type, ThinkingLevel, type FunctionDeclaration } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert as adminCert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { calculateOHPSFromLogs, type RawTelemetryLog, type TaskItem, type OHPSCalculationResult } from './src/utils/ohpsCalculator.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Process safety: Prevent uncaught exceptions from killing the dev server
process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Health check endpoint for container pre-warming
app.get(['/api/health', '/health'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

// Body limit allows up to 1mb for compressed Pi 4 camera snapshots while preventing DoS
app.use(express.json({ limit: '1mb' }));

// 1. Initialize Firebase Admin SDK for Zero-Trust ID Token Verification
let firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
if (!firebaseProjectId) {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      firebaseProjectId = cfg.projectId;
    }
  } catch {}
}

if (getAdminApps().length === 0) {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      initAdminApp({
        credential: adminCert(serviceAccount),
        projectId: firebaseProjectId || serviceAccount.project_id,
      });
      console.log('✅ Firebase Admin đã khởi tạo với Service Account key');
    } catch (e) {
      console.warn('⚠️ Lỗi nạp service account key, chuyển sang cấu hình projectId:', e);
      initAdminApp({ projectId: firebaseProjectId || 'theodoisk-66ddb' });
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initAdminApp();
    console.log('✅ Firebase Admin đã khởi tạo từ GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    initAdminApp({
      projectId: firebaseProjectId || 'theodoisk-66ddb',
    });
    console.log(`✅ Firebase Admin đã khởi tạo với Project ID: ${firebaseProjectId || 'theodoisk-66ddb'}`);
  }
}

// 2. Auth Helper: Verify Firebase Bearer Token
interface AuthContext {
  uid: string;
  email?: string;
  email_verified?: boolean;
  admin: boolean;
}

async function verifyAuthToken(req: Request, res: Response): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Yêu cầu Header Authorization: Bearer <Firebase ID token>' });
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    res.status(401).json({ error: 'ID token rỗng' });
    return null;
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    let isAdminUser = Boolean(
      decoded.admin === true || 
      decoded.email?.toLowerCase() === 'duantaiphuc@gmail.com' ||
      decoded.email?.toLowerCase() === 'nguyentai51.2k4@gmail.com'
    );

    if (!isAdminUser) {
      try {
        const userDoc = await getAdminFirestore().collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          const role = userDoc.data()?.role;
          if (role === 'admin' || role === 'manager') {
            isAdminUser = true;
          }
        }
      } catch (err) {
        // Fallback: check email domain or ignore
      }
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      admin: isAdminUser,
    };
  } catch (err: any) {
    res.status(401).json({ 
      error: 'ID token không hợp lệ hoặc đã hết hạn', 
      details: err?.message || 'Unauthorized' 
    });
    return null;
  }
}

// 3. Dynamic GoogleGenAI SDK Helper (reads live env key & strips accidental whitespace/quotes)
function getResolvedGeminiApiKey(): string {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '';
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (
    !cleaned ||
    cleaned === 'MY_GEMINI_API_KEY' ||
    cleaned === 'YOUR_GEMINI_API_KEY' ||
    cleaned === 'YOUR_API_KEY'
  ) {
    return '';
  }
  return cleaned;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getResolvedGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// 4. Initialize Supabase Client (Supports Service Role Key or Anon Key for query fallback)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  '';
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) 
  : null;

// Dynamic Supabase client resolver: Priority 1: Server Env, Priority 2: Request Headers, Priority 3: Request Body
function resolveSupabaseClient(req: Request) {
  if (supabase) return supabase;
  const headerUrl = (req.headers['x-supabase-url'] as string) || '';
  const headerKey = (req.headers['x-supabase-key'] as string) || '';
  const bodyCfg = (req.body as any)?.supabaseConfig;
  const url = (headerUrl || bodyCfg?.url || '').trim();
  const key = (headerKey || bodyCfg?.anonKey || '').trim();
  if (url && key) {
    try {
      return createClient(url, key, { auth: { persistSession: false } });
    } catch (e) {
      console.warn('Lỗi khởi tạo client Supabase động từ request:', e);
    }
  }
  return null;
}

// Helper: Loại bỏ toàn bộ emoji và biểu tượng đồ họa khỏi văn bản phản hồi
function stripAllEmojis(text: string): string {
  if (!text) return '';
  return text
    // Dải mã Unicode cho Emoji, Pictograph, Transport, Emoticon, Symbols
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2388}\u{200D}\u{FE0F}]/gu, '')
    // Các ký tự biểu tượng thường gặp
    .replace(/[👋📊💡⏱️⚠️✅🩺📋⭐🚶❤️🫁🦴📐🛠️🔌⚪🟢🛡️🙏🧘🦾]/g, '')
    // Chuẩn hóa khoảng trắng sau khi bỏ emoji
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Disclaimer Y tế & Công thái học (Chỉ đính kèm có chọn lọc vào câu trả lời bệnh lý/y khoa)
const MEDICAL_DISCLAIMER = '\n\n---\n*Lưu ý: Kết quả mang tính chất tham khảo về công thái học và theo dõi thói quen, không thay thế tư vấn y tế chuyên nghiệp từ bác sĩ.*';

// Rate limiting in-memory store for AI Chatbot requests by UID (20 requests / min)
const chatRateLimits = new Map<string, { count: number; resetAt: number }>();

// Endpoint Chatbot AI Công Thái Học & Thói Quen Sức Khỏe
app.post(['/api/chat', '/chat'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return; // 401 already sent

  // Rate Limiting by UID (20 requests / min)
  const now = Date.now();
  const userRate = chatRateLimits.get(authUser.uid) || { count: 0, resetAt: now + 60000 };
  if (now > userRate.resetAt) {
    userRate.count = 0;
    userRate.resetAt = now + 60000;
  }
  if (userRate.count >= 20) {
    return res.status(429).json({ 
      error: 'Bạn đã đạt giới hạn gửi tin nhắn (tối đa 20 yêu cầu/phút). Vui lòng thử lại sau.' 
    });
  }
  userRate.count++;
  chatRateLimits.set(authUser.uid, userRate);

  try {
    const { 
      query, 
      telemetry, 
      history = [], 
      timeStats, 
      userName = 'Người dùng',
      targetMemberName,
      targetMemberId,
      allUsers = [],
      conversationHistory = [],
      bonusPolicy,
      bonusResult,
      ohpsData,
      tasks: clientTasks = [],
      userProfile,
      predictiveSummary,
      image,
      thresholds
    } = req.body;

  // Validate query
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Thiếu nội dung câu hỏi (query)' });
  }
  if (query.length > 1000) {
    return res.status(400).json({ error: 'Nội dung câu hỏi quá dài (tối đa 1000 ký tự)' });
  }

  // KHÔNG nhận role, userId từ req.body để quyết định quyền!
  // Quyền lấy trực tiếp từ custom claim admin trên server
  const isAdmin = authUser.admin;
  const callerUid = authUser.uid;

  // 1. Lấy dữ liệu thực tế an toàn từ Supabase
  let supabaseLogs: any[] = [];
  const reqSupabaseConfig = req.body.supabaseConfig;
  let activeSupabase = supabase;
  if (!activeSupabase && reqSupabaseConfig?.url && reqSupabaseConfig?.anonKey) {
    try {
      activeSupabase = createClient(reqSupabaseConfig.url, reqSupabaseConfig.anonKey, { auth: { persistSession: false } });
    } catch (e) {
      console.warn('Lỗi khởi tạo Supabase từ client config:', e);
    }
  }

  let supabaseStatsSummary = '';
  if (activeSupabase) {
    try {
      let q = activeSupabase
        .from('telemetry_logs')
        .select('id, user_id, user_name, user_email, bpm, spo2, posture_status, posture_label, has_alert, created_at')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        // Người dùng thường: tìm theo user_id hoặc email
        if (authUser.email) {
          q = q.or(`user_id.eq.${callerUid},user_email.ilike.${authUser.email.toLowerCase().trim()}`).limit(100);
        } else {
          q = q.eq('user_id', callerUid).limit(100);
        }
      } else {
        // Admin: Cho phép xem thành viên được chọn hoặc toàn bộ
        if (targetMemberId && targetMemberId !== 'all') {
          q = q.eq('user_id', targetMemberId).limit(100);
        } else if (targetMemberName && targetMemberName !== 'all') {
          q = q.ilike('user_name', `%${targetMemberName}%`).limit(100);
        } else {
          // Kiểm tra xem trong câu hỏi Admin có nhắc tên nhân viên không
          const mentionedUser = Array.isArray(allUsers) 
            ? allUsers.find((u: any) => {
                const name = (u.fullName || u.username || '').toLowerCase();
                return name && name.length >= 3 && query.toLowerCase().includes(name);
              })
            : null;

          if (mentionedUser) {
            const { data: specificData } = await activeSupabase
              .from('telemetry_logs')
              .select('id, user_id, user_name, user_email, bpm, spo2, posture_status, posture_label, has_alert, created_at')
              .eq('user_id', mentionedUser.id)
              .order('created_at', { ascending: false })
              .limit(80);
            
            if (specificData && specificData.length > 0) {
              supabaseLogs.push(...specificData);
            }
          }
          q = q.limit(150);
        }
      }

      const { data } = await q;
      if (data && data.length > 0) {
        supabaseLogs.push(...data);
        const validBpm = data.filter((r: any) => Number(r.bpm) > 0);
        const validSpo2 = data.filter((r: any) => Number(r.spo2) > 0);
        const goodCount = data.filter((r: any) => r.posture_status === 0 || String(r.posture_label).toLowerCase().includes('đúng')).length;
        const alertCount = data.filter((r: any) => Boolean(r.has_alert)).length;
        const avgBpm = validBpm.length > 0 ? Math.round(validBpm.reduce((acc: number, r: any) => acc + Number(r.bpm), 0) / validBpm.length) : 0;
        const avgSpo2 = validSpo2.length > 0 ? Math.round(validSpo2.reduce((acc: number, r: any) => acc + Number(r.spo2), 0) / validSpo2.length) : 0;

        supabaseStatsSummary = `
- Nguồn cơ sở dữ liệu: Supabase PostgreSQL (Bảng: telemetry_logs)
- Số bản ghi truy xuất: ${data.length} bản ghi
- Thống kê lịch sử Supabase: Tỷ lệ tư thế chuẩn: ${Math.round((goodCount / data.length) * 100)}% | Nhịp tim TB: ${avgBpm} BPM | SpO2 TB: ${avgSpo2}% | Tổng số cảnh báo nguy cơ: ${alertCount} lần
`;
      }
    } catch (e) {
      console.warn('Lỗi đọc log Supabase:', e);
    }
  }

  // Giới hạn số lượng history logs từ client truyền lên (tối đa 40)
  const clientHistory = Array.isArray(history) ? history.slice(0, 40) : [];

  // Ghép nối và lọc logs
  const combinedLogs: any[] = [];
  const seen = new Set<string>();

  supabaseLogs.forEach((row) => {
    const key = row.id ? String(row.id) : `${row.user_id}_${row.created_at}`;
    if (!seen.has(key)) {
      seen.add(key);
      const d = new Date(row.created_at);
      combinedLogs.push({
        id: row.id,
        userName: row.user_name || row.user_id || 'Thành viên',
        userEmail: row.user_email,
        userId: row.user_id,
        timeStr: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dateStr: d.toLocaleDateString('vi-VN'),
        timestamp: row.created_at,
        posture: row.posture_label || (row.posture_status === 0 ? 'Tư thế ĐÚNG' : 'Tư thế SAI (Cúi gù)'),
        postureStatus: row.posture_status,
        bpm: row.bpm || 0,
        spo2: row.spo2 || 0,
        hasAlert: row.has_alert,
      });
    }
  });

  clientHistory.forEach((h: any) => {
    // Nếu không phải admin, chỉ nhận log của chính uid của họ
    if (!isAdmin && h.userId && h.userId !== callerUid) return;

    const key = h.id ? String(h.id) : `${h.userId || callerUid}_${h.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      combinedLogs.push({
        id: h.id,
        userName: h.userName || userName,
        userEmail: h.userEmail,
        userId: h.userId || callerUid,
        timeStr: h.timeFormatted || new Date(h.timestamp).toLocaleTimeString('vi-VN'),
        dateStr: h.dateFormatted || new Date(h.timestamp).toLocaleDateString('vi-VN'),
        timestamp: h.timestamp,
        posture: h.postureLabel,
        postureStatus: h.postureStatus,
        bpm: h.bpm || 0,
        spo2: h.spo2 || 0,
        hasAlert: h.hasAlert,
      });
    }
  });

  combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Thống kê từng thành viên (Dành riêng cho Admin)
  const memberStatsMap: Record<string, any> = {};
  if (isAdmin) {
    combinedLogs.forEach((l) => {
      const key = l.userId || l.userName;
      if (!memberStatsMap[key]) {
        memberStatsMap[key] = {
          userName: l.userName,
          userEmail: l.userEmail,
          total: 0,
          good: 0,
          bad: 0,
          standing: 0,
          alerts: 0,
          sumBpm: 0,
          countBpm: 0,
          sumSpo2: 0,
          countSpo2: 0,
          latestPosture: l.posture,
          latestTime: `${l.timeStr} ${l.dateStr}`
        };
      }
      const stat = memberStatsMap[key];
      stat.total++;
      if (l.postureStatus === 0) stat.good++;
      if (l.postureStatus === 1 || l.postureStatus === 3) stat.bad++;
      if (l.postureStatus === 5) stat.standing++;
      if (l.hasAlert) stat.alerts++;
      if (l.bpm > 0) {
        stat.sumBpm += l.bpm;
        stat.countBpm++;
      }
      if (l.spo2 > 0) {
        stat.sumSpo2 += l.spo2;
        stat.countSpo2++;
      }
    });
  }

  const memberSummaryReport = Object.values(memberStatsMap).map(s => {
    const goodRatio = s.total > 0 ? Math.round((s.good / s.total) * 100) : 0;
    const avgBpm = s.countBpm > 0 ? Math.round(s.sumBpm / s.countBpm) : 0;
    const avgSpo2 = s.countSpo2 > 0 ? Number((s.sumSpo2 / s.countSpo2).toFixed(1)) : 0;
    return `- Thành viên: **${s.userName}** (${s.userEmail || 'Chưa có email'}) | Tổng bản ghi: ${s.total} | Ngồi đúng: ${s.good} (${goodRatio}%) | Ngồi sai/gù: ${s.bad} | Cảnh báo: ${s.alerts} lần | Nhịp tim TB: ${avgBpm > 0 ? `${avgBpm} BPM` : 'N/A'} | SpO2 TB: ${avgSpo2 > 0 ? `${avgSpo2}%` : 'N/A'} | Trạng thái gần nhất: "${s.latestPosture}" lúc ${s.latestTime}`;
  }).join('\n');

  const historySnippet = combinedLogs.slice(0, 40).map((h, i) => {
    return `[#${i + 1}] UID: ${h.userId} (${h.userName}) | Lúc: ${h.timeStr} ngày ${h.dateStr} | Tư thế: ${h.posture} (Mã: ${h.postureStatus}) | Nhịp tim: ${h.bpm} BPM | SpO2: ${h.spo2}% | Cảnh báo: ${h.hasAlert ? 'CÓ (Nguy cơ)' : 'Bình thường'}`;
  }).join('\n');

  const liveState = telemetry ? `
- Trạng thái trực tiếp của phiên hiện tại (${userName}):
  + Nhịp tim: ${telemetry.bpm} BPM
  + Nồng độ SpO2: ${telemetry.spo2}%
  + Tư thế hiện tại: ${telemetry.postureLabel} (Mã: ${telemetry.postureStatus})
  + Góc nghiêng cổ: ${telemetry.angleNeck ?? 'chưa có'}°
  + Vùng quan sát camera: ${telemetry.inZone ? 'Trong vùng' : 'Ngoài vùng'}
  + Cảnh báo: ${telemetry.postureWarning || (telemetry.hasAlert ? 'Đang có cảnh báo tư thế' : 'Không có')}
` : '- Hiện chưa có gói tin telemetry trực tiếp.';

  const timeContext = timeStats ? `
- Thống kê thời gian làm việc hôm nay:
  + Tổng thời gian ngồi: ${Math.floor((timeStats.sittingSeconds || 0) / 60)} phút
  + Thời gian ngồi sai/gù: ${Math.floor((timeStats.badPostureSeconds || 0) / 60)} phút
  + Thời gian đứng/vận động: ${Math.floor(((timeStats.standingSeconds || 0) + (timeStats.movingSeconds || 0)) / 60)} phút
` : '- Hiện chưa có dữ liệu thời gian làm việc.';

  // 2. TÍNH ĐIỂM NĂNG SUẤT TỔNG HỢP (OHPS) & LẤY NHẬT KÝ CHI TIẾT
  const targetUserId = (isAdmin && targetMemberId && targetMemberId !== 'all') 
    ? targetMemberId 
    : (req.body.userId || callerUid);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Query danh sách task được giao cho user từ Supabase (sử dụng activeSupabase)
  let userTasksList: TaskItem[] = [];
  let detailedTasksList: Array<{ id: string; title: string; status: string; priority?: string; deadline?: string }> = [];
  if (activeSupabase) {
    try {
      const { data: tasksData } = await activeSupabase
        .from('tasks')
        .select('id, title, status, priority, deadline, assigned_to')
        .eq('assigned_to', targetUserId);
      if (tasksData && tasksData.length > 0) {
        userTasksList = tasksData.map((t: any) => ({
          id: String(t.id),
          status: t.status === 'completed' ? 'completed' : 'pending',
          assigned_to: String(t.assigned_to)
        }));
        detailedTasksList = tasksData.map((t: any) => ({
          id: String(t.id),
          title: String(t.title || 'Nhiệm vụ'),
          status: String(t.status || 'pending'),
          priority: t.priority ? String(t.priority) : 'normal',
          deadline: t.deadline ? String(t.deadline) : undefined,
        }));
      }
    } catch (err) {
      console.warn('Lỗi query tasks từ Supabase:', err);
    }
  }

  // Merge thêm danh sách task từ client Firestore nếu Supabase chưa đồng bộ đủ
  if (Array.isArray(clientTasks) && clientTasks.length > 0) {
    const seenTaskIds = new Set(detailedTasksList.map(t => t.id));
    clientTasks.forEach((ct: any) => {
      const tid = String(ct.id || ct.title || '');
      if (tid && !seenTaskIds.has(tid)) {
        seenTaskIds.add(tid);
        detailedTasksList.push({
          id: tid,
          title: String(ct.title || 'Nhiệm vụ'),
          status: String(ct.status || 'pending'),
          priority: ct.priority ? String(ct.priority) : 'normal',
          deadline: ct.deadline ? String(ct.deadline) : undefined,
        });
      }
      if (ct.id && !userTasksList.some(u => u.id === String(ct.id))) {
        userTasksList.push({
          id: String(ct.id),
          status: ct.status === 'completed' ? 'completed' : 'pending',
          assigned_to: String(ct.targetUserId || targetUserId),
        });
      }
    });
  }

  // Chuẩn bị danh sách telemetry logs cho user cần tính toán OHPS (ưu tiên top 50 log mới nhất)
  const rawLogsForOHPS: RawTelemetryLog[] = combinedLogs
    .filter(l => !l.userId || l.userId === targetUserId)
    .slice(0, 50)
    .map(l => ({
      id: l.id,
      created_at: l.timestamp || new Date().toISOString(),
      user_id: targetUserId,
      bpm: Number(l.bpm) || 0,
      spo2: Number(l.spo2) || 0,
      posture_status: l.postureStatus,
      posture_label: l.posture || (l.postureStatus === 0 ? 'Đúng' : 'Sai tư thế')
    }));

  const completedBreaks = Math.max(1, Math.floor(((Number(timeStats?.standingSeconds) || 0) + (Number(timeStats?.movingSeconds) || 0)) / 60));
  const computedOhps = calculateOHPSFromLogs(rawLogsForOHPS, userTasksList, 4, completedBreaks, 100, isAdmin ? 'admin' : 'employee', targetUserId);
  const ohpsResult: OHPSCalculationResult =
    rawLogsForOHPS.length === 0 && ohpsData && typeof ohpsData.ohpsScore === 'number'
      ? ohpsData
      : computedOhps;

  // Lưu hoặc cập nhật (UPSERT) kết quả vào bảng daily_ohps_summary trên Supabase
  if (activeSupabase && rawLogsForOHPS.length > 0) {
    try {
      await activeSupabase.from('daily_ohps_summary').upsert({
        user_id: targetUserId,
        date: todayStr,
        posture_score: ohpsResult.breakdown.S_posture,
        break_score: ohpsResult.breakdown.S_break,
        vital_score: ohpsResult.breakdown.S_vital,
        task_score: ohpsResult.breakdown.S_task,
        hes_score: ohpsResult.hesScore,
        ts_score: ohpsResult.taskScore,
        ohps_score: ohpsResult.ohpsScore,
        data_confidence: ohpsResult.dataConfidence,
        has_vital_data: ohpsResult.hasVitalData,
      }, { onConflict: 'user_id,date' });
    } catch (upsertErr) {
      console.warn('Lỗi upsert bảng daily_ohps_summary trên Supabase:', upsertErr);
    }
  }

  // Danh sách 40 log gần nhất dạng JSON rút gọn: created_at, bpm, spo2, posture_label
  const recentLogsJson = JSON.stringify(
    rawLogsForOHPS.slice(0, 40).map(l => ({
      created_at: l.created_at,
      bpm: l.bpm,
      spo2: l.spo2,
      posture_label: l.posture_label
    })),
    null,
    2
  );

  const bonusContextStr = bonusPolicy
    ? `=== CHÍNH SÁCH THƯỞNG CÔNG THÁI HỌC & MỨC THƯỞNG ===
- Công ty: ${bonusPolicy.companyName || 'Công ty'} | Chu kỳ: ${bonusPolicy.cycle === 'daily' ? 'Hàng ngày' : bonusPolicy.cycle === 'weekly' ? 'Hàng tuần' : 'Hàng tháng'}
- Mức thưởng tối đa: ${Number(bonusPolicy.maxRewardAmount || 0).toLocaleString('vi-VN')} VNĐ | Điểm sàn: ${bonusPolicy.minScoreToReward}đ
- Tiền thưởng ước tính hiện tại: +${Number(bonusResult?.totalReward || 0).toLocaleString('vi-VN')} VNĐ (${bonusResult?.achievementRate || 0}% hạn mức) | Xếp loại: ${bonusResult?.tierAchieved?.tierName || (bonusResult?.isEligible ? 'Đạt chuẩn' : 'Chưa đạt sàn')}
- Gợi ý tăng thưởng: ${bonusResult?.tipsToReachNextTier || 'Duy trì tư thế thẳng và đứng nghỉ định kỳ.'}`
    : '';

  const predictiveContextStr = predictiveSummary
    ? `=== DỰ BÁO ĐỊNH LƯỢNG & RỦI RO (WLS · Z-SCORE) ===
- Dự báo OHPS ca tới: ${predictiveSummary?.ohpsForecast?.predictedScore ?? '--'}/100 (${predictiveSummary?.ohpsForecast?.trendLabel || 'Ổn định'})
- Nguy cơ cổ C5-C7: ${predictiveSummary?.postureFatigue?.neckSpineRiskPercent ?? '--'}% | Nguy cơ thắt lưng L4-L5: ${predictiveSummary?.postureFatigue?.lumbarRiskPercent ?? '--'}% | Thời gian tới ngưỡng mỏi: ~${predictiveSummary?.postureFatigue?.predictedMinutesUntilSlouch ?? '--'} phút
- Đường cơ sở BPM cá nhân: ${predictiveSummary?.modelMetrics?.baselineBpmMean || '--'} ± ${predictiveSummary?.modelMetrics?.baselineBpmStd || '--'} BPM | Bất thường Z-Score: ${predictiveSummary?.modelMetrics?.zScoreAnomalyCount ?? 0} sự kiện | SQI: ${predictiveSummary?.modelMetrics?.sqiScore ?? '--'}/100
- Khung giờ vàng: ${predictiveSummary?.circadian?.goldenHoursWindow || '09:00 - 11:00'} | Khung giờ dễ uể oải: ${predictiveSummary?.circadian?.slumpRiskWindow || '14:00 - 15:30'}`
    : '';

  const tasksSummaryStr = detailedTasksList.length > 0
    ? `=== DANH SÁCH NHIỆM VỤ (${detailedTasksList.filter(t => t.status !== 'completed').length} chưa xong / ${detailedTasksList.length} tổng) ===\n` +
      detailedTasksList.slice(0, 12).map((t, i) => `${i + 1}. [${t.status === 'completed' ? 'XONG' : 'CHƯA XONG'}] ${t.title}${t.deadline ? ` (Hạn: ${t.deadline})` : ''}`).join('\n')
    : '=== DANH SÁCH NHIỆM VỤ ===\nHiện chưa có nhiệm vụ nào được giao.';

  const userProfileStr = userProfile
    ? `=== HỒ SƠ SỨC KHỎE CÁ NHÂN ===\nTuổi: ${userProfile.age ?? 'Chưa rõ'} | Chiều cao: ${userProfile.height ?? '--'} cm | Cân nặng: ${userProfile.weight ?? '--'} kg | Bệnh nền: ${Array.isArray(userProfile.medicalConditions) && userProfile.medicalConditions.length > 0 ? userProfile.medicalConditions.join(', ') : 'Không có'}`
    : '';

  const systemInstruction = `BẠN LÀ TRỢ LÝ AI CÔNG THÁI HỌC VÀ HIỆU SUẤT VĂN PHÒNG (OHPS COACH).
Người đang tương tác: "${userName}" (UID: ${targetUserId}, Vai trò: ${isAdmin ? 'QUẢN TRỊ VIÊN' : 'NHÂN VIÊN'}).
Thời gian hệ thống hiện tại: ${new Date().toLocaleString('vi-VN')}.

=== NGUYÊN TẮC GIAO TIẾP BẮT BUỘC ===
1. TUYỆT ĐỐI KHÔNG SỬ DỤNG BẤT KỲ EMOJI HAY BIỂU TƯỢNG ĐỒ HỌA NÀO. Chỉ sử dụng chữ viết tiếng Việt chuẩn mực, súc tích và Markdown rõ ràng.
2. TRẢ LỜI ĐÚNG TRỌNG TÂM, TỰ NHIÊN, CÓ SỐ LIỆU CỤ THỂ:
   - Nếu hỏi chào hỏi, ngày giờ: Trả lời trực tiếp, ngắn gọn. KHÔNG chèn báo cáo cảm biến nếu không được hỏi.
   - Nếu hỏi về năng lực ("bạn trả lời được những câu hỏi gì", "làm được gì"): Liệt kê 7 nhóm câu hỏi & hành động thực tế bạn xử lý được (1. Tư thế & Camera AI Vision, 2. Nhịp tim BPM & SpO2 MAX30102, 3. Dự báo rủi ro cổ/lưng & giờ vàng WLS/Z-Score, 4. Điểm OHPS & tiền thưởng VNĐ, 5. Tra cứu lịch sử đo đạc Supabase theo giờ/ngày, 6. Quản lý & tạo nhiệm vụ nhắc nhở, 7. Tinh chỉnh & đồng bộ ngưỡng Pi 4 trực tiếp${isAdmin ? ', kèm tra cứu/xếp hạng toàn đội ngũ' : ''}).
   - Nếu hỏi về rủi ro, xu hướng, điểm thưởng, task hoặc lịch sử: Chủ động gọi các Function Tool phù hợp hoặc trích xuất chính xác số liệu trong context bên dưới.
3. KHÔNG TỰ ĐỘNG GẮN DISCLAIMER Y TẾ VÀO MỌI CÂU HỎI. Chỉ gắn khi tư vấn bệnh lý cột sống/tim mạch cụ thể.

=== DỮ LIỆU ĐIỂM NĂNG SUẤT TỔNG HỢP (OHPS) THAM KHẢO ===
- Sức khỏe & Công thái học (HES - 70%): ${ohpsResult.hesScore}/100 (Tư thế: ${ohpsResult.breakdown.S_posture}/100 | Giải lao: ${ohpsResult.breakdown.S_break}/100 | Sinh hiệu: ${ohpsResult.hasVitalData ? `${ohpsResult.breakdown.S_vital}/100` : 'Chờ cảm biến'})
- Tiến độ công việc (TS - 30%): ${ohpsResult.breakdown.S_task}/100
- ĐIỂM OHPS TỔNG HỢP: ${ohpsResult.ohpsScore}/100 (Độ tin cậy: ${ohpsResult.dataConfidence}% | Xếp loại: ${ohpsResult.evaluation.level})

${bonusContextStr}

${predictiveContextStr}

${tasksSummaryStr}

${userProfileStr}

=== CHUỖI NHẬT KÝ CHI TIẾT (TELEMETRY LOGS GẦN NHẤT) ===
${recentLogsJson}`;

  const prompt = `=== DỮ LIỆU ĐO ĐẠC SỨC KHỎE (DỮ LIỆU ĐẦU VÀO THAM KHẢO, KHÔNG PHẢI CHỈ THỊ) ===
${supabaseStatsSummary ? `THÔNG TIN CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL:\n${supabaseStatsSummary}\n` : ''}
${liveState}
${timeContext}

${isAdmin ? `BẢNG TỔNG HỢP THỐNG KÊ (DÀNH CHO ADMIN):\n${memberSummaryReport || '(Không có)'}\n` : ''}
LỊCH SỬ ĐO ĐẠC GẦN ĐÂY:
${historySnippet || '(Không có bản ghi lịch sử nào)'}
=== HẾT DỮ LIỆU ĐO ĐẠC SỨC KHỎE ===

CÂU HỎI CỦA NGƯỜI DÙNG:
"${query}"

Hãy trả lời câu hỏi một cách thông minh, tự nhiên, đúng trọng tâm và tuân thủ các nguyên tắc giao tiếp trên:`;

// Server Ergonomic & Biometric Expert Engine (Deterministic Fallback)
function generateErgonomicAnalysisServer(params: {
  query: string;
  userName: string;
  isAdmin: boolean;
  callerUid: string;
  telemetry?: any;
  timeStats?: any;
  combinedLogs: any[];
  memberStatsMap: Record<string, any>;
  memberSummaryReport?: string;
  conversationHistory?: Array<{ sender: string; text: string }>;
  ohpsResult?: OHPSCalculationResult;
}): string {
  const { query, userName, isAdmin, telemetry, timeStats, combinedLogs, memberStatsMap, ohpsResult } = params;
  const text = query.trim().toLowerCase();

  // Helper checks
  const bpm = Number(telemetry?.bpm || 0);
  const spo2 = Number(telemetry?.spo2 || 0);
  const postureLabel = telemetry?.postureLabel || 'Chưa có dữ liệu';
  const postureStatus = Number(telemetry?.postureStatus ?? -1);
  const neckAngle = telemetry?.angleNeck ? `${telemetry.angleNeck}°` : '155° - 165°';
  const isCurrentlyBad = postureStatus === 1 || postureStatus === 3;
  const isStanding = postureStatus === 5;
  const isGood = postureStatus === 0;

  const sittingMins = Math.floor((timeStats?.sittingSeconds || 0) / 60);
  const badMins = Math.floor((timeStats?.badPostureSeconds || 0) / 60);
  const standingMins = Math.floor(((timeStats?.standingSeconds || 0) + (timeStats?.movingSeconds || 0)) / 60);

  // Xác định buổi trong ngày để chào hỏi tự nhiên
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'buổi sáng' : hour < 14 ? 'buổi trưa' : hour < 18 ? 'buổi chiều' : 'buổi tối';

  // 1. Hỏi về ngày, giờ, thời gian hiện tại
  if (
    text.includes('thứ mấy') || 
    text.includes('thu may') || 
    text.includes('mấy giờ') || 
    text.includes('may gio') || 
    text.includes('ngày mấy') || 
    text.includes('ngay may') || 
    text.includes('ngày bao nhiêu') || 
    text.includes('hôm nay ngày')
  ) {
    const now = new Date();
    const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = daysOfWeek[now.getDay()];
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return `Hôm nay là ${dayName}, ngày ${dateStr}. Hiện tại là ${timeStr}.\n\nChúc bạn một ngày làm việc hiệu quả, tập trung và luôn duy trì tư thế ngồi thoải mái!`;
  }

  // 2. Hỏi về năng lực, chức năng, câu hỏi chatbot trả lời được
  if (
    text.includes('làm được việc gì') || 
    text.includes('làm được gì') || 
    text.includes('lam duoc gi') || 
    text.includes('hỏi được gì') ||
    text.includes('hỏi gì') ||
    text.includes('những câu hỏi') ||
    text.includes('chức năng') || 
    text.includes('chuc nang') || 
    text.includes('khả năng') || 
    text.includes('bạn là ai') || 
    text.includes('ban la ai') || 
    text.includes('giới thiệu') || 
    text.includes('hướng dẫn sử dụng')
  ) {
    return `Tôi là Trợ Lý AI Công Thái Học (Agent kết nối Gemini 4 & dữ liệu thời gian thực Pi 4/Supabase). Dưới đây là **7 nhóm câu hỏi & thao tác** tôi có thể xử lý chính xác cho bạn:\n\n` +
      `1. **Phân tích tư thế & Camera Vision**: Hỏi tư thế hiện tại, góc cổ, hoặc bấm biểu tượng Camera để gửi ảnh chụp Pi 4 cho AI chấm trục tai-vai-lưng.\n` +
      `2. **Sinh trắc học MAX30102**: Hỏi nhịp tim (BPM), SpO₂, nguyên nhân tim đập nhanh / thiếu oxy và bài thở điều hòa 4-7-8.\n` +
      `3. **Dự báo rủi ro & Nhịp tập trung**: Hỏi *"Nguy cơ mỏi cổ/lưng của tôi thế nào?"*, *"Khung giờ vàng làm việc?"*, *"Có bất thường Z-Score không?"*.\n` +
      `4. **Điểm OHPS & Chính sách thưởng**: Hỏi *"Tôi đang được bao nhiêu điểm OHPS?"*, *"Dự kiến thưởng bao nhiêu tiền?"*, *"Cách tối đa tiền thưởng?"*.\n` +
      `5. **Tra cứu lịch sử theo mốc giờ**: Hỏi *"Lúc 14h hôm nay tôi ngồi thế nào?"*, *"Sáng nay có bao nhiêu lần gù lưng?"*, *"Thống kê 7 ngày qua"*.\n` +
      `6. **Quản lý nhiệm vụ & Tạo nhắc nhở**: Hỏi *"Tôi còn task nào chưa xong?"* hoặc yêu cầu *"Tạo nhắc nhở đứng giãn cơ 3 phút lúc 15h"*.\n` +
      `7. **Cấu hình ngưỡng Pi 4 trực tiếp**: Yêu cầu *"Đặt ngưỡng ngồi lâu xuống 35 phút"* — tôi sẽ tạo thẻ xác nhận để đồng bộ thẳng xuống Raspberry Pi 4.` +
      (isAdmin ? `\n8. **Quản trị đội ngũ (Admin)**: Hỏi *"Ai ngồi sai nhiều nhất?"*, *"So sánh sức khỏe nhân viên"* hoặc chọn từng thành viên trên bộ lọc phía trên.` : '');
  }

  // 2b. Hỏi về tiền thưởng, mức thưởng và chính sách thưởng của công ty
  if (
    text.includes('thưởng') ||
    text.includes('tiền thưởng') ||
    text.includes('chính sách thưởng') ||
    text.includes('mức thưởng') ||
    text.includes('bao nhiêu tiền') ||
    text.includes('tăng thưởng')
  ) {
    const company = bonusPolicy?.companyName || 'Công ty';
    const cycle = bonusPolicy?.cycle === 'daily' ? 'Hàng ngày' : bonusPolicy?.cycle === 'weekly' ? 'Hàng tuần' : 'Hàng tháng';
    const maxReward = bonusPolicy?.maxRewardAmount ? `${Number(bonusPolicy.maxRewardAmount).toLocaleString('vi-VN')} VNĐ` : '500.000 VNĐ';
    const minScore = bonusPolicy?.minScoreToReward || 70;
    const currentReward = bonusResult?.totalReward ? `${Number(bonusResult.totalReward).toLocaleString('vi-VN')} VNĐ` : '0 VNĐ';
    const currentRate = bonusResult?.achievementRate || 0;
    const tierName = bonusResult?.tierAchieved?.tierName || 'Chưa đạt chuẩn';
    const tips = bonusResult?.tipsToReachNextTier || 'Hãy duy trì tư thế ngồi thẳng lưng và thực hiện đủ 4 lần đứng giải lao mỗi ca để nâng cao điểm OHPS.';

    return `Chính Sách Thưởng Công Thái Học & Hiệu Suất (${company}):\n\n` +
      `- Chu kỳ xét thưởng: ${cycle}\n` +
      `- Mức thưởng tối đa chu kỳ: ${maxReward}/người\n` +
      `- Điểm sàn OHPS để nhận thưởng: ${minScore} điểm\n\n` +
      `Tình Trạng Thưởng Hiện Tại Của Bạn:\n` +
      `- Điểm OHPS hiện tại: ${ohpsResult?.ohpsScore || 80}/100\n` +
      `- Xếp loại: ${bonusResult?.isEligible ? tierName : `Chưa đạt điểm sàn (≥ ${minScore}đ)`}\n` +
      `- Tiền thưởng ước tính hiện tại: +${currentReward} (${currentRate}% mức thưởng tối đa)\n\n` +
      `Hướng dẫn tối ưu tiền thưởng: ${tips}\n\n` +
      `Ghi chú: Quản lý hoặc bạn có thể mở modal "Điểm Năng Suất OHPS" và nhấn "Nhập / Tùy chỉnh mức thưởng" để điều chỉnh ngân sách và cơ chế thưởng theo đặc thù của công ty.`;
  }

  // 3. Chào hỏi thông thường
  if (
    text.includes('chào') || 
    text.includes('hello') || 
    text.includes('hi ') || 
    text === 'hi' || 
    text.includes('ơi') || 
    text.includes('alo')
  ) {
    return `Chào ${userName}, chúc bạn một ${timeGreeting} làm việc tràn đầy năng lượng và hiệu quả!\n\n` +
      `Tôi là Trợ Lý AI Công Thái Học & Quản Trị Sức Khỏe của bạn. Bạn cần tôi hỗ trợ kiểm tra tư thế, tra cứu dữ liệu đo đạc hay gợi ý bài tập giãn cơ hôm nay?`;
  }

  // 4. Lời cảm ơn, chào tạm biệt & phản hồi lịch sự
  if (
    text.includes('cảm ơn') || 
    text.includes('thank') || 
    text === 'ok' || 
    text.includes('tuyệt vời') || 
    text.includes('tốt lắm') || 
    text.includes('tạm biệt') || 
    text.includes('bye')
  ) {
    return `Rất vui được đồng hành và bảo vệ sức khỏe cho bạn, ${userName}!\n\n` +
      `Đừng quên giữ cho hai bả vai thả lỏng, mắt nhìn ngang tầm mắt và uống thêm một ngụm nước ấm nhé. Nếu cần tra cứu dữ liệu đo đạc hoặc cảm thấy mỏi cơ ở bất kỳ thời điểm nào, hãy nhắn cho tôi ngay!`;
  }

  // Xử lý câu hỏi tiếp nối ngữ cảnh nhiều lượt (Multi-turn follow-up)
  const isFollowUp = 
    text === 'tại sao' || 
    text.includes('tại sao vậy') || 
    text.includes('sao nữa') || 
    text.includes('rồi làm gì') || 
    text.includes('tiếp theo') || 
    text.includes('có nguy hiểm không') || 
    text.includes('chữa thế nào') || 
    text.includes('nói rõ hơn') || 
    text.includes('còn gì nữa') ||
    text.includes('làm sao hết');

  if (isFollowUp && params.conversationHistory && params.conversationHistory.length > 0) {
    const lastUserMsgs = params.conversationHistory.filter(m => m.sender === 'user').map(m => m.text.toLowerCase()).join(' ');
    if (lastUserMsgs.includes('cổ') || lastUserMsgs.includes('gáy') || lastUserMsgs.includes('c5')) {
      return `Phân Tích Chuyên Sâu Đốt Sống Cổ C5-C7 & Rủi Ro Biến Chứng:\n\n` +
        `1. Cơ chế chèn ép: Đốt sống cổ C5-C7 chịu trách nhiệm cho 60% biên độ gập duỗi của đầu. Khi bạn gù cổ liên tục:\n` +
        `   - Nhân nhầy đĩa đệm bị đẩy lùi về phía sau, gây phồng hoặc thoát vị đĩa đệm cổ.\n` +
        `   - Chèn ép rễ dây thần kinh C6-C7 dẫn đến tê bì ngón tay cái và ngón trỏ.\n\n` +
        `2. Lộ trình phục hồi 3 bước:\n` +
        `   - Ngay bây giờ: Tập 5 nhịp Thu Cằm (Chin Tuck), mỗi nhịp giữ 5 giây.\n` +
        `   - Thiết lập không gian: Đưa màn hình lên cao thêm 10-15cm (ngang tầm mắt nhìn thẳng).\n` +
        `   - Thói quen: Đặt đồng hồ nhắc nhở cứ 45 phút lại ngửa cổ nhìn trần nhà 15 giây.`;
    }
    if (lastUserMsgs.includes('lưng') || lastUserMsgs.includes('thắt lưng') || lastUserMsgs.includes('l4')) {
      return `Cơ Chế Áp Lực Đĩa Đệm L4-L5 & Cột Sống Thắt Lưng:\n\n` +
        `1. Tại sao ngồi gù lại đau buốt lưng?\n` +
        `   - Dây chằng dọc sau của thắt lưng bị kéo căng cực độ khi bạn ngồi cong lưng, giảm khả năng cung cấp dinh dưỡng tự nhiên cho đĩa đệm qua cơ chế thẩm thấu.\n` +
        `   - Khi nhân nhầy đĩa đệm trượt ra chèn vào dây thần kinh tọa (Sciatic nerve), cơn đau sẽ buốt dọc từ mông lan xuống mặt sau đùi và bắp chân.\n\n` +
        `2. Hành động bảo vệ tức thì:\n` +
        `   - Đặt gối tựa lưng (Lumbar Roll) ở vị trí thắt lưng để tái tạo độ ưỡn sinh lý (Lordosis).\n` +
        `   - Ngả lưng ghế góc 105° thay vì 90° cứng nhắc.\n` +
        `   - Sau mỗi 50 phút ngồi, hãy đứng dậy đi lại ít nhất 2-3 phút để bơm dịch khớp đĩa đệm.`;
    }
  }

  // Chế độ Test Supabase & ngắt kết nối
  if (
    text.includes('ngắt kết nối') || 
    text.includes('ngat ket noi') || 
    text.includes('chế độ test') || 
    text.includes('che do test') || 
    text.includes('không lưu') || 
    text.includes('khong luu') || 
    text.includes('supabase')
  ) {
    return `Hướng Dẫn Chế Độ Test Thử Nghiệm & Ngắt Kết Nối Supabase:\n\n` +
      `1. Chức năng nút "Ngắt kết nối Supa (Test)":\n` +
      `   - Khi bạn bấm nút "Ngắt kết nối Supa (Test)" trên thanh điều hướng hoặc tab Nhật ký dữ liệu, hệ thống sẽ chuyển sang chế độ Test thử nghiệm.\n` +
      `   - Ở chế độ này, mọi cảm biến (MAX30102, AI Camera), đồ thị thời gian thực và âm thanh cảnh báo vẫn hoạt động bình thường, nhưng hoàn toàn KHÔNG ghi bản ghi nào vào cơ sở dữ liệu Supabase.\n\n` +
      `2. Kết nối lại khi muốn lưu:\n` +
      `   - Khi muốn tiếp tục lưu trữ dữ liệu lịch sử lâu dài, bạn chỉ cần bấm nút "Kết nối lại Supa (Lưu DB)" trên thanh công cụ.\n\n` +
      `3. Bảo toàn dữ liệu: Giúp bạn thoải mái thử nghiệm các kịch bản cử động, giả lập hoặc kiểm thử thiết bị Raspberry Pi 4 mà không làm bẩn nhật ký cá nhân.`;
  }

  // 3. Tra cứu lịch sử theo mốc thời gian cụ thể (MULTI-RESULT TIMELINE ENGINE)
  const timeMatch = text.match(/(\d{1,2})[h:](\d{1,2})?/);
  const isRecentQuery = text.includes('vừa nãy') || text.includes('lúc nãy') || text.includes('mới nhất') || text.includes('gần đây') || text.includes('vừa xong');
  const isAlertListQuery = text.includes('cảnh báo') || text.includes('ngồi sai') || text.includes('gù lưng') || text.includes('lần sai');
  const isTimelineQuery = text.includes('lịch sử') || text.includes('nhật ký') || text.includes('các mốc') || text.includes('kết quả đo') || text.includes('các lần');
  const isMorningQuery = text.includes('sáng nay') || text.includes('buổi sáng');
  const isAfternoonQuery = text.includes('chiều nay') || text.includes('buổi chiều');

  if ((timeMatch || isRecentQuery || isAlertListQuery || isTimelineQuery || isMorningQuery || isAfternoonQuery) && combinedLogs.length > 0) {
    let matchingLogs: any[] = [];
    let queryLabel = '';

    if (timeMatch) {
      const targetHour = parseInt(timeMatch[1], 10);
      const targetMinute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const targetTotalMinutes = targetHour * 60 + targetMinute;
      queryLabel = `quanh mốc ${targetHour}h${targetMinute > 0 ? String(targetMinute).padStart(2, '0') : ''}`;

      // Lọc tất cả các bản ghi trong phạm vi +/- 45 phút quanh mốc giờ yêu cầu
      matchingLogs = combinedLogs.filter(log => {
        const d = new Date(log.timestamp);
        const logMinutes = d.getHours() * 60 + d.getMinutes();
        return Math.abs(logMinutes - targetTotalMinutes) <= 45;
      });

      // Sắp xếp theo thời gian
      matchingLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (isMorningQuery) {
      queryLabel = 'buổi sáng hôm nay (06:00 - 12:00)';
      matchingLogs = combinedLogs.filter(log => {
        const h = new Date(log.timestamp).getHours();
        return h >= 6 && h < 12;
      });
    } else if (isAfternoonQuery) {
      queryLabel = 'buổi chiều hôm nay (12:00 - 18:00)';
      matchingLogs = combinedLogs.filter(log => {
        const h = new Date(log.timestamp).getHours();
        return h >= 12 && h < 18;
      });
    } else if (isAlertListQuery) {
      queryLabel = 'các lần phát hiện sai tư thế / cảnh báo';
      matchingLogs = combinedLogs.filter(log => log.postureStatus === 1 || log.postureStatus === 3 || log.hasAlert);
    } else {
      queryLabel = 'các mốc đo gần đây nhất';
      matchingLogs = combinedLogs.slice(0, 5);
    }

    if (matchingLogs.length === 0) {
      matchingLogs = combinedLogs.slice(0, 4);
    }

    const totalMatched = matchingLogs.length;
    const goodCount = matchingLogs.filter(l => l.postureStatus === 0).length;
    const badCount = matchingLogs.filter(l => l.postureStatus === 1 || l.postureStatus === 3).length;
    const standingCount = matchingLogs.filter(l => l.postureStatus === 5).length;
    const validBpmLogs = matchingLogs.filter(l => Number(l.bpm) > 0);
    const avgBpm = validBpmLogs.length > 0 
      ? Math.round(validBpmLogs.reduce((acc, l) => acc + Number(l.bpm), 0) / validBpmLogs.length) 
      : 0;
    const goodRatio = totalMatched > 0 ? Math.round((goodCount / totalMatched) * 100) : 100;

    // Xây dựng danh sách nhiều kết quả chi tiết
    const detailedList = matchingLogs.slice(0, 5).map((log, idx) => {
      const timeStr = log.timeStr || new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const postureDesc = log.postureStatus === 0 
        ? '[Đúng]' 
        : (log.postureStatus === 1 || log.postureStatus === 3) 
          ? '[Sai/Gù]' 
          : log.postureStatus === 5 
            ? '[Đứng]' 
            : '[Khác]';
      const bpmInfo = Number(log.bpm) > 0 ? `${log.bpm} BPM` : 'Không đeo';
      const spo2Info = Number(log.spo2) > 0 ? `${log.spo2}% SpO2` : 'Chờ đo';
      const alertNote = log.hasAlert ? ' (Đã cảnh báo âm thanh)' : '';
      return `  ${idx + 1}. Lúc ${timeStr}: ${postureDesc} ${log.posture || log.postureLabel || 'Chưa xác định'} | Nhịp tim: ${bpmInfo} | SpO2: ${spo2Info}${alertNote}`;
    }).join('\n');

    return `Kết Quả Tra Cứu Lịch Sử Đo Đạc (${queryLabel}):\n\n` +
      `Hệ thống ghi nhận ${totalMatched} mốc đo trong giai đoạn này của ${userName}:\n\n` +
      `1. Thống Kê Tổng Hợp Khung Giờ:\n` +
      `- Tỷ lệ tư thế chuẩn: ${goodRatio}% (${goodCount} lần đúng, ${badCount} lần cảnh báo, ${standingCount} lần vận động)\n` +
      `- Nhịp tim trung bình: ${avgBpm > 0 ? `${avgBpm} BPM` : 'Đang chờ cảm biến'}\n\n` +
      `2. Danh Sách Chi Tiết Từng Mốc Đo:\n` +
      `${detailedList}\n\n` +
      `3. Đánh Giá Diễn Biến Cơ Sinh Học:\n` +
      `${badCount > 0 
        ? `Ghi nhận có ${badCount} thời điểm góc cổ gập dưới 150° hoặc trượt mông ra trước. Tình trạng này làm tăng áp lực đè nặng lên đốt sống cổ C5-C7 và đĩa đệm thắt lưng L4-L5.` 
        : `Bạn duy trì tư thế rất xuất sắc và đồng đều! Cột sống giữ nguyên độ ưỡn sinh lý tự nhiên, giúp tuần hoàn máu lên não đạt mức tối ưu.`}\n\n` +
      `4. Khuyến Nghị Hành Động:\n` +
      `${badCount > 0 
        ? `- Kê cao màn hình ngang tầm mắt và tựa lưng góc 105°.\n- Thực hiện 5 lần bài tập Thu Cằm (Chin Tuck) để giải phóng cơ thang.` 
        : `- Tiếp tục phát huy và nhớ đứng dậy vận động nhẹ 2 phút sau mỗi 50 phút làm việc.`}`;
  }

  // 4. Đốt sống cổ, mỏi cổ, cúi đầu & Hội chứng Text Neck
  if (
    text.includes('mỏi cổ') || 
    text.includes('đau cổ') || 
    text.includes('cúi đầu') || 
    text.includes('gục đầu') || 
    text.includes('text neck') || 
    text.includes('c5-c7') || 
    text.includes('đốt sống cổ') || 
    text.includes('cổ vai gáy') || 
    text.includes('cổ gáy') || 
    text.includes('rụt cổ') || 
    text.includes('căng cơ cổ') ||
    text.includes('mỏi gáy')
  ) {
    return `Phân Tích Cơ Chế Sinh Học Đốt Sống Cổ (C5-C7) & Hội Chứng Text Neck:\n\n` +
      `Đầu người trưởng thành có trọng lượng trung bình khoảng 5 kg (ở góc 0°). Khi bạn cúi đầu làm việc với máy tính xách tay hoặc điện thoại:\n` +
      `- Nghiêng 15°: Áp lực lên cột sống cổ tăng lên 12 kg.\n` +
      `- Nghiêng 30°: Áp lực tăng lên 18 kg.\n` +
      `- Nghiêng 45°: Áp lực tăng lên 22 kg.\n` +
      `- Nghiêng 60° (tư thế gục đầu): Áp lực lên tới 27 kg (tương đương cõng một đứa trẻ 8 tuổi trên gáy liên tục).\n\n` +
      `Hậu quả: Gây co thắt cơ nâng vai và cơ thang, chèn ép rễ thần kinh cổ C5, C6, C7, dẫn đến đau lan xuống bả vai, tê bàn tay và đau đầu sau gáy.\n\n` +
      `3 Giải Pháp Khắc Phục Ngay:\n` +
      `1. Kê cao màn hình: Đặt mép trên màn hình ngang tầm mắt (dùng giá đỡ laptop hoặc sách kê cao 10-15cm).\n` +
      `2. Tập động tác Thu Cằm (Chin Tuck): Ngồi thẳng, nhìn về trước, nhẹ nhàng đẩy cằm thụt lùi về sau gáy (tạo nọng cằm). Giữ 5 giây, lặp lại 5 lần để kích hoạt nhóm cơ gập cổ sâu.\n` +
      `3. Góc nghiêng an toàn: Theo dõi đồng hồ đo góc cổ trên dashboard, cố gắng giữ góc từ 150° đến 165°.`;
  }

  // 5. Đốt sống thắt lưng L4-L5, thoát vị đĩa đệm & đau mỏi thắt lưng
  if (
    text.includes('đau lưng') || 
    text.includes('mỏi lưng') || 
    text.includes('thắt lưng') || 
    text.includes('l4-l5') || 
    text.includes('cột sống') || 
    text.includes('đĩa đệm') || 
    text.includes('thoát vị') || 
    text.includes('gù lưng') || 
    text.includes('cong lưng') || 
    text.includes('ngồi thụng') || 
    text.includes('thần kinh tọa') || 
    text.includes('đau hông')
  ) {
    return `Phân Tích Áp Lực Đĩa Đệm Thắt Lưng L4-L5 Khi Ngồi Gù:\n\n` +
      `Theo nghiên cứu cơ sinh học của GS. Alf Nachemson:\n` +
      `- Đứng thẳng người: Áp lực lên đĩa đệm L4-L5 là 100% (chuẩn).\n` +
      `- Ngồi thẳng tựa lưng góc 105°: Áp lực khoảng 105% (mức an toàn).\n` +
      `- Ngồi gù lưng, cúi người về phía trước: Áp lực tăng vọt lên 185% - 200%!\n\n` +
      `Cơ chế gây đau: Tư thế ngồi trượt mông hoặc cong lưng khiến đĩa đệm bị chèn ép không đều (phía trước khép lại, đẩy nhân nhầy ra sau đè vào dây chằng dọc sau và rễ dây thần kinh tọa).\n\n` +
      `Khuyến nghị công thái học chuyên gia:\n` +
      `- Đẩy mông sát vào góc ghế: Đảm bảo toàn bộ vùng thắt lưng được gối đệm tựa nâng đỡ.\n` +
      `- Góc ngả tựa lưng tối ưu: Đặt tựa lưng ở góc 100° - 110° (ngồi thẳng 90° cứng nhắc thực tế làm cơ lưng nhanh mỏi hơn).\n` +
      `- Tuyệt đối không bắt chéo chân: Bắt chéo chân làm vẹo khung chậu, gây lệch đốt sống thắt lưng theo trục xoay.\n` +
      `- Bài tập Seated Cat-Cow: Ngồi trên ghế, hít vào ưỡn ngực mở rộng vai, thở ra cuộn tròn lưng nhẹ nhàng 5 nhịp để bơm dịch khớp đĩa đệm.`;
  }

  // 6. Đau vai gáy, co thắt cơ thang (Trapezius) & Hội chứng Upper Crossed
  if (
    text.includes('đau vai') || 
    text.includes('mỏi vai') || 
    text.includes('cơ thang') || 
    text.includes('bả vai') || 
    text.includes('căng vai') || 
    text.includes('vai cuộn') || 
    text.includes('rụt vai') || 
    text.includes('vai gáy') || 
    text.includes('cứng vai')
  ) {
    return `Hội Chứng Bắt Chéo Trên (Upper Crossed Syndrome) & Mỏi Vai Gáy:\n\n` +
      `Khi bạn ngồi đánh máy với hai vai cuộn tròn ra trước và hai cánh tay giơ lơ lửng không có điểm tựa:\n` +
      `- Cơ ngực lớn và cơ thang trên (Upper Trapezius) bị co rút quá tải 200%.\n` +
      `- Cơ trám (Rhomboids) và cơ thang dưới bị kéo dãn yếu ớt, dẫn đến cảm giác đau nhức âm ỉ như bị đè nặng hai bên vai.\n\n` +
      `3 Bước Giải Phóng Cơ Vai Gáy Ngay Lúc Này:\n` +
      `1. Kê tay vịn ghế: Điều chỉnh tay vịn ghế ngang bằng mặt bàn để khuỷu tay gập góc 90° - 100°. Tay vịn sẽ gánh bớt 10% trọng lượng thân trên cho cơ vai.\n` +
      `2. Bài tập Ép Bả Vai (Scapular Retraction): Ngồi thẳng, hít sâu, kéo hai vai ra sau và ép chặt hai xương bả vai vào nhau trong 10 giây. Thở ra thả lỏng. Lặp lại 5 lần.\n` +
      `3. Kéo giãn cơ thang: Đặt bàn tay phải lên đỉnh đầu bên trái, nhẹ nhàng kéo nghiêng đầu sang phải 15 giây cho đến khi cảm thấy căng nhẹ dọc bờ vai. Sau đó đổi bên.`;
  }

  // 7. Cổ tay, tê tay, hội chứng ống cổ tay (Carpal Tunnel)
  if (
    text.includes('cổ tay') || 
    text.includes('tê tay') || 
    text.includes('ống cổ tay') || 
    text.includes('mỏi tay') || 
    text.includes('chuột') || 
    text.includes('bàn phím') || 
    text.includes('tê ngón') || 
    text.includes('khớp tay')
  ) {
    return `Hội Chứng Ống Cổ Tay (Carpal Tunnel Syndrome) & Công Thái Học Cẳng Tay:\n\n` +
      `Dây thần kinh giữa (Median nerve) chạy qua một đường hầm hẹp ở cổ tay. Khi bạn gõ phím hoặc rê chuột với cổ tay bị uốn cong lên trên (>15°) hoặc tỳ đè cạnh cổ tay vào mép bàn sắc nhọn, áp lực trong ống cổ tay tăng gấp 6 lần!\n\n` +
      `Giải Pháp Công Thái Học Cho Đôi Tay:\n` +
      `- Giữ cổ tay ở vị trí trung tính (Neutral 0°): Bàn tay, cổ tay và cẳng tay phải tạo thành một đường thẳng song song với mặt sàn.\n` +
      `- Di chuyển chuột bằng cả cánh tay: Không nên cố định cổ tay rồi lắc ngang (dễ gây viêm gân De Quervain), hãy dùng khớp khuỷu và khớp vai để dẫn đường cho chuột.\n` +
      `- Bài tập Cầu Nguyện Ngược (Reverse Prayer Stretch): Chắp hai lòng bàn tay vào nhau trước ngực, từ từ hạ thấp hai tay xuống dưới rốn trong khi vẫn giữ lòng bàn tay chạm nhau 15 giây.`;
  }

  // 8. Mỏi mắt, khô mắt, lóa mắt & Quy tắc 20-20-20
  if (
    text.includes('mỏi mắt') || 
    text.includes('mắt mờ') || 
    text.includes('khô mắt') || 
    text.includes('chói mắt') || 
    text.includes('nhức mắt') || 
    text.includes('nhìn màn hình') || 
    text.includes('20-20-20') || 
    text.includes('ánh sáng')
  ) {
    return `Hội Chứng Mỏi Mắt Kỹ Thuật Số (Computer Vision Syndrome - CVS):\n\n` +
      `Bình thường, mắt người chớp khoảng 18 - 20 lần/phút để tiết màng nước mắt bôi trơn giác mạc. Khi tập trung cao độ vào màn hình máy tính, tần số chớp mắt giảm sút chỉ còn 5 - 7 lần/phút, khiến mắt khô ráp, mờ nhòe và nhức thái dương.\n\n` +
      `Quy Tắc Vàng 20-20-20 Được Bác Sĩ Nhãn Khoa Khuyên Dùng:\n` +
      `- Cứ sau 20 phút nhìn màn hình, hãy rời mắt nhìn vào một vật thể ở khoảng cách xa 20 feet (~6 mét) trong vòng 20 giây.\n` +
      `- Khoảng cách màn hình chuẩn: Màn hình phải cách mắt từ 50 đến 70 cm (khoảng đúng một sải tay của bạn).\n` +
      `- Ánh sáng cân bằng: Không làm việc trong phòng tối với màn hình quá sáng. Điều chỉnh độ sáng màn hình tương đồng với độ sáng bức tường phía sau.`;
  }

  // 9. Phân tích chỉ số nhịp tim (Heart Rate BPM)
  if (
    text.includes('nhịp tim') || 
    text.includes('bpm') || 
    text.includes('tim đập') || 
    text.includes('tim nhanh') || 
    text.includes('tim chậm') || 
    text.includes('hồi hộp') || 
    text.includes('mạch')
  ) {
    let bpmVerdict = '';
    if (bpm === 0) {
      bpmVerdict = 'Cảm biến MAX30102 đang ở trạng thái chờ hoặc ngón tay chưa đặt sát vào thấu kính.';
    } else if (bpm >= 60 && bpm <= 100) {
      bpmVerdict = `Nhịp tim hiện tại ${bpm} BPM nằm trong dải sinh lý nghỉ ngơi hoàn toàn bình thường (60 - 100 BPM).`;
    } else if (bpm > 100) {
      bpmVerdict = `Nhịp tim hiện tại ${bpm} BPM hơi nhanh (Tachycardia nhẹ). Có thể do bạn vừa dùng cà phê, căng thẳng công việc, hoặc ngồi gù lưng ép cơ hoành khiến tim phải tăng tần số co bóp để bù đắp tuần hoàn.`;
    } else {
      bpmVerdict = `Nhịp tim hiện tại ${bpm} BPM khá chậm. Nếu bạn thường xuyên rèn luyện thể thao thì đây là chỉ số bình thường; nếu đi kèm hoa mắt, hãy đứng dậy hít thở sâu.`;
    }

    return `Đánh Giá Chỉ Số Nhịp Tim Thời Gian Thực:\n\n` +
      `${bpmVerdict}\n\n` +
      `Mối liên hệ giữa tư thế ngồi và nhịp tim:\n` +
      `- Khi ngồi gập người hoặc cúi gù, thể tích lồng ngực bị nén lại làm giảm lượng khí hít vào mỗi nhịp thở. Cơ thể tự động kích hoạt hệ giao cảm, làm nhịp tim đập nhanh hơn 5-10 nhịp/phút.\n` +
      `- Kỹ thuật thở 4-4-6: Hít vào bằng mũi 4 giây -> Giữ hơi 4 giây -> Thở ra từ từ bằng miệng 6 giây. Làm 3 chu kỳ sẽ hạ nhịp tim và giảm căng thẳng tức thì.`;
  }

  // 10. Phân tích nồng độ oxy trong máu (SpO2)
  if (
    text.includes('spo2') || 
    text.includes('oxy') || 
    text.includes('nồng độ oxy') || 
    text.includes('khí máu') || 
    text.includes('khó thở') || 
    text.includes('hít thở')
  ) {
    let spo2Verdict = '';
    if (spo2 === 0) {
      spo2Verdict = 'Chưa nhận diện được giá trị SpO2 từ cảm biến quang học.';
    } else if (spo2 >= 96) {
      spo2Verdict = `Chỉ số SpO2 đạt ${spo2}% (Rất tốt. Khả năng bão hòa oxy trong máu ngoại vi đạt mức tối ưu cho tế bào não).`;
    } else if (spo2 >= 94) {
      spo2Verdict = `Chỉ số SpO2 đạt ${spo2}% (Mức ranh giới cảnh báo). Bạn nên thẳng lưng và mở rộng lồng ngực để tăng trao đổi khí ở các phế nang đáy phổi.`;
    } else {
      spo2Verdict = `Chỉ số SpO2 ghi nhận ${spo2}% (Dưới ngưỡng 94%). Hãy kiểm tra lại tiếp xúc cảm biến trên ngón tay và đứng dậy hít thở sâu ngoài không gian thoáng đãng.`;
    }

    return `Đánh Giá Nồng Độ Bão Hòa Oxy Trong Máu (SpO2):\n\n` +
      `${spo2Verdict}\n\n` +
      `Tại sao dân văn phòng hay bị giảm oxy máu não?\n` +
      `- Khi ngồi gù lưng quá lâu, dung tích sống của phổi (Vital capacity) giảm tới 30%, dẫn tới thiếu hụt oxy nuôi não, gây buồn ngủ, ngáp vặt và giảm độ tập trung sau 2 tiếng làm việc.\n` +
      `- Mở ngực và hít thở sâu bằng cơ hoành (bụng phình khi hít vào) sẽ giúp tăng tức thì độ bão hòa oxy lên 98-99%.`;
  }

  // 11. Thời gian ngồi liên tục, ngồi bao lâu, chống buồn ngủ & Quy tắc 50-10
  if (
    text.includes('bao lâu') || 
    text.includes('ngồi liên tục') || 
    text.includes('đứng dậy') || 
    text.includes('buồn ngủ') || 
    text.includes('mệt mỏi') || 
    text.includes('50-10') || 
    text.includes('sit to stand') || 
    text.includes('vận động') || 
    text.includes('ngồi lâu') || 
    text.includes('ngủ gật')
  ) {
    const isExceeded = sittingMins >= 50;
    return `Thời Lượng Ngồi & Quy Tắc Công Thái Học 50-10:\n\n` +
      `- Tổng thời gian ngồi hôm nay: ${sittingMins} phút\n` +
      `- Thời gian ngồi sai tư thế: ${badMins} phút (${sittingMins > 0 ? Math.round((badMins / sittingMins) * 100) : 0}% thời gian ngồi)\n` +
      `- Thời gian đứng / vận động: ${standingMins} phút\n\n` +
      `${isExceeded 
        ? `CẢNH BÁO: Bạn đã ngồi liên tục hơn 50 phút. Máu ở chi dưới đang bị ứ trệ, làm tăng nguy cơ giãn tĩnh mạch và giảm lưu lượng oxy lên não gây buồn ngủ.` 
        : `Thời lượng ngồi hiện tại vẫn trong ngưỡng kiểm soát.`}\n\n` +
      `Cách áp dụng quy tắc 50-10 để duy trì tỉnh táo:\n` +
      `1. Cứ mỗi 50 phút ngồi, hãy đứng dậy đi lại hoặc điều chỉnh bàn nâng sang chế độ đứng làm việc trong 10 phút.\n` +
      `2. Uống một ly nước mát 200ml và vươn vai 30 giây để kích thích tuần hoàn máu ngoại vi.\n` +
      `3. Nếu không có bàn nâng, hãy đứng lên vươn hai tay lên trần nhà và nhón gót chân 10 lần (kích hoạt bơm bắp chân Soleus pump).`;
  }

  // 12. Tư thế ngồi đúng chuẩn công thái học & thiết lập bàn ghế
  if (
    text.includes('ngồi đúng') || 
    text.includes('tư thế chuẩn') || 
    text.includes('công thái học') || 
    text.includes('chuẩn') || 
    text.includes('setup') || 
    text.includes('bàn ghế') || 
    text.includes('độ cao bàn') || 
    text.includes('chiều cao ghế') || 
    text.includes('khoảng cách màn hình') || 
    text.includes('màn hình') || 
    text.includes('ghế')
  ) {
    return `Quy Tắc 90-90-90: Thiết Lập Bàn Ghế Chuẩn Công Thái Học:\n\n` +
      `1. Mắt & Màn hình:\n` +
      `   - Mép trên màn hình ngang bằng tầm mắt nhìn thẳng.\n` +
      `   - Khoảng cách từ mắt tới màn hình từ 50 đến 70 cm (bằng chiều dài một cánh tay).\n\n` +
      `2. Lưng & Cột sống:\n` +
      `   - Tựa lưng nghiêng 100° - 110° (tránh ngồi gù gập 70° hoặc ngửa trượt mông ra trước).\n` +
      `   - Có gối nâng đỡ đúng hõm thắt lưng L1-L5.\n\n` +
      `3. Góc Khuỷu Tay (90° - 100°):\n` +
      `   - Cẳng tay đặt nhẹ lên tay vịn hoặc mặt bàn, song song với mặt đất.\n\n` +
      `4. Góc Đầu Gối & Hông (90° - 100°):\n` +
      `   - Mặt ghế không cấn vào hõm khoeo chân (cách mép ghế 2-3 ngón tay).\n` +
      `   - Hai bàn chân đặt phẳng, vuông góc trên mặt sàn.`;
  }

  // 13. Bài tập giãn cơ tại chỗ
  if (
    text.includes('bài tập') || 
    text.includes('giãn cơ') || 
    text.includes('vươn vai') || 
    text.includes('tập luyện') || 
    text.includes('động tác') || 
    text.includes('thể dục') || 
    text.includes('xoa bóp')
  ) {
    return `4 Bài Tập Công Thái Học Nhanh 2 Phút Tại Bàn Làm Việc:\n\n` +
      `1. Thu Cằm (Chin Tuck - Giảm đau mỏi đốt sống cổ):\n` +
      `   Ngồi thẳng, mắt nhìn ngang. Dùng hai ngón tay đẩy nhẹ cằm lùi về phía sau cổ (tạo cảm giác như có nọng cằm). Giữ 5 giây, lặp lại 5 lần.\n\n` +
      `2. Mở Rộng Lồng Ngực (Chest Opener - Chống gù lưng):\n` +
      `   Đan hai tay ra sau gáy, hít sâu ưỡn ngực, mở rộng tối đa hai khuỷu tay sang hai bên và ép chặt hai bả vai vào nhau trong 10-15 giây.\n\n` +
      `3. Xoay Cột Sống Ghế Ngồi (Seated Spinal Twist - Thắt lưng L4-L5):\n` +
      `   Đặt tay phải lên mép tựa tay trái, xoay nhẹ phần thân trên về bên trái và nhìn qua vai trái 10 giây, sau đó đổi bên ngược lại.\n\n` +
      `4. Kéo Giãn Gân Cổ Tay (Wrist Extensor Stretch):\n` +
      `   Duỗi thẳng tay về phía trước, dùng tay kia nhẹ nhàng kéo các ngón tay ngược về phía thân người 15 giây để chống hội chứng ống cổ tay.`;
  }

  // 14. Tổng quan sức khỏe, thống kê, điểm năng suất OHPS & đánh giá hôm nay
  if (
    text.includes('tổng quan') || 
    text.includes('hôm nay') || 
    text.includes('thống kê') || 
    text.includes('đánh giá') || 
    text.includes('kết quả') || 
    text.includes('báo cáo') || 
    text.includes('tiến bộ') || 
    text.includes('năng suất') ||
    text.includes('ohps') ||
    text.includes('hes') ||
    text.includes('điểm')
  ) {
    const totalRecorded = sittingMins + standingMins;
    const goodPostureRatio = sittingMins > 0 ? Math.round(((sittingMins - badMins) / sittingMins) * 100) : 100;
    const scoreVal = ohpsResult ? ohpsResult.ohpsScore : (goodPostureRatio >= 85 ? 90 : goodPostureRatio >= 70 ? 78 : 62);
    const scoreLevel = ohpsResult?.evaluation.level || (scoreVal >= 90 ? 'Rất tốt' : scoreVal >= 80 ? 'Tốt' : scoreVal >= 70 ? 'Khá' : 'Cần cải thiện');

    return `Báo Cáo Điểm Năng Suất & Sức Khỏe Công Thái Học (OHPS Coach):\n\n` +
      `ĐIỂM OHPS TỔNG HỢP: ${scoreVal}/100 - Xếp loại: ${scoreLevel} ${ohpsResult ? `(Độ tin cậy: ${ohpsResult.dataConfidence}%)` : ''}\n\n` +
      `=== I. CHI TIẾT ĐIỂM THÀNH PHẦN ===\n` +
      `- Sức khỏe & Công thái học (HES - 70%): ${ohpsResult ? ohpsResult.hesScore : Math.round(scoreVal * 0.95)}/100\n` +
      `  * Điểm tư thế (35%): ${ohpsResult?.breakdown.S_posture ?? goodPostureRatio}/100\n` +
      `  * Điểm giải lao (20%): ${ohpsResult?.breakdown.S_break ?? 80}/100\n` +
      `  * Điểm sinh hiệu (15%): ${ohpsResult?.hasVitalData ? `${ohpsResult.breakdown.S_vital}/100` : 'Tự cân bằng (Chờ cảm biến)'}\n` +
      `- Tiến độ công việc (TS - 30%): ${ohpsResult?.breakdown.S_task ?? 100}/100\n\n` +
      `=== II. DỮ LIỆU ĐO ĐẠC HÔM NAY ===\n` +
      `- Tổng thời gian phiên: ${totalRecorded} phút (Ngồi: ${sittingMins}p, Đứng/Vận động: ${standingMins}p, Sai tư thế: ${badMins}p)\n` +
      `- Nhịp tim: ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'} | SpO2: ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}\n` +
      `- Tư thế trực tiếp: ${postureLabel} (Góc cổ: ${neckAngle})\n\n` +
      `=== III. KHUYẾN NGHỊ & BÀI TẬP GIÃN CƠ 2 PHÚT ===\n` +
      `Lời khuyên công thái học: ${scoreVal >= 80 ? 'Bạn đang duy trì thói quen công thái học và năng suất rất tốt! Hãy tiếp tục duy trì nhịp độ làm việc và đứng dậy đi lại mỗi 50 phút.' : 'Cần lưu ý góc gục cổ và thời gian ngồi liên tục. Hãy nâng cao màn hình máy tính ngang tầm mắt.'}\n` +
      `Bài tập 2 phút nhanh:\n` +
      `1. Thu Cằm (Chin Tuck): Đẩy nhẹ cằm lùi ra sau gáy 5 giây, lặp lại 5 lần.\n` +
      `2. Ép Bả Vai (Chest Opener): Đan tay sau lưng, hít sâu ưỡn ngực mở rộng bả vai 15 giây.`;
  }

  // 14b. Hỏi về dự báo rủi ro, Z-Score, giờ vàng
  if (
    text.includes('dự báo') ||
    text.includes('rủi ro') ||
    text.includes('nguy cơ') ||
    text.includes('giờ vàng') ||
    text.includes('z-score') ||
    text.includes('bất thường') ||
    text.includes('khi nào mỏi')
  ) {
    const pf = predictiveSummary?.postureFatigue;
    const mm = predictiveSummary?.modelMetrics;
    const circ = predictiveSummary?.circadian;
    const ohpsF = predictiveSummary?.ohpsForecast;
    return `Phân Tích Dự Báo Rủi Ro & Chuỗi Thời Gian:\n\n` +
      `- Dự báo OHPS ca tới: **${ohpsF?.predictedScore ?? ohpsResult?.ohpsScore ?? 80}/100** (${ohpsF?.trendLabel || 'Ổn định'}, độ tin cậy ${ohpsF?.confidencePercent ?? 70}%)\n` +
      `- Nguy cơ đốt sống cổ C5-C7: **${pf?.neckSpineRiskPercent ?? 25}%** | Thắt lưng L4-L5: **${pf?.lumbarRiskPercent ?? 28}%**\n` +
      `- Thời gian ước tính tới ngưỡng mỏi: **~${pf?.predictedMinutesUntilSlouch ?? 30} phút** ngồi liên tục\n` +
      `- Đường cơ sở nhịp tim cá nhân: **${mm?.baselineBpmMean || '--'} ± ${mm?.baselineBpmStd || '--'} BPM** (${mm?.zScoreAnomalyCount ?? 0} bất thường Z-Score | SQI: ${mm?.sqiScore ?? ohpsResult?.sqiScore ?? '--'}/100)\n` +
      `- Khung giờ vàng tập trung: **${circ?.goldenHoursWindow || '09:00 - 11:00'}** | Khung giờ dễ uể oải: **${circ?.slumpRiskWindow || '14:00 - 15:30'}**\n\n` +
      `Khuyến nghị: Sắp xếp công việc khó vào khung giờ vàng và đứng dậy vận động trước mốc ~${pf?.predictedMinutesUntilSlouch ?? 30} phút.`;
  }

  // 14c. Hỏi về nhiệm vụ / task đang giao
  if (text.includes('nhiệm vụ') || text.includes('task') || text.includes('công việc') || text.includes('việc cần làm')) {
    const pending = detailedTasksList.filter(t => t.status !== 'completed');
    const done = detailedTasksList.filter(t => t.status === 'completed');
    if (detailedTasksList.length === 0) {
      return `Hiện tại chưa có nhiệm vụ nào được giao cho ${userName}.\n\nBạn có thể yêu cầu tôi: *"Tạo nhắc nhở đứng giãn cơ 3 phút lúc 15h"* để thêm ngay nhiệm vụ mới!`;
    }
    const listStr = pending.slice(0, 6).map((t, i) => `${i + 1}. **${t.title}** (${t.priority || 'normal'}${t.deadline ? ` · Hạn: ${t.deadline}` : ''})`).join('\n');
    return `Tổng Hợp Tiến Độ Nhiệm Vụ (${done.length}/${detailedTasksList.length} đã hoàn thành):\n\n` +
      (pending.length > 0
        ? `**Các nhiệm vụ đang chờ (${pending.length}):**\n${listStr}`
        : `Tuyệt vời! Bạn đã hoàn thành toàn bộ ${done.length} nhiệm vụ được giao.`);
  }

  // 15. Quản trị viên: So sánh, xếp hạng và đánh giá nhân viên
  if (isAdmin && (text.includes('ai ngồi sai') || text.includes('sai nhiều nhất') || text.includes('so sánh') || text.includes('nhân viên') || text.includes('toàn bộ') || text.includes('thành viên'))) {
    const memberList = Object.values(memberStatsMap);
    if (memberList.length > 0) {
      memberList.sort((a: any, b: any) => b.bad - a.bad);
      const topBad = memberList[0];
      const details = memberList.map((m: any, idx: number) => {
        const ratio = m.total > 0 ? Math.round((m.good / m.total) * 100) : 0;
        return `${idx + 1}. **${m.userName}**: ${m.bad} lần sai tư thế | ${m.good} lần đúng (${ratio}%) | Nhịp tim TB: ${m.countBpm > 0 ? Math.round(m.sumBpm / m.countBpm) : 'N/A'} BPM | Trạng thái: *${m.latestPosture}*`;
      }).join('\n');

      return `**Báo Cáo Phân Tích Công Thái Học Đội Ngũ (Dành Cho Quản Trị Viên):**\n\n` +
        `Thành viên có số lần cảnh báo sai tư thế cao nhất là **${topBad.userName}** (${topBad.bad} lần sai).\n\n` +
        `**Bảng Xếp Hạng & Chỉ Số Từng Thành Viên:**\n${details}\n\n` +
        `**Khuyến nghị cho Admin:** Bạn có thể yêu cầu ngay tại đây *"Tạo nhiệm vụ nhắc ${topBad.userName} điều chỉnh tư thế"* hoặc vào tab **Quản trị / Giao việc**.`;
    }
    return `Hiện tại chưa có đủ dữ liệu từ nhiều thành viên để lập bảng so sánh. Bạn có thể kiểm tra tab Quản trị hệ thống để theo dõi danh sách thiết bị.`;
  }

  // 16. Phản hồi thông minh theo ngữ cảnh
  const isHealthRelatedQuery = /tư thế|nhịp tim|spo2|sức khỏe|ngồi|cột sống|cổ|vai|lưng|đo đạc|chỉ số|cảm biến|camera|bài tập/i.test(text);

  if (isHealthRelatedQuery) {
    return `Trợ Lý Công Thái Học AI Phân Tích Cho ${userName}:\n\n` +
      `1. Dữ liệu đo đạc thời gian thực từ cảm biến IoT:\n` +
      `- Tư thế hiện tại: ${postureLabel} ${isCurrentlyBad ? '(Đang có nguy cơ co cứng cơ vai gáy và chèn ép đĩa đệm)' : isStanding ? '(Rất tốt, đang giải phóng áp lực đĩa đệm)' : '(Tư thế cân bằng, tiếp tục duy trì)'}\n` +
      `- Góc nghiêng cổ ước tính: ${neckAngle} (Chuẩn an toàn: 150° - 165°)\n` +
      `- Chỉ số sinh trắc học: Nhịp tim: ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'} | SpO2: ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}\n` +
      `- Thời gian phiên ngồi: ${sittingMins} phút (Ngồi sai: ${badMins} phút)\n\n` +
      `2. Phân tích cơ sinh học & Đánh giá rủi ro:\n` +
      `Cột sống chịu áp lực lớn nhất khi duy trì tư thế tĩnh quá 40 phút. Cơ thang trên và cơ dựng sống thắt lưng dễ bị co rút, gây mỏi mệt và giảm oxy lên não.\n\n` +
      `3. Giải pháp khuyến nghị:\n` +
      `- Tựa trọn vẹn lưng vào ghế góc 100°-110°, hai bàn chân đặt phẳng trên sàn.\n` +
      `- Kê mép trên màn hình ngang tầm mắt nhìn thẳng.\n` +
      `- Thực hiện động tác Thu Cằm (Chin Tuck) và Ép Bả Vai trong 15 giây.`;
  }

  // Câu hỏi hội thoại thông thường không liên quan sức khỏe
  return `Chào ${userName}! Tôi đã ghi nhận câu hỏi của bạn: "${query}".\n\n` +
    `Tôi là Trợ lý AI chuyên trách về Công thái học & Giám sát Sức khỏe văn phòng. Tôi có thể hỗ trợ bạn theo dõi tư thế làm việc theo thời gian thực, giám sát nhịp tim/SpO2, nhắc nhở giải lao, gợi ý bài tập giãn cơ hoặc phân tích Điểm Năng Suất Tổng Hợp (OHPS).\n\n` +
    `Nếu bạn có thắc mắc cụ thể về tư thế ngồi, các mốc thời gian làm việc hay muốn kiểm tra chỉ số đo đạc hôm nay, hãy nhắn cho tôi nhé!`;
}

  const geminiModel = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
  const activeAi = getGeminiClient();

  let responseText = '';
  const toolCallsUsed: string[] = [];
  let pendingAction: {
    type: 'apply_thresholds' | 'create_task';
    summary: string;
    thresholdsPatch?: Record<string, number>;
    task?: {
      title: string;
      content: string;
      priority: 'normal' | 'high' | 'urgent';
      targetUserName?: string;
      deadline?: string;
    };
  } | null = null;

  // Xây dựng Function Calling Declarations cho AI Agent
  const chatTools: FunctionDeclaration[] = [
    {
      name: 'query_telemetry_by_timerange',
      description: 'Truy vấn dữ liệu lịch sử tư thế, nhịp tim (BPM) và SpO2 từ cơ sở dữ liệu Supabase theo khoảng thời gian tùy chỉnh.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          hoursAgo: {
            type: Type.NUMBER,
            description: 'Số giờ gần nhất cần truy vấn (ví dụ: 6, 24, 72, 168 cho 1 tuần).',
          },
          onlyAlerts: {
            type: Type.BOOLEAN,
            description: 'Chỉ lọc các bản ghi có cảnh báo sai tư thế hoặc sinh hiệu bất thường.',
          },
          targetUserName: {
            type: Type.STRING,
            description: 'Tên nhân viên cần lọc (chỉ dành cho Admin).',
          },
          limit: {
            type: Type.INTEGER,
            description: 'Số bản ghi tối đa trả về (mặc định 120, tối đa 250).',
          },
        },
      },
    },
    {
      name: 'get_health_risk_and_bonus_report',
      description: 'Lấy báo cáo định lượng gồm điểm OHPS, mức tiền thưởng công thái học (VNĐ), dự báo rủi ro cổ C5-C7 / thắt lưng L4-L5, khung giờ vàng và bất thường Z-Score.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          focusArea: {
            type: Type.STRING,
            description: 'Nhóm cần xem sâu: all, bonus, risk, hoặc circadian.',
          },
        },
      },
    },
    {
      name: 'query_tasks_status',
      description: 'Kiểm tra danh sách nhiệm vụ công việc / nhắc nhở sức khỏe đang chờ và đã hoàn thành của người dùng.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          onlyPending: {
            type: Type.BOOLEAN,
            description: 'Nếu true, chỉ trả về các nhiệm vụ chưa hoàn thành.',
          },
        },
      },
    },
    {
      name: 'propose_pi4_thresholds',
      description: 'Đề xuất cập nhật cấu hình ngưỡng cảnh báo cho thiết bị Raspberry Pi 4 (chỉ dùng khi người dùng yêu cầu thay đổi hoặc tối ưu ngưỡng).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          hrMin: { type: Type.INTEGER, description: 'Nhịp tim tối thiểu (BPM)' },
          hrMax: { type: Type.INTEGER, description: 'Nhịp tim tối đa (BPM)' },
          spo2Min: { type: Type.INTEGER, description: 'Ngưỡng SpO2 tối thiểu (%)' },
          incorrectPostureSec: { type: Type.INTEGER, description: 'Số giây sai tư thế bắt đầu nhắc' },
          longIncorrectSec: { type: Type.INTEGER, description: 'Số giây sai tư thế quá lâu báo động' },
          longSittingSec: { type: Type.INTEGER, description: 'Số giây ngồi lâu cần nhắc đứng dậy' },
          standingTargetSec: { type: Type.INTEGER, description: 'Mục tiêu đứng (giây)' },
          biometricReminderSec: { type: Type.INTEGER, description: 'Chu kỳ nhắc đo sinh trắc học (giây)' },
          reason: { type: Type.STRING, description: 'Lý do ngắn gọn đề xuất thay đổi ngưỡng' },
        },
        required: ['reason'],
      },
    },
    {
      name: 'propose_create_task',
      description: 'Đề xuất tạo nhiệm vụ nhắc nhở sức khỏe hoặc công việc mới trên hệ thống.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Tiêu đề ngắn gọn của nhiệm vụ' },
          content: { type: Type.STRING, description: 'Mô tả chi tiết nội dung nhắc nhở' },
          priority: { type: Type.STRING, description: 'Mức ưu tiên: normal, high hoặc urgent' },
          targetUserName: { type: Type.STRING, description: 'Tên người nhận (Admin mới được giao cho người khác)' },
          deadline: { type: Type.STRING, description: 'Hạn chót dự kiến (ví dụ: 15:30 hôm nay)' },
        },
        required: ['title', 'content'],
      },
    },
  ];

  // Chuẩn bị đa lượt (Multi-turn contents) + Multimodal Camera Image
  const historyContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(conversationHistory)) {
    const recentTurns = conversationHistory.slice(-8);
    for (const turn of recentTurns) {
      const role = turn?.role === 'model' || turn?.sender === 'bot' ? 'model' : 'user';
      const contentText = String(turn?.content ?? turn?.text ?? '').trim();
      if (!contentText) continue;
      // Đảm bảo lượt đầu là user và các lượt xen kẽ nhau hợp lệ
      if (historyContents.length === 0 && role === 'model') continue;
      if (historyContents.length > 0 && historyContents[historyContents.length - 1].role === role) continue;
      historyContents.push({ role, parts: [{ text: contentText.slice(0, 1500) }] });
    }
    if (historyContents.length > 0 && historyContents[historyContents.length - 1].role === 'user') {
      historyContents.pop();
    }
  }

  const currentUserParts: any[] = [{ text: prompt }];
  let hasAttachedCameraImage = false;
  if (typeof image === 'string' && image.trim().length > 32) {
    const dataUrlMatch = image.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mimeType = dataUrlMatch ? dataUrlMatch[1] : 'image/jpeg';
    const base64Data = dataUrlMatch ? dataUrlMatch[2] : image.trim();
    if (/^[A-Za-z0-9+/=]+$/.test(base64Data.slice(0, 64))) {
      currentUserParts.unshift({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
      hasAttachedCameraImage = true;
      toolCallsUsed.push('AI Vision Camera');
    }
  }

  const chatContents: any[] = [
    ...historyContents,
    { role: 'user', parts: currentUserParts },
  ];

  const executeToolCall = async (callName: string, args: Record<string, any>) => {
    if (callName === 'query_telemetry_by_timerange') {
      toolCallsUsed.push('SQL Telemetry Query');
      if (!activeSupabase) {
        return { error: 'Supabase chưa được kết nối trên server.', recordsFound: 0 };
      }
      const hoursAgo = Math.min(720, Math.max(1, Number(args?.hoursAgo || 24)));
      const maxLimit = Math.min(250, Math.max(10, Number(args?.limit || 120)));
      const sinceIso = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

      let sqlQ = activeSupabase
        .from('telemetry_logs')
        .select('user_id, user_name, bpm, spo2, posture_status, posture_label, has_alert, created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(maxLimit);

      if (!isAdmin) {
        if (authUser.email) {
          sqlQ = sqlQ.or(`user_id.eq.${callerUid},user_email.ilike.${authUser.email.toLowerCase().trim()}`);
        } else {
          sqlQ = sqlQ.eq('user_id', callerUid);
        }
      } else if (args?.targetUserName) {
        sqlQ = sqlQ.ilike('user_name', `%${String(args.targetUserName)}%`);
      }

      if (args?.onlyAlerts) {
        sqlQ = sqlQ.eq('has_alert', true);
      }

      const { data: rows, error } = await sqlQ;
      if (error) {
        return { error: error.message, recordsFound: 0 };
      }
      const list = rows || [];
      const sitting = list.filter((r: any) => r.posture_status !== 2 && r.posture_status !== 5);
      const good = sitting.filter((r: any) => r.posture_status === 0);
      const validVitals = list.filter((r: any) => Number(r.bpm) > 0);
      const avgBpm = validVitals.length > 0
        ? Math.round(validVitals.reduce((s: number, r: any) => s + Number(r.bpm), 0) / validVitals.length)
        : 0;
      const validSpo2 = list.filter((r: any) => Number(r.spo2) > 0);
      const avgSpo2 = validSpo2.length > 0
        ? Number((validSpo2.reduce((s: number, r: any) => s + Number(r.spo2), 0) / validSpo2.length).toFixed(1))
        : 0;

      return {
        hoursAgo,
        recordsFound: list.length,
        goodPostureRatioPercent: sitting.length > 0 ? Math.round((good.length / sitting.length) * 100) : 100,
        alertCount: list.filter((r: any) => Boolean(r.has_alert)).length,
        avgBpm,
        avgSpo2,
        recentSamples: list.slice(0, 10).map((r: any) => ({
          time: r.created_at,
          user: r.user_name,
          posture: r.posture_label,
          bpm: r.bpm,
          spo2: r.spo2,
          alert: r.has_alert,
        })),
      };
    }

    if (callName === 'get_health_risk_and_bonus_report') {
      toolCallsUsed.push('Báo cáo OHPS & Rủi ro');
      return {
        ohps: {
          score: ohpsResult.ohpsScore,
          hesScore: ohpsResult.hesScore,
          taskScore: ohpsResult.taskScore,
          breakdown: ohpsResult.breakdown,
          level: ohpsResult.evaluation.level,
          confidence: ohpsResult.dataConfidence,
          sqiScore: ohpsResult.sqiScore,
        },
        bonus: bonusPolicy
          ? {
              companyName: bonusPolicy.companyName,
              cycle: bonusPolicy.cycle,
              maxRewardAmount: bonusPolicy.maxRewardAmount,
              minScoreToReward: bonusPolicy.minScoreToReward,
              estimatedReward: bonusResult?.totalReward ?? 0,
              achievementRate: bonusResult?.achievementRate ?? 0,
              isEligible: bonusResult?.isEligible ?? false,
              tierName: bonusResult?.tierAchieved?.tierName ?? null,
              tipsToReachNextTier: bonusResult?.tipsToReachNextTier ?? null,
            }
          : null,
        predictiveRisk: predictiveSummary || null,
      };
    }

    if (callName === 'query_tasks_status') {
      toolCallsUsed.push('Tra cứu Nhiệm vụ');
      const onlyPending = Boolean(args?.onlyPending);
      const filtered = onlyPending
        ? detailedTasksList.filter(t => t.status !== 'completed')
        : detailedTasksList;
      return {
        totalTasks: detailedTasksList.length,
        completedCount: detailedTasksList.filter(t => t.status === 'completed').length,
        pendingCount: detailedTasksList.filter(t => t.status !== 'completed').length,
        tasks: filtered.slice(0, 20),
      };
    }

    if (callName === 'propose_pi4_thresholds') {
      toolCallsUsed.push('Đề xuất ngưỡng Pi 4');
      const allowedKeys = [
        'hrMin',
        'hrMax',
        'spo2Min',
        'incorrectPostureSec',
        'longIncorrectSec',
        'longSittingSec',
        'standingTargetSec',
        'biometricReminderSec',
      ];
      const patch: Record<string, number> = {};
      for (const k of allowedKeys) {
        const val = Number(args?.[k]);
        if (!Number.isNaN(val) && val > 0) {
          patch[k] = Math.round(val);
        }
      }
      if (Object.keys(patch).length > 0) {
        pendingAction = {
          type: 'apply_thresholds',
          summary: String(args?.reason || 'Cập nhật bộ ngưỡng cảnh báo tối ưu xuống Raspberry Pi 4'),
          thresholdsPatch: patch,
        };
        return {
          status: 'proposed_to_user',
          proposedPatch: patch,
          note: 'Đã tạo thẻ xác nhận trên giao diện để người dùng bấm Áp dụng xuống Firestore & Pi 4.',
        };
      }
      return { status: 'ignored', note: 'Không có thông số ngưỡng hợp lệ nào được chỉ định.' };
    }

    if (callName === 'propose_create_task') {
      toolCallsUsed.push('Đề xuất tạo nhiệm vụ');
      const priorityRaw = String(args?.priority || 'normal').toLowerCase();
      const priority: 'normal' | 'high' | 'urgent' =
        priorityRaw === 'urgent' ? 'urgent' : priorityRaw === 'high' ? 'high' : 'normal';
      pendingAction = {
        type: 'create_task',
        summary: `Tạo nhiệm vụ: ${String(args?.title || 'Nhắc nhở công thái học')}`,
        task: {
          title: String(args?.title || 'Nhắc nhở công thái học').slice(0, 120),
          content: String(args?.content || 'Thực hiện giãn cơ và điều chỉnh tư thế ngồi chuẩn.'),
          priority,
          targetUserName: isAdmin && args?.targetUserName ? String(args.targetUserName) : undefined,
          deadline: args?.deadline ? String(args.deadline) : undefined,
        },
      };
      return {
        status: 'proposed_to_user',
        task: pendingAction.task,
        note: 'Đã tạo thẻ xác nhận nhiệm vụ ngay trong khung chat.',
      };
    }

    return { error: `Unknown tool: ${callName}` };
  };

  // Thử gọi Gemini API nếu có API key hợp lệ (hỗ trợ Multi-turn, Vision và Function Calling tối đa 2 vòng)
  let aiEngine: 'gemini-4-hydrogen' | 'rule-engine' = 'rule-engine';
  if (activeAi) {
    try {
      const systemWithTools = `${systemInstruction}

=== NĂNG LỰC AGENT & THỊ GIÁC MÁY TÍNH ===
- Hệ thống đã cung cấp lịch sử hội thoại nhiều lượt. Hãy nhớ ngữ cảnh trước đó.
- Nếu người dùng đính kèm ảnh chụp Camera Pi 4, hãy phân tích tư thế thực tế trong ảnh: độ thẳng trục tai-vai-hông, độ cân đối hai vai, khoảng cách tới màn hình và đề xuất chỉnh sửa cụ thể.
- Dùng query_telemetry_by_timerange khi cần tra cứu mốc giờ / khoảng ngày trên Supabase.
- Dùng get_health_risk_and_bonus_report khi hỏi về rủi ro cổ/lưng, dự báo xu hướng, Z-Score, OHPS hoặc tiền thưởng VNĐ.
- Dùng query_tasks_status khi hỏi về danh sách nhiệm vụ / tiến độ công việc.
- Dùng propose_pi4_thresholds khi yêu cầu đổi/tối ưu ngưỡng Pi 4 (thresholds hiện tại: ${JSON.stringify(thresholds || {})}).
- Dùng propose_create_task khi yêu cầu đặt nhắc nhở / giao nhiệm vụ mới.`;

      let loopContents: any[] = [...chatContents];
      for (let step = 0; step < 3; step++) {
        const resp = await activeAi.models.generateContent({
          model: geminiModel,
          contents: loopContents,
          config: {
            systemInstruction: systemWithTools,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ functionDeclarations: chatTools }],
          }
        });

        const functionCalls = resp.functionCalls;
        const candidateContent = resp.candidates?.[0]?.content;

        if (functionCalls && functionCalls.length > 0 && candidateContent && step < 2) {
          const fnResponseParts: any[] = [];
          for (const call of functionCalls) {
            const result = await executeToolCall(call.name || '', (call.args as Record<string, any>) || {});
            fnResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { result },
              },
            });
          }
          loopContents = [
            ...loopContents,
            candidateContent,
            { role: 'user', parts: fnResponseParts },
          ];
          continue;
        }

        responseText = resp.text || '';
        if (responseText) {
          aiEngine = 'gemini-4-hydrogen';
        }
        break;
      }
    } catch (primaryErr: any) {
      const primaryMsg = String(primaryErr?.message || primaryErr || '');
      const isApiKeyIssue = primaryMsg.includes('API key not valid') || 
                            primaryMsg.includes('API_KEY_INVALID') || 
                            primaryMsg.includes('PERMISSION_DENIED') ||
                            primaryErr?.status === 400 || 
                            primaryErr?.status === 403;

      if (isApiKeyIssue) {
        console.info('GEMINI_API_KEY chưa hợp lệ; /api/chat sử dụng bộ phân tích công thái học chuẩn quy tắc.');
      } else {
        console.info('Gemini AI không phản hồi; /api/chat sử dụng bộ phân tích công thái học chuẩn quy tắc.');
      }
    }
  }

  // Nếu Gemini không khả dụng hoặc không trả về nội dung, sử dụng bộ máy phân tích công thái học trên máy chủ
  if (!responseText) {
    // Phát hiện ý định thay đổi ngưỡng hoặc tạo task trong fallback mode
    const qLower = query.toLowerCase();
    const sitMinMatch = qLower.match(/ngồi\s*(?:lâu|liên tục)?\s*(?:xuống|là|còn)?\s*(\d{1,3})\s*phút/);
    const standMinMatch = qLower.match(/đứng\s*(?:mục tiêu|lên)?\s*(\d{1,2})\s*phút/);
    if ((qLower.includes('chỉnh ngưỡng') || qLower.includes('cài ngưỡng') || qLower.includes('đặt ngưỡng')) && (sitMinMatch || standMinMatch)) {
      const patch: Record<string, number> = {};
      if (sitMinMatch) patch.longSittingSec = Math.max(60, parseInt(sitMinMatch[1], 10) * 60);
      if (standMinMatch) patch.standingTargetSec = Math.max(30, parseInt(standMinMatch[1], 10) * 60);
      if (Object.keys(patch).length > 0) {
        toolCallsUsed.push('Đề xuất ngưỡng Pi 4');
        pendingAction = {
          type: 'apply_thresholds',
          summary: `Cập nhật ngưỡng qua Trợ lý AI (${sitMinMatch ? `Ngồi lâu ${sitMinMatch[1]} phút` : ''}${sitMinMatch && standMinMatch ? ', ' : ''}${standMinMatch ? `Mục tiêu đứng ${standMinMatch[1]} phút` : ''})`,
          thresholdsPatch: patch,
        };
      }
    } else if (qLower.includes('tạo nhiệm vụ') || qLower.includes('tạo nhắc nhở') || qLower.includes('nhắc tôi')) {
      toolCallsUsed.push('Đề xuất tạo nhiệm vụ');
      pendingAction = {
        type: 'create_task',
        summary: `Tạo nhắc nhở: ${query.trim().slice(0, 60)}`,
        task: {
          title: query.trim().slice(0, 80),
          content: 'Nhắc nhở công thái học tạo trực tiếp từ Trợ lý AI.',
          priority: qLower.includes('khẩn') || qLower.includes('gấp') ? 'high' : 'normal',
        },
      };
    }

    responseText = generateErgonomicAnalysisServer({
      query,
      userName,
      isAdmin,
      callerUid,
      telemetry,
      timeStats,
      combinedLogs,
      memberStatsMap,
      memberSummaryReport,
      conversationHistory,
      ohpsResult,
    });

    if (hasAttachedCameraImage) {
      responseText = `Đã tiếp nhận ảnh chụp Camera Pi 4 để đối chiếu tư thế (góc cổ hiện tại: ${telemetry?.angleNeck ?? 'đang hiệu chuẩn'}°, trạng thái: ${telemetry?.postureLabel || 'Chưa xác định'}).\n\n` +
        `Lưu ý: Phân tích thị giác sâu trên pixel ảnh yêu cầu GEMINI_API_KEY hoạt động; hiện tại hệ thống kết hợp số liệu góc MediaPipe & cảm biến MAX30102 (SQI: ${ohpsResult.sqiScore ?? '--'}/100):\n\n` +
        responseText;
    }

    if (pendingAction) {
      responseText += `\n\nTôi đã chuẩn bị sẵn đề xuất thao tác bên dưới (${pendingAction.summary}). Bạn vui lòng bấm nút xác nhận để hệ thống thực thi đồng bộ.`;
    }
  }

  // Làm sạch triệt để mọi emoji theo yêu cầu người dùng
  let cleanReply = stripAllEmojis(responseText);

  // Chỉ gắn disclaimer y tế có chọn lọc khi câu trả lời thực sự liên quan đến bệnh lý, chấn thương đĩa đệm/cột sống
  const needsDisclaimer = /thoát vị|chèn ép rễ|đĩa đệm|text neck|thần kinh tọa|hội chứng ống cổ tay|c5-c7|l4-l5/i.test(cleanReply);
  if (needsDisclaimer) {
    cleanReply += MEDICAL_DISCLAIMER;
  }

  return res.json({
    reply: cleanReply,
    aiEngine,
    sqiScore: ohpsResult.sqiScore ?? null,
    toolCallsUsed,
    pendingAction,
  });
  } catch (err: any) {
    console.error('Lỗi xử lý /api/chat:', err);
    return res.status(500).json({ error: err?.message || 'Lỗi xử lý yêu cầu phân tích công thái học' });
  }
});

// 5. Secure Supabase Telemetry Endpoints (Task S4)

// POST /api/telemetry/log: Ghi bản ghi sinh trắc học sau khi xác thực Token
app.post(['/api/telemetry/log', '/telemetry/log'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  const {
    user_id,
    user_email,
    user_name,
    bpm,
    spo2,
    posture_status,
    posture_label,
    in_zone,
    tracking_active,
    has_alert,
    device,
    created_at
  } = req.body;

  // Quyền: Người dùng thường CHỈ được ghi dữ liệu cho chính UID của họ
  const targetUserId = authUser.admin ? (user_id || authUser.uid) : authUser.uid;

  // Kiểm tra kiểu dữ liệu và khoảng giá trị sinh trắc học
  const numBpm = Number(bpm);
  const numSpo2 = Number(spo2);
  const numPosture = Number(posture_status);

  if (isNaN(numBpm) || numBpm < 0 || numBpm > 250) {
    return res.status(400).json({ error: 'Giá trị bpm không hợp lệ (cho phép từ 0 đến 250)' });
  }
  if (isNaN(numSpo2) || numSpo2 < 0 || numSpo2 > 100) {
    return res.status(400).json({ error: 'Giá trị spo2 không hợp lệ (cho phép từ 0 đến 100)' });
  }
  if (isNaN(numPosture) || !Number.isInteger(numPosture) || numPosture < -1 || numPosture > 5) {
    return res.status(400).json({ error: 'Giá trị posture_status không hợp lệ (cho phép số nguyên từ -1 đến 5)' });
  }

  const activeSupabase = resolveSupabaseClient(req);
  if (!activeSupabase) {
    return res.status(503).json({ 
      success: false, 
      error: 'Dịch vụ Supabase chưa được cấu hình. Vui lòng kiểm tra Supabase URL và Key.' 
    });
  }

  try {
    const row = {
      created_at: created_at || new Date().toISOString(),
      user_id: targetUserId,
      user_email: user_email || authUser.email || '',
      user_name: user_name || '',
      bpm: numBpm,
      spo2: numSpo2,
      posture_status: numPosture,
      posture_label: typeof posture_label === 'string' ? posture_label.slice(0, 100) : 'Chưa có dữ liệu',
      in_zone: Boolean(in_zone ?? true),
      tracking_active: Boolean(tracking_active ?? true),
      has_alert: Boolean(has_alert),
      device: typeof device === 'string' ? device.slice(0, 50) : 'pi4_node'
    };

    const { data, error } = await activeSupabase.from('telemetry_logs').insert([row]).select('id').single();
    if (error) {
      console.warn('Cảnh báo ghi log Supabase:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(201).json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('Lỗi xử lý /api/telemetry/log:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Lỗi máy chủ khi ghi log telemetry' });
  }
});

// GET /api/telemetry/history: Đọc lịch sử đo đạc an toàn
app.get(['/api/telemetry/history', '/telemetry/history'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  const emptyStats = {
    avgBpm: 0,
    avgSpo2: 0,
    totalRecords: 0,
    goodPostureRatio: 0,
    sittingCount: 0,
    standingCount: 0,
    incorrectCount: 0,
  };

  const activeSupabase = resolveSupabaseClient(req);
  if (!activeSupabase) {
    return res.status(503).json({ 
      data: [], 
      stats: emptyStats, 
      error: 'Dịch vụ Supabase chưa được cấu hình' 
    });
  }

  try {
    const timeRange = (req.query.timeRange as string) || 'day';
    const reqUserId = req.query.userId as string;
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    let query = activeSupabase
      .from('telemetry_logs')
      .select('*')
      .order('created_at', { ascending: false });

    // Quyền: Người dùng thường CHỈ được xem dữ liệu của chính UID của mình (hoặc email)
    if (!authUser.admin) {
      if (authUser.email) {
        query = query.or(`user_id.eq.${authUser.uid},user_email.eq.${authUser.email.toLowerCase().trim()}`);
      } else {
        query = query.eq('user_id', authUser.uid);
      }
    } else {
      if (reqUserId && reqUserId !== 'all') {
        query = query.eq('user_id', reqUserId);
      }
    }

    // Lọc theo mốc thời gian
    const now = new Date();
    if (timeRange === 'day') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      query = query.gte('created_at', yesterday.toISOString());
    } else if (timeRange === 'week') {
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', lastWeek.toISOString());
    } else if (timeRange === 'month') {
      const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', lastMonth.toISOString());
    }

    const { data, error } = await query.limit(limit);
    if (error) {
      console.warn('Cảnh báo truy vấn Supabase:', error.message);
      return res.status(500).json({ 
        data: [], 
        stats: emptyStats, 
        error: error.message 
      });
    }

    const records = data || [];
    let sumBpm = 0;
    let countBpm = 0;
    let sumSpo2 = 0;
    let countSpo2 = 0;
    let goodPostureCount = 0;
    let sittingCount = 0;
    let standingCount = 0;
    let incorrectCount = 0;

    records.forEach((r: any) => {
      const bpm = Number(r.bpm) || 0;
      const spo2 = Number(r.spo2) || 0;
      const st = Number(r.posture_status);

      if (bpm > 0) {
        sumBpm += bpm;
        countBpm++;
      }
      if (spo2 > 0) {
        sumSpo2 += spo2;
        countSpo2++;
      }
      if (st === 0) goodPostureCount++;
      if (st === 0 || st === 4) sittingCount++;
      if (st === 5) standingCount++;
      if (st === 1 || st === 3) incorrectCount++;
    });

    const total = records.length;
    const avgBpm = countBpm > 0 ? Math.round(sumBpm / countBpm) : 0;
    const avgSpo2 = countSpo2 > 0 ? Number((sumSpo2 / countSpo2).toFixed(1)) : 0;
    const goodRatio = total > 0 ? Math.round((goodPostureCount / total) * 100) : 0;

    return res.json({
      data: records,
      stats: {
        avgBpm,
        avgSpo2,
        totalRecords: total,
        goodPostureRatio: goodRatio,
        sittingCount,
        standingCount,
        incorrectCount,
      }
    });
  } catch (err: any) {
    console.error('Lỗi truy vấn lịch sử telemetry:', err);
    return res.status(500).json({ 
      data: [], 
      stats: emptyStats, 
      error: err?.message || 'Lỗi truy vấn lịch sử telemetry' 
    });
  }
});

// DELETE /api/telemetry/history: Chỉ dành riêng cho Quản Trị Viên (Admin)
app.delete(['/api/telemetry/history', '/telemetry/history'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  // Quyền: Client thông thường KHÔNG ĐƯỢC PHÉP XÓA
  if (!authUser.admin) {
    return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền xóa lịch sử đo đạc' });
  }

  const activeSupabase = resolveSupabaseClient(req);
  if (!activeSupabase) {
    return res.status(503).json({ success: false, error: 'Supabase chưa được cấu hình trên server' });
  }

  try {
    const targetUserId = req.query.userId as string;
    const logId = req.query.id as string;

    if (logId) {
      await activeSupabase.from('telemetry_logs').delete().eq('id', Number(logId));
      return res.json({ success: true, message: `Đã xóa bản ghi ${logId}` });
    }

    if (targetUserId === 'all') {
      await activeSupabase.from('telemetry_logs').delete().gte('id', 0);
      return res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử đo' });
    }

    if (targetUserId) {
      await activeSupabase.from('telemetry_logs').delete().eq('user_id', targetUserId);
      return res.json({ success: true, message: `Đã xóa lịch sử của user ${targetUserId}` });
    }

    return res.status(400).json({ error: 'Thiếu tham số userId hoặc id cần xóa' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Lỗi khi xóa dữ liệu' });
  }
});

// POST /api/telemetry/ohps-summary: Đồng bộ điểm năng suất OHPS vào bảng daily_ohps_summary
app.post(['/api/telemetry/ohps-summary', '/telemetry/ohps-summary'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  const {
    user_id,
    date,
    posture_score,
    break_score,
    vital_score,
    task_score,
    hes_score,
    ts_score,
    ohps_score,
    data_confidence,
    has_vital_data,
    classification
  } = req.body;

  const targetUserId = authUser.admin ? (user_id || authUser.uid) : authUser.uid;
  const activeSupabase = resolveSupabaseClient(req);
  if (!activeSupabase) {
    return res.status(503).json({ success: false, error: 'Dịch vụ Supabase chưa được cấu hình' });
  }

  const todayStr = date || new Date().toISOString().slice(0, 10);
  const numPosture = Math.min(100, Math.max(0, Math.round(Number(posture_score) || 0)));
  const numBreak = Math.min(100, Math.max(0, Math.round(Number(break_score) || 0)));
  const hasVital = has_vital_data !== false && Number(vital_score) !== -1;
  const numVital = hasVital 
    ? Math.min(100, Math.max(0, Math.round(Number(vital_score) || 0))) 
    : -1;
  const numTask = Math.min(100, Math.max(0, Math.round(Number(task_score) || 0)));
  const numHes = Math.min(100, Math.max(0, Math.round(Number(hes_score ?? ohps_score) || 0)));
  const numTs = Math.min(100, Math.max(0, Math.round(Number(ts_score ?? task_score ?? 0) || 0)));
  const numOhps = Math.min(100, Math.max(0, Math.round(Number(ohps_score) || 0)));
  const numConfidence = Math.min(100, Math.max(0, Math.round(Number(data_confidence ?? 100))));

  // Chỉ bao gồm chính xác các trường có trong bảng public.daily_ohps_summary
  const summaryRow = {
    user_id: targetUserId,
    date: todayStr,
    posture_score: numPosture,
    break_score: numBreak,
    vital_score: numVital,
    task_score: numTask,
    hes_score: numHes,
    ts_score: numTs,
    ohps_score: numOhps,
    data_confidence: numConfidence,
    has_vital_data: hasVital,
  };

  try {
    const { error } = await activeSupabase
      .from('daily_ohps_summary')
      .upsert(summaryRow, { onConflict: 'user_id,date' });

    if (error) {
      console.warn('Lỗi upsert daily_ohps_summary, thử insert fallback:', error.message);
      const fallbackInsert = await activeSupabase.from('daily_ohps_summary').insert([summaryRow]);
      if (fallbackInsert.error) {
        const fallbackUpdate = await activeSupabase
          .from('daily_ohps_summary')
          .update(summaryRow)
          .eq('user_id', targetUserId)
          .eq('date', todayStr);

        if (fallbackUpdate.error) {
          return res.status(500).json({ success: false, error: fallbackUpdate.error.message });
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Đã đồng bộ điểm OHPS lên Supabase thành công!', 
      date: todayStr,
      score: summaryRow.ohps_score
    });
  } catch (err: any) {
    console.error('Lỗi khi lưu daily_ohps_summary:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Lỗi máy chủ khi lưu OHPS' });
  }
});

// GET /api/telemetry/ohps-summary: Đọc lịch sử điểm OHPS
app.get(['/api/telemetry/ohps-summary', '/telemetry/ohps-summary'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  const targetUserId = authUser.admin ? ((req.query.userId as string) || authUser.uid) : authUser.uid;
  const activeSupabase = resolveSupabaseClient(req);
  if (!activeSupabase) {
    return res.status(503).json({ success: false, error: 'Dịch vụ Supabase chưa được cấu hình' });
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    let q = activeSupabase
      .from('daily_ohps_summary')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    if (targetUserId && targetUserId !== 'all') {
      q = q.eq('user_id', targetUserId);
    }

    const { data, error } = await q;
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Lỗi truy vấn OHPS summary' });
  }
});

// 6. AI Predictive Analytics & Multi-Purpose Data Exploitation Endpoint (Gemini 4 Hydrogen)
const predictRateLimits = new Map<string, { count: number; resetAt: number }>();

interface PredictiveRiskDomain {
  domain: string;
  probabilityPercent: number;
  severity: 'Thấp' | 'Trung bình' | 'Cao';
  timeframe: string;
  evidence: string;
  preventiveAction: string;
}

interface AIPredictionPayload {
  engine: 'gemini-4-hydrogen' | 'statistical-engine';
  generatedAt: string;
  targetName: string;
  recordCountAnalyzed: number;
  executiveSummary: string;
  predictedOhpsNextShift: {
    score: number;
    confidencePercent: number;
    trendLabel: string;
    reasoning: string;
  };
  next2HourForecast: {
    statusSummary: string;
    postureRiskPercent: number;
    recommendedActionNow: string;
  };
  vitalForecastSummary: string;
  goldenHours: string;
  slumpWarningWindow: string;
  breakScheduleRecommendation: string;
  riskForecasts: PredictiveRiskDomain[];
  recommendedTasks: Array<{
    title: string;
    content: string;
    priority: 'normal' | 'high' | 'urgent';
  }>;
  aiNote?: string;
}

function buildDeterministicForecast(params: {
  targetName: string;
  recordCount: number;
  analyticsSummary: any;
  dailySummaries: any[];
  aiNote?: string;
}): AIPredictionPayload {
  const { targetName, recordCount, analyticsSummary, dailySummaries, aiNote } = params;
  const ohps = analyticsSummary?.ohpsForecast || {
    currentScore: 80,
    predictedScore: 82,
    delta: 2,
    confidencePercent: 60,
    trendLabel: 'Ổn định',
    trendReason: 'Xu hướng ổn định dựa trên dữ liệu đã thu thập.'
  };
  const fatigue = analyticsSummary?.postureFatigue || {
    neckSpineRiskPercent: 28,
    lumbarRiskPercent: 32,
    overallRiskLevel: 'Trung bình',
    predictedMinutesUntilSlouch: 32,
    badPostureSharePercent: 18
  };
  const vital = analyticsSummary?.vitalCorrelation || {
    goodPostureAvgBpm: 74,
    badPostureAvgBpm: 79,
    bpmDriftOnSlouch: 5,
    goodPostureAvgSpo2: 98,
    badPostureAvgSpo2: 97,
    spo2DriftOnSlouch: -1,
    anomalyCount: 0,
    stressIndex: 28
  };
  const vitalForecast = analyticsSummary?.vitalForecast || {
    summaryText: 'Sinh hiệu ổn định trong dải cho phép.'
  };
  const immediate2h = analyticsSummary?.immediate2hRisk || {
    postureRiskPercent: Math.max(fatigue.neckSpineRiskPercent, fatigue.lumbarRiskPercent),
    minutesToNextBreak: fatigue.predictedMinutesUntilSlouch || 30,
    headline: `Nên đứng dậy giãn cơ sau ~${fatigue.predictedMinutesUntilSlouch || 30} phút.`
  };
  const circadian = analyticsSummary?.circadian || {
    goldenHoursWindow: '09:00 - 11:00',
    slumpRiskWindow: '14:00 - 15:30'
  };
  const cadence = analyticsSummary?.recommendedBreakCadence || {
    sitMinutes: 40,
    standMinutes: 5,
    eyeBreakSeconds: 20,
    rationale: 'Chu kỳ đứng-ngồi cân bằng.'
  };
  const suggestedTasks = Array.isArray(analyticsSummary?.suggestedTasks)
    ? analyticsSummary.suggestedTasks.slice(0, 3).map((t: any) => ({
        title: String(t.title || 'Nghỉ giải lao giãn cơ'),
        content: String(t.content || 'Đứng dậy đi lại 3 phút.'),
        priority: t.priority === 'urgent' || t.priority === 'high' ? t.priority : 'normal' as const
      }))
    : [];

  const recentOhpsText = dailySummaries.length > 0
    ? `Chuỗi ${dailySummaries.length} ngày gần nhất đạt TB ${Math.round(dailySummaries.reduce((s, r) => s + Number(r.ohps_score || 0), 0) / dailySummaries.length)}đ.`
    : '';

  return {
    engine: 'statistical-engine',
    generatedAt: new Date().toISOString(),
    targetName,
    recordCountAnalyzed: recordCount,
    executiveSummary: `${targetName} (${recordCount} mẫu): Dự báo OHPS ca tới ${ohps.predictedScore}/100 (${ohps.delta >= 0 ? '+' : ''}${ohps.delta}đ · ${ohps.trendLabel}). ${recentOhpsText} ${ohps.trendReason}`.trim(),
    predictedOhpsNextShift: {
      score: Number(ohps.predictedScore || 80),
      confidencePercent: Number(ohps.confidencePercent || 65),
      trendLabel: String(ohps.trendLabel || 'Ổn định'),
      reasoning: String(ohps.trendReason || 'Tổng hợp từ chuỗi tư thế và sinh hiệu.')
    },
    next2HourForecast: {
      statusSummary: String(immediate2h.headline),
      postureRiskPercent: Number(immediate2h.postureRiskPercent || 30),
      recommendedActionNow: `Ngồi ${cadence.sitMinutes}p : Đứng ${cadence.standMinutes}p · Nghỉ giải lao sau ~${immediate2h.minutesToNextBreak} phút.`
    },
    vitalForecastSummary: String(vitalForecast.summaryText),
    goldenHours: circadian.goldenHoursWindow,
    slumpWarningWindow: circadian.slumpRiskWindow,
    breakScheduleRecommendation: `Ngồi ${cadence.sitMinutes} phút, đứng ${cadence.standMinutes} phút, nghỉ mắt 20s mỗi 20 phút.`,
    riskForecasts: [
      {
        domain: 'Cột sống cổ & Vai gáy (C5-C7)',
        probabilityPercent: Number(fatigue.neckSpineRiskPercent || 25),
        severity: fatigue.neckSpineRiskPercent >= 60 ? 'Cao' : fatigue.neckSpineRiskPercent >= 32 ? 'Trung bình' : 'Thấp',
        timeframe: `Trong ~${fatigue.predictedMinutesUntilSlouch} phút ngồi tới`,
        evidence: `Tỷ lệ cúi cổ/gù chiếm ${fatigue.badPostureSharePercent}% thời gian ngồi.`,
        preventiveAction: 'Nâng màn hình ngang tầm mắt và tập 5 nhịp Thu Cằm (Chin Tuck).'
      },
      {
        domain: 'Đĩa đệm Thắt lưng (L4-L5)',
        probabilityPercent: Number(fatigue.lumbarRiskPercent || 30),
        severity: fatigue.lumbarRiskPercent >= 60 ? 'Cao' : fatigue.lumbarRiskPercent >= 32 ? 'Trung bình' : 'Thấp',
        timeframe: `Khung ${circadian.slumpRiskWindow}`,
        evidence: 'Tải trọng đĩa đệm tăng khi ngồi liên tục thiếu nhịp đứng xen kẽ.',
        preventiveAction: `Đứng dậy sau mỗi ${cadence.sitMinutes} phút và tựa lưng góc 105°.`
      },
      {
        domain: 'Stress & Nhịp tim (BPM)',
        probabilityPercent: Number(vital.stressIndex || 25),
        severity: vital.stressIndex >= 60 ? 'Cao' : vital.stressIndex >= 35 ? 'Trung bình' : 'Thấp',
        timeframe: `Lệch +${Math.max(0, vital.bpmDriftOnSlouch)} BPM khi ngồi sai`,
        evidence: `Ngồi chuẩn ${vital.goodPostureAvgBpm || '--'} BPM vs sai tư thế ${vital.badPostureAvgBpm || '--'} BPM (${vital.anomalyCount} bất thường).`,
        preventiveAction: 'Thở chậm 4-7-8 trong 60 giây khi nhịp tim tăng cao.'
      },
      {
        domain: 'Suy giảm Oxy (SpO2)',
        probabilityPercent: vital.badPostureAvgSpo2 > 0 && vital.badPostureAvgSpo2 < 95 ? 62 : 18,
        severity: vital.badPostureAvgSpo2 > 0 && vital.badPostureAvgSpo2 < 95 ? 'Cao' : 'Thấp',
        timeframe: `Khung ${circadian.slumpRiskWindow}`,
        evidence: `SpO2 trung bình ${vital.goodPostureAvgSpo2 || '--'}% (chênh ${vital.spo2DriftOnSlouch}% khi gù).`,
        preventiveAction: 'Mở thoáng khí và ngồi thẳng lưng để mở rộng lồng ngực.'
      }
    ],
    recommendedTasks: suggestedTasks,
    aiNote
  };
}

app.post(['/api/ai-predict', '/ai-predict'], async (req: Request, res: Response) => {
  const authUser = await verifyAuthToken(req, res);
  if (!authUser) return;

  const now = Date.now();
  const rate = predictRateLimits.get(authUser.uid) || { count: 0, resetAt: now + 60000 };
  if (now > rate.resetAt) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  if (rate.count >= 12) {
    return res.status(429).json({
      error: 'Bạn đã vượt quá giới hạn phân tích dự báo AI (tối đa 12 lượt/phút). Vui lòng thử lại sau giây lát.'
    });
  }
  rate.count++;
  predictRateLimits.set(authUser.uid, rate);

  try {
    const {
      targetMemberId,
      targetMemberName,
      userName = 'Người dùng',
      analyticsSummary,
      recentLogs = [],
      userProfile = {},
      thresholds = {}
    } = req.body || {};

    const isAdmin = authUser.admin;
    const targetUserId = isAdmin && targetMemberId && targetMemberId !== 'all'
      ? String(targetMemberId)
      : (isAdmin && targetMemberId === 'all' ? 'all' : authUser.uid);

    const resolvedTargetName = isAdmin && targetMemberId === 'all'
      ? 'Toàn bộ đội ngũ'
      : String(targetMemberName || userName || 'Người dùng');

    const activeSupabase = resolveSupabaseClient(req);
    let dbLogs: any[] = [];
    let dailySummaries: any[] = [];

    if (activeSupabase) {
      try {
        let logQuery = activeSupabase
          .from('telemetry_logs')
          .select('id, user_id, user_name, bpm, spo2, posture_status, posture_label, has_alert, created_at')
          .order('created_at', { ascending: false })
          .limit(180);

        if (targetUserId !== 'all') {
          logQuery = logQuery.eq('user_id', targetUserId);
        }

        const { data: fetchedLogs } = await logQuery;
        if (Array.isArray(fetchedLogs)) {
          dbLogs = fetchedLogs;
        }

        let summaryQuery = activeSupabase
          .from('daily_ohps_summary')
          .select('user_id, date, posture_score, break_score, vital_score, task_score, hes_score, ohps_score, data_confidence')
          .order('date', { ascending: false })
          .limit(14);

        if (targetUserId !== 'all') {
          summaryQuery = summaryQuery.eq('user_id', targetUserId);
        }

        const { data: fetchedSummaries } = await summaryQuery;
        if (Array.isArray(fetchedSummaries)) {
          dailySummaries = fetchedSummaries;
        }
      } catch (dbErr) {
        console.warn('Cảnh báo truy vấn dữ liệu dự báo Supabase:', dbErr);
      }
    }

    const clientSlice = Array.isArray(recentLogs) ? recentLogs.slice(0, 60) : [];
    const totalRecordCount = Math.max(
      Number(analyticsSummary?.sampleCount || 0),
      dbLogs.length,
      clientSlice.length
    );

    const activeAi = getGeminiClient();
    if (!activeAi) {
      const fallbackPayload = buildDeterministicForecast({
        targetName: resolvedTargetName,
        recordCount: totalRecordCount,
        analyticsSummary,
        dailySummaries,
        aiNote: 'Đang sử dụng bộ phân tích định lượng nội bộ. Thiết lập GEMINI_API_KEY trong Settings > Secrets để bật Gemini 4 AI.'
      });
      return res.json(fallbackPayload);
    }

    const compactDbSample = dbLogs.slice(0, 45).map(l => ({
      t: l.created_at,
      bpm: l.bpm,
      spo2: l.spo2,
      st: l.posture_status,
      lbl: l.posture_label,
      alert: l.has_alert
    }));

    const compactClientSample = clientSlice.slice(0, 35).map((l: any) => ({
      t: l.timestamp,
      bpm: l.bpm,
      spo2: l.spo2,
      st: l.postureStatus,
      lbl: l.postureLabel,
      alert: l.hasAlert
    }));

    const predictionPrompt = `Phân tích dữ liệu IoT công thái học & sinh trắc học cho: "${resolvedTargetName}".

1. HỒ SƠ & NGƯỠNG:
${JSON.stringify({
  age: userProfile?.age,
  gender: userProfile?.gender,
  bmi: userProfile?.height && userProfile?.weight
    ? Number((userProfile.weight / Math.pow(userProfile.height / 100, 2)).toFixed(1))
    : undefined,
  medicalConditions: userProfile?.medicalConditions || [],
  thresholds
})}

2. CHỈ SỐ MÔ HÌNH ĐỊNH LƯỢNG (WLS · EWMA · Z-SCORE · VITAL):
${JSON.stringify({
  sampleCount: totalRecordCount,
  avgBpm: analyticsSummary?.avgBpm,
  avgSpo2: analyticsSummary?.avgSpo2,
  goodPostureRatio: analyticsSummary?.goodPostureRatio,
  modelMetrics: analyticsSummary?.modelMetrics,
  ohpsForecast: analyticsSummary?.ohpsForecast,
  postureFatigue: analyticsSummary?.postureFatigue,
  vitalCorrelation: analyticsSummary?.vitalCorrelation,
  vitalForecast: analyticsSummary?.vitalForecast,
  immediate2hRisk: analyticsSummary?.immediate2hRisk,
  circadian: {
    goldenHoursWindow: analyticsSummary?.circadian?.goldenHoursWindow,
    slumpRiskWindow: analyticsSummary?.circadian?.slumpRiskWindow
  }
})}

3. LỊCH SỬ OHPS (daily_ohps_summary):
${JSON.stringify(dailySummaries)}

4. MẪU CẢM BIẾN GẦN NHẤT:
${JSON.stringify(compactDbSample.length > 0 ? compactDbSample : compactClientSample)}

Hãy dự báo ngắn gọn, thực tế, đi thẳng vào số liệu và hành động can thiệp (KHÔNG viết lý thuyết dài dòng, KHÔNG dùng emoji).`;

    try {
      const response = await activeAi.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: predictionPrompt,
        config: {
          systemInstruction:
            'Bạn là Chuyên gia Dự báo Công thái học & Sinh trắc học. Chỉ xuất nhận định ngắn gọn, định lượng cao và hành động thực tế ngay trên dữ liệu Pi 4. Tuyệt đối KHÔNG viết lý thuyết giáo trình dài dòng, KHÔNG dùng emoji. Trả về đúng JSON schema.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: {
                type: Type.STRING,
                description: 'Nhận định cốt lõi dài 1-2 câu dựa trực tiếp trên số liệu.'
              },
              predictedOhpsNextShift: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.INTEGER },
                  confidencePercent: { type: Type.INTEGER },
                  trendLabel: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                },
                required: ['score', 'confidencePercent', 'trendLabel', 'reasoning']
              },
              next2HourForecast: {
                type: Type.OBJECT,
                properties: {
                  statusSummary: { type: Type.STRING },
                  postureRiskPercent: { type: Type.INTEGER },
                  recommendedActionNow: { type: Type.STRING }
                },
                required: ['statusSummary', 'postureRiskPercent', 'recommendedActionNow']
              },
              vitalForecastSummary: {
                type: Type.STRING,
                description: 'Tóm tắt 1 câu về xu hướng BPM và SpO2.'
              },
              goldenHours: { type: Type.STRING },
              slumpWarningWindow: { type: Type.STRING },
              breakScheduleRecommendation: { type: Type.STRING },
              riskForecasts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    domain: { type: Type.STRING },
                    probabilityPercent: { type: Type.INTEGER },
                    severity: { type: Type.STRING },
                    timeframe: { type: Type.STRING },
                    evidence: { type: Type.STRING },
                    preventiveAction: { type: Type.STRING }
                  },
                  required: ['domain', 'probabilityPercent', 'severity', 'timeframe', 'evidence', 'preventiveAction']
                }
              },
              recommendedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    priority: { type: Type.STRING }
                  },
                  required: ['title', 'content', 'priority']
                }
              }
            },
            required: [
              'executiveSummary',
              'predictedOhpsNextShift',
              'next2HourForecast',
              'vitalForecastSummary',
              'goldenHours',
              'slumpWarningWindow',
              'breakScheduleRecommendation',
              'riskForecasts',
              'recommendedTasks'
            ]
          }
        }
      });

      const rawJson = (response.text ?? '').trim();
      const parsed = JSON.parse(rawJson);

      const payload: AIPredictionPayload = {
        engine: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
        targetName: resolvedTargetName,
        recordCountAnalyzed: totalRecordCount,
        executiveSummary: stripAllEmojis(String(parsed.executiveSummary || '')),
        predictedOhpsNextShift: {
          score: Math.min(100, Math.max(0, Math.round(Number(parsed.predictedOhpsNextShift?.score || 80)))),
          confidencePercent: Math.min(99, Math.max(20, Math.round(Number(parsed.predictedOhpsNextShift?.confidencePercent || 75)))),
          trendLabel: stripAllEmojis(String(parsed.predictedOhpsNextShift?.trendLabel || 'Ổn định')),
          reasoning: stripAllEmojis(String(parsed.predictedOhpsNextShift?.reasoning || ''))
        },
        next2HourForecast: {
          statusSummary: stripAllEmojis(String(parsed.next2HourForecast?.statusSummary || '')),
          postureRiskPercent: Math.min(100, Math.max(0, Math.round(Number(parsed.next2HourForecast?.postureRiskPercent || 30)))),
          recommendedActionNow: stripAllEmojis(String(parsed.next2HourForecast?.recommendedActionNow || ''))
        },
        vitalForecastSummary: stripAllEmojis(String(parsed.vitalForecastSummary || '')),
        goldenHours: stripAllEmojis(String(parsed.goldenHours || analyticsSummary?.circadian?.goldenHoursWindow || '09:00 - 11:00')),
        slumpWarningWindow: stripAllEmojis(String(parsed.slumpWarningWindow || analyticsSummary?.circadian?.slumpRiskWindow || '14:00 - 15:30')),
        breakScheduleRecommendation: stripAllEmojis(String(parsed.breakScheduleRecommendation || '')),
        riskForecasts: Array.isArray(parsed.riskForecasts)
          ? parsed.riskForecasts.slice(0, 4).map((r: any) => ({
              domain: stripAllEmojis(String(r.domain || '')),
              probabilityPercent: Math.min(100, Math.max(0, Math.round(Number(r.probabilityPercent || 0)))),
              severity: r.severity === 'Cao' || r.severity === 'Thấp' ? r.severity : 'Trung bình',
              timeframe: stripAllEmojis(String(r.timeframe || '')),
              evidence: stripAllEmojis(String(r.evidence || '')),
              preventiveAction: stripAllEmojis(String(r.preventiveAction || ''))
            }))
          : [],
        recommendedTasks: Array.isArray(parsed.recommendedTasks)
          ? parsed.recommendedTasks.slice(0, 3).map((t: any) => ({
              title: stripAllEmojis(String(t.title || 'Nghỉ giải lao công thái học')),
              content: stripAllEmojis(String(t.content || '')),
              priority: t.priority === 'urgent' || t.priority === 'high' ? t.priority : 'normal'
            }))
          : []
      };

      return res.json(payload);
    } catch (geminiErr: any) {
      const errMsg = String(geminiErr?.message || geminiErr || '');
      const isApiKeyIssue = errMsg.includes('API key not valid') ||
                            errMsg.includes('API_KEY_INVALID') ||
                            errMsg.includes('PERMISSION_DENIED') ||
                            geminiErr?.status === 400 ||
                            geminiErr?.status === 403;

      if (isApiKeyIssue) {
        console.info('GEMINI_API_KEY chưa hợp lệ; /api/ai-predict chuyển sang Statistical Trend Engine.');
      } else {
        console.info('Gemini 4 AI tạm thời gián đoạn; /api/ai-predict chuyển sang Statistical Trend Engine.');
      }

      const fallbackPayload = buildDeterministicForecast({
        targetName: resolvedTargetName,
        recordCount: totalRecordCount,
        analyticsSummary,
        dailySummaries,
        aiNote: isApiKeyIssue
          ? 'GEMINI_API_KEY hiện tại không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra và cập nhật lại API key trong mục Settings > Secrets; hệ thống đang sử dụng bộ phân tích định lượng nội bộ.'
          : 'Đã tự động kích hoạt bộ phân tích hồi quy nội bộ do dịch vụ Gemini AI tạm thời không phản hồi.'
      });
      return res.json(fallbackPayload);
    }
  } catch (err: any) {
    console.error('Lỗi /api/ai-predict:', err);
    return res.status(500).json({ error: err?.message || 'Lỗi xử lý phân tích dự báo AI' });
  }
});


async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} (0.0.0.0)`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is already in use. Existing process is serving requests.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
