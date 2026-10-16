# 01: Real-time Telemetry Processing and Presence State Machine

Status: ready-for-agent
Type: task

## Goal
Implement and verify the posture classification and presence calculation seam so that:
- `inZone === false` or `trackingActive === false` immediately evaluates to `absent` (`2`).
- Long sitting (> 60m continuous) transitions to status `4`.
- Long incorrect posture (> 2m continuous) transitions to status `3`.

## Seams Under Test
- Function: `evaluateTelemetryState(telemetry: HealthTelemetry, thresholds: AlertThresholds, sittingSeconds: number, badPostureSeconds: number)`
- Returns normalized posture status and alert trigger flags.

## Acceptance Criteria
1. Given valid sitting with no slouch, returns status `0` (`correct`).
2. Given out of frame (`inZone: false`), returns status `2` (`absent`).
3. Given bad posture for > 120s, returns status `3` (`long_incorrect`) and triggers alert chime.
4. All unit tests pass in `npm run test`.

## Comments
- Initialized ticket based on ADR 0001 and CONTEXT.md domain model.
