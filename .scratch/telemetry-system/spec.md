# Spec: Real-time Medical & Telemetry IoT Pipeline

Status: ready-for-agent

## Problem Statement
Workplace health monitoring requires real-time posture analysis and vital sign tracking from Raspberry Pi 4 edge nodes without compromising individual user privacy or creating noisy alerts.

## Solution
An end-to-end edge-to-cloud telemetry dashboard in React 19 + TypeScript + Tailwind CSS with Google Cloud Firestore backend. Supports per-user history subcollections, real-time presence/zone evaluation, automated ergonomic Vietnamese voice prompts, and exportable medical PDF reports.

## User Stories
1. As an employee, I want real-time feedback on my sitting posture (correct vs hunched/slouching) so that I can prevent cervical spine fatigue.
2. As an employee, I want to see my live heart rate (BPM) and SpO2 levels from the MAX30102 sensor so that I can monitor my physical state during work hours.
3. As an employee, I want immediate voice reminders in Vietnamese when I sit poorly for more than 2 minutes so that I can actively correct my posture.
4. As an employee, I want the system to distinguish between poor posture and stepping away from my desk (Away / Vắng mặt) so that false alarms are not triggered when my chair is empty.
5. As an employee, I want my telemetry history isolated under `/users/{userId}/history` so that my medical metrics remain confidential.
6. As an administrator, I want a multi-node overview of all workstation nodes to ensure workplace ergonomic compliance and employee wellbeing.
7. As an administrator, I want to export medical-grade PDF summaries with auto-calculated statistical breakdowns.

## Implementation Decisions
- Canonical 5-posture status encoding (0: Correct, 1: Incorrect, 2: Absent/Away, 3: Long-term incorrect > 2 min, 4: Sedentary > 60 min).
- Zone boundary filtering (`inZone: boolean`, `trackingActive: boolean`) to guarantee zero false positives when user leaves frame.
- Sound & speech synthesis using HTML5 Audio chimes and Web Speech API synthesis for clear Vietnamese notifications.
- Firestore dual-write compatibility for external edge hardware scripts.

## Testing Decisions
- Public interface seam: Telemetry state transition engine & presence evaluator.
- Behavior testing: Asserting state transitions without mocking internals.
- Vitest suite running via `npm run test`.

## Out of Scope
- Direct hardware serial flashing from web browser.
- External wearable bluetooth pairings.
