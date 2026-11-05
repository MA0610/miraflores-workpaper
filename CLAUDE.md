# Miraflores tax workpaper — Okafor-Lindqvist 2025

Case study submission: a web-native tax workpaper (not a spreadsheet) for one household's 2025 return.
Brief: `../Case_Study_Redesign_the_Tax_Workpaper l MiraFlores AI.pdf`. Packet: `../Instructions.json`
(copied unchanged to `public/packet.json`; the app loads it as delivered and never mutates it).

## Run

```bash
npm install
npm run build && npm start      # http://localhost:8787 — shared server mode (ledger in data/ledger.jsonl, SSE live sync)
npm run dev                     # vite :5173 + server :8787 (proxy /api)
npm run typecheck
```
Free public hosting = Cloudflare Pages + Pages Function (`functions/api/[[route]].ts`) + D1 (`migrations/`); same API,
polled every 3 s (POST /api/poll carries presence). `npm run cf:dev` emulates it on :8788. Store picks the mode from
`/api/health` (`live: 'sse' | 'poll'`); with no API it falls back to localStorage + BroadcastChannel (tabs sync).
A never-used ledger (`fresh`) auto-loads the demo seed (deterministic ids → concurrent seeding is idempotent).
"Load demo review" (nav footer) resets and loads the seeded season of staff work; "Reset ledger" clears it.
Both use an inline Yes/Cancel confirm (no browser dialogs anywhere, so automation can click through).
Browser-automation tip: React inputs need the native value setter + an `input` event; the role switcher is
`.whoami select` (st-01 preparer, st-02 reviewer, st-03 partner, st-04 no clearance, st-05 admin, st-06 QR, cu-01/02 clients).

Headless logic test (no browser): write a .ts script that builds `new Model(JSON.parse(readFileSync('public/packet.json')))`,
`fold(buildSeed(m), clock, packet.firm.starter_standards)` and `runChecks(m, m.version('v3'), wp, clock)` (also `readiness`,
`inbox`, `deadlines`), bundle it with `npx esbuild x.ts --bundle --platform=node --format=esm --outfile=x.mjs` and run with node.
Browser-automation tip: the extension blocks returning page text that contains ID-like digit strings (SSNs, submission
ids); return counts/badges instead, or take a screenshot.

## Core idea / architecture

- **Packet = read-only facts.** `src/data/model.ts` indexes it: ref resolver for every ref format in the README
  (`ev-`, `D..`, `doc:D23#page3`, `qa-/msg-/call-`, `py:/`, `agency:/`, `asset:`, `household:`, `ref:param.`, `ref:fx.`,
  `timeline:`, line keys), reverse index `citedBy` (value → lines, "where did this document land"), `usedBy`, `locate()`
  (finds an extracted value in page text for highlighting). `AREAS` + `lineArea()`/`docArea()` map everything to 9 areas.
- **Workpaper = append-only event ledger** over the packet (`src/ledger/types.ts`). Nothing edited in place:
  verify, adjust (original kept), adjust_decision, note/reply/status (notes and questions may carry `due`), question/answer, judgment, finding_resolve,
  signoff, assign, attach, link, time, view_sensitive, disposition, household_fix, standards, filing, undo, seen.
  `fold.ts` derives state; undo = event (backwards walk so undo-of-undo works); batch id → one undo for bulk actions.
  Events carry `at` (wall clock) and `simAt` (season clock) — the top-bar clock replays the season; only events/docs/
  versions/messages with time ≤ clock are visible.
- **Independent checks** (`src/logic/checks.ts`) read documents/agency/client/prior-year directly and produce findings
  (engine value vs evidence, refs, proposed adjustments). This is how the packet's planted errors surface.
- **Tax effect** (`src/logic/effects.ts`): engine can't be rerun → change × `tax_effect_rates` (or engine what-if, or
  a manual effect with stated basis); payments/credits 1:1. Lines are not re-propagated downstream.
