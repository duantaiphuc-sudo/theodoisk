import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User, 
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Activity,
  Users,
  Shield
} from 'lucide-react';
import { HealthTelemetry, TelemetryLog, AuthUser, TimeCalculations } from '../types';
import { getAuth } from 'firebase/auth';
import { getSavedFirebaseConfig, initializeFirebaseApp } from '../services/firebase';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
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

export const HealthChatbot: React.FC<HealthChatbotProps> = ({
  telemetry,
  role = 'employee',
  sittingSeconds = 0,
  badPostureSeconds = 0,
  hasData = true,
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
        ? `Xin chào Quản trị viên ${userName}! Tôi là Trợ Lý AI Quản Trị Sức Khỏe & Công Thái Học. Bạn có toàn quyền truy vấn số liệu tư thế, nhịp tim, SpO₂ hoặc báo cáo tổng hợp của bất kỳ thành viên nào trong công ty.`
        : `Xin chào ${userName}! Tôi là Trợ Lý AI Công Thái Học & Sức Khỏe Văn Phòng. Tôi có thể giải đáp chỉ số sinh trắc học (BPM, SpO₂), phân tích tư thế ngồi làm việc hoặc gợi ý bài tập giãn cơ. Hãy hỏi tôi bất cứ điều gì!`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, messages]);

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
      let token = '';
      try {
        const config = getSavedFirebaseConfig();
        const app = initializeFirebaseApp(config);
        const auth = getAuth(app);
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (tokenErr) {
        console.warn('Lỗi lấy Firebase Auth token:', tokenErr);
      }

      const selectedMember = allUsers.find(u => u.id === selectedMemberId);
      const targetMemberName = selectedMember ? selectedMember.fullName : 'all';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query: textToSend,
          telemetry,
          history: history.slice(0, 40),
          timeStats,
          userName,
          userId,
          targetMemberId: selectedMemberId,
          targetMemberName,
          allUsers,
          conversationHistory: messages.slice(-6).map(m => ({
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
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.warn('Lỗi phản hồi chatbot:', err);
      const fallbackReply = generateLocalFallback(textToSend, telemetry, timeStats, userName);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: fallbackReply,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
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

    if (q.includes('nhịp tim') || q.includes('bpm')) {
      return `❤️ **Chỉ số nhịp tim hiện tại:** ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến đo'}.\n\n` +
        (bpm >= 60 && bpm <= 100 
          ? 'Nhịp tim của bạn đang ở dải chuẩn người trưởng thành khi nghỉ ngơi (60-100 BPM).' 
          : bpm > 100 
          ? 'Nhịp tim đang hơi cao (>100 BPM). Hãy hít thở sâu, uống một ngụm nước và nghỉ ngơi 3-5 phút.' 
          : 'Hãy đặt đầu ngón tay nhẹ nhàng lên cảm biến MAX30102 để đo chính xác.');
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
        `1. **Xoay cổ & kéo căng cơ thang:** Nghiêng đầu nhẹ sang phải, giữ 10 giây, đổi bên trái.\n` +
        `2. **Mở rộng lồng ngực:** Đan hai tay ra sau lưng, ưỡn ngực về trước, hít sâu 3 nhịp.\n` +
        `3. **Gập duỗi bàn chân:** Nâng gót chân lên xuống 15 lần để kích thích tuần hoàn tĩnh mạch chân.`;
    }

    if (isAdmin && (q.includes('ai') || q.includes('thành viên') || q.includes('nhân viên') || q.includes('tổng hợp') || q.includes('toàn bộ') || q.includes('báo cáo'))) {
      const totalMembers = allUsers.length;
      return `📊 **Báo Cáo Quản Trị Hệ Thống (Dành Cho Admin):**\n\n` +
        `- Tổng số thành viên trong hệ thống: **${totalMembers} người**.\n` +
        `- Phạm vi truy vấn hiện tại: **${selectedMemberId === 'all' ? 'Toàn bộ thành viên' : allUsers.find(u => u.id === selectedMemberId)?.fullName || 'Thành viên'}**.\n` +
        `- Bạn có thể yêu cầu: *"Ai đang ngồi sai tư thế nhiều nhất?"*, *"Thống kê nhịp tim bất thường"*, hoặc chọn nhân viên ở thanh menu phía trên để tra cứu hồ sơ chuyên sâu!`;
    }

    return `Cảm ơn bạn đã hỏi! Hiện tại chỉ số của ${name || 'bạn'} ghi nhận: Nhịp tim ${bpm} BPM, SpO₂ ${spo2}%, thời gian ngồi ${sittingMins} phút. Hãy duy trì tư thế ngồi thẳng và nghỉ giải lao sau mỗi 45-60 phút làm việc.`;
  };

  const quickQuestions = isAdmin ? [
    'Ai đang ngồi sai tư thế nhiều nhất?',
    'Tổng hợp tư thế & nhịp tim toàn bộ thành viên',
    'Thành viên nào có cảnh báo bất thường?',
    'Báo cáo sức khỏe tổng quan các nhân viên'
  ] : [
    'Chỉ số sinh trắc học của tôi thế nào?',
    'Tư thế ngồi hiện tại có chuẩn không?',
    'Gợi ý bài tập giãn cơ cổ vai gáy',
    'Tôi đã ngồi liên tục bao lâu rồi?'
  ];

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 h-11 px-4 rounded-full bg-slate-950 hover:bg-slate-900 text-white shadow-xl hover:shadow-2xl border border-indigo-500/40 transition-all duration-200 cursor-pointer active:scale-95 group"
          aria-label="Mở Trợ lý AI sức khỏe"
          title="Hỏi Trợ lý AI công thái học & sức khỏe (Gemini AI)"
        >
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/40 group-hover:scale-110 transition-transform">
            <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
          </div>
          <span className="text-xs font-bold tracking-tight whitespace-nowrap">Trợ Lý AI Sức Khỏe</span>
          <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[9px] font-black uppercase tracking-wider">
            AI
          </span>
        </button>
      )}

      {/* Chatbot Window */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[95vw] sm:w-[420px] max-w-[430px] h-[560px] max-h-[85vh] flex flex-col rounded-2xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden animate-fadeIn text-slate-800">
          {/* Header */}
          <div className="px-4 py-3.5 bg-slate-950 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/25 text-indigo-400 flex items-center justify-center border border-indigo-500/40">
                <Bot className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>Trợ Lý AI Công Thái Học</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-600 text-white tracking-wider">
                    GEMINI AI
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{isAdmin ? 'Quyền Quản Trị: Toàn quyền truy vấn thành viên' : 'Hỗ trợ phân tích nhịp tim, SpO₂ & tư thế ngồi'}</span>
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
                      ? `Đã làm mới cuộc hội thoại. Bạn có thể hỏi tôi về số liệu tư thế, nhịp tim hoặc báo cáo của bất kỳ thành viên nào!`
                      : `Đã làm mới cuộc hội thoại. Hãy hỏi tôi về nhịp tim, SpO₂ hoặc tư thế ngồi của bạn!`,
                    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                  }
                ])}
                title="Làm mới hội thoại"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Đóng"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Member Scope Bar */}
          {isAdmin && allUsers.length > 0 && (
            <div className="px-3.5 py-2 bg-indigo-50/90 border-b border-indigo-100 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5 shrink-0">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>Truy vấn thành viên:</span>
              </span>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="text-xs font-semibold bg-white border border-indigo-200 rounded-lg px-2 py-1 text-slate-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[210px] truncate cursor-pointer"
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

          {/* Quick Stats Bar */}
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3 text-rose-500" />
              <span>{telemetry?.bpm || '--'} BPM</span>
            </span>
            <span className="font-mono text-sky-700">
              SpO₂: {telemetry?.spo2 ? `${telemetry.spo2}%` : '--'}
            </span>
            <span className="truncate max-w-[130px] font-semibold text-slate-700">
              {telemetry?.postureLabel || 'Chưa có tư thế'}
            </span>
          </div>

          {/* Messages Body */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2 text-xs leading-relaxed ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl shadow-2xs whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                  }`}
                >
                  <p className="text-xs">{msg.text}</p>
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      msg.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.time}
                  </span>
                </div>
                {msg.sender === 'user' && (
                  <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-200">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 p-2 rounded-xl bg-white border border-slate-200 w-fit">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span className="text-[11px] font-medium">Đang phân tích dữ liệu sức khỏe...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions */}
          {messages.length <= 3 && (
            <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium whitespace-nowrap transition cursor-pointer border border-slate-200 shrink-0"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div className="p-2.5 bg-white border-t border-slate-200 shrink-0">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Hỏi về nhịp tim, tư thế ngồi, bài tập..."
                className="flex-1 h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95 shadow-2xs"
                title="Gửi câu hỏi"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
