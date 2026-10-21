/**
 * reverse/laptop-controller.js — Laptop-to-Phone Game Controller & Touch Keymapper
 * Captures laptop keyboard & mouse events, maps them to on-screen phone coordinates,
 * and streams touch gestures to the Android phone via Wireless ADB / WebSocket.
 */

'use strict';

// ─── Default Game Presets ───────────────────────────────────────────────────
const PRESETS = {
  shooter: {
    name: '🔫 Battle Royale / Shooter',
    pins: [
      { id: 'joy',   type: 'joystick', label: 'WASD', sub: 'MOVE', x: 22, y: 72, size: 130 },
      { id: 'fire',  type: 'action',   label: 'L-CLICK', sub: 'FIRE', key: 'MOUSE0', x: 84, y: 65, size: 68 },
      { id: 'aim',   type: 'aux',      label: 'R-CLICK', sub: 'SCOPE', key: 'MOUSE2', x: 74, y: 38, size: 56 },
      { id: 'jump',  type: 'jump',     label: 'SPACE', sub: 'JUMP', key: 'SPACE', x: 92, y: 76, size: 62 },
      { id: 'crouch',type: 'aux',      label: 'C', sub: 'CROUCH', key: 'C', x: 92, y: 56, size: 52 },
      { id: 'sprint',type: 'pedal',    label: 'SHIFT', sub: 'SPRINT', key: 'SHIFT', x: 22, y: 48, size: 52 },
      { id: 'reload',type: 'aux',      label: 'R', sub: 'RELOAD', key: 'R', x: 80, y: 48, size: 52 },
    ]
  },
  racing: {
    name: '🏎️ Mobile Racing (Asphalt / CarX)',
    pins: [
      { id: 'gas',   type: 'jump',     label: 'W / SPACE', sub: 'GAS', key: 'W', x: 88, y: 72, size: 76 },
      { id: 'brake', type: 'action',   label: 'S', sub: 'BRAKE', key: 'S', x: 72, y: 72, size: 68 },
      { id: 'left',  type: 'pedal',    label: 'A', sub: 'STEER L', key: 'A', x: 14, y: 72, size: 70 },
      { id: 'right', type: 'pedal',    label: 'D', sub: 'STEER R', key: 'D', x: 30, y: 72, size: 70 },
      { id: 'nitro', type: 'aux',      label: 'SHIFT', sub: 'NITRO', key: 'SHIFT', x: 88, y: 46, size: 58 },
      { id: 'drift', type: 'action',   label: 'E', sub: 'DRIFT', key: 'E', x: 72, y: 46, size: 58 },
    ]
  },
  minecraft: {
    name: '⛏️ Minecraft PE',
    pins: [
      { id: 'joy',   type: 'joystick', label: 'WASD', sub: 'WALK', x: 20, y: 70, size: 130 },
      { id: 'jump',  type: 'jump',     label: 'SPACE', sub: 'JUMP', key: 'SPACE', x: 90, y: 72, size: 68 },
      { id: 'mine',  type: 'action',   label: 'L-CLICK', sub: 'MINE', key: 'MOUSE0', x: 50, y: 50, size: 54 },
      { id: 'place', type: 'aux',      label: 'R-CLICK', sub: 'PLACE', key: 'MOUSE2', x: 62, y: 65, size: 54 },
    ]
  },
  runner: {
    name: '🛹 Endless Runner',
    pins: [
      { id: 'up',    type: 'jump',     label: 'W', sub: 'JUMP', key: 'W', x: 50, y: 35, size: 64 },
      { id: 'down',  type: 'action',   label: 'S', sub: 'ROLL', key: 'S', x: 50, y: 75, size: 64 },
      { id: 'left',  type: 'pedal',    label: 'A', sub: 'LEFT', key: 'A', x: 32, y: 55, size: 64 },
      { id: 'right', type: 'pedal',    label: 'D', sub: 'RIGHT', key: 'D', x: 68, y: 55, size: 64 },
    ]
  },
  platformer: {
    name: '🧭 Retro 2D Platformer',
    pins: [
      { id: 'joy',   type: 'joystick', label: 'WASD', sub: 'D-PAD', x: 20, y: 70, size: 120 },
      { id: 'a',     type: 'jump',     label: 'SPACE', sub: 'A (JUMP)', key: 'SPACE', x: 88, y: 75, size: 60 },
      { id: 'b',     type: 'action',   label: 'SHIFT', sub: 'B (RUN)', key: 'SHIFT', x: 76, y: 75, size: 60 },
      { id: 'x',     type: 'aux',      label: 'E', sub: 'X (SPECIAL)', key: 'E', x: 76, y: 55, size: 54 },
      { id: 'y',     type: 'pedal',    label: 'Q', sub: 'Y (ITEM)', key: 'Q', x: 88, y: 55, size: 54 },
    ]
  }
};

