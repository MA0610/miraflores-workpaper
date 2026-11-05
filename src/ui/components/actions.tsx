import { useState } from 'react';
import { useApp } from '../ctx';
import { VERIFY_LABELS, type AdjCategory } from '../../ledger/types';
import { adjEffect } from '../../logic/effects';
import { can } from '../../logic/rules';
import { Money } from './bits';

const CATS: { id: AdjCategory; label: string }[] = [
  { id: 'wages', label: 'Wages' },
  { id: 'interest', label: 'Interest / dividends' },
  { id: 'schc_profit', label: 'Schedule C profit' },
  { id: 'stcg', label: 'Short-term gain' },
  { id: 'ltcg', label: 'Long-term gain' },
  { id: 'ordinary_income', label: 'Other ordinary income' },
  { id: 'adjustment', label: 'Adjustment to income' },
  { id: 'salt', label: 'State & local tax (capped)' },
  { id: 'itemized', label: 'Other itemized deduction' },
  { id: 'ca_source_income', label: 'California-source amount only' },
  { id: 'credit_fed', label: 'Federal credit (1:1)' },
  { id: 'credit_ca', label: 'California credit (1:1)' },
  { id: 'payment_fed', label: 'Federal payment (1:1)' },
  { id: 'payment_ca', label: 'California payment (1:1)' },
  { id: 'none', label: 'No tax effect (identity, labels)' },
];

export function VerifyForm({ targets, onDone }: { targets: string[]; onDone?: () => void }) {
  const { act, me, wp } = useApp();
  const types: string[] = wp.standards.verification_types;
  const [method, setMethod] = useState(types[0]);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  if (!can(me, 'verify')) return null;
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        await act('verify', targets, { method, note, evidence: evidence.split(/[\s,]+/).filter(Boolean) });
        setNote('');
        onDone?.();
      }}
    >
      <div className="row">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {types.map((t) => <option key={t} value={t}>{VERIFY_LABELS[t] ?? t.replace(/_/g, ' ')}</option>)}
        </select>
        <input placeholder="Evidence refs (e.g. D08 ev-0016 msg-08)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </div>
      <textarea placeholder="What did you check?" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      <div className="row"><button className="btn primary" type="submit">Record verification{targets.length > 1 ? ` (${targets.length})` : ''}</button></div>
    </form>
  );
}

export function AdjustForm({ target, area, from, onDone }: { target: string; area: string; from: any; onDone?: () => void }) {
  const { act, me, v, m } = useApp();
  const [to, setTo] = useState(String(from ?? ''));
  const [category, setCategory] = useState<AdjCategory>('itemized');
  const [caTreatment, setCa] = useState<'rate' | 'ca_source' | 'none'>('rate');
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState('');
  const [sign, setSign] = useState(1);
  const [err, setErr] = useState('');
  if (!can(me, 'adjust')) return null;
  const toNum = Number(to.replace(/,/g, ''));
  const numeric = typeof from === 'number' && !isNaN(toNum);
  const amount = numeric ? (toNum - from) * sign : 0;
  const payload = { title: `Adjust ${target}`, target, area, from, to: numeric ? toNum : to, amount, category, caTreatment, reason, authority };
  const e = adjEffect(payload as any, v, m.p.what_if.alternatives);
  return (
    <form
      className="form"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!reason.trim()) return setErr('A reason is required.');
        await act('adjust', [target], payload);
        onDone?.();
      }}
    >
      <div className="row">
        <label>From <b className="num">{String(from)}</b></label>
        <label>To <input value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="row">
        <select value={category} onChange={(e) => setCategory(e.target.value as AdjCategory)}>
          {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={caTreatment} onChange={(e) => setCa(e.target.value as any)} title="California treatment">
          <option value="rate">CA: residency-prorated rate</option>
          <option value="ca_source">CA: fully California-source</option>
          <option value="none">CA: no effect</option>
        </select>
        <label className="tiny"><input type="checkbox" checked={sign < 0} onChange={(e) => setSign(e.target.checked ? -1 : 1)} /> line reduces income</label>
      </div>
      <textarea placeholder="Why (required)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <input placeholder="Authority relied on (firm rule: every judgment records one)" value={authority} onChange={(e) => setAuthority(e.target.value)} />
      <div className="row effect">
        Estimated tax effect: federal <Money v={e.fedTax - e.fedPay} signed /> · California <Money v={e.caTax - e.caPay} signed />
        <span className="sp" />
        {err && !reason.trim() && <span className="form-err">{err}</span>}
        <button className="btn primary" type="submit">Propose adjustment</button>
      </div>
    </form>
  );
}

export function NoteForm({ targets, area, review, onDone }: { targets: string[]; area?: string; review?: boolean; onDone?: () => void }) {
  const { act, me, m } = useApp();
  const [text, setText] = useState('');
  const [blocking, setBlocking] = useState(!!review);
  const [assignee, setAssignee] = useState('');
  if (!can(me, 'note')) return null;
  const kind = me.role === 'quality_reviewer' ? 'quality' : me.role === 'reviewer' || me.role === 'partner' ? 'review' : 'comment';
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await act('note', targets, { text, area, kind, blocking, assignee: assignee || undefined });
        setText('');
        onDone?.();
      }}
    >
      <textarea placeholder={kind === 'review' ? 'Review note…' : 'Note…'} value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <div className="row">
        <label className="tiny"><input type="checkbox" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} /> blocks filing until resolved</label>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Assign to…</option>
          {m.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="sp" />
        <button className="btn" type="submit">Add note</button>
      </div>
    </form>
  );
}

