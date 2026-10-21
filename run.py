#!/usr/bin/env python3
"""
run.py — Unified Launcher for Phone Game Controller 🎮
Serves the mobile web controller, generates a QR code for your phone,
and runs the laptop input agent.

Usage:
  python3 run.py [--http-port 8000] [--ws-port 8765] [--dry-run]
"""

import asyncio
import http.server
import logging
import os
import socket
import sys
import threading
import time

# Ensure laptop-agent directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_DIR = os.path.join(BASE_DIR, "laptop-agent")
MOBILE_DIR = os.path.join(BASE_DIR, "mobile")
if AGENT_DIR not in sys.path:
    sys.path.insert(0, AGENT_DIR)

from controller.mapping_engine import MappingEngine
from input.dry_run_adapter import DryRunAdapter
from safety.watchdog import Watchdog
from transport.websocket_server import WebSocketServer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("launcher")


def get_local_ip() -> str:
    """Find the local network IP of this laptop."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Doesn't actually connect, just determines outbound interface
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def print_qr_code(url: str):
    """Render terminal QR code if qrcode is available."""
    try:
        import qrcode

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=1,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        print("\n  Scan with your phone camera to open the controller:\n")
        qr.print_ascii(invert=True)
    except ImportError:
        print("\n  [Tip] Run `./start.sh` to auto-install 'qrcode' for terminal camera scanning!")
    except Exception as e:
        log.debug("QR code generation note: %s", e)


class MobileHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=MOBILE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Quiet regular HTTP 200 GET requests
        pass


def find_available_port(host: str, start_port: int) -> int:
    """Find start_port if free, otherwise find next available port."""
    port = start_port
    while port < start_port + 50:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                port += 1
    return start_port


class MobileHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


def start_http_server(host: str, port: int):
    server = MobileHTTPServer((host, port), MobileHTTPHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


def detect_session_type() -> str:
    session = os.environ.get("XDG_SESSION_TYPE", "").lower()
    if session in ("x11", "wayland"):
        return session
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return "x11"


def get_keyboard_adapter(session: str, dry_run: bool = False):
    if dry_run:
        return DryRunAdapter()

    # Try pynput first (universal)
    try:
        from input.pynput_adapter import PynputAdapter

        adapter = PynputAdapter()
        log.info("Loaded pynput keyboard adapter")
        return adapter
    except Exception as e:
        log.warning("pynput not available (%s), trying session adapter...", e)

    if session == "x11":
        try:
            from input.xtest_adapter import XTestAdapter

            adapter = XTestAdapter()
            log.info("Loaded XTest X11 keyboard adapter")
            return adapter
        except Exception as e:
            log.warning("XTest not available: %s", e)

    try:
        from input.uinput_adapter import UInputAdapter

        adapter = UInputAdapter()
        log.info("Loaded uinput keyboard adapter")
        return adapter
    except Exception as e:
        log.warning("uinput not available: %s", e)

    log.warning("No keyboard injection backend active — running in DRY RUN mode")
    return DryRunAdapter()


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phone Game Controller Launcher")
    parser.add_argument("--host", default="0.0.0.0", help="Bind IP (default: 0.0.0.0)")
    parser.add_argument("--http-port", default=8000, type=int, help="HTTP web port (default: 8000)")
    parser.add_argument("--ws-port", default=8765, type=int, help="WebSocket port (default: 8765)")
    parser.add_argument("--dry-run", action="store_true", help="Log keys without keyboard injection")
    args = parser.parse_args()

    local_ip = get_local_ip()
    session = detect_session_type()

    http_port = find_available_port(args.host, args.http_port)
    ws_port = find_available_port(args.host, args.ws_port)

    if http_port != args.http_port:
        log.info("HTTP port %d in use, using port %d", args.http_port, http_port)
    if ws_port != args.ws_port:
        log.info("WebSocket port %d in use, using port %d", args.ws_port, ws_port)

    mobile_url = f"http://{local_ip}:{http_port}"
    ws_url = f"ws://{local_ip}:{ws_port}"

    # 1. Start HTTP server for mobile controller
    http_server = start_http_server(args.host, http_port)

    # 2. Build keyboard adapter
    kb_adapter = get_keyboard_adapter(session, dry_run=args.dry_run)

    # 3. Load mapping engine
    config_path = os.path.join(AGENT_DIR, "config", "profiles.json")
    mapping_engine = MappingEngine(config_path)

    # 4. Start WebSocket server
    ws_server = WebSocketServer(
        host=args.host,
        port=ws_port,
        kb_adapter=kb_adapter,
        mapping_engine=mapping_engine,
    )

    # Banner
    print("=" * 64)
    print("  🎮  PHONE-TO-LAPTOP WIRELESS GAME CONTROLLER  🎮")
    print("=" * 64)
    print(f"  • Phone Web URL   :  {mobile_url}")
    print(f"  • WebSocket Agent :  {ws_url}")
    print(f"  • Active Profile  :  {mapping_engine.active_profile_name}")
    print(f"  • Desktop Session :  {session.upper()}")
    print(f"  • Keyboard Adapter:  {type(kb_adapter).__name__}")
    print("=" * 64)

    # Print terminal QR code
    print_qr_code(mobile_url)

    print(f"  📱 Open on your phone: {mobile_url}")
    print(f"  🏎️  Open in Chrome   : https://smashkarts.io (or any game!)")
    print("  🛑 Press Ctrl+C to stop.")
    print("=" * 64)
    print()

    try:
        await ws_server.start()
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        log.info("Stopping servers...")
        kb_adapter.release_all()
        await ws_server.stop()
        http_server.shutdown()
        log.info("Shutdown complete. All keys released safely.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExited.")
