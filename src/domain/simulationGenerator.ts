/**
 * Simulation generator for Raspberry Pi 4 health & ergonomic posture telemetry.
 * Generates realistic biometrics, posture states, and presence.
 */

export type SimPostureScenario = 'auto' | 'correct' | 'incorrect' | 'absent' | 'long_incorrect';

export interface SimTelemetryStep {
  bpm: number;
  spo2: number;
  postureStatus: number;
  postureLabel: string;
  trackingActive: boolean;
  inZone: boolean;
  angleNeck?: number;
  postureWarning?: string;
  source: string;
  confidence: number;
}

export function generateSimulatedTelemetry(
  step: number,
  mode: SimPostureScenario = 'auto'
): SimTelemetryStep {
  // If mode is auto, cycle through the 3 key states in 6-step blocks (12 seconds each, total 36s cycle)
  // block 0 (steps 0..5): correct posture (ĐÚNG)
  // block 1 (steps 6..11): incorrect posture (SAI)
  // block 2 (steps 12..17): absent / no person (KHÔNG CÓ NGƯỜI / VẮNG MẶT)
  let activeScenario = mode;
  if (mode === 'auto') {
    const cycle = step % 18;
    if (cycle < 6) {
      activeScenario = 'correct';
    } else if (cycle < 12) {
      activeScenario = 'incorrect';
    } else {
      activeScenario = 'absent';
    }
  }

  if (activeScenario === 'absent') {
    return {
      bpm: 0,
      spo2: 0,
      postureStatus: 2,
      postureLabel: 'VẮNG MẶT (Không có người)',
      trackingActive: false,
      inZone: false,
      angleNeck: 0,
      postureWarning: 'Không phát hiện người trong vùng quan sát của Camera AI',
      source: 'Raspberry Pi 4 (Giả Lập - Vắng Mặt)',
      confidence: 0,
    };
  }

  if (activeScenario === 'incorrect') {
    const jitterBpm = Math.round(78 + Math.sin(step * 0.4) * 4);
    const jitterSpO2 = Number((97.8 + Math.cos(step * 0.3) * 0.5).toFixed(1));
    return {
      bpm: jitterBpm,
      spo2: jitterSpO2,
      postureStatus: 1,
      postureLabel: 'Tư thế SAI (Cúi gù)',
      trackingActive: true,
      inZone: true,
      angleNeck: 122 + Math.round(Math.sin(step) * 3),
      postureWarning: 'Cột sống đang bị gù hoặc cúi gập cổ quá mức',
      source: 'Raspberry Pi 4 (Giả Lập - Tư Thế Sai)',
      confidence: 96,
    };
  }

  if (activeScenario === 'long_incorrect') {
    const jitterBpm = Math.round(82 + Math.sin(step * 0.4) * 4);
    const jitterSpO2 = Number((97.4 + Math.cos(step * 0.3) * 0.4).toFixed(1));
    return {
      bpm: jitterBpm,
      spo2: jitterSpO2,
      postureStatus: 3,
      postureLabel: 'SAI TƯ THẾ LÂU',
      trackingActive: true,
      inZone: true,
      angleNeck: 115,
      postureWarning: 'Sai tư thế liên tục kéo dài vượt ngưỡng an toàn',
      source: 'Raspberry Pi 4 (Giả Lập - Sai Lâu)',
      confidence: 97,
    };
  }

  // Otherwise: 'correct'
  const jitterBpm = Math.round(74 + Math.sin(step * 0.3) * 5);
  const jitterSpO2 = Number((98.4 + Math.cos(step * 0.2) * 0.6).toFixed(1));
  return {
    bpm: jitterBpm,
    spo2: jitterSpO2,
    postureStatus: 0,
    postureLabel: 'Tư thế ĐÚNG (Chuẩn)',
    trackingActive: true,
    inZone: true,
    angleNeck: 156 + Math.round(Math.cos(step) * 2),
    postureWarning: undefined,
    source: 'Raspberry Pi 4 (Giả Lập - Tư Thế Đúng)',
    confidence: 98,
  };
}
