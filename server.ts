import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI
const ai = new GoogleGenAI();

// Initialize Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://chftlvnbzudreqfsyeyj.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_WS4U8dfrADrf0dCeE37Nuw_xeNzcN6G';
const supabase = createClient(supabaseUrl, supabaseKey);

// Endpoint Chatbot AI Sức khỏe & Công thái học
app.post('/api/chat', async (req: Request, res: Response) => {
  const { 
    query, 
    telemetry, 
    history = [], 
    timeStats, 
    userName = 'Người dùng',
    userId,
    role = 'employee',
    targetMemberName,
    targetMemberId,
    allUsers = []
  } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Thiếu nội dung câu hỏi (query)' });
  }

  const isAdmin = role === 'admin' || role === 'manager';

  // 1. Lấy dữ liệu thực tế trực tiếp từ Supabase PostgreSQL
  let supabaseLogs: any[] = [];
  try {
    let q = supabase
      .from('telemetry_logs')
      .select('id, user_id, user_name, user_email, bpm, spo2, posture_status, posture_label, has_alert, created_at')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      // Nhân viên chỉ được xem dữ liệu của chính mình
      if (userId) {
        q = q.eq('user_id', userId);
      }
      q = q.limit(80);
    } else {
      // ADMIN: Kiểm tra phạm vi truy vấn
      if (targetMemberId && targetMemberId !== 'all') {
        q = q.eq('user_id', targetMemberId).limit(100);
      } else if (targetMemberName && targetMemberName !== 'all') {
        q = q.ilike('user_name', `%${targetMemberName}%`).limit(100);
      } else {
        // Kiểm tra xem trong câu hỏi Admin có nhắc trực tiếp tên của nhân viên nào không
        const mentionedUser = Array.isArray(allUsers) 
          ? allUsers.find((u: any) => {
              const name = (u.fullName || u.username || '').toLowerCase();
              return name && name.length >= 3 && query.toLowerCase().includes(name);
            })
          : null;

        if (mentionedUser) {
          // Lấy logs của nhân viên được nhắc đến trước, đồng thời lấy thêm các bản ghi khác
          const { data: specificData } = await supabase
            .from('telemetry_logs')
            .select('id, user_id, user_name, user_email, bpm, spo2, posture_status, posture_label, has_alert, created_at')
            .eq('user_id', mentionedUser.id)
            .order('created_at', { ascending: false })
            .limit(60);
          
          if (specificData && specificData.length > 0) {
            supabaseLogs.push(...specificData);
          }
        }
        q = q.limit(120);
      }
    }

    const { data } = await q;
    if (data && data.length > 0) {
      supabaseLogs.push(...data);
    }
  } catch (e) {
    console.warn('Lỗi đọc log Supabase:', e);
  }

  // Kết hợp logs từ client và Supabase (loại bỏ trùng lặp dựa trên id hoặc user+timestamp)
  const combinedLogs: any[] = [];
  const seen = new Set<string>();

  // Ưu tiên logs Supabase
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

  // Bổ sung logs client truyền lên nếu có
  (history || []).forEach((h: any) => {
    const key = h.id ? String(h.id) : `${h.userId || 'curr'}_${h.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      combinedLogs.push({
        id: h.id,
        userName: h.userName || userName,
        userEmail: h.userEmail,
        userId: h.userId,
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

  // Sắp xếp giảm dần theo thời gian
  combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Tính bảng tổng hợp thống kê cho từng thành viên (Dành riêng cho Admin)
  const memberStatsMap: Record<string, {
    userName: string;
    userEmail?: string;
    total: number;
    good: number;
    bad: number;
    standing: number;
    alerts: number;
    sumBpm: number;
    countBpm: number;
    sumSpo2: number;
    countSpo2: number;
    latestPosture?: string;
    latestTime?: string;
  }> = {};

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

  const memberSummaryReport = Object.values(memberStatsMap).map(s => {
    const goodRatio = s.total > 0 ? Math.round((s.good / s.total) * 100) : 0;
    const avgBpm = s.countBpm > 0 ? Math.round(s.sumBpm / s.countBpm) : 0;
    const avgSpo2 = s.countSpo2 > 0 ? Number((s.sumSpo2 / s.countSpo2).toFixed(1)) : 0;
    return `- Thành viên: **${s.userName}** (${s.userEmail || 'Chưa có email'}) | Tổng bản ghi: ${s.total} | Ngồi đúng: ${s.good} (${goodRatio}%) | Ngồi sai/gù: ${s.bad} | Cảnh báo: ${s.alerts} lần | Nhịp tim TB: ${avgBpm > 0 ? `${avgBpm} BPM` : 'N/A'} | SpO2 TB: ${avgSpo2 > 0 ? `${avgSpo2}%` : 'N/A'} | Trạng thái gần nhất: "${s.latestPosture}" lúc ${s.latestTime}`;
  }).join('\n');

  // Danh sách các thành viên xuất hiện
  const memberNames = Object.values(memberStatsMap).map(s => s.userName);

  const historySnippet = combinedLogs.slice(0, 60).map((h, i) => {
    return `[#${i + 1}] Thành viên: ${h.userName} (${h.userEmail || h.userId || 'N/A'}) | Lúc: ${h.timeStr} ngày ${h.dateStr} | Tư thế: ${h.posture} (Mã: ${h.postureStatus}) | Nhịp tim: ${h.bpm} BPM | SpO2: ${h.spo2}% | Cảnh báo: ${h.hasAlert ? 'CÓ (Nguy cơ)' : 'Bình thường'}`;
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
- Thống kê thời gian làm việc hôm nay của phiên:
  + Tổng thời gian ngồi: ${Math.floor((timeStats.sittingSeconds || 0) / 60)} phút
  + Thời gian ngồi sai tư thế: ${Math.floor((timeStats.badPostureSeconds || 0) / 60)} phút
  + Thời gian đứng / vận động: ${Math.floor(((timeStats.standingSeconds || 0) + (timeStats.movingSeconds || 0)) / 60)} phút
` : '';

  const systemInstruction = `Bạn là Trợ Lý Công Thái Học & Bác Sĩ Sức Khỏe AI trực thuộc Hệ Thống Theo Dõi Sức Khỏe IoT.
Người đang trò chuyện với bạn: "${userName}" (Vai trò: ${role.toUpperCase()}).
Thời gian hiện tại: ${new Date().toLocaleString('vi-VN')}.
${isAdmin ? `ĐẶC QUYỀN CỦA QUẢN TRỊ VIÊN (ADMIN/MANAGER):
- Bạn CÓ TOÀN QUYỀN truy xuất, đối chiếu và phân tích dữ liệu của tất cả các thành viên trong công ty.
- Danh sách các thành viên hiện có trong hệ thống: ${memberNames.join(', ') || 'Chưa có thành viên nào'}.
- Khi Admin hỏi về một nhân viên cụ thể (ví dụ: "Trần Thị Nhân Viên lúc 16h44 ngồi đúng hay sai?", "Nguyễn Văn A hôm nay nhịp tim thế nào?", "Tài Thành có bị cảnh báo không?"): Hãy dò tìm chính xác các bản ghi của thành viên đó tại mốc thời gian được hỏi!
- Khi Admin hỏi chung hoặc so sánh (ví dụ: "Ai ngồi sai tư thế nhiều nhất hôm nay?", "So sánh nhịp tim và tư thế của các nhân viên", "Tổng quan toàn bộ nhân viên"): Hãy căn cứ vào [BẢNG TỔNG HỢP THỐNG KÊ TỪNG THÀNH VIÊN] để đưa ra câu trả lời trực diện, nêu rõ tên người ngồi sai nhiều nhất, tỷ lệ ngồi đúng, nhịp tim và số lần cảnh báo.` : `CHÚ Ý PHÂN QUYỀN: Người dùng là Nhân viên thông thường, chỉ giải đáp và báo cáo dữ liệu cá nhân của chính họ.`}

QUY TẮC PHẢN HỒI:
1. Trả lời trực diện, chính xác:
   - Nếu hỏi mốc giờ cụ thể: Nêu rõ đúng mốc giờ đó thành viên đang ngồi ĐÚNG hay SAI, nhịp tim bao nhiêu, có cảnh báo hay không.
   - Nếu hỏi "Ai ngồi sai nhiều nhất": Chỉ đích danh thành viên có số lần sai tư thế cao nhất hoặc tỷ lệ ngồi đúng thấp nhất kèm số liệu cụ thể.
2. Đánh giá y tế chuyên sâu: Giải thích nguyên nhân tại sao tư thế đó gây hại (cúi đầu đè nặng cột sống cổ C5-C7, gù lưng chèn ép đĩa đệm thắt lưng L4-L5).
3. Đưa ra lời khuyên thực tế: Nhắc nhở điều chỉnh độ cao bàn ghế, bài tập vươn vai 30 giây, quy tắc 20-20-20.
4. Phong cách: Tiếng Việt chuẩn mực, in đậm **kết quả chính**, dùng bullet points, emoji y tế phù hợp (✅, ⚠️, 🩺, 📐, 💡), súc tích đi thẳng vào câu trả lời.`;

  const prompt = `DỮ LIỆU ĐO ĐẠC TRỰC TIẾP:
${liveState}
${timeContext}

${isAdmin ? `BẢNG TỔNG HỢP THỐNG KÊ TỪNG THÀNH VIÊN TRÊN SUPABASE:
${memberSummaryReport || '(Chưa có bản ghi thống kê nào)'}\n` : ''}
LỊCH SỬ ĐO ĐẠC CHI TIẾT TRÊN SUPABASE:
${historySnippet || '(Hiện danh sách lịch sử đang trống)'}

${targetMemberName ? `[LƯU Ý: Admin đang chỉ định xem xét thành viên: "${targetMemberName}"]\n` : ''}
CÂU HỎI CỦA NGƯỜI DÙNG:
"${query}"

Hãy trả lời câu hỏi thật chính xác và súc tích dựa trên dữ liệu trên:`;

  try {
    let responseText = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });
      responseText = response.text || '';
    } catch (err: any) {
      console.warn('Gemini 3.8 Flash bận, chuyển sang gemini-3.1-flash-lite:', err?.status || err?.message);
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });
      responseText = fallbackResponse.text || '';
    }

    return res.json({ reply: responseText });
  } catch (err: any) {
    console.error('Lỗi gọi Gemini API:', err);
    return res.status(500).json({ 
      error: 'Lỗi xử lý AI', 
      details: err?.message || 'Không thể kết nối Gemini API' 
    });
  }
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} (0.0.0.0)`);
  });
}

startServer();
