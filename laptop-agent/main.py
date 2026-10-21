#!/usr/bin/env python3
"""
laptop-agent/main.py
Entry point for the Phone-to-Laptop Game Controller Ubuntu Agent.

Starts the WebSocket server and keyboard input adapter.
Run with:  python3 main.py [--port 8765] [--host 0.0.0.0]
"""

import asyncio
import argparse
import logging
import signal
import sys
import os

# ── Logging setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")


def detect_session_type() -> str:
    """Detect whether we are running under X11 or Wayland."""
    session = os.environ.get("XDG_SESSION_TYPE", "").lower()
    if session in ("x11", "wayland"):
        return session
    # Fallback detection
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return "unknown"


def build_keyboard_adapter(session: str):
    """
    Import and return the best keyboard adapter for the current session.
    Tries pynput first (works on both X11 and Wayland in many cases),
    then falls back to uinput or xtest.
    """
    try:
        from input.pynput_adapter import PynputAdapter
        adapter = PynputAdapter()
        log.info("Using pynput keyboard adapter (session: %s)", session)
        return adapter
    except ImportError:
        pass

    if session == "x11":
        try:
            from input.xtest_adapter import XTestAdapter
            adapter = XTestAdapter()
            log.info("Using XTest keyboard adapter")
            return adapter
        except ImportError:
            pass

    try:
        from input.uinput_adapter import UInputAdapter
        adapter = UInputAdapter()
        log.info("Using uinput keyboard adapter")
        return adapter
    except (ImportError, PermissionError) as e:
        log.warning("uinput unavailable: %s", e)

    # Dry-run (no actual key injection — useful for testing)
    from input.dry_run_adapter import DryRunAdapter
    log.warning("No keyboard adapter available — running in DRY RUN mode (keys logged only)")
    return DryRunAdapter()


async def main():
    parser = argparse.ArgumentParser(description="Phone-to-Laptop Game Controller Agent")
    parser.add_argument("--host",    default="0.0.0.0",  help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port",    default=8765, type=int, help="WebSocket port (default: 8765)")
    parser.add_argument("--config",  default="config/profiles.json", help="Path to profiles config")
    parser.add_argument("--dry-run", action="store_true", help="Dry run — log keys but don't inject")
    args = parser.parse_args()

    session = detect_session_type()
    log.info("Desktop session type: %s", session)

    # Build keyboard adapter
    if args.dry_run:
        from input.dry_run_adapter import DryRunAdapter
        kb_adapter = DryRunAdapter()
        log.info("Dry-run mode enabled.")
    else:
        kb_adapter = build_keyboard_adapter(session)

    # Load profile/mapping engine
    from controller.mapping_engine import MappingEngine
    mapping_engine = MappingEngine(args.config)
    log.info("Loaded mapping profile: %s", mapping_engine.active_profile_name)

    # Build WebSocket server
    from transport.websocket_server import WebSocketServer
    server = WebSocketServer(
        host=args.host,
        port=args.port,
        kb_adapter=kb_adapter,
        mapping_engine=mapping_engine,
    )

    # Handle Ctrl+C gracefully
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown(server, kb_adapter)))

    print()
    print("═" * 52)
    print("  🎮  Phone-to-Laptop Game Controller Agent")
    print("═" * 52)
    print(f"  Server  : ws://{args.host}:{args.port}")
    print(f"  Session : {session}")
    print(f"  Profile : {mapping_engine.active_profile_name}")
    print()
    print("  On your phone, open the controller website and")
    print(f"  connect to this laptop's IP on port {args.port}.")
    print()
    print("  Press Ctrl+C to stop.")
    print("═" * 52)
    print()

    await server.start()


async def shutdown(server, kb_adapter):
    log.info("Shutting down...")
    await server.stop()
    kb_adapter.release_all()
    kb_adapter.close()
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
