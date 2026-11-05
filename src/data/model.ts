import type { Doc, EV, Line, Packet, Version } from './types';

/** Workpaper areas. Each has an owner, a budget, checks and a sign-off. */
export const AREAS = [
  { id: 'intake', name: 'Intake & identity', budget: 'intake_and_engagement' },
  { id: 'wages', name: 'Wages & stock comp', budget: 'wages_and_stock_compensation' },
  { id: 'investments', name: 'Investments, crypto & foreign', budget: 'investments_and_digital_assets' },
  { id: 'business', name: 'Lindqvist Studio', budget: 'business' },
  { id: 'rentals', name: 'Rentals & condo sale', budget: 'rentals_and_sale' },
  { id: 'passthrough', name: 'K-1s & basis', budget: 'pass_throughs_and_basis' },
  { id: 'deductions', name: 'Deductions & credits', budget: 'deductions_and_credits' },
  { id: 'california', name: 'California part-year', budget: 'california' },
  { id: 'tax', name: 'Tax, payments & filing', budget: 'partner_review' },
] as const;
export type AreaId = (typeof AREAS)[number]['id'];
export const areaName = (id: string) => AREAS.find((a) => a.id === id)?.name ?? id;

export function lineArea(l: { form: string; line: string; key: string }): AreaId {
  const f = l.form, n = l.line;
  if (f === 'F1040') {
    if (['1a', '1z', '25a', '25d'].includes(n)) return 'wages';
    if (['2b', '3a', '3b', '4a', '4b', '7'].includes(n)) return 'investments';
    if (['12', '19'].includes(n)) return 'deductions';
    if (n === '13') return 'business';
    return 'tax';
  }
  if (f === 'Sch1') return n === '5' ? 'rentals' : n === '13' ? 'wages' : ['10', '26'].includes(n) ? 'tax' : 'business';
  if (f === 'Sch2') return ['1', '3', '11'].includes(n) ? 'wages' : n === '4' ? 'business' : n === '12' ? 'investments' : 'tax';
  if (f === 'Sch3') return n === '11' ? 'wages' : ['1', '8'].includes(n) ? 'investments' : 'tax';
  if (['SchB', 'F8949', 'SchD', 'F8960', 'F8938', 'F8606'].includes(f)) return 'investments';
  if (['SchC', 'SchSE', 'F4562-C', 'F8995'].includes(f)) return n.endsWith('.2') && f === 'F8995' ? 'passthrough' : 'business';
  if (f === 'SchE') return n.startsWith('28') || n === '32' ? 'passthrough' : 'rentals';
  if (['F4562-E', 'F4797', 'F8582'].includes(f)) return 'rentals';
  if (f === 'F7203') return 'passthrough';
  if (['SchA', 'F8283', 'F8812', 'F8863', 'F2441', 'F8867'].includes(f)) return 'deductions';
  if (['F6251', 'F8959', 'F8889'].includes(f)) return 'wages';
  if (f === 'F2210') return 'tax';
  return 'california';
}

const DOC_AREA: Record<string, AreaId> = {
  engagement_letter: 'intake', consent_7216: 'intake', irs_ip_pin_notice: 'intake', identity_document: 'intake', prior_year_return: 'intake', prior_workpaper: 'intake',
  'W-2': 'wages', stock_plan_supplement: 'wages', '3921': 'wages', '3922': 'wages', paystub: 'california', '5498-SA': 'wages', '1099-SA': 'wages',
  books_profit_loss: 'business', books_transaction_detail: 'business', '1099-NEC': 'business', '1099-K': 'business', invoice: 'business', mileage_log: 'business', client_note: 'business', insurance_statement: 'business', retirement_contribution: 'business', books_report: 'business',
  '1099-composite': 'investments', '1099-INT': 'investments', '1099-DA': 'investments', transaction_export: 'investments', foreign_bank_statement: 'investments', '1099-R': 'investments', '5498': 'investments',
  'K-1-1065': 'passthrough', 'K-1-state-supplement': 'passthrough', 'K-1-1120S': 'passthrough',
  rental_owner_statement: 'rentals', '1098': 'deductions', property_tax_bill: 'rentals', rental_ledger: 'rentals', closing_statement_seller: 'rentals', '1099-S': 'rentals',
  closing_statement_buyer: 'deductions', payoff_statement: 'deductions', property_tax_receipt: 'deductions', '1098-T': 'deductions', letter: 'deductions', dependent_care_statement: 'deductions', donation_receipt: 'deductions', '1098-C': 'deductions',
  payment_confirmation: 'tax', irs_transcript: 'tax', irs_notice: 'tax',
};
export function docArea(d: Doc): AreaId {
  if (d.id === 'D47' || d.id === 'D48' || d.id === 'D53') return 'rentals';
  if (d.id === 'D22') return 'business';
  return DOC_AREA[d.document_type] ?? 'intake';
}

