# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Architecture & Local Trust Model

**Phone Gamepad** is designed strictly for local area network (LAN) execution between your smartphone and PC:
- The WebSocket daemon binds to `0.0.0.0` to permit phone connections on your local Wi-Fi or private hotspot.
- By default, communication remains within your private subnets (`192.168.x.x`, `10.x.x.x`, or `172.16.x.x`).
- **Never expose the WebSocket agent (port 8765) to public internet port forwarding without an authenticated tunnel** (e.g. Tailscale, ZeroTier, or SSH local port forwarding).

## Safety Guardrails
- **Watchdog Timer**: Automatically flushes and releases all held virtual keyboard keys within 5 seconds if connection is interrupted.
- **Set-Difference Reconciliation**: Guarantees zero stuck keys or state desynchronization.
- **Kernel-level uinput isolation**: Input events are tagged as virtual user gamepad/keyboard devices without arbitrary command execution rights.

## Reporting a Vulnerability

If you discover a potential security vulnerability within this repository, please report it privately:
1. Open a confidential report via **GitHub Security Advisories** or email `contact@gnshx.dev`.
2. Please provide step-by-step reproduction instructions.
3. We will acknowledge receipt within 48 hours and work on a patch promptly.
