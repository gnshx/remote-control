"""
reverse-agent/adb_bridge.py — Android Debug Bridge (ADB) Input Injection Engine
Injects taps, swipes, and gamepad keys into an Android phone over Wireless or USB ADB.
"""

import logging
import os
import re
import shutil
import subprocess
import threading
import time
from typing import Dict, List, Optional, Tuple

log = logging.getLogger("adb_bridge")


class ADBBridge:
    def __init__(self, target_device: Optional[str] = None):
        """
        :param target_device: Optional device serial or IP:PORT (e.g. "192.168.1.15:5555")
        """
        self.adb_bin = shutil.which("adb") or "adb"
        self.target_device = target_device
        self.connected = False
        self.device_model = "Unknown Device"
        self.screen_width = 2400
        self.screen_height = 1080
        self._lock = threading.Lock()
        self.is_dry_run = False

    def is_adb_installed(self) -> bool:
        """Check if adb executable is available on host system."""
        return shutil.which("adb") is not None

    def connect(self, host: str, port: int = 5555) -> Tuple[bool, str]:
        """Connect to an Android device over Wi-Fi (Wireless Debugging)."""
        target = f"{host}:{port}"
        self.target_device = target

        if not self.is_adb_installed():
            log.warning("adb binary not found in system PATH. Running in ADB Simulator / Dry-Run mode.")
            self.connected = True
            self.is_dry_run = True
            self.device_model = f"Simulated Device ({target})"
            return True, f"Running in Dry-Run mode (Install adb for real device: sudo apt install adb)"

        try:
            res = subprocess.run(
                [self.adb_bin, "connect", target],
                capture_output=True,
                text=True,
                timeout=5,
            )
            out = res.stdout.strip()
            log.info("adb connect %s: %s", target, out)

            if "connected to" in out.lower() or "already connected" in out.lower():
                self.connected = True
                self.is_dry_run = False
                self._fetch_device_info()
                return True, f"Connected to {self.device_model} ({target})"
            else:
                self.connected = False
                return False, out or "Failed to connect to phone. Make sure Wireless Debugging is ON."
        except Exception as e:
            log.error("adb connect error: %s", e)
            self.connected = False
            return False, str(e)

    def disconnect(self):
        """Disconnect wireless ADB session."""
        if self.target_device and not self.is_dry_run and self.is_adb_installed():
            try:
                subprocess.run([self.adb_bin, "disconnect", self.target_device], capture_output=True, timeout=3)
            except Exception:
                pass
        self.connected = False
        self.target_device = None

    def auto_detect(self) -> List[Dict[str, str]]:
        """List all USB and Wi-Fi devices currently attached."""
        if not self.is_adb_installed():
            return []
        try:
            res = subprocess.run([self.adb_bin, "devices", "-l"], capture_output=True, text=True, timeout=3)
            devices = []
            for line in res.stdout.splitlines()[1:]:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    serial = parts[0]
                    model = "Android Device"
                    for p in parts[2:]:
                        if p.startswith("model:"):
                            model = p.split(":", 1)[1]
                    devices.append({"serial": serial, "model": model})
            return devices
        except Exception:
            return []

    def _fetch_device_info(self):
        """Fetch screen resolution and model name from device."""
        if not self.is_adb_installed() or self.is_dry_run:
            return
        try:
            # Model name
            res = subprocess.run(
                self._cmd(["shell", "getprop", "ro.product.model"]),
                capture_output=True,
                text=True,
                timeout=2,
            )
            if res.stdout.strip():
                self.device_model = res.stdout.strip()

            # Screen size (e.g. Physical size: 1080x2400)
            res_size = subprocess.run(
                self._cmd(["shell", "wm", "size"]),
                capture_output=True,
                text=True,
                timeout=2,
            )
            match = re.search(r"(\d+)x(\d+)", res_size.stdout)
            if match:
                w, h = int(match.group(1)), int(match.group(2))
                # For games in landscape, width is usually the larger dimension
                self.screen_width = max(w, h)
                self.screen_height = min(w, h)
                log.info("Device resolution: %dx%d (Landscape)", self.screen_width, self.screen_height)
        except Exception as e:
            log.debug("Could not fetch device info: %s", e)

    def _cmd(self, args: List[str]) -> List[str]:
        cmd = [self.adb_bin]
        if self.target_device:
            cmd.extend(["-s", self.target_device])
        cmd.extend(args)
        return cmd

    # ── Touch & Gesture Injection ──────────────────────────────────────────

    def tap(self, x: int, y: int):
        """Simulate an instantaneous screen tap at (x, y)."""
        if self.is_dry_run or not self.is_adb_installed():
            log.debug("[DRY RUN] TAP at (%d, %d)", x, y)
            return

        cmd = self._cmd(["shell", "input", "tap", str(int(x)), str(int(y))])
        # Fire asynchronously without blocking the loop
        threading.Thread(target=self._run_cmd_async, args=(cmd,), daemon=True).start()

    def swipe(self, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 100):
        """Simulate a swipe gesture (e.g. for analog stick, driving, or camera aim)."""
        if self.is_dry_run or not self.is_adb_installed():
            log.debug("[DRY RUN] SWIPE (%d, %d) -> (%d, %d) [%dms]", x1, y1, x2, y2, duration_ms)
            return

        cmd = self._cmd([
            "shell", "input", "swipe",
            str(int(x1)), str(int(y1)),
            str(int(x2)), str(int(y2)),
            str(int(duration_ms))
        ])
        threading.Thread(target=self._run_cmd_async, args=(cmd,), daemon=True).start()

    def keyevent(self, keycode: str):
        """
        Send native Android Keycode (e.g. 'KEYCODE_BUTTON_A', 'KEYCODE_DPAD_UP', 'KEYCODE_SPACE').
        """
        if self.is_dry_run or not self.is_adb_installed():
            log.debug("[DRY RUN] KEYEVENT %s", keycode)
            return

        cmd = self._cmd(["shell", "input", "keyevent", keycode])
        threading.Thread(target=self._run_cmd_async, args=(cmd,), daemon=True).start()

    def _run_cmd_async(self, cmd: List[str]):
        try:
            subprocess.run(cmd, capture_output=True, timeout=2)
        except Exception as e:
            log.debug("Async command failed: %s", e)
