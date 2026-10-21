/**
 * controller.js — Main controller application
 * Wires together: UI, joystick, key mapping, WebSocket transport
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────
const RECONNECT_DELAY   = 3000;   // ms between reconnect attempts
const PING_INTERVAL     = 2000;   // ms between pings
const WATCHDOG_TIMEOUT  = 5000;   // ms before considering connection dead
const STATE_INTERVAL    = 50;     // ms — send state while buttons held (20 Hz)

// ─── App State ───────────────────────────────────────────────────────────────
const app = {
  ws:               null,
  ble:              null,
  transportMode:    'ws',         // 'ws' | 'ble'
  connected:        false,
  isOfflinePreview: false,
  seq:              0,
  pingTimer:        null,
  pingTimestamp:    0,
  latency:          null,
  watchdogTimer:    null,
  stateTimer:       null,
  pressedKeys:      new Set(),    // current logical key set
  joystickDirs:     new Set(),    // up/down/left/right from joystick
  buttonKeys:       new Set(),    // keys from action buttons
  hapticEnabled:    true,
  mappingManager:   null,
  joystick:         null,
  pendingProfile:   null,         // profile selected in mapping screen
  cruiseControl:    false,        // auto-accelerate toggle
  turboMode:        false,        // rapid fire toggle
  turboSpeed:       15,           // Hz: 8, 15, 22
  turboPulse:       true,
  turboInterval:    null,
  autoHoldMode:     false,        // when true, single tap locks any button held down
  autoHoldControls: new Map(),    // control -> { key, el }
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  connectScreen:     $('connect-screen'),
  controllerScreen:  $('controller-screen'),
  mappingScreen:     $('mapping-screen'),
  layoutSelect:      $('layout-select'),
  tabWs:             $('tab-ws'),
  tabBle:            $('tab-ble'),
  wsForm:            $('ws-form'),
  bleForm:           $('ble-form'),
  bleConnectBtn:     $('ble-connect-btn'),
  bleError:          $('ble-error'),
  serverIp:          $('server-ip'),
  serverPort:        $('server-port'),
  connectBtn:        $('connect-btn'),
  previewBtn:        $('preview-btn'),
  connectError:      $('connect-error'),
  connectBtnText:    document.querySelector('#connect-btn .btn-text'),
  connectBtnLoader:  document.querySelector('#connect-btn .btn-loader'),
  connectionDot:     $('connection-dot'),
  connectionLabel:   $('connection-label'),
  quickConnectBtn:   $('quick-connect-btn'),
  latencyDisplay:    $('latency-display'),
  profileNameDisplay:$('profile-name-display'),
  seqNum:            $('seq-num'),
  joystickBase:      $('joystick-base'),
  joystickThumb:     $('joystick-thumb'),
  disconnectBtn:     $('disconnect-btn'),
  settingsBtn:       $('settings-btn'),
  resetBtn:          $('reset-btn'),
  vibrateBtn:        $('vibrate-btn'),
  cruiseBtn:         $('cruise-btn'),
  turboBtn:          $('turbo-btn'),
  autolockBtn:       $('autolock-btn'),
  editHudBtn:        $('edit-hud-btn'),
  hudCruise:         $('hud-cruise'),
  hudTurbo:          $('hud-turbo'),
  hudAutohold:       $('hud-autohold'),
  hudLockedContainer:$('hud-locked-container'),
  openMappingBtn:    $('open-mapping-btn'),
  mappingBackBtn:    $('mapping-back-btn'),
  saveMappingBtn:    $('save-mapping-btn'),
  resetDefaultsBtn:  $('reset-defaults-btn'),
  testMappingBtn:    $('test-mapping-btn'),
  mappingTbody:      $('mapping-tbody'),
  activeProfileMini: $('active-profile-mini'),
  tabBtns:           document.querySelectorAll('.tab-btn'),
  hudKeys: {
    W:     $('hud-w'),
    A:     $('hud-a'),
    S:     $('hud-s'),
    D:     $('hud-d'),
    SPACE: $('hud-space'),
    E:     $('hud-e'),
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '', duration = 2500) {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ─── Haptic ───────────────────────────────────────────────────────────────────
function vibrate(pattern = [20]) {
  if (app.hapticEnabled && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// ─── Screen Navigation ────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ─── Multi-Transport: WebSocket & Bluetooth LE ──────────────────────────────
function connectWs() {
  let ip = DOM.serverIp.value.trim();
  let port = DOM.serverPort.value.trim() || '8765';

  // Sanitize IP address (strip http://, ws://, trailing slash, path, extra colons)
  ip = ip.replace(/^(https?|wss?):\/\//i, '').replace(/\/.*$/, '').trim();
  if (ip.includes(':')) {
    const parts = ip.split(':');
    ip = parts[0];
    if (parts[1]) {
      port = parts[1];
      DOM.serverPort.value = port;
    }
  }

  if (!ip && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    ip = window.location.hostname;
    DOM.serverIp.value = ip;
  }

  if (!ip) {
    showError('Please enter the laptop IP address (e.g. 192.168.1.10). Or tap "Preview Offline" to test controls!');
    return;
  }

  const url = `ws://${ip}:${port}`;

  DOM.connectBtnText.classList.add('hidden');
  DOM.connectBtnLoader.classList.remove('hidden');
  DOM.connectBtn.disabled = true;
  hideError();

  localStorage.setItem('lastIp',   ip);
  localStorage.setItem('lastPort', port);

  // Connection timeout failsafe
  const connectTimeout = setTimeout(() => {
    if (!app.connected && app.ws && app.ws.readyState !== WebSocket.OPEN) {
      try { app.ws.close(); } catch (_) {}
      showError(`Connection timed out (${ip}:${port}). Verify phone and laptop are on same Wi-Fi. (Tip: Try "Preview Offline" below!)`);
      resetConnectBtn();
    }
  }, 6000);

  try {
    app.ws = new WebSocket(url);
    app.transportMode = 'ws';
  } catch (e) {
    clearTimeout(connectTimeout);
    showError(`Invalid address: ${e.message}`);
    resetConnectBtn();
    return;
  }

  app.ws.onopen = () => {
    clearTimeout(connectTimeout);
    app.connected = true;
    app.isOfflinePreview = false;
    resetConnectBtn();

    send({ type: 'HELLO', profile: app.mappingManager.activeProfileId, seq: ++app.seq });

    showScreen('controller-screen');
    setConnectionUI(true, 'Connected (Wi-Fi)');
    startPing();
    startStateLoop();

    toast('🎮 Connected via Wi-Fi!', 'success');
    vibrate([30, 30, 60]);
  };

  app.ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleServerMessage(msg);
    } catch (e) { /* ignore bad JSON */ }
  };

  app.ws.onerror = () => {
    clearTimeout(connectTimeout);
    showError(`Connection failed to ${ip}:${port}. Make sure laptop agent is running.`);
    resetConnectBtn();
  };

  app.ws.onclose = () => {
    clearTimeout(connectTimeout);
    if (app.connected) {
      app.connected = false;
      setConnectionUI(false);
      stopPing();
      releaseAllKeys();
      toast('Disconnected', 'error');
      vibrate([100, 50, 100]);
    }
    resetConnectBtn();
  };
}

