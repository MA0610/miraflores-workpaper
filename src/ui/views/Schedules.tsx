import type { ReactNode } from 'react';
import { useApp } from '../ctx';
import { AREAS, lineArea } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjustedValue, signoffStates } from '../../logic/rules';
import { Badge, Delta, Money, Ref, Section, SimpleTable, fmt } from '../components/bits';
import { TaxFlow } from './Overview';

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
  const { v, wp, setFocus } = useApp();
  const hvac = wp.adjustments.find((a) => a.findingId === 'hvac' && a.status !== 'rejected');
  const s179 = wp.adjustments.find((a) => a.whatIf === 'equipment_section179' && a.status !== 'rejected');
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl click">
          <thead>
            <tr><th>Asset</th><th>Activity</th><th>In service</th><th className="r">Cost</th><th>Method / life</th><th className="r">Fed prior</th><th className="r">Fed 2025</th><th className="r">Fed end</th><th className="r">CA 2025</th><th className="r">CA end</th><th className="r">AMT diff</th><th>Disposed</th></tr>
          </thead>
          <tbody>
            {v.assets.map((a: any) => (
              <tr key={a.asset_id} onClick={() => setFocus(`asset:${a.asset_id}`)}>
                <td><b className="mono">{a.asset_id}</b> {a.description}</td><td className="tiny">{a.activity}</td><td className="tiny">{a.placed_in_service}</td>
                <td className="r"><Money v={a.cost} /></td><td className="tiny">{a.method}{a.life_years ? ` · ${a.life_years} yr` : ''}{a.asset_id.startsWith('STU') && s179 ? ' → §179 elected' : ''}</td>
                <td className="r"><Money v={a.federal?.prior_accumulated} cents /></td><td className="r"><Money v={a.federal?.depreciation_2025} cents /></td><td className="r"><Money v={a.federal?.accumulated_end} cents /></td>
                <td className="r"><Money v={a.california?.depreciation_2025} cents /></td><td className="r"><Money v={a.california?.accumulated_end} cents /></td>
                <td className="r"><Money v={a.amt?.difference_from_regular} cents /></td>
                <td className="tiny">{a.disposed ? `${a.disposed}${a.disposition ? ` · gain ${fmt(a.disposition.gain ?? a.disposition.total_gain)}` : ''}` : ''}</td>
              </tr>
            ))}
            {hvac && (
              <tr className="added">
                <td><b className="mono">SAC-HVAC</b> 1450 Fremont Way — heat pump system (workpaper)</td><td className="tiny">Rental: 1450 Fremont Way</td><td className="tiny">2025-08-12</td><td className="r"><Money v={11000} /></td>
                <td className="tiny">SL / mid-month · 27.5 yr</td><td className="r">0</td><td className="r"><Money v={Math.round((11000 / 27.5) * (4.5 / 12) * 100) / 100} cents /></td><td className="r">—</td><td className="r">same</td><td className="r">—</td><td className="r">0</td><td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Section title="Disposal and recapture — 1200 Barton Hills Dr 4C">
        <LineRows keys={['F4797.21', 'F4797.22', 'F4797.23', 'F4797.24', 'F4797.25', 'F4797.26g', 'SchD.19']} py={false} />
        <p className="tiny">Residential rental placed in service after 1986 is straight-line: no §1250 ordinary recapture; the 50,340 of depreciation is unrecaptured §1250 gain taxed at up to 25%. Flooring (AUS-FLOOR) is a structural component, also §1250.</p>
      </Section>
      <Section title="Federal vs California">
        <p className="tiny">California does not allow federal bonus depreciation: STU-* equipment (100% bonus federally) is depreciated over 5 years for CA, creating a CA addition of 30,400 (SchCA540NR.12.C). SAC-APPL (2021 appliances, 100% federal bonus) still has CA basis: 483.84 CA subtraction in 2025. Electing §179 (CA limit 25,000) reduces the CA addition by 20,000 (engine what-if).</p>
      </Section>
    </>
  );
}

