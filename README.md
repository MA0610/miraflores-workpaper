# Workpaper — Okafor-Lindqvist 2025

A web-native tax workpaper for one household's 2025 return (federal 1040 + California 540NR,
part-year). It loads the case-study packet (`public/packet.json`, never
modified) and keeps all work as an append-only ledger on top of it.

- **Live link:** https://okafor-lindqvist-workpaper.pages.dev
- **Core idea and data model:** [`docs/core-idea.md`](docs/core-idea.md)
- **Errors found, and how the design surfaced them:** [`docs/errors-found.md`](docs/errors-found.md)

## Run locally

Requires Node 18+.

```bash
npm install
npm run build && npm start     # http://localhost:8787
```

The first visit to a never-used ledger loads the demo season automatically (staff work from March to
July 2, 2026). **Load demo review** and **Reset ledger** at the bottom of the left nav reload it or start
from the raw packet; both archive the old ledger rather than deleting it.

Development: `npm run dev` (Vite on :5173 with hot reload, proxying `/api` to the server on :8787).
`npm run typecheck` checks types. `npm run cf:dev` runs the Cloudflare version locally on :8788.

### Trying it

- **Role switcher** (top right): preparer, reviewer, partner, a preparer without sensitive-data
  clearance, firm administrator, quality reviewer, and the two clients (who see the client portal).
  Roles are per tab, so two tabs can be two people; changes and presence sync live.
- **Season clock** (top left): replays the season. Only documents, engine versions, messages and
  work that existed at that moment are shown. ◀ ▶ step through the timeline.
- **My work** (🔔 in the top bar): each person's notifications, computed from the ledger: adjustments
  waiting on their decision, sign-offs that are theirs or reopened, notes assigned to them, `@name`
  mentions, questions to them, answers to their questions, and overdue or upcoming deadlines (filing
  dates, area due dates, and due dates on notes and questions).
- Suggested path: Overview → a red check → trace a line to its source page → propose the
  adjustment → switch to reviewer (the partner threshold blocks large effects; approve as partner)
  → sign-off reopens with a diff → reviewer resolves the open HVAC review note (the firm rule "Open
  review notes block filing" is enforced) → move the clock to Jul 14 and correct Theo's SSN from the
  card → send for approval → both clients sign (Ngozi, then Erik) → transmit → filed and frozen → Notice response (clock
  to Feb 2028) → Roll forward.

### Where each requirement lives

| Brief | In the app |
|---|---|
| Trace a number to its source; document → where it landed | Click any line or value (inspector): source page with the field highlighted; Documents → "Where it landed" |
| Verification, links, attachments | Inspector actions: Verify, Link, Attach; **Related** panel (same source, across years, related returns) |
| How a number was built; reconciliations; checks that don't trust the engine | Inspector "How it was built" (sources, flows into); **Independent checks**; Schedules |
| Large detail | **Sales detail** (filters by exception, bulk verify with one undo); Depreciation by asset |
| Books to tax, state split | Schedules → Books to tax, State split |
| Adjust without losing the original; live changes; since I last looked | Adjust (original kept, who/why/effect); **What changed**; presence in the top bar |
| Compare versions, what-ifs, bulk + undo | **Compare versions**, **What-ifs**, ↶ Undo (whole batch) |
| Swings, judgments, elections, due diligence, penalties, completeness | Checks (variances, outside filings), Judgments & elections, filing gates |
| Questions, review notes, sign-offs that reopen, roles | Ask / Note in the inspector; Review notes; area sign-offs (reopen with a diff); role switcher |
| Assignments, deadlines, notifications | Firm → Assignments; due dates on notes/questions; 🔔 **My work** |
| Client approval and e-file signature | Filing → Send for approval; client portal → each spouse approves and signs 8879 |
| Extensions, filing, rejections, client copy, freeze, amend | **Filing** (reject → fix → accept → frozen; amendment layer), Client copy |
| Notice, roll forward, plan next year | **Notice response**, **Roll forward to 2026** (export + 2026 estimates) |
| Standards, sensitive data + view log, time vs budget, status, search | **Firm** tabs; masked SSNs with logged reveal; search box |
| Records a CPA expects | **Schedules** (14 records, from return summary to prior preparer vs us) |

## Deploy (free public link): Cloudflare Pages + D1

The built app is served as static files; `functions/api` (Pages Functions)
is the ledger API, backed by a D1 (SQLite) database, so work is saved and shared by everyone with the link.
Live updates are polled every 3 s (the free plan has no long-lived connections).

One-time setup (needs a free Cloudflare account):

```bash
npx wrangler login                 # opens the browser to authorize
npm run cf:db:create               # prints a database_id: paste it into wrangler.toml
npm run cf:db:migrate              # creates the tables in the remote database
npm run cf:project:create          # creates the Pages project
npm run cf:deploy                  # builds and deploys → https://okafor-lindqvist-workpaper.pages.dev
```

Later deploys: `npm run cf:deploy`. To try the Cloudflare setup locally: `npm run cf:dev` (port 8788).

Free-plan limits worth knowing: 100,000 API requests a day (an open tab uses about 1,200 an hour;
hidden tabs poll 5× less), 100,000 database rows written a day, and attachments up to 1 MB each.

The Node server (`npm start`) remains the simplest way to run it on your own machine; it pushes
updates over SSE instead of polling and stores the ledger in `$DATA_DIR/ledger.jsonl`. Static-only
hosting (no API) also works: the ledger falls back to the browser's localStorage, synced between tabs.

## Layout

```
public/packet.json        the packet as delivered (read-only)
src/data/model.ts         packet index: reference resolver, "where did this land", areas
src/ledger/               event types, fold (derived state), store (server / cloud / local), demo seed
src/logic/checks.ts       independent checks that read evidence directly
src/logic/effects.ts      tax effect of adjustments (rates, engine what-ifs, manual)
src/logic/rules.ts        roles, separation of duties, partner threshold, sign-off hashes, filing gates
src/logic/work.ts         deadlines and each person's inbox (notifications)
src/logic/related.ts      related items across the return, years and related returns
src/ui/                   views (overview, my work, areas, documents, sales, schedules, review,
                          filing, notice, roll-forward, firm, client portal) and the trace inspector
server/server.mjs         zero-dependency Node server: static files, ledger, SSE live sync
functions/api/            Cloudflare Pages Function: the same API on D1 (free hosting), polled
migrations/               D1 schema
```

## How AI was used

I used Claude Code to build the boilerplate code and and help come up with some architectural choices concerning things on how I could better implement requirements such as sensitive data being protected and stress testing it so that it would fufill each and every requirement listed on the case study. I was in charge of designing the pipeline of the application as well as bug fixes that Claude code was struggling to implement correctly such as not overriding the data. Claude code in majority was used to test every requirement and catch any mistakes that I made regarding the implementation of the requirements.