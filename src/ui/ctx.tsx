import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Model } from '../data/model';
import type { Packet, Version } from '../data/types';
import { fold, type WP } from '../ledger/fold';
import { newId, Store, TAB_ID } from '../ledger/store';
import type { EventType, LEvent } from '../ledger/types';
import { runChecks, type Finding } from '../logic/checks';
import { adjEffect, sumEffects, type Effect } from '../logic/effects';
import { actor, type Actor } from '../logic/rules';

export interface Ctx {
  m: Model;
  store: Store;
  clock: string;
  setClock: (c: string) => void;
  user: string;
  setUser: (u: string) => void;
  me: Actor;
  v: Version;
  wp: WP;
  findings: Finding[];
  eff: { approved: Effect; live: Effect };
  focus: string | null;
  setFocus: (f: string | null) => void;
  route: string[];
  go: (h: string) => void;
  act: (type: EventType, target: string[] | undefined, payload: any, batch?: string) => Promise<LEvent>;
  actMany: (list: { type: EventType; target?: string[]; payload: any }[]) => Promise<LEvent[]>;
  steps: { at: string; label: string; kind: string }[];
}

const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export const DEFAULT_CLOCK = '2026-07-02T12:00:00Z';
const ls = {
  get: (k: string, d: string) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

function useHash() {
  const [h, setH] = useState(location.hash || '#/overview');
  useEffect(() => {
    const f = () => setH(location.hash || '#/overview');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function AppProvider({ packet, store, children }: { packet: Packet; store: Store; children: ReactNode }) {
  const m = useMemo(() => new Model(packet), [packet]);
  const events = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.events.length + ':' + store.presence.size + ':' + [...store.presence.values()].map((p) => p.at).join(',')
  );
  const [clock, setClockS] = useState(() => sessionStorage.getItem('wp-clock') || DEFAULT_CLOCK);
  const [user, setUserS] = useState(() => sessionStorage.getItem('wp-user') || ls.get('wp-user', 'st-01'));
  const [focus, setFocus] = useState<string | null>(null);
  const hash = useHash();
  const route = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const setClock = (c: string) => {
    sessionStorage.setItem('wp-clock', c);
    setClockS(c);
  };
  const setUser = (u: string) => {
    sessionStorage.setItem('wp-user', u);
    ls.set('wp-user', u);
    setUserS(u);
    setFocus(null);
  };
  const v = useMemo(() => m.versionAt(clock) ?? m.versions[0], [m, clock]);
  void events; // re-render on ledger or presence change
  const evLen = store.events.length;
  const wp = useMemo(() => fold(store.events, clock, packet.firm.starter_standards), [evLen, clock]);
  const findings = useMemo(() => runChecks(m, v, wp, clock), [m, v, wp, clock]);
  const eff = useMemo(() => {
    const live = wp.adjustments.filter((a) => a.status !== 'rejected');
    return {
      approved: sumEffects(live.filter((a) => a.status === 'approved').map((a) => adjEffect(a, v, packet.what_if.alternatives))),
      live: sumEffects(live.map((a) => adjEffect(a, v, packet.what_if.alternatives))),
    };
  }, [wp, v]);
  const me = actor(m, user);

  const steps = useMemo(() => {
    const s: { at: string; label: string; kind: string }[] = [];
    for (const t of packet.timeline) s.push({ at: t.at, label: t.event.replace(/_/g, ' '), kind: 'timeline' });
    for (const d of packet.documents) s.push({ at: d.received_at, label: `${d.id} received`, kind: 'doc' });
    for (const x of packet.client.messages) s.push({ at: x.sent_at, label: `${x.id} from ${x.from}`, kind: 'msg' });
    return s.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [packet]);

  // presence heartbeat
  useEffect(() => {
    const send = () => store.sendPresence({ user, view: route.join('/'), focus, at: Date.now(), tab: TAB_ID });
    send();
    const t = setInterval(send, 8000);
    return () => clearInterval(t);
  }, [user, route.join('/'), focus]);

  const mk = (type: EventType, target: string[] | undefined, payload: any, batch?: string): LEvent => ({ id: newId(), at: new Date().toISOString(), simAt: clock, actor: user, type, target, payload, batch });
  const ctx: Ctx = {
    m,
    store,
    clock,
    setClock,
    user,
    setUser,
    me,
    v,
    wp,
    findings,
    eff,
    focus,
    setFocus,
    route,
    go: (h) => (location.hash = h),
    act: async (type, target, payload, batch) => {
      const e = mk(type, target, payload, batch);
      await store.append([e]);
      return e;
    },
    actMany: async (list) => {
      const b = newId('b');
      const evs = list.map((x) => mk(x.type, x.target, x.payload, b));
      await store.append(evs);
      return evs;
    },
    steps,
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}
