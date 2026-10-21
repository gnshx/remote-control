#!/usr/bin/env bash
# Quick start script for Phone-to-Laptop Game Controller

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if .venv exists
if [ -d ".venv" ]; then
    PYTHON_BIN=".venv/bin/python"
else
    PYTHON_BIN="python3"
fi

echo "Starting Phone-to-Laptop Game Controller..."
"$PYTHON_BIN" run.py "$@"
