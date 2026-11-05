import { useState } from 'react';
import { useApp } from '../ctx';
import { findingStatus, type Finding } from '../../logic/checks';
import { adjEffect } from '../../logic/effects';
import { can } from '../../logic/rules';
import { Badge, Money, ReasonButton, Ref, SEV_TONE, SimpleTable, fmt } from './bits';
import { QuestionForm } from './actions';

export function FindingCard({ f, open: openDefault }: { f: Finding; open?: boolean }) {
  const { wp, v, m, me, actMany, act, setFocus } = useApp();
  const [open, setOpen] = useState(!!openDefault);
  const [ask, setAsk] = useState(false);
  const st = findingStatus(f, wp);
  const res = wp.findingRes.get(f.id);
  const made = wp.adjustments.filter((a) => a.findingId === f.id);
  const pending = (f.proposals ?? []).filter((p) => !made.some((a) => a.title === p.title && a.status !== 'rejected'));
  const totals = (f.proposals ?? []).map((p) => adjEffect(p, v, m.p.what_if.alternatives)).reduce((s, e) => ({ fed: s.fed + e.fedTax - e.fedPay, ca: s.ca + e.caTax - e.caPay }), { fed: 0, ca: 0 });
  return (
    <div className={`finding sev-${f.severity} st-${st}`}>
      <div className="f-head" onClick={() => setOpen(!open)}>
        <Badge tone={SEV_TONE[f.severity]}>{f.severity === 'pass' ? '✓ pass' : f.severity}</Badge>
        {st === 'resolved' && <Badge tone="green">resolved</Badge>}
        {f.blocksFiling && st === 'open' && <Badge tone="red">blocks filing</Badge>}
        <span className="f-title">{f.title}</span>
        <span className="sp" />
        {f.proposals?.length ? <span className="tiny">Fed <Money v={totals.fed} signed /> · CA <Money v={totals.ca} signed /></span> : null}
        <span className="twisty">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="f-body">
          <div className="kv">
            {f.engine !== undefined && <div><span className="cap">Engine</span><b className="num">{fmt(f.engine)}</b></div>}
            {f.expected !== undefined && <div><span className="cap">Evidence supports</span><b className="num">{fmt(f.expected)}</b></div>}
            <div><span className="cap">Kind</span>{f.kind}</div>
          </div>
          <p>{f.explain}</p>
          {f.table && <SimpleTable head={f.table.head} rows={f.table.rows} />}
          <div className="chips">
            {f.refs.map((r) => <Ref key={r} r={r} />)}
            {f.lines.slice(0, 8).map((k) => <Ref key={k} r={k} compact />)}
            {f.lines.length > 8 && <span className="tiny">+{f.lines.length - 8} lines</span>}
          </div>
          {f.proposals?.map((p) => {
            const e = adjEffect(p, v, m.p.what_if.alternatives);
            const done = made.find((a) => a.title === p.title && a.status !== 'rejected');
            return (
              <div key={p.title} className="proposal">
                <span className={done ? 'ok' : ''}>{done ? '✓' : '→'}</span>
                <b>{p.title}</b> <Ref r={p.target} compact /> <span className="num muted">{fmt(p.from)}</span> → <span className="num">{fmt(p.to)}</span>
                <span className="sp" />
                Fed <Money v={e.fedTax - e.fedPay} signed /> · CA <Money v={e.caTax - e.caPay} signed />
                {done && <Badge tone={done.status === 'approved' ? 'green' : 'amber'}>{done.status}</Badge>}
                {done && <button className="link tiny" onClick={() => setFocus(p.target.startsWith('ev-') || m.line(v.version, p.target) ? p.target : null)}>open</button>}
              </div>
            );
          })}
          {res && <div className="callout green">Resolved ({res.resolution.replace('_', ' ')}) by {m.staffName(res.by)}: {res.note}</div>}
          {st === 'open' && f.severity !== 'pass' && can(me, 'adjust') && (
            <div className="row">
              {pending.length > 0 && (
                <button className="btn primary sm" onClick={() => actMany(pending.map((p) => ({ type: 'adjust', target: [p.target], payload: p })))}>
                  Propose {pending.length > 1 ? `${pending.length} adjustments` : 'adjustment'}
                </button>
              )}
              {f.suggestQuestion && <button className="btn sm" onClick={() => setAsk(!ask)}>Ask {f.suggestQuestion.to === 'client' ? 'client' : 'colleague'}</button>}
              <ReasonButton label="No change — explain" placeholder="Why no change is needed (kept as evidence)" onSubmit={(note) => act('finding_resolve', f.lines.slice(0, 3), { findingId: f.id, resolution: 'no_change', note })} />
            </div>
          )}
          {res && can(me, 'adjust') && <button className="link tiny" onClick={() => act('undo', [], { ids: [res.eventId] })}>Reopen this check</button>}
          {ask && f.suggestQuestion && <QuestionForm targets={f.lines.slice(0, 1)} area={f.area} preset={f.suggestQuestion} onDone={() => setAsk(false)} />}
        </div>
      )}
    </div>
  );
}