function BooksToTax() {
  const { m, v, wp, setFocus } = useApp();
  const ev = (id: string) => m.evs.get(id)!.value as number;
  const books = ev('ev-0105');
  const rows: [string, number, string[]][] = [
    ['Net income per books (QuickBooks, cash basis)', books, ['ev-0105']],
    ['+ 1099-K amounts the engine could not match to a deposit', 12400, ['ev-0127']],
    ['− Tax depreciation over book (100% bonus 38,000 vs book SL 7,600)', -(38000 - ev('ev-0092')), ['ev-0092', 'F4562-C.14']],
    ['− Standard mileage replaces book fuel (8,260 − 3,100)', -(m.line(v.version, 'SchC.9')!.value - ev('ev-0090')), ['SchC.9', 'ev-0090']],
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
  const { v } = useApp();
  return (
    <>
      <div className="grid2">
        <Section title="A · 1450 Fremont Way, Sacramento (all year, CA-source)"><LineRows keys={keysOf(v, /^SchE\.\d+A$/)} /></Section>
        <Section title="B · 1200 Barton Hills Dr 4C, Austin (rented to 9/30, sold 10/15)"><LineRows keys={keysOf(v, /^SchE\.\d+B$/)} /></Section>
      </div>
      <Section title="Passive activity loss (Form 8582)">
        <LineRows keys={keysOf(v, /^F8582\./)} py={false} />
        <p className="tiny">Suspended from 2024: Fremont 6,300; Barton Hills 9,850 (D06 p9, D07 p6). The condo’s sale is a full taxable disposition, freeing its suspended loss; with the 105,040 §1231 gain and K-1 passive income, net passive income is positive so all current and prior losses are allowed. Nothing carries to 2026.</p>
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
      <Section title="2024 K-1s as reported"><pre className="json">{JSON.stringify({ K1_1120S: m.p.prior_years.return_2024.K1_1120S, K1_1065: m.p.prior_years.return_2024.K1_1065 }, null, 2)}</pre></Section>
    </>
  );
}

function Retirement() {
  const { v } = useApp();
  return (
    <>
      <Section title="Backdoor Roth (Form 8606) — Ngozi"><LineRows keys={keysOf(v, /^F8606\.|^F1040\.4/)} /><p className="tiny">Two 7,000 nondeductible contributions were made in 2025 (02/12/2025 for 2024, per D42; and the 2025 contribution per D43), both converted (02/20 and 04/02). Basis 7,000 + 7,000 = 14,000 against 14,026 converted: 26 taxable. The client’s “no prior basis” (qa-31) is wrong; the documents govern.</p></Section>
      <Section title="HSA (Form 8889) and SEP"><LineRows keys={[...keysOf(v, /^F8889\./), 'Sch1.16', 'Sch1.17']} /></Section>
      <Section title="Foreign: Sparbanken Norrland (Sweden)"><LineRows keys={['SchB.1.6', 'SchB.7a', 'SchB.7b', 'F8938.1.max', 'F8938.1.ye', 'F8938.req']} /><p className="tiny">FBAR (FinCEN 114) required — outside engagement; Form 3520 for the 2023 inheritance is unresolved from the prior preparer. See outside filings.</p></Section>
    </>
  );
}

function Deductions() {
  const { m, v, wp } = useApp();
  const L = (k: string) => adjustedValue(wp, k, m.line(v.version, k)?.value);
  const agi = v.summary.federal.agi;
  const rows = [
    ['SALT cap', `${fmt(L('SchA.5d'))} paid`, `cap ${fmt(m.p.engine_reference.parameters.salt_cap)} (phase-down starts at ${fmt(m.p.engine_reference.parameters.salt_cap_phase_start)} MAGI)`, fmt(L('SchA.5e'))],
    ['Home mortgage interest', `${fmt(L('SchA.8e'))}`, 'Acquisition debt 548,000 / refinance 540,000 < 750,000 limit', 'Fully deductible'],
    ['Cash gifts (60% AGI)', fmt(L('SchA.11')), `limit ${fmt(agi * 0.6)}`, 'Within limit'],
    ['Stock to donor-advised fund (30% AGI, LTCG property)', fmt(L('F8283.A1.stock')), `limit ${fmt(agi * 0.3)}; held since 2019; publicly traded — no appraisal`, 'Within limit'],
    ['Vehicle (1098-C)', fmt(L('F8283.A1.vehicle')), 'Limited to gross proceeds when the charity sells', '1098-C attached'],
    ['Child tax credit / ODC', fmt(L('F8812.8')), `phase-out from ${fmt(m.p.engine_reference.parameters.ctc_phaseout_start)}: −${fmt(L('F8812.11'))}`, fmt(L('F8812.12'))],
    ['American opportunity credit', fmt(L('F8863.30')), `phase-out ${m.p.engine_reference.parameters.aotc_phaseout.join('–')}`, '0'],
    ['Dependent care', fmt(L('F2441.2')), 'Limit 3,000 (one child) less 5,000 excluded benefits', '0 credit; 5,000 excluded'],
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
  const paid = wp.filing.events.find((e) => e.action === 'balance_paid');
  return (
    <>
      <Section title="Federal">
        <SimpleTable
          head={['Date', 'What', 'Client / documents', 'IRS transcript', 'On return']}
          rows={[
            ['2025-04-15', 'Q1 estimate', '3,000 (EFTPS D67)', '3,000', ''],
            ['2025-06-16', 'Q2 estimate', '3,000 (EFTPS D67)', '3,000', ''],
            ['2025-09-15', 'Q3 estimate', '3,000 (EFTPS D67)', '3,000', ''],
            ['2026-01-15', 'Q4 estimate', '4,000 “I think” (qa-41, no confirmation)', '3,000 (01/15)', ''],
            ['', 'Total estimates', '13,000', tr ? fmt(tr.transactions.filter((t: any) => t.code === '670' && /Estimated/.test(t.description)).reduce((s: number, t: any) => s + t.amount, 0)) : '—', fmt(adjustedValue(wp, 'F1040.26', m.line(v.version, 'F1040.26')?.value))],
            ['2026-04-14', 'Extension payment (4868)', 'timeline', tr?.transactions.some((t: any) => t.amount === 36000) ? '36,000' : 'not yet on transcript', fmt(m.line(v.version, 'Sch3.10')?.value)],
          ]}
        />
        <p className="tiny">Balance after 04/15/2026 accrues interest ({rates.irs_underpayment_interest_rate_annual * 100}%/yr) and a failure-to-pay penalty ({rates.irs_failure_to_pay_penalty_per_month * 100}%/month): on the engine’s {fmt(bal)} paid 07/20 (96 days) ≈ {fmt(bal * rates.irs_underpayment_interest_rate_annual * (96 / 365))} interest + {fmt(bal * rates.irs_failure_to_pay_penalty_per_month * 4)} penalty. {paid ? `Paid ${paid.simAt.slice(0, 10)}.` : ''} The engine does not compute these; the IRS will bill them (code 196/276).</p>
      </Section>
      <Section title="California">
        <SimpleTable
          head={['Date', 'Designated', 'Amount', 'FTB applied to']}
          rows={[
            ['2025-01-15', '2024 estimate', '3,000', '2024 (not 2025)'],
            ['2025-03-28', '2024 balance due', '1,240', '2024'],
            ...ftb.tax_year_2025_payments.map((p: any) => [p.date, '2025 estimate', fmt(p.amount), '2025']),
            ...ftb.tax_year_2024_payments_after_filing.map((p: any) => [p.date, 'designated 2024 (client error)', fmt(p.amount), p.note]),
          ]}
        />
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
  const { m, v } = useApp();
  const cin = m.p.prior_years.carryovers_into_2025;
  const cout = v.carryovers_out;
  return (
    <div className="grid2">
      <Section title="Into 2025 (from 2024)"><pre className="json">{JSON.stringify(cin, null, 2)}</pre></Section>
      <Section title={`Out to 2026 (engine ${v.version})`}><pre className="json">{JSON.stringify(cout, null, 2)}</pre><p className="tiny">Add from the workpaper: SAC-HVAC improvement basis 11,000 (if capitalized); SEP excess contribution to withdraw; ISO AMT basis 52,000 in the 1,000 Corvane shares still held; FTB 2024 credit 3,500 refund pending.</p></Section>
    </div>
  );
}

function Basis() {
  const { m, v } = useApp();
  const b = m.p.prior_years.basis_records;
  const s = [
    ['2022', 'ending (client worksheet, unverified)', '21,300'],
    ['2023', '+ income 14,100 − distributions 20,000 (D40)', '15,400'],
    ['2024', '+ income 16,900 − distributions 30,000 (D06)', '2,300'],
    ['2025', `+ ${fmt(m.line(v.version, 'F7203.4')?.value)} − distributions 42,000; excess ${fmt(m.line(v.version, 'F7203.excess')?.value)} → capital gain`, fmt(m.line(v.version, 'F7203.15')?.value)],
  ];
  return (
    <>
      <Section title="Woodworks S corporation stock basis (Form 7203)"><SimpleTable head={['Year', 'Movement', 'Ending basis']} rows={s} /></Section>
      <Section title="Ridgeline partnership"><SimpleTable head={['Year', 'Capital account', 'Outside basis']} rows={[['2024', '60,000', 'never computed'], ['2025', `${fmt(v.carryovers_out.federal.ridgeline_capital_account_end)} (60,000 + 9,870 − 6,000 − 210)`, 'compute: needs share of liabilities from K-1 item K']]} /></Section>
      <Section title="IRA nondeductible basis (Ngozi)"><SimpleTable head={['Year', 'Basis']} rows={[['2024 (8606 line 14)', fmt(b.ira_nondeductible_basis_ngozi[0].form_8606_line_14)], ['2025 end (after conversion)', fmt(v.carryovers_out.federal.ira_nondeductible_basis_ngozi)]]} /></Section>
      <Section title="Home — 7709 Barton Ridge Dr"><SimpleTable head={['Event', 'Amount', 'Source']} rows={[['Purchase 07/08/2025', '685,000', 'D54'], ['Seller-paid real estate tax (01/01–07/07)', 'not deductible by buyer; does not reduce basis', 'D54']]} /></Section>
      <Section title="Corvane ISO shares (still held)"><SimpleTable head={['', 'Regular basis', 'AMT basis']} rows={[['1,000 sh exercised 07/30/2025', '12,000', '52,000']]} /></Section>
    </>
  );
}

function PriorPrep() {
  const rows = [
    ['Home office', '300 sq ft, “2 rooms combined?”, unconfirmed', '240 sq ft monthly average from D24 (220 then 260)', 'Prior year overstated ≈ 400 deduction'],
    ['Woodworks basis', '“Assumed basis sufficient”, 2023 K-1 missing', 'Rolled forward with 2023 K-1 (D40); 2025 distributions exceed basis by 21,215', 'Taxable gain recognized'],
    ['IRA basis', '7,000 per client, 5498 not obtained', 'Agreed to 2024 Form 5498 (D42)', 'Confirmed'],
    ['SE health insurance', 'None — Erik on Ngozi’s plan', 'None — eligible for employer plan (qa-25)', 'Consistent (engine had taken 14,400)'],
    ['Form 3520 (2023 inheritance)', 'Open item, no resolution', 'Advised client; outside engagement', 'Still open with client'],
    ['FBAR', 'Filed by client', 'Reminded; outside engagement', '—'],
    ['Depreciation schedule', 'Federal / CA by asset', 'Agreed accumulated depreciation to the schedule (D07 p4)', 'Agreed'],
    ['Passive losses', 'Allocated ratably; 6,300 / 9,850 suspended', 'Agreed; fully released in 2025', 'Agreed'],
    ['Mileage', '7,400 business miles', '8,100 (after removing duplicate page)', 'Sacramento + Austin routes'],
    ['Dependent SSN (Theo)', '666-74-3390', 'Organizer says 3309 — card (D71) says 3390', 'Prior preparer was right'],
  ];
  return <SimpleTable head={['Item', 'Prior preparer (Delta River, 2024)', 'This workpaper (2025)', 'Outcome']} rows={rows} />;
}
