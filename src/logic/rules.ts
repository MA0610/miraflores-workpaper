import { AREAS, lineArea, docArea, type Model } from '../data/model';
import type { Version } from '../data/types';
import { latestSignoff, type Adjustment, type Note, type WP } from '../ledger/fold';
import { adjEffect, biggest } from './effects';
import { findingStatus, type Finding } from './checks';

// ---------------- people and roles ----------------
export interface Actor { id: string; name: string; role: string; clearance: boolean; credential?: string | null; isClient: boolean }
export function actor(m: Model, id: string): Actor {
  const s = m.staff.find((x) => x.id === id);
  if (s) return { id, name: s.name, role: s.role, clearance: s.sensitive_data_clearance, credential: s.credential, isClient: false };
  const c = m.p.firm.client_users.find((x) => x.id === id);
  return { id, name: c?.name ?? id, role: 'client', clearance: false, isClient: true };
}
export const ROLE_LABEL: Record<string, string> = { preparer: 'Preparer', reviewer: 'Reviewer', partner: 'Partner', firm_administrator: 'Firm admin', quality_reviewer: 'Quality reviewer', client: 'Client' };

type Action = 'verify' | 'adjust' | 'note' | 'question' | 'judgment' | 'assign' | 'time' | 'attach' | 'standards' | 'file' | 'approve_return' | 'decide_adjustment' | 'disposition' | 'quality_note';
export function can(a: Actor, action: Action): boolean {
  const r = a.role;
  if (r === 'client') return action === 'approve_return' || action === 'attach';
  if (r === 'firm_administrator') return ['standards', 'assign', 'note', 'time'].includes(action);
  if (r === 'quality_reviewer') return ['note', 'quality_note', 'time'].includes(action);
  if (action === 'standards' || action === 'approve_return') return false;
  if (action === 'decide_adjustment') return r === 'reviewer' || r === 'partner';
  if (action === 'file') return r === 'partner' || r === 'reviewer';
  return true; // preparer / reviewer / partner work the file
}

/** Who prepared an area: anyone who adjusted, verified, or signed as preparer there. */
export function preparersOf(m: Model, v: Version, wp: WP, area: string) {
  const ids = new Set<string>();
  for (const a of wp.adjustments) if (a.area === area) ids.add(a.by);
  for (const [t, vs] of wp.verifications) {
    const l = m.line(v.version, t);
    const ar = l ? lineArea(l) : m.evs.get(t) ? docArea(m.docs.get(m.evs.get(t)!.document_id)!) : null;
    if (ar === area) for (const x of vs) ids.add(x.by);
  }
  for (const s of wp.signoffs) if (s.area === area && s.level === 'preparer') ids.add(s.by);
  return ids;
}

export function canSignoff(m: Model, v: Version, wp: WP, a: Actor, area: string, level: 'preparer' | 'reviewer' | 'partner'): string | null {
  if (a.isClient || a.role === 'firm_administrator' || a.role === 'quality_reviewer') return 'Your role does not sign off.';
  if (level === 'preparer' && !['preparer', 'reviewer', 'partner'].includes(a.role)) return 'Preparers sign at this level.';
  if (level === 'reviewer' && !['reviewer', 'partner'].includes(a.role)) return 'Needs a reviewer or partner.';
  if (level === 'partner' && a.role !== 'partner') return 'Needs a partner.';
  if (level !== 'preparer' && preparersOf(m, v, wp, area).has(a.id)) return 'You prepared work in this area; firm rule: a person may not review or sign off on work they prepared.';
  return null;
}

/** A note blocks filing if it was flagged so, or — while the firm rule says so — if it is an open review/quality note. */
export function noteBlocks(n: Note, wp: WP) {
  if (n.status !== 'open') return false;
  return n.blocking || (n.kind !== 'comment' && (wp.standards.rules as string[]).some((r) => /open review notes block filing/i.test(r)));
}

