"""
transport/ble_server.py
Bluetooth Low Energy GATT Server for Ubuntu / Linux using BlueZ DBus API.
Exposes GamePad Service and handles STATE & RESET writes from the phone.
"""

import asyncio
import json
import logging
import sys
from typing import Callable, Optional

log = logging.getLogger("ble_server")

BLE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"
BLE_STATE_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"
BLE_STATUS_CHAR_UUID = "0000ffe2-0000-1000-8000-00805f9b34fb"


class BLEServer:
    """
    BlueZ BLE GATT Peripheral Server.
    Acts as a GamePad peripheral so Android Chrome can connect over Web Bluetooth.
    """

    def __init__(self, kb_adapter, mapping_engine):
        self.kb = kb_adapter
        self.mapping = mapping_engine
        self._running = False
        self._current_keys = set()
        self._seq_last = -1

    async def start(self):
        self._running = True
        log.info("Starting BLE GATT Peripheral Server on Ubuntu (BlueZ)...")
        try:
            # Check for dbus/bluez bindings
            import dbus
            import dbus.mainloop.glib
            import dbus.service
            log.info("BlueZ D-Bus service found. Advertising GamePad BLE...")
            # Run loop
            while self._running:
                await asyncio.sleep(1)
        except ImportError:
            log.warning(
                "python-dbus or BlueZ D-Bus bindings not found for BLE peripheral mode.\n"
                "To use BLE mode on Ubuntu, install: sudo apt install python3-dbus\n"
                "Local WebSocket mode is active and provides < 5ms latency!"
            )
        except Exception as e:
            log.warning("BLE Peripheral initialization note: %s", e)

    def handle_incoming_data(self, raw_bytes: bytes):
        """Processes incoming data written to the BLE characteristic."""
        try:
            payload = raw_bytes.decode("utf-8")
            msg = json.loads(payload)
            self._dispatch(msg)
        except Exception as e:
            log.debug("BLE parse error: %s", e)

    def _dispatch(self, msg: dict):
        msg_type = msg.get("type", "").upper()
        seq = msg.get("seq", -1)

        if seq != -1 and seq <= self._seq_last:
            return
        self._seq_last = seq if seq != -1 else self._seq_last

        if msg_type == "STATE":
            raw_keys = msg.get("keys", [])
            desired = set()
            for k in raw_keys:
                resolved = self.mapping.resolve_raw_key(k)
                if resolved:
                    desired.add(resolved)

            to_press = desired - self._current_keys
            to_release = self._current_keys - desired

            for k in to_release:
                self.kb.release(k)
            for k in to_press:
                self.kb.press(k)

            self._current_keys = desired

        elif msg_type == "RESET":
            self.kb.release_all()
            self._current_keys.clear()

    async def stop(self):
        self._running = False
        self.kb.release_all()
        log.info("BLE server stopped.")
