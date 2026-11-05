import type { Model } from '../data/model';
import type { Version } from '../data/types';
import { actionable, type WP } from '../ledger/fold';
import { outsideFilings, sepExcess } from './checks';
import { liveAdjustments } from './rules';

/**
 * What 2026 inherits beyond the engine's carryovers: basis and credits from the documents and engine, items the
 * workpaper added (adjustments), and open matters (outside filings, notes). Every row points at its evidence.
 */
export interface CarryItem { item: string; detail: string; refs: string[] }

const money = (n: number) => Math.round(n).toLocaleString('en-US');

export function carriedItems(m: Model, v: Version, wp: WP): CarryItem[] {
  const out: CarryItem[] = [];
  const fed = v.carryovers_out?.federal ?? {};
  const live = liveAdjustments(wp);

  // ISO shares still held: regular basis = exercise price, AMT basis = value at exercise (Form 3921)
  const f3921 = Object.fromEntries((m.evsByDoc.get('D12') ?? []).map((e) => [e.field, e]));
  if (f3921.box3 && f3921.box4 && f3921.box5) {
    const sh = Number(f3921.box5.value), price = Number(f3921.box3.value), fmv = Number(f3921.box4.value);
    out.push({ item: 'ISO AMT basis', detail: `${money(sh)} shares exercised ${f3921.box2?.value ?? ''}: regular ${money(sh * price)}, AMT ${money(sh * fmv)} (a sale creates a negative AMT adjustment)`, refs: ['D12'] });
  }
  if (fed.minimum_tax_credit_from_2025_amt) out.push({ item: 'Minimum tax credit', detail: `${money(fed.minimum_tax_credit_from_2025_amt)} (Form 8801)`, refs: [] });
  if (fed.ridgeline_capital_account_end != null) out.push({ item: 'Ridgeline capital account', detail: `${money(fed.ridgeline_capital_account_end)}; outside basis still to compute (share of liabilities)`, refs: ['D37'] });
  if (fed.scorp_stock_basis_end != null) out.push({ item: 'Woodworks stock basis', detail: `${money(fed.scorp_stock_basis_end)} at end of 2025${fed.scorp_stock_basis_end === 0 ? ': further distributions are gain' : ''}`, refs: ['D39', 'D40'] });

  // added by the workpaper
  for (const a of live.filter((x) => x.findingId === 'hvac'))
    out.push({ item: 'Asset added: HVAC improvement', detail: `Cost ${money(Number(a.from) - Number(a.to))} capitalized, 27.5-year residential rental property (${a.status})`, refs: [a.target, 'D47'] });
  const excess = sepExcess(v, wp);
  if (excess > 0) out.push({ item: 'SEP excess contribution', detail: `${money(excess)} to withdraw with earnings, or Form 5330 excise`, refs: ['Sch1.16', 'D26'] });
  for (const a of live.filter((x) => x.findingId === 'est-ca'))
    out.push({ item: 'FTB credit held for 2024', detail: `${money(Number(a.from) - Number(a.to))} applied to 2024; follow up on the refund`, refs: [a.target, 'agency:/ftb_account'] });

  // open matters
  for (const f of outsideFilings(m, v, wp).filter((x) => x.decision && x.client))
    out.push({ item: `Outside filing: ${f.filing}`, detail: f.decision!.decision, refs: [] });
  out.push({ item: 'Open review items', detail: String(wp.notes.filter(actionable).filter((n) => n.status === 'open').length), refs: [] });
  out.push({ item: 'Judgments and elections', detail: String(wp.judgments.length), refs: [] });
  out.push({ item: 'Adjustments', detail: `${wp.adjustments.length}, each with from → to, why, who and status`, refs: [] });
  out.push({ item: 'Ledger history', detail: `${wp.visible.length} events, exported in full (every change, who, when, why)`, refs: [] });
  return out;
}

/** The client's to-do list on their copy: decided outside filings that ask something of them, plus FTB and records. */
export function clientTodos(m: Model, v: Version, wp: WP): string[] {
  const todos = outsideFilings(m, v, wp).filter((f) => f.decision && f.client).map((f) => f.client!);
  for (const a of liveAdjustments(wp).filter((x) => x.findingId === 'est-ca'))
    todos.push(`FTB applied ${money(Number(a.from) - Number(a.to))} of your 2025 estimated payments to 2024, so it is not on this return; it is not lost, and we will help you get it refunded.`);
  const years = (wp.standards.rules as string[] | undefined)?.map((r) => r.match(/retained (\d+) years/i)?.[1]).find(Boolean);
  if (years) todos.push(`Keep these records for at least ${years} years.`);
  return todos;
}
