import { useState } from 'react';
import { useApp } from '../ctx';
import { AREAS, fmtDate, fmtDateTime } from '../../data/model';
import { signoffStates } from '../../logic/rules';
import type { LEvent } from '../../ledger/types';
import { Badge, Person, Ref, Section } from '../components/bits';

export function describe(e: LEvent, m: any): string {
  const p = e.payload || {};
  switch (e.type) {
    case 'verify': return `verified ${(e.target?.length ?? 0) > 1 ? `${e.target!.length} items` : e.target?.[0]} (${String(p.method).replace(/_/g, ' ')})${p.note ? ': ' + p.note : ''}`;
    case 'adjust': return `proposed “${p.title}” ${p.from} → ${p.to}`;
    case 'adjust_decision': return `${p.decision} an adjustment${p.note ? ': ' + p.note : ''}`;
    case 'note': return `${p.kind === 'review' ? 'review note' : 'note'}${p.blocking ? ' (blocking)' : ''}: ${p.text}`;
    case 'note_reply': return `replied: ${p.text}`;
    case 'note_status': return `${p.status} a note`;
    case 'question': return `asked ${p.to === 'client' ? 'the client' : m.staffName(p.to)}: ${p.text}`;
    case 'answer': return `answered: ${p.text}`;
    case 'judgment': return `${String(p.kind).replace('_', ' ')}: ${p.title}`;
    case 'finding_resolve': return `closed check ${p.findingId} (${p.resolution}): ${p.note}`;
    case 'signoff': return `signed off ${p.area} as ${p.level}`;
    case 'assign': return `assigned ${p.area}: ${Object.entries(p.set).map(([k, v]) => `${k} ${m.staffName(v as string) || v}`).join(', ')}`;
    case 'attach': return `attached ${p.name}`;
    case 'link': return `linked ${p.a} ↔ ${p.b}`;
    case 'time': return `logged ${p.hours} h on ${p.area}`;
    case 'view_sensitive': return `revealed ${p.field}`;
    case 'disposition': return `accounted for ${e.target?.join(', ')} as ${String(p.status).replace(/_/g, ' ')}`;
    case 'household_fix': return `corrected ${p.key} (${p.reason})`;
    case 'standards': return `changed standard ${p.path} → ${JSON.stringify(p.value)}`;
    case 'filing': return `filing: ${String(p.action).replace(/_/g, ' ')}${p.note ? ' — ' + p.note : ''}`;
    case 'undo': return `undid ${p.what ?? p.ids.length + ' events'}`;
    case 'seen': return 'marked caught up';
  }
  return e.type;
}

export function Changes() {
  const { m, v, wp, user, act, clock } = useApp();
  const seen = wp.seen.get(user) ?? '';
  const [all, setAll] = useState(false);
  const mine = (e: LEvent) => e.actor === user;
  const since = wp.visible.filter((e) => !mine(e) && e.at > seen && e.type !== 'seen' && e.type !== 'view_sensitive');
  const list = (all ? wp.visible : since).filter((e) => e.type !== 'seen').slice().reverse();
  // packet-side changes since the user's last look, in season time
  const seenSim = wp.visible.filter((e) => e.actor === user && e.type === 'seen').at(-1)?.simAt ?? '2026-01-01';
  const docs = m.p.documents.filter((d) => d.received_at > seenSim && d.received_at <= clock);
  const versions = m.versions.filter((x) => x.computed_at > seenSim && x.computed_at <= clock);
  const msgs = m.p.client.messages.filter((x) => x.sent_at > seenSim && x.sent_at <= clock);
  const reopened = wp.signoffs.length;
  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="eyebrow">{seen ? `Since you last looked (${fmtDateTime(seen)})` : 'You have not marked this file as seen yet'}</div>
          <h1>What changed</h1>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setAll(!all)}>{all ? 'Only since I last looked' : 'Full activity log'}</button>
          <button className="btn primary" onClick={() => act('seen', [], {})}>Mark caught up</button>
        </div>
      </div>
      <div className="grid2">
        <Section title={`Engine and packet since ${fmtDate(seenSim)}`}>
          {versions.map((x) => (
            <div key={x.version} className="logline">
              <Badge tone="blue">{x.version}</Badge> {fmtDate(x.computed_at)} — {x.trigger} <b>{x.changes_from_previous.length} lines changed</b> <a className="link tiny" href="#/compare">compare</a>
            </div>
          ))}
          {docs.map((d) => <div key={d.id} className="logline"><Ref r={d.id} /> received {fmtDate(d.received_at)}</div>)}
          {msgs.map((x) => <div key={x.id} className="logline"><Ref r={x.id} /> {x.text}</div>)}
          {!versions.length && !docs.length && !msgs.length && <div className="tiny muted">Nothing new from the client or engine.</div>}
        </Section>
        <Section title="Sign-offs reopened by those changes">
          <ReopenedList />
        </Section>
      </div>
      <Section title={all ? `Activity log (${list.length})` : `By colleagues and the client (${list.length})`}>
        {list.length === 0 && <div className="tiny muted">Nothing new.</div>}
        {list.slice(0, 300).map((e) => (
          <div key={e.id} className={'logline' + (wp.undone.has(e.id) ? ' undone' : '')}>
            <span className="mono tiny">{e.simAt.slice(0, 10)}</span> <Person id={e.actor} small /> <b>{m.staffName(e.actor)}</b> {describe(e, m)}
            {e.target && e.target.length > 0 && e.target.length < 6 && e.type !== 'verify' && <span className="chips">{e.target.map((t) => <Ref key={t} r={t} compact />)}</span>}
            {wp.undone.has(e.id) && <Badge tone="neutral">undone</Badge>}
            {e.batch && <span className="tiny muted"> · batch</span>}
          </div>
        ))}
      </Section>
    </div>
  );
}

function ReopenedList() {
  const { m, v, wp, findings, clock } = useApp();
  const items = AREAS.flatMap((a: any) => signoffStates(m, v, wp, a.id, findings, clock).filter((s: any) => s.reopened).map((s: any) => ({ a, s })));
  if (!items.length) return <div className="tiny muted">No sign-off is stale.</div>;
  return (
    <>
      {items.map(({ a, s }: any) => (
        <div key={a.id + s.level} className="logline">
          <Badge tone="red">↺ {s.level}</Badge> <a className="link" href={`#/area/${a.id}`}>{a.name}</a> <span className="tiny">signed by {m.staffName(s.signoff.by)} {fmtDate(s.signoff.simAt)} · {s.changes.slice(0, 3).join('; ')}{s.changes.length > 3 ? ` +${s.changes.length - 3}` : ''}</span>
        </div>
      ))}
    </>
  );
}
