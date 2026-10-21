/**
 * joystick.js — Virtual joystick with pointer events
 * High-performance, low-latency touch joystick
 */

'use strict';

class VirtualJoystick {
  /**
   * @param {HTMLElement} base   - The outer circle element
   * @param {HTMLElement} thumb  - The inner draggable circle
   * @param {Object} options
   */
  constructor(base, thumb, options = {}) {
    this.base   = base;
    this.thumb  = thumb;

    this.opts = {
      deadZone:      options.deadZone      ?? 0.12,  // 12% center dead zone
      maxRadius:     options.maxRadius     ?? null,  // auto-computed
      onMove:        options.onMove        ?? null,  // (x, y, dirs) => void
      onRelease:     options.onRelease     ?? null,  // () => void
      updateInterval: options.updateInterval ?? 16,  // ms between updates (~60fps)
    };

    // State
    this._active      = false;
    this._pointerId   = null;
    this._originX     = 0;
    this._originY     = 0;
    this._rawX        = 0;  // normalized -1..1
    this._rawY        = 0;
    this._dirs        = new Set();
    this._lastDirs    = new Set();
    this._intervalId  = null;
    this._raf         = null;

    this._computeGeometry();
    this._bind();
  }

  _computeGeometry() {
    const rect = this.base.getBoundingClientRect();
    this._cx = rect.left + rect.width  / 2;
    this._cy = rect.top  + rect.height / 2;
    this._maxR = (this.opts.maxRadius ?? (rect.width / 2)) * 0.8;
  }

  _bind() {
    // Use pointer events for best cross-device support
    this.base.addEventListener('pointerdown',  this._onDown.bind(this),   { passive: false });
    window.addEventListener   ('pointermove',  this._onMove.bind(this),   { passive: true  });
    window.addEventListener   ('pointerup',    this._onUp.bind(this),     { passive: true  });
    window.addEventListener   ('pointercancel',this._onUp.bind(this),     { passive: true  });
    window.addEventListener   ('resize',       this._onResize.bind(this), { passive: true  });
  }

  _onDown(e) {
    if (this._active) return;
    e.preventDefault();

    this._active    = true;
    this._pointerId = e.pointerId;
    this.base.setPointerCapture(e.pointerId);

    this._computeGeometry();
    this._originX = this._cx;
    this._originY = this._cy;

    this.thumb.classList.add('active');
    this._updateThumb(e.clientX, e.clientY);

    // Start periodic update loop (for held direction)
    this._intervalId = setInterval(() => this._emit(), this.opts.updateInterval);
  }

  _onMove(e) {
    if (!this._active || e.pointerId !== this._pointerId) return;
    this._updateThumb(e.clientX, e.clientY);
  }

  _onUp(e) {
    if (!this._active || (e.pointerId !== this._pointerId && e.type !== 'pointercancel')) return;
    this._release();
  }

  _onResize() {
    this._computeGeometry();
  }

  _updateThumb(clientX, clientY) {
    const dx = clientX - this._originX;
    const dy = clientY - this._originY;
    const dist = Math.hypot(dx, dy);

    let clampedDist = Math.min(dist, this._maxR);
    let angle = Math.atan2(dy, dx);

    const px = Math.cos(angle) * clampedDist;
    const py = Math.sin(angle) * clampedDist;

    // Move thumb visually
    this.thumb.style.transform = `translate(${px}px, ${py}px)`;

    // Normalize -1..1
    this._rawX = dist > 0 ? (Math.cos(angle) * clampedDist) / this._maxR : 0;
    this._rawY = dist > 0 ? (Math.sin(angle) * clampedDist) / this._maxR : 0;

    this._computeDirs();
    this._highlightArrows();
  }

  _computeDirs() {
    const dz = this.opts.deadZone;
    const dirs = new Set();

    if (this._rawY < -dz) dirs.add('up');
    if (this._rawY >  dz) dirs.add('down');
    if (this._rawX < -dz) dirs.add('left');
    if (this._rawX >  dz) dirs.add('right');

    this._dirs = dirs;
  }

  _highlightArrows() {
    const arr = this.base.querySelectorAll('.arr');
    arr.forEach(el => el.classList.remove('bright'));
    if (this._dirs.has('up'))    this.base.querySelector('.arr-top')?.classList.add('bright');
    if (this._dirs.has('down'))  this.base.querySelector('.arr-bottom')?.classList.add('bright');
    if (this._dirs.has('left'))  this.base.querySelector('.arr-left')?.classList.add('bright');
    if (this._dirs.has('right')) this.base.querySelector('.arr-right')?.classList.add('bright');
  }

  _emit() {
    if (!this._active) return;
    if (this.opts.onMove) {
      this.opts.onMove(this._rawX, this._rawY, new Set(this._dirs));
    }
  }

  _release() {
    if (!this._active) return;
    this._active    = false;
    this._pointerId = null;
    this._rawX      = 0;
    this._rawY      = 0;
    this._dirs      = new Set();

    clearInterval(this._intervalId);
    this._intervalId = null;

    // Animate back to center
    this.thumb.style.transform = 'translate(0px, 0px)';
    this.thumb.classList.remove('active');

    // Clear arrow highlights
    this.base.querySelectorAll('.arr').forEach(el => el.classList.remove('bright'));

    if (this.opts.onRelease) this.opts.onRelease();
  }

  // Public API
  get isActive()   { return this._active; }
  get directions() { return new Set(this._dirs); }
  get x()          { return this._rawX; }
  get y()          { return this._rawY; }

  destroy() {
    clearInterval(this._intervalId);
  }
}

window.VirtualJoystick = VirtualJoystick;
