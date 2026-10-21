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
    echo "  📦 Installing required dependencies (websockets, pynput, qrcode)..."
    .venv/bin/pip install --quiet --upgrade pip
    .venv/bin/pip install --quiet -r laptop-agent/requirements.txt
    echo "  ✅ Setup complete!"
    echo "=========================================================="
fi

# 2. Check if dependencies are installed in .venv
if ! .venv/bin/python -c "import pynput, qrcode, websockets" >/dev/null 2>&1; then
    echo "  📦 Updating missing dependencies in virtual environment..."
    .venv/bin/pip install --quiet -r laptop-agent/requirements.txt
fi

PYTHON_BIN=".venv/bin/python"

echo "Starting Phone-to-Laptop Game Controller..."
"$PYTHON_BIN" run.py "$@"
