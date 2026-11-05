import type { LEvent } from './types';

/**
 * Persistence and live sync for the ledger. Same API on every backend:
 * - server mode: the Node server (server/server.mjs) pushes new events and presence over SSE
 * - cloud mode: Cloudflare Pages Functions + D1 (functions/api); no long-lived connections on the free plan, so poll
 * - local mode: localStorage, synced between tabs with BroadcastChannel (works on any static host)
 */
export interface Presence { user: string; view: string; focus?: string | null; at: number; tab: string }

type Listener = () => void;
const LS_KEY = 'mf-workpaper-ledger-v1';
const LS_USED = 'mf-workpaper-used';
const POLL_MS = 3000; // cloud mode; hidden tabs poll 5× slower (free plan: 100k requests/day)
const APPEND_CHUNK = 200;
export const TAB_ID = Math.random().toString(36).slice(2, 8);

export class Store {
  events: LEvent[] = [];
  mode: 'server' | 'cloud' | 'local' = 'local';
  /** the ledger has never been used (not even reset): the app loads the demo season */
  fresh = false;
  presence = new Map<string, Presence>();
  private listeners = new Set<Listener>();
  private bc: BroadcastChannel | null = null;
  private ids = new Set<string>();
  private epoch = 0;
  private seq = 0;
  private me: Presence | null = null;

  async init() {
    try {
      const h = await fetch('/api/health', { cache: 'no-store' });
      if (!h.ok || !(h.headers.get('content-type') || '').includes('json')) throw new Error('no server');
      const health = await h.json();
      this.fresh = !!health.fresh;
      this.epoch = health.epoch ?? 0;
      const r = await fetch('/api/events', { cache: 'no-store' });
      this.load(await r.json());
      if (health.live === 'poll') {
        this.mode = 'cloud';
        this.poll();
      } else {
        this.mode = 'server';
        const es = new EventSource('/api/stream');
        es.addEventListener('events', (m) => this.merge(JSON.parse((m as MessageEvent).data)));
        es.addEventListener('presence', (m) => this.notePresence(JSON.parse((m as MessageEvent).data)));
        es.addEventListener('reset', () => this.load([]));
      }
    } catch {
      this.mode = 'local';
      try {
        this.fresh = localStorage.getItem(LS_USED) === null;
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

  /** cloud mode: fetch events after the last server sequence number, plus who is here */
  private async poll() {
    try {
      const r = await fetch('/api/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ since: this.seq, epoch: this.epoch, me: this.me }) });
      if (r.ok) {
        const d = await r.json();
        if (d.epoch !== this.epoch) {
          this.epoch = d.epoch;
          this.load(d.events);
        } else this.merge(d.events);
        for (const p of d.presence as Presence[]) if (p.tab !== TAB_ID) this.notePresence(p);
      }
    } catch {}
    setTimeout(() => this.poll(), document.hidden ? POLL_MS * 5 : POLL_MS);
  }

  private load(list: LEvent[]) {
    this.events = [...list];
    this.ids = new Set(list.map((e) => e.id));
    this.seq = Math.max(0, ...list.map((e) => e.serverSeq ?? 0));
    this.emit();
  }
  private merge(list: LEvent[], persist = false) {
    let added = false;
    for (const e of list) {
      if (e.serverSeq && e.serverSeq > this.seq) this.seq = e.serverSeq;
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
      localStorage.setItem(LS_USED, '1');
    } catch (e) {
      console.warn('localStorage full', e);
    }
  }

  async append(list: LEvent[]) {
    this.merge(list, true);
    if (this.mode !== 'local') {
      for (let i = 0; i < list.length; i += APPEND_CHUNK)
        await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(list.slice(i, i + APPEND_CHUNK)) }).catch(() => {});
    } else {
      this.bc?.postMessage({ kind: 'events', events: list });
    }
  }

  async reset() {
    if (this.mode !== 'local') {
      const r = await fetch('/api/reset', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (typeof d.epoch === 'number') this.epoch = d.epoch;
    } else {
      localStorage.removeItem(LS_KEY);
      localStorage.setItem(LS_USED, '1');
      this.bc?.postMessage({ kind: 'reset' });
    }
    this.load([]);
  }

  sendPresence(p: Presence) {
    this.notePresence(p);
    this.me = p; // cloud mode sends it with the next poll
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
