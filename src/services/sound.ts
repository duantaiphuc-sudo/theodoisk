// Web Audio API notification sounds & Native Vietnamese Voice Alerts for ergonomic health alerts
let audioCtx: AudioContext | null = null;
let currentAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Stop any active playing voice audio to prevent overlapping speech
 */
export function stopVoiceAlert() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export type AlertChimeType = 
  | 'warning' 
  | 'danger' 
  | 'success' 
  | 'reminder'
  | 'finger_placed'
  | 'measuring_pulse'
  | 'measure_complete'
  | 'finger_removed'
  | 'camera_error'
  | 'stranger_alert'
  | 'welcome_back'
  | 'biometric_reminder';

/**
 * Play synthesizer musical chimes for notifications
 */
export function playAlertChime(type: AlertChimeType) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'danger') {
      // 2-tone urgent beep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'warning') {
      // Soft chime warning
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'reminder') {
      // Gentle double chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'finger_placed') {
      // MAX30102 Đặt tay: Âm thanh tiếp xúc ngón tay êm dịu, tăng tần số nhẹ
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'measuring_pulse') {
      // MAX30102 Đang đo: Tiếng nhịp tim PPG nhẹ nhàng như máy đo SpO2 y tế
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (type === 'measure_complete') {
      // MAX30102 Đo xong: Chuỗi hợp âm hoàn thành (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const noteStart = now + idx * 0.07;
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.09, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.28);
        osc.start(noteStart);
        osc.stop(noteStart + 0.28);
      });
    } else if (type === 'finger_removed') {
      // MAX30102 Đã bỏ tay: Âm thanh trầm dần dịu nhẹ
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(783.99, now); // G5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.18); // A4
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'camera_error') {
      // Lỗi Camera: 2 tiếng bíp cảnh báo phần cứng ngắt quãng
      [0, 0.14].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        const start = now + offset;
        osc.frequency.setValueAtTime(320, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
        osc.start(start);
        osc.stop(start + 0.11);
      });
    } else if (type === 'stranger_alert') {
      // Người lạ / Sai khuôn mặt: Chuông an ninh cấp bách (A5 / E5 luân phiên)
      [0, 0.1, 0.2, 0.3].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        const start = now + offset;
        osc.frequency.setValueAtTime(idx % 2 === 0 ? 880 : 660, start);
        gain.gain.setValueAtTime(0.13, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
        osc.start(start);
        osc.stop(start + 0.08);
      });
    } else if (type === 'welcome_back') {
      // Quay lại làm việc: Hợp âm ấm áp chào mừng (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const noteStart = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.08, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);
        osc.start(noteStart);
        osc.stop(noteStart + 0.35);
      });
    } else if (type === 'biometric_reminder') {
      // Nhắc đo sinh trắc học định kỳ: Chuỗi 3 nốt G5 -> B5 -> D6 dịu nhẹ, dễ nhận biết
      const notes = [783.99, 987.77, 1174.66];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const noteStart = now + idx * 0.1;
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.08, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);
        osc.start(noteStart);
        osc.stop(noteStart + 0.35);
      });
    } else {
      // Success tone mặc định
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (err) {
    console.warn('Audio feedback error:', err);
  }
}

