/**
 * Signed-in user state. Demo profiles are local and never sent to an API.
 */
import { get, post } from './api.js';

const DEMO_STORAGE_KEY = 'aerotrack-demo-user';
const listeners = new Set();
const state = { user: null, emailMode: null, loaded: false };
let pending = null;

const DEMO_USERS = {
  passenger: { id: 'demo-passenger', name: 'Alex Passenger', email: 'passenger@demo.aerotrack.local', role: 'passenger', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z', preferences: { emailNotifications: false, browserNotifications: false }, tutorialCompleted: true, demo: true },
  staff: { id: 'demo-staff', name: 'Sam Airport Staff', email: 'staff@demo.aerotrack.local', role: 'staff', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z', preferences: { emailNotifications: false, browserNotifications: false }, tutorialCompleted: true, demo: true },
  admin: { id: 'demo-admin', name: 'Avery Administrator', email: 'admin@demo.aerotrack.local', role: 'admin', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z', preferences: { emailNotifications: false, browserNotifications: false }, tutorialCompleted: true, demo: true },
};

export const auth = {
  get user() {
    return state.user;
  },
  get emailMode() {
    return state.emailMode;
  },
  get loaded() {
    return state.loaded;
  },
  get demoMode() {
    return window.AEROTRACK_DEMO_MODE === true;
  },

  /** Loads the saved local demo profile, or the API session when demo mode is off. */
  async load(force = false) {
    if (state.loaded && !force) return state.user;
    if (this.demoMode) {
      try {
        const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? 'null');
        state.user = saved?.demo && DEMO_USERS[saved.role]?.id === saved.id ? DEMO_USERS[saved.role] : null;
      } catch {
        localStorage.removeItem(DEMO_STORAGE_KEY);
        state.user = null;
      }
      state.loaded = true;
      emit();
      return state.user;
    }
    pending ??= get('/auth/me')
      .then((r) => {
        state.user = r?.user ?? null;
        state.emailMode = r?.emailMode ?? null;
      })
      .catch(() => {
        state.user = null;
      })
      .finally(() => {
        state.loaded = true;
        pending = null;
        emit();
      });
    await pending;
    return state.user;
  },

  refresh() {
    return this.load(true);
  },

  setUser(user) {
    state.user = user;
    state.loaded = true;
    if (!user?.demo) localStorage.removeItem(DEMO_STORAGE_KEY);
    emit();
  },

  signInDemo(role) {
    const user = DEMO_USERS[role];
    if (!this.demoMode || !user) throw new Error('That demo account is unavailable.');
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(user));
    this.setUser(user);
    return user;
  },

  async logout() {
    if (state.user?.demo) {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      state.user = null;
      emit();
      return;
    }
    try {
      await post('/auth/logout');
    } finally {
      state.user = null;
      emit();
    }
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function emit() {
  listeners.forEach((l) => l(state.user));
}

export const isStaff = (u) => u?.role === 'staff' || u?.role === 'admin';
