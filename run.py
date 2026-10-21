#!/usr/bin/env python3
"""
run.py — Unified Launcher for Game Controller 🎮
Supports Bidirectional Control:
  1. Phone ➔ Laptop Mode (Use phone as game controller for laptop games)
  2. Laptop ➔ Phone Mode (--reverse: Use laptop keyboard/mouse to play games on phone)

Usage:
  python3 run.py [--http-port 8000] [--ws-port 8765] [--reverse-port 8766] [--reverse] [--dry-run]
"""

import asyncio
import http.server
import logging
import os
import socket
import sys
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AGENT_DIR = os.path.join(BASE_DIR, "laptop-agent")
REVERSE_AGENT_DIR = os.path.join(BASE_DIR, "reverse-agent")
MOBILE_DIR = os.path.join(BASE_DIR, "mobile")
REVERSE_DIR = os.path.join(BASE_DIR, "reverse")

if AGENT_DIR not in sys.path:
    sys.path.insert(0, AGENT_DIR)
if REVERSE_AGENT_DIR not in sys.path:
    sys.path.insert(0, REVERSE_AGENT_DIR)

from controller.mapping_engine import MappingEngine
from input.dry_run_adapter import DryRunAdapter
from safety.watchdog import Watchdog
from transport.websocket_server import WebSocketServer
from reverse_server import ReverseServer

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


class DualHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Serves mobile controller at / and reverse laptop controller at /reverse/."""

    def translate_path(self, path):
        clean_path = path.split("?", 1)[0].split("#", 1)[0]
        if clean_path == "/reverse" or clean_path.startswith("/reverse/"):
            rel_path = clean_path[len("/reverse") :].lstrip("/")
            if not rel_path:
                rel_path = "index.html"
            return os.path.join(REVERSE_DIR, rel_path)
        return os.path.join(MOBILE_DIR, clean_path.lstrip("/"))

    def log_message(self, format, *args):
        pass  # Quiet regular HTTP 200 GET requests


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


class DualHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


def start_http_server(host: str, port: int):
    server = DualHTTPServer((host, port), DualHTTPHandler)
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

    if session == "wayland":
        try:
            from input.uinput_adapter import UInputAdapter
            adapter = UInputAdapter()
            log.info("Loaded uinput kernel keyboard adapter (Wayland native)")
            return adapter
        except Exception:
            pass

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
            log.info("Loaded XTest keyboard adapter (X11)")
            return adapter
        except Exception as e:
            log.warning("XTest not available: %s", e)

    if session == "wayland":
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

    parser = argparse.ArgumentParser(description="Bidirectional Phone & Laptop Game Controller")
    parser.add_argument("--host", default="0.0.0.0", help="Bind IP (default: 0.0.0.0)")
    parser.add_argument("--http-port", default=8000, type=int, help="HTTP web port (default: 8000)")
    parser.add_argument("--ws-port", default=8765, type=int, help="Phone-to-Laptop WebSocket port (default: 8765)")
    parser.add_argument("--reverse-port", default=8766, type=int, help="Laptop-to-Phone Reverse port (default: 8766)")
    parser.add_argument("--reverse", action="store_true", help="Start in Laptop-to-Phone Reverse mode")
    parser.add_argument("--dry-run", action="store_true", help="Log keys without injection")
    args = parser.parse_args()

    local_ip = get_local_ip()
    session = detect_session_type()

    http_port = find_available_port(args.host, args.http_port)
    ws_port = find_available_port(args.host, args.ws_port)
    rev_ws_port = find_available_port(args.host, args.reverse_port)

    mobile_url = f"http://{local_ip}:{http_port}"
    reverse_url = f"http://localhost:{http_port}/reverse/"
    ws_url = f"ws://{local_ip}:{ws_port}"
    rev_ws_url = f"ws://{local_ip}:{rev_ws_port}"

    # 1. Start HTTP server
    http_server = start_http_server(args.host, http_port)

    # 2. Build keyboard adapter for Phone-to-Laptop mode
    kb_adapter = get_keyboard_adapter(session, dry_run=args.dry_run)

    # 3. Load mapping engine
    config_path = os.path.join(AGENT_DIR, "config", "profiles.json")
    mapping_engine = MappingEngine(config_path)

    # 4. Start Phone-to-Laptop WebSocket server
    ws_server = WebSocketServer(
        host=args.host,
        port=ws_port,
        kb_adapter=kb_adapter,
        mapping_engine=mapping_engine,
    )

    # 5. Start Reverse Laptop-to-Phone WebSocket server
    rev_server = ReverseServer(
        host=args.host,
        port=rev_ws_port,
    )

    # Print Banner
    print("=" * 68)
    if args.reverse:
        print("  🎮  LAPTOP ➔ PHONE WIRELESS GAME CONTROLLER & KEYMAPPER  🎮")
    else:
        print("  🎮  BIDIRECTIONAL PHONE & LAPTOP WIRELESS GAME CONTROLLER  🎮")
    print("=" * 68)
    print(f"  • Phone-to-Laptop URL :  {mobile_url}")
    print(f"  • Laptop-to-Phone URL :  {reverse_url}")
    print(f"  • WebSocket Agent (P2L): {ws_url}")
    print(f"  • WebSocket Agent (L2P): {rev_ws_url}")
    print(f"  • Desktop Session     :  {session.upper()}")
    print("=" * 68)

    if args.reverse:
        print(f"\n  🚀 [REVERSE MODE ACTIVE] Play phone games using laptop keyboard & mouse!")
        print(f"  💻 Open the Laptop Studio in Chrome: {reverse_url}")
        print(f"  📱 Connect to your phone via Wireless ADB (Developer Options ➔ Wireless Debugging)")
    else:
        print_qr_code(mobile_url)
        print(f"  📱 [Phone ➔ Laptop]: Scan QR code or open on phone: {mobile_url}")
        print(f"  💻 [Laptop ➔ Phone]: Open reverse controller studio: {reverse_url}")

    print("\n  🛑 Press Ctrl+C to stop.")
    print("=" * 68)
    print()

    try:
        await asyncio.gather(
            ws_server.start(),
            rev_server.start(),
        )
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        log.info("Stopping servers...")
        kb_adapter.release_all()
        await ws_server.stop()
        await rev_server.stop()
        http_server.shutdown()
        log.info("Shutdown complete. All keys and connections released safely.")


def cli():
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExited.")


if __name__ == "__main__":
    cli()
