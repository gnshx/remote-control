# Phone-to-Laptop Game Controller Protocol Specification 🎮

## 1. Overview

The communication protocol defines the message exchange between the **Mobile Controller Client** (running in Chrome on Android) and the **Laptop Input Agent** (running on Ubuntu).

- **Transports Supported**:
  1. **WebSocket** over local Wi-Fi (recommended default for minimum jitter & zero configuration).
  2. **Bluetooth Low Energy (BLE)** via custom GATT service (Web Bluetooth API on mobile).
- **Encoding**: UTF-8 JSON.
- **Direction**: Bidirectional (Phone $\leftrightarrow$ Laptop).

---

## 2. Message Format

Every message is a JSON object with at least a `type` and an integer sequence number `seq`.

### Sequence Numbering (`seq`)
- Incremented monotonically with each transmission from client to server.
- Out-of-order or duplicate messages with `seq <= last_received_seq` are discarded to prevent input stuttering.

---

## 3. Client $\rightarrow$ Server Messages

### 3.1 `HELLO`
Sent immediately upon connection establishment to identify the client and active profile.

```json
{
  "type": "HELLO",
  "seq": 1,
  "profile": "smash_karts",
  "client": "chrome-android-gamepad",
  "version": "1.0"
}
```

### 3.2 `STATE`
Sent on every joystick movement, button press, or button release. Also sent periodically (20 Hz) while any control remains engaged.

```json
{
  "type": "STATE",
  "seq": 104,
  "keys": ["W", "D", "SPACE"],
  "ts": 1718900000123
}
```

- `keys`: Array of normalized protocol key names currently held down (e.g. `["W", "A", "SPACE"]`).
- When the joystick returns to neutral and all buttons are released:
  ```json
  {
    "type": "STATE",
    "seq": 105,
    "keys": [],
    "ts": 1718900000140
  }
  ```

### 3.3 `TAP`
Generated when a button configured in `tap` mode is pressed. Directs the laptop agent to simulate an instantaneous press and release.

```json
{
  "type": "TAP",
  "seq": 106,
  "key": "E",
  "duration_ms": 50
}
```

### 3.4 `PING`
Sent every 2000 ms to monitor connection health and measure round-trip latency.

```json
{
  "type": "PING",
  "seq": 107,
  "ts": 1718900000200
}
```

### 3.5 `RESET`
Instructs the laptop agent to immediately release all currently held keys and reset internal key tracking.

```json
{
  "type": "RESET",
  "seq": 108
}
```

---

## 4. Server $\rightarrow$ Client Messages

### 4.1 `STATUS`
Acknowledges session state or reports server configuration.

```json
{
  "type": "STATUS",
  "status": "ready",
  "profile": "smash_karts",
  "info": "Connected (X11 / pynput)"
}
```

### 4.2 `PONG`
Responds to a client `PING`. Echoes client sequence number and adds server timestamp.

```json
{
  "type": "PONG",
  "seq": 107,
  "ts": 1718900000202
}
```

---

## 5. Bluetooth LE GATT Specification

When utilizing Bluetooth Low Energy:

| Service / Characteristic | UUID | Properties | Description |
|---|---|---|---|
| **Controller Service** | `0000ffe0-0000-1000-8000-00805f9b34fb` | Primary Service | Custom GamePad Service |
| **State Characteristic** | `0000ffe1-0000-1000-8000-00805f9b34fb` | `WriteWithoutResponse`, `Write` | Receives JSON / binary state payloads |
| **Status Characteristic** | `0000ffe2-0000-1000-8000-00805f9b34fb` | `Read`, `Notify` | Sends connection status & latency pongs |

---

## 6. Safety & Reliability Watchdog

To prevent a vehicle in Smash Karts from driving forever in a circle if the phone screen turns off or the connection drops:
1. **Watchdog Timer**: The laptop maintains a 5.0-second timer.
2. If no valid message (`STATE`, `PING`, etc.) arrives within 5.0 seconds, the agent executes `release_all()` immediately.
3. On connection termination (`onclose`), `release_all()` is executed synchronously.
