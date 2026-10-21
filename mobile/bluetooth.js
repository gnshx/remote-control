/**
 * bluetooth.js — Web Bluetooth LE transport for Mobile Controller
 * Enables direct phone-to-laptop BLE GATT connection in Chrome on Android.
 */

'use strict';

// ── GATT UUIDs ─────────────────────────────────────────────────────────────
const BLE_GAMEPAD_SERVICE_UUID        = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BLE_GAMEPAD_STATE_CHAR_UUID     = '0000ffe1-0000-1000-8000-00805f9b34fb';
const BLE_GAMEPAD_STATUS_CHAR_UUID    = '0000ffe2-0000-1000-8000-00805f9b34fb';

class BluetoothTransport {
  constructor(options = {}) {
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onMessage      = options.onMessage      || (() => {});
    this.onError        = options.onError        || (() => {});

    this.device     = null;
    this.server     = null;
    this.stateChar  = null;
    this.statusChar = null;
    this.connected  = false;
    this._encoder   = new TextEncoder();
    this._decoder   = new TextDecoder();
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect() {
    if (!BluetoothTransport.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome on Android or switch to WebSocket mode.');
    }

    try {
      this.onStatusChange('requesting', 'Pairing with laptop BLE device...');

      // Request device with our custom service or accept all for discovery
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GamePad' },
          { services: [BLE_GAMEPAD_SERVICE_UUID] }
        ],
        optionalServices: [BLE_GAMEPAD_SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.connected = false;
        this.onStatusChange('disconnected', 'Bluetooth disconnected');
      });

      this.onStatusChange('connecting', `Connecting to ${this.device.name || 'GamePad'}...`);
      this.server = await this.device.gatt.connect();

      // Get primary service
      const service = await this.server.getPrimaryService(BLE_GAMEPAD_SERVICE_UUID);

      // Get characteristics
      this.stateChar = await service.getCharacteristic(BLE_GAMEPAD_STATE_CHAR_UUID);

      try {
        this.statusChar = await service.getCharacteristic(BLE_GAMEPAD_STATUS_CHAR_UUID);
        // Subscribe to notifications
        await this.statusChar.startNotifications();
        this.statusChar.addEventListener('characteristicvaluechanged', (event) => {
          const value = this._decoder.decode(event.target.value);
          try {
            const data = JSON.parse(value);
            this.onMessage(data);
          } catch (e) {
            // raw string
            this.onMessage({ type: 'STATUS', text: value });
          }
        });
      } catch (e) {
        console.warn('Status notifications characteristic not available:', e);
      }

      this.connected = true;
      this.onStatusChange('connected', `Connected via BLE to ${this.device.name || 'Laptop'}`);
      return true;

    } catch (err) {
      this.connected = false;
      this.onError(err);
      throw err;
    }
  }

  async send(obj) {
    if (!this.connected || !this.stateChar) return;
    try {
      const payload = this._encoder.encode(JSON.stringify(obj));
      if (this.stateChar.writeValueWithoutResponse) {
        await this.stateChar.writeValueWithoutResponse(payload);
      } else {
        await this.stateChar.writeValue(payload);
      }
    } catch (e) {
      console.warn('BLE send error:', e);
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      try {
        this.send({ type: 'RESET', seq: 999999 });
      } catch (_) {}
      this.device.gatt.disconnect();
    }
    this.connected = false;
    this.onStatusChange('disconnected', 'Disconnected');
  }
}

window.BluetoothTransport = BluetoothTransport;
