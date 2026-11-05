import { useState } from 'react';
import { useApp } from '../ctx';
import { AREAS, docArea, fmtDate, lineArea } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjustedValue, canSignoff, signoffStates, can } from '../../logic/rules';
import { VERIFY_LABELS } from '../../ledger/types';
import { Badge, Delta, Money, Person, Section, Tabs, fmt } from '../components/bits';
import { FindingCard } from '../components/FindingCard';
import { AdjCard, NoteThread } from '../components/Inspector';
import { JudgmentForm } from '../components/actions';

export function AreaView({ id }: { id: string }) {
  const { m, v, wp, findings, clock, me, act, go } = useApp();
  const area = AREAS.find((a) => a.id === id);
  const [tab, setTab] = useState('checks');
  const [hours, setHours] = useState('');
  if (!area) return <div className="page">Unknown area</div>;
  const fs = findings.filter((f) => f.area === id);
  const states = signoffStates(m, v, wp, id, findings, clock);
  const asg = wp.assignments.get(id) ?? {};
  const budget = m.p.firm.budget_hours[area.budget] ?? 0;
  const spent = wp.time.filter((t) => t.area === id).reduce((s, t) => s + t.hours, 0);
  const lines = v.lines.filter((l) => lineArea(l) === id);
  const docs = m.p.documents.filter((d) => docArea(d) === id && d.received_at <= clock);
  const adjs = wp.adjustments.filter((a) => a.area === id);
  const notes = wp.notes.filter((n) => n.area === id || n.target.some((t) => lines.some((l) => l.key === t)));
  const js = wp.judgments.filter((j) => j.area === id);
  const openF = fs.filter((f) => findingStatus(f, wp) === 'open' && f.severity !== 'info' && f.severity !== 'pass');

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="eyebrow">Area</div>
          <h1>{area.name}</h1>
          <div className="team inline">
            {asg.preparer && <span>Preparer <Person id={asg.preparer} /></span>}
            {asg.reviewer && <span>Reviewer <Person id={asg.reviewer} /></span>}
            {asg.partner && <span>Partner <Person id={asg.partner} /></span>}
            {asg.due && <span className={asg.due < clock.slice(0, 10) ? 'warn' : ''}>Due {asg.due}</span>}
          </div>
        </div>
        <div className="budget">
          <div className="cap">Time vs budget</div>
          <div className="bar"><i style={{ width: `${Math.min(100, (spent / (budget || 1)) * 100)}%` }} className={spent > budget ? 'over' : ''} /></div>
          <div className="tiny">{spent.toFixed(1)} of {budget} h {spent > budget && <span className="warn">over by {(spent - budget).toFixed(1)}</span>}</div>
          {can(me, 'time') && (
            <div className="row">
              <input className="sm" placeholder="h" value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 50 }} />
              <button className="btn sm" onClick={() => { const h = parseFloat(hours); if (h > 0) act('time', [id], { area: id, hours: h }).then(() => setHours('')); }}>Log time</button>
            </div>
          )}
        </div>
      </div>

      <div className="signoffs">
        {states.map((s) => {
          const why = canSignoff(m, v, wp, me, id, s.level);
          const blocked = s.level !== 'preparer' && openF.length > 0;
          return (
            <div key={s.level} className={'so-card ' + (s.current ? 'cur' : s.reopened ? 'reo' : '')}>
              <div className="cap">{s.level}</div>
              {s.signoff ? (
                <div>
                  <Person id={s.signoff.by} /> <span className="tiny">{fmtDate(s.signoff.simAt)}</span>
                  {s.reopened && (
                    <div className="reopen">
                      <b>Reopened</b> — changed since signed:
                      <ul>{s.changes.slice(0, 6).map((c, i) => <li key={i}>{c}</li>)}{s.changes.length > 6 && <li>+{s.changes.length - 6} more</li>}</ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="tiny muted">Not signed</div>
              )}
              {!s.current && (
                <button
                  className="btn sm primary"
                  disabled={!!why || blocked}
                  title={why ?? (blocked ? `${openF.length} open checks in this area` : '')}
                  onClick={() => act('signoff', [id], { area: id, level: s.level, hash: s.hash, snapshot: s.snap })}
                >
                  {s.reopened ? 'Re-sign' : 'Sign off'}
                </button>
              )}
              {(why || blocked) && !s.current && <div className="tiny warn">{why ?? `${openF.length} open checks`}</div>}
            </div>
          );
        })}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'checks', label: <>Checks <span className="nb red">{openF.length || ''}</span></> },
          { id: 'lines', label: `Lines (${lines.length})` },
          { id: 'docs', label: `Documents (${docs.length})` },
          { id: 'adj', label: `Adjustments (${adjs.length})` },
          { id: 'notes', label: `Notes & judgments (${notes.length + js.length})` },
        ]}
      />
      {tab === 'checks' && (
        <div>
          {fs.length === 0 && <div className="empty">No independent checks in this area.</div>}
          {fs.filter((f) => f.severity !== 'pass').map((f) => <FindingCard key={f.id} f={f} />)}
          {fs.filter((f) => f.severity === 'pass').length > 0 && <h4 className="sub">Passing checks</h4>}
          {fs.filter((f) => f.severity === 'pass').map((f) => <FindingCard key={f.id} f={f} />)}
        </div>
      )}
      {tab === 'lines' && <LinesTable keys={lines.map((l) => l.key)} />}
      {tab === 'docs' && (
        <div className="tbl-wrap">
          <table className="tbl click">
            <thead><tr><th>Doc</th><th>Title</th><th>Received</th><th className="r">Values</th><th className="r">Landed</th><th>Status</th></tr></thead>
            <tbody>
              {docs.map((d) => {
                const l = m.landing(d.id, v.version);
                return (
                  <tr key={d.id} onClick={() => go(`#/doc/${d.id}`)}>
                    <td className="mono">{d.id}</td><td>{d.title}</td><td>{fmtDate(d.received_at)}</td>
                    <td className="r">{m.evsByDoc.get(d.id)?.length ?? 0}</td><td className="r">{l.landed.length}</td>
                    <td><DocStatus id={d.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'adj' && <div>{adjs.length === 0 ? <div className="empty">No adjustments.</div> : adjs.map((a) => <AdjCard key={a.id} id={a.id} />)}</div>}
      {tab === 'notes' && (
        <div>
          {notes.map((n) => <NoteThread key={n.id} n={n} />)}
          {js.map((j) => (
            <div key={j.id} className="note">
              <div className="row"><Badge tone="purple">{j.kind.replace('_', ' ')}</Badge><b>{j.title}</b><span className="sp" /><span className="tiny">{m.staffName(j.by)} · {fmtDate(j.simAt)}</span></div>
              <div>{j.decision}</div>
              <div className="tiny muted">Authority: {j.authority}{j.alternatives ? ` · Alternatives: ${j.alternatives}` : ''}{j.whatIf ? ` · What-if: ${j.whatIf}` : ''}</div>
            </div>
          ))}
          <Section title="Record a judgment call, election or decision">
            <JudgmentForm targets={[]} area={id} />
          </Section>
        </div>
      )}
    </div>
  );
}

export function DocStatus({ id }: { id: string }) {
  const { m, v, wp } = useApp();
  const d = m.docs.get(id)!;
  const disp = wp.dispositions.get(id);
  if (v.documents_superseded.includes(id)) return <Badge tone="amber">superseded</Badge>;
  const l = m.landing(id, v.version);
  if (disp) return <Badge tone="green" title={disp.note}>{disp.status.replace(/_/g, ' ')}</Badge>;
  if (l.landed.length) return <Badge tone="green">landed</Badge>;
  if (!v.documents_used.includes(id)) return <Badge tone="red">not used — explain</Badge>;
  if (d.extraction?.status === 'not_extracted') return <Badge tone="neutral" title={d.extraction.reason}>not extracted</Badge>;
  return <Badge tone="amber">no values landed</Badge>;
}

export function LinesTable({ keys }: { keys: string[] }) {
  const { m, v, wp, setFocus, actMany, me } = useApp();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('all');
  const [method, setMethod] = useState('agreed_to_source_document');
  const collapse = keys.filter((k) => k.startsWith('F8949.') && !k.endsWith('.total'));
  const shown = keys
    .filter((k) => !collapse.includes(k))
    .filter((k) => {
      const l = m.line(v.version, k)!;
      if (filter === 'unverified') return !wp.verifications.has(k);
      if (filter === 'adjusted') return adjustedValue(wp, k, l.value) !== l.value;
      if (filter === 'swing') {
        const py = m.priorLine(k);
        return py !== undefined && typeof l.value === 'number' && Math.abs(l.value - py) > 1000;
      }
      return true;
    });
  const toggle = (k: string) => {
    const s = new Set(sel);
    s.has(k) ? s.delete(k) : s.add(k);
    setSel(s);
  };
  return (
    <div>
      <div className="row toolbar">
        <div className="seg">
          {['all', 'unverified', 'adjusted', 'swing'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        {collapse.length > 0 && <a href="#/sales" className="link tiny">{collapse.length} Form 8949 lots collapsed → Sales detail</a>}
        <span className="sp" />
        {sel.size > 0 && me.role !== 'client' && (
          <>
            <span className="tiny">{sel.size} selected</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(VERIFY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="btn sm primary" onClick={() => actMany([{ type: 'verify', target: [...sel], payload: { method, note: `Bulk verification of ${sel.size} lines` } }]).then(() => setSel(new Set()))}>Verify selected</button>
            <button className="btn sm" onClick={() => setSel(new Set())}>Clear</button>
          </>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl click lines">
          <thead>
            <tr>
              <th><input type="checkbox" checked={sel.size === shown.length && shown.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(shown) : new Set())} /></th>
              <th>Line</th><th>Label</th><th className="r">Engine</th><th className="r">Workpaper</th><th className="r">2024</th><th className="r">Δ PY</th><th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => {
              const l = m.line(v.version, k)!;
              const adj = adjustedValue(wp, k, l.value);
              const py = m.priorLine(k);
              const vf = wp.verifications.get(k);
              const nNotes = wp.notes.filter((n) => n.target.includes(k)).length;
              return (
                <tr key={k} onClick={() => setFocus(k)} className={sel.has(k) ? 'sel' : ''}>
                  <td onClick={(e) => { e.stopPropagation(); toggle(k); }}><input type="checkbox" readOnly checked={sel.has(k)} /></td>
                  <td className="mono">{k}</td>
                  <td>{l.label}</td>
                  <td className="r"><Money v={l.value} /></td>
                  <td className="r">{adj !== l.value ? <b><Money v={adj} /></b> : ''}</td>
                  <td className="r"><Money v={py} muted /></td>
                  <td className="r">{py !== undefined && typeof l.value === 'number' ? <Delta v={(typeof adj === 'number' ? adj : l.value) - py} /> : ''}</td>
                  <td>
                    {vf ? <span className="ok" title={vf.map((x) => VERIFY_LABELS[x.method]).join(', ')}>✓{vf.length > 1 ? vf.length : ''}</span> : l.sources.length ? <span className="muted">○</span> : <span className="muted tiny">calc</span>}
                    {nNotes > 0 && <span className="tiny"> ✎{nNotes}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { fmt };
