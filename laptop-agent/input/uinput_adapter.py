"""
input/uinput_adapter.py
Keyboard adapter using Linux uinput (evdev).
Works on both X11 and Wayland but requires elevated permissions
(user must be in 'input' group or run with sudo).

Install: pip install evdev
Add user to input group: sudo usermod -aG input $USER  (then re-login)
"""

import logging
import time
from typing import Set

try:
    import evdev
    from evdev import UInput, ecodes as e
except ImportError:
    raise ImportError("evdev not found. Install with: pip install evdev")

log = logging.getLogger("uinput_adapter")

TAP_DURATION = 0.05

# Map system key name → evdev key code
_EVDEV_MAP = {
    "a": e.KEY_A, "b": e.KEY_B, "c": e.KEY_C, "d": e.KEY_D, "e": e.KEY_E,
    "f": e.KEY_F, "g": e.KEY_G, "h": e.KEY_H, "i": e.KEY_I, "j": e.KEY_J,
    "k": e.KEY_K, "l": e.KEY_L, "m": e.KEY_M, "n": e.KEY_N, "o": e.KEY_O,
    "p": e.KEY_P, "q": e.KEY_Q, "r": e.KEY_R, "s": e.KEY_S, "t": e.KEY_T,
    "u": e.KEY_U, "v": e.KEY_V, "w": e.KEY_W, "x": e.KEY_X, "y": e.KEY_Y,
    "z": e.KEY_Z,
    "0": e.KEY_0, "1": e.KEY_1, "2": e.KEY_2, "3": e.KEY_3, "4": e.KEY_4,
    "5": e.KEY_5, "6": e.KEY_6, "7": e.KEY_7, "8": e.KEY_8, "9": e.KEY_9,
    "space":  e.KEY_SPACE,
    "enter":  e.KEY_ENTER,
    "esc":    e.KEY_ESC,
    "tab":    e.KEY_TAB,
    "shift":  e.KEY_LEFTSHIFT,
    "ctrl":   e.KEY_LEFTCTRL,
    "alt":    e.KEY_LEFTALT,
    "up":     e.KEY_UP,
    "down":   e.KEY_DOWN,
    "left":   e.KEY_LEFT,
    "right":  e.KEY_RIGHT,
    "f1":  e.KEY_F1,  "f2":  e.KEY_F2,  "f3":  e.KEY_F3,  "f4":  e.KEY_F4,
    "f5":  e.KEY_F5,  "f6":  e.KEY_F6,  "f7":  e.KEY_F7,  "f8":  e.KEY_F8,
    "f9":  e.KEY_F9,  "f10": e.KEY_F10, "f11": e.KEY_F11, "f12": e.KEY_F12,
}


class UInputAdapter:
    def __init__(self):
        # Create a virtual keyboard device
        cap = {e.EV_KEY: list(_EVDEV_MAP.values())}
        self._ui = UInput(cap, name="gamepad-controller", version=0x3)
        self._pressed: Set[str] = set()
        log.info("uinput virtual keyboard created")

    def _get_code(self, key_name: str):
        code = _EVDEV_MAP.get(key_name.lower())
        if code is None:
            log.warning("Unknown key: '%s'", key_name)
        return code

    def press(self, key_name: str):
        if key_name in self._pressed:
            return
        code = self._get_code(key_name)
        if code is not None:
            self._ui.write(e.EV_KEY, code, 1)  # 1 = key down
            self._ui.syn()
            self._pressed.add(key_name)

    def release(self, key_name: str):
        if key_name not in self._pressed:
            return
        code = self._get_code(key_name)
        if code is not None:
            self._ui.write(e.EV_KEY, code, 0)  # 0 = key up
            self._ui.syn()
            self._pressed.discard(key_name)

    def tap(self, key_name: str, duration: float = TAP_DURATION):
        code = self._get_code(key_name)
        if code is not None:
            self._ui.write(e.EV_KEY, code, 1)
            self._ui.syn()
            time.sleep(duration)
            self._ui.write(e.EV_KEY, code, 0)
            self._ui.syn()

    def release_all(self):
        for k in list(self._pressed):
            self.release(k)
        self._pressed.clear()

    def close(self):
        self.release_all()
        self._ui.close()
