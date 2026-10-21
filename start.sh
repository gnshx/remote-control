#!/usr/bin/env bash
# Quick start script for Phone-to-Laptop Game Controller

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Automatic virtual environment setup for new users
if [ ! -d ".venv" ]; then
    echo "=========================================================="
    echo "  🚀 First-Time Setup: Preparing Python Environment...    "
    echo "=========================================================="
    python3 -m venv .venv
    echo "  📦 Installing required dependencies (websockets, pynput, qrcode, evdev)..."
    .venv/bin/pip install --quiet --upgrade pip
    .venv/bin/pip install --quiet -r laptop-agent/requirements.txt
    echo "  ✅ Setup complete!"
    echo "=========================================================="
fi

# 2. Check if dependencies are installed in .venv
if ! .venv/bin/python -c "import pynput, qrcode, websockets, evdev" >/dev/null 2>&1; then
    echo "  📦 Updating missing dependencies in virtual environment..."
    .venv/bin/pip install --quiet -r laptop-agent/requirements.txt
fi

# 3. Handle Wayland uinput permissions
IS_WAYLAND=false
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    IS_WAYLAND=true
fi

if [ "$IS_WAYLAND" = true ] && [ -e /dev/uinput ] && [ ! -w /dev/uinput ]; then
    echo ""
    echo "=========================================================="
    echo "  🛡️  Wayland Desktop Detected"
    echo "  Granting virtual keyboard permission (/dev/uinput)..."
    echo "=========================================================="
    sudo chmod 666 /dev/uinput || echo "  ⚠️  Could not set /dev/uinput permissions. Run 'sudo chmod 666 /dev/uinput' manually."
    echo ""
fi

PYTHON_BIN=".venv/bin/python"

if [[ " $* " =~ " --reverse " ]]; then
    echo "=========================================================="
    echo "  📱  LAPTOP-TO-PHONE REVERSE CONTROLLER MODE ACTIVE     "
    echo "=========================================================="
    echo "Starting Laptop-to-Phone Reverse Controller..."
else
    echo "Starting Phone-to-Laptop Game Controller..."
fi

"$PYTHON_BIN" run.py "$@"
