import { useMemo, useState } from 'react';
import { useApp, DEFAULT_CLOCK } from './ctx';
import { AREAS, fmtDateTime } from '../data/model';
import { findingStatus } from '../logic/checks';
import { ROLE_LABEL, signoffStates } from '../logic/rules';
import { buildSeed } from '../ledger/seed';
import { Inspector } from './components/Inspector';
import { Confirm, Person } from './components/bits';
import { Overview } from './views/Overview';
import { AreaView } from './views/Area';
import { Documents, DocRoute } from './views/Documents';
import { Sales } from './views/Sales';
import { Schedules } from './views/Schedules';
import { Changes } from './views/Changes';
import { Compare, WhatIf } from './views/Compare';
import { Review } from './views/Review';
import { Filing, Notice, RollForward, ClientCopy } from './views/Filing';
import { Firm } from './views/Firm';
import { ClientPortal } from './views/Client';
import { SearchBox } from './views/Search';
import { TAB_ID } from '../ledger/store';
import { actionable } from '../ledger/fold';

export function App() {
  const ctx = useApp();
  const { route, me } = ctx;
  if (me.isClient) return <Shell client><ClientPortal /></Shell>;
  const [r0, r1, r2, r3] = route;
  let view;
  switch (r0) {
    case 'area': view = <AreaView id={r1} />; break;
    case 'documents': view = <Documents />; break;
    case 'doc': view = <DocRoute id={r1} page={r2 ? +r2 : undefined} ev={r3} />; break;
    case 'sales': view = <Sales />; break;
    case 'schedules': view = <Schedules id={r1 || 'summary'} />; break;
    case 'changes': view = <Changes />; break;
    case 'compare': view = <Compare />; break;
    case 'whatif': view = <WhatIf />; break;
    case 'review': view = <Review tab={r1 || 'checks'} />; break;
    case 'filing': view = <Filing />; break;
    case 'notice': view = <Notice />; break;
    case 'rollforward': view = <RollForward />; break;
    case 'clientcopy': view = <ClientCopy />; break;
    case 'firm': view = <Firm tab={r1 || 'status'} />; break;
    default: view = <Overview />;
  }
  return <Shell>{view}</Shell>;
}

function Shell({ children, client }: { children: React.ReactNode; client?: boolean }) {
  const { route, focus } = useApp();
  return (
    <div className={'app' + (focus && !client ? ' with-insp' : '')}>
      <TopBar />
      {!client && <Nav />}
      <main className={'main' + (route[0] === 'clientcopy' ? ' print' : '')}>{children}</main>
      {!client && <Inspector />}
    </div>
  );
}