async function connectBle() {
  const btn = DOM.bleConnectBtn;
  const errEl = DOM.bleError;
  errEl.classList.add('hidden');

  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Searching...';
  btn.querySelector('.btn-loader').classList.remove('hidden');

  try {
    if (!window.BluetoothTransport || !BluetoothTransport.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Android or Wi-Fi mode.');
    }

    app.ble = new BluetoothTransport({
      onStatusChange: (status, msg) => {
        if (status === 'connected') {
          app.connected = true;
          app.transportMode = 'ble';
          showScreen('controller-screen');
          setConnectionUI(true, 'Connected (BLE)');
          startStateLoop();
          toast('🎮 Connected via Bluetooth!', 'success');
          vibrate([30, 30, 60]);
        } else if (status === 'disconnected') {
          app.connected = false;
          setConnectionUI(false);
          stopStateLoop();
          releaseAllKeys();
          toast('Bluetooth Disconnected', 'error');
          vibrate([100, 50, 100]);
        }
      },
      onMessage: (msg) => {
        handleServerMessage(msg);
      },
      onError: (err) => {
        errEl.textContent = err.message || 'Bluetooth connection failed';
        errEl.classList.remove('hidden');
      }
    });

    await app.ble.connect();
    send({ type: 'HELLO', profile: app.mappingManager.activeProfileId, seq: ++app.seq });

  } catch (err) {
    errEl.textContent = err.message || 'Bluetooth pair failed';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'ᛒ Pair Bluetooth Controller';
    btn.querySelector('.btn-loader').classList.add('hidden');
  }
}

