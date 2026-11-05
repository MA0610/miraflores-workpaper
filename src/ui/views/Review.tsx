import { useState } from 'react';
import { useApp } from '../ctx';
import { actionable } from '../../ledger/fold';
import { AREAS, fmtDate } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjEffect } from '../../logic/effects';
import { canDecide } from '../../logic/rules';
import { Badge, Money, Ref, Section, Tabs } from '../components/bits';
import { FindingCard } from '../components/FindingCard';
import { AdjCard, NoteThread } from '../components/Inspector';
import { JudgmentForm } from '../components/actions';

export function Review({ tab }: { tab: string }) {
  const { go } = useApp();
  return (
    <div className="page">
      <div className="page-hd"><div><div className="eyebrow">Review</div><h1>Review workbench</h1></div></div>
      <Tabs value={tab} onChange={(t) => go(`#/review/${t}`)} tabs={[{ id: 'checks', label: 'Independent checks' }, { id: 'notes', label: 'Review notes' }, { id: 'questions', label: 'Questions' }, { id: 'adjustments', label: 'Adjustments' }, { id: 'diagnostics', label: 'Engine diagnostics' }, { id: 'judgments', label: 'Judgments & elections' }]} />
      {tab === 'checks' && <Checks />}
      {tab === 'notes' && <Notes />}
      {tab === 'questions' && <Questions />}
      {tab === 'adjustments' && <Adjustments />}
      {tab === 'diagnostics' && <Diagnostics />}
      {tab === 'judgments' && <Judgments />}
    </div>
  );
}

function Checks() {
  const { findings, wp } = useApp();
  const [f, setF] = useState('open');
  const list = findings.filter((x) => (f === 'all' ? true : f === 'pass' ? x.severity === 'pass' : f === 'resolved' ? findingStatus(x, wp) === 'resolved' : findingStatus(x, wp) === 'open'));
  return (
    <>
      <p className="lead">These checks read the documents, agency records, client answers and prior year directly — they never take the engine’s number for granted. Each says what the engine has, what the evidence supports, and proposes the adjustment.</p>
      <div className="seg">
        {[['open', 'Open'], ['resolved', 'Resolved'], ['pass', 'Passing'], ['all', 'All']].map(([id, l]) => <button key={id} className={f === id ? 'on' : ''} onClick={() => setF(id)}>{l} ({findings.filter((x) => (id === 'all' ? true : id === 'pass' ? x.severity === 'pass' : findingStatus(x, wp) === id)).length})</button>)}
      </div>
      {AREAS.map((a) => {
        const xs = list.filter((x) => x.area === a.id);
        if (!xs.length) return null;
        return <Section key={a.id} title={a.name}>{xs.map((x) => <FindingCard key={x.id} f={x} />)}</Section>;
      })}
    </>
  );
}

