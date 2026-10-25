import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Loader2, 
  Bot, 
  User, 
  RotateCcw,
  Activity,
  Shield,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  PanelRightClose,
  Clock,
  Heart
} from 'lucide-react';
import { HealthTelemetry, TelemetryLog, AuthUser, TimeCalculations } from '../types';
import { getAuth } from 'firebase/auth';
import { getSavedFirebaseConfig, initializeFirebaseApp } from '../services/firebase';
import { getSavedSupabaseConfig, fetchSupabaseHistory } from '../services/supabaseService';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isSupabaseQueried?: boolean;
}

interface HealthChatbotProps {
  telemetry: HealthTelemetry;
  role?: string;
  sittingSeconds?: number;
  badPostureSeconds?: number;
  hasData?: boolean;
  userName?: string;
  userId?: string;
  history?: TelemetryLog[];
  timeStats?: Partial<TimeCalculations> | any;
  allUsers?: AuthUser[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialSelectedMemberId?: string;
}

// Clean text helper removing stray asterisks
function cleanText(str: string): string {
  return str.replace(/\*\*/g, '').replace(/\*/g, '');
}

// Inline Markdown parser for bold, code, and italics (Light Mode Styled)
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(cleanText(text.slice(lastIndex, match.index)));
    }
    const matchedStr = match[0];
    if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      const inner = matchedStr.slice(2, -2);
      tokens.push(
        <strong key={match.index} className="font-bold text-slate-900">
          {inner}
        </strong>
      );
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      const inner = matchedStr.slice(1, -1);
      tokens.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded bg-slate-100 text-teal-800 font-mono text-[10px] border border-slate-200">
          {inner}
        </code>
      );
    } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      const inner = matchedStr.slice(1, -1);
      tokens.push(
        <em key={match.index} className="italic text-slate-600">
          {inner}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push(cleanText(text.slice(lastIndex)));
  }

  return tokens;
}

// Multi-line Markdown parser for headers, lists, and paragraphs (Light Mode High Contrast)
function renderFormattedMessage(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    // Header check
    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      const cleanHeader = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
      return (
        <h4 key={lineIdx} className="font-bold text-teal-800 text-xs sm:text-sm mt-2.5 mb-1 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>{cleanHeader}</span>
        </h4>
      );
    }

    // Divider check
    if (line.trim() === '---' || line.trim() === '***') {
      return <hr key={lineIdx} className="border-slate-200 my-2" />;
    }

    // List item check
    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ') || line.trim().startsWith('* ');
    const isNumbered = /^\d+\.\s/.test(line.trim());
    const content = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
    const parts = parseInlineMarkdown(content);

    if (isBullet) {
      return (
        <div key={lineIdx} className="flex items-start gap-1.5 my-0.5 pl-1 leading-relaxed">
          <span className="text-teal-600 font-bold mt-0.5">•</span>
          <span className="flex-1 text-slate-700">{parts}</span>
        </div>
      );
    }

    if (isNumbered) {
      const numMatch = line.trim().match(/^(\d+)\.\s/);
      const num = numMatch ? numMatch[1] : '';
      return (
        <div key={lineIdx} className="flex items-start gap-1.5 my-0.5 pl-1 leading-relaxed">
          <span className="font-mono text-teal-700 font-semibold">{num}.</span>
          <span className="flex-1 text-slate-700">{parts}</span>
        </div>
      );
    }

    if (!line.trim()) {
      return <div key={lineIdx} className="h-1.5" />;
    }

    return (
      <p key={lineIdx} className="text-slate-700 my-0.5 leading-relaxed">
        {parts}
      </p>
    );
  });
}