/**
 * Cache voices when loaded by the browser
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export type ErgonomicAlertVoiceType = 
  | 'posture_incorrect'   // "Xin hãy ngồi thẳng lưng lên!"
  | 'out_of_zone'         // "Bạn đang ngồi ngoài vùng quan sát, xin hãy ngồi lại vào vị trí quan sát!"
  | 'long_incorrect'      // "Cảnh báo: Bạn đã ngồi sai tư thế quá lâu, hãy ngồi thẳng lưng lên ngay!"
  | 'long_sitting'        // "Bạn đã ngồi liên tục quá lâu, hãy đứng dậy vận động và thư giãn một chút nhé!"
  | 'sit_to_stand_prompt' // "Cảnh báo: Bạn đã ngồi làm việc liên tục. Hãy đứng dậy làm việc trong ít phút!"
  | 'standing_goal_reached' // "Tuyệt vời! Bạn đã hoàn thành thời gian đứng làm việc. Bạn có thể ngồi xuống tiếp tục công việc!"
  | 'vital_abnormal'      // "Cảnh báo: Chỉ số sinh trắc học có dấu hiệu bất thường!"
  | 'finger_placed'       // "Đã nhận ngón tay trên cảm biến MAX30102..."
  | 'measuring_pulse'     // "Đang đo chỉ số sinh trắc học..."
  | 'measure_complete'    // "Đo xong! Nhịp tim và nồng độ oxy..."
  | 'finger_removed'      // "Đã nhấc tay khỏi cảm biến..."
  | 'stranger_detected'   // "Cảnh báo an ninh: Phát hiện khuôn mặt không khớp..."
  | 'camera_error'        // "Cảnh báo: Mất kết nối camera USB..."
  | 'welcome_back'        // "Chào mừng bạn đã quay lại bàn làm việc..."
  | 'user_absent'         // "Đã rời bàn làm việc."
  | 'posture_correct'     // "Tư thế ngồi chuẩn."
  | 'standing_active'     // "Đang đứng làm việc."
  | 'posture_verifying'   // "Đang xác nhận tư thế."
  | 'face_enrolled'       // "Đăng ký khuôn mặt thành công."
  | 'face_verified'       // "Xác thực khuôn mặt thành công."
  | 'biometric_reminder'  // "Đã đến lúc đo nhịp tim và nồng độ oxy, hãy đặt ngón tay lên cảm biến!"
  | 'custom';

// Local standard pre-rendered high-quality Vietnamese audio files (100% native voice, zero lag, works everywhere)
const LOCAL_AUDIO_FILES: Record<string, string> = {
  posture_incorrect: '/audio/posture_incorrect.mp3',
  out_of_zone: '/audio/user_absent.mp3', // Vắng mặt và ngoài vùng quan sát dùng chung 1 file âm thanh
  long_incorrect: '/audio/long_incorrect.mp3',
  long_sitting: '/audio/long_sitting.mp3', // Đổi tên sit to stand thành long sitting
  sit_to_stand_prompt: '/audio/long_sitting.mp3',
  standing_goal_reached: '/audio/standing_goal_reached.mp3',
  vital_abnormal: '/audio/vital_abnormal.mp3',
  finger_placed: '/audio/finger_placed.mp3',
  measuring_pulse: '/audio/measuring_pulse.mp3',
  measure_complete: '/audio/measure_complete.mp3',
  finger_removed: '/audio/finger_removed.mp3',
  stranger_detected: '/audio/stranger_detected.mp3',
  camera_error: '/audio/camera_error.mp3',
  welcome_back: '/audio/welcome_back.mp3',
  user_absent: '/audio/user_absent.mp3',
  posture_correct: '/audio/posture_correct.mp3',
  standing_active: '/audio/standing_active.mp3',
  posture_verifying: '/audio/posture_verifying.mp3',
  face_enrolled: '/audio/face_enrolled.mp3',
  face_verified: '/audio/face_verified.mp3',
  biometric_reminder: '/audio/biometric_reminder.mp3',
};

const VOICE_ALERT_MESSAGES: Record<ErgonomicAlertVoiceType, string> = {
  posture_incorrect: 'Hãy ngồi thẳng lưng!',
  out_of_zone: 'Đã rời bàn làm việc.',
  long_incorrect: 'Cảnh báo: Sai tư thế quá lâu!',
  long_sitting: 'Đã ngồi lâu, hãy đứng dậy!',
  sit_to_stand_prompt: 'Đã ngồi lâu, hãy đứng dậy!',
  standing_goal_reached: 'Đã đạt mục tiêu đứng, bạn có thể ngồi.',
  vital_abnormal: 'Cảnh báo: Chỉ số bất thường!',
  finger_placed: 'Đã nhận ngón tay, bắt đầu đo.',
  measuring_pulse: 'Đang đo.',
  measure_complete: 'Đo xong, chỉ số ổn định.',
  finger_removed: 'Đã bỏ tay.',
  stranger_detected: 'Cảnh báo: Khuôn mặt không khớp!',
  camera_error: 'Cảnh báo: Mất kết nối camera!',
  welcome_back: 'Chào mừng bạn quay lại!',
  user_absent: 'Đã rời bàn làm việc.',
  posture_correct: 'Tư thế ngồi chuẩn.',
  standing_active: 'Đang đứng làm việc.',
  posture_verifying: 'Đang xác nhận tư thế.',
  face_enrolled: 'Đăng ký khuôn mặt thành công.',
  face_verified: 'Xác thực khuôn mặt thành công.',
  biometric_reminder: 'Đến giờ đo nhịp tim, hãy đặt tay đo!',
  custom: 'Thông báo sức khỏe!',
};

/**
 * Speak Vietnamese text using either:
 * 1. Pre-recorded crystal-clear Vietnamese MP3 (standard alerts)
 * 2. Google Translate TTS audio stream
 * 3. Browser SpeechSynthesis ONLY IF a legitimate Vietnamese voice is installed
 */
