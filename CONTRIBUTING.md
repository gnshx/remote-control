# Contributing to Phone Gamepad 🎮

Thank you for your interest in contributing to **Phone Gamepad**! We welcome contributions from developers, designers, and gamers of all skill levels.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Suggesting New Game Profiles](#suggesting-new-game-profiles)
  - [Designing New Controller Interfaces](#designing-new-controller-interfaces)
  - [Reporting Bugs](#reporting-bugs)
  - [Submitting Code Changes](#submitting-code-changes)
- [Local Development Setup](#local-development-setup)
- [Project Architecture](#project-architecture)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## How Can I Contribute?

### 🏎️ Adding a New Game Profile

Adding a key mapping for your favorite game is quick and doesn't require backend programming:

1. Add your game's preset mapping to `mobile/key-mapping.js` under `DEFAULT_PROFILES`.
2. Add the corresponding profile to `laptop-agent/config/profiles.json`.
3. Add the fallback in `laptop-agent/controller/mapping_engine.py`.
4. Test with `python run.py --dry-run`.
5. Submit a pull request!

### 🎨 Designing New Controller Layouts

Have an idea for a flight simulator stick, FPS dual-stick, or rhythm game interface?
1. Layout templates live in `mobile/index.html` under `.controller-area`.
2. CSS styling lives in `mobile/styles.css`.
3. Touch & button bindings hook into semantic action IDs in `mobile/controller.js`.

### 🐛 Reporting Bugs

Before creating bug reports, please check the existing issues to ensure it hasn't already been reported. When creating a bug report, use our [Bug Report Template](https://github.com/gnshx/remote-control/issues/new?template=bug_report.yml) and include:
- Your Linux desktop environment (`X11` vs `Wayland`, GNOME / KDE version).
- Your phone OS & browser (e.g. Android 14, Chrome 124).
- The laptop terminal logs and browser console logs.

---

## 💻 Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/gnshx/remote-control.git
   cd remote-control
   ```

2. **Run the automated setup**:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

3. **Start in Dry-Run mode** (logs key events without injecting synthetic keystrokes):
   ```bash
   .venv/bin/python run.py --dry-run
   ```

4. **Verify frontend syntax**:
   ```bash
   node -c mobile/controller.js mobile/key-mapping.js mobile/joystick.js mobile/bluetooth.js
   ```

---

## 🏛️ Project Architecture

```
phone-remote-controller/
├── mobile/                  # Pure static frontend (served over local HTTP)
│   ├── index.html           # Multi-layout controller views
│   ├── styles.css           # Neo-cyberpunk gaming UI design system
│   ├── controller.js        # WebSocket / BLE transport & event engine
│   ├── key-mapping.js       # Game profiles & client-side mappings
│   └── joystick.js          # Touch thumbstick with dead-zone math
├── laptop-agent/            # Background daemon running on the PC
│   ├── controller/          # Mapping engine & profile reconciliation
│   ├── input/               # Keyboard injection (uinput for Wayland, pynput for X11)
│   ├── safety/              # Dead-man watchdog & release failsafes
│   └── transport/           # Async WebSocket server
├── run.py                   # Unified launcher & CLI entrypoint
└── install.sh               # udev rules & setup script
```

---

## 🚀 Pull Request Process

1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. Make your changes and test thoroughly.
3. Ensure syntax passes:
   ```bash
   python -m py_compile run.py
   node -c mobile/*.js
   ```
4. Commit using conventional commit format:
   ```bash
   git commit -m "feat: add dual-stick flight simulator layout"
   ```
5. Push to your fork and submit a Pull Request to `gnshx/remote-control:main`.