function TopBar() {
  const { m, user, setUser, me, clock, setClock, steps, store, v, wp, actMany, act, go } = useApp();
  const [showClock, setShowClock] = useState(false);
  const others = [...store.presence.values()].filter((p) => p.tab !== TAB_ID);
  const idx = steps.findIndex((s) => s.at > clock);
  const prev = steps.filter((s) => s.at < clock).at(-1);
  const next = idx >= 0 ? steps[idx] : null;
  const myLast = [...wp.visible].reverse().find((e) => e.actor === user && e.type !== 'undo' && e.type !== 'seen' && e.type !== 'view_sensitive' && !wp.undone.has(e.id));
  const unseen = useMemo(() => {
    const seen = wp.seen.get(user) ?? '';
    return wp.visible.filter((e) => e.actor !== user && e.at > seen && e.type !== 'seen' && e.type !== 'view_sensitive').length;
  }, [wp, user]);
  const frozen = wp.filing.frozen;
  return (
    <header className="topbar">
      <div className="brand" onClick={() => go('#/overview')}>
        <span className="logo">◆</span>
        <div>
          <div className="b1">Okafor-Lindqvist · 2025</div>
          <div className="b2">{m.p.packet.client_id} · MFJ · Federal 1040 + CA 540NR</div>
        </div>
      </div>
      <div className="clock">
        <button className="btn sm ghost" disabled={!prev} onClick={() => prev && setClock(prev.at)} title="Previous season event">◀</button>
        <button className="clock-face" onClick={() => setShowClock(!showClock)}>
          <span className="cap">Season clock</span>
          <b>{fmtDateTime(clock)}</b>
          <span className="tiny">engine {v.version}{frozen ? ' · FILED' : ''}</span>
        </button>
        <button className="btn sm ghost" disabled={!next} onClick={() => next && setClock(next.at)} title={next ? `Next: ${next.label}` : ''}>▶</button>
        {showClock && (
          <div className="pop clock-pop">
            <div className="row">
              <input type="datetime-local" value={clock.slice(0, 16)} onChange={(e) => setClock(new Date(e.target.value + ':00Z').toISOString().replace('.000', ''))} />
              <button className="btn sm" onClick={() => setClock(DEFAULT_CLOCK)}>Now (Jul 2, v3)</button>
            </div>
            <div className="steps">
              {steps.map((s, i) => (
                <button key={i} className={'step' + (s.at <= clock ? ' past' : '')} onClick={() => { setClock(s.at); setShowClock(false); }}>
                  <span className="mono">{s.at.slice(0, 10)}</span> {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <SearchBox />
      <div className="sp" />
      <div className="presence" title="Others in this file now">
        {others.map((p) => (
          <span key={p.tab} title={`${m.staffName(p.user)} · ${p.view}${p.focus ? ' · ' + p.focus : ''}`}><Person id={p.user} small /></span>
        ))}
      </div>
      <button className="btn sm ghost" onClick={() => go('#/changes')} title="Changes since you last looked">
        ● {unseen}
      </button>
      <button
        className="btn sm ghost"
        disabled={!myLast}
        title={myLast ? `Undo your last action (${myLast.type}${myLast.batch ? ', whole batch' : ''})` : 'Nothing to undo'}
        onClick={() => {
          if (!myLast) return;
          const ids = myLast.batch ? wp.visible.filter((e) => e.batch === myLast.batch && !wp.undone.has(e.id)).map((e) => e.id) : [myLast.id];
          act('undo', [], { ids, what: `${myLast.type} ×${ids.length}` });
        }}
      >
        ↶ Undo
      </button>
      <div className="whoami">
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <optgroup label="Firm">
            {m.staff.map((s) => <option key={s.id} value={s.id}>{s.name} — {ROLE_LABEL[s.role]}{s.sensitive_data_clearance ? '' : ' (no clearance)'}</option>)}
          </optgroup>
          <optgroup label="Client">
            {m.p.firm.client_users.map((c) => <option key={c.id} value={c.id}>{c.name} — Client</option>)}
          </optgroup>
        </select>
        <span className="tiny muted">{store.mode === 'server' ? 'shared server' : 'this browser · tabs sync'}</span>
      </div>
    </header>
  );
}

function Nav() {
  const { route, wp, findings, m, v, clock, store, go } = useApp();
  const at = (h: string) => '#/' + route.slice(0, h.split('/').length).join('/') === h;
  const openNotes = wp.notes.filter(actionable).length;
  const openQ = wp.questions.filter((q) => q.status === 'open').length;
  const pendingAdj = wp.adjustments.filter((a) => a.status === 'proposed').length;
  const openF = findings.filter((f) => findingStatus(f, wp) === 'open' && f.severity !== 'info').length;
  const Item = ({ h, label, badge, tone }: { h: string; label: string; badge?: number | string; tone?: string }) => (
    <a href={h} className={'nav-i' + (at(h) ? ' on' : '')}>
      <span>{label}</span>
      {badge ? <span className={`nb ${tone ?? ''}`}>{badge}</span> : null}
    </a>
  );
  return (
    <nav className="nav">
      <Item h="#/overview" label="Overview" />
      <div className="nav-h">Areas</div>
      {AREAS.map((a) => {
        const s = signoffStates(m, v, wp, a.id, findings, clock);
        const nOpen = findings.filter((f) => f.area === a.id && findingStatus(f, wp) === 'open' && (f.severity === 'error' || f.severity === 'warning')).length;
        const dots = s.map((x) => (x.current ? 'g' : x.reopened ? 'r' : 'o'));
        return (
          <a key={a.id} href={`#/area/${a.id}`} className={'nav-i' + (route[0] === 'area' && route[1] === a.id ? ' on' : '')}>
            <span>{a.name}</span>
            <span className="sodots" title="Preparer · Reviewer · Partner (green current, red reopened)">{dots.map((d, i) => <i key={i} className={d} />)}</span>
            {nOpen ? <span className="nb red">{nOpen}</span> : null}
          </a>
        );
      })}
      <div className="nav-h">Evidence</div>
      <Item h="#/documents" label="Documents" />
      <Item h="#/sales" label={`Sales detail (${v.lines.filter((l) => l.form === 'F8949' && !l.key.endsWith('.total')).length})`} />
      <Item h="#/schedules" label="Schedules" />
      <div className="nav-h">Work</div>
      <Item h="#/review/checks" label="Independent checks" badge={openF} tone="red" />
      <Item h="#/review/notes" label="Review notes" badge={openNotes} tone="amber" />
      <Item h="#/review/questions" label="Questions" badge={openQ} tone="amber" />
      <Item h="#/review/adjustments" label="Adjustments" badge={pendingAdj} tone="amber" />
      <Item h="#/changes" label="What changed" />
      <Item h="#/compare" label="Compare versions" />
      <Item h="#/whatif" label="What-ifs" />
      <div className="nav-h">Filing & after</div>
      <Item h="#/filing" label="Filing" badge={wp.filing.frozen ? 'filed' : undefined} tone="green" />
      <Item h="#/clientcopy" label="Client copy" />
      <Item h="#/notice" label="Notice response" />
      <Item h="#/rollforward" label="Roll forward to 2026" />
      <div className="nav-h">Firm</div>
      <Item h="#/firm" label="Firm & standards" />
      <div className="nav-foot">
        <Confirm label="Load demo review" ask="Replace the ledger with the demo season (staff work through Jul 2, 2026)?" onYes={async () => { await store.reset(); await store.append(buildSeed(m)); }} />
        <Confirm label="Reset ledger" ask="Clear the whole ledger and start from the raw packet?" onYes={() => store.reset()} />
      </div>
    </nav>
  );
}