function disconnect() {
  if (app.transportMode === 'ws' && app.ws) {
    send({ type: 'RESET', seq: ++app.seq });
    setTimeout(() => { app.ws?.close(); }, 100);
  } else if (app.transportMode === 'ble' && app.ble) {
    app.ble.disconnect();
  }
  app.connected = false;
  app.isOfflinePreview = false;
  stopPing();
  stopStateLoop();
  releaseAllKeys();
  setConnectionUI(false);
  showScreen('connect-screen');
}

function startOfflinePreview() {
  app.connected = false;
  app.isOfflinePreview = true;
  showScreen('controller-screen');
  setConnectionUI(false, 'Offline Preview');
  startStateLoop();
  toast('🎮 Offline Mode: Test controls, auto-press & customize HUD sizes!', 'success', 3500);
  vibrate([30, 20]);
}

function send(obj) {
  if (app.transportMode === 'ws' && app.ws?.readyState === WebSocket.OPEN) {
    try { app.ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  } else if (app.transportMode === 'ble' && app.ble?.connected) {
    try { app.ble.send(obj); } catch (e) { /* ignore */ }
  }
}

function handleServerMessage(msg) {
  resetWatchdog();
  if (msg.type === 'PONG' && app.pingTimestamp) {
    const lat = Date.now() - app.pingTimestamp;
    app.latency = lat;
    DOM.latencyDisplay.textContent = `${lat}ms`;
    app.pingTimestamp = 0;
  }
  if (msg.type === 'STATUS') {
    // Update connection label with server info if provided
    if (msg.info) DOM.connectionLabel.textContent = msg.info;
  }
}

// ─── Ping / Watchdog ─────────────────────────────────────────────────────────
function startPing() {
  app.pingTimer = setInterval(() => {
    app.pingTimestamp = Date.now();
    send({ type: 'PING', seq: ++app.seq });
  }, PING_INTERVAL);
  resetWatchdog();
}

function stopPing() {
  clearInterval(app.pingTimer);
  clearTimeout(app.watchdogTimer);
  app.pingTimer    = null;
  app.watchdogTimer = null;
}

function resetWatchdog() {
  clearTimeout(app.watchdogTimer);
  app.watchdogTimer = setTimeout(() => {
    if (app.connected) {
      toast('⚠️ Connection unstable', 'error', 2000);
    }
  }, WATCHDOG_TIMEOUT);
}

// ─── State Loop ───────────────────────────────────────────────────────────────
function startStateLoop() {
  app.stateTimer = setInterval(() => {
    if (app.connected) sendCurrentState();
  }, STATE_INTERVAL);
}

function stopStateLoop() {
  clearInterval(app.stateTimer);
  app.stateTimer = null;
}

// ─── Key State Management & Pro Assists ───────────────────────────────────────
function buildCurrentKeys() {
  const mapping = app.mappingManager?.activeMapping;
  if (!mapping) return new Set();
  const keys = new Set();

  // 1. Cruise Control: Auto-Gas forward
  if (app.cruiseControl && mapping.move_up?.key) {
    keys.add(mapping.move_up.key);
  }

  // 2. Joystick → keys
  if (app.joystickDirs.has('up'))    keys.add(mapping.move_up?.key);
  if (app.joystickDirs.has('down'))  keys.add(mapping.move_down?.key);
  if (app.joystickDirs.has('left'))  keys.add(mapping.move_left?.key);
  if (app.joystickDirs.has('right')) keys.add(mapping.move_right?.key);

  // 3. Button keys (with Rapid-Fire Turbo pulsing)
  for (const k of app.buttonKeys) {
    const isActionKey = (k === mapping.fire?.key || k === mapping.special?.key || k === mapping.item?.key);
    if (app.turboMode && isActionKey) {
      if (app.turboPulse) keys.add(k);
    } else {
      keys.add(k);
    }
  }

  // Remove null/undefined
  keys.delete(undefined);
  keys.delete(null);

  return keys;
}

function startTurboPulse() {
  stopTurboPulse();
  const speed = app.turboSpeed || 15;
  const intervalMs = Math.round(1000 / speed);
  app.turboInterval = setInterval(() => {
    if (app.turboMode && (app.buttonKeys.size > 0 || app.autoHoldControls.size > 0)) {
      app.turboPulse = !app.turboPulse;
      sendCurrentState();
    }
  }, intervalMs);
}

function stopTurboPulse() {
  if (app.turboInterval) {
    clearInterval(app.turboInterval);
    app.turboInterval = null;
  }
  app.turboPulse = true;
}

function toggleCruiseControl(forceState) {
  const newState = forceState !== undefined ? forceState : !app.cruiseControl;
  app.cruiseControl = newState;

  if (DOM.cruiseBtn) {
    DOM.cruiseBtn.textContent = app.cruiseControl ? '🚀 Auto-Gas: ON' : '🚀 Auto-Gas: OFF';
    DOM.cruiseBtn.classList.toggle('active-cruise', app.cruiseControl);
  }
  if (DOM.hudCruise) {
    DOM.hudCruise.classList.toggle('hidden', !app.cruiseControl);
    DOM.hudCruise.classList.toggle('active', app.cruiseControl);
  }

  if (app.cruiseControl) {
    toast('🚀 Auto-Gas ON (Continuous Throttle)', 'success');
    vibrate([30, 20, 30]);
  } else if (forceState === undefined) {
    toast('🛑 Auto-Gas OFF');
    vibrate([15]);
  }

  sendCurrentState();
}

function toggleTurboMode(forceState) {
  // If forceState is boolean, apply it. Otherwise cycle: OFF -> 15Hz -> 22Hz -> 8Hz -> OFF
  if (typeof forceState === 'boolean') {
    app.turboMode = forceState;
  } else {
    if (!app.turboMode) {
      app.turboMode = true;
      app.turboSpeed = 15;
    } else if (app.turboSpeed === 15) {
      app.turboSpeed = 22;
    } else if (app.turboSpeed === 22) {
      app.turboSpeed = 8;
    } else {
      app.turboMode = false;
    }
  }

  if (DOM.turboBtn) {
    DOM.turboBtn.textContent = app.turboMode ? `⚡ Turbo: ${app.turboSpeed}Hz` : '⚡ Turbo: OFF';
    DOM.turboBtn.classList.toggle('active-turbo', app.turboMode);
  }
  if (DOM.hudTurbo) {
    DOM.hudTurbo.textContent = `⚡ TURBO (${app.turboSpeed}Hz)`;
    DOM.hudTurbo.classList.toggle('hidden', !app.turboMode);
    DOM.hudTurbo.classList.toggle('active', app.turboMode);
  }

  if (app.turboMode) {
    startTurboPulse();
    toast(`⚡ Rapid Fire Turbo: ${app.turboSpeed} Hz`, 'success');
    vibrate([20, 20, 20]);
  } else {
    stopTurboPulse();
    if (forceState === undefined) toast('⚡ Turbo Mode OFF');
    vibrate([15]);
  }

  sendCurrentState();
}

function toggleAutoHoldMode(forceState) {
  app.autoHoldMode = forceState !== undefined ? forceState : !app.autoHoldMode;
  if (DOM.autolockBtn) {
    DOM.autolockBtn.textContent = app.autoHoldMode ? '🔒 Auto-Hold: ON' : '🔒 Auto-Hold: OFF';
    DOM.autolockBtn.classList.toggle('active-autolock', app.autoHoldMode);
  }
  if (DOM.hudAutohold) {
    DOM.hudAutohold.classList.toggle('hidden', !app.autoHoldMode);
    DOM.hudAutohold.classList.toggle('active', app.autoHoldMode);
  }

  if (app.autoHoldMode) {
    toast('🔒 Auto-Hold ON: Tap any button to lock hold', 'success');
    vibrate([30, 20, 30]);
  } else {
    toast('🔒 Auto-Hold Mode OFF (Tap locked button to release)');
    vibrate([15]);
  }
}

function toggleControlAutoLock(control, el) {
  const mapping = app.mappingManager?.activeMapping;
  if (!mapping) return;
  const key = mapping[control]?.key;
  if (!key) return;

  if (app.autoHoldControls.has(control)) {
    // Unlock
    app.autoHoldControls.delete(control);
    el?.classList.remove('is-autolocked', 'pressed');
    app.buttonKeys.delete(key);
    toast(`🔓 Released: ${control.toUpperCase()}`);
    vibrate([15]);
  } else {
    // Lock
    app.autoHoldControls.set(control, { key, el });
    el?.classList.add('is-autolocked', 'pressed');
    app.buttonKeys.add(key);
    toast(`🔒 Auto-Locked: ${control.toUpperCase()} (${key})`, 'success');
    vibrate([35, 20, 35]);
  }
  updateLockedHUD();
  sendCurrentState();
}

function updateLockedHUD() {
  if (!DOM.hudLockedContainer) return;
  DOM.hudLockedContainer.innerHTML = '';
  app.autoHoldControls.forEach((item, ctrl) => {
    const pill = document.createElement('span');
    pill.className = 'hud-locked-pill';
    pill.textContent = `🔒 ${item.key} ×`;
    pill.title = 'Tap to unlock';
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleControlAutoLock(ctrl, item.el);
    });
    DOM.hudLockedContainer.appendChild(pill);
  });
}

