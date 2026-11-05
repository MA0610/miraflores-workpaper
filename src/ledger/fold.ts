import type { AdjustPayload, LEvent } from './types';

export interface Adjustment extends AdjustPayload {
  id: string;
  by: string;
  simAt: string;
  status: 'proposed' | 'approved' | 'rejected';
  decisions: { by: string; decision: 'approved' | 'rejected'; note?: string; simAt: string }[];
  layer: 'original' | string; // 'original' or an amendment id
}
export interface Note {
  id: string;
  by: string;
  simAt: string;
  target: string[];
  area?: string;
  text: string;
  kind: 'review' | 'comment' | 'quality';
  blocking: boolean;
  status: 'open' | 'resolved';
  assignee?: string;
  due?: string; // YYYY-MM-DD
  replies: { by: string; text: string; simAt: string }[];
}
/** Review/quality notes and anything blocking need action; plain comments (e.g. PY variance explanations) don't. */
export const actionable = (n: Note) => n.status === 'open' && (n.kind !== 'comment' || n.blocking);
export interface Question {
  id: string;
  by: string;
  simAt: string;
  to: string; // 'client' or staff id
  target: string[];
  area?: string;
  text: string;
  due?: string;
  status: 'open' | 'answered';
  answer?: { by: string; text: string; simAt: string; attachments?: string[] };
}
export interface Judgment {
  id: string;
  by: string;
  simAt: string;
  target: string[];
  area?: string;
  kind: 'judgment' | 'election' | 'due_diligence' | 'penalty' | 'diagnostic' | 'outside_filing' | 'completeness';
  title: string;
  decision: string;
  authority?: string;
  alternatives?: string;
  whatIf?: string;
}
export interface Signoff {
  id: string;
  by: string;
  simAt: string;
  area: string;
  level: 'preparer' | 'reviewer' | 'partner';
  hash: string;
  snapshot: Record<string, any>;
  note?: string;
}
export interface Attachment {
  id: string;
  by: string;
  simAt: string;
  target: string[];
  name: string;
  mime: string;
  size: number;
  data?: string; // data URL
  text?: string;
  kind: 'file' | 'message' | 'note';
}
export interface Verification { id: string; by: string; simAt: string; target: string; method: string; note?: string; evidence?: string[] }

export interface WP {
  all: LEvent[];
  visible: LEvent[];
  undone: Set<string>;
  verifications: Map<string, Verification[]>;
  adjustments: Adjustment[];
  notes: Note[];
  questions: Question[];
  judgments: Judgment[];
  findingRes: Map<string, { by: string; simAt: string; resolution: 'adjusted' | 'no_change' | 'accepted_risk' | 'question_sent'; note: string; eventId: string }>;
  signoffs: Signoff[];
  assignments: Map<string, { preparer?: string; reviewer?: string; partner?: string; due?: string }>;
  /** who set each area role, and when (for "you were assigned" notifications) */
  assignedBy: Map<string, { by: string; simAt: string }>;
  attachments: Attachment[];
  links: { id: string; a: string; b: string; note: string; by: string }[];
  time: { id: string; by: string; area: string; hours: number; simAt: string; note?: string }[];
  viewLog: { id: string; by: string; simAt: string; at: string; field: string; target: string }[];
  dispositions: Map<string, { status: string; note: string; by: string; simAt: string }>;
  householdFixes: Map<string, { value: string; by: string; reason: string; evidence: string[]; simAt: string }>;
  standards: Record<string, any>;
  filing: {
    events: { id: string; by: string; simAt: string; action: string; payload: any }[];
    frozen?: { simAt: string; by: string; hash: string; snapshot: any; eventId: string };
    amendments: { id: string; simAt: string; by: string; reason: string }[];
  };
  seen: Map<string, string>; // actor -> real ISO time of last "seen"
  seenSim: Map<string, string>; // actor -> season time of last "seen" (inbox read marker; replays with the clock)
}

/** Walk backwards so an undo of an undo restores the original. */
export function computeUndone(events: LEvent[]) {
  const undone = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (undone.has(e.id)) continue;
    if (e.type === 'undo') for (const id of e.payload.ids as string[]) undone.add(id);
  }
  return undone;
}

