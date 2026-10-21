"""
input/xtest_adapter.py
Keyboard adapter using python-xlib's XTest extension.
Only works on X11 sessions.

Install: pip install python-xlib
"""

import logging
import time
from typing import Set

try:
    from Xlib import X, display as xdisplay
    from Xlib.ext import xtest
    import Xlib.XK as XK
except ImportError:
    raise ImportError("python-xlib not found. Install with: pip install python-xlib")

log = logging.getLogger("xtest_adapter")

TAP_DURATION = 0.05

# Map system key name → X11 keysym name
_KEYSYM_MAP = {
    "a": "a", "b": "b", "c": "c", "d": "d", "e": "e",
    "f": "f", "g": "g", "h": "h", "i": "i", "j": "j",
    "k": "k", "l": "l", "m": "m", "n": "n", "o": "o",
    "p": "p", "q": "q", "r": "r", "s": "s", "t": "t",
    "u": "u", "v": "v", "w": "w", "x": "x", "y": "y", "z": "z",
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "space":  "space",
    "enter":  "Return",
    "esc":    "Escape",
    "tab":    "Tab",
    "shift":  "Shift_L",
    "ctrl":   "Control_L",
    "alt":    "Alt_L",
    "up":     "Up",
    "down":   "Down",
    "left":   "Left",
    "right":  "Right",
    "f1":  "F1",  "f2":  "F2",  "f3":  "F3",  "f4":  "F4",
    "f5":  "F5",  "f6":  "F6",  "f7":  "F7",  "f8":  "F8",
    "f9":  "F9",  "f10": "F10", "f11": "F11", "f12": "F12",
}


class XTestAdapter:
    def __init__(self):
        self._display = xdisplay.Display()
        self._pressed: Set[str] = set()
        log.info("XTest adapter initialized on display %s", self._display.get_display_name())

    def _get_keycode(self, key_name: str):
        keysym_name = _KEYSYM_MAP.get(key_name.lower(), key_name)
        keysym = XK.string_to_keysym(keysym_name)
        if keysym == 0:
            log.warning("Unknown keysym for '%s'", key_name)
            return None
        keycode = self._display.keysym_to_keycode(keysym)
        if keycode == 0:
            log.warning("No keycode for keysym '%s'", keysym_name)
            return None
        return keycode

    def press(self, key_name: str):
        if key_name in self._pressed:
            return
        kc = self._get_keycode(key_name)
        if kc:
            xtest.fake_input(self._display, X.KeyPress, kc)
            self._display.flush()
            self._pressed.add(key_name)
            log.debug("PRESS %s (kc=%d)", key_name, kc)

    def release(self, key_name: str):
        if key_name not in self._pressed:
            return
        kc = self._get_keycode(key_name)
        if kc:
            xtest.fake_input(self._display, X.KeyRelease, kc)
            self._display.flush()
            self._pressed.discard(key_name)
            log.debug("RELEASE %s", key_name)

    def tap(self, key_name: str, duration: float = TAP_DURATION):
        kc = self._get_keycode(key_name)
        if kc:
            xtest.fake_input(self._display, X.KeyPress, kc)
            self._display.flush()
            time.sleep(duration)
            xtest.fake_input(self._display, X.KeyRelease, kc)
            self._display.flush()
            log.debug("TAP %s", key_name)

    def release_all(self):
        for k in list(self._pressed):
            self.release(k)
        self._pressed.clear()

    def close(self):
        self.release_all()
        self._display.close()
