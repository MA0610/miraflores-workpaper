import { useState } from 'react';
import { useApp } from '../ctx';
import { areaName, fmtDate, lineArea } from '../../data/model';
import type { Line } from '../../data/types';
import { adjEffect } from '../../logic/effects';
import { adjustedValue, canDecide } from '../../logic/rules';
import { findingStatus } from '../../logic/checks';
import { VERIFY_LABELS } from '../../ledger/types';
import { Badge, Delta, Money, Person, Ref, SEV_TONE, fmt } from './bits';
import { AdjustForm, AttachForm, JudgmentForm, LinkForm, NoteForm, QuestionForm, VerifyForm } from './actions';
import { Snippet } from './DocView';
import type { Note } from '../../ledger/fold';

export function Inspector() {
  const { focus, setFocus, m, v } = useApp();
  if (!focus) return null;
  const r = m.resolve(focus, v.version);
  return (
    <aside className="inspector">
      <div className="insp-top">
        <span className="eyebrow">{r.kind === 'line' ? 'Return line' : r.kind === 'ev' ? 'Extracted value' : r.kind}</span>
        <span className="sp" />
        <button className="link" onClick={() => setFocus(null)}>Close ✕</button>
      </div>
      {r.kind === 'line' ? <LineTrace k={focus} /> : r.kind === 'ev' ? <EvTrace id={focus} /> : <Generic id={focus} />}
    </aside>
  );
}

function BuildTree({ k, depth = 0, seen = new Set<string>() }: { k: string; depth?: number; seen?: Set<string> }) {
  const { m, v, wp, setFocus } = useApp();
  const l = m.line(v.version, k);
  const [open, setOpen] = useState(depth < 1);
  if (!l) return <div className="tree-row"><Ref r={k} /></div>;
  const adj = adjustedValue(wp, k, l.value);
  const kids = l.inputs ?? [];
  return (
    <div className="tree">
      <div className="tree-row" style={{ paddingLeft: depth * 14 }}>
        {kids.length ? <button className="twisty" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button> : <span className="twisty" />}
        <button className="link tree-k" onClick={() => setFocus(k)}>{k}</button>
        <span className="tree-l">{l.label}</span>
        <span className="sp" />
        {adj !== l.value && <span className="adjmark" title="adjusted">✎</span>}
        <Money v={l.value} />
      </div>
      {open && !seen.has(k) && kids.map((c) => <BuildTree key={c} k={c} depth={depth + 1} seen={new Set([...seen, k])} />)}
      {open && kids.length === 0 && l.sources.length > 0 && (
        <div className="tree-src" style={{ paddingLeft: depth * 14 + 28 }}>
          {l.sources.map((s) => <Ref key={s} r={s} compact />)}
        </div>
      )}
    </div>
  );
}

function footing(l: Line, get: (k: string) => any) {
  if (l.rule !== 'R-SUM' || !l.inputs?.length) return null;
  const vals = l.inputs.map((i) => get(i) ?? 0);
  const sum = vals.reduce((a, b) => a + b, 0);
  const sub = vals[0] - vals.slice(1).reduce((a, b) => a + b, 0);
  const ok = Math.abs(sum - l.value) <= 1.5 || Math.abs(Math.abs(sub) - Math.abs(l.value)) <= 1.5;
  const op = Math.abs(sum - l.value) <= 1.5 ? ' + ' : ' − ';
  return { ok, text: `${l.inputs.map((i, n) => `${fmt(vals[n])}`).join(op)} = ${fmt(l.value)}` };
}

