import type { Model } from '../data/model';
import type { Version } from '../data/types';
import type { WP } from '../ledger/fold';

/**
 * Everything related to one item, across the return, across years and across related returns.
 * Derived from the packet's own cross-references plus links people recorded in the ledger.
 */
export interface RelItem { ref?: string; label?: string; note?: string }
export interface RelGroup { title: string; items: RelItem[] }

// line-key patterns → prior-year records that carry the same item between years
const PRIOR: [RegExp, string, string][] = [
  [/^(SchD|F1040\.7|F8949)/, 'py:/carryovers_into_2025/capital_loss_short', 'Capital loss carryover in (short-term)'],
  [/^(SchD|F1040\.7|F8949)/, 'py:/carryovers_into_2025/capital_loss_long', 'Capital loss carryover in (long-term)'],
  [/^(F8582|SchE\.([3-9]|1\d|2[0-2])A)/, 'py:/carryovers_into_2025/passive_1450_fremont', 'Suspended passive loss in — 1450 Fremont'],
  [/^(F8582|SchE\.([3-9]|1\d|2[0-2])B|F4797)/, 'py:/carryovers_into_2025/passive_1200_barton_hills', 'Suspended passive loss in — 1200 Barton Hills'],
  [/^(SchE\.28A|F7203)/, 'py:/basis_records/scorp_lindqvist_family_woodworks', 'Woodworks stock basis by year'],
  [/^(SchE\.28B)/, 'py:/basis_records/partnership_ridgeline', 'Ridgeline capital account by year'],
  [/^(F8606|F1040\.4)/, 'py:/basis_records/ira_nondeductible_basis_ngozi', 'IRA nondeductible basis by year'],
  [/^(SchA\.(5|8)|F1040\.12)/, 'py:/basis_records/home_7709_barton_ridge', 'Home basis record'],
];
// carryovers out to 2026 (engine) by the same patterns
const NEXT: [RegExp, string][] = [
  [/^(F6251|F8801|F1040\.17)/, 'minimum_tax_credit_from_2025_amt'],
  [/^(SchE\.28B)/, 'ridgeline_capital_account_end'],
  [/^(Sch1\.16)/, 'sep_contribution_not_deductible_for_2025'],
  [/^(SchE\.28A|F7203)/, 'scorp_stock_basis_end'],
];
// related returns (household.related_returns) by line pattern or document
const RETURNS: [RegExp, RegExp, string[]][] = [
  [/Woodworks/, /^(SchE\.28A|F7203|F8995)/, ['D39', 'D40']],
  [/Ridgeline/, /^(SchE\.28B|F8995)/, ['D37', 'D38']],
  [/^Ada/, /^(F8812|F8863|F8867|F1040\.19|F2441)/, ['D59', 'D60']],
];

export function related(m: Model, v: Version, wp: WP, key: string): RelGroup[] {
  const groups: RelGroup[] = [];
  const line = m.line(v.version, key);
  const docOf = (r: string) => (/^D\d+$/.test(r) ? r : m.evs.get(r)?.document_id);

  // across the return: other lines built from the same extracted values
  if (line) {
    const same = new Map<string, string>();
    for (const s of line.sources) for (const c of m.citedBy.get(s) ?? []) if (c.v === v.version && c.key !== key && !same.has(c.key)) same.set(c.key, s);
    if (same.size) groups.push({ title: 'Same source on this return', items: [...same].slice(0, 12).map(([k, s]) => ({ ref: k, note: `shares ${s}` })) });
  }

  // across years
  const years: RelItem[] = [];
  const py = m.priorLine(key);
  if (py !== undefined) years.push({ ref: `py:/return_2024/lines/${key.replace(/\//g, '~1')}`, label: `2024 return: ${typeof py === 'number' ? py.toLocaleString('en-US') : py}` });
  const pyNote = (m.p.prior_years.return_2024 as any).notes?.[key];
  if (pyNote) years.push({ ref: `py:/return_2024/notes/${key}`, label: '2024 preparer’s note', note: pyNote });
  for (const [re, ref, label] of PRIOR) if (re.test(key)) years.push({ ref, label });
  for (const [re, k] of NEXT) if (re.test(key) && v.carryovers_out?.federal?.[k] !== undefined) years.push({ label: `Out to 2026: ${k.replace(/_/g, ' ')} ${Number(v.carryovers_out.federal[k]).toLocaleString('en-US')}`, note: 'carried in the roll-forward package' });
  if (years.length) groups.push({ title: 'Across years', items: years });

  // related returns
  const doc = docOf(key);
  const rets = m.p.household.related_returns.filter((r: any) => RETURNS.some(([who, lineRe, docs]) => who.test(r.who) && (lineRe.test(key) || (doc && docs.includes(doc)))));
  if (rets.length) groups.push({ title: 'Related returns', items: rets.map((r: any) => ({ label: r.who, note: `${r.return} · prepared by ${r.prepared_by} · in this packet: ${r.in_this_packet === false ? 'no' : r.in_this_packet}` })) });

  // recorded by people
  const links = wp.links.filter((x) => x.a === key || x.b === key);
  if (links.length) groups.push({ title: 'Linked by the team', items: links.map((x) => ({ ref: x.a === key ? x.b : x.a, note: `${x.note}${x.note ? ' · ' : ''}${m.staffName(x.by)}` })) });
  return groups;
}
