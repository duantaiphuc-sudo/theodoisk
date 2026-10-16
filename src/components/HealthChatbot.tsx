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

  // Fallback heuristic analyzer when server is unreachable
  const generateFallbackResponse = (userQuery: string): string => {
    const text = userQuery.trim().toLowerCase();

    // Check for exact hour/minute matching in query, e.g. "15h50", "15:50", "14h", "16h05"
    const timeMatch = text.match(/(\d{1,2})[h:](\d{1,2})?/);
    if (timeMatch && history.length > 0) {
      const targetHour = parseInt(timeMatch[1], 10);
      const targetMinute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const targetTimeMinutes = targetHour * 60 + targetMinute;

      // Find closest history log in minutes
      let closestLog: TelemetryLog | null = null;
      let minDiff = Infinity;

      for (const log of history) {
        const d = new Date(log.timestamp);
        const logMinutes = d.getHours() * 60 + d.getMinutes();
        const diff = Math.abs(logMinutes - targetTimeMinutes);
        if (diff < minDiff) {
          minDiff = diff;
          closestLog = log;
        }
      }

      if (closestLog && minDiff <= 35) {
        const logDate = new Date(closestLog.timestamp);
        const exactTime = logDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const isGood = closestLog.postureStatus === 0;
        const isBad = closestLog.postureStatus === 1 || closestLog.postureStatus === 3;
        const isStanding = closestLog.postureStatus === 5;
        const isAbsent = closestLog.postureStatus === 2;

        let verdict = '';
        if (isGood) {
          verdict = `✅ Vào lúc **${exactTime}**, ${isAdmin && selectedMemberName !== 'Tất cả' ? selectedMemberName : 'bạn'} đang **ngồi ĐÚNG TƯ THẾ** (thẳng lưng, mắt nhìn ngang màn hình).`;
        } else if (isBad) {
          verdict = `⚠️ Vào lúc **${exactTime}**, ${isAdmin && selectedMemberName !== 'Tất cả' ? selectedMemberName : 'bạn'} đang **ngồi SAI TƯ THẾ** (${closestLog.postureLabel || 'Cúi gù lưng / chúi cổ về trước'}). Hệ thống đã kích hoạt cảnh báo tư thế.`;
        } else if (isStanding) {
          verdict = `🚶 Vào lúc **${exactTime}**, ${isAdmin && selectedMemberName !== 'Tất cả' ? selectedMemberName : 'bạn'} đang ở trạng thái **ĐỨNG / VẬN ĐỘNG**.`;
        } else if (isAbsent) {
          verdict = `👤 Vào lúc **${exactTime}**, ${isAdmin && selectedMemberName !== 'Tất cả' ? selectedMemberName : 'bạn'} **rời khỏi ghế / ngoài vùng quan sát** của camera.`;
        } else {
          verdict = `📊 Vào lúc **${exactTime}**, trạng thái ghi nhận: **${closestLog.postureLabel}**.`;
        }

        return `${verdict}\n\n- **Nhịp tim:** ${closestLog.bpm > 0 ? `${closestLog.bpm} BPM` : 'Không đeo cảm biến'}\n- **Nồng độ SpO2:** ${closestLog.spo2 > 0 ? `${closestLog.spo2}%` : 'Không đeo cảm biến'}\n\n💡 **Lời khuyên:** Duy trì góc nghiêng cổ từ 150° - 165° để giảm 70% áp lực chèn ép lên đốt sống cổ C5-C7 nhé!`;
      } else {
        return `🔍 Tôi đã quét dữ liệu lịch sử nhưng **không tìm thấy bản ghi nào quanh mốc ${timeMatch[0]}** (có thể do lúc đó thiết bị chưa bật, hoặc lịch sử vừa được làm sạch).\n\nBản ghi gần đây nhất trong máy là lúc **${history[0]?.timeFormatted || 'chưa có'}** với trạng thái: *${history[0]?.postureLabel || 'không có dữ liệu'}*.`;
      }
    }

    if (isAdmin && (text.includes('ai ngồi sai') || text.includes('sai nhiều nhất') || text.includes('so sánh'))) {
      return `📊 **Phân tích Quản trị viên:**\n\nĐể xem xếp hạng chi tiết và so sánh tư thế của tất cả nhân viên, bạn hãy chuyển qua tab **\"Truy Vấn Lịch Sử Supabase SQL\"** trong **Danh Mục Quản Trị Hệ Thống** để xem bảng thống kê số học trực tiếp từ PostgreSQL!`;
    }

    // Work summary
    if (text.includes('tổng quan') || text.includes('hôm nay') || text.includes('thống kê') || text.includes('bao lâu')) {
      const sittingMins = Math.floor((sittingSeconds || 0) / 60);
      const badMins = Math.floor((badPostureSeconds || 0) / 60);
      return `📊 **Báo cáo sức khỏe & thời gian làm việc hôm nay:**\n\n- ⏱️ **Tổng thời gian ngồi:** ${sittingMins} phút\n- ⚠️ **Thời gian ngồi sai tư thế:** ${badMins} phút\n- ❤️ **Nhịp tim hiện tại:** ${telemetry.bpm > 0 ? `${telemetry.bpm} BPM` : 'Đang chờ cảm biến'}\n- 🫁 **SpO2 hiện tại:** ${telemetry.spo2 > 0 ? `${telemetry.spo2}%` : 'Đang chờ cảm biến'}\n- 📐 **Tư thế trực tiếp:** ${telemetry.postureLabel}\n\n💡 Bạn nên áp dụng quy tắc **50-10**: Cứ 50 phút ngồi hãy đứng lên đi lại 10 phút để tăng lưu thông máu não.`;
    }

    // Exercise tips
    if (text.includes('bài tập') || text.includes('giãn cơ') || text.includes('mỏi cổ') || text.includes('đau lưng')) {
      return `🧘 **3 bài tập công thái học nhanh tại bàn làm việc (1 phút):**\n\n1. **Kéo cằm (Chin Tuck):** Ngồi thẳng lưng, nhìn thẳng về phía trước, nhẹ nhàng thu cằm về sau như thể tạo nọng cằm. Giữ 5 giây, lặp lại 5 lần (giảm đau đốt sống cổ).\n2. **Mở ngực & ép bả vai (Chest Opener):** Đan hai tay ra sau gáy, hít sâu và mở rộng khuỷu tay sang hai bên, ép hai bả vai vào nhau. Giữ 10 giây.\n3. **Vươn cột sống:** Đan hai bàn tay lại, ngửa lòng bàn tay hướng lên trần nhà và vươn người cao hết mức có thể trong 15 giây.`;
    }

    // Default general response
    return `🩺 **Trợ lý Công thái học:** Hiện tại tư thế của bạn đang là **${telemetry.postureLabel}** (Nhịp tim: ${telemetry.bpm} BPM, SpO2: ${telemetry.spo2}%).\n\nBạn có thể hỏi tôi về mốc thời gian cụ thể trong ngày (ví dụ: *"Lúc 15h50 tôi ngồi đúng hay sai?"*) hoặc kiểm tra thời gian ngồi làm việc hôm nay!`;
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

    try {
      // Lấy Firebase ID token của phiên hiện tại để xác thực an toàn
      const config = getSavedFirebaseConfig();
      const app = initializeFirebaseApp(config);
      const auth = getAuth(app);
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';

      if (!idToken) {
        throw new Error('Vui lòng đăng nhập để sử dụng Trợ Lý Công Thái Học AI');
      }

      // Call server-side Gemini API proxy /api/chat with rich context and Bearer token
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