function LineTrace({ k }: { k: string }) {
  const { m, v, wp, findings, me, act, setFocus } = useApp();
  const l = m.line(v.version, k)!;
  const area = lineArea(l);
  const [panel, setPanel] = useState('');
  const adj = adjustedValue(wp, k, l.value);
  const py = m.priorLine(k);
  const hist = m.versions.map((x) => ({ v: x.version, val: m.line(x.version, k)?.value, at: x.computed_at }));
  const ub = m.usedBy.get(v.version)?.get(k) ?? [];
  const adjs = wp.adjustments.filter((a) => a.target === k);
  const fs = findings.filter((f) => f.lines.includes(k) || f.proposals?.some((p) => p.target === k));
  const diags = v.diagnostics.filter((d) => d.refs.includes(k));
  const foot = footing(l, (x) => m.line(v.version, x)?.value);
  const verifs = wp.verifications.get(k) ?? [];
  const links = wp.links.filter((x) => x.a === k || x.b === k);
  const rule = m.p.engine_reference.rules[l.rule];
  const notes = wp.notes.filter((n) => n.target.includes(k));
  const qs = wp.questions.filter((q) => q.target.includes(k));
  const js = wp.judgments.filter((j) => j.target.includes(k));
  const atts = wp.attachments.filter((a) => a.target.includes(k));

  return (
    <div className="trace">
      <div className="trace-hd">
        <div className="mono k">{k} <span className="tiny muted">{l.jurisdiction} · {areaName(area)}</span></div>
        <h3>{l.label}</h3>
        <div className="bigvals">
          <div><span className="cap">Engine {v.version}</span><Money v={l.value} cents={l.form === 'F8949'} /></div>
          {adj !== l.value && <div className="adj"><span className="cap">Workpaper</span><Money v={adj} /></div>}
          {py !== undefined && <div><span className="cap">2024</span><Money v={py} /></div>}
          {py !== undefined && typeof l.value === 'number' && <div><span className="cap">Change</span><Delta v={(typeof adj === 'number' ? adj : l.value) - py} /></div>}
        </div>
        <div className="hist">{hist.map((h) => <span key={h.v} className={h.v === v.version ? 'on' : ''} title={fmtDate(h.at)}>{h.v}: {h.val === undefined ? '—' : fmt(h.val)}</span>)}</div>
      </div>

      <div className="actions">
        {['verify', 'adjust', 'note', 'ask', 'judgment', 'attach', 'link'].map((p) => (
          <button key={p} className={'btn sm' + (panel === p ? ' on' : '')} onClick={() => setPanel(panel === p ? '' : p)}>{p[0].toUpperCase() + p.slice(1)}</button>
        ))}
      </div>
      {panel === 'verify' && <VerifyForm targets={[k]} onDone={() => setPanel('')} />}
      {panel === 'adjust' && <AdjustForm target={k} area={area} from={l.value} onDone={() => setPanel('')} />}
      {panel === 'note' && <NoteForm targets={[k]} area={area} review={me.role === 'reviewer' || me.role === 'partner'} onDone={() => setPanel('')} />}
      {panel === 'ask' && <QuestionForm targets={[k]} area={area} onDone={() => setPanel('')} />}
      {panel === 'judgment' && <JudgmentForm targets={[k]} area={area} onDone={() => setPanel('')} />}
      {panel === 'attach' && <AttachForm targets={[k]} onDone={() => setPanel('')} />}
      {panel === 'link' && <LinkForm from={k} onDone={() => setPanel('')} />}

      {fs.length > 0 && (
        <div className="blk">
          <h4>Independent checks on this line</h4>
          {fs.map((f) => (
            <div key={f.id} className={`mini-finding sev-${f.severity}`}>
              <Badge tone={SEV_TONE[f.severity]}>{f.severity === 'pass' ? 'pass' : findingStatus(f, wp)}</Badge> {f.title}
            </div>
          ))}
        </div>
      )}

      <div className="blk">
        <h4>How it was built</h4>
        <div className="rule"><span className="mono">{l.rule}</span> {rule}</div>
        {l.note && <div className="note-eng">Engine note: {l.note}</div>}
        {foot && <div className={'footing ' + (foot.ok ? 'ok' : 'bad')}>{foot.ok ? '✓ foots' : '✗ does not foot'}: {foot.text}</div>}
        <BuildTree k={k} />
      </div>

      {l.sources.length > 0 && (
        <div className="blk">
          <h4>Sources</h4>
          {l.sources.map((s) => (s.startsWith('ev-') ? <Snippet key={s} evId={s} /> : <div key={s} className="src-row"><Ref r={s} /> <SrcValue r={s} /></div>))}
        </div>
      )}
      {ub.length > 0 && (
        <div className="blk">
          <h4>Flows into</h4>
          <div className="chips">{ub.map((x) => <Ref key={x} r={x} />)}</div>
        </div>
      )}
      {diags.length > 0 && (
        <div className="blk">
          <h4>Engine diagnostics</h4>
          {diags.map((d) => <div key={d.code} className="logline"><Badge tone={d.severity === 'warning' ? 'amber' : 'blue'}>{d.code}</Badge> {d.message}</div>)}
        </div>
      )}

      <div className="blk">
        <h4>Verification {verifs.length > 0 && <Badge tone="green">✓ {verifs.length}</Badge>}</h4>
        {verifs.length === 0 && <div className="tiny muted">Not verified yet.</div>}
        {verifs.map((x) => (
          <div key={x.id} className="logline">
            ✓ <b>{VERIFY_LABELS[x.method] ?? x.method}</b> — {x.note} {x.evidence?.map((e) => <Ref key={e} r={e} compact />)} <span className="tiny">· {m.staffName(x.by)} · {fmtDate(x.simAt)}</span>
          </div>
        ))}
      </div>

      {adjs.length > 0 && <div className="blk"><h4>Adjustments</h4>{adjs.map((a) => <AdjCard key={a.id} id={a.id} />)}</div>}
      {notes.length > 0 && <div className="blk"><h4>Notes</h4>{notes.map((n) => <NoteThread key={n.id} n={n} />)}</div>}
      {qs.length > 0 && (
        <div className="blk">
          <h4>Questions</h4>
          {qs.map((q) => (
            <div key={q.id} className="logline">
              <Badge tone={q.status === 'open' ? 'amber' : 'green'}>{q.status}</Badge> to {q.to === 'client' ? 'client' : m.staffName(q.to)}: {q.text}
              {q.answer && <div className="answer">↳ {m.staffName(q.answer.by)}: {q.answer.text}</div>}
            </div>
          ))}
        </div>
      )}
      {js.length > 0 && <div className="blk"><h4>Judgments & elections</h4>{js.map((j) => <div key={j.id} className="logline"><Badge tone="purple">{j.kind.replace('_', ' ')}</Badge> <b>{j.title}</b> — {j.decision} <div className="tiny">Authority: {j.authority}</div></div>)}</div>}
      {atts.length > 0 && <div className="blk"><h4>Evidence attached</h4>{atts.map((a) => <AttachmentRow key={a.id} id={a.id} />)}</div>}
      <div className="blk">
        <h4>Related</h4>
        <div className="chips">
          {py !== undefined && <Ref r={`py:/return_2024/lines/${k.replace(/\//g, '~1')}`} label={`2024 ${k}: ${fmt(py)}`} />}
          {links.map((x) => <span key={x.id} className="linkrow"><Ref r={x.a === k ? x.b : x.a} /> <span className="tiny">{x.note}</span></span>)}
          {m.p.household.related_returns.filter((r) => (k.startsWith('F8812') && /Ada/.test(r.who)) || (k.startsWith('SchE.28A') && /Woodworks/.test(r.who)) || (k.startsWith('SchE.28B') && /Ridgeline/.test(r.who))).map((r) => <span key={r.who} className="badge b-neutral" title={r.return}>Related return: {r.who}</span>)}
        </div>
      </div>
    </div>
  );
}

