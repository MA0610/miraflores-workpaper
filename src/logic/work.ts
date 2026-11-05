import { AREAS, type Model } from '../data/model';
import type { Version } from '../data/types';
import { latestSignoff, type WP } from '../ledger/fold';
import type { Finding } from './checks';
import { canDecide, canSignoff, signoffStates, type Actor } from './rules';

/**
 * Deadlines and the per-person inbox. Both are derived from the packet + ledger at the season clock,
 * like everything else: nothing is stored, so they replay with the clock and sync live.
 */

export type DeadlineState = 'done' | 'overdue' | 'soon' | 'upcoming';
export interface Deadline { id: string; what: string; date: string; kind: 'filing' | 'internal' | 'outside' | 'area' | 'note' | 'question'; who: string[]; state: DeadlineState; go: string }

const SOON_DAYS = 7;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

export function deadlines(m: Model, wp: WP, clock: string): Deadline[] {
  const today = clock.slice(0, 10);
  const fe = wp.filing.events;
  const filed = !!wp.filing.frozen || fe.some((e) => e.action === 'efile_ack' && e.payload.status === 'accepted');
  const extended = fe.some((e) => e.action === 'extension_filed');
  const allSigned = (level: string) => AREAS.every((a) => latestSignoff(wp, a.id, level));
  const outsideDone = (re: RegExp) => wp.judgments.some((j) => j.kind === 'outside_filing' && re.test(j.title + ' ' + j.decision));
  const asg = (role: 'preparer' | 'reviewer' | 'partner') => [...new Set([...wp.assignments.values()].map((x) => x[role]).filter(Boolean) as string[])];
  const out: Omit<Deadline, 'state'>[] = [];
  const done = new Set<string>();

  m.p.firm.deadlines.forEach((d, i) => {
    const id = `firm-${i}`;
    const what = d.what;
    let kind: Deadline['kind'] = 'filing';
    let who = [...asg('reviewer'), ...asg('partner')];
    let ok = false;
    if (/original due/i.test(what)) ok = filed || extended;
    else if (/extended due/i.test(what)) ok = filed;
    else if (/hand-off/i.test(what)) ((kind = 'internal'), (who = asg('preparer')), (ok = allSigned('preparer')));
    else if (/review complete/i.test(what)) ((kind = 'internal'), (who = asg('reviewer')), (ok = allSigned('reviewer')));
    else if (/FBAR|114/i.test(what)) ((kind = 'outside'), (ok = outsideDone(/FBAR|114/i)));
    else if (/1099-NEC/i.test(what)) ((kind = 'outside'), (ok = outsideDone(/1099/i)));
    if (ok) done.add(id);
    out.push({ id, what, date: d.date, kind, who, go: kind === 'outside' ? '#/review/judgments' : '#/filing' });
  });
  for (const a of AREAS) {
    const x = wp.assignments.get(a.id);
    if (!x?.due) continue;
    const id = `area-${a.id}`;
    if (latestSignoff(wp, a.id, 'preparer')) done.add(id);
    out.push({ id, what: `${a.name}: preparer sign-off`, date: x.due, kind: 'area', who: x.preparer ? [x.preparer] : [], go: `#/area/${a.id}` });
  }
  for (const n of wp.notes) {
    if (!n.due) continue;
    if (n.status !== 'open') done.add(n.id);
    out.push({ id: n.id, what: `Note: ${n.text.slice(0, 70)}`, date: n.due, kind: 'note', who: [n.assignee ?? n.by], go: '#/review/notes' });
  }
  for (const q of wp.questions) {
    if (!q.due) continue;
    if (q.status !== 'open') done.add(q.id);
    out.push({ id: q.id, what: `${q.to === 'client' ? 'Client' : m.staffName(q.to)} to answer: ${q.text.slice(0, 60)}`, date: q.due, kind: 'question', who: [q.to, q.by], go: '#/review/questions' });
  }
  return out
    .map((d) => ({ ...d, state: (done.has(d.id) ? 'done' : d.date < today ? 'overdue' : dayDiff(d.date, today) <= SOON_DAYS ? 'soon' : 'upcoming') as DeadlineState }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface InboxItem { id: string; at: string; kind: 'decide' | 'signoff' | 'reopened' | 'note' | 'question' | 'answer' | 'mention' | 'deadline'; text: string; go: string; focus?: string; action: boolean }

/** Mentions are @FirstName (or @staff id) in a note or reply. */
export const mentions = (m: Model, text: string) => {
  const tags = [...text.matchAll(/@([\w-]+)/g)].map((x) => x[1].toLowerCase());
  return m.staff.filter((s) => tags.includes(s.id) || tags.includes(s.name.split(' ')[0].toLowerCase())).map((s) => s.id);
};

export function inbox(m: Model, v: Version, wp: WP, findings: Finding[], clock: string, me: Actor): InboxItem[] {
  const items: InboxItem[] = [];
  if (me.isClient) {
    for (const q of wp.questions) if (q.to === 'client' && q.status === 'open') items.push({ id: q.id, at: q.simAt, kind: 'question', text: `${m.staffName(q.by)} asked: ${q.text}`, go: '#/', action: true });
    return items;
  }
  const alts = m.p.what_if.alternatives;
  for (const a of wp.adjustments)
    if (a.status === 'proposed' && !canDecide(me, a, v, wp, alts)) items.push({ id: 'dec-' + a.id, at: a.simAt, kind: 'decide', text: `Decide: ${a.title} (proposed by ${m.staffName(a.by)})`, go: '#/review/adjustments', focus: a.target, action: true });

  for (const ar of AREAS) {
    const asg = wp.assignments.get(ar.id) ?? {};
    for (const s of signoffStates(m, v, wp, ar.id, findings, clock)) {
      const mine = (asg as any)[s.level] === me.id;
      if (s.reopened && s.signoff!.by === me.id)
        items.push({ id: `ro-${ar.id}-${s.level}`, at: s.signoff!.simAt, kind: 'reopened', text: `Your ${s.level} sign-off on ${ar.name} reopened: ${s.changes.slice(0, 2).join('; ')}${s.changes.length > 2 ? '…' : ''}`, go: `#/area/${ar.id}`, action: !canSignoff(m, v, wp, me, ar.id, s.level) });
      else if (mine && !s.current && !canSignoff(m, v, wp, me, ar.id, s.level))
        items.push({ id: `so-${ar.id}-${s.level}`, at: clock, kind: 'signoff', text: `${ar.name}: ${s.level} sign-off ${s.signoff ? 'needs re-signing' : 'is yours'}`, go: `#/area/${ar.id}`, action: true });
    }
  }
  for (const n of wp.notes) {
    if (n.assignee === me.id && n.status === 'open') items.push({ id: 'n-' + n.id, at: n.simAt, kind: 'note', text: `${m.staffName(n.by)} assigned you: ${n.text}`, go: '#/review/notes', focus: n.target[0], action: true });
    else if (mentions(m, n.text).includes(me.id) && n.by !== me.id) items.push({ id: 'mn-' + n.id, at: n.simAt, kind: 'mention', text: `${m.staffName(n.by)} mentioned you: ${n.text}`, go: '#/review/notes', focus: n.target[0], action: n.status === 'open' });
    n.replies.forEach((r, i) => {
      if (r.by !== me.id && (mentions(m, r.text).includes(me.id) || n.by === me.id))
        items.push({ id: `rp-${n.id}-${i}`, at: r.simAt, kind: 'mention', text: `${m.staffName(r.by)} replied${n.by === me.id ? ' to your note' : ''}: ${r.text}`, go: '#/review/notes', focus: n.target[0], action: false });
    });
  }
  for (const q of wp.questions) {
    if (q.to === me.id && q.status === 'open') items.push({ id: 'q-' + q.id, at: q.simAt, kind: 'question', text: `${m.staffName(q.by)} asks: ${q.text}`, go: '#/review/questions', focus: q.target[0], action: true });
    if (q.by === me.id && q.answer) items.push({ id: 'a-' + q.id, at: q.answer.simAt, kind: 'answer', text: `${m.staffName(q.answer.by)} answered: ${q.answer.text}`, go: '#/review/questions', focus: q.target[0], action: false });
  }
  for (const d of deadlines(m, wp, clock))
    if ((d.state === 'overdue' || d.state === 'soon') && d.who.includes(me.id))
      items.push({ id: 'dl-' + d.id, at: clock, kind: 'deadline', text: `${d.state === 'overdue' ? 'Overdue' : 'Due'} ${d.date}: ${d.what}`, go: d.go, action: d.state === 'overdue' });
  return items.sort((a, b) => (a.action !== b.action ? (a.action ? -1 : 1) : a.at < b.at ? 1 : -1));
}
