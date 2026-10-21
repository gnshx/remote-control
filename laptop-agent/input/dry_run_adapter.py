"""
input/dry_run_adapter.py
Dry-run keyboard adapter — logs key events but does NOT inject them.
Useful for testing the pipeline without needing display permissions.
"""

import logging
from typing import Set
import time

log = logging.getLogger("dry_run_adapter")

TAP_DURATION = 0.05


class DryRunAdapter:
    def __init__(self):
        self._pressed: Set[str] = set()
        log.info("DryRunAdapter active — keys will be logged, NOT injected")

    def press(self, key_name: str):
        if key_name not in self._pressed:
            self._pressed.add(key_name)
            log.info("[DRY RUN] PRESS   → %s  (held: %s)", key_name, self._pressed)

    def release(self, key_name: str):
        if key_name in self._pressed:
            self._pressed.discard(key_name)
            log.info("[DRY RUN] RELEASE → %s  (held: %s)", key_name, self._pressed)

    def tap(self, key_name: str, duration: float = TAP_DURATION):
        log.info("[DRY RUN] TAP     → %s", key_name)

    def release_all(self):
        if self._pressed:
            log.info("[DRY RUN] RELEASE ALL → %s", self._pressed)
        self._pressed.clear()

    def close(self):
        self.release_all()

    @property
    def pressed_keys(self) -> Set[str]:
        return set(self._pressed)