export interface Resolved {
  kind: 'ev' | 'doc' | 'page' | 'line' | 'qa' | 'msg' | 'call' | 'py' | 'agency' | 'asset' | 'household' | 'param' | 'fx' | 'timeline' | 'version' | 'unknown';
  id: string;
  title: string;
  detail?: string;
  value?: any;
  docId?: string;
  page?: number;
}

function pointer(obj: any, ptr: string): any {
  if (!ptr || ptr === '/') return obj;
  return ptr
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export class Model {
  p: Packet;
  docs = new Map<string, Doc>();
  evs = new Map<string, EV>();
  evsByDoc = new Map<string, EV[]>();
  versions: Version[];
  lineMaps = new Map<string, Map<string, Line>>();
  /** ref -> lines (per version) that cite it as a source */
  citedBy = new Map<string, { v: string; key: string }[]>();
  /** line key -> lines that take it as an input (per version) */
  usedBy = new Map<string, Map<string, string[]>>();
  staff: Packet['firm']['staff'];

  constructor(p: Packet) {
    this.p = p;
    this.staff = p.firm.staff;
    for (const d of p.documents) this.docs.set(d.id, d);
    for (const e of p.extracted_values) {
      this.evs.set(e.id, e);
      if (!this.evsByDoc.has(e.document_id)) this.evsByDoc.set(e.document_id, []);
      this.evsByDoc.get(e.document_id)!.push(e);
    }
    this.versions = p.return_versions;
    for (const v of this.versions) {
      const m = new Map<string, Line>();
      const ub = new Map<string, string[]>();
      for (const l of v.lines) {
        m.set(l.key, l);
        for (const s of l.sources || []) {
          const list = this.citedBy.get(s) ?? [];
          list.push({ v: v.version, key: l.key });
          this.citedBy.set(s, list);
        }
        for (const i of l.inputs || []) {
          if (!ub.has(i)) ub.set(i, []);
          ub.get(i)!.push(l.key);
        }
      }
      this.lineMaps.set(v.version, m);
      this.usedBy.set(v.version, ub);
    }
  }

  version(v: string) {
    return this.versions.find((x) => x.version === v)!;
  }
  line(v: string, key: string) {
    return this.lineMaps.get(v)?.get(key);
  }
  /** The latest engine version computed at or before the season clock. */
  versionAt(clock: string): Version | null {
    let best: Version | null = null;
    for (const v of this.versions) if (v.computed_at <= clock) best = v;
    return best;
  }
  staffName(id?: string | null) {
    if (!id) return 'System';
    return this.staff.find((s) => s.id === id)?.name ?? this.p.firm.client_users.find((c) => c.id === id)?.name ?? id;
  }
  priorLine(key: string): number | undefined {
    const v = this.p.prior_years.return_2024.lines[key];
    return typeof v === 'number' ? v : undefined;
  }

  /** Every place a document's values landed in a version, plus values that landed nowhere. */
  landing(docId: string, v: string) {
    const vals = this.evsByDoc.get(docId) ?? [];
    const landed: { ev: EV; lines: string[] }[] = [];
    const unused: EV[] = [];
    for (const e of vals) {
      const lines = (this.citedBy.get(e.id) ?? []).filter((c) => c.v === v).map((c) => c.key);
      if (lines.length) landed.push({ ev: e, lines });
      else unused.push(e);
    }
    const docLevel = (this.citedBy.get(docId) ?? []).filter((c) => c.v === v).map((c) => c.key);
    return { landed, unused, docLevel };
  }

  resolve(ref: string, v = 'v3'): Resolved {
    const p = this.p;
    if (/^ev-\d+$/.test(ref)) {
      const e = this.evs.get(ref);
      if (!e) return { kind: 'unknown', id: ref, title: ref };
      const d = this.docs.get(e.document_id);
      return { kind: 'ev', id: ref, title: `${e.label}`, detail: `${d?.id} · ${d?.title} · p${e.page}`, value: e.value, docId: e.document_id, page: e.page };
    }
    if (/^D\d\d$/.test(ref)) {
      const d = this.docs.get(ref);
      return { kind: 'doc', id: ref, title: d?.title ?? ref, docId: ref };
    }
    const dp = ref.match(/^doc:(D\d\d)#page(\d+)$/);
    if (dp) return { kind: 'page', id: ref, title: `${this.docs.get(dp[1])?.title} — page ${dp[2]}`, docId: dp[1], page: +dp[2] };
    if (/^qa-\d+$/.test(ref)) {
      const q = p.client.questionnaire.find((x) => x.id === ref);
      return { kind: 'qa', id: ref, title: q?.question ?? ref, detail: `${q?.answered_by}: “${q?.answer}”`, value: q?.answer };
    }
    if (/^msg-\d+$/.test(ref)) {
      const m = p.client.messages.find((x) => x.id === ref);
      return { kind: 'msg', id: ref, title: `Message from ${m?.from}`, detail: m?.text, value: m?.text };
    }
    if (/^call-\d+$/.test(ref)) {
      const c = p.client.call_notes.find((x) => x.id === ref);
      return { kind: 'call', id: ref, title: `Call ${c?.date.slice(0, 10)} (${c?.participants.join(', ')})`, detail: c?.notes.join(' · ') };
    }
    if (ref.startsWith('py:')) {
      const val = pointer(p.prior_years, ref.slice(3));
      return { kind: 'py', id: ref, title: `Prior year · ${ref.slice(4).replace(/\//g, ' › ')}`, value: val };
    }
    if (ref.startsWith('agency:')) {
      const val = pointer(p.tax_agency_records, ref.slice(7));
      return { kind: 'agency', id: ref, title: `Agency record · ${ref.slice(8).replace(/\//g, ' › ')}`, value: val };
    }
    if (ref.startsWith('asset:')) {
      const id = ref.slice(6);
      const a = this.version(v)?.assets.find((x: any) => x.asset_id === id) ?? p.prior_years.asset_records.find((x: any) => x.asset_id === id);
      return { kind: 'asset', id: ref, title: `Asset ${id} · ${a?.description ?? ''}`, value: a };
    }
    if (ref.startsWith('household:')) {
      const per = p.household.people.find((x) => x.id === ref.slice(10));
      return { kind: 'household', id: ref, title: `${per?.name} (${per?.role})`, value: per };
    }
    if (ref.startsWith('ref:param.')) {
      const n = ref.slice(10);
      return { kind: 'param', id: ref, title: `Engine parameter · ${n}`, value: p.engine_reference.parameters[n] };
    }
    if (ref.startsWith('ref:fx.')) {
      const [, cur, rate] = ref.split('.');
      return { kind: 'fx', id: ref, title: `FX ${cur} ${rate.replace('_', ' ')}`, value: p.fx_rates[`${cur}_per_USD`]?.[rate] };
    }
    if (ref.startsWith('timeline:')) {
      const t = p.timeline.find((x) => x.id === ref.slice(9));
      return { kind: 'timeline', id: ref, title: `Timeline · ${t?.event.replace(/_/g, ' ')}`, detail: t?.detail ?? undefined };
    }
    if (/^v\d$/.test(ref)) return { kind: 'version', id: ref, title: `Engine version ${ref}` };
    const l = this.line(v, ref);
    if (l) return { kind: 'line', id: ref, title: l.label, value: l.value };
    return { kind: 'unknown', id: ref, title: ref };
  }
}

// ---------- locating an extracted value in the simulated page text ----------
const pad = (n: number) => String(n).padStart(2, '0');
export function moneyText(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Returns [start, end] of the best occurrence of the value in the page text, or null. */
export function locate(ev: EV, text: string): [number, number] | null {
  const cands = new Set<string>();
  if (ev.text_as_read) cands.add(ev.text_as_read);
  if (typeof ev.value === 'number') {
    cands.add(moneyText(ev.value));
    cands.add(ev.value.toLocaleString('en-US'));
    cands.add(String(ev.value));
  }
  if (typeof ev.value === 'string') cands.add(ev.value);
  const md = ev.text_as_read?.match(/^(\d\d)\/(\d\d)\/(\d{4})$/);
  if (md) cands.add(`${md[3]}-${md[1]}-${md[2]}`);
  // anchor tokens from the field name, e.g. "N2_basis" -> "N2", "basis"; "box12_W" -> "Box 12", "W"
  const tokens = ev.field
    .replace(/^box(\d+[a-z]?)/i, 'Box $1')
    .split(/[_\s]+/)
    .filter((t) => t.length > 1 || /[A-Z]/.test(t));
  let from = 0;
  for (const t of tokens) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const m = re.exec(text.slice(from));
    if (m) from += m.index;
  }
  let best: [number, number] | null = null;
  for (const c of cands) {
    if (!c) continue;
    let i = text.indexOf(c, from);
    if (i < 0) i = text.indexOf(c);
    if (i >= 0 && (!best || Math.abs(i - from) < Math.abs(best[0] - from))) best = [i, i + c.length];
  }
  return best;
}
export const isoDate = (d: string) => `${d.slice(0, 10)}`;
/** SSN/ITIN pattern; masked to the last four, same length so text offsets (highlights) stay valid. */
export const maskIds = (s: string) => s.replace(/\b\d{3}-\d{2}-(\d{4})\b/g, '•••-••-$1');
export const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${x.getUTCDate()}, ${x.getUTCFullYear()}`;
};
export const fmtDateTime = (d: string) => {
  const x = new Date(d);
  return `${fmtDate(d)} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};
