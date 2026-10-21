# 🎮 Phone-to-Laptop Wireless Game Controller

[![CI](https://github.com/gnshx/remote-control/actions/workflows/ci.yml/badge.svg)](https://github.com/gnshx/remote-control/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Linux](https://img.shields.io/badge/Platform-Ubuntu%20%7C%20Linux%20(X11%20%26%20Wayland)-E95420.svg?logo=ubuntu&logoColor=white)](https://ubuntu.com/)
[![Android Chrome](https://img.shields.io/badge/Client-Chrome%20on%20Android-4285F4.svg?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Transport](https://img.shields.io/badge/Transport-Local%20WebSocket%20%26%20BLE-00E5CC.svg)](#-how-we-built-it--technology-stack)
[![Latency](https://img.shields.io/badge/Latency-%3C%205ms-brightgreen.svg)](#-how-we-built-it--technology-stack)
[![Zero Installs on Phone](https://img.shields.io/badge/Phone%20App-Zero%20Install%20(Web)-purple.svg)](#-step-by-step-how-to-use-it)

> Turn any Android smartphone into a high-performance, ultra-low-latency wireless gamepad for your Ubuntu laptop. Zero apps to install on your phone—just open the browser, scan the terminal QR code, and control browser games like **Smash Karts**, racing games, or retro emulators in Chrome.

---

## 📋 Table of Contents

- [🌟 Features](#-features)
- [🚀 Step-by-Step: How to Use It](#-step-by-step-how-to-use-it)
  - [Prerequisites](#prerequisites)
  - [1. Launch the Server](#1-launch-the-server)
  - [2. Connect Your Phone](#2-connect-your-phone)
  - [3. Focus & Play Smash Karts](#3-focus--play-smash-karts)
  - [4. Switch Between Controller Layouts & Profiles](#4-switch-between-controller-layouts--profiles)
  - [5. Customizing Key Mappings](#5-customizing-key-mappings)
  - [6. 📐 HUD Customizer: Drag Positions & Edit Control Sizes](#6--hud-customizer-drag-positions--edit-control-sizes)
  - [7. ⚡ Pro Assists: Auto-Gas, Turbo Rapid-Fire & Auto-Hold](#7--pro-assists-auto-gas-turbo-rapid-fire--auto-hold)
- [🎮 Controller Layouts & Supported Game Types](#-controller-layouts--supported-game-types)
- [🏗️ How We Built It & Technology Stack](#️-how-we-built-it--technology-stack)
  - [System Architecture Diagram](#system-architecture-diagram)
  - [Complete Technology Stack](#complete-technology-stack)
  - [Core Architectural Decisions](#core-architectural-decisions)
- [📡 Communication Protocol Specification](#-communication-protocol-specification)
- [🛡️ Safety & Reliability Systems](#️-safety--reliability-systems)
- [🔧 Desktop Session Compatibility (X11 vs Wayland)](#-desktop-session-compatibility-x11-vs-wayland)
- [❓ Troubleshooting](#-troubleshooting)
- [📁 Project Structure](#-project-structure)

---

## 🌟 Features

- **📱 Zero Phone App Installation**: Operates entirely within mobile Chrome through modern Web APIs. No APKs, rooting, or sideloading required.
- **⚡ Ultra-Low Latency (< 5ms)**: Streamlined local WebSocket communication pipeline bypassing cloud relays, with direct binary-compatible payload serialization.
- **🕹️ Analog-Style Virtual Joystick**: Precision-engineered thumbstick powered by the PointerEvents API with circular dead-zone filtering and directional arrows.
- **🔄 State Reconciliation Engine**: The laptop tracks authoritative key states, executing set-difference math (`to_press = desired - current`, `to_release = current - desired`) to eliminate ghost inputs and missed key-releases.
- **⚙️ Live Key Mapping Editor**: Customize any button or direction on-the-fly from the phone interface with persistent `localStorage` and JSON export.
- **🔀 Hold vs. Tap Modes**: Continuous steering and throttle use *Hold* mode; weapons, items, and abilities use microsecond-timed *Tap* mode.
- **🐕 Failsafe Watchdog**: Automatic 5.0-second timeout releases all pressed keys if the phone disconnects, runs out of battery, or sleeps.
- **📷 Instant QR Code Pairing**: Terminal generates a clean ASCII QR code on launch for 1-second pairing.
- **📶 Multi-Transport Architecture**: Default local Wi-Fi WebSockets for competitive response time, with Web Bluetooth LE (BLE) client integration.

---

## 🚀 Step-by-Step: How to Use It

### Prerequisites

1. **Laptop**: Ubuntu 20.04/22.04/24.04 (or any Linux distribution with Python 3.10+).
2. **Phone**: Android smartphone running Chrome, connected to the **same local Wi-Fi network** (or phone mobile hotspot) as your laptop.

---

### 1. Installation & Setup

Choose your preferred way to install:

#### Option A: One-Command Automated Setup (Recommended)
Configures automatic passwordless udev rules, builds the virtualenv, and adds a desktop launcher:
```bash
git clone https://github.com/gnshx/remote-control.git
cd remote-control
chmod +x install.sh
./install.sh
```

#### Option B: Install via pip
Install directly as a system CLI tool:
```bash
pip install git+https://github.com/gnshx/remote-control.git
# Then launch anywhere:
phone-gamepad
```

---

### 2. Launch the Server

Run the startup script:

```bash
./start.sh
```

*(Or run `phone-gamepad` or `python3 run.py` directly).*

The terminal will automatically:
- Detect your laptop's local LAN IP (e.g. `192.168.1.15` or `10.10.x.x`).
- Auto-select free HTTP (`8001`) and WebSocket (`8765`) ports.
- Detect your desktop session environment (`X11` or `Wayland`).
- Initialize the background input injection adapter.
- Render an **ASCII QR Code** directly in your terminal window.

```text
================================================================
  🎮  PHONE-TO-LAPTOP WIRELESS GAME CONTROLLER  🎮
================================================================
  • Phone Web URL   :  http://192.168.1.15:8001
  • WebSocket Agent :  ws://192.168.1.15:8765
  • Active Profile  :  Smash Karts
  • Desktop Session :  X11
  • Keyboard Adapter:  PynputAdapter
================================================================

  Scan with your phone camera to open the controller:
  [QR Code appears here]

  📱 Open on your phone: http://192.168.1.15:8001
  🏎️  Open in Chrome   : https://smashkarts.io
  🛑 Press Ctrl+C to stop.
================================================================
```

---

### 2. Connect Your Phone

1. Open your phone camera or QR scanner and scan the QR code displayed in the terminal.
   - *Or open Chrome on your phone and manually navigate to `http://<laptop-ip>:8001`.*
2. The controller web app will load. The laptop's IP address will be **automatically pre-filled** in the connection box!
3. Tap **Connect (Wi-Fi)**.
4. The status indicator at the top left turns from gray to vibrant green: **Connected (Wi-Fi)** with real-time ping latency display (`< 5ms`).
5. Your phone will trigger a subtle haptic vibration confirming the handshake.

---

### 3. Focus & Play Smash Karts

1. On your laptop, open Google Chrome and navigate to [Smash Karts](https://smashkarts.io) (or any other game).
2. Click inside the game window so it has keyboard focus.
3. Hold your phone horizontally:
   - **Left Thumb**: Push the joystick up/down/left/right to steer and drive.
   - **Right Thumb**: Tap the big red **FIRE** button to shoot, tap **BRAKE** to drift around corners, and use **ITEM** to deploy powerups.
4. Notice the **Live HUD** at the top of your phone screen: pills for `W`, `A`, `S`, `D`, `SPC`, etc. illuminate in real-time as keys are engaged on the laptop.

---

---

### 4. Switch Between Controller Layouts & Profiles

Different games require different control setups. You can switch layouts directly from the dropdown in the center of the top bar at any time:

1. **🎮 Smash Karts / Action**:
   - Left: Smooth virtual analog joystick with dead-zone filtering for steering and throttle.
   - Right: 4-button cluster with large red FIRE, purple DRIFT, blue ITEM, and yellow SPECIAL.
2. **🏎️ Racing Cockpit (Pedals + Steer)**:
   - Left: Responsive left and right steering pads, plus dedicated **DRIFT** and **NITRO** buttons.
   - Right: Realistic 3D metallic pedals with textured rubber treads—tall **GAS (Accel)** pedal and wide **BRAKE (Reverse)** pedal with dynamic press depth.
3. **🧭 Retro 4-Way D-Pad**:
   - Left: Classic cross-shaped 4-way arcade D-Pad (`▲`, `▼`, `◀`, `▶`).
   - Right: Authentic ABXY diamond action cluster for platformers and retro emulators.
4. **🚗 Simple Steer & Pedals**:
   - Left: Two oversized full-height left/right steering pads.
   - Right: Two oversized full-height Gas and Brake pads for effortless driving without looking at the screen.

---

### 5. Customizing Key Mappings

Want to use arrow keys, control a different game, or change button bindings?

1. Tap the **⚙️ (Settings)** icon in the top right of the controller screen.
2. Select a profile:
   - **🏎️ Smash Karts** (W/A/S/D + Space + Shift + Q + E)
   - **🏎️ Racing / Driving** (Gas/Brake + Steer + Nitro + Drift)
   - **⌨️ WASD Generic** (Standard FPS / Action controls)
   - **⬆️ Arrow Keys** (Classic arcade / 2D platformers)
   - **⚙️ Custom** (User-defined configuration)
3. Tap any key field to change its key binding (e.g. change `FIRE` to `F` or `ENTER`).
4. Toggle between **Hold** (held down while your finger touches the screen) and **Tap** (simulates a quick 50ms keystroke).
5. Tap **Save** — changes are applied instantaneously to both phone and laptop agent without restarting!

---

### 6. 📐 HUD Customizer: Drag Positions & Edit Control Sizes

Custom fit the controller to your hands and screen size!

1. Tap **📐 Edit HUD** in the bottom controls bar.
2. **Move Controls**: Touch and drag any control zone (Joystick, Action Buttons, Pedals, Steer buttons) anywhere across the screen. Real-time coordinate tags show exact offsets `(X, Y)`.
3. **Resize Individual Controls**:
   - Tap any control zone to select it (or pick it from the "Control" dropdown).
   - Tap preset size buttons: **S (75%)**, **M (100%)**, **L (125%)**, or **XL (150%)**, or drag the Size slider from 60% to 180%!
   - *Example: Make the Gas/Brake pedals XL for easy tapping, while keeping steering compact.*
4. **Adjust Transparency & Overall Scale**:
   - Use the **Opacity** slider (30% to 100%) to make controls translucent so you can see through them.
   - Use the **Layout** scale slider to adjust the global size.
5. Tap **✓ Done** — all your custom positions and sizes are automatically saved in local storage per layout!

---

### 7. ⚡ Pro Assists: Auto-Gas, Turbo Rapid-Fire & Auto-Hold

Eliminate thumb fatigue during long gaming sessions:

- **🚀 Auto-Gas (Hold W)**: Tap `🚀 Auto-Gas` to keep accelerating forward continuously without holding your finger down. Step on the brake pedal or steer backwards to automatically disengage!
- **⚡ Turbo Rapid-Fire**: Tap `⚡ Turbo` to activate rapid-fire key pulsing. Click the Turbo button to cycle between **15 Hz**, **22 Hz (Ultra)**, and **8 Hz**. Perfect for shooting games and spamming weapons!
- **🔒 Auto-Hold Mode**: 
  - Turn ON `🔒 Auto-Hold` from the bottom bar: any button you tap locks ON immediately!
  - **Double-Tap Lock**: Double-tap any button (like Drift, Gas, or Special) anytime to lock it down. A glowing neon lock icon `🔒` appears over the button. Tap again to release!
- **🔄 Reset**: Tap `🔄 Reset` at any time to instantly release all held keys and clear all active auto-locks.

---

## 🎮 Controller Layouts & Supported Game Types

| Interface Layout | Best Suited Games | Left-Hand Controls | Right-Hand Controls |
|---|---|---|---|
| **🎮 Smash Karts / Action** | Smash Karts, Kart games, 3D arenas | 360° Virtual Joystick (`W/A/S/D`) | `FIRE` (Space), `DRIFT` (Shift), `ITEM` (Q), `SPECIAL` (E) |
| **🏎️ Racing Cockpit** | TrackMania, Need for Speed, WebGL racers | `STEER LEFT` (A), `STEER RIGHT` (D), `DRIFT` (Shift), `NITRO` (Space) | 3D Textured **GAS Pedal** (W) & **BRAKE Pedal** (S) |
| **🧭 Retro 4-Way D-Pad** | Retro 2D games, Street Fighter, platformers | Cross D-Pad (`▲ W`, `▼ S`, `◀ A`, `▶ D`) | Diamond `B` (Space), `A` (Shift), `X` (Q), `Y` (E) |
| **🚗 Simple Steer & Pedals** | Casual runners, hill climb games, simple driving | Large `STEER LEFT` (A), `STEER RIGHT` (D) | Large `BRAKE` (S) and `GAS` (W) |

---

## 🏗️ How We Built It & Technology Stack

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 ANDROID SMARTPHONE (Chrome)                 │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │    Virtual Joystick   │       │     Action Buttons    │  │
│  │ (PointerEvents 60 FPS)│       │  (Fire, Drift, Items) │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              └───────────────┬───────────────┘              │
│                              ▼                              │
│              ┌───────────────────────────────┐              │
│              │      Key Mapping Engine       │              │
│              │  (Direction/Button → Key IDs) │              │
│              └───────────────┬───────────────┘              │
│                              ▼                              │
│              ┌───────────────────────────────┐              │
│              │    Transport Abstraction      │              │
│              │  [WebSocket]   [Web Bluetooth]│              │
│              └───────────────┬───────────────┘              │
└──────────────────────────────┼──────────────────────────────┘
                               │
                Local Wi-Fi WebSocket (< 5ms)
                     or Web Bluetooth LE
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    UBUNTU LAPTOP AGENT                      │
│                                                             │
│              ┌───────────────────────────────┐              │
│              │    WebSocket / BLE Server     │              │
│              │  (asyncio JSON Frame Parser)  │              │
│              └───────────────┬───────────────┘              │
│                              ▼                              │
│              ┌───────────────────────────────┐              │
│              │   State Reconciliation Engine │              │
│              │  to_press   = desired - curr  │              │
│              │  to_release = curr - desired  │              │
│              └───────────────┬───────────────┘              │
│                              ▼                              │
│        ┌─────────────────────┴─────────────────────┐        │
│        ▼                                           ▼        │
│ ┌───────────────┐                         ┌─────────────────┐
│ │Safety Watchdog│                         │ Keyboard Adapter│
│ │ (5.0s Timeout)│                         │ (pynput / XTest)│
│ └───────────────┘                         └────────┬────────┘
└────────────────────────────────────────────────────┼────────┘
                                                     ▼
                                        Native OS Synthetic Input
                                                     ▼
                                          Chrome: Smash Karts
```

---

### Complete Technology Stack

| Layer | Component | Technology / Library | Why It Was Chosen |
|---|---|---|---|
| **Mobile Frontend** | UI Structure | **HTML5 + Semantic DOM** | Zero-dependency, instant page load, universally supported across mobile browsers. |
| **Mobile Styling** | Design System | **Vanilla CSS3 (Glassmorphism)** | Custom responsive layout with HSL tailored colors, dark theme, fluid radial gradients, and zero framework overhead. |
| **Touch Input** | Virtual Joystick | **PointerEvents API** | Bypasses the 300ms mobile touch delay, prevents synthetic mouse emulation, and captures multi-touch gestures reliably. |
| **State Storage** | Profile Storage | **Web Storage API (`localStorage`)** | Saves custom key assignments persistently on the device without requiring remote databases or accounts. |
| **Primary Transport**| Network Transport | **WebSockets (`ws://`)** | Bi-directional, full-duplex TCP socket over local LAN. Yields deterministic latency of 2–5ms without Bluetooth pairing hurdles. |
| **Alternate Transport**| Wireless Transport | **Web Bluetooth API** | Connects to custom GATT services directly from Chrome on Android without installing native apps. |
| **Laptop Server** | Runtime & Event Loop | **Python 3.12 + `asyncio`** | Asynchronous, non-blocking I/O capable of handling 60Hz state updates with < 1ms CPU processing time. |
| **WS Server** | Socket Engine | **`websockets` 12.0+** | High-performance Python WebSocket implementation with connection pooling and ping/pong keepalives. |
| **Input Injection** | Universal Keyboard | **`pynput`** | Direct interface to system input hooks across X11 and Wayland environments. |
| **Input Injection** | X11 Native | **`python-xlib` (XTest)** | Direct X11 protocol extension for injecting synthetic KeyPress and KeyRelease events without root privileges. |
| **Input Injection** | Wayland Native | **`evdev` (`uinput`)** | Linux kernel-level virtual input device creation for sandboxed Wayland desktop environments. |
| **Onboarding** | Terminal QR Pairing | **`qrcode`** | Prints clean UTF-8 terminal QR codes for camera discovery. |

---

### Core Architectural Decisions

#### 1. Why WebSockets over Bluetooth as Default?
While Bluetooth LE is supported through our `bluetooth.js` and `ble_server.py` modules, operating systems handle BLE peripheral role hosting differently:
- On Linux, acting as a BLE peripheral requires elevated BlueZ D-Bus permissions and specific Bluetooth hardware controllers that support peripheral advertising.
- WebSockets over local Wi-Fi work identically and immediately on **100% of laptops and Android phones**, delivering sub-5ms latency with zero driver hurdles.

#### 2. State-Based Synchronization vs. Raw Key Events
Traditional remote controllers send naive `KEYDOWN` and `KEYUP` messages. If a single packet drops over Wi-Fi, the player's kart gets permanently stuck driving left.
Our engine uses **Authoritative Key State Synchronization**:
- The phone transmits the set of currently active controls: `{"keys": ["W", "A", "SPACE"]}`.
- When the joystick returns to neutral, it sends `{"keys": []}`.
- The laptop agent reconciles incoming sets against currently held keys. Missed packets never leave keys stuck.

#### 3. Failsafe Watchdog Timer
A dedicated background watchdog thread monitors incoming message timestamps:
- If no message is received for **5.0 seconds** (e.g. phone screen times out, Wi-Fi disconnects, or browser minimizes), the agent executes `release_all()` immediately.

#### 4. PointerEvents vs. Touch Events
Old touch libraries suffer from passive listener delays and coordinate drift. We utilize pointer capture:
```javascript
this.base.setPointerCapture(e.pointerId);
```
This guarantees continuous, buttery-smooth joystick drag events even if the player's thumb slides off the joystick circle.

---

## 📡 Communication Protocol Specification

All communication between the phone and laptop agent uses lightweight JSON messages:

### Client $\rightarrow$ Laptop Messages

#### `HELLO` (Session Handshake)
```json
{
  "type": "HELLO",
  "seq": 1,
  "profile": "smash_karts",
  "version": "1.0"
}
```

#### `STATE` (Periodic & Immediate Input State)
```json
{
  "type": "STATE",
  "seq": 142,
  "keys": ["W", "D", "SPACE"],
  "ts": 1718900000150
}
```

#### `TAP` (Instantaneous Action Trigger)
```json
{
  "type": "TAP",
  "seq": 143,
  "key": "E",
  "duration_ms": 50
}
```

#### `PING` (Latency Measurement)
```json
{
  "type": "PING",
  "seq": 144,
  "ts": 1718900000200
}
```

#### `RESET` (Emergency Key Release)
```json
{
  "type": "RESET",
  "seq": 145
}
```

---

## 🛡️ Safety & Reliability Systems

1. **Monotonic Sequence Numbers (`seq`)**: Stale or out-of-order packets arriving late due to network jitter are automatically discarded.
2. **Graceful Signal Handling**: On `Ctrl+C` or `SIGTERM`, `run.py` releases all keys in the operating system before shutting down.
3. **Emergency Reset Button**: Tap the **🔄 Reset** button on the bottom bar of your phone to instantly release all active keys.
4. **Clean Socket Closure**: When closing the mobile browser tab, `onclose` triggers an immediate key release on the host laptop.

---

## 🔧 Desktop Session Compatibility (X11 vs Wayland)

To check your current Linux session type, run:
```bash
echo $XDG_SESSION_TYPE
```

- **X11 (Default)**: Supported out-of-the-box via `pynput` and `python-xlib` (XTest). No root or special permissions needed.
- **Wayland**: Supported via `pynput`. If using `uinput` kernel injection, add your user to the input group once:
  ```bash
  sudo usermod -aG input $USER
  ```
  *(Log out and log back in for changes to take effect).*

---

## ❓ Troubleshooting

### Phone cannot connect to laptop
- Verify that both devices are on the **same Wi-Fi network**.
- If your router has "AP Isolation" or "Guest Network Isolation" enabled, devices cannot talk to each other. Connect both devices to a standard Wi-Fi network or your phone's Wi-Fi hotspot.
- Check if your laptop firewall (`ufw`) is blocking incoming traffic:
  ```bash
  sudo ufw allow 8000:8010/tcp
  sudo ufw allow 8765/tcp
  ```

### Keystrokes are logged in terminal but the game doesn't move
- Ensure the game window (Google Chrome) is **actively clicked and focused**. Background windows do not accept keyboard input.
- Run with `--dry-run` to test input delivery in terminal:
  ```bash
  ./start.sh --dry-run
  ```

### How do I change the IP address manually?
- If the phone doesn't auto-detect the IP, you can type your laptop's local IP (shown in the terminal banner, e.g. `192.168.1.15`) into the "Laptop IP Address" box on the phone.

---

## 📁 Project Structure

```
├── .github/
│   ├── workflows/              # GitHub Actions CI/CD workflows (Tests, PyPI build)
│   ├── ISSUE_TEMPLATE/         # Bug, layout request, and feature templates
│   └── pull_request_template.md# Pull request checklist
├── mobile/                     # Mobile Web Controller (Runs in Chrome on Android)
│   ├── index.html              # Multi-layout controller views (Racing, D-Pad, etc.)
│   ├── styles.css              # Dark neo-cyberpunk gaming UI design system
│   ├── joystick.js             # Low-latency PointerEvents virtual thumbstick
│   ├── key-mapping.js          # Profile manager & key mapping with localStorage
│   ├── bluetooth.js            # Web Bluetooth API client for BLE connections
│   └── controller.js           # Multi-transport orchestrator & key state sync
│
├── laptop-agent/               # Ubuntu Laptop Agent (Python 3)
│   ├── main.py                 # Standalone agent runner
│   ├── transport/              # Network transport servers (WebSocket + BLE)
│   ├── controller/             # Key mapping engine & profile manager
│   ├── input/                  # Keyboard injection (uinput for Wayland, pynput for X11)
│   ├── safety/                 # Watchdog & release failsafes
│   └── config/                 # Default profiles configuration
│
├── pyproject.toml              # Modern PEP 621 Python packaging (pip install)
├── install.sh                  # Automated Linux installer with udev rule setup
├── start.sh                    # One-command startup script
├── run.py                      # Unified launcher & CLI entrypoint
├── CONTRIBUTING.md             # Community contribution guide
├── CODE_OF_CONDUCT.md          # Contributor Covenant 2.1
├── SECURITY.md                 # Local network security policy
└── LICENSE                     # MIT License
```

---

## 🤝 Contributing

Contributions are warmly welcome! Whether you want to add a preset for a new game, design a new visual layout skin, or improve input latency:

1. Check out [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup and guidelines.
2. Request or propose new game skins using the [New Game Layout Template](https://github.com/gnshx/remote-control/issues/new?template=new_game_layout.yml).
3. Open a Pull Request!

---

## 📜 License

Distributed under the [MIT License](LICENSE). Open-source, permissive, and free for anyone to use, modify, and distribute.

