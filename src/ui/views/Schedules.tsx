import type { ReactNode } from 'react';
import { useApp } from '../ctx';
import { AREAS, lineArea } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjustedValue, signoffStates } from '../../logic/rules';
import { Badge, Delta, Money, Ref, Section, SimpleTable, fmt } from '../components/bits';
import { TaxFlow } from './Overview';
import { carriedItems, type CarryItem } from '../../logic/carry';
import { outsideFilings } from '../../logic/checks';
import type { Model } from '../../data/model';

const LIST: [string, string][] = [
  ['summary', 'Return summary vs last year'], ['taxcomp', 'Tax computation'], ['areas', 'Area summaries'], ['depreciation', 'Depreciation by asset'],
  ['bookstotax', 'Books to tax (Schedule C)'], ['rentals', 'Rentals & passive losses'], ['k1', 'K-1 lines'], ['retirement', 'Retirement & foreign'],
  ['deductions', 'Deductions & credits with limits'], ['payments', 'Payments'], ['statesplit', 'State split (CA part-year)'], ['carryovers', 'Carryovers'],
  ['basis', 'Basis by year'], ['priorprep', 'Prior preparer vs us'],
];

export function Schedules({ id }: { id: string }) {
  const body: Record<string, ReactNode> = {
    summary: <Summary />, taxcomp: <TaxComp />, areas: <AreaSummaries />, depreciation: <Depreciation />, bookstotax: <BooksToTax />, rentals: <Rentals />, k1: <K1 />,
    retirement: <Retirement />, deductions: <Deductions />, payments: <Payments />, statesplit: <StateSplit />, carryovers: <Carryovers />, basis: <Basis />, priorprep: <PriorPrep />,
  };
  return (
    <div className="page sched">
      <div className="sched-nav">
        {LIST.map(([k, l]) => <a key={k} href={`#/schedules/${k}`} className={'nav-i' + (k === id ? ' on' : '')}>{l}</a>)}
        <a href="#/documents" className="nav-i">Document index →</a>
        <a href="#/sales" className="nav-i">Sales detail →</a>
      </div>
      <div className="sched-body">
        <h1>{LIST.find((x) => x[0] === id)?.[1]}</h1>
        {body[id] ?? <div>Unknown schedule</div>}
      </div>
    </div>
  );
}

