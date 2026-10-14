# Raspberry Pi 4 Data Contract (Pi Telemetry Contract)

This document specifies the immutable data contract between Raspberry Pi 4 (`mainnew.py`) and Firestore.

## 1. Firestore Path
- Collection: `devices`
- Document ID: `pi4_node_1` (or individual device ID e.g., `pi4_node_2`)

## 2. Document Payload Schema
```json
{
  "bpm": 75.0,
  "heart_rate": 75.0,
  "spo2": 98.2,
  "posture_status": 0,
  "posture_label": "Đúng",
  "is_in_zone": true,
  "tracking_active": true,
  "timestamp": "2026-10-13T17:00:00.000Z"
}
```

## 3. Field Specifications
- `bpm` (number): Heart rate in BPM. `0.0` when sensor is unattached/measuring. Confirmed V8 BPM when stable.
- `heart_rate` (number): Identical to `bpm`.
- `spo2` (number): Blood oxygen percentage (0.0 to 100.0). `0.0` when unattached/measuring.
- `posture_status` (number):
  - `0`: Correct ergonomics (Đúng)
  - `1`: Incorrect posture (Sai tư thế)
  - `2`: Absent / Standing / Outside zone (Vắng / Đứng / Ngoài vùng)
  - `3`: Long bad posture (promoted after 120s of bad posture)
  - `-1`: Verifying / Initializing (Đang xác nhận tư thế)
- `posture_label` (string): Human-readable status in Vietnamese ("Đúng", "Sai tư thế", "Sai tư thế lâu", "Đứng / Không ngồi", "Ngoài vùng quan sát", "Vắng / Không phát hiện", "Đang xác nhận tư thế").
- `is_in_zone` (boolean): `true` if person is within observation bounding box.
- `tracking_active` (boolean): `true` if camera vision worker is active and tracking.
- `timestamp` (string): UTC ISO-8601 string formatted timestamp.

## 4. Security & Access
- The Raspberry Pi uses **Firebase Admin SDK** (`firebase-admin`) with a service account (`serviceAccountKey.json`).
- Firebase Admin operations bypass client `firestore.rules`.
- Web clients are restricted to read-only access for paired devices, eliminating client tampering.