window.toggleCruiseControl = toggleCruiseControl;
window.toggleTurboMode = toggleTurboMode;
window.toggleAutoHoldMode = toggleAutoHoldMode;
window.toggleControlAutoLock = toggleControlAutoLock;

function sendCurrentState() {
  const keys = buildCurrentKeys();
  app.pressedKeys = keys;
  updateHUD(keys);

  send({
    type: 'STATE',
    seq:  ++app.seq,
    keys: [...keys],
    ts:   Date.now(),
  });

  if (DOM.seqNum) DOM.seqNum.textContent = app.seq;
}

function releaseAllKeys() {
  app.joystickDirs.clear();
  app.buttonKeys.clear();
  app.pressedKeys.clear();

  // Clear all auto-locks
  app.autoHoldControls.forEach(item => {
    item.el?.classList.remove('is-autolocked', 'pressed');
  });
  app.autoHoldControls.clear();
  updateLockedHUD();

  if (app.cruiseControl) toggleCruiseControl(false);

  // Remove pressed state from all action buttons
  document.querySelectorAll('.action-btn, .pedal, .steer-btn, .dpad-dir, .diamond-btn, .big-action-btn, .big-steer-btn, .race-aux-btn')
    .forEach(b => b.classList.remove('pressed', 'is-autolocked'));

  updateHUD(new Set());
  send({ type: 'RESET', seq: ++app.seq });
}

