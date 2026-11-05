import { useApp } from '../ctx';
import { actionable } from '../../ledger/fold';
import { AREAS, fmtDate, lineArea } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { adjustedSummary } from '../../logic/effects';
import { adjustedValue, readiness, signoffStates } from '../../logic/rules';
import { Badge, Delta, Money, Person, Section, SEV_TONE } from '../components/bits';
import { FindingCard } from '../components/FindingCard';

export function Overview() {
  const { m, v, wp, findings, eff, clock, go } = useApp();
  const approved = adjustedSummary(v, eff.approved);
  const live = adjustedSummary(v, eff.live);
  const py = m.p.prior_years.return_2024.lines;
  const open = findings.filter((f) => findingStatus(f, wp) === 'open' && (f.severity === 'error' || f.severity === 'warning'));
  const order = { error: 0, warning: 1, info: 2, pass: 3 } as const;
  open.sort((a, b) => order[a.severity] - order[b.severity]);
  const gates = readiness(m, v, wp, findings, clock, m.p.what_if.alternatives);
  const passed = gates.filter((g) => g.ok).length;
  const sourced = v.lines.filter((l) => l.sources.length > 0);
  const verified = sourced.filter((l) => wp.verifications.has(l.key) || l.sources.every((s) => wp.verifications.has(s)));
  const checksPass = findings.filter((f) => f.severity === 'pass').length;
  const deadlines = m.p.firm.deadlines.filter((d) => d.date >= clock.slice(0, 10)).slice(0, 4);

  const card = (title: string, rows: [string, number, number, number | undefined][]) => (
    <div className="sumcard">
      <h4>{title}</h4>
      <table className="sumtbl">
        <thead><tr><th /><th className="r">Engine {v.version}</th><th className="r">Workpaper</th><th className="r">2024</th></tr></thead>
        <tbody>
          {rows.map(([l, e, w, p]) => (
            <tr key={l} className={l.startsWith('Balance') || l.startsWith('Refund') ? 'strong' : ''}>
              <td>{l}</td>
              <td className="r"><Money v={e} /></td>
              <td className="r">{w !== e ? <><Money v={w} /> <Delta v={w - e} /></> : <Money v={w} muted />}</td>
              <td className="r">{p !== undefined ? <Money v={p} muted /> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="eyebrow">Return as of {fmtDate(clock)} · engine {v.version} computed {fmtDate(v.computed_at)} · {v.trigger}</div>
          <h1>What this return says, and how much of it is proven</h1>
        </div>
      </div>

      <div className="grid2">
        {card('Federal 1040', [
          ['AGI', v.summary.federal.agi, v.summary.federal.agi, py['F1040.11']],
          ['Taxable income', v.summary.federal.taxable_income, v.summary.federal.taxable_income, py['F1040.15']],
          ['Total tax', v.summary.federal.total_tax, live.federal.total_tax, py['F1040.24']],
          ['Payments', v.summary.federal.payments, live.federal.payments, py['F1040.33']],
          ['Balance due (+) / refund (−)', v.summary.federal.balance_due, live.federal.balance_due, -393],
        ])}
        {card('California 540NR (part-year)', [
          ['Total AGI (CA law)', v.summary.california.total_agi, v.summary.california.total_agi, undefined],
          ['California AGI', v.summary.california.ca_agi, v.summary.california.ca_agi, py['CA540.17']],
          ['Total tax', v.summary.california.total_tax, live.california.total_tax, py['CA540.64']],
          ['Payments', v.summary.california.payments, live.california.payments, undefined],
          ['Balance due (+) / refund (−)', v.summary.california.balance_due, live.california.balance_due, 1240],
        ])}
      </div>
      <div className="tiny muted note-under">
        Workpaper = engine plus every live adjustment ({wp.adjustments.filter((a) => a.status !== 'rejected').length}; {wp.adjustments.filter((a) => a.status === 'approved').length} approved — approved only: federal balance <Money v={approved.federal.balance_due} />, CA <Money v={approved.california.balance_due} />). Effects are per-dollar rates from {v.version} (the engine cannot be rerun); income lines are not re-propagated, only tax and balance. Large changes can cross thresholds — the real system recomputes.
      </div>

      <div className="proofbar">
        <div className="pb"><b>{verified.length}/{sourced.length}</b><span>source-backed lines verified</span></div>
        <div className="pb"><b>{checksPass}</b><span>independent checks pass</span></div>
        <div className="pb bad" onClick={() => go('#/review/checks')}><b>{open.length}</b><span>checks open</span></div>
        <div className="pb" onClick={() => go('#/review/notes')}><b>{wp.notes.filter(actionable).length}</b><span>review notes open ({wp.notes.filter((n) => n.status === 'open' && n.blocking).length} blocking)</span></div>
        <div className="pb" onClick={() => go('#/review/adjustments')}><b>{wp.adjustments.filter((a) => a.status === 'proposed').length}</b><span>adjustments awaiting decision</span></div>
        <div className="pb" onClick={() => go('#/filing')}><b>{passed}/{gates.length}</b><span>filing gates met</span></div>
      </div>

      <div className="grid-main">
        <div>
          <Section title="Needs attention" right={<a href="#/review/checks" className="link tiny">All checks →</a>}>
            {open.length === 0 && <div className="callout green">Nothing open. Every check passes or is resolved.</div>}
            {open.slice(0, 8).map((f) => <FindingCard key={f.id} f={f} />)}
          </Section>
          <Section title="Tax computation">
            <TaxFlow />
          </Section>
        </div>
        <div>
          <Section title="Sign-offs by area">
            <table className="sotbl">
              <thead><tr><th>Area</th><th>Prep</th><th>Rev</th><th>Ptr</th></tr></thead>
              <tbody>
                {AREAS.map((a) => {
                  const s = signoffStates(m, v, wp, a.id, findings, clock);
                  return (
                    <tr key={a.id} onClick={() => go(`#/area/${a.id}`)}>
                      <td>{a.name}</td>
                      {s.map((x) => (
                        <td key={x.level} title={x.reopened ? `Reopened: ${x.changes.slice(0, 5).join('; ')}` : x.signoff ? `Signed by ${m.staffName(x.signoff.by)}` : 'Not signed'}>
                          {x.current ? <span className="so g">✓</span> : x.reopened ? <span className="so r">↺</span> : <span className="so o">·</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="tiny muted">↺ = signed, then what was signed changed (new engine version, document, adjustment or check). Hover for what changed.</div>
          </Section>
          <Section title="Team & deadlines">
            {AREAS.slice(0, 1).map(() => {
              const a = wp.assignments.get('intake') ?? {};
              return (
                <div key="t" className="team">
                  {a.preparer && <div>Preparer <Person id={a.preparer} /></div>}
                  {a.reviewer && <div>Reviewer <Person id={a.reviewer} /></div>}
                  {a.partner && <div>Partner <Person id={a.partner} /></div>}
                  {!a.preparer && <div className="tiny muted">No assignments yet — firm admin assigns areas (Firm → Assignments).</div>}
                </div>
              );
            })}
            {deadlines.map((d) => <div key={d.what} className="logline"><span className="mono">{d.date}</span> {d.what}</div>)}
          </Section>
          <Section title="Engine diagnostics">
            {v.diagnostics.map((d) => {
              const resolved = wp.judgments.find((j) => j.kind === 'diagnostic' && j.target.includes(d.code));
              return (
                <div key={d.code} className="logline">
                  <Badge tone={resolved ? 'green' : d.severity === 'warning' ? 'amber' : 'blue'}>{resolved ? 'resolved' : d.severity}</Badge> <b className="tiny">{d.code}</b> <span className="tiny">{d.message}</span>
                </div>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function TaxFlow() {
  const { m, v, wp, setFocus } = useApp();
  const rows: [string, string, 0 | 1 | 2][] = [
    ['F1040.1z', 'Wages', 1], ['F1040.2b', 'Taxable interest', 1], ['F1040.3b', 'Ordinary dividends', 1], ['F1040.4b', 'IRA (taxable)', 1], ['F1040.7', 'Capital gain', 1], ['F1040.8', 'Schedule 1 income', 1],
    ['F1040.9', 'Total income', 0], ['F1040.10', 'Adjustments', 1], ['F1040.11', 'Adjusted gross income', 0], ['F1040.12', 'Itemized deductions', 1], ['F1040.13', 'QBI deduction', 1], ['F1040.15', 'Taxable income', 0],
    ['F1040.16', 'Tax (Sch D worksheet)', 1], ['F1040.17', 'AMT', 1], ['F1040.19', 'Child / other dependent credit', 1], ['F1040.20', 'Other credits (FTC)', 1], ['F1040.23', 'Other taxes (SE, NIIT, Add’l Medicare)', 1],
    ['F1040.24', 'Total tax', 0], ['F1040.25d', 'Withholding', 1], ['F1040.26', 'Estimated payments', 1], ['F1040.31', 'Extension + excess SS', 1], ['F1040.33', 'Total payments', 0], ['F1040.37', 'Amount owed', 2], ['F1040.38', 'Estimated tax penalty', 1],
  ];
  return (
    <div className="flow">
      {rows.map(([k, label, kind]) => {
        const l = m.line(v.version, k);
        if (!l) return null;
        const adj = adjustedValue(wp, k, l.value);
        const py = m.priorLine(k);
        const touched = wp.adjustments.some((a) => a.status !== 'rejected' && a.target === k);
        const ver = wp.verifications.has(k);
        return (
          <div key={k} className={`flow-row k${kind}`} onClick={() => setFocus(k)}>
            <span className="mono fk">{k}</span>
            <span className="fl">{label}</span>
            <span className="sp" />
            {ver && <span className="ok" title="verified">✓</span>}
            {touched && <span className="adjmark">✎</span>}
            <span className="fpy"><Money v={py} muted /></span>
            <span className="fv"><Money v={adj} /></span>
          </div>
        );
      })}
      <div className="tiny muted">Click any line to see how it was built, its sources and its evidence. Right column: engine {v.version}; grey: 2024 as filed.</div>
    </div>
  );
}
