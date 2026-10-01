import { describe, it, expect } from 'vitest';
import { generateSimulatedTelemetry } from '../src/domain/simulationGenerator';

describe('generateSimulatedTelemetry', () => {
  it('generates correct posture for steps 0-5 in auto mode', () => {
    const res = generateSimulatedTelemetry(0, 'auto');
    expect(res.postureStatus).toBe(0);
    expect(res.postureLabel).toContain('ĐÚNG');
    expect(res.inZone).toBe(true);
    expect(res.trackingActive).toBe(true);
    expect(res.bpm).toBeGreaterThan(60);
  });

  it('generates incorrect posture for steps 6-11 in auto mode', () => {
    const res = generateSimulatedTelemetry(6, 'auto');
    expect(res.postureStatus).toBe(1);
    expect(res.postureLabel).toContain('SAI');
    expect(res.inZone).toBe(true);
    expect(res.trackingActive).toBe(true);
    expect(res.postureWarning).toBeDefined();
  });

  it('generates absent / no person for steps 12-17 in auto mode with 0 bpm and out of zone', () => {
    const res = generateSimulatedTelemetry(12, 'auto');
    expect(res.postureStatus).toBe(2);
    expect(res.postureLabel).toContain('VẮNG MẶT');
    expect(res.inZone).toBe(false);
    expect(res.trackingActive).toBe(false);
    expect(res.bpm).toBe(0);
    expect(res.spo2).toBe(0);
  });

  it('supports explicit scenario selection for instant testing', () => {
    const correct = generateSimulatedTelemetry(10, 'correct');
    expect(correct.postureStatus).toBe(0);

    const incorrect = generateSimulatedTelemetry(0, 'incorrect');
    expect(incorrect.postureStatus).toBe(1);

    const absent = generateSimulatedTelemetry(0, 'absent');
    expect(absent.postureStatus).toBe(2);
    expect(absent.bpm).toBe(0);

    const longIncorrect = generateSimulatedTelemetry(0, 'long_incorrect');
    expect(longIncorrect.postureStatus).toBe(3);
  });
});
