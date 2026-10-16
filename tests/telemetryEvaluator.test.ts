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

describe('Pi 4 mainnew.py schema normalization', () => {
  it('correctly maps STAND posture from Pi to code 5 with trackingActive true', async () => {
    const { normalizeTelemetry } = await import('../src/services/deviceTelemetry');
    const piPacket = {
      bpm: 75.0,
      heart_rate: 75.0,
      spo2: 98.2,
      posture_status: 2,
      posture_label: 'Đứng / Không ngồi',
      is_in_zone: true,
      tracking_active: true,
      timestamp: '2026-10-13T17:00:00Z',
    };

    const normalized = normalizeTelemetry(piPacket, 'Pi 4');
    expect(normalized.postureStatus).toBe(5);
    expect(normalized.inZone).toBe(true);
    expect(normalized.trackingActive).toBe(true);
    expect(normalized.bpm).toBe(75);
    expect(normalized.spo2).toBe(98.2);
  });

  it('handles Pi 4 verifying state (-1) without dropping trackingActive', async () => {
    const { normalizeTelemetry } = await import('../src/services/deviceTelemetry');
    const piPacket = {
      bpm: 0.0,
      heart_rate: 0.0,
      spo2: 0.0,
      posture_status: -1,
      posture_label: 'Đang xác nhận tư thế',
      is_in_zone: true,
      tracking_active: true,
      timestamp: '2026-10-13T17:00:00Z',
    };

    const normalized = normalizeTelemetry(piPacket, 'Pi 4');
    expect(normalized.postureStatus).toBe(-1);
    expect(normalized.postureLabel).toBe('Đang xác nhận tư thế');
    expect(normalized.inZone).toBe(true);
    expect(normalized.trackingActive).toBe(true);
    expect(normalized.bpm).toBe(0);
  });

  it('handles Pi 4 long bad posture promotion (status 3 after 120s)', async () => {
    const { normalizeTelemetry } = await import('../src/services/deviceTelemetry');
    const piPacket = {
      bpm: 74.0,
      heart_rate: 74.0,
      spo2: 97.8,
      posture_status: 3,
      posture_label: 'Sai tư thế lâu',
      is_in_zone: true,
      tracking_active: true,
      timestamp: '2026-10-13T17:00:00Z',
    };

    const normalized = normalizeTelemetry(piPacket, 'Pi 4');
    expect(normalized.postureStatus).toBe(3);
    expect(normalized.postureLabel).toBe('Sai tư thế lâu');
    expect(normalized.hasAlert).toBe(true);
  });

  it('handles Pi 4 out-of-zone monitoring status', async () => {
    const { normalizeTelemetry } = await import('../src/services/deviceTelemetry');
    const piPacket = {
      bpm: 0.0,
      heart_rate: 0.0,
      spo2: 0.0,
      posture_status: 2,
      posture_label: 'Ngoài vùng quan sát',
      is_in_zone: false,
      tracking_active: true,
      timestamp: '2026-10-13T17:00:00Z',
    };

    const normalized = normalizeTelemetry(piPacket, 'Pi 4');
    expect(normalized.postureStatus).toBe(2);
    expect(normalized.inZone).toBe(false);
  });
});
