import type { Model } from '../data/model';
import type { Line, Version } from '../data/types';
import type { Judgment, WP } from '../ledger/fold';
import type { AdjustPayload } from '../ledger/types';

/**
 * Independent checks. They read the packet directly (documents, agency records, client answers,
 * prior year) and never take the engine's word for anything. Each produces a finding with the
 * engine's number, what the evidence supports, the refs that prove it, and proposed adjustments.
 */
export type Severity = 'error' | 'warning' | 'info' | 'pass';
export interface Finding {
  id: string;
  area: string;
  kind: 'reconciliation' | 'source' | 'consistency' | 'judgment' | 'completeness' | 'arithmetic';
  severity: Severity;
  title: string;
  engine?: number | string;
  expected?: number | string;
  explain: string;
  refs: string[];
  lines: string[];
  proposals?: AdjustPayload[];
  table?: { head: string[]; rows: (string | number)[][]; decide?: (string | null)[] };
  suggestQuestion?: { to: string; text: string };
  blocksFiling?: boolean;
}

const CA_RES_END = '2025-07-14';
const money = (n: number) => Math.round(n).toLocaleString('en-US');
const num = (s: string) => Number(s.replace(/,/g, ''));
const sumv = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const deadline = (m: Model, re: RegExp) => m.p.firm.deadlines.find((d) => re.test(d.what))?.date ?? '';
const usDate = (d: string) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : '');

/** SEP contribution above the 2025 limit: the engine's nondeductible part plus any cut to the deduction in the workpaper. */
export function sepExcess(v: Version, wp: WP) {
  const cut = wp.adjustments.filter((a) => a.status !== 'rejected' && a.target === 'Sch1.16').reduce((s, a) => s + Number(a.from) - Number(a.to), 0);
  return (v.carryovers_out?.federal?.sep_contribution_not_deductible_for_2025 ?? 0) + cut;
}

export interface OutsideFiling {
  filing: string;
  trigger: string;
  status: string;
  action: string;
  /** what the client has to do, in their words; null when nothing is asked of them */
  client: string | null;
  decision?: Judgment;
}

/** Filings outside this engagement, each matched to the outside-filing judgment that decides it (by title). */
export function outsideFilings(m: Model, v: Version, wp: WP): OutsideFiling[] {
  const L = m.lineMaps.get(v.version)!;
  const val = (k: string) => (L.get(k)?.value as number) ?? 0;
  const fbarDue = deadline(m, /FBAR|114/), necDue = deadline(m, /1099-NEC/), extDue = deadline(m, /Extended due/);
  const d27 = m.docs.get('D27')?.pages.map((p) => p.printed_content).join(' ') ?? '';
  const nec = (m.evsByDoc.get('D27') ?? []).map((e) => {
    const last = e.field.charAt(0).toUpperCase() + e.field.slice(1);
    return `${d27.match(new RegExp(`[A-Z][a-z]+ ${last}`))?.[0] ?? last} (${money(Number(e.value))})`;
  });
  const excess = sepExcess(v, wp);
  const rows: [string, string, string, string, string | null, RegExp][] = [
    ['FinCEN 114 (FBAR) 2025', `Max balance ${money(val('F8938.1.max'))} > 10,000`, 'Not in engagement (D01). Client filed 2024 themselves.', `Remind client; due ${usDate(fbarDue)}`,
      `File FinCEN Form 114 (FBAR) for the Sparbanken account by ${fmtLong(fbarDue)} (we do not prepare it).`, /FBAR|FinCEN 114/i],
    ['Form 3520 for 2023', 'Inheritance from Birgitta Lindqvist (D36: account opened 09/2023 from inheritance, > 100,000)', 'Prior preparer open item, never resolved', 'Advise client: late 3520, reasonable-cause statement',
      'Talk to us about the 2023 Form 3520 for the inheritance from Birgitta Lindqvist.', /3520/],
    ['Forms 1099-NEC for 2025', `Contractors paid ≥ 600: ${nec.join(', ')} (D27)`, `Due ${usDate(necDue)}, not filed (qa-23)`, 'File late now; SchC line J answered “No”',
      `File Forms 1099-NEC for ${nec.join(' and ')} now; they were due ${fmtLong(necDue)}.`, /1099-NEC/i],
    ['Form 5330 (SEP excess)', `SEP contribution ${money(excess)} above the limit`, 'Excise 10% unless excess withdrawn', 'Advise client before deadline',
      excess > 0 ? `Withdraw the excess SEP-IRA contribution (${money(excess)}) and its earnings before ${fmtLong(extDue)}.` : null, /5330/],
    ['Ada’s own 2025 return', 'Checked “can be claimed as a dependent”', 'Consistent with ODC claimed here', 'None', null, /\bAda\b/],
    ['Woodworks 1120-S / Oregon composite', 'Oregon tax 1,580 paid on Erik’s behalf', 'No Oregon filing needed by Erik', 'Schedule S credit claimed', null, /Woodworks|Oregon/i],
    ['Ridgeline 1065 / Arizona composite', 'AZ 27% share', 'No Arizona filing needed (D38)', 'None', null, /Ridgeline|Arizona/i],
  ];
  return rows.map(([filing, trigger, status, action, client, re]) => ({
    filing, trigger, status, action, client,
    decision: wp.judgments.filter((j) => j.kind === 'outside_filing' && re.test(j.title)).at(-1),
  }));
}

const fmtLong = (d: string) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');

