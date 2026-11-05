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

Headless logic test (no browser): bundle a script with `npx esbuild <file>.ts --bundle --platform=node --format=esm`
that imports `Model`, `runChecks`, `fold`, `buildSeed`, `readiness` (see git history / scratchpad `test.ts` pattern).

## Core idea / architecture

- **Packet = read-only facts.** `src/data/model.ts` indexes it: ref resolver for every ref format in the README
  (`ev-`, `D..`, `doc:D23#page3`, `qa-/msg-/call-`, `py:/`, `agency:/`, `asset:`, `household:`, `ref:param.`, `ref:fx.`,
  `timeline:`, line keys), reverse index `citedBy` (value → lines, "where did this document land"), `usedBy`, `locate()`
  (finds an extracted value in page text for highlighting). `AREAS` + `lineArea()`/`docArea()` map everything to 9 areas.
- **Workpaper = append-only event ledger** over the packet (`src/ledger/types.ts`). Nothing edited in place:
  verify, adjust (original kept), adjust_decision, note/reply/status, question/answer, judgment, finding_resolve,
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
  Default clock = 2026-07-02 12:00Z. Intended demo state: only open items are C6 crypto + SEP-limit adjustments (await
  reviewer/partner), Theo's SSN (blocking), and reviewer/partner sign-offs on intake/investments/business/tax.
- UI: `src/ui/ctx.tsx` (app context, `act`/`actMany`, presence heartbeat), `App.tsx` (top bar: clock, search, presence,
  undo, role switcher; nav), `components/` (Inspector = trace panel, DocView = simulated pages behind a `PageSource`
  interface so real PDFs/images drop in with the same position boxes, FindingCard, forms), `views/` (Overview, Area,
  Documents, Sales (295 F8949 lines in v3, by exception, bulk verify), Schedules (14 CPA records), Changes, Compare, WhatIf, Review,
  Filing/Notice/RollForward/ClientCopy, Firm, Client portal, Search). Styles: `src/styles.css`.
- Inbox/deadlines: `src/logic/work.ts` (derived per person; My work page `views/Inbox.tsx`, bell in top bar).
  Related items: `src/logic/related.ts` (same source, across years, related returns, team links).
  Firm rule "Open review notes block filing" is enforced via `noteBlocks()` (rules.ts) while the rule text exists.
- Server: `server/server.mjs` — zero-dep Node http; static `dist/`, `GET/POST /api/events`, `/api/stream` SSE,
  `/api/presence`, `/api/reset` (archives, doesn't delete).

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

Done (2026-11-04): all fixes and every flow in the brief browser-tested end to end in Chrome (client answer/sign,
filing reject → SSN fix → accept/freeze → amendment, notice binder, roll-forward export, compare, what-ifs, standards
edit, bulk verify + undo, approval rules, SSN masking + reveal log, two-tab sync/presence). Docs written:
`README.md`, `docs/core-idea.md`, `docs/errors-found.md`. Git repo initialised.

Conventions worth keeping:
- SSN-like text must go through `maskIds()` (model.ts) / `fmt()`; cleared staff reveal via a logged `view_sensitive`.
- Sign-off snapshot `titles` are excluded from the hash (`snapHash`) — add display-only fields the same way.
- "Actionable" notes = review/quality or blocking (`actionable()` in fold.ts); plain comments don't count as open.

### To do (next)
1. Deploy (free): user creates a Cloudflare account, then the README "Deploy" commands; paste database_id into
   wrangler.toml. Put the resulting pages.dev link in README.
2. Video walkthrough (user records; suggested path in README "Trying it").
3. Nice to have: unit tests for checks/fold/rules; page-text highlighter skips repeated values (field-aware matching).
