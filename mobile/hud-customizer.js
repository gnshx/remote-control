/**
 * hud-customizer.js — HUD Position Dragging, Resizing & Customization Engine
 * Allows moving joysticks, buttons, pedals, and D-pad anywhere on screen and scaling them individually or globally.
 */

'use strict';

const ZONE_METADATA = {
  'action-left':   { name: '🕹️ Joystick', defaultX: 0, defaultY: 0 },
  'action-right':  { name: '🎯 Action Buttons', defaultX: 0, defaultY: 0 },
  'racing-left':   { name: '🚗 Steer & Aux', defaultX: 0, defaultY: 0 },
  'racing-right':  { name: '⛽ Gas & Brake Pedals', defaultX: 0, defaultY: 0 },
  'dpad-left':     { name: '🧭 4-Way D-Pad', defaultX: 0, defaultY: 0 },
  'dpad-right':    { name: '💎 Diamond ABXY', defaultX: 0, defaultY: 0 },
  'minimal-left':  { name: '◀▶ Steer Pads', defaultX: 0, defaultY: 0 },
  'minimal-right': { name: '🛑 Pedals Pad', defaultX: 0, defaultY: 0 },
};

class HudCustomizer {
  constructor() {
    this.isEditing = false;
    this.activeLayoutId = 'action';
    this.selectedZoneId = null;
    this.layoutConfigs = {}; // layoutId -> { scale: 1.0, opacity: 1.0, zones: { [zoneId]: { x, y, scale } } }
    this.activeDrag = null;  // { el, zoneId, startX, startY, origX, origY, pointerId }

    // DOM Refs
    this.editBar         = null;
    this.zoneSelect      = null;
    this.zoneScaleSlider = null;
    this.zoneScaleVal    = null;
    this.layoutScaleSlider = null;
    this.layoutScaleVal  = null;
    this.opacitySlider   = null;
    this.opacityVal      = null;

    this._loadAll();
  }

