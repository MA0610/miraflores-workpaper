import { useApp } from '../ctx';
import { deadlines, inbox, type Deadline, type InboxItem } from '../../logic/work';
import { fmtDate } from '../../data/model';
import { Badge, Section } from '../components/bits';

const KIND: Record<InboxItem['kind'], [string, string]> = {
  decide: ['decide', 'purple'],
  assign: ['assignment', 'blue'],
  signoff: ['sign-off', 'blue'],
  reopened: ['reopened', 'red'],
  note: ['assigned', 'amber'],
  question: ['question', 'amber'],
  answer: ['answered', 'green'],
  mention: ['mention', 'neutral'],
  deadline: ['deadline', 'red'],
};
export const DL_TONE: Record<Deadline['state'], string> = { done: 'green', overdue: 'red', soon: 'amber', upcoming: 'neutral' };

export function useInbox() {
  const { m, v, wp, findings, clock, me, user } = useApp();
  const items = inbox(m, v, wp, findings, clock, me);
  const read = wp.seenSim.get(user) ?? '';
  return { items, isNew: (x: InboxItem) => x.at > read, open: items.filter((x) => x.action).length };
}

/** "My work": everything waiting on the current person, their deadlines, and updates since they last looked. */
export function Inbox() {
  const { m, wp, clock, user, act, go, setFocus } = useApp();
  const { items, isNew } = useInbox();
  const mine = deadlines(m, wp, clock).filter((d) => d.who.includes(user) && d.state !== 'done');
  const row = (x: InboxItem) => (
    <button key={x.id} className={'inbox-row' + (isNew(x) ? ' new' : '')} onClick={() => { go(x.go); if (x.focus) setFocus(x.focus); }}>
      <Badge tone={KIND[x.kind][1]}>{KIND[x.kind][0]}</Badge>
      <span className="ib-t">{x.text}</span>
      <span className="tiny muted">{fmtDate(x.at)}</span>
    </button>
  );
  const need = items.filter((x) => x.action), fyi = items.filter((x) => !x.action);
  return (
    <div className="page">
      <div className="page-hd">
        <div><div className="eyebrow">Notifications · {m.staffName(user)}</div><h1>My work</h1></div>
        <button className="btn" onClick={() => act('seen', [], {})}>Mark all read</button>
      </div>
      <Section title={`Needs you (${need.length})`}>{need.length ? need.map(row) : <div className="empty">Nothing is waiting on you.</div>}</Section>
      <Section title={`My deadlines (${mine.length})`}>
        {mine.length === 0 && <div className="tiny muted">No open deadlines assigned to you.</div>}
        {mine.map((d) => <DeadlineRow key={d.id} d={d} />)}
      </Section>
      <Section title={`Updates (${fyi.length})`}>{fyi.length ? fyi.map(row) : <div className="tiny muted">No updates.</div>}</Section>
      <p className="tiny muted">Bold = new since you last marked read. Everything here is computed from the ledger at the season clock, so it updates live as colleagues work and replays with the clock.</p>
    </div>
  );
}

export function DeadlineRow({ d }: { d: Deadline }) {
  const { m, go } = useApp();
  return (
    <div className="logline clickable" onClick={() => go(d.go)}>
      <Badge tone={DL_TONE[d.state]}>{d.state}</Badge> <span className="mono">{d.date}</span> {d.what}
      {d.who.length > 0 && <span className="tiny muted"> · {d.who.map((w) => (w === 'client' ? 'Client' : m.staffName(w))).join(', ')}</span>}
    </div>
  );
}

export function DueBadge({ due }: { due?: string }) {
  const { clock } = useApp();
  if (!due) return null;
  return <Badge tone={due < clock.slice(0, 10) ? 'red' : 'neutral'}>due {due}</Badge>;
}
