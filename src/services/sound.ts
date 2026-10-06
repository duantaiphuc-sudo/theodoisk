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

/**
 * Play synthesizer musical chimes for notifications
 */
export function playAlertChime(type: 'warning' | 'danger' | 'success' | 'reminder') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'danger') {
      // 2-tone urgent beep
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'warning') {
      // Soft chime warning
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'reminder') {
      // Gentle double chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // Success tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.05, now);
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
  | 'custom';

// Local standard pre-rendered high-quality Vietnamese audio files (100% native voice, zero lag, works everywhere)
const LOCAL_AUDIO_FILES: Record<string, string> = {
  posture_incorrect: '/audio/posture_incorrect.mp3',
  out_of_zone: '/audio/out_of_zone.mp3',
  long_incorrect: '/audio/long_incorrect.mp3',
  long_sitting: '/audio/long_sitting.mp3',
  sit_to_stand_prompt: '/audio/sit_to_stand_prompt.mp3',
  standing_goal_reached: '/audio/standing_goal_reached.mp3',
  vital_abnormal: '/audio/vital_abnormal.mp3',
};

const VOICE_ALERT_MESSAGES: Record<ErgonomicAlertVoiceType, string> = {
  posture_incorrect: 'Xin hãy ngồi thẳng lưng lên!',
  out_of_zone: 'Bạn đang ngồi ngoài vùng quan sát, xin hãy ngồi lại vào vị trí quan sát!',
  long_incorrect: 'Cảnh báo: Bạn đã ngồi sai tư thế quá lâu, hãy ngồi thẳng lưng lên ngay!',
  long_sitting: 'Bạn đã ngồi liên tục quá lâu, hãy đứng dậy vận động và thư giãn một chút nhé!',
  sit_to_stand_prompt: 'Cảnh báo: Bạn đã ngồi làm việc liên tục quá lâu! Hãy đứng dậy làm việc hoặc vận động trong ít phút để giải phóng áp lực cột sống nhé!',
  standing_goal_reached: 'Tuyệt vời! Bạn đã đứng đủ thời gian khuyến nghị. Bạn có thể ngồi xuống tiếp tục làm việc rồi nhé!',
  vital_abnormal: 'Cảnh báo: Chỉ số sinh trắc học có dấu hiệu bất thường!',
  custom: 'Thông báo nhắc nhở sức khỏe!',
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
    const chimeType = (type === 'long_incorrect' || type === 'vital_abnormal') 
      ? 'danger' 
      : type === 'standing_goal_reached' 
      ? 'success' 
      : 'warning';
    playAlertChime(chimeType);
  }

  // Speak voice reminder with slight 160ms delay after chime so it sounds natural and does not cut off
  if (playVoice) {
    setTimeout(() => {
      speakVietnamese(message, type);
    }, 160);
  }
}
