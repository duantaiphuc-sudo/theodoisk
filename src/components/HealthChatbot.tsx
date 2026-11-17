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
  Heart,
  Camera,
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  Sliders,
  ListPlus,
  Wrench,
  HelpCircle,
  ChevronUp
} from 'lucide-react';
import { HealthTelemetry, TelemetryLog, AuthUser, TimeCalculations, AlertThresholds, UserTaskNotification } from '../types';
import { getAuth } from 'firebase/auth';
import { getSavedFirebaseConfig, initializeFirebaseApp } from '../services/firebase';
import { getSavedSupabaseConfig, fetchSupabaseHistory } from '../services/supabaseService';
import { loadCompanyBonusPolicy, calculateEmployeeBonus, formatCurrencyVND } from '../utils/bonusPolicy';
import { OHPSCalculationResult } from '../utils/ohpsCalculator';
import { buildPredictiveAnalytics } from '../utils/predictiveAnalytics';

export interface PendingChatbotAction {
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
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isSupabaseQueried?: boolean;
  image?: string;
  toolCallsUsed?: string[];
  sqiScore?: number | null;
  pendingAction?: PendingChatbotAction | null;
  actionExecuted?: boolean;
  actionResultText?: string;
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
  thresholds?: AlertThresholds;
  ohpsData?: OHPSCalculationResult;
  tasks?: UserTaskNotification[];
  userProfile?: Partial<AuthUser>;
  onApplyThresholds?: (nextThresholds: AlertThresholds, targetUserId?: string) => Promise<void> | void;
  onCreateTask?: (task: {
    title: string;
    content: string;
    priority: 'normal' | 'high' | 'urgent';
    targetUserName?: string;
    deadline?: string;
  }) => Promise<void> | void;
}

const CAPABILITY_CATEGORIES = [
  {
    title: '1. Tư thế & Camera AI Vision',
    prompt: 'Đánh giá tư thế ngồi & góc nghiêng cổ hiện tại',
    desc: 'Phân tích góc cổ, phát hiện gù lưng và chấm ảnh chụp Camera Pi 4.'
  },
  {
    title: '2. Nhịp tim (BPM) & SpO₂ MAX30102',
    prompt: 'Nhịp tim và nồng độ SpO2 hiện tại của tôi có ổn không?',
    desc: 'Đánh giá chỉ số sinh hiệu thời gian thực và gợi ý nhịp thở 4-7-8.'
  },
  {
    title: '3. Dự báo rủi ro & Giờ vàng (WLS/Z-Score)',
    prompt: 'Dự báo nguy cơ mỏi cổ lưng 2 giờ tới và khung giờ vàng của tôi',
    desc: 'Dự đoán khi nào mỏi cổ/lưng, khung giờ tập trung cao & lệch chuẩn Z-Score.'
  },
  {
    title: '4. Điểm OHPS & Tiền thưởng công thái học',
    prompt: 'Tôi đang được bao nhiêu điểm OHPS và dự kiến thưởng bao nhiêu tiền?',
    desc: 'Tính điểm OHPS, quy đổi tiền thưởng VNĐ và cách đạt mức thưởng cao hơn.'
  },
  {
    title: '5. Tra cứu lịch sử đo đạc theo mốc giờ',
    prompt: 'Thống kê các lần sai tư thế gần đây của tôi',
    desc: 'Truy vấn log Supabase theo giờ/buổi (vd: 14h hôm nay, sáng nay).'
  },
  {
    title: '6. Quản lý nhiệm vụ & Đặt lịch nhắc',
    prompt: 'Tôi còn nhiệm vụ nào chưa xong và hãy tạo nhắc nhở đứng giãn cơ 3 phút',
    desc: 'Kiểm tra task đang chờ và tạo thẻ nhắc nhở 1 chạm lưu lên Firebase.'
  },
  {
    title: '7. Tinh chỉnh & Đồng bộ ngưỡng Pi 4',
    prompt: 'Đề xuất và chỉnh ngưỡng ngồi lâu xuống 35 phút giúp tôi',
    desc: 'Tạo thẻ xác nhận cập nhật ngưỡng HR/SpO₂/ngồi lâu thẳng xuống Pi 4.'
  }
];

