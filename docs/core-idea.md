# Core idea and data model

## The idea: a workpaper is a ledger of claims about read-only evidence

A spreadsheet workpaper mixes three things in the same cells: what the documents say, what the
software computed, and what people did about it. Once they are mixed you can't tell which is which,
so you can't trust it. This design keeps them apart:

1. **The packet is the facts, and it is never edited.** Documents, ~3,000 extracted values, three
   engine versions, client answers, prior years, agency records. The app loads `packet.json` as
   delivered and indexes it: every reference format in the README resolves (`ev-`, `D23#page3`,
   `qa-`, `py:/…`, `agency:/…`, line keys), and a reverse index answers "where did this document
   land?" for every value.
2. **Everything people do is an append-only event** laid over those facts: verify, adjust,
   decide, note, ask/answer, judgment, sign-off, attach, link, disposition, filing, and so on.
   Nothing is edited in place: an adjustment keeps the original, an undo is an event, an amendment
   is a layer over a frozen snapshot. Who, when (wall clock *and* season clock) and why are always
   recorded.
3. **The state you see is derived** (`fold(events, clock)`). Status, open items, sign-off
   currency, filing readiness and the adjusted return are computed from facts + events every
   time, and never stored where they could go stale.
4. **Checks that don't trust the engine.** Independent checks read the documents, agency records,
   client messages and prior year directly and compare them with the engine. Each one produces a
   finding with evidence links and, where possible, ready-made adjustments with their tax effect.
   This is how the packet's confident mistakes surface (see `errors-found.md`).

The rest follows from those four. The season clock replays the timeline, so the app shows only the
documents, versions and events that existed at that moment. A sign-off stores a hash of what it
covered (adjusted lines, live adjustments, documents, check statuses), so it reopens with a diff
when any of those change. Filing freezes a snapshot, and later work becomes an amendment layer on
top. The notice binder, client copy and roll-forward are just views of the same ledger.

The unit of review is a **claim with its proof** (a line, its source page with the field
highlighted, how it was verified, by whom), not a grid. Large detail (295 sales, 14 schedules) is
reviewed *by exception*: filters for "flagged by checks / zero basis / wash / unverified", plus
bulk actions that undo as one batch.

## Data model

```
Packet (read-only)                 Ledger (append-only)                Derived (fold)
──────────────────                 ────────────────────                ──────────────
documents[] ─ pages[]              LEvent {                            WP {
extracted_values[] ─ position        id, at (wall), simAt (season),      adjustments (status, decisions)
return_versions[] ─ lines[]          actor, type, target[], payload,     notes, questions, judgments
  (sources → ev-ids, rule)           batch?  ← one undo for a bulk act   verifications by target
client answers / messages          }                                     signoffs (+ snapshot hash)
prior_years, agency records        type ∈ verify | adjust |              dispositions, links, time
firm (staff, roles, standards)       adjust_decision | note | … |        filing (events, frozen,
timeline (season replay)             signoff | filing | undo | seen        amendments)
what_if alternatives                                                   }
                                                                       Findings = runChecks(packet,
                                                                         version, WP, clock)
```

- **Targets are references**, so any event can attach to anything: a line key, an extracted
  value, a document page, a question, a household fact.
- **Adjustments** carry `from`, `to`, the category/CA treatment that drives the tax effect, the
  reason and authority, and the finding that motivated them. The engine can't be rerun, so the
  effect is the change × the version's `tax_effect_rates` (or an engine what-if, or a manual
  effect with a stated basis).
- **Rules** are code over the derived state: enforced roles, "can't review your own work", the
  partner threshold parsed from the firm's rule text (editable by the administrator), filing
  gates from `required_steps`, and a client-approval fingerprint that goes stale when the return
  changes.
- **Storage**: one small API with three backends. On the free public deployment it's a Cloudflare
  Pages Function over D1, polled for live sync and presence. Locally, a zero-dependency Node server
  appends to `data/ledger.jsonl` and pushes over SSE. With no API at all it falls back to
  localStorage + BroadcastChannel. A reset starts a new epoch, so nothing is deleted.
- **Notifications and deadlines are derived too**: each person's inbox (decisions waiting on them,
  their sign-offs, assigned notes, mentions, answers, overdue items) is computed from the ledger at
  the season clock, so it needs no extra storage and replays with the clock.
  Source pages sit behind a `PageSource` interface, so real PDFs/images can replace the simulated
  pages and keep the same field boxes.

**Tradeoffs.** The engine isn't rerun: tax effects are linear estimates, and downstream lines
aren't re-propagated, which the UI says plainly. Folding the whole ledger on every change is
simple and fast at this size (hundreds of events), but a firm-scale system would snapshot.
Attachments are stored inline in the ledger (1 MB limit) to stay within free hosting. Live sync on the free host polls every 3 s rather than pushing.