function Notes() {
  const { wp, user } = useApp();
  const [f, setF] = useState('open');
  const list = wp.notes.filter((n) => (f === 'open' ? actionable(n) : f === 'blocking' ? n.blocking && n.status === 'open' : f === 'comments' ? n.kind === 'comment' && !n.blocking && n.status === 'open' : f === 'mine' ? n.assignee === user || n.by === user : true));
  return (
    <>
      <div className="seg">{['open', 'blocking', 'comments', 'mine', 'all'].map((x) => <button key={x} className={f === x ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>
      {list.length === 0 && <div className="empty">No notes.</div>}
      {list.map((n) => <NoteThread key={n.id} n={n} />)}
    </>
  );
}

function Questions() {
  const { wp, m, act, me } = useApp();
  const [ans, setAns] = useState<Record<string, string>>({});
  return (
    <>
      {wp.questions.length === 0 && <div className="empty">No questions yet. Ask from any line, check or document — the answer is filed as evidence on that item.</div>}
      {wp.questions.slice().reverse().map((q) => (
        <div key={q.id} className="note">
          <div className="row">
            <Badge tone={q.status === 'open' ? 'amber' : 'green'}>{q.status}</Badge>
            <b>{m.staffName(q.by)} → {q.to === 'client' ? 'Client' : m.staffName(q.to)}</b>
            <span className="sp" /><span className="tiny">{fmtDate(q.simAt)}</span>
          </div>
          <div>{q.text}</div>
          <div className="chips">{q.target.map((t) => <Ref key={t} r={t} compact />)}</div>
          {q.answer ? <div className="answer">↳ {m.staffName(q.answer.by)} ({fmtDate(q.answer.simAt)}): {q.answer.text}</div> : (q.to === me.id || (q.to !== 'client' && me.role !== 'client')) && q.to !== 'client' && (
            <div className="row">
              <input placeholder="Answer…" value={ans[q.id] ?? ''} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} />
              <button className="btn sm" onClick={() => ans[q.id] && act('answer', q.target, { questionId: q.id, text: ans[q.id] })}>Answer</button>
            </div>
          )}
          {!q.answer && q.to === 'client' && <div className="tiny muted">Waiting for the client (switch role to a client to answer in the portal).</div>}
        </div>
      ))}
    </>
  );
}

function Adjustments() {
  const { wp, v, m, me, actMany } = useApp();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const pending = wp.adjustments.filter((a) => a.status === 'proposed');
  const decidable = pending.filter((a) => !canDecide(me, a, v, wp, m.p.what_if.alternatives));
  const tot = wp.adjustments.filter((a) => a.status !== 'rejected').map((a) => adjEffect(a, v, m.p.what_if.alternatives)).reduce((s, e) => ({ f: s.f + e.fedTax - e.fedPay, c: s.c + e.caTax - e.caPay }), { f: 0, c: 0 });
  return (
    <>
      <div className="row toolbar">
        <span>{wp.adjustments.length} adjustments · {pending.length} awaiting decision · total effect federal <Money v={tot.f} signed /> · California <Money v={tot.c} signed /></span>
        <span className="sp" />
        {decidable.length > 0 && (
          <>
            <button className="btn sm" onClick={() => setSel(new Set(decidable.map((a) => a.id)))}>Select all I can approve ({decidable.length})</button>
            <button className="btn sm primary" disabled={!sel.size} onClick={() => actMany([...sel].map((id) => ({ type: 'adjust_decision', target: [wp.adjustments.find((a) => a.id === id)!.target], payload: { adjustmentId: id, decision: 'approved', note: 'Bulk approval' } }))).then(() => setSel(new Set()))}>Approve {sel.size} (undo as one)</button>
          </>
        )}
      </div>
      {wp.adjustments.slice().reverse().map((a) => (
        <div key={a.id} className="row-sel">
          {a.status === 'proposed' && decidable.includes(a) && <input type="checkbox" checked={sel.has(a.id)} onChange={() => { const s = new Set(sel); s.has(a.id) ? s.delete(a.id) : s.add(a.id); setSel(s); }} />}
          <AdjCard id={a.id} />
        </div>
      ))}
    </>
  );
}

function Diagnostics() {
  const { v, wp, m } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {v.diagnostics.map((d) => {
        const r = wp.judgments.filter((j) => j.kind === 'diagnostic' && j.target.includes(d.code));
        return (
          <div key={d.code} className="note">
            <div className="row"><Badge tone={r.length ? 'green' : d.severity === 'warning' ? 'amber' : 'blue'}>{r.length ? 'resolved' : d.severity}</Badge><b>{d.code}</b><span className="sp" />{!r.length && <button className="btn sm" onClick={() => setOpen(open === d.code ? null : d.code)}>Resolve</button>}</div>
            <div>{d.message}</div>
            <div className="chips">{d.refs.map((x) => <Ref key={x} r={x} compact />)}</div>
            {r.map((j) => <div key={j.id} className="answer">↳ {m.staffName(j.by)}: {j.decision}</div>)}
            {open === d.code && <JudgmentForm targets={[d.code]} area="tax" preset={{ kind: 'diagnostic', title: `Engine diagnostic ${d.code}`, authority: 'Engine reference / documents' }} onDone={() => setOpen(null)} />}
          </div>
        );
      })}
    </>
  );
}

function Judgments() {
  const { wp, m } = useApp();
  return (
    <>
      {wp.judgments.length === 0 && <div className="empty">No judgments recorded.</div>}
      {wp.judgments.slice().reverse().map((j) => (
        <div key={j.id} className="note">
          <div className="row"><Badge tone="purple">{j.kind.replace('_', ' ')}</Badge><b>{j.title}</b><span className="sp" /><span className="tiny">{m.staffName(j.by)} · {fmtDate(j.simAt)}</span></div>
          <div>{j.decision}</div>
          <div className="tiny muted">Authority: {j.authority || '—'}{j.alternatives ? ` · Alternatives: ${j.alternatives}` : ''}{j.whatIf ? ` · What-if ${j.whatIf}` : ''}</div>
          <div className="chips">{j.target.map((t) => <Ref key={t} r={t} compact />)}</div>
        </div>
      ))}
    </>
  );
}