export function QuestionForm({ targets, area, preset, onDone }: { targets: string[]; area?: string; preset?: { to: string; text: string }; onDone?: () => void }) {
  const { act, me, m } = useApp();
  const [to, setTo] = useState(preset?.to ?? 'client');
  const [text, setText] = useState(preset?.text ?? '');
  if (!can(me, 'question')) return null;
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await act('question', targets, { to, text, area });
        setText('');
        onDone?.();
      }}
    >
      <div className="row">
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="client">Client (portal)</option>
          {m.staff.filter((s) => s.id !== me.id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
        </select>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Question — the answer is filed as evidence on this item" />
      <div className="row"><span className="sp" /><button className="btn" type="submit">Send question</button></div>
    </form>
  );
}

export function AttachForm({ targets, onDone }: { targets: string[]; onDone?: () => void }) {
  const { act, me } = useApp();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  if (!can(me, 'attach')) return null;
  const onFile = (f: File) => {
    if (f.size > 1_500_000) return setErr(`${f.name} is ${(f.size / 1e6).toFixed(1)} MB — demo limit is 1.5 MB per file (the ledger stores it inline).`);
    setErr('');
    const r = new FileReader();
    r.onload = async () => {
      await act('attach', targets, { name: f.name, mime: f.type || 'application/octet-stream', size: f.size, data: r.result, kind: 'file' });
      onDone?.();
    };
    r.readAsDataURL(f);
  };
  return (
    <div className="form">
      <label className="drop">
        <input type="file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        Drop or choose a file (PDF, image, email export…)
      </label>
      {err && <div className="form-err">{err}</div>}
      <div className="row">
        <input placeholder="…or paste a message / note title" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <textarea rows={2} placeholder="Message or note text" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <span className="sp" />
        <button
          className="btn"
          onClick={async () => {
            if (!text.trim()) return;
            await act('attach', targets, { name: name || 'Note', mime: 'text/plain', size: text.length, text, kind: 'message' });
            setText('');
            setName('');
            onDone?.();
          }}
        >
          Attach text
        </button>
      </div>
    </div>
  );
}

export function LinkForm({ from, onDone }: { from: string; onDone?: () => void }) {
  const { act } = useApp();
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!to.trim()) return;
        await act('link', [from, to], { a: from, b: to.trim(), note });
        setTo('');
        setNote('');
        onDone?.();
      }}
    >
      <div className="row">
        <input placeholder="Related item (line key, D12, ev-0079, py:/…, qa-31, 2026:carryover)" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <input placeholder="How they relate" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row"><span className="sp" /><button className="btn" type="submit">Link</button></div>
    </form>
  );
}

export function JudgmentForm({ targets, area, preset, onDone }: { targets: string[]; area?: string; preset?: any; onDone?: () => void }) {
  const { act, me, m } = useApp();
  const [kind, setKind] = useState(preset?.kind ?? 'judgment');
  const [title, setTitle] = useState(preset?.title ?? '');
  const [decision, setDecision] = useState(preset?.decision ?? '');
  const [authority, setAuthority] = useState(preset?.authority ?? '');
  const [alternatives, setAlt] = useState(preset?.alternatives ?? '');
  const [whatIf, setWhatIf] = useState(preset?.whatIf ?? '');
  const [err, setErr] = useState('');
  if (!can(me, 'judgment')) return null;
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!authority.trim()) return setErr('Firm rule: every judgment call records the authority relied on.');
        await act('judgment', targets, { area, kind, title, decision, authority, alternatives, whatIf: whatIf || undefined });
        onDone?.();
      }}
    >
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="judgment">Judgment call</option>
          <option value="election">Election</option>
          <option value="due_diligence">Due diligence</option>
          <option value="penalty">Penalty decision</option>
          <option value="diagnostic">Diagnostic resolution</option>
          <option value="outside_filing">Outside filing</option>
          <option value="completeness">Completeness</option>
        </select>
        <select value={whatIf} onChange={(e) => setWhatIf(e.target.value)}>
          <option value="">No engine what-if</option>
          {m.p.what_if.alternatives.map((w) => <option key={w.id} value={w.id}>{w.id}</option>)}
        </select>
      </div>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={2} placeholder="Decision and reasoning" value={decision} onChange={(e) => setDecision(e.target.value)} />
      <input placeholder="Authority relied on (required)" value={authority} onChange={(e) => setAuthority(e.target.value)} />
      <input placeholder="Alternatives considered" value={alternatives} onChange={(e) => setAlt(e.target.value)} />
      <div className="row"><span className="sp" />{err && !authority.trim() && <span className="form-err">{err}</span>}<button className="btn primary" type="submit">Record</button></div>
    </form>
  );
}