export function speakVietnamese(
  text: string, 
  presetType?: ErgonomicAlertVoiceType, 
  onEnd?: () => void
): Promise<boolean> {
  stopVoiceAlert();

  return new Promise((resolve) => {
    // Strategy 1: Use pre-rendered native Vietnamese MP3 file if matching preset
    if (presetType && LOCAL_AUDIO_FILES[presetType]) {
      const audioUrl = LOCAL_AUDIO_FILES[presetType];
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      audio.volume = 1.0;

      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        if (onEnd) onEnd();
        resolve(true);
      };

      audio.onerror = () => {
        // Fallback to strategy 2
        playOnlineVietnameseTTS(text, onEnd).then(resolve);
      };

      audio.play().catch(() => {
        // Autoplay may be blocked if user has not interacted yet, attempt online fallback
        playOnlineVietnameseTTS(text, onEnd).then(resolve);
      });
      return;
    }

    // Strategy 2: Use Google Translate TTS audio stream for dynamic phrases
    playOnlineVietnameseTTS(text, onEnd).then(resolve);
  });
}

/**
 * Play online Google Translate Vietnamese voice stream
 */
function playOnlineVietnameseTTS(text: string, onEnd?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const encoded = encodeURIComponent(text.trim());
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;
      const audio = new Audio(ttsUrl);
      currentAudio = audio;
      audio.volume = 1.0;

      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        if (onEnd) onEnd();
        resolve(true);
      };

      audio.onerror = () => {
        // Fallback to strategy 3: SpeechSynthesis ONLY if Vietnamese voice exists
        const fallbackSuccess = speakViaBrowserSynthIfVietnamese(text, onEnd);
        resolve(fallbackSuccess);
      };

      audio.play().catch(() => {
        const fallbackSuccess = speakViaBrowserSynthIfVietnamese(text, onEnd);
        resolve(fallbackSuccess);
      });
    } catch {
      const fallbackSuccess = speakViaBrowserSynthIfVietnamese(text, onEnd);
      resolve(fallbackSuccess);
    }
  });
}

/**
 * Browser SpeechSynthesis fallback, strictly enforcing that a Vietnamese voice is present.
 * CRITICAL: Never speak Vietnamese with an English voice because it reads in an alien accent.
 */
function speakViaBrowserSynthIfVietnamese(text: string, onEnd?: () => void): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
    const viVoice = voices.find(
      v => v.lang.toLowerCase().startsWith('vi') || v.name.toLowerCase().includes('vietnam')
    );

    // If NO native Vietnamese voice exists on this computer/browser, DO NOT speak with English voice!
    if (!viVoice) {
      console.warn('No native Vietnamese voice installed on browser SpeechSynthesis. Ignored English fallback.');
      if (onEnd) onEnd();
      return false;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = viVoice;
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (onEnd) {
      utterance.onend = onEnd;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
    return false;
  }
}

/**
 * Check if voice alert is supported
 */
export function isVoiceAlertSupported(): boolean {
  return typeof window !== 'undefined' && (typeof Audio !== 'undefined' || 'speechSynthesis' in window);
}

/**
 * Play a combo chime sound followed by clear, native Vietnamese voice reminder
 */
export function playErgonomicVoiceAlert(
  type: ErgonomicAlertVoiceType,
  options?: {
    playChime?: boolean;
    customMessage?: string;
    playVoice?: boolean;
  }
) {
  const playChime = options?.playChime !== false;
  const playVoice = options?.playVoice !== false;
  const message = options?.customMessage || VOICE_ALERT_MESSAGES[type];

  // Play appropriate chime sound
  if (playChime) {
    let chimeType: AlertChimeType = 'warning';
    if (type === 'finger_placed') chimeType = 'finger_placed';
    else if (type === 'measuring_pulse') chimeType = 'measuring_pulse';
    else if (type === 'measure_complete') chimeType = 'measure_complete';
    else if (type === 'finger_removed') chimeType = 'finger_removed';
    else if (type === 'stranger_detected') chimeType = 'stranger_alert';
    else if (type === 'camera_error') chimeType = 'camera_error';
    else if (type === 'welcome_back') chimeType = 'welcome_back';
    else if (type === 'posture_correct' || type === 'standing_active' || type === 'face_enrolled' || type === 'face_verified') chimeType = 'success';
    else if (type === 'biometric_reminder') chimeType = 'biometric_reminder';
    else if (type === 'user_absent' || type === 'out_of_zone' || type === 'posture_verifying') chimeType = 'reminder';
    else if (type === 'long_incorrect' || type === 'vital_abnormal') chimeType = 'danger';
    else if (type === 'standing_goal_reached') chimeType = 'success';
    else chimeType = 'warning';

    playAlertChime(chimeType);
  }

  // Speak voice reminder with slight 160ms delay after chime so it sounds natural and does not cut off
  if (playVoice) {
    setTimeout(() => {
      const isCustomText = Boolean(options?.customMessage && options.customMessage !== VOICE_ALERT_MESSAGES[type]);
      speakVietnamese(message, isCustomText ? undefined : type);
    }, 160);
  }
}

