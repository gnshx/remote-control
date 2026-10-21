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
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  connectScreen:     $('connect-screen'),
  controllerScreen:  $('controller-screen'),
  mappingScreen:     $('mapping-screen'),
  tabWs:             $('tab-ws'),
  tabBle:            $('tab-ble'),
  wsForm:            $('ws-form'),
  bleForm:           $('ble-form'),
  bleConnectBtn:     $('ble-connect-btn'),
  bleError:          $('ble-error'),
  serverIp:          $('server-ip'),
  serverPort:        $('server-port'),
  connectBtn:        $('connect-btn'),
  connectError:      $('connect-error'),
  connectBtnText:    document.querySelector('#connect-btn .btn-text'),
  connectBtnLoader:  document.querySelector('#connect-btn .btn-loader'),
  connectionDot:     $('connection-dot'),
  connectionLabel:   $('connection-label'),
  latencyDisplay:    $('latency-display'),
  profileNameDisplay:$('profile-name-display'),
  seqNum:            $('seq-num'),
  joystickBase:      $('joystick-base'),
  joystickThumb:     $('joystick-thumb'),
  disconnectBtn:     $('disconnect-btn'),
  settingsBtn:       $('settings-btn'),
  resetBtn:          $('reset-btn'),
  vibrateBtn:        $('vibrate-btn'),
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
  const ip   = DOM.serverIp.value.trim();
  const port = DOM.serverPort.value.trim();

  if (!ip) { showError('Please enter the laptop IP address.'); return; }

  const url = `ws://${ip}:${port}`;

  DOM.connectBtnText.classList.add('hidden');
  DOM.connectBtnLoader.classList.remove('hidden');
  DOM.connectBtn.disabled = true;
  hideError();

  localStorage.setItem('lastIp',   ip);
  localStorage.setItem('lastPort', port);

  try {
    app.ws = new WebSocket(url);
    app.transportMode = 'ws';
  } catch (e) {
    showError(`Invalid address: ${e.message}`);
    resetConnectBtn();
    return;
  }

  app.ws.onopen = () => {
    app.connected = true;
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
    showError('Connection failed. Make sure the laptop agent is running.');
    resetConnectBtn();
  };

  app.ws.onclose = () => {
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
  stopPing();
  stopStateLoop();
  releaseAllKeys();
  setConnectionUI(false);
  showScreen('connect-screen');
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

// ─── Key State Management ─────────────────────────────────────────────────────
function buildCurrentKeys() {
  const mapping = app.mappingManager.activeMapping;
  const keys = new Set();

  // Joystick → keys
  if (app.joystickDirs.has('up'))    keys.add(mapping.move_up?.key);
  if (app.joystickDirs.has('down'))  keys.add(mapping.move_down?.key);
  if (app.joystickDirs.has('left'))  keys.add(mapping.move_left?.key);
  if (app.joystickDirs.has('right')) keys.add(mapping.move_right?.key);

  // Button keys
  for (const k of app.buttonKeys) keys.add(k);

  // Remove null/undefined
  keys.delete(undefined);
  keys.delete(null);

  return keys;
}

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

  DOM.seqNum.textContent = app.seq;
}

function releaseAllKeys() {
  app.joystickDirs.clear();
  app.buttonKeys.clear();
  app.pressedKeys.clear();
  updateHUD(new Set());
  send({ type: 'RESET', seq: ++app.seq });
}

// ─── HUD update ───────────────────────────────────────────────────────────────
function updateHUD(keys) {
  const mapping = app.mappingManager.activeMapping;

  // Map key → HUD element
  const keyToHud = {
    [mapping.move_up?.key]:    DOM.hudKeys.W,
    [mapping.move_left?.key]:  DOM.hudKeys.A,
    [mapping.move_down?.key]:  DOM.hudKeys.S,
    [mapping.move_right?.key]: DOM.hudKeys.D,
    [mapping.fire?.key]:       DOM.hudKeys.SPACE,
    [mapping.special?.key]:    DOM.hudKeys.E,
  };

  // Update labels to match current mapping
  if (DOM.hudKeys.W)     DOM.hudKeys.W.textContent     = mapping.move_up?.key     || 'W';
  if (DOM.hudKeys.A)     DOM.hudKeys.A.textContent     = mapping.move_left?.key   || 'A';
  if (DOM.hudKeys.S)     DOM.hudKeys.S.textContent     = mapping.move_down?.key   || 'S';
  if (DOM.hudKeys.D)     DOM.hudKeys.D.textContent     = mapping.move_right?.key  || 'D';
  if (DOM.hudKeys.SPACE) DOM.hudKeys.SPACE.textContent = mapping.fire?.key        || 'SPC';
  if (DOM.hudKeys.E)     DOM.hudKeys.E.textContent     = mapping.special?.key     || 'E';

  // Activate/deactivate
  for (const [key, el] of Object.entries(keyToHud)) {
    if (el) el.classList.toggle('active', keys.has(key));
  }
}