// ─── HUD update ───────────────────────────────────────────────────────────────
function updateHUD(keys) {
  const mapping = app.mappingManager?.activeMapping;
  if (!mapping) return;

  // Map key → HUD element
  const keyToHud = {
    [mapping.move_up?.key]:    DOM.hudKeys?.W,
    [mapping.move_left?.key]:  DOM.hudKeys?.A,
    [mapping.move_down?.key]:  DOM.hudKeys?.S,
    [mapping.move_right?.key]: DOM.hudKeys?.D,
    [mapping.fire?.key]:       DOM.hudKeys?.SPACE,
    [mapping.special?.key]:    DOM.hudKeys?.E,
  };

  // Update labels to match current mapping
  if (DOM.hudKeys?.W)     DOM.hudKeys.W.textContent     = mapping.move_up?.key     || 'W';
  if (DOM.hudKeys?.A)     DOM.hudKeys.A.textContent     = mapping.move_left?.key   || 'A';
  if (DOM.hudKeys?.S)     DOM.hudKeys.S.textContent     = mapping.move_down?.key   || 'S';
  if (DOM.hudKeys?.D)     DOM.hudKeys.D.textContent     = mapping.move_right?.key  || 'D';
  if (DOM.hudKeys?.SPACE) DOM.hudKeys.SPACE.textContent = mapping.fire?.key        || 'SPC';
  if (DOM.hudKeys?.E)     DOM.hudKeys.E.textContent     = mapping.special?.key     || 'E';

  // Activate/deactivate
  for (const [key, el] of Object.entries(keyToHud)) {
    if (el) el.classList.toggle('active', keys?.has(key));
  }
}

// ─── Connection UI ────────────────────────────────────────────────────────────
function setConnectionUI(connected, label) {
  if (connected) {
    if (DOM.connectionDot)   DOM.connectionDot.className     = 'status-dot connected';
    if (DOM.connectionLabel) DOM.connectionLabel.textContent = label || 'Connected';
    DOM.quickConnectBtn?.classList.add('hidden');
  } else if (app.isOfflinePreview) {
    if (DOM.connectionDot)   DOM.connectionDot.className     = 'status-dot test-mode';
    if (DOM.connectionLabel) DOM.connectionLabel.textContent = 'Preview (Offline)';
    DOM.quickConnectBtn?.classList.remove('hidden');
    if (DOM.latencyDisplay)  DOM.latencyDisplay.textContent  = '0 ms';
  } else {
    if (DOM.connectionDot)   DOM.connectionDot.className     = 'status-dot disconnected';
    if (DOM.connectionLabel) DOM.connectionLabel.textContent = 'Disconnected';
    DOM.quickConnectBtn?.classList.add('hidden');
    if (DOM.latencyDisplay)  DOM.latencyDisplay.textContent  = '-- ms';
  }
}

function showError(msg) {
  if (DOM.connectError) {
    DOM.connectError.textContent = msg;
    DOM.connectError.classList.remove('hidden');
  }
}
function hideError() {
  DOM.connectError?.classList.add('hidden');
}
function resetConnectBtn() {
  DOM.connectBtnText?.classList.remove('hidden');
  DOM.connectBtnLoader?.classList.add('hidden');
  if (DOM.connectBtn) DOM.connectBtn.disabled = false;
}