// ─── Studio Controller State ────────────────────────────────────────────────
const studio = {
  ws: null,
  connected: false,
  activePreset: 'shooter',
  pins: [],
  selectedPinId: null,
  activeDrag: null,
  screenWidth: 2400,
  screenHeight: 1080,
  joystickRadius: 140,
  tapDuration: 60,
  pressedKeys: new Set(),
  autoForward: false,
  turboFire: false,
  turboInterval: null,
  mouseLockActive: false,
  lastAimSwipe: 0,
};

// ─── DOM References ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  profileSelect:       $('profile-select'),
  connectionDot:       $('connection-dot'),
  connectionLabel:     $('connection-label'),
  latencyBadge:        $('latency-badge'),
  openConnectModalBtn: $('open-connect-modal-btn'),
  closeConnectModalBtn:$('close-connect-modal-btn'),
  connectModal:        $('connect-modal'),
  phoneScreen:         $('phone-screen'),
  pinsLayer:           $('pins-layer'),
  pinInspector:        $('pin-inspector'),
  inspectorName:       $('inspector-name'),
  inspectorKeyInput:   $('inspector-key-input'),
  inspectorSizeSlider: $('inspector-size-slider'),
  inspectorCoords:     $('inspector-coords'),
  inspectorDeleteBtn:  $('inspector-delete-btn'),
  addPinBtn:           $('add-pin-btn'),
  resetPinsBtn:        $('reset-pins-btn'),
  mouseLockBtn:        $('mouse-lock-btn'),
  aimCrosshair:        $('aim-crosshair'),
  resolutionSelect:    $('resolution-select'),
  joystickRadius:      $('joystick-radius'),
  joystickRadiusVal:   $('joystick-radius-val'),
  touchDuration:       $('touch-duration'),
  touchDurationVal:    $('touch-duration-val'),
  assistAutoGasBtn:    $('assist-autogas-btn'),
  assistTurboBtn:      $('assist-turbo-btn'),
  phoneIp:             $('phone-ip'),
  phonePort:           $('phone-port'),
  adbConnectBtn:       $('adb-connect-btn'),
  adbStatusMsg:        $('adb-status-msg'),
  detectUsbBtn:        $('detect-usb-btn'),
  usbDevicesList:      $('usb-devices-list'),
  receiverUrlDisplay:  $('receiver-url-display'),
  tabWirelessAdb:      $('tab-wireless-adb'),
  tabUsbAdb:           $('tab-usb-adb'),
  tabWebReceiver:      $('tab-web-receiver'),
  formWirelessAdb:     $('form-wireless-adb'),
  formUsbAdb:          $('form-usb-adb'),
  formWebReceiver:     $('form-web-receiver'),
  kbKeys: {
    W:     $('kb-w'),
    A:     $('kb-a'),
    S:     $('kb-s'),
    D:     $('kb-d'),
    SHIFT: $('kb-shift'),
    SPACE: $('kb-space'),
    C:     $('kb-c'),
    E:     $('kb-e'),
    R:     $('kb-r'),
    MOUSE0:$('kb-mouse-l'),
    MOUSE2:$('kb-mouse-r'),
  }
};

