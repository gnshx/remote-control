"""
transport/websocket_server.py
WebSocket server — receives controller state messages from the phone,
drives the mapping engine and keyboard adapter.
"""

import asyncio
import json
import logging
import time
from typing import Optional

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    raise ImportError(
        "websockets library not found. Install with:\n"
        "  pip install websockets"
    )

from controller.mapping_engine import MappingEngine
from safety.watchdog import Watchdog

log = logging.getLogger("ws_server")

# Maximum seconds without a message before releasing all keys
WATCHDOG_TIMEOUT = 5.0
# Maximum seconds to allow a single client to hold the session
MAX_SESSION_TIME = 3600.0


class WebSocketServer:
    def __init__(self, host: str, port: int, kb_adapter, mapping_engine: MappingEngine):
        self.host    = host
        self.port    = port
        self.kb      = kb_adapter
        self.mapping = mapping_engine
        self._server = None

        # State
        self._current_keys: set = set()
        self._seq_last: int     = -1
        self._client: Optional[WebSocketServerProtocol] = None

        # Watchdog — releases all keys if no messages arrive
        self._watchdog = Watchdog(
            timeout=WATCHDOG_TIMEOUT,
            callback=self._on_watchdog_expire,
        )

    async def start(self):
        self._server = await websockets.serve(
            self._handle_client,
            self.host,
            self.port,
            ping_interval=5,
            ping_timeout=10,
            max_size=1024,         # tiny messages only
            compression=None,      # no compression → lower latency
        )
        await self._server.wait_closed()

    async def stop(self):
        self._watchdog.cancel()
        self.kb.release_all()
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def _handle_client(self, ws: WebSocketServerProtocol, path: str = "/"):
        addr = ws.remote_address
        log.info("Client connected: %s", addr)

        # Only allow one client at a time
        if self._client is not None:
            await ws.close(1008, "Another client is already connected.")
            log.warning("Rejected second client: %s", addr)
            return

        self._client = ws
        self._watchdog.reset()
        self.kb.release_all()

        try:
            await self._send(ws, {"type": "STATUS", "status": "connected",
                                  "info": "Connected", "profile": self.mapping.active_profile_id})

            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    await self._dispatch(ws, msg)
                except json.JSONDecodeError:
                    log.warning("Invalid JSON from client")
                except Exception as e:
                    log.error("Error handling message: %s", e)

        except Exception as e:
            log.info("Client disconnected: %s (%s)", addr, e)
        finally:
            self._client = None
            self._watchdog.cancel()
            self.kb.release_all()
            self._current_keys.clear()
            log.info("Released all keys. Client gone: %s", addr)

    async def _dispatch(self, ws: WebSocketServerProtocol, msg: dict):
        msg_type = msg.get("type", "").upper()
        seq      = msg.get("seq", -1)

        # Ignore stale messages
        if seq != -1 and seq <= self._seq_last:
            return
        self._seq_last = seq if seq != -1 else self._seq_last

        self._watchdog.reset()

        if msg_type == "HELLO":
            profile = msg.get("profile", "smash_karts")
            self.mapping.set_active_profile(profile)
            log.info("Client hello — profile: %s", profile)
            await self._send(ws, {"type": "STATUS", "status": "ready",
                                  "profile": self.mapping.active_profile_id})

        elif msg_type == "STATE":
            raw_keys = msg.get("keys", [])
            await self._apply_state(raw_keys)

        elif msg_type == "TAP":
            key = msg.get("key", "")
            mapped = self.mapping.resolve_raw_key(key)
            if mapped:
                self.kb.tap(mapped)
                log.debug("TAP %s → %s", key, mapped)

        elif msg_type == "PING":
            await self._send(ws, {"type": "PONG", "seq": seq, "ts": time.time()})

        elif msg_type == "RESET":
            self.kb.release_all()
            self._current_keys.clear()
            log.info("RESET — all keys released")

        else:
            log.debug("Unknown message type: %s", msg_type)

    async def _apply_state(self, raw_keys: list):
        """
        Reconcile the new desired key set against what is currently pressed.
        Only press/release what changed.
        """
        # Map raw protocol keys (e.g. "W", "SPACE") to system keys
        desired = set()
        for k in raw_keys:
            resolved = self.mapping.resolve_raw_key(k)
            if resolved:
                desired.add(resolved)

        to_press   = desired - self._current_keys
        to_release = self._current_keys - desired

        for k in to_release:
            self.kb.release(k)
            log.debug("RELEASE %s", k)

        for k in to_press:
            self.kb.press(k)
            log.debug("PRESS %s", k)

        self._current_keys = desired

    async def _send(self, ws, obj: dict):
        try:
            await ws.send(json.dumps(obj))
        except Exception:
            pass  # client may have disconnected

    def _on_watchdog_expire(self):
        log.warning("Watchdog expired — releasing all keys")
        self.kb.release_all()
        self._current_keys.clear()
