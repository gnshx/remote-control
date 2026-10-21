"""
safety/watchdog.py
Connection watchdog — releases all keys if controller messages
stop arriving within the configured timeout.
"""

import asyncio
import logging
import threading
from typing import Callable, Optional

log = logging.getLogger("watchdog")


class Watchdog:
    """
    Thread-safe watchdog timer.
    Calls `callback` if `reset()` is not called within `timeout` seconds.
    """

    def __init__(self, timeout: float, callback: Callable[[], None]):
        self._timeout  = timeout
        self._callback = callback
        self._timer: Optional[threading.Timer] = None
        self._lock = threading.Lock()

    def reset(self):
        """Call this on every received message to prevent the watchdog from firing."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(self._timeout, self._fire)
            self._timer.daemon = True
            self._timer.start()

    def cancel(self):
        """Permanently disarm the watchdog."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
                self._timer = None

    def _fire(self):
        log.warning("Watchdog fired after %.1fs of silence — releasing all keys", self._timeout)
        try:
            self._callback()
        except Exception as e:
            log.error("Watchdog callback error: %s", e)