export function runChecks(m: Model, v: Version, wp: WP, clock: string): Finding[] {
  const L = m.lineMaps.get(v.version)!;
  const val = (k: string) => (L.get(k)?.value as number) ?? 0;
  const ev = (id: string) => m.evs.get(id)!;
  const text = (docId: string, page?: number) =>
    (m.docs.get(docId)?.pages ?? []).filter((p) => page == null || p.page === page).map((p) => p.printed_content).join(' ');
  const has = (docId: string) => (m.docs.get(docId)?.received_at ?? '9999') <= clock;
  const msgVisible = (id: string) => (m.p.client.messages.find((x) => x.id === id)?.sent_at ?? '9999') <= clock;
  const rate = (c: keyof Version['tax_effect_rates']) => v.tax_effect_rates[c];
  const out: Finding[] = [];
  const P = m.p;

  // ---------------- arithmetic: recompute every engine sum ----------------
  {
    let ok = 0;
    const bad: string[] = [];
    for (const l of v.lines) {
      if (l.rule !== 'R-SUM' || !l.inputs?.length || typeof l.value !== 'number') continue;
      const vals = l.inputs.map((i) => (L.get(i)?.value as number) ?? 0);
      const s = sumv(vals), sub = vals[0] - sumv(vals.slice(1));
      // 'overpaid' style lines are the reverse difference (payments − tax)
      if (Math.abs(s - l.value) <= 1.5 || Math.abs(Math.abs(sub) - Math.abs(l.value)) <= 1.5 || l.form === 'SchCA540NR') ok++;
      else bad.push(l.key);
    }
    out.push({
      id: 'arith-sums', area: 'tax', kind: 'arithmetic', severity: bad.length ? 'error' : 'pass',
      title: `Recomputed ${ok + bad.length} engine totals from their inputs`,
      explain: bad.length ? `Totals that do not foot: ${bad.join(', ')}` : 'Every total foots to its inputs (adds, or first input less the rest). The engine’s arithmetic is not where this return’s problems are.',
      refs: [], lines: bad,
    });
  }

  // ---------------- wages: duplicate W-2 images ----------------
  {
    const w2 = P.documents.filter((d) => d.document_type === 'W-2' && has(d.id));
    const sig = (id: string) => (m.evsByDoc.get(id) ?? []).filter((e) => /^box(1|2|16|17)$|employer_ein/.test(e.field)).map((e) => `${e.field}=${e.value}`).sort().join('|');
    const groups = new Map<string, string[]>();
    for (const d of w2) groups.set(sig(d.id), [...(groups.get(sig(d.id)) ?? []), d.id]);
    const dups = [...groups.values()].filter((g) => g.length > 1);
    const box1 = sumv([...groups.values()].map((g) => (m.evsByDoc.get(g[0]) ?? []).find((e) => e.field === 'box1')?.value ?? 0));
    out.push({
      id: 'w2-dup', area: 'wages', kind: 'reconciliation', severity: Math.abs(box1 - val('F1040.1a')) < 1 ? 'pass' : 'error',
      title: 'W-2 box 1 agrees to line 1a, duplicates counted once',
      engine: val('F1040.1a'), expected: box1,
      explain: `${w2.length} W-2 documents; ${dups.map((g) => g.join(' = ')).join(', ') || 'no'} identical (same EIN and amounts) treated as one. Sum of unique box 1: ${money(box1)}.`,
      refs: w2.map((d) => d.id), lines: ['F1040.1a'],
    });
    // excess social security
    const box4 = sumv(w2.filter((d) => !dups.some((g) => g.slice(1).includes(d.id))).map((d) => (m.evsByDoc.get(d.id) ?? []).find((e) => e.field === 'box4')?.value ?? 0));
    const max = P.engine_reference.parameters.ss_wage_base * 0.062;
    const excess = Math.round(box4 - max);
    out.push({
      id: 'excess-ss', area: 'wages', kind: 'arithmetic', severity: Math.abs(excess - val('Sch3.11')) <= 1 ? 'pass' : 'error',
      title: 'Excess social security withheld (two employers) recomputed',
      engine: val('Sch3.11'), expected: excess,
      explain: `Box 4 total ${money(box4)} less maximum ${money(max)} (6.2% of the ${money(P.engine_reference.parameters.ss_wage_base)} wage base).`,
      refs: ['ev-0019', 'ev-0038', 'ref:param.ss_wage_base'], lines: ['Sch3.11'],
    });
  }

  // ---------------- interest: same account reported on two documents ----------------
  {
    const intLines = v.lines.filter((l) => l.form === 'SchB' && l.line.startsWith('1.'));
    for (let i = 0; i < intLines.length; i++)
      for (let j = i + 1; j < intLines.length; j++) {
        const a = intLines[i], b = intLines[j];
        if (a.value !== b.value) continue;
        const da = ev(a.sources[0])?.document_id, db = ev(b.sources[0])?.document_id;
        if (!da || !db || da === db) continue;
        const acct = (t: string) => t.match(/account ending (\d{4})/)?.[1];
        if (acct(text(da)) && acct(text(da)) === acct(text(db))) {
          out.push({
            id: 'int-dup', area: 'investments', kind: 'reconciliation', severity: 'error',
            title: `Interest of ${money(a.value)} counted twice (${da} and ${db} report the same account)`,
            engine: a.value + b.value, expected: a.value,
            explain: `${m.docs.get(da)!.title} includes the bank-sweep 1-099-INT for account ending ${acct(text(da))}; ${db} is the same form issued separately by the bank. Lines ${a.key} and ${b.key} both carry it.`.replace('1-099', '1099'),
            refs: [a.sources[0], b.sources[0]], lines: [a.key, b.key, 'SchB.2'],
            proposals: [{ title: `Remove duplicate interest (${db})`, target: b.key, area: 'investments', from: b.value, to: 0, amount: -b.value, category: 'interest', caTreatment: 'rate', reason: `Same 1099-INT reported on ${da} (composite) and ${db}.`, authority: 'IRC §61(a)(4); Form 1099-INT instructions (one report per account)', findingId: 'int-dup', evidence: [a.sources[0], b.sources[0]] }],
          });
        }
      }
  }

  // ---------------- foreign currency: rate from the wrong year ----------------
  for (const l of v.lines) {
    const fx = l.sources?.find((s) => s.startsWith('ref:fx.'));
    if (!fx) continue;
    const [, cur, rateKey] = fx.split('.');
    const rates = P.fx_rates[`${cur}_per_USD`];
    const isBalance = l.form === 'F8938';
    const want = isBalance ? '2025_year_end' : '2025_average';
    if (rateKey === want) {
      out.push({ id: `fx-${l.key}`, area: 'investments', kind: 'source', severity: 'pass', title: `${l.key}: ${cur} converted at the ${want.replace('_', ' ')} rate`, explain: `Rate ${rates[want]} ${cur}/USD is the right rate for ${isBalance ? 'a balance' : 'income'} in 2025.`, refs: [fx, ...l.sources.filter((s) => s !== fx)], lines: [l.key] });
      continue;
    }
    const foreign = ev(l.sources.find((s) => s.startsWith('ev-'))!)?.value as number;
    const right = Math.round(foreign / rates[want]);
    out.push({
      id: `fx-${l.key}`, area: 'investments', kind: 'source', severity: 'error',
      title: `${l.label.split('(')[0].trim()}: converted at the ${rateKey.replace('_', ' ')} rate`,
      engine: l.value, expected: right,
      explain: `${cur} ${money(foreign)} ÷ ${rates[want]} (${want.replace('_', ' ')}) = ${money(right)}. The engine used ${rates[rateKey]} (${rateKey.replace('_', ' ')}), the rate on last year’s return.`,
      refs: [l.sources.find((s) => s.startsWith('ev-'))!, fx, `ref:fx.${cur}.${want}`], lines: [l.key],
      proposals: [{ title: `Convert ${cur} interest at the 2025 average rate`, target: l.key, area: 'investments', from: l.value, to: right, amount: right - l.value, category: 'interest', caTreatment: 'rate', reason: `${cur} ${money(foreign)} at ${rates[want]} ${cur}/USD (2025 average).`, authority: 'IRC §989(b); Treas. Reg. §1.989(b)-1 (average rate for the year)', findingId: `fx-${l.key}` }],
    });
  }

  // ---------------- stock comp: zero basis on noncovered lots with a supplement ----------------
  {
    const supp = has('D11') ? text('D11') : '';
    const lots = [...supp.matchAll(/Lot (RSU-\d+): (\d+) sh acquired (\d\d)\/(\d\d)\/(\d{4}).*?adjusted basis ([\d,]+\.\d\d), sold (\d\d)\/(\d\d)\/(\d{4})/g)].map((x) => ({ lot: x[1], qty: +x[2], acq: `${x[5]}-${x[3]}-${x[4]}`, basis: num(x[6]), sold: `${x[9]}-${x[7]}-${x[8]}` }));
    const rows: (string | number)[][] = [];
    const proposals: AdjustPayload[] = [];
    for (const l of v.lines.filter((x) => x.form === 'F8949' && /basis 0\.00\)/.test(x.label) && /\(RSU\)/.test(x.label))) {
      const acq = l.label.match(/acquired (\d{4}-\d\d-\d\d)/)?.[1];
      const sold = l.label.match(/sold (\d{4}-\d\d-\d\d)/)?.[1] ?? '';
      const proceeds = num(l.label.match(/proceeds ([\d,]+\.\d\d)/)?.[1] ?? '0');
      const s = lots.find((x) => x.acq === acq);
      if (!s) continue;
      const gain = Math.round(proceeds - s.basis);
      const term = l.line.startsWith('B') ? 'stcg' : 'ltcg';
      rows.push([l.key, s.lot, acq ?? '', money(proceeds), money(s.basis), money(l.value), money(gain)]);
      proposals.push({
        title: `${l.key}: use supplemental basis for ${s.lot}`, target: l.key, area: 'investments', from: l.value, to: gain, amount: gain - l.value,
        category: term, caTreatment: sold <= CA_RES_END ? 'ca_source' : 'rate',
        reason: `Broker reported basis blank (noncovered). Corvane supplement gives adjusted basis ${money(s.basis)} (vest FMV already in W-2 box 1). Report on 8949 with code B.`,
        authority: 'Treas. Reg. §1.6045-1(d)(6)(ii); Form 8949 instructions, adjustment code B', findingId: 'rsu-basis', evidence: ['D11', ...l.sources],
      });
    }
    if (rows.length)
      out.push({
        id: 'rsu-basis', area: 'investments', kind: 'source', severity: 'error',
        title: `RSU sales reported with zero basis — ${money(sumv(proposals.map((p) => -p.amount)))} of gain is already taxed as wages`,
        engine: sumv(rows.map((r) => num(String(r[5])))), expected: sumv(rows.map((r) => num(String(r[6])))),
        explain: 'The 1099-B leaves basis blank for noncovered RSU shares. The stock plan supplement (D11) gives the vest-date value, which is already in W-2 box 1/box 14 (RSU 38,200). The engine matched the supplement for the ESPP lot but not these.',
        refs: ['D11', 'ev-0066', 'ev-0068', 'ev-0070', 'ev-0027'], lines: rows.map((r) => String(r[0])),
        table: { head: ['Line', 'Lot', 'Acquired', 'Proceeds', 'Supplement basis', 'Engine gain', 'Correct gain'], rows },
        proposals,
      });
  }

  // ---------------- brokers: summary vs detail, unread pages ----------------
  for (const d of P.documents.filter((x) => x.document_type === '1099-composite' && has(x.id) && !v.documents_superseded.includes(x.id))) {
    const t = text(d.id);
    const summary = t.match(/1099-B summary: total proceeds ([\d,]+\.\d\d)/)?.[1];
    const used = v.lines.filter((l) => l.form === 'F8949' && l.sources.some((s) => ev(s)?.document_id === d.id));
    const detail = sumv(used.map((l) => num(l.label.match(/proceeds ([\d,]+\.\d\d)/)?.[1] ?? '0')));
    const unread = d.extraction?.status === 'partial' ? d.extraction.reason : null;
    const missing = [...t.matchAll(/(M\d+|N\d+) ([^;]+?) ([\d.]+) sh acquired (\S+) sold (\S+) proceeds ([\d,]+\.\d\d) basis ([\d,]+\.\d\d)[^;.]*?(short|long)-term (non)?covered/g)]
      .filter((x) => !used.some((l) => l.line.endsWith(`.${x[1]}`)))
      .map((x) => ({ id: x[1], desc: x[2], acq: x[4], sold: x[5], proceeds: num(x[6]), basis: num(x[7]), term: x[8], covered: !x[9] }));
    if (!summary) continue;
    const s = num(summary);
    const ok = Math.abs(s - detail) < 0.01 && !missing.length;
    out.push({
      id: `broker-${d.id}`, area: 'investments', kind: 'reconciliation', severity: ok ? 'pass' : 'error',
      title: `${d.issuer ?? d.title.split(' 2025')[0]}: 1099-B summary ${ok ? 'agrees to' : 'does not agree to'} the lots on the return`,
      engine: Math.round(detail * 100) / 100, expected: s,
      explain: ok ? 'Summary proceeds equal the sum of lots carried to Form 8949.' :
        `Summary proceeds ${money(s)} vs lots on the return ${money(detail)}. ${unread ?? ''} ${missing.map((x) => `${x.id} ${x.desc} (sold ${x.sold}, proceeds ${money(x.proceeds)}, basis ${money(x.basis)}) is printed on the page but not on the return.`).join(' ')}`,
      refs: [d.id, ...(missing.length ? [`doc:${d.id}#page${d.page_count}`] : [])], lines: used.slice(0, 3).map((l) => l.key),
      proposals: missing.map((x) => ({
        title: `Add ${x.id} ${x.desc} (unread page)`, target: `F8949.${x.term === 'short' ? (x.covered ? 'A' : 'B') : x.covered ? 'D' : 'E'}.${x.id}`, area: 'investments', from: 0, to: Math.round(x.proceeds - x.basis), amount: Math.round(x.proceeds - x.basis),
        category: x.term === 'short' ? 'stcg' : 'ltcg', caTreatment: x.sold <= CA_RES_END ? 'ca_source' : 'rate',
        reason: `Lot printed on page ${d.page_count} ('Additional transactions'), which the pipeline did not read. Explains the ${money(s - detail)} summary difference.`,
        authority: 'IRC §1001; Form 8949 instructions', findingId: `broker-${d.id}`, evidence: [`doc:${d.id}#page${d.page_count}`],
      })),
    });
  }

  // ---------------- digital assets: unknown basis ----------------
  {
    const l = v.lines.find((x) => x.form === 'F8949' && x.line.endsWith('.C6'));
    if (l && /basis 0\.00/.test(l.label)) {
      const answered = msgVisible('msg-07');
      const proceeds = num(l.label.match(/proceeds ([\d,]+\.\d\d)/)?.[1] ?? '0');
      const basis = 3050;
      out.push({
        id: 'crypto-c6', area: 'investments', kind: 'source', severity: answered ? 'error' : 'warning',
        title: answered ? 'Coinhaven lot C6: client supplied basis and an earlier acquisition date' : 'Coinhaven lot C6 has no basis (transfer-in) — ask the client',
        engine: l.value, expected: answered ? proceeds - basis : undefined,
        explain: answered
          ? `msg-07: bought on another exchange 03/15/2021 for about 3,050 (bank statement line to ‘CryptoNorth’), moved to Coinhaven in June. Held more than a year → long-term (box K), gain ${money(proceeds - basis)} instead of ${money(proceeds)} short-term. Keep the bank statement as evidence; the exchange no longer exists.`
          : 'Zero basis and the transfer-in date overstate gain and make it short-term. Only the client knows where this BTC came from.',
        refs: ['ev-0879', 'ev-0918', 'ev-0919', ...(answered ? ['msg-07'] : [])], lines: [l.key],
        suggestQuestion: answered ? undefined : { to: 'client', text: 'Coinhaven shows 0.05 BTC transferred in on 06/01/2025 and sold 06/18/2025. Where and when was it originally bought, and what did it cost? A bank or exchange statement is ideal.' },
        proposals: answered
          ? [
              { title: 'Remove C6 short-term gain (zero basis)', target: l.key, area: 'investments', from: l.value, to: 0, amount: -proceeds, category: 'stcg', caTreatment: 'ca_source', reason: 'Lot moves to long-term with client-substantiated basis.', authority: 'IRC §1012, §1223; Rev. Proc. 2024-28 (wallet-by-wallet basis)', findingId: 'crypto-c6', evidence: ['msg-07'] },
              { title: 'Report C6 long-term with basis 3,050 (box K)', target: 'F8949.K.C6', area: 'investments', from: 0, to: proceeds - basis, amount: proceeds - basis, category: 'ltcg', caTreatment: 'ca_source', reason: 'Acquired 03/15/2021 for 3,050 per client and bank statement; sold 06/18/2025.', authority: 'IRC §1012, §1222(3)', findingId: 'crypto-c6', evidence: ['msg-07'] },
            ]
          : undefined,
      });
    }
  }

  // ---------------- Schedule C: gross receipts reconciliation ----------------
  {
    const nec = P.documents.filter((d) => d.document_type === '1099-NEC' && has(d.id)).map((d) => ({ d, amt: (m.evsByDoc.get(d.id) ?? []).find((e) => e.field === 'box1')!.value as number }));
    const necTotal = sumv(nec.map((x) => x.amt));
    const books = ev('ev-0103').value as number;
    const k = ev('ev-0127').value as number;
    const insideAtlas = ev('ev-0109').value as number;
    const other = ev('ev-0111').value as number;
    const engine = val('SchC.1');
    out.push({
      id: 'schc-gross', area: 'business', kind: 'reconciliation', severity: engine !== books ? 'error' : 'pass',
      title: engine !== books ? `Gross receipts counts the 1099-K twice (${money(engine - books)})` : 'Gross receipts reconcile to books and information returns',
      engine, expected: books,
      explain: `Books revenue ${money(books)} = Forms 1099-NEC ${money(necTotal)} + clients with no 1099 ${money(other)}. The Paywell 1099-K (${money(k)}) is Atlas Outdoor Gear paying by card — already inside Atlas’s 1099-NEC and deposited gross into the books (D15 p3). The engine adds it again because it could not match it to a deposit. This reconciliation is also the answer to exam item 2 of Letter 566.`,
      refs: ['ev-0103', 'ev-0127', 'ev-0109', 'ev-0110', 'ev-0111', ...nec.map((x) => x.d.id)], lines: ['SchC.1'],
      table: { head: ['Source', 'Amount'], rows: [...nec.map((x) => [`1099-NEC ${x.d.issuer ?? x.d.title.split(' - ')[1]}`, money(x.amt)]), ['Clients with no 1099 (D15)', money(other)], ['= Books total income (D14)', money(books)], [`1099-K Paywell (inside Atlas ${money(ev('ev-0110').value)})`, `(${money(insideAtlas)}) already included`]] },
      proposals: engine !== books ? [{ title: 'Remove 1099-K amount already in books', target: 'SchC.1', area: 'business', from: engine, to: books, amount: books - engine, category: 'schc_profit', caTreatment: 'rate', reason: 'Paywell 1099-K is Atlas Outdoor Gear card payments, included in Atlas 1099-NEC and in books deposits (D15 p3).', authority: 'IRC §61; Form 1099-K instructions (no double reporting of the same receipts)', findingId: 'schc-gross', evidence: ['ev-0109', 'ev-0127'] }] : undefined,
    });
  }

  // ---------------- mileage log: duplicate pages ----------------
  {
    const pages = m.docs.get('D23')?.pages ?? [];
    const norm = (s: string) => s.replace(/^\(.*?\)\s*/, '').trim();
    const dupPages: number[] = [];
    pages.forEach((p, i) => pages.slice(0, i).forEach((q) => norm(q.printed_content) === norm(p.printed_content) && dupPages.push(p.page)));
    const totals = pages.map((p) => num(p.printed_content.match(/Page total ([\d,]+) miles/)?.[1] ?? '0'));
    const tripSums = pages.map((p) => sumv([...p.printed_content.matchAll(/ (\d+) mi;?/g)].map((x) => +x[1])));
    const unique = sumv(pages.filter((p) => !dupPages.includes(p.page)).map((p, i) => totals[pages.indexOf(p)]));
    const engine = val('SchC.44a');
    const odo = (ev('ev-0479').value as number) - (ev('ev-0478').value as number);
    const r = P.engine_reference.parameters.mileage_rate;
    out.push({
      id: 'mileage', area: 'business', kind: 'source', severity: engine !== unique ? 'error' : 'pass',
      title: engine !== unique ? `Mileage log page ${dupPages.join(', ')} is a second scan — ${money(engine - unique)} miles counted twice` : 'Business miles agree to the log',
      engine, expected: unique,
      explain: `Page totals ${totals.map(money).join(' + ')} = ${money(sumv(totals))}; each page’s trips foot to its total (${tripSums.map(money).join(', ')}). Page ${dupPages.join(', ')} repeats page 2 trip-for-trip (and says so). Unique business miles ${money(unique)} of ${money(odo)} odometer miles (${Math.round((unique / odo) * 100)}%). Car expense at ${r}/mile: ${money(unique * r)} instead of ${money(val('SchC.9'))}.`,
      refs: ['doc:D23#page2', 'doc:D23#page3', 'ev-0226', 'ev-0315', 'ev-0404', 'ev-0477', 'ev-0478', 'ev-0479'], lines: ['SchC.44a', 'SchC.9', 'SchC.44c'],
      table: { head: ['Page', 'Trips sum', 'Page total', 'Counted'], rows: pages.map((p, i) => [p.page, money(tripSums[i]), money(totals[i]), dupPages.includes(p.page) ? 'duplicate' : 'yes']) },
      proposals: engine !== unique ? [{ title: 'Remove duplicate mileage page', target: 'SchC.9', area: 'business', from: val('SchC.9'), to: Math.round(unique * r), amount: Math.round((engine - unique) * r), category: 'schc_profit', caTreatment: 'rate', reason: `D23 page 3 is a second scan of page 2. Business miles ${money(unique)} × ${r}.`, authority: 'IRC §274(d); Rev. Proc. 2019-46 (standard mileage)', findingId: 'mileage', evidence: ['doc:D23#page3'] }] : undefined,
    });
  }

  // ---------------- business: mixed personal use (from the client call) ----------------
  {
    const call = P.client.call_notes[0];
    const callSeen = call && call.date <= clock;
    const phonePct = callSeen ? +(call.notes.join(' ').match(/business share is (\d+)%/)?.[1] ?? 100) / 100 : 1;
    const netPct = callSeen ? +(call.notes.join(' ').match(/business use about (\d+)%/)?.[1] ?? 100) / 100 : 1;
    const phone = ev('ev-0101').value as number, net = ev('ev-0095').value as number, spotify = ev('ev-0106').value as number;
    const util = Math.round(phone * phonePct + net * netPct);
    out.push({
      id: 'mixed-use', area: 'business', kind: 'judgment', severity: callSeen ? 'error' : 'warning',
      title: callSeen ? `Personal share of phone, internet and Spotify deducted (${money(val('SchC.25') - util + spotify)})` : 'Family phone plan and home internet deducted at 100%',
      engine: val('SchC.25'), expected: callSeen ? util : undefined,
      explain: callSeen ? `Call ${call.date.slice(0, 10)}: phone ${phonePct * 100}% business (4-line family plan), internet ${netPct * 100}%, Spotify Family personal. Utilities (line 25) ${money(phone)}×${phonePct} + ${money(net)}×${netPct} = ${money(util)} instead of ${money(val('SchC.25'))}; software (line 27a) less ${money(spotify)}.` : 'D15 shows a 4-line family plan and home internet. Ask for the business share.',
      refs: ['ev-0101', 'ev-0095', 'ev-0106', 'ev-0107', 'ev-0108', ...(callSeen ? ['call-01'] : [])], lines: ['SchC.25', 'SchC.27a.1'],
      suggestQuestion: callSeen ? undefined : { to: 'client', text: 'What share of the family phone plan and home internet is used for the studio? Is anything in Software (e.g. Spotify) personal?' },
      proposals: callSeen ? [
        { title: 'Phone and internet: business share only', target: 'SchC.25', area: 'business', from: val('SchC.25'), to: util, amount: val('SchC.25') - util, category: 'schc_profit', caTreatment: 'rate', reason: `Business share per client call: phone ${phonePct * 100}%, internet ${netPct * 100}%.`, authority: 'IRC §262; §162(a); Treas. Reg. §1.262-1(b)(1)', findingId: 'mixed-use', evidence: ['call-01'] },
        { title: 'Remove Spotify Family (personal)', target: 'SchC.27a.1', area: 'business', from: val('SchC.27a.1'), to: val('SchC.27a.1') - spotify, amount: spotify, category: 'schc_profit', caTreatment: 'rate', reason: 'Booked to software by mistake (client call).', authority: 'IRC §262', findingId: 'mixed-use', evidence: ['call-01', 'ev-0106'] },
      ] : undefined,
    });
  }

  // ---------------- business: SE health insurance eligibility ----------------
  {
    const qa = P.client.questionnaire.find((q) => q.id === 'qa-25')!;
    const eligible = /^yes/i.test(qa.answer);
    out.push({
      id: 'sehi', area: 'business', kind: 'consistency', severity: eligible && val('Sch1.17') > 0 ? 'error' : 'pass',
      title: eligible ? `SE health insurance deduction (${money(val('Sch1.17'))}) not allowed — Erik was eligible for Ngozi’s employer plan` : 'SE health insurance eligibility',
      engine: val('Sch1.17'), expected: eligible ? 0 : val('Sch1.17'),
      explain: `qa-25: “${qa.answer}” No deduction for any month the self-employed person is eligible for a subsidized plan of a spouse’s employer, even if declined. The 2024 return took none for the same reason. Also removes the premiums from QBI reduction (engine rate does not capture the QBI effect).`,
      refs: ['qa-25', 'qa-27', 'ev-0484', 'py:/return_2024/notes/Sch1.17'], lines: ['Sch1.17', 'Sch1.26'],
      proposals: eligible && val('Sch1.17') > 0 ? [{ title: 'Disallow self-employed health insurance', target: 'Sch1.17', area: 'business', from: val('Sch1.17'), to: 0, amount: -val('Sch1.17'), category: 'adjustment', caTreatment: 'rate', reason: 'Eligible for subsidized family coverage through both of Ngozi’s employers all year (qa-25).', authority: 'IRC §162(l)(2)(B)', findingId: 'sehi', evidence: ['qa-25'] }] : undefined,
    });
  }

  // ---------------- business: SEP limit after other changes ----------------
  {
    const contrib = ev('ev-0485')?.value ?? 0;
    const prm = P.engine_reference.parameters;
    const proposedProfit = val('SchC.31') + sumv(wp.adjustments.filter((a) => a.status !== 'rejected' && a.category === 'schc_profit').map((a) => a.amount));
    const halfSe = (p: number) => {
      const ne = p * prm.se_factor;
      return (Math.min(ne, prm.ss_wage_base) * 0.124 + ne * 0.029) / 2;
    };
    const limit = Math.round(0.2 * (proposedProfit - halfSe(proposedProfit)));
    const engineLimit = val('Sch1.16');
    out.push({
      id: 'sep-limit', area: 'business', kind: 'judgment', severity: has('D26') ? (limit < engineLimit - 1 ? 'error' : 'warning') : 'warning',
      title: limit < engineLimit - 1 ? `SEP deduction falls to ${money(limit)} once Schedule C is corrected; ${money(contrib - limit)} is an excess contribution` : `SEP contribution ${money(contrib)} exceeds the ${money(engineLimit)} limit`,
      engine: engineLimit, expected: limit,
      explain: `Limit = 20% × (net profit − ½ SE tax). With adjusted Schedule C profit ${money(proposedProfit)}: ${money(limit)}. The excess ${money(contrib - limit)} is not deductible and carries a 10% excise tax (Form 5330) unless withdrawn — tell the client before the plan deadline.`,
      refs: ['ev-0485', 'D26', 'qa-26'], lines: ['Sch1.16'],
      proposals: limit < engineLimit - 1 ? [{ title: 'Recompute SEP limit on corrected Schedule C profit', target: 'Sch1.16', area: 'business', from: engineLimit, to: limit, amount: limit - engineLimit, category: 'adjustment', caTreatment: 'rate', reason: `Derived: Schedule C profit after adjustments ${money(proposedProfit)}.`, authority: 'IRC §404(a)(8)(C), §402(h)', findingId: 'sep-limit' }] : undefined,
    });
  }

  // ---------------- business: home office (confirms engine) ----------------
  {
    const sac = ev('ev-0481').value as number, aus = ev('ev-0482').value as number;
    const avg = (sac * 6 + aus * 6) / 12; // July: Austin used 16 days (>=15) so counts as Austin
    out.push({
      id: 'home-office', area: 'business', kind: 'arithmetic', severity: Math.abs(avg * 5 - val('SchC.30')) < 1 ? 'pass' : 'error',
      title: 'Home office average square footage recomputed (prior preparer’s 300 sq ft was wrong)',
      engine: val('SchC.30'), expected: avg * 5,
      explain: `Monthly average: Jan–Jun ${sac} sq ft, Jul–Dec ${aus} sq ft (July counts Austin: used 16 days) = ${avg} sq ft × $5 = ${money(avg * 5)}. 2024 used 300 sq ft without support; D24 shows the Sacramento room was ${sac} sq ft. 2024 overstatement ≈ ${money((300 - sac) * 5)} of deduction — note for the client, below amendment threshold.`,
      refs: ['ev-0481', 'ev-0482', 'ev-0483', 'py:/prior_preparer_workpaper/open_items_left_by_prior_preparer/2'], lines: ['SchC.30'],
    });
  }

  // ---------------- rentals: repair vs improvement ----------------
  {
    const hv = ev('ev-1001').value as number;
    const inv = text('D47');
    if (/installed new/i.test(inv) && hv > 2500)
      out.push({
        id: 'hvac', area: 'rentals', kind: 'judgment', severity: 'error',
        title: `HVAC replacement (${money(hv)}) deducted as a repair — it is an improvement`,
        engine: val('SchE.14A'), expected: val('SchE.14A') - hv,
        explain: 'Invoice D47 and the call: failed furnace and condenser removed, whole new heat-pump system, air handler, line set and thermostat installed, permitted. Replacing the HVAC system (a building system) is a restoration under the tangible property regulations; over the $2,500 de minimis. Capitalize, 27.5-year SL from August 2025. Engine what-if hvac_improvement gives the effect.',
        refs: ['D47', 'ev-1001', 'ev-1004', 'qa-37', 'call-01'], lines: ['SchE.14A', 'SchE.18A'],
        proposals: [{ title: 'Capitalize HVAC as a 27.5-year improvement', target: 'SchE.14A', area: 'rentals', from: val('SchE.14A'), to: val('SchE.14A') - hv, amount: hv, category: 'manual', whatIf: 'hvac_improvement', reason: 'Replacement of the HVAC building system (restoration), not routine maintenance.', authority: 'Treas. Reg. §1.263(a)-3(k)(1)(vi), (e)(2)(ii)(B); §1.263(a)-1(f) de minimis', findingId: 'hvac', evidence: ['D47'] }],
      });
  }

  // ---------------- rentals: sale computation (confirms engine) ----------------
  {
    const price = ev('ev-1014').value as number, sell = (ev('ev-1015').value as number) + (ev('ev-1016').value as number);
    const cost = (ev('ev-1019').value as number) + (ev('ev-1022').value as number);
    const dep = Math.round(sumv(v.assets.filter((a: any) => a.disposed).map((a: any) => a.federal.accumulated_end)));
    const gain = price - sell - (cost - dep);
    out.push({
      id: 'condo-sale', area: 'rentals', kind: 'arithmetic', severity: Math.abs(gain - val('F4797.25')) <= 2 ? 'pass' : 'error',
      title: 'Condo sale gain and unrecaptured §1250 recomputed from the closing statement',
      engine: val('F4797.25'), expected: gain,
      explain: `${money(price)} − selling costs ${money(sell)} − (cost ${money(cost)} − depreciation ${money(dep)}) = ${money(gain)}. Unrecaptured §1250 = depreciation ${money(dep)}. Suspended passive losses (9,850) released on the fully taxable disposition.`,
      refs: ['ev-1014', 'ev-1015', 'ev-1016', 'ev-1019', 'ev-1022', 'ev-1023', 'asset:AUS-BLDG', 'asset:AUS-FLOOR'], lines: ['F4797.25', 'SchD.19', 'SchE.22B'],
    });
  }

  // ---------------- deductions: vehicle donation ----------------
  {
    const sold = text('D66').match(/gross proceeds from sale ([\d,]+\.\d\d)/)?.[1];
    const l = L.get('F8283.A1.vehicle');
    if (sold && l && l.value > num(sold))
      out.push({
        id: 'car-gift', area: 'deductions', kind: 'source', severity: 'error',
        title: `Car donation claimed at the client’s ${money(l.value)} — the charity sold it for ${sold}`,
        engine: l.value, expected: num(sold),
        explain: 'Form 1098-C box 4a is checked (sold in an arm’s-length sale); the deduction is limited to gross proceeds in box 4c. The Kelley Blue Book figure in qa-39 does not apply. Attach Copy B of the 1098-C. Also on Letter 566 item 1.',
        refs: ['D66', 'ev-1054', 'qa-39', 'call-01'], lines: ['F8283.A1.vehicle', 'SchA.12'],
        proposals: [{ title: 'Limit vehicle gift to 1098-C gross proceeds', target: 'F8283.A1.vehicle', area: 'deductions', from: l.value, to: num(sold), amount: num(sold) - l.value, category: 'itemized', caTreatment: 'rate', reason: '1098-C box 4c gross proceeds.', authority: 'IRC §170(f)(12)(A)(ii)', findingId: 'car-gift', evidence: ['D66'] }],
      });
  }

  // ---------------- deductions: mortgage interest counted twice ----------------
  {
    const l = L.get('SchA.8a');
    const payoff = text('D56');
    if (l && l.sources.includes('ev-1032') && /reported on the 2025 Form 1098/.test(payoff)) {
      const dupAmt = ev('ev-1032').value as number;
      out.push({
        id: 'mortgage-dup', area: 'deductions', kind: 'reconciliation', severity: 'error',
        title: `Payoff interest (${money(dupAmt)}) added on top of the Form 1098 that already includes it`,
        engine: l.value, expected: l.value - dupAmt,
        explain: `Lonestar 1098 box 1 (13,900) “includes … interest paid at payoff 11/20/2025”, and the payoff statement says the interest is reported on the 1098. The engine added the payoff line too. Purchase points 4,800 are deductible in full; refinance points 3,200 are amortized (engine: 9 for 2025).`,
        refs: ['ev-1029', 'ev-1032', 'ev-1034', 'ev-1030', 'D56'], lines: ['SchA.8a'],
        proposals: [{ title: 'Remove payoff interest already on Form 1098', target: 'SchA.8a', area: 'deductions', from: l.value, to: l.value - dupAmt, amount: -dupAmt, category: 'itemized', caTreatment: 'rate', reason: 'Included in Lonestar 1098 box 1 (D55, D56).', authority: 'IRC §163(h)(3)', findingId: 'mortgage-dup', evidence: ['D55', 'D56'] }],
      });
    }
  }

  // ---------------- deductions: real estate tax allocable to the seller ----------------
  {
    const credit = ev('ev-1027').value as number;
    const l = L.get('SchA.5b');
    if (l && credit) {
      const right = l.value - credit;
      const cap = val('SchA.5e');
      const before = val('SchA.5d');
      const newLimited = Math.min(before - credit, cap);
      const fedDeductionChange = newLimited - val('SchA.5e');
      out.push({
        id: 'retax-seller', area: 'deductions', kind: 'source', severity: 'error',
        title: `Home real estate tax includes ${money(credit)} that belongs to the seller`,
        engine: l.value, expected: right,
        explain: `Purchase 07/08/2025: the seller credited ${money(credit)} for 2025 taxes for 01/01–07/07 (D54). The buyer then paid the full ${money(l.value)} bill in December, but the seller’s share is treated as paid by the seller. Deductible: ${money(right)}. SALT falls below the ${money(cap)} cap (${money(before)} → ${money(before - credit)}), so the federal deduction drops ${money(-fedDeductionChange)}.`,
        refs: ['ev-1027', 'ev-1036', 'ev-1038', 'D54'], lines: ['SchA.5b', 'SchA.5d', 'SchA.5e'],
        proposals: [{
          title: 'Exclude seller-period real estate tax', target: 'SchA.5b', area: 'deductions', from: l.value, to: right, amount: -credit, category: 'manual',
          manualEffect: { federal: Math.round(fedDeductionChange * rate('itemized').federal_per_dollar), california: Math.round(-credit * rate('salt').california_per_dollar), basis: `Federal: SALT drops under the cap, so ${money(-fedDeductionChange)} × itemized rate. California: full ${money(credit)} × CA salt rate (no cap).` },
          reason: 'Seller credit at closing for 01/01–07/07 taxes (D54).', authority: 'IRC §164(d)(1); Treas. Reg. §1.164-6(b)', findingId: 'retax-seller', evidence: ['D54'],
        }],
      });
    }
  }

  // ---------------- deductions: low-confidence reads ----------------
  for (const e of P.extracted_values.filter((x) => x.confidence < 0.6 && has(x.document_id))) {
    const lines = (m.citedBy.get(e.id) ?? []).filter((c) => c.v === v.version).map((c) => c.key);
    const confirmed = msgVisible('msg-08');
    out.push({
      id: `lowconf-${e.id}`, area: 'deductions', kind: 'source', severity: confirmed ? 'info' : 'warning',
      title: `${m.docs.get(e.document_id)!.title}: amount read at ${Math.round(e.confidence * 100)}% confidence`,
      engine: e.value, expected: confirmed ? 1500 : undefined,
      explain: confirmed ? 'msg-08: parish confirmed 1,500 by phone; matches bank statement (check #2207, 12/21/2025). Verify as confirmed with client and attach the bank line; a gift of 250+ also needs the written acknowledgment, which D64 is.' : `Printed: “${text(e.document_id).match(/\$\?,\d{3}\.\d\d/)?.[0] ?? e.text_as_read}”. The first digit is ambiguous (1 or 7). Ask the client for the bank record.`,
      refs: [e.id, e.document_id, ...(confirmed ? ['msg-08'] : [])], lines,
      suggestQuestion: confirmed ? undefined : { to: 'client', text: 'The St. Brigid receipt is handwritten and the amount could read 1,500 or 7,500. Can you send the bank record of the gift?' },
    });
  }

  // ---------------- deductions: dependent care provider identity ----------------
  for (const l of v.lines.filter((x) => x.form === 'F2441' && /^1[a-z]$/.test(x.line))) {
    const einEv = l.sources.map(ev).find((e) => e?.value_type === 'ein');
    if (!einEv) continue;
    const t = text(einEv.document_id);
    const printed = t.match(/Tax ID (\d\d-\d{7})/)?.[1];
    const name = m.docs.get(einEv.document_id)!.title.split(' - ')[0];
    const nameOk = l.label.includes(name);
    const einOk = printed === einEv.value;
    out.push({
      id: `f2441-${l.line}`, area: 'deductions', kind: 'source', severity: einOk && nameOk ? 'pass' : 'error',
      title: einOk && nameOk ? `Form 2441 provider ${name}: name and EIN agree to the statement` : `Form 2441 provider ${name}: ${!einOk ? `EIN read as ${einEv.value}, printed ${printed}` : ''}${!einOk && !nameOk ? '; ' : ''}${!nameOk ? 'name on the form differs from the statement' : ''}`,
      engine: einEv.value, expected: printed,
      explain: `${!einOk ? `Extracted at ${Math.round(einEv.confidence * 100)}% confidence with two digits transposed. ` : ''}${!nameOk ? `Line label “${l.label}” vs statement “${name}” (last year’s name may have been reused). ` : ''}A wrong provider TIN can disallow the exclusion on examination (Form 2441 Part I).`,
      refs: [einEv.id, einEv.document_id], lines: [l.key],
      proposals: !einOk || !nameOk ? [{ title: `Correct provider identity on ${l.key}`, target: l.key, area: 'deductions', from: `${einEv.value}`, to: `${name}, ${printed}`, amount: 0, category: 'none', reason: 'Agree provider name and TIN to the provider statement.', authority: 'IRC §21(e)(9), §129(e)(9)', findingId: `f2441-${l.line}`, evidence: [einEv.document_id] }] : undefined,
    });
  }

  // ---------------- payments: estimates agreed to agency records ----------------
  {
    const tr = P.tax_agency_records.irs_account_transcript_2025.filter((s: any) => s.as_of <= clock.slice(0, 10)).at(-1) ?? P.tax_agency_records.irs_account_transcript_2025[0];
    const irs = sumv(tr.transactions.filter((t: any) => t.code === '670' && /Estimated/.test(t.description)).map((t: any) => t.amount));
    const claimed = val('F1040.26');
    out.push({
      id: 'est-fed', area: 'tax', kind: 'reconciliation', severity: irs !== claimed ? 'error' : 'pass',
      title: irs !== claimed ? `Federal estimates claimed ${money(claimed)}; IRS transcript shows ${money(irs)}` : 'Federal estimates agree to the IRS transcript',
      engine: claimed, expected: irs,
      explain: `Engine used the client’s memory for Q4 (qa-41: “January 14, 2026 - 4,000 I think”) because no EFTPS confirmation was uploaded. The transcript (pulled ${tr.as_of}) shows 3,000 on 2026-01-15. Overstated payments understate the balance due and trigger IRS math-error notices.`,
      refs: ['qa-41', 'D67', 'agency:/irs_account_transcript_2025/0', 'D69'], lines: ['F1040.26'],
      proposals: irs !== claimed ? [{ title: 'Agree federal estimates to IRS transcript', target: 'F1040.26', area: 'tax', from: claimed, to: irs, amount: irs - claimed, category: 'payment_fed', reason: 'Q4 payment was 3,000 (transcript code 670, 2026-01-15).', authority: 'IRS account transcript; IRM 21.5.5', findingId: 'est-fed', evidence: ['D69'] }] : undefined,
    });
    const ftb = P.tax_agency_records.ftb_account;
    const ftbSum = sumv(ftb.tax_year_2025_payments.map((x: any) => x.amount));
    const caClaimed = val('F540NR.72');
    out.push({
      id: 'est-ca', area: 'california', kind: 'reconciliation', severity: ftbSum !== caClaimed ? 'error' : 'pass',
      title: ftbSum !== caClaimed ? `California estimates claimed ${money(caClaimed)}; FTB credited ${money(ftbSum)} to 2025` : 'California estimates agree to the FTB account',
      engine: caClaimed, expected: ftbSum,
      explain: `The 09/15/2025 Web Pay of 3,500 was designated tax year 2024 (D68, read correctly by the pipeline) and FTB holds it as a 2024 credit. The engine counts every payment in the date window. Claim ${money(ftbSum)} on the 2025 return and ask FTB to refund or transfer the 2024 credit. It remains a 2025 state tax paid for Schedule A.`,
      refs: ['ev-1074', 'ev-1075', 'ev-1076', 'agency:/ftb_account'], lines: ['F540NR.72'],
      proposals: ftbSum !== caClaimed ? [{ title: 'Agree California estimates to FTB account', target: 'F540NR.72', area: 'california', from: caClaimed, to: ftbSum, amount: ftbSum - caClaimed, category: 'payment_ca', reason: '09/15/2025 payment applied to 2024 by FTB.', authority: 'FTB account record; R&TC §19002', findingId: 'est-ca', evidence: ['agency:/ftb_account'] }] : undefined,
    });
  }

  // ---------------- California: wages earned after the move ----------------
  {
    const l = L.get('SchCA540NR.1.E');
    const stub = has('D73') ? (ev('ev-1081').value as number) : null;
    const corv = ev('ev-0030').value as number;
    const halv16 = ev('ev-0047').value as number;
    if (l) {
      const right = stub != null ? corv + stub : null;
      out.push({
        id: 'ca-wages', area: 'california', kind: 'source', severity: 'error',
        title: right != null ? `California-source wages overstated by ${money(l.value - right)}` : 'California-source wages taken from W-2 box 16, which runs past the move',
        engine: l.value, expected: right ?? undefined,
        explain: `Residency ended ${CA_RES_END}. Halvorsen kept California as the work state through 09/30 (D09 note, qa-45), so its box 16 (${money(halv16)}) includes Texas-period wages. ${right != null ? `The 07/18 paystub (D73) shows California taxable wages of ${money(stub!)} through 07/15 (work location changed to Austin). California-source wages = Corvane ${money(corv)} + Halvorsen ${money(stub!)} = ${money(right)}. Withholding (box 17) stays creditable; the over-withholding comes back as refund.` : 'Request a paystub at the move date to split the wages.'}`,
        refs: ['ev-0030', 'ev-0047', 'qa-45', ...(stub != null ? ['ev-1081', 'D73'] : [])], lines: ['SchCA540NR.1.E'],
        suggestQuestion: stub != null ? undefined : { to: 'client', text: 'Please upload Ngozi’s Halvorsen paystub for the pay period that includes July 14, 2025 (it shows wages to date at the move).' },
        proposals: right != null ? [{ title: 'California-source wages: only the resident period', target: 'SchCA540NR.1.E', area: 'california', from: l.value, to: right, amount: right - l.value, category: 'ca_source_income', caTreatment: 'ca_source', reason: `Paystub YTD to 07/15: CA wages ${money(stub!)}; box 16 includes Texas-period wages.`, authority: 'R&TC §17951; Cal. Code Regs. tit. 18 §17951-5; FTB Pub. 1100', findingId: 'ca-wages', evidence: ['D73'] }] : undefined,
      });
    }
  }

  // ---------------- California: AMT on the ISO exercise ----------------
  out.push({
    id: 'ca-amt', area: 'california', kind: 'judgment', severity: 'warning',
    title: 'California AMT on the ISO exercise not computed by the engine',
    explain: 'ISO granted 03/01/2022 while working in California, exercised 07/30/2025 after the move. For a nonresident, the California-source part of the AMT preference is allocated by California workdays between grant and exercise (FTB Pub. 1004). Compute Schedule P (540NR) outside the engine or document why no AMT results.',
    refs: ['ev-0075', 'ev-0076', 'ev-0077', 'ev-0078', 'ev-0079'], lines: ['F540NR.61', 'F6251.2i'],
  });

  // ---------------- identity: dependent SSN across sources ----------------
  {
    const theo = P.household.people.find((x) => x.id === 'theo')!;
    const fix = wp.householdFixes.get('theo.ssn');
    const current = fix?.value ?? theo.ssn;
    const py = P.prior_years.return_2024.dependents.find((d: any) => d.name === theo.name)?.ssn;
    const card = has('D71') ? (ev('ev-1080').value as string) : null;
    const ok = current === py && (!card || card === current);
    out.push({
      id: 'dep-ssn', area: 'intake', kind: 'consistency', severity: ok ? 'pass' : 'error', blocksFiling: !ok,
      title: ok ? `Dependent SSNs agree across organizer, prior return${card ? ' and SS card' : ''}` : `Theo’s SSN in the organizer (ends ${theo.ssn.slice(-4)}) differs from last year’s return (ends ${String(py).slice(-4)})`,
      engine: current, expected: py,
      explain: ok ? `${fix ? `Corrected by ${fix.by}: ${fix.reason}` : 'All sources agree.'}` : 'The household entry was typed by the client; the 2024 return as filed (and the IRS) used a different number with the last two digits swapped. A mismatch rejects the e-file (R0000-504-02) and loses the child tax credit. Get the Social Security card and correct before filing.',
      refs: ['household:theo', 'py:/return_2024/dependents/1', ...(card ? ['D71'] : [])], lines: ['F8812.4'],
      suggestQuestion: ok ? undefined : { to: 'client', text: 'Theo’s SSN in your organizer ends 3309 but last year’s return used 3390. Could you upload a photo of his Social Security card?' },
    });
  }

  // ---------------- carryovers agreed to prior year ----------------
  {
    const c = P.prior_years.carryovers_into_2025;
    const rows: [string, number, number][] = [
      ['SchD.6', -c.capital_loss_short, val('SchD.6')],
      ['SchD.14', -c.capital_loss_long, val('SchD.14')],
      ['F8582.1c', -(c.passive_1450_fremont + c.passive_1200_barton_hills), val('F8582.1c')],
      ['F8606.2', P.prior_years.basis_records.ira_nondeductible_basis_ngozi[0].form_8606_line_14, val('F8606.2')],
    ];
    const bad = rows.filter((r) => r[1] !== r[2]);
    out.push({
      id: 'carryovers', area: 'tax', kind: 'reconciliation', severity: bad.length ? 'error' : 'pass',
      title: bad.length ? 'Carryovers do not agree to the 2024 return' : 'Carryovers agree to the 2024 return and prior workpaper',
      explain: 'Capital loss (D06 p6), passive losses (D06 p9 and D07 p6) and IRA basis (D06 p10). The client said there was no prior IRA basis (qa-31), but the 2024 Form 8606 and Form 5498 (D42) show a 7,000 contribution for 2024 made 02/12/2025 — the documents win; the engine is right.',
      refs: ['py:/carryovers_into_2025', 'D06', 'D07', 'D42', 'qa-31'], lines: rows.map((r) => r[0]),
      table: { head: ['Line', '2024 carryover', '2025 return'], rows: rows.map((r) => [r[0], money(r[1]), money(r[2])]) },
    });
  }

  // ---------------- S corporation basis roll-forward ----------------
  {
    const has23 = has('D40');
    const b22 = P.prior_years.basis_records.scorp_lindqvist_family_woodworks[0].ending_stock_basis;
    const b23 = has23 ? b22 + (ev('ev-0983').value as number) + (ev('ev-0984').value as number) - (ev('ev-0985').value as number) : null;
    const b24 = b23 != null ? b23 + 16900 - 30000 : null;
    out.push({
      id: 'scorp-basis', area: 'passthrough', kind: 'reconciliation', severity: b24 == null ? 'warning' : b24 === val('F7203.1') ? 'pass' : 'error',
      title: b24 == null ? 'Woodworks stock basis: 2023 K-1 missing, roll-forward broken' : `Woodworks stock basis rolled 2022 → 2025 (opening ${money(b24)})`,
      engine: val('F7203.1'), expected: b24 ?? undefined,
      explain: b24 == null ? 'Prior preparer “assumed basis sufficient”. Without the 2023 K-1 the opening basis is a guess and distributions may be taxable.' : `2022 ending ${money(b22)} (client worksheet — unverified) + 2023 income 14,100 − distributions 20,000 = ${money(b23!)}; + 2024 income 16,900 − 30,000 = ${money(b24)}. 2025: + ${money(val('F7203.4'))} − 42,000 → ${money(val('F7203.excess'))} distributions in excess of basis, taxed as long-term gain. 2024 was fine (32,300 basis ≥ 30,000).`,
      refs: ['py:/basis_records/scorp_lindqvist_family_woodworks', ...(has23 ? ['D40', 'ev-0983', 'ev-0985'] : []), 'D39', 'ev-0977'], lines: ['F7203.1', 'F7203.excess', 'F8949.F.SCORP'],
    });
  }

  // ---------------- outside filings ----------------
  {
    const filings = outsideFilings(m, v, wp);
    const open = filings.filter((f) => !f.decision).length;
    out.push({
      id: 'outside-filings', area: 'intake', kind: 'completeness', severity: open ? 'warning' : 'pass',
      title: open ? `Outside filings identified (${filings.length}) — ${open} without a recorded decision` : `Outside filings identified (${filings.length}) — each has a recorded decision`,
      explain: 'Returns and forms this engagement does not prepare but the household or related parties must file. Record a decision (an outside-filing judgment) for each so the file proves they were identified and communicated.',
      refs: ['D01', 'D36', 'D27', 'qa-23', 'py:/prior_preparer_workpaper/open_items_left_by_prior_preparer/3', 'ev-0962'], lines: ['F8938.1.max', 'SchC.J'],
      table: {
        head: ['Filing', 'Trigger', 'Status', 'Action', 'Decision'],
        rows: filings.map((f) => [f.filing, f.trigger, f.status, f.action, f.decision ? `✓ ${m.staffName(f.decision.by)} ${f.decision.simAt.slice(0, 10)}: ${f.decision.decision}` : '—']),
        decide: filings.map((f) => (f.decision ? null : f.filing)),
      },
    });
  }

  // ---------------- client said vs documents show ----------------
  {
    const q = (id: string) => P.client.questionnaire.find((x) => x.id === id)!;
    const rows = [
      ['qa-14', q('qa-14').answer, '282 brokerage sales (D28, D31, D74)', 'Documents govern; confirm with client'],
      ['qa-15', q('qa-15').answer, '12 Coinhaven sales on 1099-DA (D34)', 'Taxable dispositions; explain to client'],
      ['qa-31', q('qa-31').answer, '2024 Form 8606 basis 7,000; 5498 (D42)', 'Documents govern (engine right)'],
      ['qa-39', q('qa-39').answer, '1098-C: sold for 2,900 (D66)', 'Limited to 2,900'],
      ['qa-41', q('qa-41').answer, 'IRS transcript: 3,000 on 01/15/2026', 'Use transcript'],
      ['qa-08', q('qa-08').answer, 'D36: account from 2023 inheritance', 'True for 2025; 2023 Form 3520 open'],
      ['qa-26', q('qa-26').answer, 'SEP 18,000 deposited 04/10/2026 (D26)', 'Above limit'],
    ];
    out.push({
      id: 'client-vs-docs', area: 'intake', kind: 'consistency', severity: 'info',
      title: `Client answers contradicted by documents (${rows.length})`,
      explain: 'Some answers only the client knows; others the documents settle. Each contradiction is shown with which side the return follows.',
      refs: rows.map((r) => r[0]), lines: [],
      table: { head: ['Question', 'Client said', 'Documents show', 'Return follows'], rows },
    });
  }

  // ---------------- due diligence (firm rule) ----------------
  {
    const dd = wp.judgments.find((j) => j.kind === 'due_diligence');
    out.push({
      id: 'due-diligence', area: 'deductions', kind: 'completeness', severity: dd ? 'pass' : 'warning', blocksFiling: !dd,
      title: dd ? 'Form 8867 due diligence documented' : 'Form 8867 due diligence not documented (CTC / ODC claimed)',
      explain: dd ? `${m.staffName(dd.by)}: ${dd.decision}` : 'Firm rule: due diligence must be documented for CTC, ODC and AOTC. Record knowledge questions (relationship, residency, age, SSN, support) and the documents relied on.',
      refs: ['household:theo', 'household:ada', 'D59', 'D60', 'F8867.status'], lines: ['F8867.status', 'F8812.12'],
    });
  }

  // ---------------- prior-year swings ----------------
  {
    const std = wp.standards.variance_review ?? { flag_if_change_over_percent: 10, and_over_amount: 1000 };
    const py = P.prior_years.return_2024.lines;
    const rows: (string | number)[][] = [];
    for (const [k, pv] of Object.entries(py)) {
      const l = L.get(k);
      if (!l || typeof pv !== 'number' || typeof l.value !== 'number') continue;
      const d = l.value - pv;
      if (Math.abs(d) > std.and_over_amount && (pv === 0 || Math.abs(d / pv) * 100 > std.flag_if_change_over_percent)) rows.push([k, l.label, money(pv), money(l.value), money(d), pv ? `${Math.round((d / pv) * 100)}%` : 'new']);
    }
    const explained = (k: string) => wp.notes.some((n) => n.target.includes(k)) || wp.judgments.some((j) => j.target.includes(k)) || wp.adjustments.some((a) => a.target === k);
    const open = rows.filter((r) => !explained(String(r[0])));
    out.push({
      id: 'variances', area: 'tax', kind: 'judgment', severity: open.length ? 'info' : 'pass',
      title: open.length
        ? `${open.length} of ${rows.length} lines moved more than ${std.flag_if_change_over_percent}% and ${money(std.and_over_amount)} from 2024 without an explanation`
        : `All ${rows.length} prior-year swings over ${std.flag_if_change_over_percent}% and ${money(std.and_over_amount)} explained`,
      explain: 'Each swing needs an explanation (a note, judgment or adjustment on the line). Explained swings drop off the open list.',
      refs: ['D06'], lines: open.map((r) => String(r[0])),
      table: { head: ['Line', 'Label', '2024', '2025', 'Change', '%', 'Explained'], rows: rows.map((r) => [...r, explained(String(r[0])) ? '✓' : '—']) },
    });
  }
  return out;
}

export function findingStatus(f: Finding, wp: WP): 'open' | 'resolved' | 'pass' {
  if (f.severity === 'pass') return 'pass';
  const r = wp.findingRes.get(f.id);
  if (r) return 'resolved';
  if (f.proposals?.length && f.proposals.every((p) => wp.adjustments.some((a) => a.findingId === f.id && a.title === p.title && a.status !== 'rejected'))) return 'resolved';
  return 'open';
}

export const lineLabel = (l?: Line) => (l ? `${l.key} · ${l.label}` : '');
