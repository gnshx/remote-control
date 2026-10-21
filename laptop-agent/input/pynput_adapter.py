"""
input/pynput_adapter.py
Keyboard adapter using the pynput library.
Works on X11 and many Wayland compositors.

Install: pip install pynput
"""

import logging
import time
from typing import Set

try:
    from pynput.keyboard import Key, Controller as KbController
except ImportError:
    raise ImportError("pynput not found. Install with: pip install pynput")

log = logging.getLogger("pynput_adapter")

# Map system key name → pynput Key or character
_KEY_MAP = {
    "a": "a", "b": "b", "c": "c", "d": "d", "e": "e",
    "f": "f", "g": "g", "h": "h", "i": "i", "j": "j",
    "k": "k", "l": "l", "m": "m", "n": "n", "o": "o",
    "p": "p", "q": "q", "r": "r", "s": "s", "t": "t",
    "u": "u", "v": "v", "w": "w", "x": "x", "y": "y", "z": "z",
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "space":  Key.space,
    "enter":  Key.enter,
    "esc":    Key.esc,
    "tab":    Key.tab,
    "shift":  Key.shift,
    "ctrl":   Key.ctrl,
    "alt":    Key.alt,
    "up":     Key.up,
    "down":   Key.down,
    "left":   Key.left,
    "right":  Key.right,
    "f1":  Key.f1,  "f2":  Key.f2,  "f3":  Key.f3,  "f4":  Key.f4,
    "f5":  Key.f5,  "f6":  Key.f6,  "f7":  Key.f7,  "f8":  Key.f8,
    "f9":  Key.f9,  "f10": Key.f10, "f11": Key.f11, "f12": Key.f12,
}

TAP_DURATION = 0.05  # seconds


class PynputAdapter:
    """Keyboard adapter using pynput."""

    def __init__(self):
        self._kb: KbController = KbController()
        self._pressed: Set[str] = set()

    def _resolve(self, key_name: str):
        """Resolve a system key name to a pynput key or char."""
        resolved = _KEY_MAP.get(key_name.lower())
        if resolved is None:
            # Try single character fallback
            if len(key_name) == 1:
                return key_name
            log.warning("Unknown key: '%s'", key_name)
        return resolved

    def press(self, key_name: str):
        """Press and hold a key."""
        if key_name in self._pressed:
            return
        key = self._resolve(key_name)
        if key is None:
            return
        try:
            self._kb.press(key)
            self._pressed.add(key_name)
            log.debug("PRESS %s", key_name)
        except Exception as e:
            log.error("Failed to press '%s': %s", key_name, e)

    def release(self, key_name: str):
        """Release a held key."""
        if key_name not in self._pressed:
            return
        key = self._resolve(key_name)
        if key is None:
            return
        try:
            self._kb.release(key)
            self._pressed.discard(key_name)
            log.debug("RELEASE %s", key_name)
        except Exception as e:
            log.error("Failed to release '%s': %s", key_name, e)

    def tap(self, key_name: str, duration: float = TAP_DURATION):
        """Press and quickly release a key (tap)."""
        key = self._resolve(key_name)
        if key is None:
            return
        try:
            self._kb.press(key)
            time.sleep(duration)
            self._kb.release(key)
            log.debug("TAP %s", key_name)
        except Exception as e:
            log.error("Failed to tap '%s': %s", key_name, e)

    def release_all(self):
        """Release every currently held key."""
        for key_name in list(self._pressed):
            self.release(key_name)
        self._pressed.clear()

    def close(self):
        self.release_all()

    @property
    def pressed_keys(self) -> Set[str]:
        return set(self._pressed)