export const HealthChatbot: React.FC<HealthChatbotProps> = ({
  telemetry,
  role = 'employee',
  sittingSeconds = 0,
  badPostureSeconds = 0,
  userName = 'Bạn',
  userId,
  history = [],
  timeStats,
  allUsers = [],
  isOpen: controlledIsOpen,
  onOpenChange,
  initialSelectedMemberId
}) => {
  const isAdmin = role === 'admin' || role === 'manager';
  const [selectedMemberId, setSelectedMemberId] = useState<string>(initialSelectedMemberId || 'all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSelectedMemberId) {
      setSelectedMemberId(initialSelectedMemberId);
    }
  }, [initialSelectedMemberId]);

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(open);
    }
    onOpenChange?.(open);
  };

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-1',
      sender: 'bot',
      text: isAdmin
        ? `Xin chào Quản trị viên **${userName}**!\n\nTôi là **Trợ Lý AI Công Thái Học & Quản Trị Sức Khỏe**.\n\nTôi có thể hỗ trợ bạn theo dõi tiến trình làm việc, phát hiện nguy cơ sai tư thế và lập báo cáo sức khỏe trực quan cho từng thành viên trong tổ chức.`
        : `Xin chào **${userName}**!\n\nTôi là **Trợ Lý Sức Khỏe & Công Thái Học** của bạn. Tôi được kết nối với hệ thống cảm biến thông minh để theo dõi trạng thái làm việc theo thời gian thực.\n\nBạn có thể hỏi tôi về lịch sử đo đạc, phân tích nhịp tim, nồng độ SpO₂, góc nghiêng cột sống hoặc gợi ý bài tập giãn cơ. Hãy thử đặt câu hỏi bên dưới nhé!`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      isSupabaseQueried: true
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => textareaRef.current?.focus(), 250);
    }
  }, [isOpen, messages]);

  const handleCopyMessage = (id: string, text: string) => {
    try {
      navigator.clipboard.writeText(cleanText(text));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || input).trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      // 1. Get Firebase Auth token if logged in
      let token = '';
      try {
        const config = getSavedFirebaseConfig();
        const app = initializeFirebaseApp(config);
        const auth = getAuth(app);
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (tokenErr) {
        console.warn('Lấy Firebase Auth token:', tokenErr);
      }

      // 2. Fetch active historical logs directly
      const supaConfig = getSavedSupabaseConfig();
      let liveSupabaseLogs: any[] = [];
      try {
        if (supaConfig.url && supaConfig.anonKey) {
          const res = await fetchSupabaseHistory('all', userId, undefined);
          if (res?.data && Array.isArray(res.data)) {
            liveSupabaseLogs = res.data.slice(0, 50);
          }
        }
      } catch (supaErr) {
        console.warn('Truy vấn dữ liệu lịch sử client-side:', supaErr);
      }

      const selectedMember = allUsers.find(u => u.id === selectedMemberId);
      const targetMemberName = selectedMember ? selectedMember.fullName : 'all';

      // 3. Post to /api/chat
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query: textToSend,
          telemetry,
          history: liveSupabaseLogs.length > 0 ? liveSupabaseLogs : history.slice(0, 40),
          timeStats,
          userName,
          userId,
          supabaseConfig: supaConfig,
          targetMemberId: selectedMemberId,
          targetMemberName,
          allUsers,
          conversationHistory: messages.slice(-8).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            content: m.text
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Lỗi máy chủ (${response.status})`);
      }

      const data = await response.json();
      const botReply = data.reply || 'Hệ thống đã nhận câu hỏi của bạn nhưng chưa thể đưa ra câu trả lời chi tiết. Vui lòng thử lại sau.';

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isSupabaseQueried: Boolean(supaConfig.url && supaConfig.anonKey)
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.warn('Lỗi phản hồi chatbot, chuyển sang phân tích cục bộ:', err);
      const fallbackReply = generateLocalFallback(textToSend, telemetry, timeStats, userName);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: fallbackReply,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isSupabaseQueried: true
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  };

  const generateLocalFallback = (query: string, telem: HealthTelemetry, stats?: any, name?: string): string => {
    const q = query.toLowerCase();
    const bpm = telem?.bpm || 0;
    const spo2 = telem?.spo2 || 0;
    const sittingMins = Math.floor((stats?.sittingSeconds || sittingSeconds) / 60);

    if (q.includes('dữ liệu') || q.includes('lưu trữ') || q.includes('database')) {
      return `🗄️ **Thông Tin Cơ Sở Dữ Liệu Sức Khỏe:**\n\n` +
        `- **Trạng thái:** Dịch vụ lưu trữ trực tuyến hoạt động bình thường.\n` +
        `- **Dữ liệu theo dõi:** Toàn bộ lịch sử nhịp tim, nồng độ oxy và tư thế của ${name || 'bạn'} được đồng bộ chuỗi thời gian liên tục.\n` +
        `- **Bảo mật:** Dữ liệu cá nhân được phân quyền nghiêm ngặt và chỉ phục vụ việc cải thiện sức khỏe lao động.`;
    }

    if (q.includes('nhịp tim') || q.includes('bpm')) {
      return `❤️ **Chỉ số nhịp tim hiện tại:** ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến đo'}.\n\n` +
        (bpm >= 60 && bpm <= 100 
          ? 'Nhịp tim của bạn đang ở dải chuẩn người trưởng thành khi nghỉ ngơi (60-100 BPM).' 
          : bpm > 100 
          ? 'Nhịp tim đang hơi cao (>100 BPM). Hãy hít thở sâu, uống một ngụm nước và nghỉ ngơi 3-5 phút.' 
          : 'Hãy đặt đầu ngón tay nhẹ nhàng lên cảm biến để đo chính xác.');
    }

    if (q.includes('spo2') || q.includes('oxy')) {
      return `🫁 **Nồng độ oxy trong máu (SpO₂):** ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến đo'}.\n\n` +
        (spo2 >= 95 
          ? 'Chỉ số oxy trong máu rất tốt (≥95%). Hệ hô hấp và tuần hoàn của bạn hoạt động ổn định.' 
          : 'SpO₂ dưới 95% có thể do đặt ngón tay chưa khít hoặc không gian phòng thiếu oxy. Hãy mở cửa thông thoáng.');
    }

    if (q.includes('tư thế') || q.includes('ngồi') || q.includes('cột sống')) {
      const label = telem?.postureLabel || 'Chưa nhận diện';
      return `🩺 **Trạng thái tư thế:** ${label}.\n\n` +
        `- Thời gian ngồi liên tục: **${sittingMins} phút**.\n` +
        `- Lời khuyên: Giữ lưng tựa sát ghế, góc gập khuỷu tay ~90°, mắt nhìn ngang 1/3 trên màn hình để tránh thoái hóa đốt sống cổ.`;
    }

    if (q.includes('bài tập') || q.includes('giãn cơ') || q.includes('mỏi')) {
      return `🧘 **Gợi ý bài tập giãn cơ 2 phút tại bàn làm việc:**\n\n` +
        `1. **Thu cằm (Chin Tuck):** Ngồi thẳng, kéo cằm lùi về phía sau giữ 5 giây, lặp lại 5 lần để giải phóng đốt sống cổ C5-C7.\n` +
        `2. **Mở rộng lồng ngực:** Đan hai tay ra sau lưng, ưỡn ngực về trước, hít sâu 3 nhịp.\n` +
        `3. **Gập duỗi bàn chân:** Nâng gót chân lên xuống 15 lần để kích thích tuần hoàn tĩnh mạch chân.`;
    }

    return `Cảm ơn bạn đã hỏi! Hiện tại chỉ số của ${name || 'bạn'} ghi nhận: Nhịp tim ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}, SpO₂ ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}, thời gian ngồi ${sittingMins} phút. Hãy duy trì tư thế ngồi thẳng và nghỉ giải lao sau mỗi 45-60 phút làm việc.`;
  };

  // Clean, professional suggestions with zero technical jargon
  const quickQuestions = isAdmin ? [
    '📊 Ai đang cần cải thiện tư thế nhiều nhất?',
    '❤️ Tổng hợp nhịp tim & SpO₂ của các thành viên',
    '🚨 Thành viên nào có cảnh báo sức khỏe gần nhất?',
    '📋 Báo cáo tổng quan sức khỏe nhóm hôm nay'
  ] : [
    '🗄️ Xem lịch sử đo đạc gần đây của tôi',
    '🩺 Đánh giá tư thế ngồi & góc nghiêng cổ hiện tại',
    '❤️ Nhịp tim và nồng độ SpO₂ của tôi có ổn định không?',
    '🧘 Gợi ý bài tập giãn cơ cổ vai gáy 2 phút'
  ];

  return (
    <>
      {/* Backdrop Overlay on Mobile & Tablet */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modern Right Side Drawer Panel (Full Light Mode per UI/UX Pro Max) */}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 w-full sm:w-[460px] md:w-[490px] bg-white border-l border-slate-200/90 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Top Header (Light Mode) */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 shadow-xs">
                <Bot className="w-5 h-5 text-teal-700" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Trợ Lý AI Công Thái Học
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200 tracking-wider">
                  AI ASSISTANT
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Activity className="w-3 h-3 text-teal-600" />
                <span>Kết nối cảm biến & dữ liệu thời gian thực</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMessages([
                {
                  id: 'welcome-reset',
                  sender: 'bot',
                  text: isAdmin 
                    ? `Đã làm mới cuộc hội thoại. Bạn có thể hỏi tôi về dữ liệu theo dõi, phân tích tư thế, nhịp tim hoặc báo cáo sức khỏe của bất kỳ thành viên nào!`
                    : `Đã làm mới cuộc hội thoại. Hãy hỏi tôi về nhịp tim, nồng độ SpO₂ hoặc tư thế ngồi của bạn!`,
                  time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                  isSupabaseQueried: true
                }
              ])}
              title="Làm mới hội thoại"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              title="Thu gọn cửa sổ"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Status & Telemetry Context Bar */}
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-rose-700 font-semibold">
              <Heart className="w-3.5 h-3.5 fill-rose-500/20 text-rose-600" />
              <span>{telemetry?.bpm || '--'} BPM</span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-sky-700 font-semibold">
              SpO₂: {telemetry?.spo2 ? `${telemetry.spo2}%` : '--'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-semibold text-slate-700 truncate max-w-[190px]">
            <span className={`w-2 h-2 rounded-full ${
              telemetry?.postureStatus === 0 
                ? 'bg-emerald-500' 
                : telemetry?.postureStatus === 1 || telemetry?.postureStatus === 3 
                ? 'bg-rose-500 animate-pulse' 
                : 'bg-slate-400'
            }`} />
            <span className="truncate">{telemetry?.postureLabel || 'Chưa có tư thế'}</span>
          </div>
        </div>

        {/* Admin Member Filter Bar */}
        {isAdmin && allUsers.length > 0 && (
          <div className="px-4 py-2 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5 shrink-0">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Phạm vi tra cứu:</span>
            </span>
            <select
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(e.target.value)}
              className="text-xs font-semibold bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-slate-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[220px] truncate cursor-pointer"
            >
              <option value="all">Toàn bộ thành viên ({allUsers.length})</option>
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.fullName} {u.department ? `(${u.department})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Messages Body (Stream) */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-slate-50/40 scrollbar-thin">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 border border-teal-200 shadow-xs">
                  <Bot className="w-4 h-4 text-teal-700" />
                </div>
              )}

              <div
                className={`group relative max-w-[86%] sm:max-w-[82%] px-4 py-3 rounded-2xl shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                }`}
              >
                {/* Formatted Content */}
                <div className="text-xs sm:text-[13px]">
                  {renderFormattedMessage(msg.text)}
                </div>

                {/* Footer Meta: Time, Copy Button */}
                <div className={`flex items-center justify-between gap-3 mt-2 pt-1 border-t text-[10px] ${
                  msg.sender === 'user' ? 'border-white/20 text-white/80' : 'border-slate-100 text-slate-400'
                }`}>
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 opacity-70" />
                    <span>{msg.time}</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {msg.sender === 'bot' && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-slate-800 rounded cursor-pointer"
                        title="Sao chép nội dung"
                      >
                        {copiedId === msg.id ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                            <Check className="w-3 h-3" />
                            <span>Đã sao chép</span>
                          </span>
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-slate-600 p-3 rounded-2xl bg-white border border-slate-200 shadow-xs w-fit animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
              <span className="text-[11px] font-medium">Đang tra cứu dữ liệu đo đạc & phân tích...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestions Chips (Light Mode) */}
        {messages.length <= 4 && (
          <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 text-[11px] font-medium whitespace-nowrap transition cursor-pointer border border-slate-200 shrink-0 flex items-center gap-1.5 active:scale-95 shadow-2xs"
              >
                <span>{q}</span>
                <ArrowRight className="w-3 h-3 text-teal-600" />
              </button>
            ))}
          </div>
        )}

        {/* Input Bar (Light Mode) */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative rounded-2xl bg-slate-50 border border-slate-200 focus-within:border-teal-600 focus-within:bg-white focus-within:ring-1 focus-within:ring-teal-600/30 transition">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={2}
                placeholder="Đặt câu hỏi về tư thế, nhịp tim, bài tập giãn cơ..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-transparent text-slate-900 placeholder-slate-400 resize-none focus:outline-none scrollbar-none"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-bold flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95 shadow-sm"
              title="Gửi câu hỏi"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          <p className="text-[10px] text-slate-500 text-center mt-2">
            Nhấn Enter để gửi tin nhắn • Shift + Enter để xuống dòng
          </p>
        </div>
      </aside>
    </>
  );
};
