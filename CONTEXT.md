# HealthOffice IoT System Context & Domain Model

## Core Mission
A real-time medical & workplace ergonomics monitoring dashboard connected to Raspberry Pi 4 edge nodes, equipped with Camera AI (posture analysis) and MAX30102 biometric pulse oximetry sensors, backed by Google Cloud Firestore.

## Ubiquitous Language & Domain Terms

- **TelemetryLog**: A single measurement record containing heart rate (`bpm`), oxygen saturation (`spo2`), posture classification code (`postureStatus`), observation zone status (`trackingActive`, `inZone`), timestamp, device ID, and user account metadata (`userId`, `userEmail`, `userName`).
- **BPM (Beats Per Minute)**: Heart rate measured by MAX30102 optical sensor. Normal healthy resting range: 60 - 100 bpm.
- **SpO2 (%)**: Blood oxygen saturation percentage measured by red and infrared light absorption. Normal healthy range: >= 95%.
- **Posture Classification**:
  - `0 (Tư thế ĐÚNG)`: Ergonomically correct sitting posture (spine straight, head aligned with shoulders).
  - `1 (Tư thế SAI)`: Poor posture detected (slouching, hunched shoulders, or forward neck flexion > 35°).
  - `2 (VẮNG MẶT / Ghế trống)`: The monitored subject has left the desk or is out of the camera's observation zone (`inZone === false` or `trackingActive === false`).
  - `3 (SAI TƯ THẾ LÂU)`: Poor posture sustained continuously for over 2 minutes. Triggers ergonomic audio chime & voice alert.
  - `4 (NGỒI LÂU)`: Continuous desk sitting for > 60 minutes without walking or moving.
- **Monitoring Zone (Vùng Giám Sát / inZone)**: Visual bounding area monitored by the Raspberry Pi AI camera. If the user moves out of frame or chair is empty, status transitions immediately to Absent (`Away`).
- **Presence (Hiện diện)**:
  - `Present (Tại bàn)`: User is actively sitting and in frame.
  - `Away (Vắng mặt)`: User is absent or out of camera view. Posture is set to `absent` (`– Vắng`).
- **Node Raspberry Pi 4**: Hardware telemetry capture device streaming real-time sensor packets.
- **Per-Account Partitioning**: In Cloud Firestore, telemetry history records are partitioned under user subcollections (`/users/{userId}/history/{docId}`) so each account owns their data privately without crosstalk, while the Admin dashboard aggregates across nodes.

## Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons, full Light Mode command center.
- **Database**: Google Cloud Firestore (primary) & optional Firebase Realtime Database.
- **PDF Reporting**: Client-side jsPDF + jspdf-autotable medical report generator.
- **Voice Ergonomics**: Web Audio API synthetics & HTML5 audio chimes for real-time Vietnamese alerts ("Xin hãy ngồi thẳng lưng lên!", "Bạn đang ngồi ngoài vùng quan sát").
