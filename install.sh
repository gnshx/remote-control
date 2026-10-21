#!/usr/bin/env bash
# ==============================================================================
# Phone-to-Laptop Game Controller — Automated Linux Installer
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}  🎮 Installing Phone-to-Laptop Wireless Gamepad Controller 🎮  ${NC}"
echo -e "${BLUE}================================================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Check Python version
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}[ERROR] Python 3 is not installed. Please install python3 and python3-venv.${NC}"
    exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "${GREEN}✓ Found Python ${PY_VERSION}${NC}"

# 2. Setup Virtual Environment
if [ ! -d ".venv" ]; then
    echo -e "${BLUE}Creating Python virtual environment in .venv...${NC}"
    python3 -m venv .venv
fi

echo -e "${BLUE}Installing/updating dependencies...${NC}"
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r laptop-agent/requirements.txt --quiet
.venv/bin/pip install -e . --quiet
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# 3. Configure uinput udev rule for passwordless Wayland & X11 input
echo -e "${BLUE}Configuring Linux uinput permissions...${NC}"
UDEV_RULE_PATH="/etc/udev/rules.d/99-uinput-gamepad.rules"

if [ ! -f "$UDEV_RULE_PATH" ]; then
    echo -e "${YELLOW}Notice: Setting up udev rule to allow passwordless gamepad control on Wayland/Linux.${NC}"
    echo -e "${YELLOW}You may be prompted for your sudo password once to install the rule:${NC}"
    if command -v sudo &>/dev/null; then
        sudo bash -c "echo 'KERNEL==\"uinput\", MODE=\"0660\", GROUP=\"input\", TAG+=\"uaccess\"' > $UDEV_RULE_PATH"
        sudo udevadm control --reload-rules && sudo udevadm trigger || true
        sudo usermod -a -G input "$USER" || true
        sudo chmod 666 /dev/uinput 2>/dev/null || true
        echo -e "${GREEN}✓ udev rule installed to ${UDEV_RULE_PATH}${NC}"
    else
        echo -e "${YELLOW}Skipping sudo udev configuration (sudo not found).${NC}"
    fi
else
    echo -e "${GREEN}✓ udev rule already exists${NC}"
fi

# Ensure /dev/uinput is currently writable
if [ -e /dev/uinput ] && [ ! -w /dev/uinput ]; then
    if command -v sudo &>/dev/null; then
        sudo chmod 666 /dev/uinput 2>/dev/null || true
    fi
fi

# 4. Create Desktop Launcher Entry
APPLICATIONS_DIR="$HOME/.local/share/applications"
if [ -d "$HOME/.local/share" ]; then
    mkdir -p "$APPLICATIONS_DIR"
    DESKTOP_FILE="$APPLICATIONS_DIR/phone-gamepad.desktop"
    cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Phone Gamepad
Comment=Turn your smartphone into a wireless game controller
Exec=bash -c "cd '$SCRIPT_DIR' && ./start.sh; read -p 'Press enter to close...'"
Terminal=true
Type=Application
Categories=Game;Utility;
Icon=input-gaming
Keywords=gamepad;controller;remote;smash karts;
EOF
    chmod +x "$DESKTOP_FILE"
    echo -e "${GREEN}✓ Desktop launcher installed to ${DESKTOP_FILE}${NC}"
fi

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}🎉 Installation Complete!${NC}"
echo -e "You can now launch the controller anytime by running:"
echo -e "  ${YELLOW}./start.sh${NC}"
echo -e "Or from your application launcher under ${YELLOW}Phone Gamepad${NC}."
echo -e "${BLUE}================================================================${NC}"