export function partnerThreshold(wp: WP) {
  const r = (wp.standards.rules as string[]).find((x) => /tax effect over ([\d,]+)/.test(x));
  return r ? Number(r.match(/over ([\d,]+)/)![1].replace(/,/g, '')) : 1000;
}

export function canDecide(a: Actor, adj: Adjustment, v: Version, wp: WP, whatIfs: any[]): string | null {
  if (!['reviewer', 'partner'].includes(a.role)) return 'Only reviewers and partners approve adjustments.';
  if (adj.by === a.id) return 'You proposed this adjustment.';
  const eff = biggest(adjEffect(adj, v, whatIfs));
  if (eff > partnerThreshold(wp) && a.role !== 'partner') return `Tax effect ${Math.round(eff).toLocaleString()} exceeds ${partnerThreshold(wp).toLocaleString()}: partner sign-off required.`;
  return null;
}

// ---------------- adjusted values and area snapshots ----------------
export function liveAdjustments(wp: WP) {
  return wp.adjustments.filter((a) => a.status !== 'rejected');
}
export function adjustedValue(wp: WP, key: string, engine: any) {
  const list = liveAdjustments(wp).filter((a) => a.target === key);
  if (!list.length) return engine;
  const last = list[list.length - 1];
  return last.to;
}

export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** What a sign-off covers: the area's numbers as adjusted, its adjustments, documents and checks. */
export function areaSnapshot(m: Model, v: Version, wp: WP, area: string, findings: Finding[], clock: string) {
  const lines: Record<string, any> = {};
  for (const l of v.lines) if (lineArea(l) === area) lines[l.key] = adjustedValue(wp, l.key, l.value);
  // approval does not change what was signed; a rejection or a new value does
  const adjustments = liveAdjustments(wp).filter((a) => a.area === area).map((a) => `${a.id}:live:${a.to}`);
  const docs = m.p.documents.filter((d) => docArea(d) === area && d.received_at <= clock).map((d) => d.id);
  const checks = findings.filter((f) => f.area === area).map((f) => `${f.id}:${findingStatus(f, wp)}`);
  // titles are for reading the reopen diff only; snapHash leaves them out
  const titles = Object.fromEntries([...liveAdjustments(wp).filter((a) => a.area === area).map((a) => [a.id, a.title]), ...findings.filter((f) => f.area === area).map((f) => [f.id, f.title])]);
  return { version: v.version, lines, adjustments, docs, checks, titles };
}
export const snapHash = (snap: any) => hash(JSON.stringify({ ...snap, titles: undefined }));
export function diffSnapshots(a: any, b: any): string[] {
  const out: string[] = [];
  if (!a || !b) return out;
  if (a.version !== b.version) out.push(`Engine version ${a.version} → ${b.version}`);
  for (const k of new Set([...Object.keys(a.lines), ...Object.keys(b.lines)]))
    if (JSON.stringify(a.lines[k]) !== JSON.stringify(b.lines[k])) out.push(`${k}: ${fmtv(a.lines[k])} → ${fmtv(b.lines[k])}`);
  const da = new Set(a.docs), db = new Set(b.docs);
  for (const d of db) if (!da.has(d)) out.push(`New document ${d}`);
  const aa = new Set(a.adjustments), ab = new Set(b.adjustments);
  const name = (x: unknown) => { const id = String(x).split(':')[0]; const t = b.titles?.[id] ?? a.titles?.[id]; return t ? `“${t}”` : id; };
  for (const x of ab) if (!aa.has(x)) out.push(`Adjustment ${name(x)} added or changed`);
  for (const x of aa) if (!ab.has(x) && !(Array.from(ab) as string[]).some((y) => y.startsWith(String(x).split(':')[0]))) out.push(`Adjustment ${name(x)} removed`);
  const ca = new Set(a.checks), cb = new Set(b.checks);
  for (const x of cb) if (!ca.has(x)) { const [id, st] = String(x).split(':'); out.push(`Check ${name(id)} now ${st}`); }
  return out;
}
const fmtv = (x: any) => (typeof x === 'number' ? Math.round(x).toLocaleString() : x == null ? '—' : String(x));