/** One row per line key: engine, workpaper, prior year; every number opens its trace. */
function LineRows({ keys, py = true }: { keys: string[]; py?: boolean }) {
  const { m, v, wp, setFocus } = useApp();
  return (
    <div className="tbl-wrap">
      <table className="tbl click">
        <thead><tr><th>Line</th><th>Label</th><th className="r">Engine {v.version}</th><th className="r">Workpaper</th>{py && <th className="r">2024</th>}<th>✓</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const l = m.line(v.version, k);
            if (!l) return null;
            const adj = adjustedValue(wp, k, l.value);
            return (
              <tr key={k} onClick={() => setFocus(k)}>
                <td className="mono">{k}</td><td>{l.label}</td><td className="r"><Money v={l.value} /></td>
                <td className="r">{adj !== l.value ? <b><Money v={adj} /></b> : ''}</td>
                {py && <td className="r"><Money v={m.priorLine(k)} muted /></td>}
                <td>{wp.verifications.has(k) ? <span className="ok">✓</span> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const DEBT_LIMIT = 750000; // §163(h)(3)(F) acquisition debt limit (MFJ)
const docText = (m: Model, id: string) => m.docs.get(id)?.pages.map((p) => p.printed_content).join(' ') ?? '';
const keysOf = (v: any, re: RegExp) => v.lines.filter((l: any) => re.test(l.key)).map((l: any) => l.key);

function Summary() {
  const { m, v, wp, setFocus } = useApp();
  const py = m.p.prior_years.return_2024;
  const std = wp.standards.variance_review;
  const rows = Object.entries(py.lines as Record<string, any>).filter(([, x]) => typeof x === 'number');
  return (
    <>
      <p className="lead">Every 2024 line next to its 2025 value. Swings over {std.flag_if_change_over_percent}% and {fmt(std.and_over_amount)} are flagged and must carry an explanation (note, judgment or adjustment).</p>
      <div className="tbl-wrap">
        <table className="tbl click">
          <thead><tr><th>Line</th><th>2024 label</th><th className="r">2024</th><th className="r">2025</th><th className="r">Change</th><th>Explained</th></tr></thead>
          <tbody>
            {rows.map(([k, pv]) => {
              const l = m.line(v.version, k);
              const cur = l ? adjustedValue(wp, k, l.value) : undefined;
              const d = typeof cur === 'number' ? cur - (pv as number) : undefined;
              const flag = d !== undefined && Math.abs(d) > std.and_over_amount && (pv === 0 || Math.abs(d / (pv as number)) * 100 > std.flag_if_change_over_percent);
              const why = wp.notes.find((n) => n.target.includes(k)) ?? wp.judgments.find((j) => j.target.includes(k)) ?? wp.adjustments.find((a) => a.target === k);
              return (
                <tr key={k} onClick={() => l && setFocus(k)} className={flag && !why ? 'flag' : ''}>
                  <td className="mono">{k}</td><td>{py.line_labels?.[k] ?? l?.label}</td><td className="r"><Money v={pv} /></td>
                  <td className="r">{cur === undefined ? <span className="muted tiny">not on 2025</span> : <Money v={cur} />}</td>
                  <td className="r">{d !== undefined ? <Delta v={d} /> : ''}</td>
                  <td>{flag ? (why ? <span className="ok" title={(why as any).text ?? (why as any).decision ?? (why as any).reason}>✓ explained</span> : <Badge tone="amber">explain</Badge>) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TaxComp() {
  const { v } = useApp();
  return (
    <div className="grid2">
      <div><TaxFlow /></div>
      <div>
        <h4 className="sub">Other taxes, AMT and credits</h4>
        <LineRows keys={['F6251.4', 'F6251.5', 'F6251.7', 'F6251.10', 'F6251.11', 'SchSE.12', 'F8959.18', 'F8960.12', 'F8960.17', 'Sch2.21', 'Sch3.1', 'F8812.8', 'F8812.11', 'F8812.12', 'F2210.8', 'F2210.19']} />
      </div>
    </div>
  );
}

function AreaSummaries() {
  const { m, v, wp, findings, clock, go } = useApp();
  return (
    <SimpleTable
      head={['Area', 'Lines', 'Verified', 'Adjustments', 'Open checks', 'Sign-offs', 'Hours / budget']}
      rows={AREAS.map((a) => {
        const lines = v.lines.filter((l) => lineArea(l) === a.id);
        const s = signoffStates(m, v, wp, a.id, findings, clock);
        const h = wp.time.filter((t) => t.area === a.id).reduce((x, t) => x + t.hours, 0);
        return [
          <a key={a.id} href={`#/area/${a.id}`} className="link">{a.name}</a>, lines.length, lines.filter((l) => wp.verifications.has(l.key)).length,
          wp.adjustments.filter((x) => x.area === a.id && x.status !== 'rejected').length,
          findings.filter((f) => f.area === a.id && findingStatus(f, wp) === 'open' && f.severity !== 'info').length,
          s.map((x) => (x.current ? '✓' : x.reopened ? '↺' : '·')).join(' '), `${h.toFixed(1)} / ${m.p.firm.budget_hours[a.budget]}`,
        ];
      })}
      num={[1, 2, 3, 4]}
    />
  );
}

function Depreciation() {
  const { m, v, wp, setFocus } = useApp();
  const hvac = wp.adjustments.find((a) => a.findingId === 'hvac' && a.status !== 'rejected');
  const s179 = wp.adjustments.find((a) => a.whatIf === 'equipment_section179' && a.status !== 'rejected');
  const line = (k: string) => (m.line(v.version, k)?.value as number) ?? 0;
  // bonus / §179 is stated in the engine's method text; the workpaper's §179 election overrides the studio equipment
  const bonus = (a: any) => (a.asset_id.startsWith('STU') && s179 ? '§179 (elected)' : /section 179/i.test(a.method) ? '§179' : /100% (bonus|special)/i.test(a.method) ? `100%${/in (\d{4})/.exec(a.method) ? ` (${/in (\d{4})/.exec(a.method)![1]})` : ''}` : '—');
  const disposed = v.assets.filter((a: any) => a.disposition);
  const unrecap = disposed.reduce((x: number, a: any) => x + (a.disposition.unrecaptured_1250_depreciation ?? 0), 0);
  const bonusAssets = v.assets.filter((a: any) => /100% (bonus|special)/i.test(a.method) && (a.federal?.depreciation_2025 ?? 0) > (a.california?.depreciation_2025 ?? 0));
  const caSub = v.assets.filter((a: any) => (a.california?.depreciation_2025 ?? 0) > (a.federal?.depreciation_2025 ?? 0));
  const s179Alt = m.p.what_if.alternatives.find((w: any) => w.id === 'equipment_section179')?.changed_lines.find((c: any) => c.key === 'SchCA540NR.12.C');
  // workpaper asset from the capitalized HVAC: cost and date from the invoice (D47), SL mid-month 27.5 years
  const inv = Object.fromEntries((m.evsByDoc.get('D47') ?? []).map((e) => [e.field, e.value]));
  const hvacCost = hvac ? Number(hvac.from) - Number(hvac.to) : 0;
  const hvacDate = String(inv.date ?? '');
  const hvacDep = hvacDate ? Math.round((hvacCost / 27.5) * ((12 - Number(hvacDate.slice(5, 7)) + 0.5) / 12) * 100) / 100 : 0;
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl click">
          <thead>
            <tr><th>Asset</th><th>Activity</th><th>In service</th><th className="r">Cost</th><th>Method / life</th><th>Bonus / §179</th><th className="r">Fed prior</th><th className="r">Fed 2025</th><th className="r">Fed end</th><th className="r">CA 2025</th><th className="r">CA end</th><th className="r">AMT 2025</th><th className="r">AMT diff</th><th>Disposal and recapture</th></tr>
          </thead>
          <tbody>
            {v.assets.map((a: any) => (
              <tr key={a.asset_id} onClick={() => setFocus(`asset:${a.asset_id}`)}>
                <td><b className="mono">{a.asset_id}</b> {a.description}</td><td className="tiny">{a.activity}</td><td className="tiny">{a.placed_in_service}</td>
                <td className="r"><Money v={a.cost} /></td><td className="tiny">{a.method}{a.life_years ? ` · ${a.life_years} yr` : ''}</td><td className="tiny">{bonus(a)}</td>
                <td className="r"><Money v={a.federal?.prior_accumulated} cents /></td><td className="r"><Money v={a.federal?.depreciation_2025} cents /></td><td className="r"><Money v={a.federal?.accumulated_end} cents /></td>
                <td className="r"><Money v={a.california?.depreciation_2025} cents /></td><td className="r"><Money v={a.california?.accumulated_end} cents /></td>
                <td className="r"><Money v={a.amt?.depreciation_2025} cents /></td><td className="r"><Money v={a.amt?.difference_from_regular} cents /></td>
                <td className="tiny">{a.disposition ? `Sold ${a.disposition.date}; unrecaptured §1250 ${fmt(a.disposition.unrecaptured_1250_depreciation)}, §1250 ordinary ${fmt(a.disposition.section_1250_ordinary_recapture)}` : a.disposed ? `Disposed ${a.disposed}` : ''}</td>
              </tr>
            ))}
            {hvac && (
              <tr className="added" onClick={() => setFocus(hvac.target)}>
                <td><b className="mono">SAC-HVAC</b> HVAC replacement, 1450 Fremont Way (workpaper, {hvac.status})</td><td className="tiny">Rental: 1450 Fremont Way</td><td className="tiny">{hvacDate}</td><td className="r"><Money v={hvacCost} /></td>
                <td className="tiny">SL / mid-month · 27.5 yr</td><td className="tiny">—</td><td className="r">0</td><td className="r"><Money v={hvacDep} cents /></td><td className="r"><Money v={hvacDep} cents /></td><td className="r"><Money v={hvacDep} cents /></td><td className="r"><Money v={hvacDep} cents /></td><td className="r"><Money v={hvacDep} cents /></td><td className="r">0</td><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Section title={`Disposal and recapture${disposed.length ? ` — ${disposed.map((a: any) => a.asset_id).join(', ')}` : ''}`}>
        <LineRows keys={['F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', 'F4797.25', 'F4797.26g', 'SchD.19']} py={false} />
        <p className="tiny">Residential rental placed in service after 1986 is straight-line, so §1250 ordinary recapture is {fmt(line('F4797.26g'))}; the {fmt(unrecap)} of depreciation on the assets sold ({disposed.map((a: any) => `${a.asset_id} ${fmt(a.disposition.unrecaptured_1250_depreciation)}`).join(', ')}) is unrecaptured §1250 gain taxed at up to 25% (Schedule D line 19: {fmt(line('SchD.19'))}).</p>
      </Section>
      <Section title="Federal vs California">
        <p className="tiny">
          California does not allow federal bonus depreciation: {bonusAssets.map((a: any) => a.asset_id).join(', ')} {bonusAssets.length === 1 ? 'is' : 'are'} depreciated over {bonusAssets[0]?.life_years ?? 5} years for California, a {fmt(bonusAssets.reduce((x: number, a: any) => x + a.federal.depreciation_2025 - a.california.depreciation_2025, 0))} difference (Schedule CA addition SchCA540NR.12.C: {fmt(line('SchCA540NR.12.C'))}).
          {caSub.length > 0 && ` Earlier bonus assets still have California basis: ${caSub.map((a: any) => `${a.asset_id} ${fmt(a.california.depreciation_2025)}`).join(', ')} California-only depreciation in 2025.`}
          {s179Alt && ` Electing §179 (engine what-if) cuts the California addition from ${fmt(s179Alt.old)} to ${fmt(s179Alt.new)}${s179 ? ' — adopted' : ''}.`}
        </p>
      </Section>
    </>
  );
}

function BooksToTax() {
  const { m, v, wp, setFocus } = useApp();
  const ev = (id: string) => m.evs.get(id)!.value as number;
  const line = (k: string) => (m.line(v.version, k)?.value as number) ?? 0;
  const books = ev('ev-0105');
  const rows: [string, number, string[]][] = [
    ['Net income per books (QuickBooks, cash basis)', books, ['ev-0105']],
    ['+ 1099-K amounts the engine could not match to a deposit', ev('ev-0127'), ['ev-0127']],
    [`− Tax depreciation over book (100% bonus ${fmt(line('F4562-C.14'))} vs book SL ${fmt(ev('ev-0092'))})`, -(line('F4562-C.14') - ev('ev-0092')), ['ev-0092', 'F4562-C.14']],
    [`− Standard mileage replaces book fuel (${fmt(line('SchC.9'))} − ${fmt(ev('ev-0090'))})`, -(line('SchC.9') - ev('ev-0090')), ['SchC.9', 'ev-0090']],
    ['+ Erik’s health insurance moved off Schedule C (to Schedule 1 line 17)', ev('ev-0094'), ['ev-0094', 'Sch1.17']],
    ['+ 50% of meals not deductible', ev('ev-0097') / 2, ['ev-0097']],
    ['− Home office (simplified method, not in books)', -m.line(v.version, 'SchC.30')!.value, ['SchC.30']],
  ];
  const engineProfit = rows.reduce((s, r) => s + r[1], 0);
  const adjs = wp.adjustments.filter((a) => a.status !== 'rejected' && a.area === 'business' && a.category === 'schc_profit');
  const corrected = m.line(v.version, 'SchC.31')!.value + adjs.reduce((s, a) => s + a.amount, 0);
  return (
    <>
      <p className="lead">From the client’s books to Schedule C line 31, every reconciling item sourced. Then the workpaper’s corrections.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <tbody>
            {rows.map(([l, a, refs]) => (
              <tr key={l}><td>{l}</td><td className="r"><Money v={a} /></td><td>{refs.map((r) => <Ref key={r} r={r} compact />)}</td></tr>
            ))}
            <tr className="strong" onClick={() => setFocus('SchC.31')}><td>= Schedule C net profit (engine {v.version})</td><td className="r"><Money v={engineProfit} /></td><td>{Math.abs(engineProfit - m.line(v.version, 'SchC.31')!.value) < 1 ? <span className="ok">✓ agrees to SchC.31</span> : <Badge tone="red">differs from SchC.31 {fmt(m.line(v.version, 'SchC.31')!.value)}</Badge>}</td></tr>
            {adjs.map((a) => <tr key={a.id}><td>{a.amount > 0 ? '+' : '−'} {a.title}</td><td className="r"><Money v={a.amount} /></td><td><Badge tone={a.status === 'approved' ? 'green' : 'amber'}>{a.status}</Badge></td></tr>)}
            <tr className="strong"><td>= Schedule C net profit (workpaper)</td><td className="r"><Money v={corrected} /></td><td /></tr>
          </tbody>
        </table>
      </div>
      <Section title="Schedule C lines">
        <LineRows keys={keysOf(v, /^SchC\./)} />
      </Section>
    </>
  );
}

function Rentals() {
  const { m, v } = useApp();
  const cin = m.p.prior_years.carryovers_into_2025 as Record<string, any>;
  const out = v.carryovers_out.federal as Record<string, any>;
  const line = (k: string) => (m.line(v.version, k)?.value as number) ?? 0;
  const left = [['Fremont', out.passive_1450_fremont], ['Barton Hills', out.passive_1200_barton_hills]].filter(([, x]) => x);
  return (
    <>
      <div className="grid2">
        <Section title="A · 1450 Fremont Way, Sacramento (all year, CA-source)"><LineRows keys={keysOf(v, /^SchE\.\d+A$/)} /></Section>
        <Section title="B · 1200 Barton Hills Dr 4C, Austin (rented to 9/30, sold 10/15)"><LineRows keys={keysOf(v, /^SchE\.\d+B$/)} /></Section>
      </div>
      <Section title="Passive activity loss (Form 8582)">
        <LineRows keys={keysOf(v, /^F8582\./)} py={false} />
        <p className="tiny">
          Suspended from 2024: Fremont {fmt(cin.passive_1450_fremont)}; Barton Hills {fmt(cin.passive_1200_barton_hills)} ({cin.sources}). The condo’s sale is a full taxable disposition, freeing its suspended loss; with the {fmt(line('F4797.25'))} §1231 gain and K-1 passive income, net passive income (F8582.4) is {fmt(line('F8582.4'))}
          {line('F8582.4') >= 0 ? ', so all current and prior losses are allowed.' : '.'} {left.length ? `Carried to 2026: ${left.map(([n, x]) => `${n} ${fmt(x as number)}`).join(', ')}.` : 'Nothing carries to 2026.'}
        </p>
      </Section>
    </>
  );
}

function K1() {
  const { m, v } = useApp();
  const rows = (doc: string) => (m.evsByDoc.get(doc) ?? []).map((e) => [e.field, <Money key={e.id} v={e.value} />, <span key="l" className="chips">{(m.citedBy.get(e.id) ?? []).filter((c) => c.v === v.version).map((c) => <Ref key={c.key} r={c.key} compact />)}</span>, `${Math.round(e.confidence * 100)}%`]);
  return (
    <>
      <Section title="Lindqvist Family Woodworks, Inc. — 2025 K-1 (1120-S), 20%"><SimpleTable head={['Box', 'Amount', 'Landed in', 'Conf']} rows={rows('D39')} /></Section>
      <Section title="Woodworks — 2023 K-1 (received 06/05/2026, closes the basis gap)"><SimpleTable head={['Box', 'Amount', 'Landed in', 'Conf']} rows={rows('D40')} /></Section>
      <Section title="Ridgeline Real Estate Fund III LP — 2025 K-1 (1065), limited partner"><SimpleTable head={['Box', 'Amount', 'Landed in', 'Conf']} rows={[...rows('D37'), ...rows('D38')]} /></Section>
      <Section title="2024 K-1s as reported">
        <SimpleTable
          head={['Entity', 'Item', 'Amount']}
          rows={([['Woodworks (1120-S)', m.p.prior_years.return_2024.K1_1120S], [m.p.prior_years.return_2024.K1_1065?.partnership ?? 'Ridgeline (1065)', m.p.prior_years.return_2024.K1_1065]] as [string, Record<string, any>][])
            .flatMap(([who, k1]) => Object.entries(k1 ?? {}).filter(([k]) => k !== 'partnership').map(([k, x]) => [who, k.replace(/^box/, 'Box ').replace(/_/g, ' '), <Money key={who + k} v={x} />]))}
          num={[2]}
        />
      </Section>
    </>
  );
}

function Retirement() {
  const { m, v, wp } = useApp();
  const line = (k: string) => (m.line(v.version, k)?.value as number) ?? 0;
  const f = (doc: string, field: string) => m.evsByDoc.get(doc)?.find((e) => e.field === field)?.value;
  const qa31 = m.p.client.questionnaire.find((q) => q.id === 'qa-31');
  const decided = (re: RegExp) => outsideFilings(m, v, wp).find((x) => re.test(x.filing))?.decision;
  const fbar = decided(/FBAR/), f3520 = decided(/3520/);
  return (
    <>
      <Section title="Backdoor Roth (Form 8606) — Ngozi">
        <LineRows keys={keysOf(v, /^F8606\.|^F1040\.4/)} />
        <p className="tiny">
          Nondeductible contributions: {fmt(f('D42', 'box1'))} made {f('D42', 'contrib_date')} for 2024 (D42) and {fmt(f('D43', 'box1'))} for 2025 (D43), both converted. Basis {fmt(line('F8606.3'))} against {fmt(line('F8606.16'))} converted: {fmt(line('F8606.18'))} taxable.
          {qa31 && ` The client said “${qa31.answer}” (qa-31); the 5498s govern.`}
        </p>
      </Section>
      <Section title="HSA (Form 8889) and SEP"><LineRows keys={[...keysOf(v, /^F8889\./), 'Sch1.16', 'Sch1.17']} /></Section>
      <Section title="Foreign: Sparbanken Norrland (Sweden)">
        <LineRows keys={['SchB.1.6', 'SchB.7a', 'SchB.7b', 'F8938.1.max', 'F8938.1.ye', 'F8938.req']} />
        <p className="tiny">
          Outside this engagement: FBAR (FinCEN 114) — {fbar ? `decided by ${m.staffName(fbar.by)} ${fbar.simAt.slice(0, 10)}` : 'no decision recorded yet'}; Form 3520 for the 2023 inheritance (left open by the prior preparer) — {f3520 ? `decided by ${m.staffName(f3520.by)} ${f3520.simAt.slice(0, 10)}` : 'no decision recorded yet'}. See outside filings.
        </p>
      </Section>
    </>
  );
}

function Deductions() {
  const { m, v, wp } = useApp();
  const L = (k: string) => adjustedValue(wp, k, m.line(v.version, k)?.value);
  const agi = v.summary.federal.agi;
  const acq = Number(m.evsByDoc.get('D55')?.find((e) => e.field === 'box2')?.value ?? 0);
  const refi = Number((docText(m, 'D57').match(/Box 2 outstanding principal ([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
  const rows = [
    ['SALT cap', `${fmt(L('SchA.5d'))} paid`, `cap ${fmt(m.p.engine_reference.parameters.salt_cap)} (phase-down starts at ${fmt(m.p.engine_reference.parameters.salt_cap_phase_start)} MAGI)`, fmt(L('SchA.5e'))],
    ['Home mortgage interest', `${fmt(L('SchA.8e'))}`, `Acquisition debt ${fmt(acq)} (D55) / refinance ${fmt(refi)} (D57) vs ${fmt(DEBT_LIMIT)} limit`, Math.max(acq, refi) <= DEBT_LIMIT ? 'Fully deductible' : 'Limited'],
    ['Cash gifts (60% AGI)', fmt(L('SchA.11')), `limit ${fmt(agi * 0.6)}`, L('SchA.11') <= agi * 0.6 ? 'Within limit' : 'Over limit: carry forward'],
    ['Stock to donor-advised fund (30% AGI, LTCG property)', fmt(L('F8283.A1.stock')), `limit ${fmt(agi * 0.3)}; ${m.line(v.version, 'F8283.A1.stock')?.label ?? ''}; publicly traded — no appraisal`, L('F8283.A1.stock') <= agi * 0.3 ? 'Within limit' : 'Over limit: carry forward'],
    ['Vehicle (1098-C)', fmt(L('F8283.A1.vehicle')), 'Limited to gross proceeds when the charity sells (D66 box 4c)', fmt(L('F8283.A1.vehicle'))],
    ['Child tax credit / ODC', fmt(L('F8812.8')), `phase-out from ${fmt(m.p.engine_reference.parameters.ctc_phaseout_start)}: −${fmt(L('F8812.11'))}`, fmt(L('F8812.12'))],
    ['American opportunity credit', fmt(L('F8863.30')), `phase-out ${m.p.engine_reference.parameters.aotc_phaseout.map((x: number) => fmt(x)).join('–')} MAGI`, fmt(L('F8863.7'))],
    ['Dependent care', fmt(L('F2441.2')), `Limit ${fmt(m.p.engine_reference.parameters.dep_care_limit_one)} (one child) less ${fmt(L('F2441.12'))} excluded benefits (W-2 box 10)`, `${fmt(L('F2441.31'))} credit; ${fmt(L('F2441.12'))} excluded`],
    ['Foreign tax credit', fmt(L('Sch3.1')), 'De minimis 600 MFJ, all passive, no Form 1116', fmt(L('Sch3.1'))],
    ['QBI deduction', fmt(L('F8995.27')), `income limit ${fmt(L('F8995.36'))}; phase-in over ${fmt(m.p.engine_reference.parameters.qbi_threshold)}`, fmt(L('F8995.39'))],
  ];
  return (
    <>
      <SimpleTable head={['Item', 'Amount', 'Limit', 'Allowed']} rows={rows} />
      <Section title="Schedule A lines"><LineRows keys={[...keysOf(v, /^SchA\./), ...keysOf(v, /^F8283\./)]} /></Section>
      <Section title="Credits"><LineRows keys={[...keysOf(v, /^F8812\./), ...keysOf(v, /^F8863\./), ...keysOf(v, /^F2441\./)]} /></Section>
    </>
  );
}

function Payments() {
  const { m, v, wp, clock } = useApp();
  const tr = m.p.tax_agency_records.irs_account_transcript_2025.filter((s: any) => s.as_of <= clock.slice(0, 10)).at(-1);
  const ftb = m.p.tax_agency_records.ftb_account;
  const rates = m.p.post_filing_rates;
  const bal = v.summary.federal.balance_due;
  const f = (doc: string, field: string) => m.evsByDoc.get(doc)?.find((e) => e.field === field)?.value;
  const onTranscript = (date: string) => tr?.transactions.filter((t: any) => t.code === '670' && t.date === date).reduce((x: number, t: any) => x + t.amount, 0);
  const trEst = tr?.transactions.filter((t: any) => t.code === '670' && /Estimated/.test(t.description)) ?? [];
  // Q1–Q3 from the EFTPS confirmations; Q4 only from the client's answer (no confirmation in the file)
  const eftps = [1, 2, 3].map((i) => ({ q: i, date: String(f('D67', `q${i}_date`) ?? ''), amount: Number(f('D67', `q${i}_amount`) ?? 0) })).filter((x) => x.date);
  const qa41 = m.p.client.questionnaire.find((q) => q.id === 'qa-41');
  const q4Client = Number(qa41?.answer.match(/(\d{1,3}(?:,\d{3})+)/)?.[1].replace(/,/g, '') ?? 0);
  const q4Tr = trEst.find((t: any) => !eftps.some((x) => x.date === t.date));
  const ext = wp.filing.events.filter((e) => e.action === 'extension_filed').at(-1);
  const extTl = m.p.timeline.find((t) => /extension_filed/.test(t.event));
  const extAmt = ext?.payload.federal ?? m.p.what_if.extension.federal.paid_with_form_4868;
  const paid = wp.filing.events.find((e) => e.action === 'balance_paid' && e.payload.jurisdiction === 'federal');
  const paidAt = (paid?.simAt ?? m.p.timeline.find((t) => t.event === 'federal_balance_paid')?.at ?? '').slice(0, 10);
  const due = m.p.firm.deadlines.find((d) => /original due/i.test(d.what))?.date ?? '';
  const days = paidAt && due ? Math.round((Date.parse(paidAt) - Date.parse(due)) / 86400000) : 0;
  // California: every Web Pay confirmation (D68) with the year the client designated and where FTB applied it
  const webpay = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ date: String(f('D68', `pay${i}_date`) ?? ''), amount: Number(f('D68', `pay${i}_amount`) ?? 0), year: f('D68', `pay${i}_year`) })).filter((x) => x.date);
  const applied = (x: { date: string; amount: number; year: any }) => {
    const held = ftb.tax_year_2024_payments_after_filing.find((p: any) => p.date === x.date && p.amount === x.amount);
    if (held) return held.note;
    return ftb.tax_year_2025_payments.some((p: any) => p.date === x.date && p.amount === x.amount) ? '2025' : String(x.year);
  };
  return (
    <>
      <Section title="Federal">
        <SimpleTable
          head={['Date', 'What', 'Client / documents', 'IRS transcript', 'On return']}
          rows={[
            ...eftps.map((x) => [x.date, `Q${x.q} estimate`, `${fmt(x.amount)} (EFTPS D67)`, fmt(onTranscript(x.date)), '']),
            [q4Tr?.date ?? '', 'Q4 estimate', `${fmt(q4Client)} “${qa41?.answer ?? ''}” (qa-41, no confirmation)`, q4Tr ? `${fmt(q4Tr.amount)} (${q4Tr.date.slice(5)})` : '—', ''],
            ['', 'Total estimates', fmt(eftps.reduce((x, e) => x + e.amount, 0) + q4Client), tr ? fmt(trEst.reduce((s: number, t: any) => s + t.amount, 0)) : '—', fmt(adjustedValue(wp, 'F1040.26', m.line(v.version, 'F1040.26')?.value))],
            [(ext?.simAt ?? extTl?.at ?? '').slice(0, 10), 'Extension payment (4868)', ext ? 'filing record' : 'timeline', tr?.transactions.some((t: any) => t.amount === extAmt) ? fmt(extAmt) : 'not yet on transcript', fmt(m.line(v.version, 'Sch3.10')?.value)],
          ]}
        />
        <p className="tiny">
          Balance after {due} accrues interest ({+(rates.irs_underpayment_interest_rate_annual * 100).toFixed(2)}%/yr) and a failure-to-pay penalty ({+(rates.irs_failure_to_pay_penalty_per_month * 100).toFixed(2)}%/month or part):
          {days > 0 ? ` on the engine’s ${fmt(bal)} paid ${paidAt} (${days} days) ≈ ${fmt(bal * rates.irs_underpayment_interest_rate_annual * (days / 365))} interest + ${fmt(bal * rates.irs_failure_to_pay_penalty_per_month * Math.ceil(days / 30))} penalty.` : ' not yet paid.'}
          {' '}The engine does not compute these; the IRS will bill them (code 196/276).
        </p>
      </Section>
      <Section title="California">
        <SimpleTable head={['Date', 'Designated', 'Amount', 'FTB applied to']} rows={webpay.map((x) => [x.date, `tax year ${x.year} (D68)`, fmt(x.amount), applied(x)])} />
        <p className="tiny">All 2025-dated FTB payments are 2025 state taxes paid for federal Schedule A (cash basis), whichever year FTB applied them to.</p>
      </Section>
    </>
  );
}

function StateSplit() {
  const { m, v } = useApp();
  const days = m.p.engine_reference.parameters.ca_resident_days;
  return (
    <>
      <p className="lead">California resident 01/01–07/14/2025 ({days} of 365 days); Texas resident from 07/15. Column A federal, B subtractions, C additions, D California law, E California source. Resident period: all income; nonresident period: California-source only (the Sacramento rental, Ridgeline’s 22%).</p>
      <LineRows keys={keysOf(v, /^SchCA540NR\.|^F540NR\.|^ScheduleS|^FTB/)} py={false} />
    </>
  );
}

function Carryovers() {
  const { m, v, wp } = useApp();
  return (
    <>
      <CarryoverTable />
      <Section title="Carried with history (from the workpaper)"><CarriedList items={carriedItems(m, v, wp)} /></Section>
    </>
  );
}

const CARRY_LABEL: Record<string, string> = {
  capital_loss_short: 'Capital loss, short-term', capital_loss_long: 'Capital loss, long-term', capital_loss: 'Capital loss',
  passive_1450_fremont: 'Suspended passive loss: 1450 Fremont Way', passive_1200_barton_hills: 'Suspended passive loss: 1200 Barton Hills Dr 4C', passive: 'Suspended passive loss',
  section_1231_losses: '§1231 losses', charitable: 'Charitable contributions', amt_credit: 'Minimum tax credit', minimum_tax_credit_from_2025_amt: 'Minimum tax credit',
  nol: 'Net operating loss', foreign_tax_credit: 'Foreign tax credit', qbi_loss: 'QBI loss', section_179: '§179 carryover',
  ira_nondeductible_basis_ngozi: 'IRA nondeductible basis (Ngozi)', scorp_stock_basis_end: 'Woodworks stock basis', ridgeline_capital_account_end: 'Ridgeline capital account',
  sep_contribution_not_deductible_for_2025: 'SEP contribution not deductible for 2025',
};
const sameKey: Record<string, string> = { amt_credit: 'minimum_tax_credit_from_2025_amt' };

/** Carryovers into 2025 (prior year) beside the engine's carryovers out to 2026, federal and California. */
export function CarryoverTable() {
  const { m, v } = useApp();
  const cin = m.p.prior_years.carryovers_into_2025 as Record<string, any>;
  const out = v.carryovers_out as { federal: Record<string, any>; california: Record<string, any> };
  const num = (x: any) => (typeof x === 'number' ? x : undefined);
  const keys = [...new Set([...Object.keys(cin), ...Object.keys(out.federal), ...Object.keys(cin.california ?? {}), ...Object.keys(out.california)])]
    .filter((k) => !['california', 'sources', 'note', 'depreciation_basis_differences'].includes(k) && !(k in sameKey));
  const rows = keys.map((k) => {
    const alias = Object.keys(sameKey).find((a) => sameKey[a] === k);
    const fin = num(cin[k] ?? (alias ? cin[alias] : undefined)), fout = num(out.federal[k] ?? out.federal[sameKey[k]]), cain = num(cin.california?.[k]), caout = num(out.california[k]);
    return [CARRY_LABEL[k] ?? k.replace(/_/g, ' '), <Money key="a" v={fin} />, <Money key="b" v={fout} />, <Money key="c" v={cain} />, <Money key="d" v={caout} />];
  });
  const dep = out.california.depreciation_basis_differences as Record<string, number> | undefined;
  return (
    <>
      <Section title={`Into 2025 (2024 return) and out to 2026 (engine ${v.version})`}>
        <SimpleTable head={['Carryover', 'Federal in', 'Federal out', 'California in', 'California out']} rows={rows} num={[1, 2, 3, 4]} />
        <p className="tiny">Sources in: {cin.sources}. {cin.california?.note}</p>
      </Section>
      {dep && (
        <Section title="California depreciation basis differences out to 2026">
          <SimpleTable head={['Asset', 'California basis over federal']} rows={Object.entries(dep).map(([a, x]) => [<Ref key={a} r={`asset:${a}`} compact />, <Money key={a + 'v'} v={x} cents />])} num={[1]} />
        </Section>
      )}
    </>
  );
}

export function CarriedList({ items }: { items: CarryItem[] }) {
  return <SimpleTable head={['Item', 'Detail', 'Evidence']} rows={items.map((x) => [x.item, x.detail, <span key="r" className="chips">{x.refs.map((r) => <Ref key={r} r={r} compact />)}</span>])} />;
}

function Basis() {
  const { m, v } = useApp();
  const b = m.p.prior_years.basis_records;
  const line = (k: string) => (m.line(v.version, k)?.value as number) ?? 0;
  const f = (doc: string, field: string) => Number(m.evsByDoc.get(doc)?.find((e) => e.field === field)?.value ?? 0);
  // S corporation stock basis rolled forward: 2022 worksheet, 2023 K-1 (D40), 2024 K-1 (prior return), 2025 Form 7203
  const sc = b.scorp_lindqvist_family_woodworks as any[];
  const y22 = sc.find((x) => x.year === 2022), y24 = sc.find((x) => x.year === 2024);
  const end22 = y22?.ending_stock_basis ?? 0;
  const end23 = end22 + f('D40', 'box1') - f('D40', 'box16d');
  const end24 = end23 + (y24?.k1_income ?? 0) - (y24?.distributions ?? 0);
  const s = [
    ['2022', `ending (${y22?.source ?? ''})`, fmt(end22)],
    ['2023', `+ income ${fmt(f('D40', 'box1'))} − distributions ${fmt(f('D40', 'box16d'))} (D40)`, fmt(end23)],
    ['2024', `+ income ${fmt(y24?.k1_income)} − distributions ${fmt(y24?.distributions)} (${y24?.source ?? ''})`, fmt(end24)],
    ['2025', `+ ${fmt(line('F7203.4'))} − distributions ${fmt(line('F7203.6'))}; excess ${fmt(line('F7203.excess'))} → capital gain`, fmt(line('F7203.15'))],
  ];
  const rp = (b.partnership_ridgeline as any[])[0];
  const inc = f('D37', 'box2') + f('D37', 'box5') + f('D37', 'box9a');
  const home = (b.home_7709_barton_ridge as any[])[0];
  const iso = { sh: f('D12', 'box5'), price: f('D12', 'box3'), fmv: f('D12', 'box4'), date: m.evsByDoc.get('D12')?.find((e) => e.field === 'box2')?.value };
  return (
    <>
      <Section title="Woodworks S corporation stock basis (Form 7203)"><SimpleTable head={['Year', 'Movement', 'Ending basis']} rows={s} /></Section>
      <Section title="Ridgeline partnership">
        <SimpleTable head={['Year', 'Capital account', 'Outside basis']} rows={[
          [String(rp.year), fmt(rp.ending_capital_account), rp.outside_basis == null ? 'never computed' : fmt(rp.outside_basis)],
          ['2025', `${fmt(f('D37', 'cap_end'))} (${fmt(f('D37', 'cap_begin'))} + income ${fmt(inc)} − distributions ${fmt(f('D37', 'box19a'))} − foreign tax ${fmt(f('D37', 'box21'))}, D37)`, 'compute: needs share of liabilities from K-1 item K'],
        ]} />
      </Section>
      <Section title="IRA nondeductible basis (Ngozi)"><SimpleTable head={['Year', 'Basis']} rows={[['2024 (8606 line 14)', fmt(b.ira_nondeductible_basis_ngozi[0].form_8606_line_14)], ['2025 end (after conversion)', fmt(v.carryovers_out.federal.ira_nondeductible_basis_ngozi)]]} /></Section>
      <Section title="Home — 7709 Barton Ridge Dr">
        <SimpleTable head={['Event', 'Amount', 'Source']} rows={[[home.event, fmt(home.price), home.source], ['Seller-period real estate tax credited at closing', `${fmt(f('D54', 'tax_credit'))}: not deductible by buyer; does not reduce basis`, 'D54']]} />
      </Section>
      <Section title="Corvane ISO shares (still held)">
        <SimpleTable head={['', 'Regular basis', 'AMT basis', 'Source']} rows={[[`${fmt(iso.sh)} sh exercised ${iso.date}`, fmt(iso.sh * iso.price), fmt(iso.sh * iso.fmv), 'Form 3921 (D12)']]} />
      </Section>
    </>
  );
}

function PriorPrep() {
  const { m, v, wp, findings } = useApp();
  const py = m.p.prior_years.return_2024;
  const ppw = m.p.prior_years.prior_preparer_workpaper;
  const line = (k: string) => adjustedValue(wp, k, m.line(v.version, k)?.value) as number;
  const note = (re: RegExp) => ppw.notes.find((n: string) => re.test(n)) ?? ppw.open_items_left_by_prior_preparer.find((n: string) => re.test(n)) ?? '—';
  const f = (doc: string, field: string) => m.evsByDoc.get(doc)?.find((e) => e.field === field)?.value;
  const st = (id: string) => { const x = findings.find((y) => y.id === id); return x ? (x.severity === 'pass' ? 'check passes' : findingStatus(x, wp) === 'open' ? 'check open' : 'resolved') : ''; };
  const decided = (re: RegExp) => outsideFilings(m, v, wp).find((x) => re.test(x.filing))?.decision;
  const cin = m.p.prior_years.carryovers_into_2025 as Record<string, any>;
  const out = v.carryovers_out.federal as Record<string, any>;
  // prior-year accumulated depreciation by asset vs the engine's opening balance
  const recs = m.p.prior_years.asset_records as any[];
  const agree = recs.filter((r) => { const a = (v.assets as any[]).find((x) => x.asset_id === r.asset_id); const sum = Object.values(r.federal ?? {}).reduce((x: number, y: any) => x + Number(y), 0); return a && Math.abs(a.federal.prior_accumulated - sum) < 1; }).length;
  const sqft = [f('D24', 'sac_sqft'), f('D24', 'aus_sqft')].map(Number);
  const rate = m.p.engine_reference.parameters.mileage_rate;
  const miles = Math.round(line('SchC.9') / rate);
  const fbar = decided(/FBAR/), f3520 = decided(/3520/);
  const theoFix = wp.householdFixes.get('theo.ssn');
  const last4 = (x: string) => `•••-••-${String(x).slice(-4)}`;
  const rows: [string, string, string, string, string[]][] = [
    ['Home office', `${fmt(py.lines['SchC.30'])}: “${note(/Home office/)}”`, `${fmt(line('SchC.30'))}: average ${fmt((sqft[0] + sqft[1]) / 2)} sq ft (${sqft.join(' then ')}) from D24 (${st('home-office')})`, line('SchC.30') < py.lines['SchC.30'] ? `Prior year overstated ≈ ${fmt(py.lines['SchC.30'] - line('SchC.30'))}` : 'Agreed', ['D24', 'SchC.30']],
    ['Woodworks basis', `“${note(/Woodworks S corp basis/)}”`, `Rolled forward with the 2023 K-1 (D40); 2025 distributions exceed basis by ${fmt(line('F7203.excess'))}`, line('F7203.excess') > 0 ? 'Taxable gain recognized' : 'Basis sufficient', ['D40', 'F7203.excess']],
    ['IRA basis', `“${note(/8606/)}”`, `Agreed to 2024 Form 5498 (D42): ${fmt(f('D42', 'box1'))}`, Number(f('D42', 'box1')) === m.p.prior_years.basis_records.ira_nondeductible_basis_ngozi[0].form_8606_line_14 ? 'Confirmed' : 'Differs', ['D42']],
    ['SE health insurance', `${fmt(py.lines['Sch1.17'])}: “${py.notes?.['Sch1.17'] ?? ''}”`, `${fmt(line('Sch1.17'))} (engine ${fmt(m.line(v.version, 'Sch1.17')?.value)}); eligible for employer plan (qa-25)`, line('Sch1.17') === py.lines['Sch1.17'] ? 'Consistent with prior year' : 'Differs from prior year', ['qa-25', 'Sch1.17']],
    ['Form 3520 (2023 inheritance)', `Open item: “${note(/3520/)}”`, f3520 ? f3520.decision : 'No decision recorded yet', f3520 ? 'Decided; outside engagement' : 'Open', ['D36']],
    ['FBAR', `“${note(/FBAR/)}”`, fbar ? fbar.decision : 'No decision recorded yet', fbar ? 'Decided; outside engagement' : 'Open', ['D36']],
    ['Depreciation schedule', `Federal / CA by asset (${ppw.depreciation_schedule})`, `Opening accumulated depreciation agrees for ${agree} of ${recs.length} prior-year assets`, agree === recs.length ? 'Agreed' : 'Differences to review', ['D07']],
    ['Passive losses', `“${py.notes?.F8582 ?? ''}” Suspended: Fremont ${fmt(cin.passive_1450_fremont)} / Barton Hills ${fmt(cin.passive_1200_barton_hills)}`, `Carried out to 2026: Fremont ${fmt(out.passive_1450_fremont)} / Barton Hills ${fmt(out.passive_1200_barton_hills)}`, !out.passive_1450_fremont && !out.passive_1200_barton_hills ? 'Fully released in 2025' : 'Partly suspended', ['D06', 'D07']],
    ['Mileage', `${fmt(py.lines['SchC.9'])}: ${py.line_labels?.['SchC.9'] ?? ''}`, `${fmt(line('SchC.9'))}: ${fmt(miles)} business miles × ${rate} (${st('mileage')})`, 'Recomputed from the log', ['SchC.9']],
    ['Dependent SSN (Theo)', last4(py.dependents[1].ssn), `Organizer ${last4(m.p.household.people.find((x) => x.id === 'theo')!.ssn)}${theoFix ? `; corrected from the card (D71) to ${last4(theoFix.value)}` : '; card (D71) not yet used'}`, theoFix ? (theoFix.value === py.dependents[1].ssn ? 'Prior preparer was right' : 'Corrected') : 'Open', ['household:theo']],
  ];
  return <SimpleTable head={['Item', 'Prior preparer (Delta River, 2024)', 'This workpaper (2025)', 'Outcome', 'Evidence']} rows={rows.map(([a, b, c, d, refs]) => [a, b, c, d, <span key="r" className="chips">{refs.map((r) => <Ref key={r} r={r} compact />)}</span>])} />;
}