// ─── Toast System ────────────────────────────────────────────────────────────
function toast(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── WebSocket Connection ────────────────────────────────────────────────────
function connectWebSocket() {
  const wsPort = 8766; // Reverse server default port
  const host = window.location.hostname || '127.0.0.1';
  const url = `ws://${host}:${wsPort}`;

  try {
    studio.ws = new WebSocket(url);
  } catch (e) {
    console.warn("WebSocket init error", e);
    return;
  }

  studio.ws.onopen = () => {
    studio.connected = true;
    updateConnectionUI(true, 'WebSocket Ready');
    toast('⚡ Connected to Laptop Controller Server!');
    // Ping loop
    setInterval(() => {
      if (studio.ws && studio.ws.readyState === WebSocket.OPEN) {
        sendWs({ type: 'PING', ts: Date.now() });
      }
    }, 2000);
  };

  studio.ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleServerMsg(msg);
    } catch (_) {}
  };

  studio.ws.onclose = () => {
    studio.connected = false;
    updateConnectionUI(false, 'Disconnected');
    setTimeout(connectWebSocket, 3000);
  };
}

function sendWs(obj) {
  if (studio.ws && studio.ws.readyState === WebSocket.OPEN) {
    studio.ws.send(JSON.stringify(obj));
  }
}

function handleServerMsg(msg) {
  if (msg.type === 'PONG' && msg.ts) {
    const lat = Date.now() - msg.ts;
    DOM.latencyBadge.textContent = `${lat} ms`;
  }
  if (msg.type === 'STATUS' || msg.type === 'ADB_STATUS') {
    if (msg.success || msg.connected) {
      const label = msg.is_dry_run ? 'Phone Simulator' : (msg.device_model || 'Android Phone');
      updateConnectionUI(true, label, msg.is_dry_run);
      if (msg.screen_width && msg.screen_height) {
        studio.screenWidth = msg.screen_width;
        studio.screenHeight = msg.screen_height;
      }
      if (msg.message) toast(`📱 ${msg.message}`);
    } else {
      updateConnectionUI(false, 'Disconnected');
      if (msg.message && DOM.adbStatusMsg) {
        DOM.adbStatusMsg.textContent = msg.message;
        DOM.adbStatusMsg.classList.remove('hidden');
      }
    }
  }
  if (msg.type === 'DEVICES_LIST') {
    renderUsbDevices(msg.devices || []);
  }
}

function updateConnectionUI(connected, label, isSimulated = false) {
  if (connected) {
    DOM.connectionDot.className = isSimulated ? 'status-dot simulated' : 'status-dot connected';
    DOM.connectionLabel.textContent = label;
  } else {
    DOM.connectionDot.className = 'status-dot disconnected';
    DOM.connectionLabel.textContent = 'Disconnected';
    DOM.latencyBadge.textContent = '-- ms';
  }
}

// ─── Touch Pin Mapper Engine ─────────────────────────────────────────────────
function loadPreset(presetKey) {
  studio.activePreset = presetKey;
  const saved = localStorage.getItem(`reverse_pins_${presetKey}`);
  if (saved) {
    try {
      studio.pins = JSON.parse(saved);
    } catch (_) {
      studio.pins = JSON.parse(JSON.stringify(PRESETS[presetKey].pins));
    }
  } else if (PRESETS[presetKey]) {
    studio.pins = JSON.parse(JSON.stringify(PRESETS[presetKey].pins));
  }
  renderPins();
}

function savePins() {
  localStorage.setItem(`reverse_pins_${studio.activePreset}`, JSON.stringify(studio.pins));
}

