# ADR 0002: Firebase Per-Account Historical Data Partitioning

## Status
Accepted

## Context
Previously, telemetry logs from all accounts were stored directly inside a shared top-level collection (`theodoisk_history`). When multiple users (e.g., Tài, Phúc, Admin) logged in on different devices, their history streams mixed together.

## Decision
- Partition historical telemetry records per user account:
  `/users/{userId}/history/{docId}`
- When an employee signs in, their application fetches and subscribes exclusively to `/users/{userId}/history`.
- Synchronize dual-write to `theodoisk_history/{docId}` for backward compatibility with external IoT scripts and hardware nodes.
- Admin dashboard queries across nodes and aggregates dynamically.

## Consequences
- Data privacy and isolation are guaranteed per employee account.
- Name and profile changes instantly reflect across historical analytics.