- **Rules** (`src/logic/rules.ts`): roles/permissions, "can't review own work", partner threshold parsed from the firm rule
  text, sign-off = hash of area snapshot (adjusted lines, live adjustments, docs, check statuses) → reopens when it changes
  (shows diff), filing gates from `required_steps`, `returnHash` for client approval invalidation.
- **Seed** (`src/ledger/seed.ts`): plausible staff work Mar–Jul 2 2026 built from the checks' own proposals.
  Default clock = 2026-07-02 12:00Z. Intended demo state: open items are the C6 crypto (×2) + SEP-limit adjustments (C6
  removal is over the partner threshold), Theo's SSN (blocking; SS card D71 arrives Jul 13), the reviewer's HVAC review note
  (blocks filing under the firm rule), and reviewer/partner sign-offs on intake/investments/business/tax.
  Seed ids are deterministic (`seed-0001`…), 241 events.
- UI: `src/ui/ctx.tsx` (app context, `act`/`actMany`, presence heartbeat), `App.tsx` (top bar: clock, search, presence,
  undo, role switcher; nav), `components/` (Inspector = trace panel, DocView = simulated pages behind a `PageSource`
  interface so real PDFs/images drop in with the same position boxes, FindingCard, forms), `views/` (Overview, Area,
  Documents, Sales (295 F8949 lines in v3, by exception, bulk verify), Schedules (14 CPA records), Changes, Compare, WhatIf, Review,
  Filing/Notice/RollForward/ClientCopy, Firm, Client portal, Search). Styles: `src/styles.css`.
- Inbox/deadlines: `src/logic/work.ts` (derived per person; My work page `views/Inbox.tsx`, bell in top bar).
  Related items: `src/logic/related.ts` (same source, across years, related returns, team links).
  Firm rule "Open review notes block filing" is enforced via `noteBlocks()` (rules.ts) while the rule text exists.
- Server: `server/server.mjs` — zero-dep Node http; static `dist/`, `GET /api/health` (`live`, `fresh`), `GET/POST /api/events`,
  `/api/stream` SSE, `/api/presence`, `/api/reset` (archives to `ledger.jsonl.<ts>.bak` + writes `.used`, never deletes).
- Cloudflare: `functions/api/[[route]].ts` — same endpoints plus `POST /api/poll` {since, epoch, me} → {epoch, events, presence};
  D1 tables events(seq, id, epoch, body; UNIQUE(epoch,id)), meta(epoch), presence. Reset = epoch+1 (old rows kept).
  Free-plan constraints baked in: ≤100 bound params/query (30-row inserts), client appends in chunks of 200, ~2 MB/row
  (attachments capped at 1 MB), 100k requests/day (poll 3 s visible, 15 s hidden).

## Errors found in the packet (all surfaced by checks)