// ─── Layout Switcher ──────────────────────────────────────────────────────────
function setupLayoutSwitcher() {
  const savedLayout = localStorage.getItem('activeLayout') || 'action';
  switchLayout(savedLayout, false);

  DOM.layoutSelect?.addEventListener('change', () => {
    switchLayout(DOM.layoutSelect.value, true);
  });
}

function switchLayout(layoutId, notify = true) {
  document.querySelectorAll('.controller-layout').forEach(l => l.classList.remove('active'));
  const target = $(`layout-${layoutId}`);
  if (target) {
    target.classList.add('active');
    localStorage.setItem('activeLayout', layoutId);
    if (DOM.layoutSelect) DOM.layoutSelect.value = layoutId;

    // Apply custom positions and scales for this layout
    window.hudCustomizer?.setActiveLayout(layoutId);

    // Release all keys when switching layouts so nothing gets stuck
    if (app.connected) {
      releaseAllKeys();
    }

    const titles = {
      action:  '🎮 Smash Karts / Action',
      racing:  '🏎️ Racing Cockpit (Pedals)',
      dpad:    '🧭 Retro 4-Way D-Pad',
      minimal: '🚗 Simple Steer & Pedals'
    };
    if (notify) {
      toast(`Switched: ${titles[layoutId] || layoutId}`);
      vibrate([25, 25]);
    }
  }
}

// ─── Action Buttons & Touch Controls ──────────────────────────────────────────
function setupActionButtons() {
  const btns = [
    // Layout 1: Smash Karts / Action
    { el: $('btn-fire'),        control: 'fire'       },
    { el: $('btn-e'),           control: 'special'    },
    { el: $('btn-q'),           control: 'item'       },
    { el: $('btn-shift'),       control: 'brake'      },

    // Layout 2: Racing Cockpit (Pedals + Steer)
    { el: $('btn-pedal-gas'),   control: 'move_up'    },
    { el: $('btn-pedal-brake'), control: 'move_down'  },
    { el: $('btn-race-left'),   control: 'move_left'  },
    { el: $('btn-race-right'),  control: 'move_right' },
    { el: $('btn-race-drift'),  control: 'brake'      },
    { el: $('btn-race-nitro'),  control: 'fire'       },

    // Layout 3: Retro 4-Way D-Pad
    { el: $('dpad-up'),         control: 'move_up'    },
    { el: $('dpad-down'),       control: 'move_down'  },
    { el: $('dpad-left'),       control: 'move_left'  },
    { el: $('dpad-right'),      control: 'move_right' },
    { el: $('btn-diamond-b'),   control: 'fire'       },
    { el: $('btn-diamond-a'),   control: 'brake'      },
    { el: $('btn-diamond-x'),   control: 'item'       },
    { el: $('btn-diamond-y'),   control: 'special'    },

    // Layout 4: Simple Steer & Pedals
    { el: $('btn-min-left'),    control: 'move_left'  },
    { el: $('btn-min-right'),   control: 'move_right' },
    { el: $('btn-min-gas'),     control: 'move_up'    },
    { el: $('btn-min-brake'),   control: 'move_down'  },
  ];

  btns.forEach(({ el, control }) => {
    if (!el) return;

    let lastTapTime = 0;

    const onDown = (e) => {
      // Don't fire control keystrokes if player is dragging HUD elements in Edit Mode
      if (window.hudCustomizer?.isEditing) return;

      e.preventDefault();
      const mapping = app.mappingManager?.activeMapping;
      if (!mapping) return;
      const key  = mapping[control]?.key;
      const mode = mapping[control]?.mode || 'hold';

      // Disengage cruise control if braking or reversing
      if ((control === 'move_down' || control === 'brake') && app.cruiseControl) {
        toggleCruiseControl(false);
      }

      const now = Date.now();
      const isDoubleTap = (now - lastTapTime < 320);
      lastTapTime = now;

      // Check if button is already auto-locked
      if (app.autoHoldControls.has(control)) {
        toggleControlAutoLock(control, el);
        return;
      }

      // Check if Auto-Hold master mode is active OR player double-tapped
      if (mode === 'hold' && (app.autoHoldMode || isDoubleTap)) {
        toggleControlAutoLock(control, el);
        return;
      }

      el.classList.add('pressed');
      vibrate([15]);

      if (mode === 'hold') {
        if (key) app.buttonKeys.add(key);
        sendCurrentState();
      } else {
        // tap: press + release after short time
        if (key) {
          send({ type: 'TAP', key, seq: ++app.seq });
          vibrate([10]);
        }
      }
    };

    const onUp = (e) => {
      if (window.hudCustomizer?.isEditing) return;

      const mapping = app.mappingManager?.activeMapping;
      if (!mapping) return;
      const key  = mapping[control]?.key;
      const mode = mapping[control]?.mode || 'hold';

      // If control is auto-locked, keep it locked on!
      if (app.autoHoldControls.has(control)) return;

      el.classList.remove('pressed');

      if (mode === 'hold' && key) {
        app.buttonKeys.delete(key);
        sendCurrentState();
      }
    };

    el.addEventListener('pointerdown',  onDown, { passive: false });
    el.addEventListener('pointerup',    onUp,   { passive: true  });
    el.addEventListener('pointercancel',onUp,   { passive: true  });
    el.addEventListener('contextmenu',  e => e.preventDefault());
  });
}