const THRESHOLD_LABELS: Record<string, { label: string; unit: string }> = {
  hrMin: { label: 'HR Min', unit: 'BPM' },
  hrMax: { label: 'HR Max', unit: 'BPM' },
  spo2Min: { label: 'SpO2 Min', unit: '%' },
  incorrectPostureSec: { label: 'Sai tư thế', unit: 'giây' },
  longIncorrectSec: { label: 'Sai tư thế lâu', unit: 'giây' },
  longSittingSec: { label: 'Ngồi lâu', unit: 'giây' },
  standingTargetSec: { label: 'Mục tiêu đứng', unit: 'giây' },
  biometricReminderSec: { label: 'Nhắc đo sinh hiệu', unit: 'giây' },
};

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
        <h4 key={lineIdx} className="font-bold text-slate-900 text-xs sm:text-sm mt-2.5 mb-1">
          {cleanHeader}
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
  initialSelectedMemberId,
  thresholds,
  ohpsData,
  tasks = [],
  userProfile,
  onApplyThresholds,
  onCreateTask
}) => {
  const isAdmin = role === 'admin' || role === 'manager';
  const [selectedMemberId, setSelectedMemberId] = useState<string>(initialSelectedMemberId || 'all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [executingActionMsgId, setExecutingActionMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [showCapabilityGuide, setShowCapabilityGuide] = useState<boolean>(false);

  useEffect(() => {
    if (initialSelectedMemberId) {
      setSelectedMemberId(initialSelectedMemberId);
    }
  }, [initialSelectedMemberId]);

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (!open && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(open);
    }
    onOpenChange?.(open);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome-1',
      sender: 'bot',
      text: isAdmin
        ? `Xin chào Quản trị viên **${userName}**!\n\nTôi là **Trợ Lý AI Công Thái Học** (Gemini 4 Agent kết nối Supabase & Raspberry Pi 4).\n\nBạn có thể hỏi báo cáo từng nhân viên, dự báo rủi ro WLS/Z-Score, xem điểm OHPS/thưởng, đính kèm ảnh Camera Pi 4 hoặc yêu cầu tạo nhiệm vụ / chỉnh ngưỡng trực tiếp. Bấm **"Hỏi được gì?"** ở góc trên để xem danh sách đầy đủ.`
        : `Xin chào **${userName}**!\n\nTôi là **Trợ Lý Sức Khỏe & Công Thái Học** của bạn. Tôi hỗ trợ đánh giá tư thế, nhịp tim/SpO₂, dự báo rủi ro 2 giờ tới, tra cứu lịch sử theo giờ, kiểm tra điểm OHPS & thưởng, tạo nhắc nhở hoặc đồng bộ ngưỡng Pi 4.\n\nBấm **"Hỏi được gì?"** ở góc trên để xem các nhóm câu hỏi mẫu.`,
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

  const handleSpeakMessage = (id: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMsgId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const spokenText = cleanText(text).replace(/[#`•]/g, ' ').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.02;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleAttachCameraSnapshot = () => {
    const rawImg = telemetry?.image;
    if (!rawImg || rawImg.trim().length < 32) {
      setCameraNotice('Camera Pi 4 chưa gửi khung hình trực tiếp. Hãy bật Camera hoặc ngồi trong vùng quan sát.');
      setTimeout(() => setCameraNotice(null), 4000);
      return;
    }
    const formatted = rawImg.startsWith('data:image')
      ? rawImg
      : `data:image/jpeg;base64,${rawImg}`;
    setAttachedImage(formatted);
    setCameraNotice(null);
    if (!input.trim()) {
      setInput('Phân tích tư thế ngồi của tôi qua ảnh Camera Pi 4 này');
    }
    textareaRef.current?.focus();
  };

  const handleExecutePendingAction = async (msgId: string, action: PendingChatbotAction) => {
    if (executingActionMsgId) return;
    setExecutingActionMsgId(msgId);
    try {
      if (action.type === 'apply_thresholds' && action.thresholdsPatch) {
        if (!onApplyThresholds || !thresholds) {
          throw new Error('Chức năng đồng bộ ngưỡng chưa sẵn sàng trong phiên này.');
        }
        const nextThresholds: AlertThresholds = {
          ...thresholds,
          ...action.thresholdsPatch,
        };
        const targetUid = isAdmin && selectedMemberId !== 'all' ? selectedMemberId : undefined;
        await onApplyThresholds(nextThresholds, targetUid);
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId
              ? {
                  ...m,
                  actionExecuted: true,
                  actionResultText: 'Đã đồng bộ bộ ngưỡng mới lên Firestore & Raspberry Pi 4.',
                }
              : m
          )
        );
      } else if (action.type === 'create_task' && action.task) {
        if (!onCreateTask) {
          throw new Error('Chức năng tạo nhiệm vụ chưa sẵn sàng trong phiên này.');
        }
        await onCreateTask(action.task);
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId
              ? {
                  ...m,
                  actionExecuted: true,
                  actionResultText: `Đã tạo và gửi nhiệm vụ "${action.task?.title}".`,
                }
              : m
          )
        );
      }
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                actionResultText: err?.message || 'Không thể thực thi thao tác. Vui lòng thử lại.',
              }
            : m
        )
      );
    } finally {
      setExecutingActionMsgId(null);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const currentAttachment = attachedImage;
    const rawText = (customText || input).trim();
    const textToSend = rawText || (currentAttachment ? 'Phân tích tư thế ngồi và công thái học từ ảnh Camera Pi 4 này.' : '');
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      image: currentAttachment || undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setAttachedImage(null);
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

      const activeHistory = liveSupabaseLogs.length > 0 ? liveSupabaseLogs : history.slice(0, 50);
      const effectiveThresholds: AlertThresholds = thresholds || {
        hrMin: 55,
        hrMax: 110,
        spo2Min: 94,
        incorrectPostureSec: 20,
        longIncorrectSec: 120,
        longSittingSec: 2700,
        standingTargetSec: 300,
        soundEnabled: true,
        voiceAlertEnabled: true,
        outOfZoneAlertEnabled: true,
        browserNotificationEnabled: false,
      };
      const predictiveSummary = buildPredictiveAnalytics({
        history: activeHistory as TelemetryLog[],
        timeStats: {
          sittingSeconds: timeStats?.sittingSeconds ?? sittingSeconds,
          standingSeconds: timeStats?.standingSeconds ?? 0,
          movingSeconds: timeStats?.movingSeconds ?? 0,
          badPostureSeconds: timeStats?.badPostureSeconds ?? badPostureSeconds,
          continuousSittingSeconds: timeStats?.continuousSittingSeconds ?? 0,
          continuousStandingSeconds: timeStats?.continuousStandingSeconds ?? 0,
        },
        thresholds: effectiveThresholds,
        currentUser: (selectedMember || userProfile || null) as AuthUser | null,
        telemetry,
        ohpsData,
        tasks,
      });

      // Lấy chính sách thưởng công ty và mức thưởng thực tế từ ohpsData
      const currentBonusPolicy = loadCompanyBonusPolicy();
      const resolvedOhpsScore = ohpsData?.hasActualData ? ohpsData.ohpsScore : ((telemetry as any)?.ohpsScore ?? 80);
      const currentBonusResult = calculateEmployeeBonus(
        resolvedOhpsScore,
        {
          S_posture: ohpsData?.breakdown?.S_posture ?? 85,
          S_break: ohpsData?.breakdown?.S_break ?? 80,
          S_vital: ohpsData?.hasVitalData ? ohpsData.breakdown.S_vital : 85,
          S_task: ohpsData?.breakdown?.S_task ?? 90
        },
        currentBonusPolicy
      );

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
          history: activeHistory.slice(0, 40),
          timeStats,
          userName,
          userId,
          supabaseConfig: supaConfig,
          targetMemberId: selectedMemberId,
          targetMemberName,
          allUsers,
          thresholds,
          ohpsData,
          tasks,
          userProfile: selectedMember || userProfile,
          predictiveSummary,
          image: currentAttachment || undefined,
          bonusPolicy: currentBonusPolicy,
          bonusResult: currentBonusResult,
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
        isSupabaseQueried: Boolean(supaConfig.url && supaConfig.anonKey),
        toolCallsUsed: Array.isArray(data.toolCallsUsed) ? data.toolCallsUsed : undefined,
        sqiScore: typeof data.sqiScore === 'number' ? data.sqiScore : null,
        pendingAction: data.pendingAction || null,
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
    const q = query.toLowerCase().trim();
    const bpm = telem?.bpm || 0;
    const spo2 = telem?.spo2 || 0;
    const sittingMins = Math.floor((stats?.sittingSeconds || sittingSeconds) / 60);

    const now = new Date();
    const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = daysOfWeek[now.getDay()];
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    // 1. Hỏi về ngày giờ
    if (
      q.includes('thứ mấy') || 
      q.includes('thu may') || 
      q.includes('mấy giờ') || 
      q.includes('may gio') || 
      q.includes('ngày mấy') || 
      q.includes('ngay may') || 
      q.includes('ngày bao nhiêu') || 
      q.includes('hôm nay ngày')
    ) {
      return `Hôm nay là ${dayName}, ngày ${dateStr}. Hiện tại là ${timeStr}.\n\nChúc bạn một ngày làm việc hiệu quả, tập trung và luôn duy trì tư thế ngồi thoải mái!`;
    }

    // 2. Hỏi về năng lực, khả năng, chức năng của trợ lý
    if (
      q.includes('làm được việc gì') || 
      q.includes('làm được gì') || 
      q.includes('lam duoc gi') || 
      q.includes('hỏi được gì') ||
      q.includes('hỏi gì') ||
      q.includes('những câu hỏi') ||
      q.includes('chức năng') || 
      q.includes('chuc nang') || 
      q.includes('khả năng') || 
      q.includes('bạn là ai') || 
      q.includes('ban la ai') || 
      q.includes('giới thiệu') || 
      q.includes('hướng dẫn sử dụng')
    ) {
      return `Tôi là Trợ lý AI Công Thái Học & Huấn Luyện Viên Hiệu Suất (OHPS Coach).\n\n` +
        `Các nhóm câu hỏi & thao tác tôi xử lý trực tiếp cho bạn:\n` +
        `1. Tư thế & Camera AI: Chấm góc cổ, phát hiện gù lưng và phân tích ảnh Camera Pi 4 đính kèm.\n` +
        `2. Nhịp tim (BPM) & SpO2 MAX30102: Đánh giá sinh hiệu tức thời và gợi ý nhịp thở điều hòa.\n` +
        `3. Dự báo rủi ro & Giờ vàng (WLS/Z-Score): Dự báo nguy cơ cổ/lưng, khung giờ tập trung cao.\n` +
        `4. Điểm OHPS & Tiền thưởng VNĐ: Tính điểm OHPS, ước tính mức thưởng và mẹo tăng hạng.\n` +
        `5. Lịch sử đo đạc Supabase: Truy vấn chi tiết theo giờ/buổi (vd: 14h hôm nay, sáng nay).\n` +
        `6. Quản lý nhiệm vụ: Kiểm tra task chưa xong và tạo thẻ nhắc nhở 1 chạm lên Firebase.\n` +
        `7. Đồng bộ ngưỡng Pi 4: Đề xuất và ghi trực tiếp ngưỡng mới xuống thiết bị.` +
        (isAdmin ? `\n8. Quản trị đội ngũ: So sánh tư thế, sinh hiệu và xếp hạng nhân viên.` : '');
    }

    // 3. Chào hỏi
    if (
      q.includes('chào') || 
      q.includes('hello') || 
      q.includes('hi ') || 
      q === 'hi' || 
      q.includes('ơi') || 
      q.includes('alo')
    ) {
      return `Chào ${name || 'bạn'}, chúc bạn làm việc tràn đầy năng lượng và hiệu quả!\n\nTôi là Trợ Lý AI Công Thái Học của bạn. Bạn cần tôi hỗ trợ kiểm tra tư thế, tra cứu dữ liệu đo đạc hay gợi ý bài tập giãn cơ hôm nay?`;
    }

    // 4. Cảm ơn, tạm biệt
    if (
      q.includes('cảm ơn') || 
      q.includes('thank') || 
      q === 'ok' || 
      q.includes('tuyệt vời') || 
      q.includes('tốt lắm') || 
      q.includes('tạm biệt') || 
      q.includes('bye')
    ) {
      return `Rất vui được đồng hành cùng bạn! Hãy giữ lưng tựa thoải mái, thả lỏng bả vai và uống đủ nước nhé.`;
    }

    // 5. Câu hỏi về dữ liệu Supabase
    if (q.includes('dữ liệu') || q.includes('lưu trữ') || q.includes('database') || q.includes('supabase')) {
      return `Thông Tin Cơ Sở Dữ Liệu Sức Khỏe:\n\n` +
        `- Trạng thái: Dịch vụ lưu trữ trực tuyến Supabase hoạt động bình thường.\n` +
        `- Dữ liệu theo dõi: Toàn bộ lịch sử nhịp tim, nồng độ oxy và tư thế của ${name || 'bạn'} được đồng bộ chuỗi thời gian liên tục.\n` +
        `- Bảo mật: Dữ liệu cá nhân được phân quyền nghiêm ngặt và chỉ phục vụ việc cải thiện sức khỏe lao động.`;
    }

    // 6. Câu hỏi về nhịp tim
    if (q.includes('nhịp tim') || q.includes('bpm')) {
      return `Chỉ số nhịp tim hiện tại: ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến đo'}.\n\n` +
        (bpm >= 60 && bpm <= 100 
          ? 'Nhịp tim của bạn đang ở dải chuẩn người trưởng thành khi nghỉ ngơi (60-100 BPM).' 
          : bpm > 100 
          ? 'Nhịp tim đang hơi cao (>100 BPM). Hãy hít thở sâu, uống một ngụm nước và nghỉ ngơi 3-5 phút.' 
          : 'Hãy đặt đầu ngón tay nhẹ nhàng lên cảm biến để đo chính xác.');
    }

    // 7. Câu hỏi về SpO2
    if (q.includes('spo2') || q.includes('oxy')) {
      return `Nồng độ oxy trong máu (SpO2): ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến đo'}.\n\n` +
        (spo2 >= 95 
          ? 'Chỉ số oxy trong máu rất tốt (từ 95% trở lên). Hệ hô hấp và tuần hoàn của bạn hoạt động ổn định.' 
          : 'SpO2 dưới 95% có thể do đặt ngón tay chưa khít hoặc không gian phòng thiếu oxy. Hãy mở cửa thông thoáng.');
    }

    // 8. Câu hỏi về tư thế
    if (q.includes('tư thế') || q.includes('ngồi') || q.includes('cột sống')) {
      const label = telem?.postureLabel || 'Chưa nhận diện';
      return `Trạng thái tư thế: ${label}.\n\n` +
        `- Thời gian ngồi liên tục: ${sittingMins} phút.\n` +
        `- Lời khuyên: Giữ lưng tựa sát ghế, góc gập khuỷu tay khoảng 90-100 độ, mắt nhìn ngang mép trên màn hình để tránh thoái hóa đốt sống cổ.`;
    }

    // 9. Câu hỏi về bài tập giãn cơ
    // 9. Câu hỏi về chính sách thưởng & tiền thưởng công thái học của công ty
    if (q.includes('thưởng') || q.includes('tiền thưởng') || q.includes('chính sách thưởng') || q.includes('mức thưởng') || q.includes('bao nhiêu tiền')) {
      const pol = loadCompanyBonusPolicy();
      const actualScore = ohpsData?.hasActualData ? ohpsData.ohpsScore : ((telemetry as any)?.ohpsScore ?? 80);
      const res = calculateEmployeeBonus(
        actualScore,
        {
          S_posture: ohpsData?.breakdown?.S_posture ?? 85,
          S_break: ohpsData?.breakdown?.S_break ?? 80,
          S_vital: ohpsData?.hasVitalData ? ohpsData.breakdown.S_vital : 85,
          S_task: ohpsData?.breakdown?.S_task ?? 90
        },
        pol
      );

      const cycleStr = pol.cycle === 'daily' ? 'Hàng ngày' : pol.cycle === 'weekly' ? 'Hàng tuần' : 'Hàng tháng';
      return `Chính Sách Thưởng Công Thái Học (${pol.companyName || 'Công ty'}):\n\n` +
        `- Chu kỳ: ${cycleStr} · Mức thưởng tối đa: ${formatCurrencyVND(pol.maxRewardAmount)} · Điểm sàn: ${pol.minScoreToReward}đ\n` +
        `- Điểm OHPS hiện tại của ${name || 'bạn'}: ${actualScore}/100 (${res.isEligible ? (res.tierAchieved?.tierName || 'Đạt chuẩn') : 'Chưa đạt sàn'})\n` +
        `- Tiền thưởng dự kiến: +${formatCurrencyVND(res.totalReward)} (${res.achievementRate}% hạn mức)\n\n` +
        `Mẹo tăng thưởng: ${res.tipsToReachNextTier}`;
    }

    // 9b. Dự báo rủi ro & Z-Score
    if (q.includes('dự báo') || q.includes('rủi ro') || q.includes('nguy cơ') || q.includes('giờ vàng') || q.includes('z-score')) {
      const pred = buildPredictiveAnalytics({
        history,
        timeStats: {
          sittingSeconds: stats?.sittingSeconds ?? sittingSeconds,
          standingSeconds: stats?.standingSeconds ?? 0,
          movingSeconds: stats?.movingSeconds ?? 0,
          badPostureSeconds: stats?.badPostureSeconds ?? badPostureSeconds,
          continuousSittingSeconds: stats?.continuousSittingSeconds ?? 0,
          continuousStandingSeconds: stats?.continuousStandingSeconds ?? 0,
        },
        thresholds: thresholds || {
          hrMin: 55, hrMax: 110, spo2Min: 94, incorrectPostureSec: 20, longIncorrectSec: 120,
          longSittingSec: 2700, standingTargetSec: 300, soundEnabled: true, voiceAlertEnabled: true,
          outOfZoneAlertEnabled: true, browserNotificationEnabled: false
        },
        currentUser: (userProfile as AuthUser) || null,
        telemetry,
        ohpsData,
        tasks
      });
      return `Dự Báo Công Thái Học 2 Giờ Tới:\n\n` +
        `- OHPS ca tới: ${pred.ohpsForecast.predictedScore}/100 (${pred.ohpsForecast.trendLabel}, độ tin cậy ${pred.ohpsForecast.confidencePercent}%)\n` +
        `- Nguy cơ Cổ C5-C7: ${pred.postureFatigue.neckSpineRiskPercent}% | Thắt lưng L4-L5: ${pred.postureFatigue.lumbarRiskPercent}%\n` +
        `- Thời gian tới ngưỡng mỏi: ~${pred.postureFatigue.predictedMinutesUntilSlouch} phút\n` +
        `- Khung giờ vàng: ${pred.circadian.goldenHoursWindow} | Dễ uể oải: ${pred.circadian.slumpRiskWindow}\n` +
        `- Bất thường Z-Score: ${pred.modelMetrics.zScoreAnomalyCount} sự kiện (SQI ${pred.modelMetrics.sqiScore}/100)`;
    }

    // 9c. Nhiệm vụ / Task
    if (q.includes('nhiệm vụ') || q.includes('task') || q.includes('công việc')) {
      const pending = tasks.filter(t => t.status !== 'completed');
      const done = tasks.filter(t => t.status === 'completed');
      if (tasks.length === 0) {
        return `Hiện chưa có nhiệm vụ nào được giao. Bạn có thể nhắn: "Tạo nhắc nhở đứng giãn cơ 3 phút" để thêm task mới!`;
      }
      return `Tiến Độ Nhiệm Vụ (${done.length}/${tasks.length} hoàn thành):\n` +
        (pending.length > 0
          ? pending.slice(0, 5).map((t, i) => `${i + 1}. ${t.title} (${t.priority})`).join('\n')
          : 'Bạn đã hoàn thành tất cả nhiệm vụ!');
    }

    if (q.includes('bài tập') || q.includes('giãn cơ') || q.includes('mỏi')) {
      return `Gợi ý bài tập giãn cơ 2 phút tại bàn làm việc:\n\n` +
        `1. Thu cằm (Chin Tuck): Ngồi thẳng, kéo nhẹ cằm lùi về phía sau gáy giữ 5 giây, lặp lại 5 lần để giải phóng đốt sống cổ C5-C7.\n` +
        `2. Mở rộng lồng ngực: Đan hai tay ra sau lưng, ưỡn ngực về trước, hít sâu 3 nhịp.\n` +
        `3. Gập duỗi bàn chân: Nâng gót chân lên xuống 15 lần để kích thích tuần hoàn tĩnh mạch chân.`;
    }

    // 10. Mặc định
    const isHealthContext = /sức khỏe|chỉ số|thời gian|phiên/i.test(q);
    if (isHealthContext) {
      return `Hiện tại dữ liệu đo đạc của ${name || 'bạn'} ghi nhận: Nhịp tim ${bpm > 0 ? `${bpm} BPM` : 'Đang chờ cảm biến'}, SpO2 ${spo2 > 0 ? `${spo2}%` : 'Đang chờ cảm biến'}, thời gian ngồi ${sittingMins} phút. Hãy duy trì tư thế ngồi thẳng và nghỉ giải lao sau mỗi 45-60 phút làm việc nhé!`;
    }

    return `Chào ${name || 'bạn'}! Tôi đã nhận câu hỏi: "${query}".\n\nBạn có thể bấm nút "Hỏi được gì?" ở góc trên để xem 7 nhóm câu hỏi & thao tác tôi hỗ trợ (tư thế, sinh hiệu, dự báo rủi ro, điểm OHPS/thưởng, tra cứu lịch sử, tạo task và chỉnh ngưỡng Pi 4).`;
  };

  // Clean, professional suggestions with zero emojis
  const quickQuestions = isAdmin ? [
    'Bạn trả lời được những câu hỏi gì?',
    'Ai đang cần cải thiện tư thế nhiều nhất?',
    'Dự báo nguy cơ mỏi cổ lưng & bất thường Z-Score',
    'Chính sách thưởng công thái học của công ty thế nào?',
    'Tạo nhắc nhở đứng giãn cơ 3 phút cho đội ngũ'
  ] : [
    'Bạn trả lời được những câu hỏi gì?',
    'Dự báo nguy cơ mỏi cổ lưng 2 giờ tới của tôi',
    'Tôi đang được bao nhiêu điểm OHPS & thưởng bao nhiêu?',
    'Tạo nhắc nhở đứng giãn cơ 3 phút lúc 15h',
    'Đánh giá tư thế ngồi & góc nghiêng cổ hiện tại'
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

      {/* Neo-Brutalist Tactile Right Side Drawer Panel */}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 w-full sm:w-[460px] md:w-[490px] glass-drawer border-l-2 border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Top Header */}
        <div className="px-5 py-4 bg-[#FDFBF7] border-b-2 border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#B2F5BE] text-slate-900 flex items-center justify-center border-2 border-slate-800 shadow-[0_2px_0_#1E293B]">
                <Bot className="w-5 h-5 text-slate-900" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#16B364] border-2 border-slate-900"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Trợ Lý AI Công Thái Học
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 tracking-wider">
                  AI ASSISTANT
                </span>
              </div>
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Activity className="w-3 h-3 text-emerald-600" />
                <span>Kết nối cảm biến & dữ liệu thời gian thực</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCapabilityGuide(prev => !prev)}
              title="Xem các câu hỏi Chatbot có thể trả lời"
              className={`h-9 px-2.5 rounded-xl flex items-center gap-1 text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                showCapabilityGuide ? 'tactile-btn-secondary' : 'tactile-btn-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hỏi được gì?</span>
            </button>
            <button
              type="button"
              onClick={() => setMessages([
                {
                  id: 'welcome-reset',
                  sender: 'bot',
                  text: isAdmin 
                    ? `Đã làm mới cuộc hội thoại. Bạn có thể hỏi tôi về dữ liệu theo dõi, dự báo rủi ro, điểm OHPS/thưởng, phân tích ảnh Camera hoặc giao nhiệm vụ cho bất kỳ thành viên nào!`
                    : `Đã làm mới cuộc hội thoại. Hãy hỏi tôi về nhịp tim, SpO₂, tư thế ngồi, dự báo rủi ro hoặc yêu cầu tạo nhắc nhở!`,
                  time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                  isSupabaseQueried: true
                }
              ])}
              title="Làm mới hội thoại"
              className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Thu gọn cửa sổ"
              className="w-9 h-9 rounded-xl tactile-btn-white flex items-center justify-center cursor-pointer"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Status & Telemetry Context Bar */}
        <div className="px-4 py-2.5 bg-[#FAF7F0] border-b border-slate-800/15 flex items-center justify-between text-xs font-mono text-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-rose-700 font-bold">
              <Heart className="w-3.5 h-3.5 fill-rose-500/20 text-rose-600" />
              <span>{telemetry?.bpm || '--'} BPM</span>
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-sky-700 font-bold">
              SpO₂: {telemetry?.spo2 ? `${telemetry.spo2}%` : '--'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold text-slate-800 truncate max-w-[190px]">
            <span className={`w-2 h-2 rounded-full ${
              telemetry?.postureStatus === 0 
                ? 'bg-[#16B364]' 
                : telemetry?.postureStatus === 1 || telemetry?.postureStatus === 3 
                ? 'bg-rose-500 animate-pulse' 
                : 'bg-slate-400'
            }`} />
            <span className="truncate">{telemetry?.postureLabel || 'Chưa có tư thế'}</span>
          </div>
        </div>

        {/* Collapsible 7-Category Capability Guide */}
        {showCapabilityGuide && (
          <div className="px-4 py-3 bg-[#FDFBF7] border-b-2 border-slate-800 max-h-64 overflow-y-auto shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>7 Nhóm Câu Hỏi &amp; Thao Tác Trợ Lý AI</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCapabilityGuide(false)}
                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-0.5 cursor-pointer"
              >
                <span>Thu gọn</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {CAPABILITY_CATEGORIES.map((cat, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setShowCapabilityGuide(false);
                    handleSendMessage(cat.prompt);
                  }}
                  className="text-left p-2.5 rounded-xl bg-white border-[1.5px] border-slate-800 hover:bg-[#B2F5BE]/30 transition cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{cat.title}</div>
                    <div className="text-[11px] text-slate-600 leading-snug">{cat.desc}</div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Admin Member Filter Bar */}
        {isAdmin && allUsers.length > 0 && (
          <div className="px-4 py-2 bg-[#FAF7F0] border-b-2 border-slate-800/15 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5 shrink-0">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Phạm vi tra cứu:</span>
            </span>
            <select
              value={selectedMemberId}
              onChange={e => setSelectedMemberId(e.target.value)}
              className="text-xs font-bold bg-white border-[1.5px] border-slate-800 rounded-lg px-2.5 py-1 text-slate-900 shadow-[0_1.5px_0_#1E293B] focus:outline-none max-w-[220px] truncate cursor-pointer"
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
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-transparent scrollbar-thin">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-xl bg-[#B2F5BE] text-slate-900 flex items-center justify-center shrink-0 mt-0.5 border-[1.5px] border-slate-800 shadow-[0_1.5px_0_#1E293B]">
                  <Bot className="w-4 h-4 text-slate-900" />
                </div>
              )}

              <div
                className={`group relative max-w-[88%] sm:max-w-[84%] px-4 py-3 rounded-2xl ${
                  msg.sender === 'user'
                    ? 'bg-[#16B364] border-2 border-slate-900 shadow-[0_2px_0_#0F172A] text-white rounded-br-xs'
                    : 'glass-subcard text-slate-800 rounded-bl-xs'
                }`}
              >
                {/* Bot Tool Calls & SQI Metadata Strip */}
                {msg.sender === 'bot' && ((msg.toolCallsUsed && msg.toolCallsUsed.length > 0) || typeof msg.sqiScore === 'number') && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 pb-2 border-b border-slate-200/70">
                    {msg.toolCallsUsed?.map((toolName, tIdx) => (
                      <span
                        key={tIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-semibold"
                      >
                        <Wrench className="w-2.5 h-2.5 shrink-0" />
                        <span>{toolName}</span>
                      </span>
                    ))}
                    {typeof msg.sqiScore === 'number' && msg.sqiScore > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-mono font-semibold">
                        <Activity className="w-2.5 h-2.5 shrink-0" />
                        <span>SQI {msg.sqiScore}/100</span>
                      </span>
                    )}
                  </div>
                )}

                {/* User Attached Camera Snapshot */}
                {msg.sender === 'user' && msg.image && (
                  <div className="mb-2 overflow-hidden rounded-xl border border-white/25 bg-slate-900/20">
                    <img
                      src={msg.image}
                      alt="Ảnh Camera Pi 4 đính kèm"
                      className="w-full max-h-40 object-cover"
                    />
                  </div>
                )}

                {/* Formatted Content */}
                <div className="text-xs sm:text-[13px]">
                  {msg.sender === 'user' ? (
                    <p className="text-white leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    renderFormattedMessage(msg.text)
                  )}
                </div>

                {/* Human-in-the-loop Pending Action Confirmation Card */}
                {msg.sender === 'bot' && msg.pendingAction && (
                  <div className="mt-3 p-3 rounded-xl bg-[#BAE0EC]/40 border-[1.5px] border-slate-800 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#FDE68A] text-slate-900 border-[1.5px] border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                        {msg.pendingAction.type === 'apply_thresholds' ? (
                          <Sliders className="w-3.5 h-3.5" />
                        ) : (
                          <ListPlus className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                          {msg.pendingAction.type === 'apply_thresholds'
                            ? 'Đề xuất đồng bộ ngưỡng Pi 4'
                            : 'Đề xuất tạo nhiệm vụ nhắc nhở'}
                        </div>
                        <p className="text-xs text-slate-700 mt-0.5 leading-snug">
                          {msg.pendingAction.summary}
                        </p>
                      </div>
                    </div>

                    {msg.pendingAction.type === 'apply_thresholds' && msg.pendingAction.thresholdsPatch && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(msg.pendingAction.thresholdsPatch).map(([k, val]) => {
                          const meta = THRESHOLD_LABELS[k] || { label: k, unit: '' };
                          return (
                            <div
                              key={k}
                              className="px-2.5 py-1.5 rounded-lg bg-white border-[1.5px] border-slate-800 text-[11px] flex items-center justify-between gap-1"
                            >
                              <span className="text-slate-600 truncate">{meta.label}:</span>
                              <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                                {val} {meta.unit}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {msg.pendingAction.type === 'create_task' && msg.pendingAction.task && (
                      <div className="p-2.5 rounded-lg bg-white border-[1.5px] border-slate-800 text-[11px] space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 truncate">{msg.pendingAction.task.title}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#FDE68A] border border-slate-800 text-slate-900 font-mono text-[10px] font-bold uppercase shrink-0">
                            {msg.pendingAction.task.priority}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-snug">{msg.pendingAction.task.content}</p>
                        {(msg.pendingAction.task.targetUserName || msg.pendingAction.task.deadline) && (
                          <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                            {msg.pendingAction.task.targetUserName ? `Người nhận: ${msg.pendingAction.task.targetUserName}` : ''}
                            {msg.pendingAction.task.targetUserName && msg.pendingAction.task.deadline ? ' • ' : ''}
                            {msg.pendingAction.task.deadline ? `Hạn: ${msg.pendingAction.task.deadline}` : ''}
                          </div>
                        )}
                      </div>
                    )}

                    {msg.actionExecuted ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#B2F5BE] border-[1.5px] border-slate-800 text-slate-900 text-[11px] font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>{msg.actionResultText || 'Đã xác nhận và thực thi thành công.'}</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => handleExecutePendingAction(msg.id, msg.pendingAction!)}
                          disabled={executingActionMsgId === msg.id}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-xl tactile-btn-primary disabled:opacity-60 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {executingActionMsgId === msg.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang đồng bộ thực thi...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Xác nhận thực thi</span>
                            </>
                          )}
                        </button>
                        {msg.actionResultText && (
                          <p className="text-[11px] text-rose-700 font-medium">{msg.actionResultText}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Meta: Time, TTS & Copy Buttons */}
                <div className={`flex items-center justify-between gap-3 mt-2 pt-1 border-t text-[10px] ${
                  msg.sender === 'user' ? 'border-white/20 text-white/85' : 'border-slate-200/70 text-slate-500'
                }`}>
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 opacity-70" />
                    <span>{msg.time}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {msg.sender === 'bot' && typeof window !== 'undefined' && 'speechSynthesis' in window && (
                      <button
                        type="button"
                        onClick={() => handleSpeakMessage(msg.id, msg.text)}
                        className={`transition p-1 rounded cursor-pointer flex items-center gap-1 ${
                          speakingMsgId === msg.id
                            ? 'text-teal-700 font-semibold opacity-100'
                            : 'opacity-70 group-hover:opacity-100 hover:text-slate-900'
                        }`}
                        title={speakingMsgId === msg.id ? 'Dừng đọc giọng nói' : 'Đọc phản hồi bằng giọng nói'}
                      >
                        {speakingMsgId === msg.id ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    {msg.sender === 'bot' && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="opacity-70 group-hover:opacity-100 transition p-1 hover:text-slate-900 rounded cursor-pointer"
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
                <div className="w-7 h-7 rounded-xl bg-[#BAE0EC] text-slate-900 border-[1.5px] border-slate-800 shadow-[0_1.5px_0_#1E293B] flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2.5 text-xs text-slate-700 p-3 rounded-2xl glass-subcard w-fit animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span className="text-[11px] font-bold">Đang chạy Agent &amp; phân tích dữ liệu đo đạc...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestions Chips */}
        {messages.length <= 4 && (
          <div className="px-4 py-2.5 bg-[#FAF7F0] border-t-2 border-slate-800/15 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                className="px-3 py-1.5 rounded-xl tactile-btn-white text-[11px] font-bold whitespace-nowrap cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <span>{q}</span>
                <ArrowRight className="w-3 h-3 text-emerald-600" />
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 sm:p-4 bg-[#FDFBF7] border-t-2 border-slate-800 shrink-0 space-y-2">
          {cameraNotice && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center justify-between gap-2">
              <span>{cameraNotice}</span>
              <button
                type="button"
                onClick={() => setCameraNotice(null)}
                className="p-0.5 hover:opacity-75 cursor-pointer"
                aria-label="Đóng thông báo camera"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {attachedImage && (
            <div className="flex items-center justify-between gap-2.5 p-2 rounded-xl glass-subcard border">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={attachedImage}
                  alt="Khung hình Camera Pi 4"
                  className="w-12 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-900 truncate">
                    Ảnh chụp Camera Pi 4 đính kèm
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    AI Vision sẽ chấm trục cổ-vai-lưng từ khung hình này
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                title="Gỡ ảnh đính kèm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <button
              type="button"
              onClick={handleAttachCameraSnapshot}
              disabled={loading}
              className={`h-11 w-11 rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${
                attachedImage ? 'tactile-btn-secondary' : 'tactile-btn-white'
              }`}
              title="Đính kèm ảnh chụp Camera Pi 4 để AI phân tích tư thế"
            >
              <Camera className="w-5 h-5" />
            </button>

            <div className="flex-1 relative rounded-xl bg-white border-2 border-slate-800 shadow-[0_2px_0_#1E293B] focus-within:ring-2 focus-within:ring-emerald-500/30 transition">
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
                placeholder="Hỏi tư thế, gắn ảnh Camera, hoặc yêu cầu tạo task / chỉnh ngưỡng..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-transparent text-slate-900 placeholder:text-slate-500 resize-none focus:outline-none scrollbar-none"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || (!input.trim() && !attachedImage)}
              className="h-11 px-4 rounded-xl tactile-btn-primary disabled:opacity-40 font-bold flex items-center justify-center cursor-pointer shrink-0"
              title="Gửi câu hỏi"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          <p className="text-[10px] text-slate-500 text-center">
            Enter để gửi • Shift + Enter xuống dòng • Biểu tượng Camera để gửi ảnh Pi 4
          </p>
        </div>
      </aside>
    </>
  );
};