export function signoffStates(m: Model, v: Version, wp: WP, area: string, findings: Finding[], clock: string) {
  const snap = areaSnapshot(m, v, wp, area, findings, clock);
  const h = snapHash(snap);
  return (['preparer', 'reviewer', 'partner'] as const).map((level) => {
    const s = latestSignoff(wp, area, level);
    const current = !!s && s.hash === h;
    return { level, signoff: s, current, reopened: !!s && !current, changes: s && !current ? diffSnapshots(s.snapshot, snap) : [], snap, hash: h };
  });
}

// ---------------- filing readiness ----------------
export interface Gate { id: string; label: string; ok: boolean; detail: string; blocking: boolean; go?: string }
export function readiness(m: Model, v: Version, wp: WP, findings: Finding[], clock: string, whatIfs: any[]): Gate[] {
  const thr = partnerThreshold(wp);
  const openBlockingNotes = wp.notes.filter((n) => noteBlocks(n, wp));
  const blockingFindings = findings.filter((f) => f.blocksFiling && findingStatus(f, wp) === 'open');
  const openFindings = findings.filter((f) => (f.severity === 'error' || f.severity === 'warning') && findingStatus(f, wp) === 'open');
  const undecided = wp.adjustments.filter((a) => a.status === 'proposed');
  const overThr = (a: Adjustment) => biggest(adjEffect(a, v, whatIfs)) > thr;
  const needPartner = wp.adjustments.filter((a) => a.status === 'approved' && overThr(a) && !a.decisions.some((d) => d.decision === 'approved' && actor(m, d.by).role === 'partner'));
  const undecidedPartner = undecided.filter(overThr).length;
  const fixEvidence = new Set([...wp.householdFixes.values()].flatMap((f) => f.evidence));
  const docsUnaccounted = m.p.documents.filter((d) => d.received_at <= clock && !wp.dispositions.has(d.id) && !fixEvidence.has(d.id) && !v.documents_used.includes(d.id) && !v.documents_superseded.includes(d.id));
  const areaStates = AREAS.map((a) => ({ a, s: signoffStates(m, v, wp, a.id, findings, clock) }));
  const reviewerMissing = areaStates.filter((x) => !x.s[1].current).map((x) => x.a.name);
  const partnerMissing = areaStates.filter((x) => !x.s[2].current).map((x) => x.a.name);
  const approvals = wp.filing.events.filter((e) => e.action === 'client_approved');
  const lastApproval = approvals.at(-1);
  const dd = wp.judgments.some((j) => j.kind === 'due_diligence');
  const openQs = wp.questions.filter((q) => q.status === 'open');
  const engagement = m.p.documents.some((d) => d.id === 'D01') && m.p.documents.some((d) => d.id === 'D02');
  const idv = wp.verifications.has('D04') && wp.verifications.has('D05');
  const pyReviewed = wp.verifications.has('D06') || wp.dispositions.has('D06');
  const variances = findings.find((f) => f.id === 'variances');
  const unexplained = (variances?.lines ?? []).filter((k) => !wp.notes.some((n) => n.target.includes(k)) && !wp.judgments.some((j) => j.target.includes(k)) && !wp.adjustments.some((a) => a.target === k));
  const carry = findings.find((f) => f.id === 'carryovers');
  const est = findings.filter((f) => f.id === 'est-fed' || f.id === 'est-ca');
  const diags = v.diagnostics.filter((d) => d.severity === 'warning' && !wp.judgments.some((j) => j.kind === 'diagnostic' && j.target.includes(d.code)));
  return [
    { id: 'engagement', label: 'Engagement letter and consents signed', ok: engagement, detail: 'D01, D02 signed 01/12/2026', blocking: true, go: '#/doc/D01' },
    { id: 'identity', label: 'Identity verified', ok: idv, detail: idv ? 'Driver licenses verified' : 'Verify D04 and D05', blocking: true, go: '#/area/intake' },
    { id: 'py', label: 'Prior-year return reviewed', ok: pyReviewed, detail: pyReviewed ? 'D06 reviewed' : 'Verify or disposition D06', blocking: true, go: '#/doc/D06' },
    { id: 'docs', label: 'All documents accounted for', ok: docsUnaccounted.length === 0, detail: docsUnaccounted.length ? `${docsUnaccounted.map((d) => d.id).join(', ')} not used by the engine and not dispositioned` : 'Every document landed, was superseded, supports a household fix, or has a recorded disposition', blocking: true, go: '#/documents' },
    { id: 'variances', label: 'Prior-year variances explained', ok: unexplained.length === 0, detail: unexplained.length ? `${unexplained.length} swings without a note, judgment or adjustment` : 'All swings explained', blocking: true, go: '#/schedules/summary' },
    { id: 'carry', label: 'Carryovers agreed to prior year', ok: carry?.severity === 'pass', detail: carry?.title ?? '', blocking: true, go: '#/schedules/carryovers' },
    { id: 'est', label: 'Estimated payments agreed to IRS and FTB records', ok: est.every((f) => findingStatus(f, wp) !== 'open'), detail: est.map((f) => f.title).join(' · '), blocking: true, go: '#/schedules/payments' },
    { id: 'dd', label: 'Due diligence completed', ok: dd, detail: dd ? 'Form 8867 knowledge documented' : 'Record a due-diligence judgment', blocking: true, go: '#/area/deductions' },
    { id: 'diag', label: 'Diagnostics resolved', ok: diags.length === 0, detail: diags.length ? `${diags.length} engine warnings without a recorded resolution` : 'All engine warnings resolved', blocking: true, go: '#/review/diagnostics' },
    { id: 'findings', label: 'Independent checks closed', ok: openFindings.length === 0, detail: openFindings.length ? `${openFindings.length} open` : 'None open', blocking: true, go: '#/review/checks' },
    { id: 'blocking', label: 'No blocking items', ok: !openBlockingNotes.length && !blockingFindings.length, detail: [...openBlockingNotes.map((n) => `Note: ${n.text.slice(0, 60)}`), ...blockingFindings.map((f) => f.title)].join(' · ') || 'None', blocking: true, go: '#/review/notes' },
    { id: 'adj', label: 'Adjustments decided (partner over threshold)', ok: !undecided.length && !needPartner.length, detail: undecided.length || needPartner.length ? `${undecided.length} awaiting decision (${undecidedPartner} over the partner threshold)${needPartner.length ? `, ${needPartner.length} approved without the partner` : ''}` : 'All decided', blocking: true, go: '#/review/adjustments' },
    { id: 'questions', label: 'Questions answered', ok: !openQs.length, detail: openQs.length ? `${openQs.length} open` : 'None open', blocking: false, go: '#/review/questions' },
    { id: 'reviewer', label: 'Reviewer sign-off (current)', ok: !reviewerMissing.length, detail: reviewerMissing.length ? `Missing or reopened: ${reviewerMissing.join(', ')}` : 'All areas', blocking: true, go: '#/overview' },
    { id: 'partner', label: 'Partner sign-off (current)', ok: !partnerMissing.length, detail: partnerMissing.length ? `Missing or reopened: ${partnerMissing.join(', ')}` : 'All areas', blocking: true, go: '#/overview' },
    { id: 'client', label: 'Client approval and e-file authorization', ok: !!lastApproval && lastApproval.payload.hash === returnHash(v, wp), detail: lastApproval ? (lastApproval.payload.hash === returnHash(v, wp) ? `Signed 8879 ${lastApproval.simAt.slice(0, 10)}` : 'Return changed after the client approved — re-approval needed') : 'Not yet approved', blocking: true, go: '#/filing' },
  ];
}

/** Fingerprint of the return as it would be filed: engine version plus every live adjustment. */
export function returnHash(v: Version, wp: WP) {
  return hash(JSON.stringify([v.version, liveAdjustments(wp).map((a) => [a.id, a.status, a.to])]));
}
