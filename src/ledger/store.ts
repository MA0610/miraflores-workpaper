import type { LEvent } from './types';

/**
 * Persistence and live sync for the ledger.
 * - server mode: shared ledger on the Node server, pushed to every open browser over SSE
 * - local mode: localStorage, synced between tabs with BroadcastChannel (works on any static host)
 */
export interface Presence { user: string; view: string; focus?: string | null; at: number; tab: string }

type Listener = () => void;
const LS_KEY = 'mf-workpaper-ledger-v1';
export const TAB_ID = Math.random().toString(36).slice(2, 8);

export class Store {
  events: LEvent[] = [];
  mode: 'server' | 'local' = 'local';
  presence = new Map<string, Presence>();
  private listeners = new Set<Listener>();
  private bc: BroadcastChannel | null = null;
  private ids = new Set<string>();

  async init() {
    try {
      const r = await fetch('/api/events', { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no server');
      this.load(await r.json());
      this.mode = 'server';
      const es = new EventSource('/api/stream');
      es.addEventListener('events', (m) => this.merge(JSON.parse((m as MessageEvent).data)));
      es.addEventListener('presence', (m) => this.notePresence(JSON.parse((m as MessageEvent).data)));
      es.addEventListener('reset', () => {
        this.load([]);
      });
    } catch {
      this.mode = 'local';
      try {
        this.load(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
      } catch {
        this.load([]);
      }
    }
    if ('BroadcastChannel' in window) {
      this.bc = new BroadcastChannel('mf-workpaper');
      this.bc.onmessage = (m) => {
        const d = m.data;
        if (d.kind === 'events' && this.mode === 'local') this.merge(d.events, false);
        if (d.kind === 'presence') this.notePresence(d.p);
        if (d.kind === 'reset' && this.mode === 'local') this.load([]);
      };
    }
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [k, p] of this.presence) if (now - p.at > 20000) (this.presence.delete(k), (changed = true));
      if (changed) this.emit();
    }, 5000);
  }

  private load(list: LEvent[]) {
    this.events = [...list];
    this.ids = new Set(list.map((e) => e.id));
    this.emit();
  }
  private merge(list: LEvent[], persist = false) {
    let added = false;
    for (const e of list) {
      if (this.ids.has(e.id)) continue;
      this.ids.add(e.id);
      this.events.push(e);
      added = true;
    }
    if (added) {
      if (persist || this.mode === 'local') this.saveLocal();
      this.emit();
    }
  }
  private saveLocal() {
    if (this.mode !== 'local') return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('localStorage full', e);
    }
  }

  async append(list: LEvent[]) {
    this.merge(list, true);
    if (this.mode === 'server') {
      await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(list) }).catch(() => {});
    } else {
      this.bc?.postMessage({ kind: 'events', events: list });
    }
  }

  async reset() {
    if (this.mode === 'server') await fetch('/api/reset', { method: 'POST' });
    else {
      localStorage.removeItem(LS_KEY);
      this.bc?.postMessage({ kind: 'reset' });
    }
    this.load([]);
  }

  sendPresence(p: Presence) {
    this.notePresence(p);
    if (this.mode === 'server') fetch('/api/presence', { method: 'POST', body: JSON.stringify(p) }).catch(() => {});
    this.bc?.postMessage({ kind: 'presence', p });
  }
  private notePresence(p: Presence) {
    this.presence.set(p.tab, p);
    this.emit();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
}

export const newId = (prefix = 'e') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
