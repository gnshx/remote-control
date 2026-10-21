"""
controller/mapping_engine.py
Maps protocol-level key names (e.g. "W", "SPACE", "SHIFT")
to system-level key names that the keyboard adapter understands.
Supports multiple named profiles stored in config/profiles.json.
"""

import json
import logging
import os
from typing import Dict, Optional

log = logging.getLogger("mapping_engine")

# ── Protocol key → pynput key name mapping ───────────────────────────────────
# These are the keys the phone can send. Map to pynput-compatible names.
PROTOCOL_KEY_MAP: Dict[str, str] = {
    "A": "a", "B": "b", "C": "c", "D": "d", "E": "e",
    "F": "f", "G": "g", "H": "h", "I": "i", "J": "j",
    "K": "k", "L": "l", "M": "m", "N": "n", "O": "o",
    "P": "p", "Q": "q", "R": "r", "S": "s", "T": "t",
    "U": "u", "V": "v", "W": "w", "X": "x", "Y": "y", "Z": "z",
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "SPACE":  "space",
    "ENTER":  "enter",
    "ESCAPE": "esc",
    "TAB":    "tab",
    "SHIFT":  "shift",
    "CTRL":   "ctrl",
    "ALT":    "alt",
    "UP":     "up",
    "DOWN":   "down",
    "LEFT":   "left",
    "RIGHT":  "right",
    "F1":  "f1",  "F2":  "f2",  "F3":  "f3",  "F4":  "f4",
    "F5":  "f5",  "F6":  "f6",  "F7":  "f7",  "F8":  "f8",
    "F9":  "f9",  "F10": "f10", "F11": "f11", "F12": "f12",
}

# ── Default profiles ──────────────────────────────────────────────────────────
DEFAULT_PROFILES = {
    "smash_karts": {
        "name": "Smash Karts",
        "mappings": {
            "move_up":    {"key": "W",     "mode": "hold"},
            "move_down":  {"key": "S",     "mode": "hold"},
            "move_left":  {"key": "A",     "mode": "hold"},
            "move_right": {"key": "D",     "mode": "hold"},
            "fire":       {"key": "SPACE", "mode": "hold"},
            "special":    {"key": "E",     "mode": "tap"},
            "item":       {"key": "Q",     "mode": "tap"},
            "brake":      {"key": "SHIFT", "mode": "hold"},
        }
    },
    "wasd": {
        "name": "WASD Generic",
        "mappings": {
            "move_up":    {"key": "W",     "mode": "hold"},
            "move_down":  {"key": "S",     "mode": "hold"},
            "move_left":  {"key": "A",     "mode": "hold"},
            "move_right": {"key": "D",     "mode": "hold"},
            "fire":       {"key": "SPACE", "mode": "hold"},
            "special":    {"key": "E",     "mode": "tap"},
            "item":       {"key": "F",     "mode": "tap"},
            "brake":      {"key": "SHIFT", "mode": "hold"},
        }
    },
    "arrows": {
        "name": "Arrow Keys",
        "mappings": {
            "move_up":    {"key": "UP",    "mode": "hold"},
            "move_down":  {"key": "DOWN",  "mode": "hold"},
            "move_left":  {"key": "LEFT",  "mode": "hold"},
            "move_right": {"key": "RIGHT", "mode": "hold"},
            "fire":       {"key": "SPACE", "mode": "hold"},
            "special":    {"key": "Z",     "mode": "tap"},
            "item":       {"key": "X",     "mode": "tap"},
            "brake":      {"key": "CTRL",  "mode": "hold"},
        }
    },
    "custom": {
        "name": "Custom",
        "mappings": {
            "move_up":    {"key": "W",     "mode": "hold"},
            "move_down":  {"key": "S",     "mode": "hold"},
            "move_left":  {"key": "A",     "mode": "hold"},
            "move_right": {"key": "D",     "mode": "hold"},
            "fire":       {"key": "SPACE", "mode": "hold"},
            "special":    {"key": "E",     "mode": "tap"},
            "item":       {"key": "Q",     "mode": "tap"},
            "brake":      {"key": "SHIFT", "mode": "hold"},
        }
    }
}


class MappingEngine:
    def __init__(self, config_path: str = "config/profiles.json"):
        self._config_path    = config_path
        self._profiles       = {}
        self._active_profile = "smash_karts"
        self._load_config()

    def _load_config(self):
        """Load profiles from disk, merging with defaults."""
        merged = {k: json.loads(json.dumps(v)) for k, v in DEFAULT_PROFILES.items()}

        if os.path.exists(self._config_path):
            try:
                with open(self._config_path) as f:
                    saved = json.load(f)
                active = saved.get("active_profile", "smash_karts")
                if active in merged:
                    self._active_profile = active
                for pid, pdata in saved.get("profiles", {}).items():
                    if pid in merged:
                        # Merge saved mappings on top of defaults
                        for cid, cdata in pdata.get("mappings", {}).items():
                            if cid in merged[pid]["mappings"]:
                                merged[pid]["mappings"][cid].update(cdata)
                log.info("Loaded profiles from %s", self._config_path)
            except Exception as e:
                log.warning("Could not load config: %s — using defaults", e)

        self._profiles = merged

    def save_config(self):
        """Persist current profiles to disk."""
        os.makedirs(os.path.dirname(self._config_path) or ".", exist_ok=True)
        data = {
            "active_profile": self._active_profile,
            "profiles": self._profiles,
        }
        with open(self._config_path, "w") as f:
            json.dump(data, f, indent=2)
        log.info("Saved config to %s", self._config_path)

    @property
    def active_profile_id(self) -> str:
        return self._active_profile

    @property
    def active_profile_name(self) -> str:
        return self._profiles.get(self._active_profile, {}).get("name", "Unknown")

    def set_active_profile(self, profile_id: str):
        if profile_id in self._profiles:
            self._active_profile = profile_id
            log.info("Active profile: %s (%s)", profile_id, self.active_profile_name)
        else:
            log.warning("Unknown profile '%s' — keeping %s", profile_id, self._active_profile)

    def resolve_raw_key(self, raw_key: str) -> Optional[str]:
        """
        Convert a raw protocol key string (e.g. "W", "SPACE") to
        the system key name the keyboard adapter expects.
        Returns None if the key is unknown.
        """
        normalized = raw_key.upper().strip()
        system_key = PROTOCOL_KEY_MAP.get(normalized)
        if system_key is None:
            # Allow single lowercase chars to pass through
            if len(normalized) == 1 and normalized.isalpha():
                return normalized.lower()
            log.debug("Unknown key: '%s'", raw_key)
        return system_key

    def get_active_mappings(self) -> dict:
        return self._profiles.get(self._active_profile, {}).get("mappings", {})