// ─── Mapping Screen ───────────────────────────────────────────────────────────
function renderMappingTable(profileId) {
  const profile  = app.mappingManager.getProfile(profileId);
  const tbody    = DOM.mappingTbody;
  const mappings = profile.mappings;

  tbody.innerHTML = '';

  Object.entries(mappings).forEach(([controlId, ctrl]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="ctrl-name">${ctrl.label}</div>
        <div class="ctrl-desc">${ctrl.button.replace('_', ' ')}</div>
      </td>
      <td><span class="ctrl-icon">${ctrl.icon}</span></td>
      <td>
        <input
          class="key-input"
          type="text"
          maxlength="8"
          value="${ctrl.key}"
          data-control="${controlId}"
          data-profile="${profileId}"
          id="key-${profileId}-${controlId}"
          placeholder="KEY"
        />
      </td>
      <td>
        <select class="mode-select" data-control="${controlId}" data-profile="${profileId}">
          <option value="hold" ${ctrl.mode === 'hold' ? 'selected' : ''}>Hold</option>
          <option value="tap"  ${ctrl.mode === 'tap'  ? 'selected' : ''}>Tap</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind input events
  tbody.querySelectorAll('.key-input').forEach(input => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9_\s]/g, '');
    });
  });
}

function saveMappings(profileId) {
  const inputs   = DOM.mappingTbody.querySelectorAll('.key-input');
  const selects  = DOM.mappingTbody.querySelectorAll('.mode-select');

  inputs.forEach(input => {
    const ctrl = input.dataset.control;
    const prof = input.dataset.profile;
    const val  = input.value.trim().toUpperCase();
    if (val) app.mappingManager.updateMapping(prof, ctrl, { key: val });
  });

  selects.forEach(sel => {
    const ctrl = sel.dataset.control;
    const prof = sel.dataset.profile;
    app.mappingManager.updateMapping(prof, ctrl, { mode: sel.value });
  });

  app.mappingManager.save();
}

let currentMappingProfile = 'smash_karts';