  init() {
    this.editBar           = document.getElementById('hud-edit-bar');
    this.zoneSelect        = document.getElementById('hud-zone-select');
    this.zoneScaleSlider   = document.getElementById('hud-zone-scale-slider');
    this.zoneScaleVal      = document.getElementById('hud-zone-scale-val');
    this.layoutScaleSlider = document.getElementById('hud-layout-scale-slider');
    this.layoutScaleVal    = document.getElementById('hud-layout-scale-val');
    this.opacitySlider     = document.getElementById('hud-opacity-slider');
    this.opacityVal        = document.getElementById('hud-opacity-val');

    // Zone selector dropdown
    this.zoneSelect?.addEventListener('change', (e) => {
      this.selectZone(e.target.value);
    });

    // Individual Zone Scale Slider
    this.zoneScaleSlider?.addEventListener('input', (e) => {
      const scale = parseInt(e.target.value, 10) / 100;
      if (this.zoneScaleVal) this.zoneScaleVal.textContent = `${Math.round(scale * 100)}%`;
      if (this.selectedZoneId) {
        this.setZoneScale(this.selectedZoneId, scale);
      }
    });

    // Global Layout Scale Slider
    this.layoutScaleSlider?.addEventListener('input', (e) => {
      const scale = parseInt(e.target.value, 10) / 100;
      if (this.layoutScaleVal) this.layoutScaleVal.textContent = `${Math.round(scale * 100)}%`;
      this.setLayoutScale(this.activeLayoutId, scale);
    });

    // Opacity Slider
    this.opacitySlider?.addEventListener('input', (e) => {
      const opacity = parseInt(e.target.value, 10) / 100;
      if (this.opacityVal) this.opacityVal.textContent = `${Math.round(opacity * 100)}%`;
      this.setLayoutOpacity(this.activeLayoutId, opacity);
    });

    // Quick Size Presets (S, M, L, XL)
    document.querySelectorAll('.hud-preset-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const scale = parseFloat(btn.dataset.scale || '1.0');
        if (this.selectedZoneId) {
          this.setZoneScale(this.selectedZoneId, scale);
          if (this.zoneScaleSlider) this.zoneScaleSlider.value = Math.round(scale * 100);
          if (this.zoneScaleVal) this.zoneScaleVal.textContent = `${Math.round(scale * 100)}%`;
          this._updatePresetActive(scale);
          if (typeof toast === 'function') {
            const name = ZONE_METADATA[this.selectedZoneId]?.name || 'Control';
            toast(`📐 ${name} size: ${Math.round(scale * 100)}%`);
          }
        }
      });
    });

    // Reset Selected Zone Button
    document.getElementById('hud-reset-zone-btn')?.addEventListener('click', () => {
      if (this.selectedZoneId) {
        this.resetZone(this.selectedZoneId);
        const name = ZONE_METADATA[this.selectedZoneId]?.name || 'Control';
        if (typeof toast === 'function') toast(`↺ Reset ${name} to default`);
      }
    });

    // Reset All Layout Button
    document.getElementById('hud-reset-all-btn')?.addEventListener('click', () => {
      this.resetCurrentLayout();
      if (typeof toast === 'function') toast('↺ Reset entire HUD layout to defaults');
    });

    // Done Button
    document.getElementById('hud-done-btn')?.addEventListener('click', () => {
      this.setEditMode(false);
      if (typeof toast === 'function') toast('✅ Custom HUD layout & sizes saved!', 'success');
    });

    // Edit HUD toggle button in bottom bar
    document.getElementById('edit-hud-btn')?.addEventListener('click', () => {
      this.setEditMode(!this.isEditing);
    });

    this.bindDraggableZones();
    this.applyCurrentLayout();
  }

  // Bind pointer drag listeners to all customizable zones
  bindDraggableZones() {
    const zones = document.querySelectorAll('.hud-custom-zone');
    zones.forEach(zone => {
      zone.addEventListener('pointerdown', (e) => this._onPointerDown(e, zone));
      zone.addEventListener('pointermove', (e) => this._onPointerMove(e));
      zone.addEventListener('pointerup',   (e) => this._onPointerUp(e));
      zone.addEventListener('pointercancel',(e) => this._onPointerUp(e));
      
      // Tap to select zone in edit mode
      zone.addEventListener('click', (e) => {
        if (!this.isEditing) return;
        const zoneId = zone.dataset.zoneId;
        if (zoneId) this.selectZone(zoneId);
      });
    });
  }

  setActiveLayout(layoutId) {
    this.activeLayoutId = layoutId;
    this.selectedZoneId = null;
    this._populateZoneSelector();
    this.applyCurrentLayout();
  }

  setEditMode(enable) {
    this.isEditing = !!enable;
    const screen  = document.getElementById('controller-screen');
    const editBtn = document.getElementById('edit-hud-btn');

    if (this.isEditing) {
      screen?.classList.add('editing-hud');
      this.editBar?.classList.remove('hidden');
      if (editBtn) {
        editBtn.classList.add('active');
        editBtn.textContent = '✓ Done Editing';
      }

      this._populateZoneSelector();

      // Default select the first zone in the current layout
      const firstZone = document.querySelector(`#layout-${this.activeLayoutId} .hud-custom-zone`);
      if (firstZone?.dataset.zoneId) {
        this.selectZone(firstZone.dataset.zoneId);
      }

      // Update layout scale slider
      const config = this._getConfig(this.activeLayoutId);
      const scalePct = Math.round((config.scale || 1.0) * 100);
      if (this.layoutScaleSlider) this.layoutScaleSlider.value = scalePct;
      if (this.layoutScaleVal) this.layoutScaleVal.textContent = `${scalePct}%`;

      // Update opacity slider
      const opacityPct = Math.round((config.opacity !== undefined ? config.opacity : 1.0) * 100);
      if (this.opacitySlider) this.opacitySlider.value = opacityPct;
      if (this.opacityVal) this.opacityVal.textContent = `${opacityPct}%`;

      if (typeof toast === 'function') toast('📐 Drag controls to reposition • Tap S/M/L/XL to resize');
      if (typeof vibrate === 'function') vibrate([25]);
    } else {
      screen?.classList.remove('editing-hud');
      this.editBar?.classList.add('hidden');
      document.querySelectorAll('.hud-custom-zone').forEach(z => z.classList.remove('selected-zone'));
      if (editBtn) {
        editBtn.classList.remove('active');
        editBtn.textContent = '📐 Edit HUD';
      }
      this._saveAll();
    }
  }

  selectZone(zoneId) {
    this.selectedZoneId = zoneId;
    const config = this._getConfig(this.activeLayoutId);
    const zoneData = config.zones?.[zoneId] || { x: 0, y: 0, scale: 1.0 };
    const scale = zoneData.scale || 1.0;

    // Highlight selected zone
    document.querySelectorAll('.hud-custom-zone').forEach(z => {
      z.classList.toggle('selected-zone', z.dataset.zoneId === zoneId);
    });

    // Update Zone Dropdown
    if (this.zoneSelect && this.zoneSelect.value !== zoneId) {
      this.zoneSelect.value = zoneId;
    }

    // Update Zone Scale Slider & Val
    const scalePct = Math.round(scale * 100);
    if (this.zoneScaleSlider) this.zoneScaleSlider.value = scalePct;
    if (this.zoneScaleVal) this.zoneScaleVal.textContent = `${scalePct}%`;
    this._updatePresetActive(scale);
  }

  _updatePresetActive(scale) {
    document.querySelectorAll('.hud-preset-pill').forEach(btn => {
      const pScale = parseFloat(btn.dataset.scale || '1.0');
      btn.classList.toggle('active', Math.abs(pScale - scale) < 0.05);
    });
  }

  _populateZoneSelector() {
    if (!this.zoneSelect) return;
    this.zoneSelect.innerHTML = '';

    const layoutEl = document.getElementById(`layout-${this.activeLayoutId}`);
    if (!layoutEl) return;

    const zones = layoutEl.querySelectorAll('.hud-custom-zone');
    zones.forEach(zone => {
      const zid = zone.dataset.zoneId;
      const opt = document.createElement('option');
      opt.value = zid;
      opt.textContent = ZONE_METADATA[zid]?.name || zid;
      this.zoneSelect.appendChild(opt);
    });
  }

  setZoneScale(zoneId, scale) {
    const config = this._getConfig(this.activeLayoutId);
    if (!config.zones) config.zones = {};
    if (!config.zones[zoneId]) config.zones[zoneId] = { x: 0, y: 0, scale: 1.0 };
    config.zones[zoneId].scale = Math.max(0.5, Math.min(2.0, scale));
    this._saveAll();
    this.applyCurrentLayout();
  }

  setLayoutScale(layoutId, scale) {
    const config = this._getConfig(layoutId);
    config.scale = Math.max(0.6, Math.min(1.8, scale));
    this._saveAll();
    this.applyCurrentLayout();
  }

  setLayoutOpacity(layoutId, opacity) {
    const config = this._getConfig(layoutId);
    config.opacity = Math.max(0.2, Math.min(1.0, opacity));
    this._saveAll();
    this.applyCurrentLayout();
  }

  resetZone(zoneId) {
    const config = this._getConfig(this.activeLayoutId);
    if (config.zones && config.zones[zoneId]) {
      delete config.zones[zoneId];
      this._saveAll();
    }
    const zoneEl = document.querySelector(`[data-zone-id="${zoneId}"]`);
    if (zoneEl) {
      const globalScale = config.scale || 1.0;
      zoneEl.style.transform = `scale(${globalScale})`;
    }
    this.selectZone(zoneId);
  }

  resetCurrentLayout() {
    delete this.layoutConfigs[this.activeLayoutId];
    this._saveAll();
    const layoutEl = document.getElementById(`layout-${this.activeLayoutId}`);
    if (layoutEl) {
      layoutEl.style.transform = '';
      layoutEl.style.opacity = '1';
      layoutEl.querySelectorAll('.hud-custom-zone').forEach(zone => {
        zone.style.transform = '';
      });
    }
    if (this.zoneScaleSlider) this.zoneScaleSlider.value = 100;
    if (this.zoneScaleVal) this.zoneScaleVal.textContent = '100%';
    if (this.layoutScaleSlider) this.layoutScaleSlider.value = 100;
    if (this.layoutScaleVal) this.layoutScaleVal.textContent = '100%';
    if (this.opacitySlider) this.opacitySlider.value = 100;
    if (this.opacityVal) this.opacityVal.textContent = '100%';
    this._updatePresetActive(1.0);
  }

  applyCurrentLayout() {
    const config = this._getConfig(this.activeLayoutId);
    const layoutEl = document.getElementById(`layout-${this.activeLayoutId}`);
    if (!layoutEl) return;

    // Apply layout opacity
    const opacity = config.opacity !== undefined ? config.opacity : 1.0;
    layoutEl.style.opacity = opacity;

    // Apply global layout scale
    const globalScale = config.scale || 1.0;

    // Apply offsets and scales to individual zones
    const zones = config.zones || {};
    layoutEl.querySelectorAll('.hud-custom-zone').forEach(zone => {
      const zoneId = zone.dataset.zoneId;
      const zoneData = zones[zoneId] || { x: 0, y: 0, scale: 1.0 };
      const totalScale = (zoneData.scale || 1.0) * globalScale;
      const x = zoneData.x || 0;
      const y = zoneData.y || 0;

      if (x !== 0 || y !== 0) {
        zone.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${totalScale})`;
      } else {
        zone.style.transform = `scale(${totalScale})`;
      }

      // Update drag handle text with current size badge
      const handle = zone.querySelector('.zone-drag-handle');
      if (handle) {
        const pct = Math.round((zoneData.scale || 1.0) * 100);
        handle.textContent = `✥ DRAG • ${pct}%`;
      }
    });
  }

  // ── Drag & Drop Internals ────────────────────────────────────────────────
  _onPointerDown(e, zone) {
    if (!this.isEditing) return;
    e.stopPropagation();
    e.preventDefault();

    const zoneId = zone.dataset.zoneId;
    this.selectZone(zoneId);

    zone.setPointerCapture(e.pointerId);
    const config = this._getConfig(this.activeLayoutId);
    const pos = config.zones?.[zoneId] || { x: 0, y: 0, scale: 1.0 };

    this.activeDrag = {
      el: zone,
      zoneId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x || 0,
      origY: pos.y || 0,
      currentX: pos.x || 0,
      currentY: pos.y || 0,
      pointerId: e.pointerId
    };

    zone.classList.add('is-dragging');
    if (typeof vibrate === 'function') vibrate([15]);
  }

  _onPointerMove(e) {
    if (!this.isEditing || !this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;
    e.preventDefault();

    const dx = e.clientX - this.activeDrag.startX;
    const dy = e.clientY - this.activeDrag.startY;
    let newX = this.activeDrag.origX + dx;
    let newY = this.activeDrag.origY + dy;

    // Dynamic viewport clamping: allow generous movement across full phone screen
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 400;
    const maxOffsetX = Math.max(350, Math.round(vw * 0.75));
    const maxOffsetY = Math.max(220, Math.round(vh * 0.65));

    newX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newX));
    newY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newY));

    const config = this._getConfig(this.activeLayoutId);
    const zoneData = config.zones?.[this.activeDrag.zoneId] || { scale: 1.0 };
    const globalScale = config.scale || 1.0;
    const totalScale = (zoneData.scale || 1.0) * globalScale;

    this.activeDrag.el.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${totalScale})`;
    this.activeDrag.currentX = newX;
    this.activeDrag.currentY = newY;

    // Update drag handle badge with real-time coordinates
    const handle = this.activeDrag.el.querySelector('.zone-drag-handle');
    if (handle) {
      handle.textContent = `✥ X:${newX > 0 ? '+' : ''}${Math.round(newX)}, Y:${newY > 0 ? '+' : ''}${Math.round(newY)}`;
    }
  }

  _onPointerUp(e) {
    if (!this.activeDrag || e.pointerId !== this.activeDrag.pointerId) return;

    try {
      this.activeDrag.el.releasePointerCapture(e.pointerId);
    } catch (_) {}

    this.activeDrag.el.classList.remove('is-dragging');

    if (this.activeDrag.currentX !== undefined && this.activeDrag.currentY !== undefined) {
      const config = this._getConfig(this.activeLayoutId);
      if (!config.zones) config.zones = {};
      const cur = config.zones[this.activeDrag.zoneId] || { scale: 1.0 };
      config.zones[this.activeDrag.zoneId] = {
        ...cur,
        x: Math.round(this.activeDrag.currentX),
        y: Math.round(this.activeDrag.currentY)
      };
      this._saveAll();

      const handle = this.activeDrag.el.querySelector('.zone-drag-handle');
      if (handle) {
        const pct = Math.round((cur.scale || 1.0) * 100);
        handle.textContent = `✥ DRAG • ${pct}%`;
      }
    }

    this.activeDrag = null;
  }

  // ── Storage ─────────────────────────────────────────────────────────────
  _getConfig(layoutId) {
    if (!this.layoutConfigs[layoutId]) {
      this.layoutConfigs[layoutId] = { scale: 1.0, opacity: 1.0, zones: {} };
    }
    return this.layoutConfigs[layoutId];
  }

  _loadAll() {
    try {
      const saved = localStorage.getItem('hud_custom_layouts');
      if (saved) {
        this.layoutConfigs = JSON.parse(saved);
      }
    } catch (_) {}
  }

  _saveAll() {
    try {
      localStorage.setItem('hud_custom_layouts', JSON.stringify(this.layoutConfigs));
    } catch (_) {}
  }
}

// Global instance
window.hudCustomizer = new HudCustomizer();
