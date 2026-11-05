import { AREAS, lineArea, type Model } from '../data/model';
import { runChecks } from '../logic/checks';
import { areaSnapshot, snapHash } from '../logic/rules';
import { fold } from './fold';
import { adjEffect, biggest } from '../logic/effects';
import type { LEvent } from './types';

/**
 * A plausible season of work by the firm's staff up to July 2, 2026 (the "now" of the packet),
 * built from the independent checks' own proposals. Load it to see a worked file; reset to start empty.
 */
export function buildSeed(m: Model): LEvent[] {
  const out: LEvent[] = [];
  let n = 0;
  const std = m.p.firm.starter_standards;
  const add = (simAt: string, actor: string, type: LEvent['type'], target: string[] | undefined, payload: any, batch?: string) => {
    const e: LEvent = { id: `seed-${String(++n).padStart(4, '0')}`, at: simAt, simAt, actor, type, target, payload, batch };
    out.push(e);
    return e;
  };
  const P = 'st-01', R = 'st-02', PT = 'st-03', ADM = 'st-05', MB = 'st-04';
  const findingsAt = (clock: string) => {
    const v = m.versionAt(clock)!;
    return { v, f: runChecks(m, v, fold(out, clock, std), clock) };
  };
  const propose = (simAt: string, id: string, actorId = P) => {
    const { f } = findingsAt('2026-07-02T12:00:00Z');
    const fd = f.find((x) => x.id === id);
    const ids: string[] = [];
    const batch = `b-${id}`;
    for (const p of fd?.proposals ?? []) ids.push(add(simAt, actorId, 'adjust', [p.target], p, batch).id);
    return ids;
  };

  // --- assignments (firm administrator)
  for (const a of AREAS)
    add('2026-03-09T14:00:00Z', ADM, 'assign', [a.id], { area: a.id, set: { preparer: a.id === 'rentals' ? P : P, reviewer: R, partner: PT, due: '2026-03-27' } }, 'b-assign');
  add('2026-03-24T15:30:00Z', ADM, 'assign', ['deductions'], { area: 'deductions', set: { support: MB } });

  // --- intake
  add('2026-03-09T15:20:00Z', P, 'verify', ['D04', 'D05'], { method: 'agreed_to_source_document', note: 'Texas licenses match names and DOB in organizer; addresses support the 07/15 move.' });
  add('2026-03-09T15:40:00Z', P, 'verify', ['D06'], { method: 'agreed_to_source_document', note: 'Reviewed 2024 return as filed (Delta River). Carryovers and basis taken from D06 p6, p9, p10.' });
  add('2026-03-09T15:45:00Z', P, 'disposition', ['D01', 'D02'], { status: 'engagement', note: 'Engagement letter and §7216 consent signed 01/12/2026. Scope excludes FBAR, 1099s, other states, gift tax.' });
  add('2026-03-09T15:46:00Z', P, 'disposition', ['D03'], { status: 'used_for_filing', note: 'IP PIN for Ngozi; entered on e-file (masked).' });
  add('2026-03-09T15:47:00Z', P, 'disposition', ['D07'], { status: 'reviewed', note: 'Narrative; carryovers, depreciation and basis reproduced in prior_years and agreed. Open items carried to this file.' });
  add('2026-03-09T15:48:00Z', P, 'disposition', ['D10'], { status: 'duplicate', note: 'Phone photo of D09: identical EIN and amounts. Counted once (engine agrees).' });
  add('2026-03-09T15:49:00Z', P, 'disposition', ['D13'], { status: 'supporting', note: 'Form 3922 (2024 purchase): price 25.50 × 150 supports ESPP basis; disqualifying disposition income 675 is in W-2 box 14.' });
  add('2026-03-09T15:50:00Z', P, 'disposition', ['D70'], { status: 'reviewed', note: '2023 CP2000 resolved 11/18/2024 with no change; no 2025 effect. Lesson: broker basis gaps get noticed — see RSU lots.' });

  // --- wages
  add('2026-03-10T16:00:00Z', P, 'verify', ['F1040.1a', 'F1040.25a', 'F8959.1', 'F2441.12'], { method: 'agreed_to_source_document', note: 'Agreed to D08 and D09 boxes 1, 2, 5, 10. D10 duplicate excluded.', evidence: ['D08', 'D09'] });
  add('2026-03-10T16:05:00Z', P, 'verify', ['Sch3.11'], { method: 'recalculated', note: 'Box 4 6,944 + 7,316 − 10,918 = 3,342.' });
  add('2026-03-10T16:10:00Z', P, 'verify', ['F6251.2i'], { method: 'recalculated', note: 'Form 3921: 1,000 sh × (52.00 − 12.00) = 40,000. Shares still held (qa-06): track AMT basis 52,000 for the future sale.', evidence: ['D12'] });
  add('2026-03-10T16:12:00Z', P, 'verify', ['F8889.9', 'F8889.13'], { method: 'agreed_to_third_party_record', note: '5498-SA 6,000 all employer; under 8,550 family limit.', evidence: ['D45'] });

  // --- investments
  add('2026-03-10T17:00:00Z', P, 'verify', ['SchD.6', 'SchD.14', 'F8606.2'], { method: 'agreed_to_prior_year', note: 'Agreed to D06 p6 and p10, D07 p6.' });
  const lots = m.version('v1').lines.filter((l) => l.form === 'F8949' && /\.X\d+$/.test(l.key)).map((l) => l.key);
  add('2026-03-11T15:00:00Z', P, 'verify', lots, { method: 'recalculated', note: `Bulk: ${lots.length} Brightpath lots recalculated (proceeds − basis + wash adjustment) and footed to the 1099-B summary (ST 139,615.96 / LT 195,112.56). Exceptions reviewed separately.`, evidence: ['D74'] }, 'b-lots');
  propose('2026-03-11T16:00:00Z', 'int-dup');
  propose('2026-03-11T16:10:00Z', 'fx-SchB.1.6');
  propose('2026-03-11T16:30:00Z', 'rsu-basis');
  add('2026-03-11T16:40:00Z', P, 'question', ['F8949.H.C6'], { to: 'client', area: 'investments', text: 'Coinhaven shows 0.05 BTC transferred in on 06/01/2025 and sold 06/18/2025. Where and when was it originally bought, and what did it cost? A bank or exchange statement is ideal.' });
  add('2026-03-11T16:45:00Z', P, 'question', ['qa-14'], { to: 'client', area: 'investments', text: 'Your organizer says no investments were sold, but we have 282 brokerage sales (mostly the Brightpath direct-indexing account) and 12 crypto sales. Can you confirm these are all yours and that there are no other accounts?' });
  add('2026-03-12T17:00:00Z', 'cu-01', 'answer', [], { questionId: out.at(-1)!.id, text: 'Yes, those are ours — I did not think of the automatic Brightpath trades as "selling". No other accounts.' });
  add('2026-03-20T15:00:00Z', P, 'disposition', ['D30'], { status: 'superseded', note: 'Superseded by corrected D31 (M6 wash sale 735→512, M9 basis 6,900→4,880, M14 acquisition date → long-term).' });
  propose('2026-03-20T15:30:00Z', 'broker-D31');

  // --- business
  propose('2026-03-11T17:00:00Z', 'schc-gross');
  propose('2026-03-11T17:10:00Z', 'mileage');
  propose('2026-03-11T17:20:00Z', 'sehi');
  add('2026-03-11T17:30:00Z', P, 'question', ['SchC.25'], { to: 'client', area: 'business', text: 'What share of the family phone plan and home internet is used for the studio? Is anything in Software (e.g. Spotify) personal?' });
  const qPhone = out.at(-1)!.id;
  add('2026-03-26T17:45:00Z', P, 'answer', [], { questionId: qPhone, text: 'Answered on the 03/26 call (call-01): phone 70% business, internet 50%, Spotify personal.' });
  propose('2026-03-26T18:00:00Z', 'mixed-use');
  add('2026-03-26T18:05:00Z', P, 'verify', ['SchC.30'], { method: 'recalculated', note: 'Monthly average 240 sq ft (220 Jan–Jun, 260 Jul–Dec). Prior preparer’s 300 sq ft not supported.', evidence: ['D24'] });
  add('2026-03-26T18:10:00Z', P, 'question', ['F4562-C.14'], { to: R, area: 'business', text: 'Studio equipment: engine took 100% bonus. What-if shows §179 gives the same federal result and saves California 1,050 (CA allows §179 up to 25,000 but no bonus). Elect §179?' });
  const q179 = out.at(-1)!.id;
  add('2026-03-30T15:00:00Z', R, 'answer', [], { questionId: q179, text: 'Yes — elect §179 on the full 38,000. Business income limit is met, no federal cost, CA saves 1,050. Document as an election.' });
  add('2026-03-30T15:20:00Z', P, 'judgment', ['F4562-C.12', 'F4562-C.14'], { area: 'business', kind: 'election', title: 'Elect §179 for studio equipment instead of bonus depreciation', decision: 'Elect §179 on printer, camera system and workstation (38,000). Federal unchanged; California −1,050.', authority: 'IRC §179(b)(3) income limit; R&TC §17255; reviewer answer 03/30', alternatives: 'Bonus (engine default); regular MACRS (+10,245 federal)', whatIf: 'equipment_section179' });
  add('2026-03-30T15:21:00Z', P, 'adjust', ['F4562-C.12'], { title: 'Elect §179 for studio equipment', target: 'F4562-C.12', area: 'business', from: 0, to: 38000, amount: 0, category: 'manual', whatIf: 'equipment_section179', reason: 'Election per reviewer: same federal result, California saves 1,050.', authority: 'IRC §179; R&TC §17255' });

  // --- rentals
  add('2026-03-12T15:00:00Z', P, 'verify', ['SchE.3A', 'SchE.11A', 'SchE.12A', 'SchE.16A'], { method: 'agreed_to_source_document', note: 'Owner statement D46, 1098 D48, tax bills D49 (escrow). Insurance 1,850 per client (qa-36) — not yet seen a policy.' });
  add('2026-03-12T15:10:00Z', P, 'verify', ['F4797.25', 'SchD.19', 'F8582.1c'], { method: 'recalculated', note: 'Gain from closing statement and depreciation schedule; suspended losses released on full disposition.' });
  propose('2026-03-26T18:20:00Z', 'hvac');

  // --- deductions
  propose('2026-03-12T16:00:00Z', 'car-gift');
  propose('2026-03-12T16:10:00Z', 'mortgage-dup');
  propose('2026-03-12T16:20:00Z', 'retax-seller');
  propose('2026-03-12T16:30:00Z', 'f2441-1b');
  propose('2026-03-12T16:31:00Z', 'f2441-1a');
  add('2026-03-12T16:40:00Z', P, 'question', ['ev-1049'], { to: 'client', area: 'deductions', text: 'The St. Brigid receipt is handwritten and the amount could read 1,500 or 7,500. Can you send the bank record of the gift?' });
  const qBrigid = out.at(-1)!.id;
  add('2026-03-27T15:00:00Z', P, 'judgment', ['F8867.status', 'F8812.12'], { area: 'deductions', kind: 'due_diligence', title: 'Form 8867 knowledge — CTC (Theo) and ODC (Ada)', decision: 'Theo: son, 8, lived with taxpayers 12 months, US citizen; SSN to be agreed to card. Ada: daughter, 19, full-time student (1098-T box 8), home except while at school (temporary absence); her own W-2 4,100 does not provide over half her support; her own return checks “can be claimed”. AOTC fully phased out — not claimed. No HOH/EIC.', authority: 'IRC §6695(g); Treas. Reg. §1.6695-2', alternatives: '' });
  add('2026-03-27T15:05:00Z', P, 'judgment', ['F1040.12'], { area: 'deductions', kind: 'election', title: 'Itemize rather than take the standard deduction', decision: 'Itemize. Engine what-if: standard deduction costs 12,306 federal.', authority: 'IRC §63(e)', whatIf: 'standard_deduction' });
  add('2026-03-27T15:06:00Z', P, 'judgment', ['F1040.38', 'F2210.19'], { area: 'tax', kind: 'penalty', title: 'Underpayment penalty method', decision: 'Regular method. Annualized method gives the same 164 (engine what-if penalty_annualized); not worth Schedule AI. Prior-year 110% safe harbor (41,313) was missed by payments of 25,400 withholding + 12,000 estimates.', authority: 'IRC §6654(d)', whatIf: 'penalty_annualized' });

  // --- tax and payments
  propose('2026-03-12T17:00:00Z', 'est-fed');
  add('2026-03-12T17:01:00Z', P, 'disposition', ['D69'], { status: 'third_party', note: 'Transcript pulled by firm 03/12; used to agree estimated payments.' });

  // --- California
  propose('2026-03-13T15:00:00Z', 'est-ca');
  add('2026-03-13T15:05:00Z', P, 'question', ['F540NR.72'], { to: R, area: 'california', text: 'FTB holds the 09/15/2025 3,500 as a 2024 credit. Should we ask FTB to transfer it to 2025 or let it refund?' });
  const qFtb = out.at(-1)!.id;
  add('2026-03-16T15:00:00Z', R, 'answer', [], { questionId: qFtb, text: 'Claim only what FTB shows for 2025; send FTB a letter requesting the 2024 credit be refunded. Tell the client it is not lost.' });
  add('2026-03-27T18:00:00Z', P, 'disposition', ['D73'], { status: 'supporting', note: 'Paystub at the move: California wages YTD 22,469 through 07/15. Used for the California wage split.' });
  propose('2026-03-27T18:05:00Z', 'ca-wages');

  // --- outside filings and diagnostics
  for (const [title, decision] of [
    ['FinCEN 114 (FBAR) for 2025', 'Outside engagement (D01). Max balance 149,567 USD. Emailed client 03/27: FBAR due 10/15/2026; 2024 was self-filed.'],
    ['Form 3520 for 2023 (foreign inheritance)', 'Account opened 09/2023 with inheritance from Birgitta Lindqvist (> 100,000). Prior preparer left it open. Advised client 03/27 to file late 3520 with reasonable-cause statement; referred to international specialist; outside engagement.'],
    ['Forms 1099-NEC for 2025 contractors', 'Mara Quintero 4,800 and Dev Patel 2,600 paid by ACH. Due 02/02/2026, not filed. Advised client to file now; Schedule C line J answered “No”. Outside engagement.'],
  ])
    add('2026-03-27T16:00:00Z', P, 'judgment', [], { area: 'intake', kind: 'outside_filing', title, decision, authority: 'Engagement letter D01 scope' });
  const diag = (code: string, decision: string, at: string, by = P) => add(at, by, 'judgment', [code], { area: 'tax', kind: 'diagnostic', title: `Engine diagnostic ${code}`, decision });
  diag('FORM_1099_FILING', 'Client advised to file late 1099-NECs (see outside filings).', '2026-03-27T16:10:00Z');
  diag('DUE_DILIGENCE_REQUIRED', 'Form 8867 knowledge documented 03/27.', '2026-03-27T16:11:00Z');
  diag('QUESTIONNAIRE_SALES_CONFLICT', 'Documents govern; client confirmed the Brightpath trades are theirs (answer 03/12).', '2026-03-27T16:12:00Z');
  diag('BROKER_SUMMARY_DETAIL_MISMATCH', 'Difference 250 = M18 on the unread page 32 (cash in lieu). Added.', '2026-03-20T15:31:00Z');
  diag('HOME_OFFICE_AREA_CHANGE', 'Recomputed 240 sq ft from D24; 2024’s 300 was unsupported.', '2026-03-27T16:13:00Z');
  diag('SCORP_BASIS_INCOMPLETE', 'Resolved by 2023 K-1 (D40) received 06/05; basis rolled forward.', '2026-06-24T15:00:00Z');
  diag('K1_EXPECTED_NOT_RECEIVED', 'Ridgeline K-1 received 06/22 (D37, D38).', '2026-06-24T15:01:00Z');
  diag('CA_AMT_NOT_COMPUTED', 'Engine limitation. Schedule P (540NR) to be computed in the state module before transmission; ISO spread allocated by California workdays grant→exercise. Partner to review.', '2026-06-29T15:00:00Z', R);

  // --- time
  const hours: [string, number][] = [['intake', 1.2], ['wages', 2.4], ['investments', 5.6], ['business', 4.1], ['rentals', 2.6], ['passthrough', 1.2], ['deductions', 2.3], ['california', 2.2], ['tax', 0.8]];
  for (const [area, h] of hours) add('2026-03-27T22:00:00Z', P, 'time', [area], { area, hours: h, note: 'Preparation' }, 'b-time');

  // --- preparer sign-offs (end of March)
  const signAll = (simAt: string, by: string, level: 'preparer' | 'reviewer' | 'partner', areas: string[]) => {
    for (const a of areas) {
      const clock = simAt;
      const { v, f } = findingsAt(clock);
      const wp = fold(out, clock, std);
      const snap = areaSnapshot(m, v, wp, a, f, clock);
      add(simAt, by, 'signoff', [a], { area: a, level, hash: snapHash(snap), snapshot: snap });
    }
  };

  // --- review (early April)
  const rsuAdj = out.filter((e) => e.type === 'adjust' && e.payload.findingId === 'rsu-basis');
  add('2026-04-06T15:00:00Z', R, 'note', rsuAdj.map((e) => e.payload.target), { area: 'investments', kind: 'review', blocking: true, text: 'Tie the RSU basis to W-2 box 14 (38,200) and share counts on the 1099-B before I approve. N4 vested 2023 — confirm 9,420 was in 2023 wages.' });
  const nRsu = out.at(-1)!.id;
  add('2026-04-06T18:00:00Z', P, 'note_reply', [], { noteId: nRsu, text: 'Box 14 RSU 38,200 = 400 × 47.75 × 2 (2025 vests). N4 300 sh × 31.40 = 9,420 from the 2023 vest; shares agree to 1099-B detail.' });
  add('2026-04-07T14:00:00Z', R, 'note_status', [], { noteId: nRsu, status: 'resolved' });
  add('2026-04-06T15:10:00Z', R, 'note', ['Sch1.16'], { area: 'business', kind: 'review', blocking: true, text: 'Client said 18,000 SEP before the deadline. Once Schedule C is corrected the limit is lower. Tell them before they deposit, and document it.' });
  const nSep = out.at(-1)!.id;
  add('2026-04-08T20:00:00Z', P, 'note_reply', [], { noteId: nSep, text: 'Called Erik 04/08: limit about 13,700 after corrections; he will deposit 18,000 anyway (already scheduled) and withdraw the excess plus earnings before the extended due date. Logged.' });
  add('2026-04-09T14:00:00Z', R, 'note_status', [], { noteId: nSep, status: 'resolved' });
  add('2026-04-06T15:20:00Z', R, 'note', ['SchE.14A'], { area: 'rentals', kind: 'review', blocking: false, text: 'Agree HVAC is a restoration. Placed in service 08/12/2025 — make sure the asset is added to the 2026 roll-forward.' });

  // decisions: reviewer on small, partner on large (firm rule: tax effect over 1,000)
  const fixed = fold(out, '2026-04-07T00:00:00Z', std);
  const v2 = m.version('v2');
  for (const a of fixed.adjustments) {
    const eff = biggest(adjEffect(a, v2, m.p.what_if.alternatives));
    if (eff <= 1000) add('2026-04-07T15:00:00Z', R, 'adjust_decision', [a.target], { adjustmentId: a.id, decision: 'approved', note: 'Agreed to evidence.' }, 'b-approve-r');
    else {
      add('2026-04-07T15:30:00Z', R, 'adjust_decision', [a.target], { adjustmentId: a.id, decision: 'approved', note: 'Reviewed; over threshold — to partner.' }, 'b-approve-r2');
      add('2026-04-08T16:00:00Z', PT, 'adjust_decision', [a.target], { adjustmentId: a.id, decision: 'approved', note: 'Approved.' }, 'b-approve-p');
    }
  }
  signAll('2026-03-27T23:00:00Z', P, 'preparer', AREAS.map((a) => a.id));
  signAll('2026-04-07T21:00:00Z', R, 'reviewer', ['intake', 'wages', 'business', 'rentals', 'deductions', 'california']);
  signAll('2026-04-08T21:00:00Z', PT, 'partner', ['intake', 'wages', 'business', 'rentals', 'deductions']);
  add('2026-04-08T21:30:00Z', R, 'time', ['tax'], { area: 'tax', hours: 2.5, note: 'Review' });
  add('2026-04-08T21:31:00Z', PT, 'time', ['tax'], { area: 'tax', hours: 0.8, note: 'Partner review' });

  // --- extension (mirrors the scripted timeline event)
  add('2026-04-14T15:00:00Z', R, 'filing', [], { action: 'extension_filed', federal: 36000, california: 0, note: 'Form 4868 with 36,000 (v2 balance 35,728 rounded up to the next 500); FTB 3519 with 0 (v2 shows CA overpayment). Our pending adjustments would lower the federal estimate; paying the v2 amount avoids failure-to-pay exposure.' });
  add('2026-04-14T15:05:00Z', R, 'judgment', ['Sch3.10'], { area: 'tax', kind: 'penalty', title: 'Extension payment amount', decision: 'Pay 36,000 with 4868 per v2. Extension is not an extension to pay; any balance after 04/15 accrues interest (7%) and 0.5%/month failure-to-pay.', authority: 'IRC §6081, §6651(a)(2), §6601' });

  // --- June: late documents, v3
  add('2026-06-05T15:00:00Z', P, 'verify', ['F7203.1'], { method: 'recalculated', note: 'Rolled basis with 2023 K-1 (D40): 21,300 + 14,100 − 20,000 = 15,400; 2024 +16,900 −30,000 = 2,300.', evidence: ['D40'] });
  add('2026-06-24T15:30:00Z', P, 'verify', ['SchE.28B', 'SchB.1.8', 'SchD.12', 'Sch3.1'], { method: 'agreed_to_source_document', note: 'Ridgeline K-1 boxes 2, 5, 9a, 21 (D37). FTC 186 + 210 = 396 under 600 de minimis; no Form 1116.', evidence: ['D37'] });
  add('2026-06-24T15:40:00Z', P, 'disposition', ['D38'], { status: 'supporting', note: 'State apportionment: CA 22% of box 2 used for the nonresident-period CA source; AZ composite filed by the fund.' });
  add('2026-06-24T15:45:00Z', P, 'disposition', ['D43'], { status: 'supporting', note: '2025 5498: contribution 7,000 and conversion 14,026 agree to 8606.' });
  add('2026-06-24T16:00:00Z', P, 'time', ['passthrough'], { area: 'passthrough', hours: 0.9, note: 'K-1s and basis' });
  signAll('2026-06-25T20:00:00Z', P, 'preparer', ['investments', 'passthrough', 'tax', 'california']);
  signAll('2026-06-26T20:00:00Z', R, 'reviewer', ['investments', 'passthrough', 'tax', 'california']);

  // --- client answers arrive (mirror msg-07, msg-08)
  const qC6 = out.find((e) => e.type === 'question' && e.target?.[0] === 'F8949.H.C6')!.id;
  add('2026-06-30T18:02:00Z', 'cu-02', 'answer', [], { questionId: qC6, text: 'That BTC was bought on another exchange in March 2021 for about 3,050 and moved to Coinhaven in June. That exchange shut down so I only have a bank statement line showing 3,050 to ‘CryptoNorth’ on 03/15/2021.' });
  add('2026-06-30T18:03:00Z', 'cu-02', 'attach', ['F8949.H.C6'], { name: 'bank-statement-2021-03.txt', mime: 'text/plain', size: 96, kind: 'file', text: '03/15/2021  ONLINE TRANSFER TO CRYPTONORTH LTD   -3,050.00   (Austin Community CU, acct …9276)' });
  add('2026-07-01T16:40:00Z', 'cu-01', 'answer', [], { questionId: qBrigid, text: 'St. Brigid confirmed by phone the gift was 1,500 - matches our bank statement (check #2207, 12/21/2025).' });
  propose('2026-07-01T17:00:00Z', 'crypto-c6');
  add('2026-07-01T17:10:00Z', P, 'verify', ['ev-1049', 'SchA.11'], { method: 'confirmed_with_client', note: 'Parish confirmed 1,500; matches check #2207 on 12/21/2025.', evidence: ['msg-08'] });
  add('2026-07-01T17:11:00Z', P, 'finding_resolve', ['ev-1049'], { findingId: 'lowconf-ev-1049', resolution: 'no_change', note: '1,500 confirmed with client and bank record.' });
  diag('DIGITAL_ASSET_BASIS_MISSING', 'Client basis 3,050 (2021) with bank line; lot moved to long-term.', '2026-07-01T17:12:00Z');
  diag('LOW_CONFIDENCE_READ', 'Confirmed 1,500 with client (msg-08).', '2026-07-01T17:13:00Z');
  // derived SEP limit once Schedule C adjustments are in
  propose('2026-07-01T17:20:00Z', 'sep-limit');
  add('2026-07-01T17:30:00Z', P, 'finding_resolve', [], { findingId: 'ca-amt', resolution: 'accepted_risk', note: 'Schedule P to be computed in the state module before transmission (engine limitation). See diagnostic resolution.' });
  add('2026-07-01T17:31:00Z', P, 'finding_resolve', [], { findingId: 'outside-filings', resolution: 'no_change', note: 'Each filing recorded as a judgment and communicated to the client 03/27.' });
  add('2026-07-01T17:32:00Z', P, 'finding_resolve', [], { findingId: 'scorp-basis', resolution: 'no_change', note: 'Roll-forward complete. 2022 opening basis rests on the client worksheet — accepted, documented.' });
  // explain prior-year swings (one note per flagged line, written by area)
  const why: [RegExp, string][] = [
    [/^F1040\.1|^F1040\.25|^F8959/, 'Two employers in 2025 (Corvane to May, Halvorsen from June); RSU vests 38,200 in box 1; withholding follows.'],
    [/^F1040\.(2b|3)|^SchB/, 'Interest and dividends up: Sparbanken interest SEK 18,450 (rates rose), larger Northlake/Meridian balances; duplicate 1,840 removed.'],
    [/^F1040\.7|^SchD|^F8960/, '2024 had a capital loss; 2025 has the condo §1231 gain 105,040, Brightpath direct-indexing activity, RSU sales and the S corp excess distribution.'],
    [/^F1040\.(8|9|10|11)|^Sch1/, 'Follows Schedule C, Schedule E (condo released suspended losses) and the new SEP / SE health adjustments.'],
    [/^F1040\.(12|13|14|15)/, 'Itemizing for the first time: new Austin home (mortgage interest, property tax) and DAF stock gift; QBI lower with bonus depreciation.'],
    [/^F1040\.(16|19|23|24|26|33|34)/, 'Higher income across the board; CTC phased out; NIIT and Additional Medicare tax now apply; estimates and extension payment.'],
    [/^SchC|^SchSE|^F8995/, 'Studio revenue +18%; 38,000 equipment expensed; mileage per log; home office 240 sq ft (2024’s 300 unsupported).'],
    [/^SchE|^F8582|^F4562/, 'Condo rented only to 9/30 then sold; HVAC capitalized; suspended losses released on disposition; K-1 income higher.'],
    [/^F8606|^F2441/, 'Second backdoor contribution and conversion; dependent care unchanged in substance.'],
  ];
  const vf = runChecks(m, m.version('v3'), fold(out, '2026-07-01T00:00:00Z', std), '2026-07-01T00:00:00Z').find((f) => f.id === 'variances');
  for (const k of vf?.lines ?? []) {
    const text = why.find(([re]) => re.test(k))?.[1] ?? 'Explained by the 2025 events above (move, job change, condo sale, business growth).';
    add('2026-06-30T20:00:00Z', P, 'note', [k], { area: lineArea(m.line('v3', k)!), kind: 'comment', blocking: false, text: `PY variance: ${text}` }, 'b-variance');
  }
  // end of June: preparer re-signs after v3; reviewer and partner re-sign what they can
  signAll('2026-07-01T18:00:00Z', P, 'preparer', AREAS.map((a) => a.id));
  signAll('2026-07-01T19:00:00Z', R, 'reviewer', ['wages', 'rentals', 'deductions', 'california', 'passthrough', 'tax']);
  signAll('2026-07-01T21:00:00Z', PT, 'partner', ['wages', 'rentals', 'deductions', 'california', 'passthrough']);
  // the remaining open item for the walkthrough: Theo's SSN (organizer vs prior-year return)
  return out;
}

export { lineArea };