export function fold(all: LEvent[], clock: string, baseStandards: any): WP {
  const sorted = [...all].sort((a, b) => (a.simAt === b.simAt ? (a.at < b.at ? -1 : 1) : a.simAt < b.simAt ? -1 : 1));
  const visible = sorted.filter((e) => e.simAt <= clock);
  const undone = computeUndone(visible);
  const wp: WP = {
    all: sorted,
    visible,
    undone,
    verifications: new Map(),
    adjustments: [],
    notes: [],
    questions: [],
    judgments: [],
    findingRes: new Map(),
    signoffs: [],
    assignments: new Map(),
    assignedBy: new Map(),
    attachments: [],
    links: [],
    time: [],
    viewLog: [],
    dispositions: new Map(),
    householdFixes: new Map(),
    standards: JSON.parse(JSON.stringify(baseStandards)),
    filing: { events: [], amendments: [] },
    seen: new Map(),
    seenSim: new Map(),
  };
  const adjById = new Map<string, Adjustment>();
  const noteById = new Map<string, Note>();
  const qById = new Map<string, Question>();
  for (const e of visible) {
    if (undone.has(e.id) || e.type === 'undo') continue;
    const p = e.payload || {};
    switch (e.type) {
      case 'verify':
        for (const t of e.target || []) {
          const list = wp.verifications.get(t) ?? [];
          list.push({ id: e.id, by: e.actor, simAt: e.simAt, target: t, method: p.method, note: p.note, evidence: p.evidence });
          wp.verifications.set(t, list);
        }
        break;
      case 'adjust': {
        const a: Adjustment = { ...(p as AdjustPayload), id: e.id, by: e.actor, simAt: e.simAt, status: 'proposed', decisions: [], layer: wp.filing.frozen ? wp.filing.amendments.at(-1)?.id ?? 'post-filing' : 'original' };
        wp.adjustments.push(a);
        adjById.set(e.id, a);
        break;
      }
      case 'adjust_decision': {
        const a = adjById.get(p.adjustmentId);
        if (a) {
          a.decisions.push({ by: e.actor, decision: p.decision, note: p.note, simAt: e.simAt });
          a.status = p.decision;
        }
        break;
      }
      case 'note': {
        const n: Note = { id: e.id, by: e.actor, simAt: e.simAt, target: e.target || [], area: p.area, text: p.text, kind: p.kind || 'comment', blocking: !!p.blocking, status: 'open', assignee: p.assignee, due: p.due, replies: [] };
        wp.notes.push(n);
        noteById.set(e.id, n);
        break;
      }
      case 'note_reply':
        noteById.get(p.noteId)?.replies.push({ by: e.actor, text: p.text, simAt: e.simAt });
        break;
      case 'note_status': {
        const n = noteById.get(p.noteId);
        if (n) n.status = p.status;
        break;
      }
      case 'question': {
        const q: Question = { id: e.id, by: e.actor, simAt: e.simAt, to: p.to, target: e.target || [], area: p.area, text: p.text, due: p.due, status: 'open' };
        wp.questions.push(q);
        qById.set(e.id, q);
        break;
      }
      case 'answer': {
        const q = qById.get(p.questionId);
        if (q) {
          q.status = 'answered';
          q.answer = { by: e.actor, text: p.text, simAt: e.simAt, attachments: p.attachments };
        }
        break;
      }
      case 'judgment':
        wp.judgments.push({ id: e.id, by: e.actor, simAt: e.simAt, target: e.target || [], ...p });
        break;
      case 'finding_resolve':
        wp.findingRes.set(p.findingId, { by: e.actor, simAt: e.simAt, resolution: p.resolution, note: p.note, eventId: e.id });
        break;
      case 'signoff':
        wp.signoffs.push({ id: e.id, by: e.actor, simAt: e.simAt, area: p.area, level: p.level, hash: p.hash, snapshot: p.snapshot, note: p.note });
        break;
      case 'assign': {
        const cur = wp.assignments.get(p.area) ?? {};
        wp.assignments.set(p.area, { ...cur, ...p.set });
        for (const role of Object.keys(p.set)) if (role !== 'due') wp.assignedBy.set(`${p.area}.${role}`, { by: e.actor, simAt: e.simAt });
        break;
      }
      case 'attach':
        wp.attachments.push({ id: e.id, by: e.actor, simAt: e.simAt, target: e.target || [], ...p });
        break;
      case 'link':
        wp.links.push({ id: e.id, a: p.a, b: p.b, note: p.note, by: e.actor });
        break;
      case 'time':
        wp.time.push({ id: e.id, by: e.actor, area: p.area, hours: p.hours, simAt: e.simAt, note: p.note });
        break;
      case 'view_sensitive':
        wp.viewLog.push({ id: e.id, by: e.actor, simAt: e.simAt, at: e.at, field: p.field, target: (e.target || [])[0] });
        break;
      case 'disposition':
        for (const t of e.target || []) wp.dispositions.set(t, { status: p.status, note: p.note, by: e.actor, simAt: e.simAt });
        break;
      case 'household_fix':
        wp.householdFixes.set(p.key, { value: p.value, by: e.actor, reason: p.reason, evidence: p.evidence || [], simAt: e.simAt });
        break;
      case 'standards':
        setPath(wp.standards, p.path, p.value);
        break;
      case 'filing':
        wp.filing.events.push({ id: e.id, by: e.actor, simAt: e.simAt, action: p.action, payload: p });
        if (p.action === 'freeze') wp.filing.frozen = { simAt: e.simAt, by: e.actor, hash: p.hash, snapshot: p.snapshot, eventId: e.id };
        if (p.action === 'amendment_started') wp.filing.amendments.push({ id: e.id, simAt: e.simAt, by: e.actor, reason: p.reason });
        break;
      case 'seen':
        wp.seen.set(e.actor, e.at);
        wp.seenSim.set(e.actor, e.simAt);
        break;
    }
  }
  return wp;
}

function setPath(obj: any, path: string, value: any) {
  const parts = path.split('.');
  let o = obj;
  for (const k of parts.slice(0, -1)) o = o[k] ??= {};
  o[parts.at(-1)!] = value;
}

/** Latest effective sign-off per area and level. */
export function latestSignoff(wp: WP, area: string, level: string) {
  for (let i = wp.signoffs.length - 1; i >= 0; i--) if (wp.signoffs[i].area === area && wp.signoffs[i].level === level) return wp.signoffs[i];
  return undefined;
}