function renderPins() {
  DOM.pinsLayer.innerHTML = '';
  studio.pins.forEach(pin => {
    const el = document.createElement('div');
    el.className = `touch-pin pin-${pin.type}`;
    el.id = `pin-${pin.id}`;
    el.dataset.pinId = pin.id;
    el.style.left = `${pin.x}%`;
    el.style.top = `${pin.y}%`;
    el.style.width = `${pin.size || 56}px`;
    el.style.height = `${pin.size || 56}px`;

    if (pin.type === 'joystick') {
      el.innerHTML = `
        <div class="joystick-thumb-indicator">WASD</div>
        <div class="pin-sub">STICK</div>
      `;
    } else {
      el.innerHTML = `
        <div class="pin-label">${pin.label}</div>
        <div class="pin-sub">${pin.sub}</div>
      `;
    }

    // Pointer events for dragging pins
    el.addEventListener('pointerdown', (e) => onPinDragStart(e, pin, el));
    DOM.pinsLayer.appendChild(el);
  });
}

function onPinDragStart(e, pin, el) {
  e.stopPropagation();
  selectPin(pin.id);

  el.setPointerCapture(e.pointerId);
  const rect = DOM.phoneScreen.getBoundingClientRect();

  studio.activeDrag = {
    pin,
    el,
    rect,
    pointerId: e.pointerId
  };

  el.classList.add('is-dragging');

  const onMove = (ev) => {
    if (!studio.activeDrag || ev.pointerId !== studio.activeDrag.pointerId) return;
    const relX = ((ev.clientX - studio.activeDrag.rect.left) / studio.activeDrag.rect.width) * 100;
    const relY = ((ev.clientY - studio.activeDrag.rect.top) / studio.activeDrag.rect.height) * 100;

    const clampedX = Math.max(4, Math.min(96, relX));
    const clampedY = Math.max(4, Math.min(96, relY));

    pin.x = Math.round(clampedX);
    pin.y = Math.round(clampedY);

    el.style.left = `${pin.x}%`;
    el.style.top = `${pin.y}%`;

    updateInspectorCoords(pin);
  };

  const onUp = (ev) => {
    if (!studio.activeDrag || ev.pointerId !== studio.activeDrag.pointerId) return;
    try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
    el.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    studio.activeDrag = null;
    savePins();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function selectPin(pinId) {
  studio.selectedPinId = pinId;
  const pin = studio.pins.find(p => p.id === pinId);
  if (!pin) return;

  DOM.pinInspector.classList.remove('hidden');
  DOM.inspectorName.textContent = `Pin: ${pin.label}`;
  DOM.inspectorKeyInput.value = pin.key || '';
  DOM.inspectorSizeSlider.value = pin.size || 56;
  updateInspectorCoords(pin);
}

function updateInspectorCoords(pin) {
  const pixelX = Math.round((pin.x / 100) * studio.screenWidth);
  const pixelY = Math.round((pin.y / 100) * studio.screenHeight);
  DOM.inspectorCoords.textContent = `X: ${pixelX}px (${pin.x}%) • Y: ${pixelY}px (${pin.y}%)`;
}

// ─── Keyboard & Mouse Input Capturing ────────────────────────────────────────
function setupInputCapturing() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup',   onMouseUp);

  // Prevent default context menu inside phone canvas
  DOM.phoneScreen.addEventListener('contextmenu', e => e.preventDefault());
}

function onKeyDown(e) {
  // Ignore inputs if user is typing into text fields
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

  let key = e.key.toUpperCase();
  if (key === ' ') key = 'SPACE';
  if (key === 'CONTROL') key = 'CTRL';

  if (studio.pressedKeys.has(key)) return;
  studio.pressedKeys.add(key);

  // Light up Keyboard HUD
  highlightKbKey(key, true);

  // Trigger mapped action
  triggerKeyAction(key);
}

function onKeyUp(e) {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

  let key = e.key.toUpperCase();
  if (key === ' ') key = 'SPACE';
  if (key === 'CONTROL') key = 'CTRL';

  studio.pressedKeys.delete(key);
  highlightKbKey(key, false);

  // Remove active highlight from mapped pin
  const pin = studio.pins.find(p => p.key === key);
  if (pin) {
    const el = document.getElementById(`pin-${pin.id}`);
    el?.classList.remove('is-active-key');
  }
}

function onMouseDown(e) {
  if (e.target.closest('.canvas-toolbar') || e.target.closest('.pin-inspector') || e.target.closest('.top-nav') || e.target.closest('.sidebar-panel')) return;

  const mouseKey = `MOUSE${e.button}`; // MOUSE0 = Left, MOUSE2 = Right
  highlightKbKey(mouseKey, true);
  triggerKeyAction(mouseKey);
}

function onMouseUp(e) {
  const mouseKey = `MOUSE${e.button}`;
  highlightKbKey(mouseKey, false);

  const pin = studio.pins.find(p => p.key === mouseKey);
  if (pin) {
    const el = document.getElementById(`pin-${pin.id}`);
    el?.classList.remove('is-active-key');
  }
}

function highlightKbKey(key, active) {
  const el = DOM.kbKeys[key];
  if (el) el.classList.toggle('pressed', active);
}

function triggerKeyAction(key) {
  // Check WASD analog stick movement
  if (['W', 'A', 'S', 'D'].includes(key)) {
    handleJoystickInput();
    return;
  }

  // Find pin mapped to this key
  const pin = studio.pins.find(p => p.key === key);
  if (!pin) return;

  const pinEl = document.getElementById(`pin-${pin.id}`);
  if (pinEl) {
    pinEl.classList.add('is-active-key');
  }

  // Calculate real device pixel coordinates
  const pixelX = Math.round((pin.x / 100) * studio.screenWidth);
  const pixelY = Math.round((pin.y / 100) * studio.screenHeight);

  sendWs({
    type: 'TAP',
    x: pixelX,
    y: pixelY,
    key
  });
}

function handleJoystickInput() {
  const joyPin = studio.pins.find(p => p.type === 'joystick');
  if (!joyPin) return;

  let dx = 0;
  let dy = 0;

  if (studio.pressedKeys.has('W') || studio.autoForward) dy -= 1;
  if (studio.pressedKeys.has('S')) dy += 1;
  if (studio.pressedKeys.has('A')) dx -= 1;
  if (studio.pressedKeys.has('D')) dx += 1;

  if (dx === 0 && dy === 0) return;

  // Normalize diagonal vector
  const len = Math.sqrt(dx * dx + dy * dy);
  const normX = dx / len;
  const normY = dy / len;

  const centerX = Math.round((joyPin.x / 100) * studio.screenWidth);
  const centerY = Math.round((joyPin.y / 100) * studio.screenHeight);

  sendWs({
    type: 'JOYSTICK_MOVE',
    center_x: centerX,
    center_y: centerY,
    dx: normX,
    dy: normY,
    radius: studio.joystickRadius
  });

  const pinEl = document.getElementById(`pin-${joyPin.id}`);
  if (pinEl) {
    pinEl.classList.add('is-active-key');
    setTimeout(() => pinEl.classList.remove('is-active-key'), 100);
  }
}

// ─── Mouse Pointer Lock (FPS Camera Aiming) ──────────────────────────────────
function setupMouseAiming() {
  DOM.mouseLockBtn?.addEventListener('click', () => {
    DOM.phoneScreen.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    studio.mouseLockActive = (document.pointerLockElement === DOM.phoneScreen);
    DOM.aimCrosshair.classList.toggle('hidden', !studio.mouseLockActive);
    DOM.mouseLockBtn.classList.toggle('active', studio.mouseLockActive);
    if (studio.mouseLockActive) {
      toast('🎯 Mouse Locked: Move mouse to aim camera (Press ESC to exit)');
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!studio.mouseLockActive) return;

    const now = Date.now();
    if (now - studio.lastAimSwipe < 50) return; // Throttle to 20 Hz
    studio.lastAimSwipe = now;

    const dx = e.movementX;
    const dy = e.movementY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

    // Send camera look swipe in right half of screen
    const centerX = Math.round(studio.screenWidth * 0.75);
    const centerY = Math.round(studio.screenHeight * 0.5);
    const targetX = Math.max(10, Math.min(studio.screenWidth - 10, centerX + (dx * 4)));
    const targetY = Math.max(10, Math.min(studio.screenHeight - 10, centerY + (dy * 4)));

    sendWs({
      type: 'SWIPE',
      x1: centerX,
      y1: centerY,
      x2: targetX,
      y2: targetY,
      duration: 60
    });
  });
}

// ─── Pro Assists ─────────────────────────────────────────────────────────────
function setupAssists() {
  DOM.assistAutoGasBtn?.addEventListener('click', () => {
    studio.autoForward = !studio.autoForward;
    DOM.assistAutoGasBtn.classList.toggle('active', studio.autoForward);
    toast(studio.autoForward ? '🚀 Auto-Forward ON' : '🛑 Auto-Forward OFF');
    if (studio.autoForward) handleJoystickInput();
  });

  DOM.assistTurboBtn?.addEventListener('click', () => {
    studio.turboFire = !studio.turboFire;
    DOM.assistTurboBtn.classList.toggle('active', studio.turboFire);
    if (studio.turboFire) {
      studio.turboInterval = setInterval(() => {
        triggerKeyAction('SPACE');
      }, 70); // ~14 Hz
      toast('⚡ Rapid Fire Turbo ON');
    } else {
      clearInterval(studio.turboInterval);
      toast('⚡ Rapid Fire Turbo OFF');
    }
  });
}

// ─── Modal & ADB Controls ───────────────────────────────────────────────────
function setupModals() {
  DOM.openConnectModalBtn?.addEventListener('click', () => {
    DOM.connectModal.classList.remove('hidden');
    // Pre-fill IP from local storage
    const savedIp = localStorage.getItem('last_phone_ip') || '';
    if (savedIp) DOM.phoneIp.value = savedIp;
  });

  DOM.closeConnectModalBtn?.addEventListener('click', () => {
    DOM.connectModal.classList.add('hidden');
  });

  // Modal tabs
  DOM.tabWirelessAdb?.addEventListener('click', () => switchModalTab('wireless'));
  DOM.tabUsbAdb?.addEventListener('click', () => switchModalTab('usb'));
  DOM.tabWebReceiver?.addEventListener('click', () => switchModalTab('web'));

  // Connect Wireless ADB
  DOM.adbConnectBtn?.addEventListener('click', () => {
    const ip = DOM.phoneIp.value.trim();
    const port = DOM.phonePort.value.trim() || 5555;
    if (!ip) {
      alert("Please enter your phone's IP address.");
      return;
    }
    localStorage.setItem('last_phone_ip', ip);

    DOM.adbStatusMsg.textContent = 'Connecting via Wireless ADB...';
    DOM.adbStatusMsg.classList.remove('hidden');

    sendWs({
      type: 'ADB_CONNECT',
      host: ip,
      port: port
    });
  });

  // Auto-Detect USB
  DOM.detectUsbBtn?.addEventListener('click', () => {
    sendWs({ type: 'ADB_DETECT' });
  });
}

function switchModalTab(tab) {
  DOM.tabWirelessAdb.classList.toggle('active', tab === 'wireless');
  DOM.tabUsbAdb.classList.toggle('active', tab === 'usb');
  DOM.tabWebReceiver.classList.toggle('active', tab === 'web');

  DOM.formWirelessAdb.classList.toggle('hidden', tab !== 'wireless');
  DOM.formUsbAdb.classList.toggle('hidden', tab !== 'usb');
  DOM.formWebReceiver.classList.toggle('hidden', tab !== 'web');
}

function renderUsbDevices(devices) {
  if (!DOM.usbDevicesList) return;
  DOM.usbDevicesList.innerHTML = '';
  if (devices.length === 0) {
    DOM.usbDevicesList.innerHTML = '<p class="card-desc">No USB devices detected. Connect cable & allow USB debugging.</p>';
    return;
  }
  devices.forEach(d => {
    const div = document.createElement('div');
    div.className = 'usb-device-item';
    div.innerHTML = `<span>📱 ${d.model} (${d.serial})</span><button class="btn-primary-glow btn-sm">Use</button>`;
    div.querySelector('button').addEventListener('click', () => {
      sendWs({ type: 'ADB_CONNECT', host: d.serial, port: 0 });
      DOM.connectModal.classList.add('hidden');
    });
    DOM.usbDevicesList.appendChild(div);
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
  loadPreset('shooter');

  DOM.profileSelect?.addEventListener('change', (e) => {
    loadPreset(e.target.value);
    toast(`Switched to: ${PRESETS[e.target.value]?.name}`);
  });

  DOM.resetPinsBtn?.addEventListener('click', () => {
    localStorage.removeItem(`reverse_pins_${studio.activePreset}`);
    loadPreset(studio.activePreset);
    toast('↺ Reset layout to default');
  });

  DOM.addPinBtn?.addEventListener('click', () => {
    const newId = `custom_${Date.now()}`;
    studio.pins.push({
      id: newId,
      type: 'aux',
      label: 'NEW',
      sub: 'TAP',
      key: 'F',
      x: 50,
      y: 50,
      size: 56
    });
    renderPins();
    selectPin(newId);
    savePins();
    toast('➕ Added new touch pin at screen center');
  });

  // Pin inspector controls
  DOM.inspectorKeyInput?.addEventListener('input', (e) => {
    const pin = studio.pins.find(p => p.id === studio.selectedPinId);
    if (pin) {
      pin.key = e.target.value.toUpperCase();
      pin.label = pin.key;
      renderPins();
      savePins();
    }
  });

  DOM.inspectorSizeSlider?.addEventListener('input', (e) => {
    const pin = studio.pins.find(p => p.id === studio.selectedPinId);
    if (pin) {
      pin.size = parseInt(e.target.value, 10);
      renderPins();
      savePins();
    }
  });

  DOM.inspectorDeleteBtn?.addEventListener('click', () => {
    studio.pins = studio.pins.filter(p => p.id !== studio.selectedPinId);
    DOM.pinInspector.classList.add('hidden');
    renderPins();
    savePins();
    toast('🗑️ Deleted touch pin');
  });

  // Resolution selector
  DOM.resolutionSelect?.addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    studio.screenWidth = w;
    studio.screenHeight = h;
    toast(`Resolution calibrated: ${w} × ${h}`);
  });

  // Calibration sliders
  DOM.joystickRadius?.addEventListener('input', (e) => {
    studio.joystickRadius = parseInt(e.target.value, 10);
    DOM.joystickRadiusVal.textContent = `${studio.joystickRadius}px`;
  });

  DOM.touchDuration?.addEventListener('input', (e) => {
    studio.tapDuration = parseInt(e.target.value, 10);
    DOM.touchDurationVal.textContent = `${studio.tapDuration}ms`;
  });

  setupInputCapturing();
  setupMouseAiming();
  setupAssists();
  setupModals();
  connectWebSocket();

  // Web receiver URL display
  if (DOM.receiverUrlDisplay) {
    const host = window.location.host;
    DOM.receiverUrlDisplay.textContent = `http://${host}/reverse/phone-receiver.html`;
  }
}

document.addEventListener('DOMContentLoaded', init);