RSU noncovered lots basis 0 despite D11 supplement (−47,620 gain) · Northlake interest 1,840 double (D28 + D29) ·
Sparbanken interest at 2024 FX rate (1,747 → 1,871) · Meridian page 32 unread: M18 missing (summary 71,965 vs 71,715) ·
Coinhaven C6 zero basis (msg-07: 3,050, 2021 → long-term) · Sch C gross includes 1099-K already in books (−12,400) ·
mileage log p3 duplicate scan (11,800 → 8,100 mi) · phone/internet/Spotify personal share (call-01) · SE health insurance
not allowed (qa-25, eligible for spouse's plan) · SEP limit falls after corrections; excess contribution (Form 5330) ·
HVAC 11,000 is an improvement, not repair (what-if hvac_improvement) · car donation 6,000 → 2,900 (1098-C) ·
mortgage payoff interest 2,150 double · seller-period property tax 6,912 not deductible (SALT drops under cap) ·
Form 2441 provider EIN misread (74-3829516 vs 74-3829156) and wrong provider name · federal Q4 estimate 4,000 claimed,
transcript 3,000 · CA 9/15 payment designated 2024 (14,000 → 10,500) · CA-source wages use Halvorsen box 16 past the
move (218,400 → 129,569 via D73 paystub) · Theo SSN typo in organizer (3309 vs 3390) → e-file reject ·
St. Brigid 41% read (confirmed 1,500, msg-08) · CA AMT on ISO not computed · outside filings (FBAR, 2023 Form 3520,
late 1099-NECs, 5330) · client answers contradicted (qa-14/15/31/39/41) · prior preparer: home office 300 sq ft unsupported.
Confirmed correct (passing checks): sums, W-2 dedup, excess SS, home office 240, condo sale/§1250, carryovers,
S corp basis roll-forward, IRA basis (client wrong, engine right), §179 election saves CA 1,050.

## Status

Done (2026-11-04):
- Every flow in the brief browser-tested end to end in Chrome on the Node server (client answer/sign, filing reject →
  SSN fix → accept/freeze → amendment, notice binder, roll-forward export, compare, what-ifs, standards edit, bulk verify +
  undo, approval rules, SSN masking + reveal log, two-tab sync/presence).
- Added after the brief audit: deadlines + My work inbox/bell, related-items panel, client-portal differences derived from
  checks, firm rule "Open review notes block filing" enforced, auto-load demo on a fresh ledger.
- Filing → "File extension" (`ExtensionRow` in Filing.tsx): records `extension_filed` {federal, california, note}, the same
  shape the seed uses; amounts prefilled from the workpaper balance rounded up to 500; reviewer/partner only, disabled
  after the original due date. Browser-tested 2026-11-04 (role gate, edit amount, persist, undo, late lock, deadline clears).
- Fixed: AreaView called `useState` after the "Unknown area" early return → React #300 crashed the whole app on a
  bad `#/area/<id>`. Hooks now come before the return. Valid area ids: intake, wages, investments, business, rentals,
  passthrough, deductions, california, tax.
- Fixed: filing gate "All documents accounted for" (rules.ts `readiness`) no longer trusts the engine's `documents_used`
  (which lists 71/72 docs, so the gate passed on a blank ledger). A doc counts only if a value landed on a line
  (`m.landing`), it was superseded, dispositioned or verified, or it is cited as evidence by a household fix, live
  adjustment or verification. Blank ledger → 15 docs flagged; demo state unchanged (same failing gates at Jul 2).
- Outside filings check (checks.ts) tracks each of the 7 filings: Decision column = latest `outside_filing` judgment whose
  title matches the row's regex; the check passes only when all 7 are decided. `table.decide` (Finding) → FindingCard shows
  "Record decision" per undecided row (JudgmentForm preset kind outside_filing, no line target). Seed adds the 4 missing
  decisions on 07/01 17:30 (241 events). A ledger loaded from the old 237-event seed shows 4 undecided under a resolved check.
- Client approval needs every client user (both spouses, MFJ): `clientSignatures()` (rules.ts) = `client_approved` events
  whose hash equals the current `returnHash`, per signer. Used by the client gate, Filing step 2 + Transmit, Firm status and
  the portal ("Signed — waiting for Erik"). Browser-tested: one signature blocks, both pass, a change makes them stale, undo
  restores, transmit → accepted + frozen.
- Assignment notifications: fold records `wp.assignedBy` (`area.role` → who/when); inbox (work.ts) adds one "X assigned you
  as <role> on N areas" item per (assigner, moment, role) for assignments that still stand. Clients have no bell; the portal
  stage and question list are their notifications.
- After filing, anything describing the 2025 return reads `wp.filing.frozen.snapshot.summary`, never the live workpaper:
  ClientCopy, RollForward estimates, Notice binder (snapshot lines). Filing page shows "As filed vs amendment layer".
- Roll-forward export includes judgments (who/when), adjustments (from/to/why/who/status/layer) and the full visible
  ledger (`history`; attach `data` stripped; whole JSON passed through `maskIds`). Notice: one "Record response sent".
- No hand-typed client/roll-forward text: `outsideFilings()` (checks.ts) is the single definition of the 7 outside filings
  (amounts/dates from packet: F8938 max, D27 contractors, firm deadlines, `sepExcess()`), each with a client-facing action.
  `src/logic/carry.ts`: `carriedItems()` (Form 3921 ISO basis, engine carryovers, HVAC/SEP/FTB from live adjustments,
  decided outside filings, counts) and `clientTodos()` (decided filings + FTB adjustment + retention rule from standards).
  Raw JSON displays replaced: `CarryoverTable` / `CarriedList` (Schedules.tsx, reused by RollForward), 2024 K-1 table.
- Firm rules are authoritative: `partnerThreshold()` returns Infinity when the admin removes the "tax effect over N" rule
  (was a silent 1,000 fallback), same as the "Open review notes block filing" rule.
- Search (Search.tsx) also covers adjustments, questions/answers and attachments; for users without clearance it matches
  against `maskIds(page text)` so a full SSN can't be confirmed by hit / no hit.
- Depreciation schedule is fully derived: Bonus/§179 column (from method text; §179 what-if adoption), AMT 2025 + diff,
  per-asset disposal recapture (disposition.unrecaptured_1250 / section_1250_ordinary), HVAC row from the adjustment + D47
  (cost, date; SL mid-month 27.5), notes computed from assets, SchD.19, F4797.26g, SchCA540NR.12.C, §179 what-if.
- All 14 schedules are derived (no typed amounts in Schedules.tsx; only labeled statutory constants such as DEBT_LIMIT).
  Payments: D67 EFTPS, qa-41, IRS transcript, D68 Web Pay vs FTB account, extension event, payment date → interest days.
  Basis: basis_records + D40 + 2024 K-1 + F7203; Ridgeline from D37; home from basis_records + D54; ISO from D12.
  PriorPrep: prior side quoted from prior_preparer_workpaper notes / return_2024 lines+notes; our side from lines, checks,
  outside-filing decisions, asset_records vs engine opening balances, household fix. SSNs only as •••-••-last4
  (the old typed table showed Theo's full SSN to everyone).
- ClientPortal is keyed by `me.id` (App.tsx) so switching spouses in one tab doesn't carry the consent box / PIN over.
- E-file reject path in the UI: close the dep-ssn check with "No change — explain", clear the other gates, transmit at a
  clock before Jul 13 → R0000-504-02 reject + blocking note; at Jul 14 "Correct from SS card" (reopens intake sign-offs;
  client signatures stay valid since the returnHash is unchanged) → retransmit → accepted + frozen. Browser-tested.
- Cloudflare backend tested locally with `npm run cf:dev` (auto-seed, two-tab polling sync + presence, reset propagation,
  inbox notification across tabs). Not yet deployed.
- Docs: `README.md` (run, deploy, requirement map, AI use — user should rewrite the AI paragraph), `docs/core-idea.md`,
  `docs/errors-found.md`.

Conventions worth keeping:
- SSN-like text must go through `maskIds()` (model.ts) / `fmt()`; cleared staff reveal via a logged `view_sensitive`.
- Sign-off snapshot `titles` (adjustments and checks) are excluded from the hash (`snapHash`) — add display-only fields the same way.
- Notes: `actionable()` (fold.ts) = counts as an open item (review/quality or blocking); `noteBlocks()` (rules.ts) = blocks
  filing (flagged, or open review/quality note while the firm rule text exists). Plain comments are neither.
- Inbox, deadlines and related items are derived, never stored; "read" = latest `seen` event's `simAt` (`wp.seenSim`),
  so they replay with the season clock.
- No browser dialogs: use `Confirm` / `ReasonButton` (bits.tsx) and inline form errors.

### To do (next)
1. Deployed 2026-11-05: https://okafor-lindqvist-workpaper.pages.dev (D1 workpaper-ledger, id in wrangler.toml).
   Redeploy: `npm run cf:deploy` (add `--commit-dirty=true` if the git tree is dirty).
2. Video walkthrough (user records; suggested path in README "Trying it").
3. Nice to have: unit tests for checks/fold/rules; page-text highlighter skips repeated values (field-aware matching).
