import { useState } from 'react';
import { actionable } from '../../ledger/fold';
import { useApp } from '../ctx';
import { fmtDate, fmtDateTime, lineArea, maskIds } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjustedSummary, adjEffect, sumEffects } from '../../logic/effects';
import { adjustedValue, can, clientSignatures, liveAdjustments, readiness, returnHash, hash } from '../../logic/rules';
import { Badge, Money, Ref, Section, SimpleTable, fmt } from '../components/bits';
import { AdjCard, AttachmentRow } from '../components/Inspector';
import { VERIFY_LABELS } from '../../ledger/types';
import { carriedItems, clientTodos } from '../../logic/carry';
import { CarriedList, CarryoverTable } from './Schedules';

function useFiled() {
  const { m, v, wp } = useApp();
  const live = liveAdjustments(wp);
  const summary = adjustedSummary(v, sumEffects(live.map((a) => adjEffect(a, v, m.p.what_if.alternatives))));
  const lines = Object.fromEntries(v.lines.map((l) => [l.key, adjustedValue(wp, l.key, l.value)]));
  return { summary, lines, live };
}

export function Filing() {
  const { m, v, wp, findings, clock, me, act, actMany } = useApp();
  const gates = readiness(m, v, wp, findings, clock, m.p.what_if.alternatives);
  const blockers = gates.filter((g) => g.blocking && !g.ok && g.id !== 'client');
  const { summary, lines } = useFiled();
  const fe = wp.filing.events;
  const requested = fe.filter((e) => e.action === 'approval_requested').at(-1);
  const sig = clientSignatures(m, v, wp);
  const approvalCurrent = sig.complete;
  const fedAccepted = fe.some((e) => e.action === 'efile_ack' && e.payload.jurisdiction === 'federal' && e.payload.status === 'accepted');
  const frozen = wp.filing.frozen;
  const depSsn = findings.find((f) => f.id === 'dep-ssn');
  const agencyEfile = m.p.tax_agency_records.efile.filter((x: any) => x.date <= clock);
  const scripted = m.p.timeline.filter((t) => /approved|efile|paid|refund|extension|quality|notice/.test(t.event));
  const [amendReason, setAmendReason] = useState('');

  const transmit = async () => {
    const ssnBad = depSsn && depSsn.severity === 'error';
    const rej = m.p.tax_agency_records.efile[0];
    const ok = m.p.tax_agency_records.efile.filter((x: any) => x.status === 'accepted');
    if (ssnBad) {
      await actMany([
        { type: 'filing', payload: { action: 'efile_submitted', jurisdiction: 'federal', submission_id: rej.submission_id } },
        { type: 'filing', payload: { action: 'efile_ack', jurisdiction: 'federal', status: 'rejected', errors: rej.errors, submission_id: rej.submission_id, note: rej.errors[0].message } },
        { type: 'filing', payload: { action: 'efile_ack', jurisdiction: 'california', status: 'not_transmitted', errors: m.p.tax_agency_records.efile[1].errors, note: 'State held: federal rejected' } },
        { type: 'note', target: ['household:theo'], payload: { area: 'intake', kind: 'review', blocking: true, text: `E-file rejected ${rej.errors[0].code}: ${rej.errors[0].message} Fix the dependent SSN from the Social Security card and retransmit.` } },
      ]);
      return;
    }
    const snap = { lines, summary, adjustments: liveAdjustments(wp).map((a) => ({ id: a.id, title: a.title, target: a.target, from: a.from, to: a.to, status: a.status })), version: v.version, docs: m.p.documents.filter((d) => d.received_at <= clock).map((d) => d.id) };
    await actMany([
      { type: 'filing', payload: { action: 'efile_submitted', jurisdiction: 'federal', submission_id: ok[0].submission_id } },
      { type: 'filing', payload: { action: 'efile_ack', jurisdiction: 'federal', status: 'accepted', submission_id: ok[0].submission_id } },
      { type: 'filing', payload: { action: 'efile_submitted', jurisdiction: 'california', submission_id: ok[1].submission_id } },
      { type: 'filing', payload: { action: 'efile_ack', jurisdiction: 'california', status: 'accepted', submission_id: ok[1].submission_id } },
      { type: 'filing', payload: { action: 'freeze', hash: hash(JSON.stringify(snap)), snapshot: snap, note: 'Frozen as filed. Changes from here are an amendment layer.' } },
    ]);
  };

  return (
    <div className="page">
      <div className="page-hd">
        <div><div className="eyebrow">Filing</div><h1>{frozen ? `Filed and frozen ${fmtDate(frozen.simAt)}` : blockers.length ? `${blockers.length} gates stand between this return and filing` : 'Ready to file'}</h1></div>
      </div>
      {frozen && (
        <div className="callout green">
          Frozen as filed by {m.staffName(frozen.by)} on {fmtDateTime(frozen.simAt)} · fingerprint <span className="mono">{frozen.hash}</span>. The filed numbers are kept in the snapshot; anything after this is an amendment layer on top.
          {wp.filing.amendments.length > 0 && <div><b>Amendment in progress:</b> {wp.filing.amendments.at(-1)!.reason}</div>}
        </div>
      )}
      <div className="grid-main">
        <div>
          <Section title="Gates (firm required steps)">
            {gates.map((g) => (
              <a key={g.id} href={g.go} className={'gate ' + (g.ok ? 'ok' : g.blocking ? 'bad' : 'warn')}>
                <span className="g-i">{g.ok ? '✓' : g.blocking ? '✕' : '!'}</span>
                <span className="g-l">{g.label}</span>
                <span className="g-d tiny">{g.detail}</span>
              </a>
            ))}
          </Section>
          <Section title="Actions">
            {!frozen && (
              <>
                <ExtensionRow />
                <div className="act-row">
                  <div><b>1. Send to the client for approval</b><div className="tiny">Locks a fingerprint of the return. Any later change invalidates the approval.</div></div>
                  {requested && requested.payload.hash === returnHash(v, wp) ? <Badge tone="green">sent {fmtDate(requested.simAt)}</Badge> : (
                    <button className="btn sm" disabled={!can(me, 'file') || blockers.length > 0} title={blockers.length ? blockers.map((b) => b.label).join(', ') : ''} onClick={() => act('filing', [], { action: 'approval_requested', hash: returnHash(v, wp), summary })}>
                      Send for approval
                    </button>
                  )}
                </div>
                <div className="act-row">
                  <div><b>2. Client approves and signs Forms 8879 / FTB 8879</b><div className="tiny">In the client portal (switch role to Ngozi or Erik).</div></div>
                  {sig.complete ? <Badge tone="green">both signed {fmtDate(sig.last!.simAt)}</Badge> : sig.signed.length ? <Badge tone="amber">{sig.signed.map((c) => c.name.split(' ')[0]).join(', ')} signed · waiting for {sig.missing.map((c) => c.name.split(' ')[0]).join(', ')}</Badge> : sig.stale ? <Badge tone="red">stale — return changed after signing</Badge> : <Badge tone="neutral">waiting</Badge>}
                </div>
                <div className="act-row">
                  <div><b>3. Transmit e-file (federal, then California)</b><div className="tiny">Paid preparer: {m.staffName(m.p.firm.firm_identity.paid_preparer_signing_returns)} · EFIN {m.p.firm.firm_identity.efin}</div></div>
                  <button className="btn sm primary" disabled={!can(me, 'file') || !approvalCurrent || blockers.length > 0} title={!approvalCurrent ? 'Needs both spouses’ current signatures' : blockers.map((b) => b.label).join(', ')} onClick={transmit}>
                    Transmit
                  </button>
                </div>
              </>
            )}
            {frozen && (
              <>
                <div className="act-row">
                  <div><b>Record payment / refund</b></div>
                  {([['federal', 'Federal'], ['california', 'CA']] as const).map(([j, name]) => {
                    const bal = (frozen.snapshot.summary ?? summary)[j].balance_due;
                    return bal > 0
                      ? <button key={j} className="btn sm" onClick={() => act('filing', [], { action: 'balance_paid', jurisdiction: j, amount: bal, note: `${name} balance ${fmt(bal)} paid by direct debit` })}>{name} balance paid</button>
                      : <button key={j} className="btn sm" onClick={() => act('filing', [], { action: 'refund_received', jurisdiction: j, amount: -bal, note: `${name} refund ${fmt(-bal)} deposited` })}>{name} refund received</button>;
                  })}
                </div>
                <div className="act-row">
                  <div><b>Amend on top of the filed return</b><div className="tiny">The filed snapshot is never edited.</div></div>
                  <input placeholder="Reason (e.g. corrected 1099)" value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />
                  <button className="btn sm" disabled={!amendReason} onClick={() => act('filing', [], { action: 'amendment_started', reason: amendReason }).then(() => setAmendReason(''))}>Start amendment</button>
                </div>
              </>
            )}
          </Section>
          {fe.some((e) => e.action === 'efile_ack' && e.payload.status === 'rejected') && (
            <Section title="E-file rejection">
              {fe.filter((e) => e.action === 'efile_ack' && e.payload.status !== 'accepted').map((e) => (
                <div key={e.id} className="callout red">{e.payload.jurisdiction}: {e.payload.status} · {(e.payload.errors ?? []).map((x: any) => `${x.code} — ${x.message}`).join('; ')}</div>
              ))}
              <HouseholdFix />
            </Section>
          )}
          {!fe.some((e) => e.action === 'efile_ack' && e.payload.status === 'rejected') && depSsn?.severity === 'error' && (
            <Section title="Household data"><HouseholdFix /></Section>
          )}
        </div>
        <div>
          {frozen ? (
            <Section title="As filed vs amendment layer">
              <SimpleTable
                head={['', 'Filed federal', 'Now federal', 'Filed CA', 'Now CA']}
                rows={([['Total tax', 'total_tax'], ['Payments', 'payments'], ['Balance (+) / refund (−)', 'balance_due']] as const).map(([l, k]) => [l, fmt(frozen.snapshot.summary.federal[k]), fmt(summary.federal[k]), fmt(frozen.snapshot.summary.california[k]), fmt(summary.california[k])])}
                num={[1, 2, 3, 4]}
              />
              <div className="tiny muted">“Filed” is the frozen snapshot ({frozen.hash}); “Now” adds every live adjustment made after filing.</div>
            </Section>
          ) : (
            <Section title="Return to be filed (workpaper)">
              <SimpleTable head={['', 'Federal', 'California']} rows={[['Total tax', fmt(summary.federal.total_tax), fmt(summary.california.total_tax)], ['Payments', fmt(summary.federal.payments), fmt(summary.california.payments)], ['Balance (+) / refund (−)', fmt(summary.federal.balance_due), fmt(summary.california.balance_due)], ['Fingerprint', returnHash(v, wp), '']]} num={[1, 2]} />
            </Section>
          )}
          <Section title="Filing record (this workpaper)">
            {fe.length === 0 && <div className="tiny muted">Nothing filed yet.</div>}
            {fe.map((e) => <div key={e.id} className="logline"><span className="mono tiny">{e.simAt.slice(0, 16).replace('T', ' ')}</span> <b>{e.action.replace(/_/g, ' ')}</b> {e.payload.jurisdiction ?? ''} {e.payload.status ?? ''} {e.payload.note ?? ''} <span className="tiny">· {m.staffName(e.by)}</span></div>)}
          </Section>
          <Section title="Season script (packet timeline and agency records)">
            {scripted.map((t) => <div key={t.id} className={'logline' + (t.at > clock ? ' future' : '')}><span className="mono tiny">{t.at.slice(0, 10)}</span> {t.event.replace(/_/g, ' ')} {t.detail ? <span className="tiny">— {t.detail}</span> : ''}</div>)}
            {agencyEfile.map((x: any) => <div key={x.submission_id} className="logline"><Badge tone={x.status === 'accepted' ? 'green' : 'red'}>{x.jurisdiction} {x.status}</Badge> <span className="mono tiny">{x.submission_id}</span> {(x.errors ?? []).map((e: any) => e.code).join(', ')}</div>)}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Form 4868 / FTB 3519: payment estimated from the current workpaper, balance rounded up to the next 500 (the packet's rule). */
function ExtensionRow() {
  const { m, wp, clock, me, act } = useApp();
  const { summary } = useFiled();
  const due = m.p.firm.deadlines.find((d) => /original due/i.test(d.what))?.date ?? '2026-04-15';
  const ext = wp.filing.events.filter((e) => e.action === 'extension_filed').at(-1);
  const est = (bal: number) => (bal > 0 ? Math.ceil(bal / 500) * 500 : 0);
  const [fed, setFed] = useState(String(est(summary.federal.balance_due)));
  const [ca, setCa] = useState(String(est(summary.california.balance_due)));
  if (ext) return (
    <div className="act-row">
      <div><b>Extension</b><div className="tiny">{ext.payload.note}</div></div>
      <Badge tone="green">filed {fmtDate(ext.simAt)} · 4868 {fmt(ext.payload.federal)} · 3519 {fmt(ext.payload.california)}</Badge>
    </div>
  );
  const late = clock.slice(0, 10) > due;
  const f = Number(fed), c = Number(ca);
  const bad = !(f >= 0 && c >= 0);
  return (
    <div className="act-row">
      <div>
        <b>Extension (Form 4868 / FTB 3519)</b>
        <div className="tiny">Due {fmtDate(due)}. Estimated from the workpaper balance (federal {fmt(summary.federal.balance_due)}, CA {fmt(summary.california.balance_due)}), rounded up to the next 500. An extension to file is not an extension to pay.</div>
      </div>
      <label className="tiny">4868 <input type="number" min={0} step={500} value={fed} onChange={(e) => setFed(e.target.value)} /></label>
      <label className="tiny">3519 <input type="number" min={0} step={500} value={ca} onChange={(e) => setCa(e.target.value)} /></label>
      <button
        className="btn sm" disabled={!can(me, 'file') || late || bad} title={late ? `Past the original due date (${due})` : !can(me, 'file') ? 'Reviewer or partner files' : ''}
        onClick={() => act('filing', [], { action: 'extension_filed', federal: f, california: c, note: `Form 4868 with ${fmt(f)}; FTB 3519 with ${fmt(c)} (workpaper balance federal ${fmt(summary.federal.balance_due)}, CA ${fmt(summary.california.balance_due)}).` })}
      >
        File extension
      </button>
    </div>
  );
}

function HouseholdFix() {
  const { m, wp, act, clock, me } = useApp();
  const theo = m.p.household.people.find((p) => p.id === 'theo')!;
  const card = m.docs.get('D71')!;
  const fix = wp.householdFixes.get('theo.ssn');
  const have = card.received_at <= clock;
  if (fix) return <div className="callout green">Theo’s SSN corrected by {m.staffName(fix.by)} from <Ref r="D71" /> ({fix.reason}).</div>;
  return (
    <div className="act-row">
      <div>
        <b>Theo’s SSN</b>: organizer <span className="mono">•••-••-{theo.ssn.slice(-4)}</span> · 2024 return <span className="mono">•••-••-{m.p.prior_years.return_2024.dependents[1].ssn.slice(-4)}</span>
        <div className="tiny">{have ? 'Social Security card received (D71).' : 'Ask the client for the Social Security card.'}</div>
      </div>
      <button className="btn sm primary" disabled={!have || !can(me, 'adjust')} onClick={() => act('household_fix', ['household:theo'], { key: 'theo.ssn', value: m.evs.get('ev-1080')!.value, reason: 'Agreed to Social Security card D71 and 2024 return; organizer entry transposed digits', evidence: ['D71', 'ev-1080'] })}>
        Correct from SS card
      </button>
    </div>
  );
}

// ---------------- Notice response ----------------
export function Notice() {
  const { m, v, wp, findings, clock, act, setFocus } = useApp();
  const n = m.p.tax_agency_records.notices.find((x: any) => x.id === 'N-2025-L566');
  const received = n && '2028-01-26T15:00:00Z' <= clock;
  const frozen = wp.filing.frozen;
  const lines = frozen?.snapshot.lines ?? Object.fromEntries(v.lines.map((l) => [l.key, adjustedValue(wp, l.key, l.value)]));
  const items = [
    { title: n?.items_under_examination?.[0] ?? 'Noncash charitable contributions', keys: ['SchA.12', 'F8283.A1.stock', 'F8283.A1.vehicle', 'SchA.14'], docs: ['D65', 'D66'], findings: ['car-gift'] },
    { title: n?.items_under_examination?.[1] ?? 'Schedule C gross receipts', keys: ['SchC.1', 'SchC.31'], docs: ['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'], findings: ['schc-gross'] },
  ];
  const resp = wp.filing.events.filter((e) => e.action === 'notice_response');
  return (
    <div className="page">
      <div className="page-hd">
        <div><div className="eyebrow">{n?.agency} {n?.type} · dated {n?.dated} · response due {n?.response_due}</div><h1>Examination response binder</h1></div>
        <div className="row"><button className="btn" onClick={() => window.print()}>Print binder</button></div>
      </div>
      {!received && <div className="callout amber">The letter arrives 2028-01-26 in the season script. Move the season clock forward to replay it; the binder is assembled from the file as {frozen ? 'filed' : 'it stands now'} either way.</div>}
      {!frozen && <div className="callout">Not yet filed: values below are the current workpaper, not a frozen filing.</div>}
      {items.map((it, i) => (
        <Section key={i} title={`Item ${i + 1}. ${it.title}`}>
          <h4 className="sub">As filed</h4>
          <SimpleTable head={['Line', 'Label', 'As filed']} rows={it.keys.map((k) => [<button key={k} className="link mono" onClick={() => setFocus(k)}>{k}</button>, m.line(v.version, k)?.label ?? '', fmt(lines[k])])} num={[2]} />
          {it.findings.map((id) => { const f = findings.find((x) => x.id === id); return f ? <div key={id}><h4 className="sub">Reconciliation / support</h4><p>{f.explain}</p>{f.table && <SimpleTable head={f.table.head} rows={f.table.rows} />}</div> : null; })}
          <h4 className="sub">Source documents</h4>
          <div className="chips">{it.docs.map((d) => <Ref key={d} r={d} />)}</div>
          <h4 className="sub">How each number was verified</h4>
          {it.keys.flatMap((k) => (wp.verifications.get(k) ?? []).map((x) => <div key={x.id + k} className="logline"><span className="mono">{k}</span> {VERIFY_LABELS[x.method]} — {x.note} · {m.staffName(x.by)} {fmtDate(x.simAt)}</div>))}
          {wp.adjustments.filter((a) => it.keys.includes(a.target)).map((a) => <AdjCard key={a.id} id={a.id} />)}
          {wp.attachments.filter((a) => a.target.some((t) => it.keys.includes(t) || it.docs.includes(t))).map((a) => <AttachmentRow key={a.id} id={a.id} />)}
        </Section>
      ))}
      <Section title="Response record">
        {resp.map((e) => <div key={e.id} className="logline">{fmtDate(e.simAt)} {e.payload.note} · {m.staffName(e.by)}</div>)}
        {!resp.length && <button className="btn sm" onClick={() => act('filing', [], { action: 'notice_response', note: `Response to ${n?.type} assembled from the frozen file (${items.length} items) and sent.` })}>Record response sent</button>}
      </Section>
    </div>
  );
}

// ---------------- Roll forward ----------------
export function RollForward() {
  const { m, v, wp, act } = useApp();
  const live = useFiled().summary;
  // plan from the return as filed; post-filing work is an amendment, not the 2025 tax
  const summary = wp.filing.frozen?.snapshot.summary ?? live;
  const pl = m.p.planning_reference_2026;
  const fedTax = summary.federal.total_tax;
  const q = Math.ceil((fedTax * 1.1) / 4);
  const caTax = summary.california.total_tax;
  const pkg = {
    from: 'Okafor-Lindqvist 2025', generated_from_version: v.version, frozen: wp.filing.frozen?.hash ?? null,
    carryovers_out: v.carryovers_out,
    carried: carriedItems(m, v, wp),
    open_items: [...wp.notes.filter(actionable).map((n) => n.text), ...wp.judgments.filter((j) => j.kind === 'outside_filing').map((j) => `${j.title}: ${j.decision}`)],
    judgments: wp.judgments.map((j) => ({ kind: j.kind, title: j.title, decision: j.decision, authority: j.authority, by: m.staffName(j.by), at: j.simAt })),
    adjustments: wp.adjustments.map((a) => ({ title: a.title, target: a.target, from: a.from, to: a.to, reason: a.reason, authority: a.authority, by: m.staffName(a.by), at: a.simAt, status: a.status, layer: a.layer, decisions: a.decisions.map((d) => ({ ...d, by: m.staffName(d.by) })) })),
    // the whole ledger (every change, who, when, why); attachment bytes left out, identifiers masked
    history: wp.visible.map((e) => (e.type === 'attach' ? { ...e, payload: { ...e.payload, data: undefined } } : e)),
  };
  return (
    <div className="page">
      <div className="page-hd"><div><div className="eyebrow">Next year</div><h1>Roll forward to 2026</h1></div>
        <div className="row">
          <button className="btn primary" onClick={() => { const blob = new Blob([maskIds(JSON.stringify(pkg, null, 2))], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'okafor-lindqvist-2025-rollforward.json'; a.click(); act('filing', [], { action: 'rollforward_exported', note: 'Roll-forward package exported for the 2026 file' }); }}>Export roll-forward package</button>
        </div>
      </div>
      <div className="grid2">
        <div><CarryoverTable /></div>
        <Section title="Plan 2026 estimates">
          <SimpleTable head={['Due', 'Federal (110% of 2025 tax ÷ 4)']} rows={pl.federal_estimate_due_dates.map((d: string) => [d, fmt(q)])} num={[1]} />
          <p className="tiny">{pl.federal_safe_harbor} 2025 total tax ({wp.filing.frozen ? 'as filed' : 'workpaper'}) {fmt(fedTax)}.</p>
          <SimpleTable head={['Due', 'California installment', 'Upper bound (110% × 2025)']} rows={pl.california_estimate_due_dates.map((d: string, i: number) => [d, `${pl.california_installment_percentages[i] * 100}%`, fmt(caTax * 1.1 * pl.california_installment_percentages[i])])} num={[2]} />
          <p className="tiny">{pl.california_safe_harbor} With no residency in 2026, a 90%-of-2026 computation on the Sacramento rental and Ridgeline’s California share will be far lower — compute it before telling the client.</p>
          <ul className="tiny">{pl.known_2026_changes_for_this_household.map((x: string) => <li key={x}>{x}</li>)}</ul>
        </Section>
      </div>
      <Section title="Carried with history"><CarriedList items={pkg.carried} /></Section>
    </div>
  );
}

// ---------------- Client copy ----------------
export function ClientCopy() {
  const { m, v, wp } = useApp();
  const live = useFiled().summary;
  const f = wp.filing.frozen;
  // the client's copy is the return as filed, never the workpaper after filing (amendments live on top)
  const summary = f?.snapshot.summary ?? live;
  const people = m.p.household.people;
  return (
    <div className="clientcopy">
      <div className="row noprint"><button className="btn" onClick={() => window.print()}>Print / save as PDF</button><span className="sp" /><a className="link" href="#/filing">← Filing</a></div>
      <div className="cc-hd">
        <div><h1>2025 Tax Returns — Client Copy</h1><div>{people[0].name} and {people[1].name} · Married filing jointly</div></div>
        <div className="tiny">Miraflores · {m.p.firm.firm_identity.address}<br />{f ? `Filed electronically ${fmtDate(f.simAt)} · ref ${f.hash}` : 'DRAFT — not yet filed'}</div>
      </div>
      <SimpleTable head={['', 'Federal Form 1040', 'California Form 540NR']} rows={[
        ['Total tax', fmt(summary.federal.total_tax), fmt(summary.california.total_tax)],
        ['Payments and credits', fmt(summary.federal.payments), fmt(summary.california.payments)],
        [summary.federal.balance_due >= 0 ? 'Amount you owe' : 'Refund', fmt(Math.abs(summary.federal.balance_due)), `${summary.california.balance_due < 0 ? 'Refund ' : 'Owe '}${fmt(Math.abs(summary.california.balance_due))}`],
      ]} num={[1, 2]} />
      <h3>Dependents</h3>
      <SimpleTable head={['Name', 'SSN', 'Relationship']} rows={people.filter((p) => p.role === 'dependent').map((p) => [p.name, `•••-••-${(wp.householdFixes.get(`${p.id}.ssn`)?.value ?? p.ssn).slice(-4)}`, p.relationship])} />
      <h3>What you need to do</h3>
      <ul>{clientTodos(m, v, wp).map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="tiny">Amounts reflect the return as prepared by Miraflores. Full forms are attached in the client portal.</p>
    </div>
  );
}

export { lineArea, findingStatus };
