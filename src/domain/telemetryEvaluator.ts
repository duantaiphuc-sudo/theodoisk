import { HealthTelemetry, AlertThresholds } from '../types';

export interface EvaluatedTelemetryState {
  normalizedStatus: number;
  label: string;
  hasAlert: boolean;
  alertType?: string;
  isAway: boolean;
}

/**
 * Seam: Pure telemetry and posture state evaluator conforming to ADR 0001 & CONTEXT.md.
 * Verifies behavior through public interface with zero external side effects.
 */
export function evaluateTelemetryState(
  telemetry: Partial<HealthTelemetry>,
  thresholds: AlertThresholds,
  continuousSittingSeconds: number = 0,
  badPostureSeconds: number = 0
): EvaluatedTelemetryState {
  const trackingActive = telemetry.trackingActive ?? true;
  const inZone = telemetry.inZone ?? true;
  const bpm = telemetry.bpm ?? 0;
  const spo2 = telemetry.spo2 ?? 0;
  const rawStatus = telemetry.postureStatus ?? 0;

  // 1. Presence check (ADR 0001): If user left frame or camera inactive -> status 2 (Vắng mặt)
  if (!trackingActive || !inZone) {
    return {
      normalizedStatus: 2,
      label: '– Vắng',
      hasAlert: false,
      isAway: true,
    };
  }

  // 2. Vital signs alert checks
  if (bpm > 0 && thresholds.hrMin > 0 && bpm < thresholds.hrMin) {
    return {
      normalizedStatus: rawStatus,
      label: 'Nhịp tim chậm',
      hasAlert: true,
      alertType: `Nhịp tim thấp (${bpm} BPM < ${thresholds.hrMin})`,
      isAway: false,
    };
  }

  if (bpm > 0 && thresholds.hrMax > 0 && bpm > thresholds.hrMax) {
    return {
      normalizedStatus: rawStatus,
      label: 'Nhịp tim nhanh',
      hasAlert: true,
      alertType: `Nhịp tim cao (${bpm} BPM > ${thresholds.hrMax})`,
      isAway: false,
    };
  }

  if (spo2 > 0 && thresholds.spo2Min > 0 && spo2 < thresholds.spo2Min) {
    return {
      normalizedStatus: rawStatus,
      label: 'SpO2 thấp',
      hasAlert: true,
      alertType: `Nồng độ oxy thấp (${spo2}% < ${thresholds.spo2Min}%)`,
      isAway: false,
    };
  }

  // 3. Ergonomic sitting timers (ADR 0001)
  if (continuousSittingSeconds >= thresholds.longSittingSec && thresholds.longSittingSec > 0) {
    return {
      normalizedStatus: 4,
      label: 'Ngồi quá lâu',
      hasAlert: true,
      alertType: 'Ngồi liên tục quá 60 phút, hãy đứng dậy vận động',
      isAway: false,
    };
  }

  if (rawStatus === 1 || badPostureSeconds >= thresholds.longIncorrectSec) {
    if (badPostureSeconds >= thresholds.longIncorrectSec && thresholds.longIncorrectSec > 0) {
      return {
        normalizedStatus: 3,
        label: 'Sai tư thế lâu',
        hasAlert: true,
        alertType: 'Sai tư thế liên tục > 2 phút! Xin hãy ngồi thẳng lưng.',
        isAway: false,
      };
    }
    return {
      normalizedStatus: 1,
      label: 'Tư thế sai',
      hasAlert: true,
      alertType: 'Tư thế cúi gập / gù lưng',
      isAway: false,
    };
  }

  // 4. Correct sitting
  return {
    normalizedStatus: 0,
    label: 'Chuẩn',
    hasAlert: false,
    isAway: false,
  };
}
