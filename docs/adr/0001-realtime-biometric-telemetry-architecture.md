# ADR 0001: Real-Time Biometric & Ergonomic Telemetry Architecture

## Status
Accepted

## Context
The application monitors real-time employee posture and vital signs at office workstations. Hardware edge nodes (Raspberry Pi 4) run AI vision models for posture estimation and read MAX30102 I2C biometric sensors for heart rate and SpO2.

## Decision
- Standardize posture codes into 5 canonical integer states:
  - 0: Correct Sitting Posture
  - 1: Incorrect Sitting Posture
  - 2: Absent / Empty Seat / Out of Camera Frame
  - 3: Long-term Incorrect Posture (> 2 min)
  - 4: Sedentary Sitting Warning (> 60 min)
- When a user is out of the camera zone (`inZone === false`) or camera detection is inactive (`trackingActive === false`), their presence MUST evaluate to `Away` (`– Vắng`) rather than false positive "Tư thế sai".
- Audio alerts use Vietnamese speech synthesis and ergonomic tone chimes.

## Consequences
Both the employee's personal telemetry screen and the administrator's multi-node command center maintain strict consistency.