function setupMappingScreen() {
  // Tab switching
  DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMappingProfile = btn.dataset.profile;
      renderMappingTable(currentMappingProfile);
    });
  });

  DOM.openMappingBtn.addEventListener('click', () => {
    currentMappingProfile = app.mappingManager.activeProfileId;
    // Sync tabs
    DOM.tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.profile === currentMappingProfile);
    });
    renderMappingTable(currentMappingProfile);
    showScreen('mapping-screen');
  });

  DOM.settingsBtn?.addEventListener('click', () => {
    currentMappingProfile = app.mappingManager.activeProfileId;
    DOM.tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.profile === currentMappingProfile);
    });
    renderMappingTable(currentMappingProfile);
    showScreen('mapping-screen');
  });

  DOM.mappingBackBtn.addEventListener('click', () => {
    showScreen(app.connected ? 'controller-screen' : 'connect-screen');
  });

  DOM.saveMappingBtn.addEventListener('click', () => {
    saveMappings(currentMappingProfile);
    app.mappingManager.setActiveProfile(currentMappingProfile);
    if (DOM.activeProfileMini) DOM.activeProfileMini.value = currentMappingProfile;
    if (DOM.profileNameDisplay) DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;
    toast('✅ Saved!', 'success');
    vibrate([20, 10, 20]);
    setTimeout(() => showScreen(app.connected ? 'controller-screen' : 'connect-screen'), 400);
  });

  DOM.resetDefaultsBtn.addEventListener('click', () => {
    app.mappingManager.resetToDefaults(currentMappingProfile);
    renderMappingTable(currentMappingProfile);
    toast('↺ Reset to defaults');
  });

  DOM.testMappingBtn.addEventListener('click', () => {
    const mapping = app.mappingManager.activeMapping;
    toast(`🧪 ${Object.values(mapping).map(m => `${m.label}→${m.key}`).join(' | ')}`, '', 4000);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // Create mapping manager
  app.mappingManager = new KeyMappingManager();

  // Auto-fill IP from current URL hostname first (most reliable on mobile Wi-Fi)
  const lastIp   = localStorage.getItem('lastIp');
  const lastPort = localStorage.getItem('lastPort');
  if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    DOM.serverIp.value = window.location.hostname;
  } else if (lastIp) {
    DOM.serverIp.value = lastIp;
  }
  if (lastPort) {
    DOM.serverPort.value = lastPort;
  } else {
    DOM.serverPort.value = '8765';
  }

  // Transport toggle tabs
  DOM.tabWs?.addEventListener('click', () => {
    DOM.tabWs.classList.add('active');
    DOM.tabBle.classList.remove('active');
    DOM.wsForm.classList.remove('hidden');
    DOM.bleForm.classList.add('hidden');
  });

  DOM.tabBle?.addEventListener('click', () => {
    DOM.tabBle.classList.add('active');
    DOM.tabWs.classList.remove('active');
    DOM.bleForm.classList.remove('hidden');
    DOM.wsForm.classList.add('hidden');
  });

  // Set active profile in mini selector
  if (DOM.activeProfileMini) DOM.activeProfileMini.value = app.mappingManager.activeProfileId;
  if (DOM.profileNameDisplay) DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;

  // Profile selector on connect screen
  DOM.activeProfileMini?.addEventListener('change', () => {
    app.mappingManager.setActiveProfile(DOM.activeProfileMini.value);
    if (DOM.profileNameDisplay) DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;
  });

  // Connect & Preview buttons
  DOM.connectBtn?.addEventListener('click', connectWs);
  DOM.previewBtn?.addEventListener('click', startOfflinePreview);
  DOM.quickConnectBtn?.addEventListener('click', () => showScreen('connect-screen'));
  DOM.bleConnectBtn?.addEventListener('click', connectBle);
  DOM.serverIp?.addEventListener('keydown', e => { if (e.key === 'Enter') connectWs(); });
  DOM.serverPort?.addEventListener('keydown', e => { if (e.key === 'Enter') connectWs(); });

  // Disconnect
  DOM.disconnectBtn?.addEventListener('click', () => {
    disconnect();
    showScreen('connect-screen');
  });

  // Reset
  DOM.resetBtn?.addEventListener('click', () => {
    releaseAllKeys();
    toast('🔄 All keys released & auto-locks cleared');
    vibrate([30]);
  });

  // Haptics toggle
  DOM.vibrateBtn?.addEventListener('click', () => {
    app.hapticEnabled = !app.hapticEnabled;
    DOM.vibrateBtn.textContent = app.hapticEnabled ? '📳 Haptics' : '🔇 No Haptics';
    toast(app.hapticEnabled ? '📳 Haptics ON' : '🔇 Haptics OFF');
  });

  // Pro Assists (Auto-Gas, Turbo Rapid Fire & Auto-Hold Lock)
  DOM.cruiseBtn?.addEventListener('click', () => toggleCruiseControl());
  DOM.turboBtn?.addEventListener('click', () => toggleTurboMode());
  DOM.autolockBtn?.addEventListener('click', () => toggleAutoHoldMode());

  // Joystick
  app.joystick = new VirtualJoystick(DOM.joystickBase, DOM.joystickThumb, {
    deadZone: 0.15,
    updateInterval: 16,
    onMove: (x, y, dirs) => {
      if (window.hudCustomizer?.isEditing) return;
      if (dirs.has('down') && app.cruiseControl) {
        toggleCruiseControl(false);
      }
      app.joystickDirs = dirs;
      sendCurrentState();
    },
    onRelease: () => {
      if (window.hudCustomizer?.isEditing) return;
      app.joystickDirs = new Set();
      sendCurrentState();
    }
  });

  // Action buttons & Layout Switcher
  setupLayoutSwitcher();
  setupActionButtons();

  // HUD Customizer (Position Dragging & Scale Resizing)
  window.hudCustomizer?.init();

  // Mapping screen
  setupMappingScreen();

  // Prevent context menu on whole page
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Prevent scroll
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