// ─── Connection UI ────────────────────────────────────────────────────────────
function setConnectionUI(connected, label) {
  if (connected) {
    DOM.connectionDot.className   = 'status-dot connected';
    DOM.connectionLabel.textContent = label || 'Connected';
  } else {
    DOM.connectionDot.className   = 'status-dot disconnected';
    DOM.connectionLabel.textContent = 'Disconnected';
    DOM.latencyDisplay.textContent  = '-- ms';
  }
}

function showError(msg) {
  DOM.connectError.textContent = msg;
  DOM.connectError.classList.remove('hidden');
}
function hideError() {
  DOM.connectError.classList.add('hidden');
}
function resetConnectBtn() {
  DOM.connectBtnText.classList.remove('hidden');
  DOM.connectBtnLoader.classList.add('hidden');
  DOM.connectBtn.disabled = false;
}

// ─── Action Buttons ───────────────────────────────────────────────────────────
function setupActionButtons() {
  const btns = [
    { el: $('btn-fire'),  control: 'fire'    },
    { el: $('btn-e'),     control: 'special' },
    { el: $('btn-q'),     control: 'item'    },
    { el: $('btn-shift'), control: 'brake'   },
  ];

  btns.forEach(({ el, control }) => {
    if (!el) return;

    const onDown = (e) => {
      e.preventDefault();
      const mapping = app.mappingManager.activeMapping;
      const key  = mapping[control]?.key;
      const mode = mapping[control]?.mode || 'hold';

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
      const mapping = app.mappingManager.activeMapping;
      const key  = mapping[control]?.key;
      const mode = mapping[control]?.mode || 'hold';

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
    DOM.activeProfileMini.value = currentMappingProfile;
    DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;
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

  // Restore last IP/port, or auto-fill from current URL hostname
  const lastIp   = localStorage.getItem('lastIp');
  const lastPort = localStorage.getItem('lastPort');
  if (lastIp) {
    DOM.serverIp.value = lastIp;
  } else if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    DOM.serverIp.value = window.location.hostname;
  }
  if (lastPort) DOM.serverPort.value = lastPort;

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
  DOM.activeProfileMini.value = app.mappingManager.activeProfileId;
  DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;

  // Profile selector on connect screen
  DOM.activeProfileMini.addEventListener('change', () => {
    app.mappingManager.setActiveProfile(DOM.activeProfileMini.value);
    DOM.profileNameDisplay.textContent = app.mappingManager.activeProfileName;
  });

  // Connect buttons
  DOM.connectBtn.addEventListener('click', connectWs);
  DOM.bleConnectBtn?.addEventListener('click', connectBle);
  DOM.serverIp.addEventListener('keydown', e => { if (e.key === 'Enter') connectWs(); });
  DOM.serverPort.addEventListener('keydown', e => { if (e.key === 'Enter') connectWs(); });

  // Disconnect
  DOM.disconnectBtn?.addEventListener('click', () => {
    disconnect();
    showScreen('connect-screen');
  });

  // Reset
  DOM.resetBtn?.addEventListener('click', () => {
    releaseAllKeys();
    toast('🔄 Keys released');
    vibrate([30]);
  });

  // Haptics toggle
  DOM.vibrateBtn?.addEventListener('click', () => {
    app.hapticEnabled = !app.hapticEnabled;
    DOM.vibrateBtn.textContent = app.hapticEnabled ? '📳 Haptics' : '🔇 No Haptics';
    toast(app.hapticEnabled ? '📳 Haptics ON' : '🔇 Haptics OFF');
  });

  // Joystick
  app.joystick = new VirtualJoystick(DOM.joystickBase, DOM.joystickThumb, {
    deadZone: 0.15,
    updateInterval: 16,
    onMove: (x, y, dirs) => {
      app.joystickDirs = dirs;
      // Immediately send on change
      sendCurrentState();
    },
    onRelease: () => {
      app.joystickDirs = new Set();
      sendCurrentState();
    }
  });

  // Action buttons
  setupActionButtons();

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