function SrcValue({ r }: { r: string }) {
  const { m, v } = useApp();
  const x = m.resolve(r, v.version);
  if (x.value === undefined) return x.detail ? <span className="tiny">{x.detail}</span> : null;
  if (typeof x.value === 'object') return <span className="tiny mono">{JSON.stringify(x.value).slice(0, 140)}</span>;
  return <b className="num">{fmt(x.value)}</b>;
}

export function AdjCard({ id }: { id: string }) {
  const { wp, v, m, me, act } = useApp();
  const a = wp.adjustments.find((x) => x.id === id)!;
  const e = adjEffect(a, v, m.p.what_if.alternatives);
  const block = canDecide(me, a, v, wp, m.p.what_if.alternatives);
  return (
    <div className={`adjcard st-${a.status}`}>
      <div className="row">
        <Badge tone={a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : 'amber'}>{a.status}</Badge>
        <b>{a.title}</b>
        <span className="sp" />
        {a.layer !== 'original' && <Badge tone="purple">after filing</Badge>}
      </div>
      <div className="adj-vals">
        <Ref r={a.target} compact /> <span className="num muted">{fmt(a.from)}</span> → <span className="num">{fmt(a.to)}</span>
        <span className="sp" />
        Fed <Money v={e.fedTax - e.fedPay} signed /> · CA <Money v={e.caTax - e.caPay} signed />
        {a.whatIf && <Badge tone="blue">engine what-if</Badge>}
      </div>
      <div className="tiny">{a.reason}</div>
      {a.authority && <div className="tiny muted">Authority: {a.authority}</div>}
      {a.manualEffect && <div className="tiny muted">Effect basis: {a.manualEffect.basis}</div>}
      <div className="tiny muted">Proposed by {m.staffName(a.by)} {fmtDate(a.simAt)}{a.decisions.map((d, i) => <span key={i}> · {d.decision} by {m.staffName(d.by)} {fmtDate(d.simAt)}</span>)}</div>
      {(me.role === 'reviewer' || me.role === 'partner') && (
        <div className="row">
          {block ? <span className="tiny warn">{block}</span> : (
            <>
              <button className="btn sm primary" onClick={() => act('adjust_decision', [a.target], { adjustmentId: a.id, decision: 'approved' })}>Approve</button>
              <button className="btn sm" onClick={() => { const note = prompt('Reason for rejecting?') ?? ''; act('adjust_decision', [a.target], { adjustmentId: a.id, decision: 'rejected', note }); }}>Reject</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function NoteThread({ n }: { n: Note }) {
  const { m, act, me } = useApp();
  const [reply, setReply] = useState('');
  return (
    <div className={'note ' + n.status + (n.blocking ? ' blocking' : '')}>
      <div className="row">
        <Badge tone={n.kind === 'review' ? 'purple' : n.kind === 'quality' ? 'blue' : 'neutral'}>{n.kind}</Badge>
        {n.blocking && n.status === 'open' && <Badge tone="red">blocks filing</Badge>}
        <Badge tone={n.status === 'open' ? 'amber' : 'green'}>{n.status}</Badge>
        <span className="sp" />
        <span className="tiny">{m.staffName(n.by)} · {fmtDate(n.simAt)}{n.assignee ? ` → ${m.staffName(n.assignee)}` : ''}</span>
      </div>
      <div>{n.text}</div>
      <div className="chips">{n.target.slice(0, 6).map((t) => <Ref key={t} r={t} compact />)}</div>
      {n.replies.map((r, i) => <div key={i} className="answer">↳ {m.staffName(r.by)}: {r.text}</div>)}
      {!me.isClient && (
        <div className="row">
          <input placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
          <button className="btn sm" onClick={() => reply && act('note_reply', [], { noteId: n.id, text: reply }).then(() => setReply(''))}>Reply</button>
          {n.status === 'open' ? (
            <button className="btn sm" disabled={n.kind === 'review' && n.by !== me.id && me.role === 'preparer'} title={n.kind === 'review' && me.role === 'preparer' ? 'The reviewer who raised it clears a review note' : ''} onClick={() => act('note_status', [], { noteId: n.id, status: 'resolved' })}>Resolve</button>
          ) : (
            <button className="btn sm" onClick={() => act('note_status', [], { noteId: n.id, status: 'open' })}>Reopen</button>
          )}
        </div>
      )}
    </div>
  );
}

export function AttachmentRow({ id }: { id: string }) {
  const { wp, m } = useApp();
  const a = wp.attachments.find((x) => x.id === id)!;
  return (
    <div className="logline">
      📎 {a.data ? <a href={a.data} download={a.name}>{a.name}</a> : <b>{a.name}</b>} <span className="tiny">({a.mime}, {a.size} B) · {m.staffName(a.by)} · {fmtDate(a.simAt)}</span>
      {a.text && <div className="answer mono">{a.text}</div>}
      {a.data?.startsWith('data:image') && <img src={a.data} alt={a.name} className="thumb" />}
    </div>
  );
}

function EvTrace({ id }: { id: string }) {
  const { m, v, wp, go } = useApp();
  const e = m.evs.get(id)!;
  const [panel, setPanel] = useState('');
  const lines = (m.citedBy.get(id) ?? []).filter((c) => c.v === v.version).map((c) => c.key);
  const other = (m.citedBy.get(id) ?? []).filter((c) => c.v !== v.version);
  const verifs = wp.verifications.get(id) ?? [];
  const adjs = wp.adjustments.filter((a) => a.target === id);
  return (
    <div className="trace">
      <div className="trace-hd">
        <div className="mono k">{id} · {e.document_id} p{e.page} · {e.field}</div>
        <h3>{e.label}</h3>
        <div className="bigvals">
          <div><span className="cap">Extracted</span>{typeof e.value === 'number' ? <Money v={e.value} cents={e.value_type === 'money'} /> : <b>{String(e.value)}</b>}</div>
          <div><span className="cap">Read as</span><span className="mono">“{e.text_as_read || '(blank)'}”</span></div>
          <div><span className="cap">Confidence</span><span className={e.confidence < 0.8 ? 'warn' : ''}>{Math.round(e.confidence * 100)}%</span></div>
        </div>
      </div>
      <Snippet evId={id} />
      <div className="actions">
        <button className="btn sm" onClick={() => go(`#/doc/${e.document_id}/${e.page}/${id}`)}>Open document</button>
        {['verify', 'adjust', 'note', 'attach'].map((p) => <button key={p} className={'btn sm' + (panel === p ? ' on' : '')} onClick={() => setPanel(panel === p ? '' : p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
      </div>
      {panel === 'verify' && <VerifyForm targets={[id]} onDone={() => setPanel('')} />}
      {panel === 'adjust' && <AdjustForm target={id} area={lineArea(m.line(v.version, lines[0] ?? '') ?? { form: 'X', line: '', key: '' })} from={e.value} onDone={() => setPanel('')} />}
      {panel === 'note' && <NoteForm targets={[id]} onDone={() => setPanel('')} />}
      {panel === 'attach' && <AttachForm targets={[id]} onDone={() => setPanel('')} />}
      <div className="blk">
        <h4>Landed in ({v.version})</h4>
        {lines.length ? <div className="chips">{lines.map((k) => <Ref key={k} r={k} />)}</div> : <div className="tiny muted">Not used on the return in {v.version}.</div>}
        {other.length > 0 && <div className="tiny muted">Other versions: {[...new Set(other.map((o) => o.v))].join(', ')}</div>}
      </div>
      <div className="blk"><h4>Verification</h4>{verifs.length === 0 ? <div className="tiny muted">None</div> : verifs.map((x) => <div key={x.id} className="logline">✓ {VERIFY_LABELS[x.method]} — {x.note} <span className="tiny">{m.staffName(x.by)}</span></div>)}</div>
      {adjs.length > 0 && <div className="blk"><h4>Corrections</h4>{adjs.map((a) => <AdjCard key={a.id} id={a.id} />)}</div>}
    </div>
  );
}

function Generic({ id }: { id: string }) {
  const { m, v, wp } = useApp();
  const r = m.resolve(id, v.version);
  const lines = (m.citedBy.get(id) ?? []).filter((c) => c.v === v.version).map((c) => c.key);
  const q = r.kind === 'qa' ? m.p.client.questionnaire.find((x) => x.id === id) : null;
  return (
    <div className="trace">
      <div className="trace-hd">
        <div className="mono k">{id}</div>
        <h3>{r.title}</h3>
      </div>
      {r.detail && <div className="callout">{r.detail}</div>}
      {q && <div className="tiny muted">Answered by {q.answered_by} · {fmtDate(q.answered_at)}</div>}
      {r.value !== undefined && typeof r.value === 'object' && <pre className="json">{JSON.stringify(r.value, null, 2)}</pre>}
      {r.value !== undefined && typeof r.value !== 'object' && r.kind !== 'qa' && r.kind !== 'msg' && <div className="bigvals"><div><span className="cap">Value</span><b>{fmt(r.value)}</b></div></div>}
      <div className="blk"><h4>Used on the return ({v.version})</h4>{lines.length ? <div className="chips">{lines.map((k) => <Ref key={k} r={k} />)}</div> : <div className="tiny muted">Not cited directly by a return line.</div>}</div>
      {wp.verifications.get(id)?.map((x) => <div key={x.id} className="logline">✓ {x.note}</div>)}
    </div>
  );
}