/**
 * 1. MAX30102: Âm thanh & lời thoại khi vừa đặt tay lên cảm biến
 */
export function playFingerPlacedAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('finger_placed', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 2. MAX30102: Tiếng nhịp tim PPG y tế trong lúc đang đo
 */
export function playMeasuringPulseSound() {
  playAlertChime('measuring_pulse');
}

/**
 * 3. MAX30102: Âm thanh & lời thoại khi đã đo xong (đạt kết quả ổn định)
 */
export function playMeasureCompleteAlert(
  _bpm?: number, 
  _spo2?: number, 
  options?: { playChime?: boolean; playVoice?: boolean; customMessage?: string }
) {
  playErgonomicVoiceAlert('measure_complete', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
    customMessage: options?.customMessage || 'Đo xong, chỉ số ổn định.',
  });
}

/**
 * 4. MAX30102: Âm thanh & lời thoại khi đã bỏ tay khỏi cảm biến
 */
export function playFingerRemovedAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('finger_removed', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 5. AN NINH: Âm thanh & lời thoại khi phát hiện người lạ / sai khuôn mặt
 */
export function playStrangerAlert(options?: { 
  playChime?: boolean; 
  playVoice?: boolean; 
  customMessage?: string; 
}) {
  playErgonomicVoiceAlert('stranger_detected', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
    customMessage: options?.customMessage || 'Cảnh báo: Khuôn mặt không khớp!',
  });
}

/**
 * 6. PHẦN CỨNG: Âm thanh & lời thoại khi lỗi / mất kết nối Camera USB
 */
export function playCameraErrorAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('camera_error', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 7. HIỆN DIỆN: Âm thanh chào mừng & lời thoại khi quay lại bàn làm việc
 */
export function playWelcomeBackAlert(
  _userName?: string, 
  options?: { playChime?: boolean; playVoice?: boolean; customMessage?: string }
) {
  playErgonomicVoiceAlert('welcome_back', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
    customMessage: options?.customMessage || 'Chào mừng bạn quay lại!',
  });
}

/**
 * 8. TƯ THẾ ĐÚNG: Âm thanh khích lệ khi ngồi thẳng chuẩn tư thế
 */
export function playPostureCorrectAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('posture_correct', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 9. ĐỨNG LÀM VIỆC: Âm thanh khi bắt đầu đứng làm việc
 */
export function playStandingActiveAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('standing_active', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 10. VẮNG MẶT: Âm thanh khi rời bàn làm việc / ghế trống
 */
export function playUserAbsentAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('user_absent', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 11. XÁC NHẬN TƯ THẾ: Âm thanh khi camera/AI đang xác nhận tư thế
 */
export function playPostureVerifyingAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('posture_verifying', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 12. KHUÔN MẶT: Âm thanh khi đăng ký khuôn mặt thành công
 */
export function playFaceEnrolledAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('face_enrolled', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 13. KHUÔN MẶT: Âm thanh khi xác thực khuôn mặt thành công
 */
export function playFaceVerifiedAlert(options?: { playChime?: boolean; playVoice?: boolean }) {
  playErgonomicVoiceAlert('face_verified', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
  });
}

/**
 * 14. MAX30102: Nhắc nhở định kỳ đặt tay đo nhịp tim và nồng độ oxy SpO2
 */
export function playBiometricReminderAlert(options?: {
  playChime?: boolean;
  playVoice?: boolean;
  customMessage?: string;
}) {
  playErgonomicVoiceAlert('biometric_reminder', {
    playChime: options?.playChime !== false,
    playVoice: options?.playVoice !== false,
    customMessage: options?.customMessage,
  });
}
