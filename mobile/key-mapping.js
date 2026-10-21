/**
 * key-mapping.js — Profile & key mapping system
 * Manages control profiles, key assignments, hold/tap modes
 */

'use strict';

// ── Default Profiles ──────────────────────────────────────────────
const DEFAULT_PROFILES = {
  smash_karts: {
    name: 'Smash Karts',
    icon: '🏎️',
    mappings: {
      move_up:    { key: 'W',     mode: 'hold', icon: '⬆️',  label: 'Move Up',    button: 'joystick_up'    },
      move_down:  { key: 'S',     mode: 'hold', icon: '⬇️',  label: 'Move Down',  button: 'joystick_down'  },
      move_left:  { key: 'A',     mode: 'hold', icon: '⬅️',  label: 'Move Left',  button: 'joystick_left'  },
      move_right: { key: 'D',     mode: 'hold', icon: '➡️',  label: 'Move Right', button: 'joystick_right' },
      fire:       { key: 'SPACE', mode: 'hold', icon: '💥',  label: 'Fire',       button: 'btn_fire'       },
      special:    { key: 'E',     mode: 'tap',  icon: '⚡',  label: 'Special',    button: 'btn_e'          },
      item:       { key: 'Q',     mode: 'tap',  icon: '🎯',  label: 'Item',       button: 'btn_q'          },
      brake:      { key: 'SHIFT', mode: 'hold', icon: '🛑',  label: 'Brake',      button: 'btn_shift'      },
    }
  },
  wasd: {
    name: 'WASD Generic',
    icon: '⌨️',
    mappings: {
      move_up:    { key: 'W',     mode: 'hold', icon: '⬆️',  label: 'Move Up',    button: 'joystick_up'    },
      move_down:  { key: 'S',     mode: 'hold', icon: '⬇️',  label: 'Move Down',  button: 'joystick_down'  },
      move_left:  { key: 'A',     mode: 'hold', icon: '⬅️',  label: 'Move Left',  button: 'joystick_left'  },
      move_right: { key: 'D',     mode: 'hold', icon: '➡️',  label: 'Move Right', button: 'joystick_right' },
      fire:       { key: 'SPACE', mode: 'hold', icon: '💥',  label: 'Action',     button: 'btn_fire'       },
      special:    { key: 'E',     mode: 'tap',  icon: '⚡',  label: 'Interact',   button: 'btn_e'          },
      item:       { key: 'F',     mode: 'tap',  icon: '🎯',  label: 'Alt',        button: 'btn_q'          },
      brake:      { key: 'SHIFT', mode: 'hold', icon: '🏃',  label: 'Sprint',     button: 'btn_shift'      },
    }
  },
  arrows: {
    name: 'Arrow Keys',
    icon: '⬆️',
    mappings: {
      move_up:    { key: 'UP',    mode: 'hold', icon: '⬆️',  label: 'Move Up',    button: 'joystick_up'    },
      move_down:  { key: 'DOWN',  mode: 'hold', icon: '⬇️',  label: 'Move Down',  button: 'joystick_down'  },
      move_left:  { key: 'LEFT',  mode: 'hold', icon: '⬅️',  label: 'Move Left',  button: 'joystick_left'  },
      move_right: { key: 'RIGHT', mode: 'hold', icon: '➡️',  label: 'Move Right', button: 'joystick_right' },
      fire:       { key: 'SPACE', mode: 'hold', icon: '💥',  label: 'Action',     button: 'btn_fire'       },
      special:    { key: 'Z',     mode: 'tap',  icon: '⚡',  label: 'Special',    button: 'btn_e'          },
      item:       { key: 'X',     mode: 'tap',  icon: '🎯',  label: 'Alt',        button: 'btn_q'          },
      brake:      { key: 'CTRL',  mode: 'hold', icon: '🛑',  label: 'Brake',      button: 'btn_shift'      },
    }
  },
  custom: {
    name: 'Custom',
    icon: '⚙️',
    mappings: {
      move_up:    { key: 'W',     mode: 'hold', icon: '⬆️',  label: 'Move Up',    button: 'joystick_up'    },
      move_down:  { key: 'S',     mode: 'hold', icon: '⬇️',  label: 'Move Down',  button: 'joystick_down'  },
      move_left:  { key: 'A',     mode: 'hold', icon: '⬅️',  label: 'Move Left',  button: 'joystick_left'  },
      move_right: { key: 'D',     mode: 'hold', icon: '➡️',  label: 'Move Right', button: 'joystick_right' },
      fire:       { key: 'SPACE', mode: 'hold', icon: '💥',  label: 'Fire',       button: 'btn_fire'       },
      special:    { key: 'E',     mode: 'tap',  icon: '⚡',  label: 'Special',    button: 'btn_e'          },
      item:       { key: 'Q',     mode: 'tap',  icon: '🎯',  label: 'Item',       button: 'btn_q'          },
      brake:      { key: 'SHIFT', mode: 'hold', icon: '🛑',  label: 'Brake',      button: 'btn_shift'      },
    }
  }
};

// ── KeyMappingManager ─────────────────────────────────────────────
class KeyMappingManager {
  constructor() {
    this._profiles = this._load();
    this._activeProfile = localStorage.getItem('activeProfile') || 'smash_karts';
  }

  // Load from localStorage, falling back to defaults
  _load() {
    try {
      const saved = localStorage.getItem('keyMappingProfiles');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge saved with defaults (so new controls get defaults)
        const merged = {};
        for (const [id, def] of Object.entries(DEFAULT_PROFILES)) {
          merged[id] = parsed[id]
            ? { ...def, mappings: { ...def.mappings, ...parsed[id].mappings } }
            : JSON.parse(JSON.stringify(def));
        }
        return merged;
      }
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_PROFILES));
  }

  save() {
    localStorage.setItem('keyMappingProfiles', JSON.stringify(this._profiles));
    localStorage.setItem('activeProfile', this._activeProfile);
  }

  resetToDefaults(profileId) {
    const id = profileId || this._activeProfile;
    this._profiles[id] = JSON.parse(JSON.stringify(DEFAULT_PROFILES[id]));
    this.save();
  }

  // Get active profile mappings
  get activeMapping() {
    return this._profiles[this._activeProfile]?.mappings || DEFAULT_PROFILES.smash_karts.mappings;
  }

  get activeProfileId() { return this._activeProfile; }
  get activeProfileName() {
    return this._profiles[this._activeProfile]?.name || 'Smash Karts';
  }

  setActiveProfile(id) {
    if (this._profiles[id]) {
      this._activeProfile = id;
      this.save();
    }
  }

  getProfile(id) {
    return this._profiles[id] || DEFAULT_PROFILES[id];
  }

  updateMapping(profileId, controlId, updates) {
    if (this._profiles[profileId]?.mappings[controlId]) {
      Object.assign(this._profiles[profileId].mappings[controlId], updates);
    }
  }

  // Given a joystick direction, return the key to press
  getKeyForControl(controlId) {
    return this.activeMapping[controlId]?.key || null;
  }

  getModeForControl(controlId) {
    return this.activeMapping[controlId]?.mode || 'hold';
  }

  getAllProfiles() {
    return this._profiles;
  }
}

// Export as global
window.KeyMappingManager = KeyMappingManager;
window.DEFAULT_PROFILES  = DEFAULT_PROFILES;
