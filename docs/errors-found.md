# Errors found, and how the design surfaced them

Every item below is produced by the app itself. Open **Independent checks** (or an area) with the
ledger reset: each finding links to the source page with the field highlighted, shows engine vs.
evidence, and (where it applies) offers the adjustment with its estimated tax effect.
The effects shown are on the v3 return (federal / California; + = more tax).

## How they surface

- **Checks that read the evidence, not the engine.** `src/logic/checks.ts` compares the engine's
  lines with the documents, the IRS/FTB records, client messages and calls, and the prior year.
  When they disagree, that's a finding with links to both sides.
- **Every value keeps its source and confidence.** Low-confidence reads, and reads that differ
  from the printed text, are colored on the page, so a misread EIN or a 41% read amount is
  visible where it sits.
- **Documents must account for themselves.** A filing gate requires every received document to
  have landed, been superseded, or been given a recorded disposition. That is how page 32 of a
  brokerage statement that was never read, or a duplicate scan, gets caught.
- **Client answers are evidence, not truth.** Where the documents settle a question, the answer is
  shown next to them and the return follows the documents.
- **Prior year and the prior preparer** are loaded as comparison sources (carryovers, variances,
  open items they left).

## Errors (engine or packet wrong)

| Area | Finding | How it surfaced | Effect (fed / CA) |
|---|---|---|---|
| Investments | RSU noncovered lots reported with zero basis; 47,620 of gain already taxed as wages (D11 supplement) | Basis check against the supplemental statement and W-2 box 14 | −15,536 / −2,764 |
| Investments | Northlake interest 1,840 counted twice (D28 and D29 report the same account) | Interest reconciliation across documents, by account | −640 / −127 |
| Investments | Sparbanken interest converted at the 2024 average SEK rate (1,747 → 1,871) | FX check re-converts every foreign amount at the rate the README specifies | +43 / +9 |
| Investments | Meridian 1099-B summary (71,965) doesn't agree to the lots on the return (71,715): page 32 unread, lot M18 missing | Broker summary ↔ lot detail reconciliation; unread page flagged | −21 / −2 |
| Investments | Coinhaven lot C6 at zero basis; client message gives 3,050 basis and a 2021 acquisition, so long-term | Zero-basis exception filter + client message msg-07 | −1,312 / −195 |
| Studio | Gross receipts include the 1099-K 12,400 already in the books | Books-to-1099 reconciliation | −4,402 / −384 |
| Studio | Mileage log page 3 is a second scan of page 2 (11,800 → 8,100 miles) | Duplicate-page detection on the log | +919 / +80 |
| Studio | Personal share of phone, internet, Spotify deducted (1,524), per the call notes | Judgment check citing call-01 | +541 / +48 |
| Studio | SE health insurance 14,400 not allowed; Erik was eligible for Ngozi's employer plan | Client answers qa-25/qa-27 vs. the deduction | +4,464 / +605 |
| Studio | SEP contribution 18,000 exceeds the limit once Schedule C is corrected (15,214, then 13,674); excess needs Form 5330 | Limit recomputed from the corrected profit | judgment + SEP adjustment |
| Rentals | HVAC replacement 11,000 deducted as a repair; it is an improvement | Judgment check; engine what-if `hvac_improvement` adopted | +3,633 / +896 |
| Deductions | Car donation claimed at 6,000; the 1098-C says it sold for 2,900 | Source check against D66 (box 4a/4c) | +806 / +149 |
| Deductions | Mortgage payoff interest 2,150 added on top of a 1098 that already includes it | Reconciliation of 1098 vs. the payoff statement | +559 / +103 |
| Deductions | Property tax includes 6,912 that belongs to the seller (SALT then falls under the cap) | Closing statement proration vs. the 1098 | +1,462 / +332 |
| Deductions | Form 2441 provider EIN misread (74-3829516 vs. printed 74-3829156) and the wrong provider name | Read-vs-print comparison on the statements | filing accuracy |
| Payments | Federal Q4 estimate: 4,000 claimed, IRS transcript shows 3,000 | IRS account transcript | +1,000 / — |
| Payments | California 9/15 payment designated to 2024 (14,000 → 10,500) | FTB account record | — / +3,500 |
| California | CA-source wages use Halvorsen box 16 past the move date (218,400 → 129,569 via the D73 paystub) | Residency split recomputed from the move date | — / −5,685 |
| California | California AMT on the ISO exercise not computed by the engine | Engine diagnostic + independent check; partner judgment | to compute |
| Intake | Theo's SSN in the organizer (…3309) differs from the 2024 return (…3390); e-file would reject | Cross-source identity check, then the SS card (D71) | blocks filing |

## Completeness and judgment items

- **Outside filings (7)**: FBAR (Swedish account), 2023 Form 3520 (inheritance), late
  1099-NECs, Form 5330 for the excess SEP and others, each needing a recorded decision.
- **St. Brigid receipt** read at 41% confidence; amount confirmed at 1,500 (msg-08).
- **Client answers contradicted by documents** (qa-14, 15, 31, 39, 41, plus qa-08 and qa-26),
  shown side by side with which source the return follows.
- **Prior preparer**: home office 300 sq ft was unsupported; it is recomputed at 240.
- **Form 8867 due diligence** for CTC/ODC must be documented before filing.
- **Prior-year swings**: 51 lines moved more than 10% and 1,000; each needs an explanation (a
  note, judgment or adjustment) before the gate passes.

## Confirmed correct (checks that pass)

Engine arithmetic (85 totals recomputed), W-2 de-duplication, excess Social Security with two
employers, home office at 240 sq ft, condo sale gain and unrecaptured §1250, carryovers to the 2024
return, S corporation basis roll-forward 2022 → 2025, and IRA basis (here the client is wrong and
the engine is right). The §179 election (engine what-if) saves California 1,050 and is adopted.
