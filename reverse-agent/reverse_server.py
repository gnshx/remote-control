"""
reverse-agent/reverse_server.py — Reverse Controller WebSocket Server
Listens for keyboard, mouse, and touch events from the Laptop Controller Studio
and forwards them to the Android phone via ADBBridge.
"""

import asyncio
import json
import logging
import math
import time
from typing import Optional, Set
import websockets

try:
    from .adb_bridge import ADBBridge
except (ImportError, ValueError):
    from adb_bridge import ADBBridge

log = logging.getLogger("reverse_server")


class ReverseServer:
    def __init__(self, host: str, port: int, adb_bridge: Optional[ADBBridge] = None):
        self.host = host
        self.port = port
        self.adb = adb_bridge or ADBBridge()
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self._stick_task = None
        self._current_stick_dirs = set()

    async def start(self):
        log.info("Starting Reverse Controller WebSocket Server on ws://%s:%d", self.host, self.port)
        self.server = await websockets.serve(self._handle_client, self.host, self.port)

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        self.adb.disconnect()
        log.info("Reverse Controller WebSocket Server stopped.")

    async def _handle_client(self, websocket):
        self.clients.add(websocket)
        client_addr = websocket.remote_address
        log.info("Laptop controller client connected: %s", client_addr)

        # Send initial status
        await self._send(websocket, {
            "type": "STATUS",
            "connected": self.adb.connected,
            "device_model": self.adb.device_model,
            "screen_width": self.adb.screen_width,
            "screen_height": self.adb.screen_height,
            "is_dry_run": self.adb.is_dry_run,
            "adb_installed": self.adb.is_adb_installed(),
        })

        try:
            async for raw_message in websocket:
                try:
                    msg = json.loads(raw_message)
                    await self._process_message(websocket, msg)
                except json.JSONDecodeError:
                    log.warning("Received invalid JSON: %s", raw_message[:100])
                except Exception as e:
                    log.error("Error processing reverse message: %s", e)
        except websockets.exceptions.ConnectionClosed:
            log.info("Laptop controller client disconnected: %s", client_addr)
        finally:
            self.clients.discard(websocket)

    async def _process_message(self, ws, msg: dict):
        mtype = msg.get("type", "")

        if mtype == "PING":
            await self._send(ws, {"type": "PONG", "ts": msg.get("ts", time.time() * 1000)})
            return

        if mtype == "ADB_CONNECT":
            host = msg.get("host", "127.0.0.1")
            port = int(msg.get("port", 5555))
            ok, status_msg = self.adb.connect(host, port)
            await self._send(ws, {
                "type": "ADB_STATUS",
                "success": ok,
                "message": status_msg,
                "device_model": self.adb.device_model,
                "screen_width": self.adb.screen_width,
                "screen_height": self.adb.screen_height,
                "is_dry_run": self.adb.is_dry_run,
            })
            return

        if mtype == "ADB_DISCONNECT":
            self.adb.disconnect()
            await self._send(ws, {"type": "ADB_STATUS", "success": False, "message": "Disconnected"})
            return

        if mtype == "ADB_DETECT":
            devices = self.adb.auto_detect()
            await self._send(ws, {"type": "DEVICES_LIST", "devices": devices})
            return

        # Direct Touch Tap Event (from mapped button click or key press)
        if mtype == "TAP":
            x = msg.get("x")
            y = msg.get("y")
            if x is not None and y is not None:
                self.adb.tap(x, y)
            return

        # Direct Touch Swipe Event (for camera aim, flick, or skill drag)
        if mtype == "SWIPE":
            x1 = msg.get("x1", 0)
            y1 = msg.get("y1", 0)
            x2 = msg.get("x2", 0)
            y2 = msg.get("y2", 0)
            duration = msg.get("duration", 100)
            self.adb.swipe(x1, y1, x2, y2, duration)
            return

        # Virtual Analog Joystick Move
        # msg: { center_x, center_y, dx, dy, radius }
        if mtype == "JOYSTICK_MOVE":
            cx = msg.get("center_x", 400)
            cy = msg.get("center_y", 750)
            dx = msg.get("dx", 0)  # normalized -1.0 to 1.0
            dy = msg.get("dy", 0)  # normalized -1.0 to 1.0
            radius = msg.get("radius", 140)

            target_x = cx + (dx * radius)
            target_y = cy + (dy * radius)
            # Swipe from center to target with 120ms hold
            self.adb.swipe(cx, cy, target_x, target_y, duration_ms=120)
            return

        # Native Android Keycode (for games with hardware keyboard/gamepad support)
        if mtype == "KEYEVENT":
            keycode = msg.get("keycode", "")
            if keycode:
                self.adb.keyevent(keycode)
            return

    async def _send(self, ws, obj: dict):
        try:
            await ws.send(json.dumps(obj))
        except Exception:
            pass
