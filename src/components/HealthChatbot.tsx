import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Bot, 
  Sparkles, 
  Clock, 
  RotateCcw,
  HelpCircle
} from 'lucide-react';
import { HealthTelemetry, UserRole, ChatMessage } from '../types';
import { queryHistoricalData } from '../services/historyService';

interface HealthChatbotProps {
  telemetry: HealthTelemetry;
  role: UserRole;
  sittingSeconds: number;
  badPostureSeconds: number;
  hasData: boolean;
  userName?: string;
}

export const HealthChatbot: React.FC<HealthChatbotProps> = ({
  telemetry,
  role,
  hasData,
  userName = 'bạn',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'bot',
      text: `Xin chào ${userName}! Tôi là Trợ Lý Công Thái Học & Sức Khỏe AI thông minh.\n\nTôi có thể **truy xuất dữ liệu lịch sử đo** (nhịp tim 1 giờ trước, 3 ngày trước, tư thế hôm qua...), giải thích chỉ số y tế và gợi ý bài tập cột sống. Hãy thử hỏi tôi bất kỳ câu hỏi nào!`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const generateAIResponse = (userQuery: string): string => {
    const text = userQuery.trim();
    const lower = text.toLowerCase();

    // 1. Check if query is asking for historical / time-based data retrieval
    const hasTimeKeyword = 
      lower.includes('ngày trước') ||
      lower.includes('giờ trước') ||
      lower.includes('tiếng trước') ||
      lower.includes('hôm qua') ||
      lower.includes('hôm kia') ||
      lower.includes('ngày qua') ||
      lower.includes('3 ngày') ||
      lower.includes('1 giờ') ||
      lower.includes('2 giờ') ||
      lower.includes('lúc trước') ||
      lower.includes('hồi trước') ||
      lower.includes('lịch sử') ||
      lower.includes('trung bình') ||
      lower.includes('thống kê') ||
      lower.includes('tuần này');

    if (hasTimeKeyword || (lower.includes('nhịp tim') && (lower.includes('trước') || lower.includes('qua')))) {
      const result = queryHistoricalData(text, hasData ? telemetry : undefined);
      if (result.matched) {
        return result.summaryText;
      }
    }

    // 2. Query about current live posture
    if (lower.includes('tư thế') || lower.includes('posture') || lower.includes('ngồi') || lower.includes('cột sống')) {
      if (!hasData) {
        return `⚠️ Hiện tại hệ thống **chưa nhận được dữ liệu thời gian thực** từ Raspberry Pi 4 hoặc cảm biến camera.\n\n➔ Hãy kiểm tra kết nối thiết bị hoặc bấm nút "Giả lập Pi 4" trên thanh công cụ để thử nghiệm ngay lập tức.\n➔ Tuy nhiên, bạn có thể hỏi tôi dữ liệu quá khứ, ví dụ: *"Tư thế của tôi 3 ngày trước thế nào?"* hoặc *"Hôm qua tôi ngồi bao lâu?"*.`;
      }
      let reply = `🔍 **Trạng thái tư thế thời gian thực:** "${telemetry.postureLabel}".\n\n`;
      if (telemetry.angleNeck !== undefined) {
        reply += `📐 **Góc nghiêng cổ:** ${telemetry.angleNeck}° (Góc chuẩn công thái học nên từ 150° - 165°).\n`;
      }
      if (telemetry.postureWarning) {
        reply += `⚠️ **Cảnh báo:** ${telemetry.postureWarning}\n\n`;
      }
      if (telemetry.postureStatus === 0) {
        reply += `✅ Rất tốt! Bạn đang ngồi thẳng lưng, tầm mắt ngang 1/3 trên màn hình. Hãy duy trì trạng thái này!`;
      } else if (telemetry.postureStatus === 1 || telemetry.postureStatus === 3) {
        reply += `⚠️ Bạn đang cúi đầu hoặc gù lưng. Lực đè lên đốt sống cổ C5-C7 đang tăng gấp 3-4 lần trọng lượng đầu (~18-22kg). Hãy kéo bả vai ra sau và nâng cằm lên nhé!`;
      } else if (telemetry.postureStatus === 4) {
        reply += `⏰ Bạn đã ngồi làm việc liên tục khá lâu. Đứng dậy đi lại 3 phút để kích hoạt tĩnh mạch chi dưới nhé.`;
      } else {
        reply += `👤 Chưa phát hiện người ngồi trong vùng giám sát Monitor Zone của camera.`;
      }
      return reply;
    }

    // 3. Query about current heart rate
    if (lower.includes('nhịp tim') || lower.includes('bpm') || lower.includes('tim')) {
      if (!hasData) {
        return `❤️ Hiện tại **chưa có dữ liệu nhịp tim trực tiếp** từ cảm biến MAX30102.\n\nBạn có thể hỏi tôi dữ liệu quá khứ: *"Nhịp tim của tôi 1 giờ trước thế nào?"* hoặc *"Nhịp tim của tôi 3 ngày trước?"* để tôi truy xuất ngay từ kho lưu trữ!`;
      }
      let reply = `❤️ **Nhịp tim đo được từ MAX30102:** **${telemetry.bpm} BPM**\n\n`;
      if (telemetry.bpm >= 60 && telemetry.bpm <= 85) {
        reply += `✅ Nhịp tim đang ở mức nghỉ ngơi tối ưu (60 - 85 bpm), thể hiện bạn đang bình tĩnh và tập trung tốt.`;
      } else if (telemetry.bpm > 85 && telemetry.bpm <= 100) {
        reply += `⚡ Nhịp tim hơi nhanh nhẹ. Hãy uống một ngụm nước ấm và hít thở sâu 3 nhịp.`;
      } else if (telemetry.bpm > 100) {
        reply += `🚨 Nhịp tim cao (>100 bpm). Bạn có đang lo lắng hoặc vừa vận động không? Hãy tạm dừng công việc 2 phút để thư giãn.`;
      } else {
        reply += `Đang chờ đặt ngón tay cố định lên mắt cảm biến MAX30102...`;
      }
      return reply;
    }

    // 4. Query about SpO2
    if (lower.includes('spo2') || lower.includes('oxy') || lower.includes('oxygen')) {
      if (!hasData) {
        return `🫁 **SpO₂ trực tiếp:** Đang chờ tín hiệu từ cảm biến quang học MAX30102. Bạn có thể hỏi *"SpO2 1 giờ trước"* hoặc *"SpO2 3 ngày trước"* để xem lịch sử đo!`;
      }
      let reply = `🫁 **Nồng độ oxy trong máu SpO₂:** **${telemetry.spo2}%**\n\n`;
      if (telemetry.spo2 >= 96) {
        reply += `✅ Mức bão hòa oxy máu rất dồi dào (>96%), đảm bảo tuần hoàn não minh mẫn và phản xạ nhanh nhạy.`;
      } else {
        reply += `⚠️ Nồng độ oxy dưới 96%. Bạn nên mở cửa sổ hoặc đi ra nơi thoáng gió để hít thở không khí tươi.`;
      }
      return reply;
    }

    // 5. Ergonomic exercises
    if (lower.includes('bài tập') || lower.includes('giãn cơ') || lower.includes('mỏi cổ') || lower.includes('mỏi lưng') || lower.includes('đau')) {
      return `🧘 **3 Bài tập giải tỏa áp lực cột sống trong 60 giây tại bàn làm việc:**\n\n` +
        `1. **Chin Tuck (Rút cằm chống gù cổ):** Giữ thẳng lưng, kéo cằm vào trong như tạo cằm đôi, giữ 5 giây rồi thả lỏng. Lặp lại 5 lần để đưa đốt sống cổ về trục chuẩn.\n\n` +
        `2. **Mở rộng ngực & bả vai:** Đan hai tay sau gáy, mở rộng hai khuỷu tay sang hai bên, hít sâu nâng lồng ngực lên trần nhà, giữ 10 giây.\n\n` +
        `3. **Xoay thân ghế:** Ngồi thẳng, đặt tay phải lên tựa lưng bên trái, xoay nhẹ thân trên sang trái thở ra, giữ 8 giây rồi đổi bên. Giúp bôi trơn đĩa đệm thắt lưng L4-L5.`;
    }

    // 6. Raspberry Pi & Firebase Connection help
    if (lower.includes('pi') || lower.includes('raspberry') || lower.includes('kết nối') || lower.includes('firebase')) {
      return `🔌 **Hướng dẫn kết nối Raspberry Pi 4 lên Firebase:**\n\n` +
        `1. Mở mục **"Code Raspberry Pi 4"** trên thanh tiêu đề để tải script Python hoàn chỉnh.\n` +
        `2. Script sẽ tự động gửi vào Collection: \`devices\`, Document: \`pi4_node_1\`.\n` +
        `3. Các trường dữ liệu chuẩn gồm: \`heart_rate\`, \`spo2\`, \`posture_status\`, \`angle_neck\`, \`posture_warning\`.\n` +
        `4. Trên Firebase Firestore, đảm bảo Rules cho phép ghi: \`allow read, write: if true;\`.`;
    }

    // 7. General fallback with suggestions
    return `Tôi hiểu câu hỏi của bạn! Tôi có thể giúp bạn các tính năng sau:\n\n` +
      `🕒 **Truy xuất dữ liệu lịch sử:**\n` +
      `• *"Nhịp tim của tôi 1 giờ trước như thế nào?"*\n` +
      `• *"Nhịp tim & SpO₂ của tôi 3 ngày trước ra sao?"*\n` +
      `• *"Hôm qua tôi có bị cảnh báo gù lưng không?"*\n\n` +
      `🩺 **Tư vấn công thái học:**\n` +
      `• *"Gợi ý bài tập giảm mỏi cổ"* | *"Tư thế hiện tại của tôi"*`;
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate intelligent AI processing
    setTimeout(() => {
      const botReplyText = generateAIResponse(text);
      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'bot',
        text: botReplyText,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 450);
  };

  const quickPrompts = [
    'Nhịp tim của tôi 1 giờ trước thế nào?',
    'Nhịp tim của tôi 3 ngày trước ra sao?',
    'Hôm qua tôi có bị sai tư thế không?',
    'Thống kê sức khỏe tuần này',
    'Gợi ý bài tập giãn cơ cổ & lưng',
  ];

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-3.5 sm:bottom-5 sm:right-5 z-40 flex items-center gap-2 p-2.5 sm:px-4 sm:py-3 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-xl shadow-sky-600/30 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
        title="Hỏi Trợ Lý AI"
      >
        <Bot className="w-5 h-5 animate-pulse" />
        <span className="text-xs font-bold hidden sm:inline">Hỏi Trợ Lý AI</span>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
        </span>
      </button>

      {/* Floating Chatbot Window */}
      {isOpen && (
        <div className="fixed bottom-16 sm:bottom-20 left-2 right-2 sm:left-auto sm:right-5 z-50 sm:w-[420px] max-w-[calc(100vw-16px)] h-[560px] max-h-[82vh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-fadeIn text-slate-800">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-sky-100 text-sky-700 border border-sky-200">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>Trợ Lý Sức Khỏe AI & Truy Xuất Dữ Liệu</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                </h3>
                <p className="text-[10px] text-slate-500">
                  {role === 'manager' ? 'Chế độ Quản Trị Viên (Admin)' : 'Chế độ Người Dùng Cá Nhân (User)'} • Raspberry Pi 4
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setMessages([
                    {
                      id: String(Date.now()),
                      sender: 'bot',
                      text: 'Đã xóa hội thoại cũ. Bạn cần truy xuất dữ liệu nào (ví dụ: *"Nhịp tim 3 ngày trước"*, *"1 giờ trước"*...)?',
                      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    },
                  ]);
                }}
                title="Làm mới hội thoại"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition text-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Info bar */}
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-sky-600" />
              Truy xuất dữ liệu: 1h, 3 ngày, hôm qua...
            </span>
            <span className="text-emerald-600 font-bold">Ready</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs bg-white">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] p-3 rounded-xl leading-relaxed whitespace-pre-line ${
                    m.sender === 'user'
                      ? 'bg-sky-600 text-white rounded-br-none shadow-xs font-medium'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none'
                  }`}
                >
                  <p>{m.text}</p>
                  <span className={`block text-[9px] mt-1 text-right font-mono ${
                    m.sender === 'user' ? 'text-sky-100' : 'text-slate-400'
                  }`}>
                    {m.time}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-bounce delay-200"></span>
                  <span className="text-[11px] ml-1">Đang tra cứu dữ liệu...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 space-y-1">
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-indigo-600" />
              <span>Gợi ý câu hỏi nhanh:</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {quickPrompts.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] bg-white hover:bg-slate-100 text-slate-700 transition shrink-0 border border-slate-200 hover:border-sky-500 cursor-pointer shadow-2xs font-medium"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input form */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="VD: Nhịp tim của tôi 3 ngày trước thế nào?"
              value={input}
              onChange={e => setInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2.5 rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition disabled:opacity-40 shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
