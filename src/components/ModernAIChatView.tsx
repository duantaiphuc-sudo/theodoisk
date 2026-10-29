import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Loader2, 
  Bot, 
  User, 
  RotateCcw, 
  Copy, 
  Check, 
  Volume2, 
  Camera, 
  Activity, 
  Heart, 
  Wind, 
  Shield, 
  Clock, 
  Zap, 
  ChevronDown,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';
import { HealthTelemetry, TelemetryLog, AuthUser, TimeCalculations } from '../types';
import { getAuth } from 'firebase/auth';
import { getSavedFirebaseConfig, initializeFirebaseApp } from '../services/firebase';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  image?: string;
  isStreaming?: boolean;
}

interface ModernAIChatViewProps {
  telemetry: HealthTelemetry;
  currentUser: AuthUser | null;
  history?: TelemetryLog[];
  timeStats?: TimeCalculations;
  allUsers?: AuthUser[];
  onOpenTasks?: () => void;
  className?: string;
}

export const ModernAIChatView: React.FC<ModernAIChatViewProps> = ({
  telemetry,
  currentUser,
  history = [],
  timeStats,
  allUsers = [],
  onOpenTasks,
  className
}) => {
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [showTelemetryContext, setShowTelemetryContext] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-0',
      sender: 'bot',
      text: isManager
        ? `Xin chào Quản trị viên **${currentUser?.fullName || 'Quản lý'}**! Tôi là **Trợ Lý AI Công Thái Học & Y Tế Lao Động** (vận hành bởi Gemini 2.5 Flash).\n\nBạn có toàn quyền truy vấn báo cáo tư thế, nhịp tim, SpO₂ hoặc tình trạng làm việc của từng thành viên trong công ty. Hãy nhập câu hỏi hoặc chọn một gợi ý bên dưới để bắt đầu.`
        : `Xin chào **${currentUser?.fullName || 'Bạn'}**! Tôi là **Trợ Lý AI Công Thái Học & Sức Khỏe Văn Phòng** của bạn.\n\nTôi liên tục đồng bộ dữ liệu sinh hiệu (BPM, SpO₂) và tư thế ngồi từ camera trạm làm việc của bạn. Hãy hỏi tôi về tư thế hiện tại, nguy cơ mỏi vai gáy hoặc gợi ý bài tập giãn cơ nhé!`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleCopyText = (id: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleSpeakText = (id: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleAttachCameraSnapshot = () => {
    if (telemetry?.image) {
      setAttachedImage(telemetry.image);
    } else {
      // Mock snapshot placeholder if camera stream not sending raw base64 frame
      setAttachedImage('/nenweb.png');
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || input).trim();
    if ((!textToSend && !attachedImage) || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      image: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    const currentAttachment = attachedImage;
    setAttachedImage(null);
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
        console.warn('Firebase token fetch warning:', tokenErr);
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
          history: history.slice(0, 50),
          timeStats,
          userName: currentUser?.fullName || currentUser?.username || 'Bạn',
          userId: currentUser?.id,
          targetMemberId: selectedMemberId,
          targetMemberName,
          allUsers,
          image: currentAttachment || undefined,
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
      const botReply = data.reply || 'Hệ thống đã nhận thông tin phân tích sức khỏe của bạn.';

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.warn('Lỗi phản hồi chatbot, chuyển sang fallback:', err);
      const fallback = generateLocalErgonomicAdvice(textToSend, telemetry, timeStats, currentUser?.fullName);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: fallback,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const generateLocalErgonomicAdvice = (query: string, telem: HealthTelemetry, stats?: any, name?: string): string => {
    const q = query.toLowerCase();
    const bpm = telem?.bpm || 0;
    const spo2 = telem?.spo2 || 0;
    const sittingMins = Math.floor((stats?.sittingSeconds || 0) / 60);
    const standingMins = Math.floor((stats?.standingSeconds || 0) / 60);

    if (q.includes('nhịp tim') || q.includes('bpm')) {
      return `### Phân Tích Nhịp Tim Trực Quan\n\n- **Chỉ số đo hiện tại:** **${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}**\n- **Đánh giá y học:** ${
        bpm >= 60 && bpm <= 100 
          ? 'Nhịp tim của bạn hoàn toàn nằm trong dải chuẩn người trưởng thành (60 - 100 BPM).' 
          : bpm > 100 
          ? 'Nhịp tim đang hơi nhanh (>100 BPM). Hãy thả lỏng cơ vai, nhắm mắt hít thở sâu theo nhịp 4-7-8 trong 2 phút.' 
          : 'Hãy đặt ngón tay nhẹ nhàng lên cảm biến MAX30102 để hệ thống đo chính xác.'
      }`;
    }

    if (q.includes('spo2') || q.includes('oxy')) {
      return `### Phân Tích Nồng Độ Oxy Trong Máu (SpO2)\n\n- **Chỉ số hiện tại:** **${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}**\n- **Kết luận:** ${
        spo2 >= 95 
          ? 'Nồng độ oxy tối ưu (≥95%). Hệ hô hấp và cung cấp máu lên não hoạt động rất tốt, giúp duy trì sự tỉnh táo cao.' 
          : 'SpO2 thấp hơn 95%. Nên đứng dậy đi lại gần cửa sổ thoáng khí và uống thêm 1 ngụm nước lọc.'
      }`;
    }

    if (q.includes('tư thế') || q.includes('cột sống') || q.includes('ngồi') || q.includes('gù')) {
      return `### Chẩn Đoán Tư Thế & Tải Trọng Cột Sống\n\n- **Trạng thái nhận diện:** **${telem?.postureLabel || 'Tư thế ĐÚNG'}**\n- **Thời gian ngồi liên tục:** **${sittingMins} phút** (Đã đứng: ${standingMins} phút)\n\n**Lời khuyên công thái học:**\n1. Điều chỉnh mép trên màn hình ngang tầm mắt để giữ góc nghiêng đầu dưới 15°.\n2. Lưng tựa sát vào đệm tựa công thái học để giảm tải đĩa đệm L4-L5.\n3. Đặt hai bàn chân phẳng trên sàn, khớp gối vuông góc 90°.`;
    }

    if (q.includes('bài tập') || q.includes('giãn cơ') || q.includes('mỏi')) {
      return `### Bài Tập Giãn Cơ 2 Phút Tại Bàn Làm Việc\n\n1. **Kéo giãn cơ thang cổ:** Đặt tay phải lên đỉnh đầu, kéo nhẹ về bên phải giữ 10 giây. Đổi bên trái.\n2. **Mở rộng khoang ngực:** Đan hai bàn tay ra sau lưng, ưỡn lồng ngực về phía trước, hít sâu 3 nhịp dài.\n3. **Xoay thân cột sống:** Đặt tay phải lên thành ghế trái, xoay người nhẹ sang trái trong 5 giây để thư giãn lưng dưới.\n4. **Quy tắc 20-20-20:** Nhìn xa 20 feet (6 mét) trong 20 giây để giảm điều tiết cơ mắt.`;
    }

    return `Cảm ơn bạn đã đặt câu hỏi! Chỉ số hiện tại của ${name || 'bạn'}:\n- Nhịp tim: **${bpm} BPM**\n- Nồng độ oxy SpO₂: **${spo2}%**\n- Thời gian ngồi: **${sittingMins} phút**\n- Tư thế: **${telem?.postureLabel || 'Chuẩn'}**\n\nHãy duy trì tư thế ngồi thẳng và nghỉ giải lao sau mỗi 45 phút làm việc!`;
  };

  const starterPrompts = isManager ? [
    { title: 'Ai đang ngồi sai tư thế nhiều nhất?', desc: 'Thống kê thành viên có thời gian gù lưng cao nhất' },
    { title: 'Tổng hợp sức khỏe toàn bộ nhân viên', desc: 'Báo cáo chỉ số BPM, SpO₂ và cảnh báo hôm nay' },
    { title: 'Thành viên nào có cảnh báo bất thường?', desc: 'Rà soát danh sách nhân sự có nhịp tim nhanh hoặc thiếu oxy' },
    { title: 'Báo cáo tuân thủ giờ giải lao', desc: 'Đánh giá tỷ lệ Sit-Stand và thời gian đứng vận động' }
  ] : [
    { title: 'Tư thế ngồi hiện tại của tôi có chuẩn không?', desc: 'Phân tích góc nghiêng cột sống và tư thế cổ' },
    { title: 'Gợi ý bài tập giãn cơ cổ vai gáy 2 phút', desc: 'Động tác nhanh giúp giải tỏa mỏi cơ ngay tại bàn' },
    { title: 'Đánh giá chỉ số nhịp tim & nồng độ oxy', desc: 'Kiểm tra xem BPM và SpO₂ có đạt dải an toàn' },
    { title: 'Kế hoạch xen kẽ Ngồi - Đứng 20-8-2', desc: 'Lịch trình làm việc khoa học bảo vệ đĩa đệm cột sống' }
  ];

  return (
    <div className={`flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto rounded-3xl bg-white border border-slate-200/90 shadow-sm overflow-hidden text-slate-800 ${className || ''}`}>
      {/* 1. Header Toolbar */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Model Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Trợ Lý AI Công Thái Học
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                Gemini 2.5 Flash
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Đồng bộ cảm biến IoT trực tiếp</span>
            </p>
          </div>
        </div>

        {/* Right: Controls & Admin Scope */}
        <div className="flex items-center gap-2">
          {/* Admin Member Selector */}
          {isManager && allUsers.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="bg-transparent font-semibold text-indigo-900 focus:outline-none cursor-pointer max-w-[170px] truncate"
              >
                <option value="all">Toàn bộ nhân viên ({allUsers.length})</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} {u.department ? `(${u.department})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle Live Telemetry Context Pill */}
          <button
            type="button"
            onClick={() => setShowTelemetryContext(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
              showTelemetryContext
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
            title="Xem chỉ số sinh trắc học đang truyền vào ngữ cảnh AI"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden md:inline">Chỉ số trực tuyến:</span>
            <span className="font-mono text-emerald-600 font-bold">{telemetry?.bpm || '--'} BPM</span>
          </button>

          {/* Reset Chat Button */}
          <button
            type="button"
            onClick={() => setMessages([
              {
                id: `welcome-${Date.now()}`,
                sender: 'bot',
                text: `Đã làm mới cuộc trò chuyện. Hãy hỏi tôi về nhịp tim, nồng độ oxy SpO₂ hoặc hướng dẫn chỉnh tư thế ngồi nhé!`,
                time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
              }
            ])}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
            title="Bắt đầu đoạn chat mới"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Live Telemetry Drawer (Optional Expand) */}
      {showTelemetryContext && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <Heart className="w-4 h-4 text-rose-500" />
            <div>
              <span className="text-[10px] text-slate-500 block">Nhịp tim</span>
              <span className="font-mono font-bold text-slate-900">{telemetry?.bpm || '--'} BPM</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <Wind className="w-4 h-4 text-sky-500" />
            <div>
              <span className="text-[10px] text-slate-500 block">SpO₂ Oxy</span>
              <span className="font-mono font-bold text-slate-900">{telemetry?.spo2 ? `${telemetry.spo2}%` : '--'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <Activity className="w-4 h-4 text-emerald-500" />
            <div>
              <span className="text-[10px] text-slate-500 block">Tư thế</span>
              <span className="font-semibold text-slate-900 truncate block max-w-[120px]">
                {telemetry?.postureLabel || 'Chuẩn'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            <Clock className="w-4 h-4 text-amber-500" />
            <div>
              <span className="text-[10px] text-slate-500 block">Đã ngồi liên tục</span>
              <span className="font-mono font-bold text-slate-900">
                {Math.floor((timeStats?.continuousSittingSeconds || 0) / 60)} phút
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Messages Canvas */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 text-sm leading-relaxed ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {/* Bot Avatar */}
            {msg.sender === 'bot' && (
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
            )}

            <div className={`group relative max-w-[85%] sm:max-w-[78%] flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Optional user-attached snapshot image */}
              {msg.image && (
                <div className="mb-2 max-w-[260px] rounded-2xl overflow-hidden border border-slate-300 shadow-sm">
                  <img src={msg.image} alt="Ảnh chụp camera gửi AI" className="w-full h-auto object-cover" />
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`px-4 sm:px-5 py-3.5 rounded-3xl whitespace-pre-line text-sm ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-md shadow-xs'
                    : 'bg-white text-slate-900 border border-slate-200/90 rounded-bl-md shadow-xs'
                }`}
              >
                {msg.text}
              </div>

              {/* Message Meta & Action Toolbar */}
              <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-600 font-medium">
                <span>{msg.time}</span>
                {msg.sender === 'bot' && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 hover:text-slate-900 transition cursor-pointer"
                      title="Sao chép câu trả lời"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleSpeakText(msg.id, msg.text)}
                      className="inline-flex items-center gap-1 hover:text-slate-900 transition cursor-pointer"
                      title="Đọc câu trả lời bằng giọng nói"
                    >
                      <Volume2 className={`w-3 h-3 ${speakingId === msg.id ? 'text-indigo-600 animate-pulse' : ''}`} />
                      <span>{speakingId === msg.id ? 'Đang đọc...' : 'Nghe'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* User Avatar */}
            {msg.sender === 'user' && (
              <div className="w-9 h-9 rounded-2xl bg-indigo-100 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs shadow-xs">
                <User className="w-5 h-5" />
              </div>
            )}
          </div>
        ))}

        {/* AI Typing / Thinking State */}
        {loading && (
          <div className="flex gap-3 items-center text-xs text-slate-500">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-2">
              <span className="flex space-x-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span className="font-semibold text-slate-600">Gemini đang phân tích dữ liệu sinh hiệu & tư thế...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Starter Suggestions Carousel (When conversation is fresh or user wants fast triggers) */}
      {messages.length <= 3 && (
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200/80">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-500" />
            <span>Câu hỏi gợi ý nhanh:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {starterPrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(p.title)}
                className="p-2.5 rounded-xl bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 transition text-left cursor-pointer group flex items-start justify-between gap-2 shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {p.title}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                    {p.desc}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5 shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. Modern Bottom Input Dock */}
      <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 shrink-0">
        {/* Attachment preview pill if camera snapshot is loaded */}
        {attachedImage && (
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 font-semibold animate-fadeIn">
            <Camera className="w-3.5 h-3.5 text-indigo-600" />
            <span>Đã đính kèm ảnh tư thế ngồi từ Camera</span>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="ml-1 text-slate-400 hover:text-slate-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <form
          onSubmit={e => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2.5"
        >
          {/* Multimodal Camera Snapshot Button */}
          <button
            type="button"
            onClick={handleAttachCameraSnapshot}
            className="w-11 h-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0 border border-slate-200 active:scale-95"
            title="Đính kèm ảnh chụp camera hiện tại để AI phân tích tư thế"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* Textarea Input with Auto-Grow feel */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Nhập câu hỏi về nhịp tim, tư thế ngồi, bài tập giãn cơ... (Enter để gửi)"
              className="w-full resize-none py-3 px-4 text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition leading-relaxed max-h-32 text-slate-900 placeholder:text-slate-600"
              disabled={loading}
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={loading || (!input.trim() && !attachedImage)}
            className="w-11 h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95 shadow-md shadow-indigo-600/20"
            title="Gửi câu hỏi"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        <div className="mt-2 text-center text-[10px] text-slate-600 flex items-center justify-center gap-1.5 font-medium">
          <Info className="w-3 h-3 text-slate-500" />
          <span>AI hỗ trợ đưa ra khuyến nghị công thái học y tế dựa trên dữ liệu telemetry thực tế từ trạm Raspberry Pi 4.</span>
        </div>
      </div>
    </div>
  );
};
