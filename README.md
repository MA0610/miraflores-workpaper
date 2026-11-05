# Workpaper — Okafor-Lindqvist 2025

A web-native tax workpaper for one household's 2025 return (federal 1040 + California 540NR,
part-year). It loads the case-study packet exactly as delivered (`public/packet.json`, never
modified) and keeps all work as an append-only ledger on top of it.

- **Core idea and data model:** [`docs/core-idea.md`](docs/core-idea.md)
- **Errors found, and how the design surfaced them:** [`docs/errors-found.md`](docs/errors-found.md)

## Run locally

Requires Node 18+.

```bash
npm install
npm run build && npm start     # http://localhost:8787
```

Then click **Load demo review** at the bottom of the left nav to load the seeded season (staff work
from March to July 2, 2026). **Reset ledger** starts again from the raw packet. Both archive the old
ledger on the server rather than deleting it.

Development: `npm run dev` (Vite on :5173 with hot reload, proxying `/api` to the server on :8787).
`npm run typecheck` checks types.

### Trying it

- **Role switcher** (top right): preparer, reviewer, partner, a preparer without sensitive-data
  clearance, firm administrator, quality reviewer, and the two clients (who see the client portal).
  Roles are per tab, so two tabs can be two people; changes and presence sync live.
- **Season clock** (top left): replays the season. Only documents, engine versions, messages and
  work that existed at that moment are shown. ◀ ▶ step through the timeline.
- Suggested path: Overview → a red check → trace a line to its source page → propose the
  adjustment → switch to reviewer (the partner threshold blocks large effects) → sign-off reopens
  with a diff → move the clock to Jul 14 and correct Theo's SSN from the card → client signs →
  transmit → filed and frozen → Notice response (clock to Feb 2028) → Roll forward.

## Deploy (public link)

The app is one Node process with no runtime dependencies: it serves `dist/` and stores the ledger in
`$DATA_DIR/ledger.jsonl` (default `./data`).

**Render** (Web Service) or **Railway**:

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Environment | `DATA_DIR=/var/data` (or wherever the persistent disk is mounted) |
| Port | taken from `PORT`, which both platforms set |

Attach a persistent disk/volume at `DATA_DIR` so work survives restarts. Without one the app still
runs, but the ledger resets on each deploy. After the first deploy, open the link and click
**Load demo review**.

Static-only hosting (no server) also works: serve `dist/`, and the ledger falls back to the browser's
localStorage, syncing between tabs of that browser only.

## Layout

```
public/packet.json        the packet as delivered (read-only)
src/data/model.ts         packet index: reference resolver, "where did this land", areas
src/ledger/               event types, fold (derived state), store (server / local), demo seed
src/logic/checks.ts       independent checks that read evidence directly
src/logic/effects.ts      tax effect of adjustments (rates, engine what-ifs, manual)
src/logic/rules.ts        roles, separation of duties, partner threshold, sign-off hashes, filing gates
src/ui/                   views (overview, areas, documents, sales, schedules, review, filing,
                          notice, roll-forward, firm, client portal) and the trace inspector
server/server.mjs         zero-dependency Node server: static files, ledger, SSE live sync
```

## How AI was used

Built with Claude Code (Anthropic's coding agent) as a pair programmer: I set the design
direction (ledger over read-only evidence, independent checks, sign-off hashes, season replay) and
reviewed the output; Claude wrote most of the TypeScript/React, the seed season and the checks
from the packet's README, and drove a real Chrome browser to test every flow end to end (filing
reject/accept paths, client signing, partner-threshold rules, SSN masking, two-tab live sync),
fixing the bugs that turned up. The written docs were drafted with Claude and edited by me.

<!-- Edit the paragraph above so it describes exactly how you worked. -->
