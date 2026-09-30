import { describe, it, expect } from 'vitest';
import { evaluateTelemetryState } from '../src/domain/telemetryEvaluator';
import { AlertThresholds } from '../src/types';

describe('telemetryEvaluator seam', () => {
  const defaultThresholds: AlertThresholds = {
    hrMin: 55,
    hrMax: 110,
    spo2Min: 95,
    incorrectPostureSec: 5,
    longIncorrectSec: 120, // 2 minutes
    longSittingSec: 3600,  // 60 minutes
    soundEnabled: true,
    voiceAlertEnabled: true,
    outOfZoneAlertEnabled: true,
    browserNotificationEnabled: true,
  };

  it('evaluates to Absent (code 2) when user is out of frame (inZone: false)', () => {
    const result = evaluateTelemetryState(
      { inZone: false, trackingActive: true, postureStatus: 1 },
      defaultThresholds
    );

    expect(result.normalizedStatus).toBe(2);
    expect(result.isAway).toBe(true);
    expect(result.hasAlert).toBe(false);
  });

  it('evaluates to Absent (code 2) when tracking is inactive', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: false, postureStatus: 0 },
      defaultThresholds
    );

    expect(result.normalizedStatus).toBe(2);
    expect(result.isAway).toBe(true);
  });

  it('evaluates to Correct (code 0) for healthy metrics and good posture', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: true, postureStatus: 0, bpm: 72, spo2: 98 },
      defaultThresholds,
      300,
      0
    );

    expect(result.normalizedStatus).toBe(0);
    expect(result.hasAlert).toBe(false);
    expect(result.label).toBe('Chuẩn');
  });

  it('triggers vital alert when BPM falls below minimum threshold', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: true, postureStatus: 0, bpm: 48, spo2: 98 },
      defaultThresholds
    );

    expect(result.hasAlert).toBe(true);
    expect(result.alertType).toContain('Nhịp tim thấp');
  });

  it('triggers vital alert when SpO2 drops below 95%', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: true, postureStatus: 0, bpm: 75, spo2: 92 },
      defaultThresholds
    );

    expect(result.hasAlert).toBe(true);
    expect(result.alertType).toContain('Nồng độ oxy thấp');
  });

  it('transitions to Long Incorrect (code 3) when bad posture sustained > 2 min', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: true, postureStatus: 1, bpm: 75, spo2: 98 },
      defaultThresholds,
      600,
      130 // > 120 seconds
    );

    expect(result.normalizedStatus).toBe(3);
    expect(result.hasAlert).toBe(true);
    expect(result.label).toBe('Sai tư thế lâu');
  });

  it('transitions to Sedentary Sitting Warning (code 4) when continuous sitting > 60 min', () => {
    const result = evaluateTelemetryState(
      { inZone: true, trackingActive: true, postureStatus: 0, bpm: 75, spo2: 98 },
      defaultThresholds,
      3650, // > 3600 seconds
      0
    );

    expect(result.normalizedStatus).toBe(4);
    expect(result.hasAlert).toBe(true);
    expect(result.label).toBe('Ngồi quá lâu');
  });
});
