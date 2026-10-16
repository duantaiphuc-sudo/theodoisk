import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, 
  Send, 
  Bot, 
  Sparkles, 
  Clock, 
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Activity,
  MessageSquare,
  ShieldCheck,
  ChevronDown,
  Users
} from 'lucide-react';
import { HealthTelemetry, UserRole, ChatMessage, TelemetryLog, TimeCalculations, AuthUser } from '../types';
import { getAuth } from 'firebase/auth';
import { initializeFirebaseApp, getSavedFirebaseConfig } from '../services/firebase';

interface HealthChatbotProps {
  telemetry: HealthTelemetry;
  role: UserRole;
  sittingSeconds: number;
  badPostureSeconds: number;
  hasData: boolean;
  userName?: string;
  userId?: string;
  history?: TelemetryLog[];
  timeStats?: TimeCalculations;
  allUsers?: AuthUser[];
}

export const HealthChatbot: React.FC<HealthChatbotProps> = ({
  telemetry,
  role,
  sittingSeconds,
  badPostureSeconds,
  hasData,
  userName = 'bạn',
  userId,
  history = [],
  timeStats,
  allUsers = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const isAdmin = role === 'admin' || role === 'manager';

  const selectedMemberObj = useMemo(() => {
    if (selectedMemberId === 'all') return null;
    return allUsers.find(u => u.id === selectedMemberId) || null;
  }, [selectedMemberId, allUsers]);

  const selectedMemberName = selectedMemberObj ? (selectedMemberObj.fullName || selectedMemberObj.username) : 'Tất cả';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'bot',
      text: isAdmin 
        ? `Chào Quản trị viên **${userName}**! Tôi là **Trợ Lý AI Công Thái Học & Quản Trị Nhân Sự**.\n\nTôi có toàn quyền truy xuất dữ liệu của **toàn bộ thành viên** trong công ty từ Supabase:\n- *"Trần Thị Nhân Viên lúc 16h44 ngồi đúng hay sai?"*\n- *"Ai là người ngồi sai tư thế nhiều nhất hôm nay?"*\n- *"Tài Thành nhịp tim và tư thế hôm nay thế nào?"*\n\nBạn có thể chọn thành viên ở thanh trên hoặc hỏi trực tiếp tên bất kỳ ai!`
        : `Chào **${userName}**! Tôi là **Trợ Lý Công Thái Học & Sức Khỏe AI**, kết nối trực tiếp với cảm biến IoT và Supabase.\n\nTôi có thể tra cứu chính xác lịch sử theo từng phút, ví dụ:\n- *"Lúc 15h50 tôi ngồi đúng hay sai?"*\n- *"Hôm nay nhịp tim trung bình của tôi là bao nhiêu?"*\n- *"Tôi đã ngồi liên tục bao lâu rồi?"*`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  // Quick suggestion prompts dynamically adapt for Admin and selected member
  const suggestions = useMemo(() => {
    if (isAdmin) {
      if (selectedMemberId === 'all') {
        return [
          'Ai ngồi sai tư thế nhiều nhất hôm nay?',
          'So sánh nhịp tim và tư thế các thành viên',
          'Có nhân viên nào đang bị cảnh báo không?',
          'Tổng quan sức khỏe toàn bộ nhân viên'
        ];
      }
      return [
        `${selectedMemberName} lúc 16h44 ngồi đúng hay sai?`,
        `Tổng quan tư thế và nhịp tim của ${selectedMemberName}`,
        `${selectedMemberName} hôm nay có bị cảnh báo không?`,
        `Đánh giá thói quen ngồi của ${selectedMemberName}`
      ];
    }
    return [
      'Lúc 15h50 tôi ngồi đúng hay sai?',
      'Tổng quan tư thế và nhịp tim hôm nay',
      'Tôi đã ngồi làm việc liên tục bao lâu?',
      'Gợi ý bài tập giãn cơ cổ và thắt lưng'
    ];
  }, [isAdmin, selectedMemberId, selectedMemberName]);

  // Gợi ý câu hỏi tiếp theo thông minh dựa trên chủ đề người dùng vừa hỏi
  const computeDynamicSuggestions = (userQuery: string): string[] => {
    const q = userQuery.toLowerCase();
    if (q.includes('cổ') || q.includes('text neck') || q.includes('gục') || q.includes('cúi')) {
      return [
        'Cách tập động tác Thu Cằm (Chin Tuck)',
        'Khoảng cách màn hình chuẩn công thái học',
        'Tư thế và góc cổ lúc này của tôi',
        'Hôm nay tôi đã ngồi gù lưng bao lâu?'
      ];
    }
    if (q.includes('lưng') || q.includes('thắt lưng') || q.includes('đĩa đệm') || q.includes('cột sống')) {
      return [
        'Góc tựa lưng ghế 100°-110° thế nào?',
        'Cách ngồi để giảm 100% áp lực đĩa đệm L4-L5',
        'Bài tập giãn cơ thắt lưng tại ghế',
        'Tổng quan thời gian làm việc hôm nay'
      ];
    }
    if (q.includes('tim') || q.includes('bpm') || q.includes('spo2') || q.includes('oxy') || q.includes('thở')) {
      return [
        'Kỹ thuật thở 4-4-6 hạ nhịp tim nhanh',
        'Tại sao ngồi gù lưng làm giảm oxy SpO2?',
        'Nhịp tim hiện tại của tôi có ổn không?',
        'Tư thế hiện tại của tôi'
      ];
    }
    if (q.includes('bao lâu') || q.includes('ngồi lâu') || q.includes('đứng dậy') || q.includes('buồn ngủ')) {
      return [
        'Quy tắc 50-10 chống buồn ngủ là gì?',
        'Gợi ý bài tập vươn vai 1 phút tại bàn',
        'Tôi đã ngồi sai tư thế bao nhiêu phút?',
        'Tư thế ngồi chuẩn 90-90-90'
      ];
    }
    if (q.includes('mắt') || q.includes('nhìn') || q.includes('mờ') || q.includes('khô')) {
      return [
        'Hướng dẫn quy tắc 20-20-20 cho mắt',
        'Khoảng cách và độ cao màn hình chuẩn',
        'Gợi ý bài tập vươn vai thư giãn',
        'Tổng quan hôm nay'
      ];
    }
    if (q.includes('tay') || q.includes('chuột') || q.includes('bàn phím') || q.includes('ống cổ tay')) {
      return [
        'Bài tập Cầu Nguyện Ngược cho cổ tay',
        'Độ cao tay vịn ghế và cẳng tay chuẩn',
        'Tư thế hiện tại của tôi',
        'Tôi đã ngồi làm việc bao lâu?'
      ];
    }
    if (q.includes('bài tập') || q.includes('giãn cơ')) {
      return [
        'Động tác mở ngực ép bả vai (Chest Opener)',
        'Động tác xoay cột sống Seated Twist',
        'Quy tắc 50-10 chống mệt mỏi',
        'Tư thế và nhịp tim lúc này'
      ];
    }
    if (isAdmin && (q.includes('ai') || q.includes('so sánh') || q.includes('nhân viên'))) {
      return [
        'Nhân viên nào có nhịp tim cao nhất?',
        'Tổng quan sức khỏe toàn bộ nhân viên',
        'Có ai đang bị cảnh báo tư thế không?',
        'Thống kê theo từng mốc giờ'
      ];
    }
    return [
      'Lúc 15h50 tôi ngồi đúng hay sai?',
      'Tại sao tôi hay bị mỏi cổ vai gáy?',
      'Hôm nay tôi đã ngồi làm việc bao lâu?',
      'Gợi ý bài tập giãn cơ cổ và lưng'
    ];
  };

  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>(suggestions);

  useEffect(() => {
    setCurrentSuggestions(suggestions);
  }, [suggestions]);

  const lastTopicRef = useRef<string>('general');

  // Bộ máy phân tích công thái học & sinh trắc học chuyên sâu trực tiếp tại client (Multi-Result & Multi-Turn Engine)
  const generateFallbackResponse = (userQuery: string): string => {
    const text = userQuery.trim().toLowerCase();
    const bpm = Number(telemetry.bpm || 0);
    const spo2 = Number(telemetry.spo2 || 0);
    const postureLabel = telemetry.postureLabel || 'Chưa có dữ liệu';
    const postureStatus = Number(telemetry.postureStatus ?? -1);
    const neckAngle = telemetry.angleNeck ? `${telemetry.angleNeck}°` : '155° - 165°';
    const isCurrentlyBad = postureStatus === 1 || postureStatus === 3;
    const isStanding = postureStatus === 5;
    const isGood = postureStatus === 0;

    const sittingMins = Math.floor((sittingSeconds || 0) / 60);
    const badMins = Math.floor((badPostureSeconds || 0) / 60);
    const standingMins = Math.floor(((timeStats?.standingSeconds || 0) + (timeStats?.movingSeconds || 0)) / 60);

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'buổi sáng' : hour < 14 ? 'buổi trưa' : hour < 18 ? 'buổi chiều' : 'buổi tối';

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

    if (isFollowUp) {
      const topic = lastTopicRef.current;
      if (topic === 'neck') {
        return `🔬 **Phân Tích Chuyên Sâu Đốt Sống Cổ C5-C7 & Rủi Ro Biến Chứng:**\n\n` +
          `1. **Cơ chế chèn ép:** Đốt sống cổ C5-C7 chịu trách nhiệm cho 60% biên độ gập duỗi của đầu. Khi bạn gù cổ liên tục:\n` +
          `   - Nhân nhầy đĩa đệm bị đẩy lùi về phía sau, gây phồng hoặc thoát vị đĩa đệm cổ.\n` +
          `   - Chèn ép rễ dây thần kinh C6-C7 dẫn đến tê bì ngón tay cái và ngón trỏ.\n\n` +
          `2. **Lộ trình phục hồi 3 bước:**\n` +
          `   - **Ngay bây giờ:** Tập 5 nhịp **Thu Cằm (Chin Tuck)**, mỗi nhịp giữ 5 giây.\n` +
          `   - **Thiết lập không gian:** Đưa màn hình lên cao thêm 10-15cm (ngang tầm mắt nhìn thẳng).\n` +
          `   - **Thói quen:** Đặt đồng hồ chuông nhắc nhở cứ 45 phút lại ngửa cổ nhìn trần nhà 15 giây.`;
      }
      if (topic === 'lumbar') {
        return `🔬 **Cơ Chế Áp Lực Đĩa Đệm L4-L5 & Cột Sống Thắt Lưng:**\n\n` +
          `1. **Tại sao ngồi gù lại đau buốt lưng?**\n` +
          `   - Dây chằng dọc sau của thắt lưng bị kéo căng cực độ khi bạn ngồi cong lưng, giảm khả năng cung cấp dinh dưỡng tự nhiên cho đĩa đệm qua cơ chế thẩm thấu.\n` +
          `   - Khi nhân nhầy đĩa đệm trượt ra chèn vào dây thần kinh tọa (Sciatic nerve), cơn đau sẽ buốt dọc từ mông lan xuống mặt sau đùi và bắp chân.\n\n` +
          `2. **Hành động bảo vệ tức thì:**\n` +
          `   - Đặt gối tựa lưng (Lumbar Roll) ở vị trí thắt lưng để tái tạo độ ưỡn sinh lý (Lordosis).\n` +
          `   - Ngả lưng ghế góc **105°** thay vì 90° cứng nhắc.\n` +
          `   - Sau mỗi 50 phút ngồi, hãy đứng dậy đi lại ít nhất 2-3 phút để bơm dịch khớp đĩa đệm.`;
      }
      if (topic === 'heart' || topic === 'spo2') {
        return `🫀 **Liên Hệ Giữa Tư Thế Ngồi Và Chỉ Số Sinh Tồn (BPM & SpO2):**\n\n` +
          `1. **Khoang ngực bị ép hẹp:** Khi ngồi gập người hoặc tỳ ngực vào bàn, biên độ giãn nở của lồng ngực giảm 30%, cơ hoành bị nén lại khiến thể tích khí lưu thông sụt giảm.\n` +
          `2. **Phản ứng bù trừ của tim:** Để duy trì đủ oxy cho não bộ, tim buộc phải tăng tần số co bóp (tăng BPM). Đó là lý do bạn cảm thấy hồi hộp, mệt mỏi và nhanh buồn ngủ.\n\n` +
          `💡 **Khắc phục ngay:** Thực hiện kỹ thuật thở hộp **Box Breathing (4-4-4-4)**: Hít vào bằng mũi 4 giây -> Giữ hơi 4 giây -> Thở ra bằng miệng 4 giây -> Giữ trống phổi 4 giây. Chỉ sau 3 chu kỳ, nhịp tim sẽ hạ xuống mức tối ưu!`;
      }
      if (topic === 'timeline') {
        return `📊 **Phân Tích Thêm Về Xu Hướng Đo Đạc Trong Ngày:**\n\n` +
          `Các dữ liệu lịch sử ghi nhận cho thấy cơ thể thường có xu hướng bắt đầu xuất hiện cảnh báo sai tư thế sau **khoảng 35-40 phút ngồi liên tục**.\n\n` +
          `💡 **Chiến lược khắc phục:**\n` +
          `- Sử dụng chu kỳ làm việc **50 phút ngồi + 10 phút đứng vận động**.\n` +
          `- Đặt cốc nước nhỏ trên bàn để tạo cớ đứng dậy đi lấy nước thường xuyên.\n` +
          `- Theo dõi chỉ số góc cổ trên Dashboard: Giữ góc nghiêng luôn từ **150° - 165°**.`;
      }
    }

    // 1. Chào hỏi & định danh
    if (
      text.includes('chào') || 
      text.includes('hello') || 
      text.includes('hi ') || 
      text === 'hi' || 
      text.includes('ơi') || 
      text.includes('alo') || 
      text.includes('bạn là ai') || 
      text.includes('làm được gì') || 
      text.includes('hướng dẫn')
    ) {
      lastTopicRef.current = 'general';
      const statusIcon = isGood ? '✅' : isCurrentlyBad ? '⚠️' : isStanding ? '🚶' : '📡';
      return `👋 **Chào ${userName}, chúc bạn một ${timeGreeting} làm việc tràn đầy năng lượng và chuẩn công thái học!**\n\n` +
        `Tôi là **Trợ Lý AI Công Thái Học & Sinh Trắc Học IoT**, kết nối trực tiếp với cảm biến Raspberry Pi 4 và cơ sở dữ liệu Supabase.\n\n` +
        `📊 **Tình trạng sức khỏe & tư thế thực tế lúc này:**\n` +
        `- **Tư thế:** **${postureLabel}** ${statusIcon} (Góc cổ ước tính: **${neckAngle}**)\n` +
        `- **Nhịp tim:** **${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}** | **SpO2:** **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}**\n` +
        `- **Thời gian phiên làm việc:** Đã ngồi **${sittingMins} phút** (Ngồi sai: ${badMins} phút • Đứng vận động: ${standingMins} phút)\n\n` +
        `💡 **Tôi có thể hỗ trợ bạn giải quyết nhiều vấn đề:**\n` +
        `1. ⏱️ **Tra cứu lịch sử nhiều mốc giờ:** *"Lúc 15h50 tôi ngồi thế nào?"*, *"Các lần tôi bị cảnh báo gù lưng"*\n` +
        `2. 🦴 **Cơ chế đau mỏi:** *"Tại sao tôi bị mỏi cổ vai gáy?"*, *"Ngồi gù ảnh hưởng đĩa đệm L4-L5 ra sao?"*\n` +
        `3. 🧘 **Bài tập giảm đau 1 phút:** *"Gợi ý bài tập giãn cơ cổ và lưng tại bàn"*\n` +
        `4. 🪑 **Chuẩn góc ngồi 90-90-90:** *"Độ cao màn hình và góc tựa lưng bao nhiêu là chuẩn?"*\n` +
        `5. 🔌 **Chế độ Test Supabase:** *"Làm sao ngắt kết nối để test mà không lưu DB?"*`;
    }

    // 2. Chế độ Test Supabase & ngắt kết nối
    if (
      text.includes('ngắt kết nối') || 
      text.includes('ngat ket noi') || 
      text.includes('chế độ test') || 
      text.includes('che do test') || 
      text.includes('không lưu') || 
      text.includes('khong luu') || 
      text.includes('supabase') || 
      text.includes('lưu dữ liệu')
    ) {
      lastTopicRef.current = 'supabase';
      return `🔌 **Hướng Dẫn Chế Độ Test Thử Nghiệm & Ngắt Kết Nối Supabase:**\n\n` +
        `1. ⚪ **Chức năng nút "Ngắt kết nối Supa (Test)":**\n` +
        `   - Khi bạn bấm nút **"Ngắt kết nối Supa (Test)"** trên thanh điều hướng TopNav hoặc thanh công cụ **Nhật ký dữ liệu**, hệ thống sẽ chuyển sang chế độ Test thử nghiệm.\n` +
        `   - Ở chế độ này, mọi cảm biến (MAX30102, AI Camera), đồ thị thời gian thực và âm thanh cảnh báo **vẫn hoạt động 100%**, nhưng **tuyệt đối KHÔNG ghi bất kỳ bản ghi nào vào cơ sở dữ liệu Supabase PostgreSQL**.\n\n` +
        `2. 🟢 **Kết nối lại khi muốn lưu:**\n` +
        `   - Khi muốn tiếp tục lưu trữ dữ liệu lịch sử lâu dài, bạn chỉ cần bấm nút **"Kết nối lại Supa (Lưu DB)"** (màu xanh ngọc) trên thanh công cụ.\n\n` +
        `3. 🛡️ **Bảo toàn dữ liệu:** Giúp bạn thoải mái thử nghiệm các kịch bản cử động, giả lập hoặc kiểm thử thiết bị Pi 4 mà không làm bẩn nhật ký cá nhân!`;
    }

    // 3. Tra cứu lịch sử & chuỗi mốc thời gian (MULTI-RESULT TIMELINE ENGINE)
    const timeMatch = text.match(/(\d{1,2})[h:](\d{1,2})?/);
    const isRecentQuery = text.includes('vừa nãy') || text.includes('lúc nãy') || text.includes('mới nhất') || text.includes('gần đây') || text.includes('vừa xong');
    const isAlertListQuery = text.includes('cảnh báo') || text.includes('ngồi sai') || text.includes('gù lưng') || text.includes('lần sai');
    const isTimelineQuery = text.includes('lịch sử') || text.includes('nhật ký') || text.includes('các mốc') || text.includes('kết quả đo') || text.includes('các lần');
    const isMorningQuery = text.includes('sáng nay') || text.includes('buổi sáng');
    const isAfternoonQuery = text.includes('chiều nay') || text.includes('buổi chiều');

    if ((timeMatch || isRecentQuery || isAlertListQuery || isTimelineQuery || isMorningQuery || isAfternoonQuery) && history.length > 0) {
      lastTopicRef.current = 'timeline';
      let matchingLogs: TelemetryLog[] = [];
      let queryLabel = '';

      if (timeMatch) {
        const targetHour = parseInt(timeMatch[1], 10);
        const targetMinute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const targetTotalMinutes = targetHour * 60 + targetMinute;
        queryLabel = `quanh mốc ${targetHour}h${targetMinute > 0 ? String(targetMinute).padStart(2, '0') : ''}`;

        // Lọc tất cả các bản ghi trong phạm vi +/- 45 phút quanh mốc giờ yêu cầu
        matchingLogs = history.filter(log => {
          const d = new Date(log.timestamp);
          const logMinutes = d.getHours() * 60 + d.getMinutes();
          return Math.abs(logMinutes - targetTotalMinutes) <= 45;
        });

        // Sắp xếp tăng dần theo thời gian
        matchingLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      } else if (isMorningQuery) {
        queryLabel = 'buổi sáng hôm nay (06:00 - 12:00)';
        matchingLogs = history.filter(log => {
          const h = new Date(log.timestamp).getHours();
          return h >= 6 && h < 12;
        });
      } else if (isAfternoonQuery) {
        queryLabel = 'buổi chiều hôm nay (12:00 - 18:00)';
        matchingLogs = history.filter(log => {
          const h = new Date(log.timestamp).getHours();
          return h >= 12 && h < 18;
        });
      } else if (isAlertListQuery) {
        queryLabel = 'các lần phát hiện sai tư thế / cảnh báo';
        matchingLogs = history.filter(log => log.postureStatus === 1 || log.postureStatus === 3 || log.hasAlert);
      } else {
        queryLabel = 'các mốc đo gần đây nhất';
        matchingLogs = history.slice(0, 5);
      }

      // Nếu không khớp trong khung hẹp nhưng có lịch sử, lấy 4 bản ghi gần nhất để hiển thị
      if (matchingLogs.length === 0) {
        matchingLogs = history.slice(0, 4);
      }

      const totalMatched = matchingLogs.length;
      const goodCount = matchingLogs.filter(l => l.postureStatus === 0).length;
      const badCount = matchingLogs.filter(l => l.postureStatus === 1 || l.postureStatus === 3).length;
      const standingCount = matchingLogs.filter(l => l.postureStatus === 5).length;
      const validBpmLogs = matchingLogs.filter(l => l.bpm > 0);
      const avgBpm = validBpmLogs.length > 0 
        ? Math.round(validBpmLogs.reduce((acc, l) => acc + l.bpm, 0) / validBpmLogs.length) 
        : 0;
      const goodRatio = totalMatched > 0 ? Math.round((goodCount / totalMatched) * 100) : 100;

      // Xây dựng danh sách nhiều kết quả chi tiết
      const detailedList = matchingLogs.slice(0, 5).map((log, idx) => {
        const timeStr = log.timeFormatted || new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const icon = log.postureStatus === 0 
          ? '✅' 
          : (log.postureStatus === 1 || log.postureStatus === 3) 
            ? '⚠️' 
            : log.postureStatus === 5 
              ? '🚶' 
              : '👤';
        const bpmInfo = log.bpm > 0 ? `${log.bpm} BPM` : 'Không đeo';
        const spo2Info = log.spo2 > 0 ? `${log.spo2}% SpO2` : 'Chờ đo';
        const alertNote = log.hasAlert ? ' *(Đã cảnh báo âm thanh)*' : '';
        return `  ${idx + 1}. ⏱️ **${timeStr}**: ${icon} **${log.postureLabel || 'Chưa xác định'}** | ❤️ ${bpmInfo} | 🫁 ${spo2Info}${alertNote}`;
      }).join('\n');

      return `🔍 **Kết Quả Tra Cứu Lịch Sử Đo Đạc (${queryLabel}):**\n\n` +
        `Hệ thống ghi nhận **${totalMatched} mốc đo** trong giai đoạn này của ${isAdmin && selectedMemberName !== 'Tất cả' ? selectedMemberName : userName}:\n\n` +
        `📊 **1. Thống Kê Tổng Hợp Khung Giờ:**\n` +
        `- **Tỷ lệ tư thế chuẩn:** **${goodRatio}%** (${goodCount} lần đúng • ${badCount} lần cảnh báo • ${standingCount} lần vận động)\n` +
        `- **Nhịp tim trung bình:** **${avgBpm > 0 ? `${avgBpm} BPM` : 'Đang chờ cảm biến'}**\n\n` +
        `⏱️ **2. Danh Sách Chi Tiết Từng Mốc Đo (Multi-Record Results):**\n` +
        `${detailedList}\n\n` +
        `🔬 **3. Đánh Giá Diễn Biến Cơ Sinh Học:**\n` +
        `${badCount > 0 
          ? `Ghi nhận có ${badCount} thời điểm góc cổ gập dưới 150° hoặc trượt mông ra trước. Tình trạng này làm tăng áp lực đè nặng lên đốt sống cổ C5-C7 và đĩa đệm thắt lưng L4-L5.` 
          : `Bạn duy trì tư thế rất xuất sắc và đồng đều! Cột sống giữ nguyên độ ưỡn sinh lý tự nhiên, giúp tuần hoàn máu lên não đạt mức tối ưu.`}\n\n` +
        `🛠️ **4. Khuyến Nghị Hành Động:**\n` +
        `${badCount > 0 
          ? `- Kê cao màn hình ngang tầm mắt và tựa lưng góc 105°.\n- Thực hiện 5 lần bài tập **Thu Cằm (Chin Tuck)** để giải phóng cơ thang.` 
          : `- Tiếp tục phát huy và nhớ đứng dậy vận động nhẹ 2 phút sau mỗi 50 phút làm việc.`}`;
    }

    // 4. Mỏi cổ, đau cổ, Text Neck
    if (
      text.includes('mỏi cổ') || 
      text.includes('đau cổ') || 
      text.includes('cúi đầu') || 
      text.includes('gục đầu') || 
      text.includes('text neck') || 
      text.includes('c5-c7') || 
      text.includes('đốt sống cổ') || 
      text.includes('cổ vai gáy') || 
      text.includes('rụt cổ') || 
      text.includes('căng cơ cổ')
    ) {
      lastTopicRef.current = 'neck';
      return `📐 **Phân Tích Cơ Sinh Học Đốt Sống Cổ (C5-C7) & Hội Chứng Text Neck:**\n\n` +
        `🩺 **1. Tình trạng trực tiếp lúc này:**\n` +
        `- Góc nghiêng cổ hiện tại: **${neckAngle}** (Ngưỡng an toàn: **150° - 165°**)\n` +
        `- Trạng thái tư thế: **${postureLabel}** ${isGood ? '✅ (Chuẩn)' : '⚠️ (Cần ngửa đầu)'}\n\n` +
        `🔬 **2. Cơ chế áp lực lên đốt sống cổ theo góc cúi:**\n` +
        `- Đầu người ở góc thẳng 0° nặng trung bình **5 kg**.\n` +
        `- Khi cúi **15°**: Trọng tải lên cổ tăng lên **12 kg**.\n` +
        `- Khi cúi **30°**: Trọng tải tăng lên **18 kg**.\n` +
        `- Khi cúi **45°**: Trọng tải tăng lên **22 kg**.\n` +
        `- Khi cúi **60° (gục đầu nhìn laptop/điện thoại)**: **Trọng tải lên tới 27 kg** (gấp 5.4 lần bình thường)!\n\n` +
        `🛠️ **3. 3 Bước khắc phục triệt để ngay tại bàn:**\n` +
        `1. **Kê màn hình:** Mép trên màn hình phải ngang tầm mắt nhìn thẳng (dùng giá đỡ hoặc kê sách cao 10-15cm).\n` +
        `2. **Bài tập Thu Cằm (Chin Tuck):** Ngồi thẳng, nhìn về trước, dùng ngón tay đẩy nhẹ cằm lùi về sau gáy tạo nọng cằm. Giữ 5 giây, lặp lại 5 lần.\n` +
        `3. **Quy tắc tầm mắt:** Không cúi cổ để nhìn màn hình, chỉ hạ thấp tầm mắt (hạ nhãn cầu).`;
    }

    // 5. Đau thắt lưng, cột sống L4-L5
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
      text.includes('thần kinh tọa')
    ) {
      lastTopicRef.current = 'lumbar';
      return `🦴 **Phân Tích Áp Lực Đĩa Đệm Thắt Lưng L4-L5 Khi Ngồi Làm Việc:**\n\n` +
        `🩺 **1. Tình trạng trực tiếp:**\n` +
        `- Thời gian ngồi hôm nay: **${sittingMins} phút** (Trong đó ngồi sai: **${badMins} phút**)\n` +
        `- Đánh giá mức độ rủi ro thắt lưng: **${badMins > 30 ? 'Cảnh báo mỏi cơ thắt lưng ⚠️' : 'Trong giới hạn an toàn ✅'}**\n\n` +
        `🔬 **2. So sánh tải trọng lên đĩa đệm L4-L5 (Nghiên cứu GS. Alf Nachemson):**\n` +
        `- Đứng thẳng người: Áp lực là **100% (chuẩn)**.\n` +
        `- Ngồi thẳng tựa lưng góc 105°: Áp lực khoảng **105%** (mức tối ưu khi làm việc).\n` +
        `- Ngồi gù lưng, cúi người ra trước: **Áp lực vọt lên tới 185% - 200%**!\n` +
        `- Tình trạng này ép dịch nhân nhầy đĩa đệm trượt ra sau, chèn ép rễ dây thần kinh tọa gây tê buốt hông và chân.\n\n` +
        `🛠️ **3. 3 Bước bảo vệ thắt lưng ngay lúc này:**\n` +
        `1. **Đẩy mông sát góc ghế:** Giúp toàn bộ vùng thắt lưng được đệm ghế nâng đỡ trọn vẹn.\n` +
        `2. **Tựa lưng góc 100° - 110°:** Phân tán 20% trọng lượng thân trên sang tựa lưng ghế.\n` +
        `3. **Không vắt chéo chân:** Vắt chéo chân làm xoay lệch khung chậu và vẹo cột sống thắt lưng.`;
    }

    // 6. Đau vai gáy, cơ thang
    if (
      text.includes('đau vai') || 
      text.includes('mỏi vai') || 
      text.includes('cơ thang') || 
      text.includes('bả vai') || 
      text.includes('căng vai') || 
      text.includes('vai cuộn') || 
      text.includes('vai gáy')
    ) {
      lastTopicRef.current = 'shoulder';
      return `🦾 **Hội Chứng Bắt Chéo Trên & Co Thắt Cơ Thang (Trapezius):**\n\n` +
        `🩺 **1. Cơ chế hình thành:**\n` +
        `Khi hai cánh tay giơ lơ lửng gõ phím hoặc chuột mà không có tay vịn nâng đỡ, cơ thang trên và cơ nâng vai phải co cứng liên tục để treo toàn bộ trọng lượng hai cánh tay (~8-10 kg).\n\n` +
        `🔬 **2. Hậu quả biomechanics:**\n` +
        `Vai bị cuộn tròn ra phía trước, cơ ngực co rút ngắn lại, cơ trám giữa hai bả vai bị kéo giãn yếu ớt dẫn đến cảm giác đau nhức âm ỉ như bị đá đè hai bên vai.\n\n` +
        `🛠️ **3. 3 Bước giải phóng cơ vai gáy:**\n` +
        `1. **Chỉnh tay vịn ghế:** Nâng tay vịn ngang bằng mặt bàn để khuỷu tay gập góc **90°-100°**.\n` +
        `2. **Bài tập Ép Bả Vai (Scapular Retraction):** Hít sâu, kéo hai vai ra sau ép chặt hai xương bả vai vào nhau 10 giây, thở ra thả lỏng. Lặp lại 5 lần.\n` +
        `3. **Kéo giãn cơ cổ bên:** Dùng tay kéo nghiêng đầu sang một bên 15 giây để kéo giãn cơ thang, sau đó đổi bên.`;
    }

    // 7. Cổ tay & Ống cổ tay
    if (
      text.includes('cổ tay') || 
      text.includes('tê tay') || 
      text.includes('ống cổ tay') || 
      text.includes('mỏi tay') || 
      text.includes('chuột') || 
      text.includes('bàn phím')
    ) {
      lastTopicRef.current = 'wrist';
      return `🖐️ **Phòng Tránh Hội Chứng Ống Cổ Tay (Carpal Tunnel Syndrome):**\n\n` +
        `🩺 **1. Cơ chế tổn thương:**\n` +
        `Dây thần kinh giữa (Median nerve) chạy qua ống cổ tay hẹp. Khi gõ phím với cổ tay bị bẻ cong lên quá 15° hoặc tỳ mạnh mép cổ tay vào cạnh bàn sắc nhọn, áp lực trong ống cổ tay tăng gấp 6 lần, gây tê bì đầu ngón tay.\n\n` +
        `🛠️ **2. Giải pháp công thái học:**\n` +
        `- **Giữ cổ tay ở vị trí trung tính (0°):** Bàn tay và cẳng tay tạo thành một đường thẳng song song mặt sàn.\n` +
        `- **Di chuyển chuột bằng cả cánh tay:** Sử dụng khớp khuỷu thay vì chỉ lắc ngang cổ tay.\n` +
        `- **Bài tập Cầu Nguyện Ngược:** Chắp hai lòng bàn tay trước ngực, hạ thấp xuống dưới rốn trong 15 giây để kéo giãn gân gấp cổ tay.`;
    }

    // 8. Mỏi mắt & 20-20-20
    if (
      text.includes('mỏi mắt') || 
      text.includes('mắt mờ') || 
      text.includes('khô mắt') || 
      text.includes('chói mắt') || 
      text.includes('nhức mắt') || 
      text.includes('20-20-20')
    ) {
      lastTopicRef.current = 'eyes';
      return `👁️ **Quy Tắc Vàng 20-20-20 Chống Mỏi Mắt Màn Hình Máy Tính:**\n\n` +
        `🩺 **1. Nguyên nhân mỏi mắt:**\n` +
        `Khi nhìn chằm chằm vào màn hình, tần số chớp mắt tự nhiên giảm từ 15-20 lần/phút xuống chỉ còn 5-7 lần/phút, khiến màng phim nước mắt bay hơi gây khô rát và mờ nhòe.\n\n` +
        `🛠️ **2. Công thức bảo vệ thị lực 3 bước:**\n` +
        `1. **Quy tắc 20-20-20:** Cứ mỗi **20 phút**, hãy nhìn xa **20 feet (~6 mét)** trong **20 giây** để cơ thể mi mắt được thả lỏng hoàn toàn.\n` +
        `2. **Khoảng cách màn hình:** Đặt màn hình cách mắt từ **50 đến 70 cm** (đúng chiều dài một sải tay).\n` +
        `3. **Độ cao hiển thị:** Mép trên cùng của màn hình ngang tầm mắt nhìn thẳng để mí mắt tự nhiên che phủ 1/3 nhãn cầu.`;
    }

    // 9. Nhịp tim (BPM)
    if (
      text.includes('nhịp tim') || 
      text.includes('bpm') || 
      text.includes('tim đập') || 
      text.includes('tim nhanh') || 
      text.includes('mạch')
    ) {
      lastTopicRef.current = 'heart';
      const bpmState = bpm === 0 
        ? 'Đang chờ cảm biến MAX30102' 
        : bpm < 60 
          ? 'Hơi chậm (Bradycardia nhẹ) 💤' 
          : bpm <= 90 
            ? 'Chuẩn tối ưu (Optimal Resting HR) ✅' 
            : bpm <= 100 
              ? 'Mức bình thường cao 👍' 
              : 'Hơi nhanh (Tachycardia do stress hoặc gù lưng) ⚠️';

      return `❤️ **Đánh Giá Chỉ Số Nhịp Tim (BPM) Từ Cảm Biến Sinh Trắc Học:**\n\n` +
        `🩺 **1. Số liệu trực tiếp:**\n` +
        `- Nhịp tim ghi nhận: **${bpm > 0 ? `${bpm} BPM` : 'Đang chờ ngón tay đặt lên cảm biến'}** -> **${bpmState}**\n` +
        `- SpO2 đồng bộ: **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}**\n\n` +
        `🔬 **2. Tác động của tư thế đến nhịp tim:**\n` +
        `Khi ngồi gù gập thân trên, tĩnh mạch chủ dưới và cơ hoành bị chèn ép cản trở máu hồi lưu về tim. Để bù đắp, tim phải đập nhanh hơn 8-12 nhịp/phút.\n\n` +
        `🛠️ **3. Kỹ thuật điều hòa nhịp tim 1 phút:**\n` +
        `Hít thở sâu theo nhịp **4-4-6**: Hít vào bằng mũi 4 giây -> Giữ hơi 4 giây -> Thở ra từ từ bằng miệng 6 giây để kích hoạt hệ thần kinh phó giao cảm (Parasympathetic), giúp hạ nhịp tim êm dịu.`;
    }

    // 10. SpO2 & Nồng độ oxy
    if (
      text.includes('spo2') || 
      text.includes('oxy') || 
      text.includes('nồng độ oxy') || 
      text.includes('khí máu') || 
      text.includes('hít thở')
    ) {
      lastTopicRef.current = 'spo2';
      return `🫁 **Phân Tích Nồng Độ Oxy Trong Máu (SpO2) & Dung Tích Phổi:**\n\n` +
        `🩺 **1. Số liệu trực tiếp:**\n` +
        `- Chỉ số SpO2: **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}** (${spo2 >= 96 ? '✅ Tối ưu cho chức năng não bộ và cơ bắp' : spo2 >= 94 ? 'Mức chấp nhận được' : '⚠️ Thấp - Cần ngồi thẳng hít thở sâu'})\n\n` +
        `🔬 **2. Mối liên hệ với tư thế ngồi:**\n` +
        `Ngồi gù lưng làm thể tích khoang ngực thu hẹp 25-30%, đáy phổi không được thông khí đầy đủ, khiến lượng oxy vận chuyển lên não giảm gây ngáp ngắn ngáp dài và mất tập trung.\n\n` +
        `🛠️ **3. Giải pháp phục hồi oxy tức thì:**\n` +
        `- Ngồi thẳng lưng, ưỡn ngực mở rộng hai vai.\n` +
        `- Hít một hơi thật sâu bằng bụng trong 4 giây, nín thở 2 giây rồi thở nhẹ ra qua môi. Thực hiện 4 nhịp để đưa SpO2 lên 98-99%.`;
    }

    // 11. Thời gian ngồi & Buồn ngủ (Quy tắc 50-10)
    if (
      text.includes('bao lâu') || 
      text.includes('ngồi liên tục') || 
      text.includes('đứng dậy') || 
      text.includes('buồn ngủ') || 
      text.includes('50-10') || 
      text.includes('ngồi lâu') ||
      text.includes('mệt mỏi')
    ) {
      lastTopicRef.current = 'sitting';
      return `⏱️ **Thời Lượng Làm Việc & Chiến Lược Đánh Bay Cơn Buồn Ngủ:**\n\n` +
        `📊 **1. Thống kê phiên làm việc hiện tại:**\n` +
        `- **Tổng thời gian ngồi:** **${sittingMins} phút** (Ngồi sai: **${badMins} phút**)\n` +
        `- **Thời gian đứng vận động:** **${standingMins} phút**\n` +
        `- **Khuyến nghị thời điểm này:** ${sittingMins >= 50 ? '🚨 Bạn đã ngồi quá 50 phút! Hãy đứng dậy đi lại ngay!' : '✅ Bạn đang trong ngưỡng thời gian an toàn.'}\n\n` +
        `🔬 **2. Quy tắc công thái học 50-10:**\n` +
        `Cứ sau **50 phút ngồi**, hãy đứng dậy đi lại, lấy nước hoặc vươn vai **10 phút**. Hành động đứng kích hoạt bơm cơ bắp chân (Calf muscle pump), đẩy hàng trăm ml máu đọng từ chi dưới về tim và não, dập tắt hoàn toàn cảm giác uể oải buồn ngủ.`;
    }

    // 12. Tư thế chuẩn công thái học 90-90-90
    if (
      text.includes('ngồi đúng') || 
      text.includes('tư thế chuẩn') || 
      text.includes('công thái học') || 
      text.includes('chuẩn') || 
      text.includes('bàn ghế') || 
      text.includes('độ cao')
    ) {
      lastTopicRef.current = 'workspace';
      return `📐 **Quy Tắc Vàng 90-90-90 Thiết Lập Không Gian Làm Việc Chuẩn Quốc Tế:**\n\n` +
        `1. **Góc Khuỷu Tay (90° - 100°):** Cẳng tay đặt nhẹ lên tay vịn ghế hoặc mặt bàn, cổ tay giữ thẳng tự nhiên 0°.\n` +
        `2. **Góc Đầu Gối & Hông (90° - 100°):** Mặt ghế không cấn vào hõm sau đầu gối (cách mép 2-3 ngón tay), hai bàn chân đặt phẳng trên sàn nhà.\n` +
        `3. **Góc Tựa Lưng (100° - 110°):** Không ngồi thẳng đuỗn 90° (nhanh mỏi cơ) cũng không nằm trượt mông 130°. Đặt góc hơi ngả nhẹ có gối đệm hõm thắt lưng.\n` +
        `4. **Tầm Mắt & Màn Hình:** Mép trên màn hình ngang tầm mắt nhìn thẳng, cách mắt từ 50-70cm.`;
    }

    // 13. Bài tập giãn cơ 2 phút tại chỗ
    if (
      text.includes('bài tập') || 
      text.includes('giãn cơ') || 
      text.includes('vươn vai') || 
      text.includes('thể dục') || 
      text.includes('động tác')
    ) {
      lastTopicRef.current = 'stretches';
      return `🧘 **Combo 4 Bài Tập Công Thái Học Nhanh 2 Phút Tại Bàn Làm Việc:**\n\n` +
        `1. 📐 **Thu Cằm (Chin Tuck - Giảm đau cổ):** Ngồi thẳng, mắt nhìn ngang. Dùng hai ngón tay đẩy nhẹ cằm thụt lùi về sau cổ. Giữ 5 giây, lặp lại 5 lần.\n` +
        `2. 👐 **Mở Rộng Lồng Ngực (Chest Opener - Chống gù lưng):** Đan hai tay sau gáy, hít sâu ưỡn ngực, mở rộng tối đa hai khuỷu tay sang hai bên và ép chặt hai bả vai vào nhau trong 15 giây.\n` +
        `3. 🔄 **Xoay Cột Sống Ghế Ngồi (Seated Spinal Twist - Thắt lưng L4-L5):** Đặt tay phải lên mép tựa tay trái, xoay nhẹ thân trên sang trái 10 giây, sau đó đổi bên ngược lại.\n` +
        `4. 🖐️ **Kéo Giãn Gân Cổ Tay (Wrist Extensor Stretch):** Duỗi thẳng tay về phía trước, dùng tay kia nhẹ nhàng kéo các ngón tay ngược về thân người 15 giây.`;
    }

    // 14. Tổng quan sức khỏe hôm nay
    if (
      text.includes('tổng quan') || 
      text.includes('hôm nay') || 
      text.includes('thống kê') || 
      text.includes('đánh giá') || 
      text.includes('kết quả') || 
      text.includes('báo cáo')
    ) {
      lastTopicRef.current = 'summary';
      const goodRatio = sittingMins > 0 ? Math.round(((sittingMins - badMins) / sittingMins) * 100) : 100;
      const grade = goodRatio >= 85 ? 'Hạng A (Xuất sắc) 🌟' : goodRatio >= 70 ? 'Hạng B (Khá tốt) 👍' : goodRatio >= 50 ? 'Hạng C (Cần cải thiện) ⚠️' : 'Hạng D (Báo động mỏi cơ) 🚨';

      return `📊 **Báo Cáo Sức Khỏe & Thói Quen Công Thái Học Của ${userName} Hôm Nay:**\n\n` +
        `- ⏱️ **Tổng thời gian theo dõi:** **${sittingMins + standingMins} phút** (Ngồi: ${sittingMins}p • Đứng: ${standingMins}p)\n` +
        `- ⚠️ **Thời gian ngồi sai tư thế:** **${badMins} phút**\n` +
        `- 🏆 **Tỷ lệ tư thế chuẩn:** **${goodRatio}%** -> **${grade}**\n` +
        `- ❤️ **Nhịp tim hiện tại:** **${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}**\n` +
        `- 🫁 **SpO2 hiện tại:** **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}**\n` +
        `- 📐 **Tư thế trực tiếp:** **${postureLabel}** (Góc cổ: ${neckAngle})\n\n` +
        `💡 **Lời khuyên:** ${goodRatio >= 75 ? 'Bạn đang duy trì thói quen công thái học rất tuyệt vời! Tiếp tục phát huy.' : 'Hôm nay cơ thể có dấu hiệu mỏi cổ gáy nhiều. Hãy nâng giá đỡ laptop lên và tập bài tập Chin Tuck 2 phút nhé!'}`;
    }

    // 15. Quản trị viên: So sánh, xếp hạng
    if (isAdmin && (text.includes('ai ngồi sai') || text.includes('sai nhiều nhất') || text.includes('so sánh') || text.includes('nhân viên'))) {
      lastTopicRef.current = 'admin';
      return `📊 **Báo Cáo Phân Tích Đội Ngũ Dành Cho Quản Trị Viên:**\n\n` +
        `Để tra cứu chi tiết danh sách tất cả nhân viên, xếp hạng số lần cảnh báo sai tư thế và nhịp tim trung bình của từng người:\n` +
        `- Chuyển qua tab **"Danh mục quản trị"** hoặc mở bảng **"Truy Vấn Lịch Sử Supabase SQL"**.\n` +
        `- Bạn có thể chọn từng thành viên từ danh sách ở trên đỉnh khung chat này để tra cứu riêng cho từng người!`;
    }

    // 16. Lời cảm ơn, chào tạm biệt
    if (
      text.includes('cảm ơn') || 
      text.includes('thank') || 
      text === 'ok' || 
      text.includes('tuyệt vời') || 
      text.includes('tốt lắm') || 
      text.includes('tạm biệt') || 
      text.includes('bye')
    ) {
      lastTopicRef.current = 'general';
      return `🙏 **Rất vui được hỗ trợ và đồng hành cùng sức khỏe của ${userName}!**\n\n` +
        `Hãy luôn giữ lưng thẳng tựa vào ghế, chớp mắt thường xuyên và uống thêm một ngụm nước ấm nhé! Bất cứ lúc nào cần kiểm tra tư thế hoặc mốc giờ đo đạc, hãy nhắn cho tôi.`;
    }

    // 17. Phản hồi phân tích đa chiều thông minh thời gian thực (Multi-Aspect Semantic Response)
    lastTopicRef.current = 'general';
    return `🩺 **Trợ Lý Công Thái Học AI Phân Tích Chuyên Sâu Cho ${userName}:**\n\n` +
      `📊 **1. Dữ liệu đo đạc thời gian thực từ cảm biến IoT:**\n` +
      `- **Tư thế hiện tại:** **${postureLabel}** ${isCurrentlyBad ? '⚠️ *(Đang có nguy cơ co cứng cơ vai gáy và chèn ép đĩa đệm)*' : isStanding ? '🚶 *(Rất tốt, đang giải phóng áp lực đĩa đệm)*' : '✅ *(Tư thế cân bằng, tiếp tục duy trì)*'}\n` +
      `- **Góc nghiêng cổ ước tính:** **${neckAngle}** (Chuẩn an toàn: **150° - 165°**)\n` +
      `- **Chỉ số sinh trắc học:** Nhịp tim: **${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}** | SpO2: **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}**\n` +
      `- **Thời gian phiên ngồi:** **${sittingMins} phút** (Ngồi sai: ${badMins} phút)\n\n` +
      `🔬 **2. Phân tích cơ sinh học & Đánh giá rủi ro:**\n` +
      `Cột sống con người chịu áp lực cơ học lớn nhất khi ngồi tĩnh tại trong một tư thế quá 40 phút. Nhóm cơ thang trên và cơ dựng sống thắt lưng bắt đầu bị co rút yếm khí, gây mỏi mệt và giảm nồng độ oxy lên não.\n\n` +
      `🛠️ **3. Giải pháp khuyến nghị:**\n` +
      `1. Tựa trọn vẹn lưng vào ghế góc 100°-110°, hai bàn chân đặt phẳng trên sàn.\n` +
      `2. Kê mép trên màn hình ngang tầm mắt nhìn thẳng.\n` +
      `3. Thực hiện động tác **Thu Cằm (Chin Tuck)** và **Ép Bả Vai** trong 15 giây.\n\n` +
      `💡 **Bạn có thể tra cứu chi tiết hơn:**\n` +
      `- *"Lúc 15h50 tôi ngồi đúng hay sai?"* (Xem chuỗi kết quả theo mốc giờ)\n` +
      `- *"Tại sao tôi hay bị mỏi cổ vai gáy?"*\n` +
      `- *"Hướng dẫn ngắt kết nối Supabase để test"*`;
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || input).trim();
    if (!textToSend || isTyping) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Cập nhật gợi ý câu hỏi tiếp theo dựa trên chủ đề người dùng vừa hỏi
    const nextSuggestions = computeDynamicSuggestions(textToSend);
    setCurrentSuggestions(nextSuggestions);

    try {
      // Lấy Firebase ID token của phiên hiện tại để xác thực an toàn
      const config = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(config);
      const auth = getAuth(app);
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';

      if (!idToken) {
        throw new Error('Vui lòng đăng nhập để sử dụng Trợ Lý Công Thái Học AI');
      }

      // Chuẩn bị lịch sử hội thoại gần nhất để gửi cho AI (Multi-turn conversational context)
      const recentHistory = messages.slice(-6).map(m => ({
        sender: m.sender,
        text: m.text.slice(0, 300)
      }));

      // Call server-side Gemini API proxy /api/chat with rich context, multi-turn history and Bearer token
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          query: textToSend,
          telemetry,
          history: history.slice(0, 40),
          timeStats,
          userName,
          targetMemberName: selectedMemberId !== 'all' ? selectedMemberName : undefined,
          targetMemberId: selectedMemberId !== 'all' ? selectedMemberId : undefined,
          conversationHistory: recentHistory,
          allUsers: allUsers.map(u => ({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
            email: u.email,
            role: u.role,
            department: u.department
          }))
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server trả về mã lỗi ${response.status}`);
      }

      const data = await response.json();
      const botReply = data.reply || generateFallbackResponse(textToSend);

      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.warn('Lỗi gọi AI server, kích hoạt bộ phân tích dữ liệu cục bộ:', err);
      // Fallback local smart answer
      const fallbackText = generateFallbackResponse(textToSend);
      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: fallbackText,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: String(Date.now()),
        sender: 'bot',
        text: `Đã làm mới cuộc hội thoại! Bạn có thể hỏi tôi bất kỳ thông tin nào về tư thế và dữ liệu sức khỏe đã đo đạc.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <>
      {/* Sleek Floating Trigger Button (Executive Light Command Center Style) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 h-11 px-4 rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-xl hover:shadow-2xl border border-slate-700/80 transition-all duration-200 cursor-pointer group active:scale-95"
          aria-label="Mở Trợ lý AI"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-pulse" />
          </div>
          <span className="text-xs font-bold tracking-tight whitespace-nowrap">Hỏi Trợ Lý AI</span>
          <span className="hidden sm:inline-flex px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-white/20 text-emerald-300 uppercase">
            Gemini
          </span>
        </button>
      )}

      {/* Main Chat Drawer/Modal */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[95vw] sm:w-[420px] max-w-[440px] h-[580px] max-h-[85vh] flex flex-col rounded-2xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden animate-fadeIn text-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-emerald-50/40 select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-xs">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">Trợ Lý Công Thái Học AI</h3>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                  <span>Gemini Model</span>
                  <span>•</span>
                  <span>Đồng bộ Supabase & IoT</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleResetChat}
                title="Làm mới đoạn chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Thu nhỏ cửa sổ chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Member Context Selector */}
          {isAdmin && (
            <div className="px-3.5 py-2 bg-indigo-50/70 border-b border-indigo-100/80 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-indigo-900 shrink-0">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tra cứu:</span>
              </div>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="flex-1 max-w-[250px] px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-950 font-semibold text-xs focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs truncate"
              >
                <option value="all">Toàn bộ thành viên (Tất cả)</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName || u.username} ({u.role === 'admin' ? 'Quản lý' : (u.department || 'Nhân viên')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 bg-slate-50/50">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3 text-xs sm:text-sm leading-relaxed transition-all shadow-2xs ${
                      isUser
                        ? 'bg-slate-900 text-white rounded-tr-xs font-sans font-medium'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs font-sans'
                    }`}
                  >
                    {/* Format simple bolding, bullets, and line breaks */}
                    <div className="whitespace-pre-line space-y-1">
                      {msg.text.split('\n').map((line, idx) => {
                        // Highlight bold strings
                        const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                        return (
                          <div 
                            key={idx} 
                            dangerouslySetInnerHTML={{ __html: formatted }} 
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono px-1">
                    {msg.time}
                  </span>
                </div>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs w-fit shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                <span className="text-[11px] font-medium">AI đang truy vấn dữ liệu lịch sử...</span>
                <span className="flex gap-1 ml-1">
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(s)}
                disabled={isTyping}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium whitespace-nowrap transition cursor-pointer border border-slate-200/80 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Hỏi tư thế, nhịp tim hoặc mốc giờ cụ thể..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              disabled={isTyping}
            />

            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs shrink-0"
              title="Gửi câu hỏi"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
