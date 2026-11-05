import { useState } from 'react';
import { useApp } from '../ctx';
import { AREAS, fmtDate, fmtDateTime } from '../../data/model';
import { findingStatus } from '../../logic/checks';
import { can, readiness, ROLE_LABEL } from '../../logic/rules';
import { Badge, Person, Section, SimpleTable, Tabs, fmt, Sensitive } from '../components/bits';

export function Firm({ tab }: { tab: string }) {
  const { go, me } = useApp();
  return (
    <div className="page">
      <div className="page-hd"><div><div className="eyebrow">Miraflores · firm</div><h1>Firm</h1></div>{!can(me, 'standards') && <Badge tone="neutral">read-only for {ROLE_LABEL[me.role]}</Badge>}</div>
      <Tabs value={tab} onChange={(t) => go(`#/firm/${t}`)} tabs={[{ id: 'status', label: 'Status' }, { id: 'standards', label: 'Standards' }, { id: 'assign', label: 'Assignments' }, { id: 'time', label: 'Time vs budget' }, { id: 'staff', label: 'Staff & roles' }, { id: 'access', label: 'Sensitive-data log' }]} />
      {tab === 'status' && <Status />}
      {tab === 'standards' && <Standards />}
      {tab === 'assign' && <Assign />}
      {tab === 'time' && <Time />}
      {tab === 'staff' && <Staff />}
      {tab === 'access' && <Access />}
    </div>
  );
}

function Status() {
  const { m, v, wp, findings, clock } = useApp();
  const gates = readiness(m, v, wp, findings, clock, m.p.what_if.alternatives);
  const stage = wp.filing.frozen ? 'Filed' : wp.filing.events.some((e) => e.action === 'client_approved') ? 'Client approved' : wp.signoffs.some((s) => s.level === 'partner') ? 'Partner review' : wp.signoffs.some((s) => s.level === 'reviewer') ? 'In review' : wp.visible.length ? 'In preparation' : 'Not started';
  const hours = wp.time.reduce((s, t) => s + t.hours, 0);
  const budget = Object.values(m.p.firm.budget_hours).reduce((a, b) => a + b, 0);
  return (
    <>
      <SimpleTable
        head={['Client', 'Return', 'Stage', 'Due', 'Gates', 'Open checks', 'Hours / budget', 'Retain until']}
        rows={[[m.p.packet.client_id + ' Okafor-Lindqvist', '2025 1040 + CA 540NR', stage, wp.filing.frozen ? '—' : '2026-10-15 (extended)', `${gates.filter((g) => g.ok).length}/${gates.length}`, findings.filter((f) => findingStatus(f, wp) === 'open' && f.severity !== 'info').length, `${hours.toFixed(1)} / ${budget}`, wp.filing.frozen ? `${Number(wp.filing.frozen.simAt.slice(0, 4)) + 7}${wp.filing.frozen.simAt.slice(4, 10)}` : '7 years after filing']]}
      />
      <p className="tiny muted">One client in this prototype; the same row model lists every engagement. Retention: “Records are retained 7 years after filing, then destroyed” — the destroy date is computed from the freeze event.</p>
    </>
  );
}

function Standards() {
  const { wp, me, act } = useApp();
  const s = wp.standards;
  const editable = can(me, 'standards');
  const [pct, setPct] = useState(String(s.variance_review.flag_if_change_over_percent));
  const [amt, setAmt] = useState(String(s.variance_review.and_over_amount));
  const [rule, setRule] = useState('');
  const [vt, setVt] = useState('');
  return (
    <>
      <Section title="Prior-year variance review">
        <div className="row">
          Flag if change over <input disabled={!editable} value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 60 }} /> % and over <input disabled={!editable} value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 80 }} />
          {editable && <button className="btn sm" onClick={() => act('standards', [], { path: 'variance_review', value: { ...s.variance_review, flag_if_change_over_percent: +pct, and_over_amount: +amt } })}>Save</button>}
        </div>
      </Section>
      <Section title="Rules (enforced)">
        {(s.rules as string[]).map((r, i) => (
          <div key={i} className="logline">
            {r}
            {editable && <button className="link tiny" onClick={() => act('standards', [], { path: 'rules', value: (s.rules as string[]).filter((_, j) => j !== i) })}> remove</button>}
          </div>
        ))}
        {editable && (
          <div className="row">
            <input placeholder="Add a rule (e.g. Any adjustment with a tax effect over 500 …)" value={rule} onChange={(e) => setRule(e.target.value)} />
            <button className="btn sm" onClick={() => rule && act('standards', [], { path: 'rules', value: [...s.rules, rule] }).then(() => setRule(''))}>Add</button>
          </div>
        )}
        <p className="tiny muted">The partner threshold is read from the rule text (“tax effect over N”); editing it changes who can approve adjustments immediately, everywhere.</p>
      </Section>
      <Section title="Verification types">
        <div className="chips">{(s.verification_types as string[]).map((t) => <Badge key={t}>{t.replace(/_/g, ' ')}</Badge>)}</div>
        {editable && <div className="row"><input placeholder="new_type" value={vt} onChange={(e) => setVt(e.target.value)} /><button className="btn sm" onClick={() => vt && act('standards', [], { path: 'verification_types', value: [...s.verification_types, vt] }).then(() => setVt(''))}>Add</button></div>}
      </Section>
      <Section title="Required steps (become filing gates)">
        <ol>{(s.required_steps as string[]).map((r) => <li key={r}>{r}</li>)}</ol>
      </Section>
    </>
  );
}

function Assign() {
  const { m, wp, me, act } = useApp();
  const editable = can(me, 'assign') && (me.role === 'firm_administrator' || me.role === 'partner');
  const staff = m.staff;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Area</th><th>Preparer</th><th>Reviewer</th><th>Partner</th><th>Due</th></tr></thead>
        <tbody>
          {AREAS.map((a) => {
            const x = wp.assignments.get(a.id) ?? {};
            const sel = (role: 'preparer' | 'reviewer' | 'partner') => (
              <select disabled={!editable} value={(x as any)[role] ?? ''} onChange={(e) => act('assign', [a.id], { area: a.id, set: { [role]: e.target.value } })}>
                <option value="">—</option>
                {staff.filter((s) => (role === 'preparer' ? ['preparer', 'reviewer'] : role === 'reviewer' ? ['reviewer', 'partner'] : ['partner']).includes(s.role)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            );
            return (
              <tr key={a.id}>
                <td>{a.name}</td><td>{sel('preparer')}</td><td>{sel('reviewer')}</td><td>{sel('partner')}</td>
                <td><input disabled={!editable} type="date" value={x.due ?? ''} onChange={(e) => act('assign', [a.id], { area: a.id, set: { due: e.target.value } })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tiny muted">Assignment changes notify the assignee (their “What changed” feed) and are part of the ledger.</p>
    </div>
  );
}

function Time() {
  const { m, wp } = useApp();
  const people = [...new Set(wp.time.map((t) => t.by))];
  return (
    <SimpleTable
      head={['Area', 'Budget', ...people.map((p) => m.staffName(p)), 'Total', 'Variance']}
      rows={AREAS.map((a) => {
        const b = m.p.firm.budget_hours[a.budget] ?? 0;
        const per = people.map((p) => wp.time.filter((t) => t.area === a.id && t.by === p).reduce((s, t) => s + t.hours, 0));
        const tot = per.reduce((s, x) => s + x, 0);
        return [a.name, b, ...per.map((x) => x.toFixed(1)), tot.toFixed(1), <span key="v" className={tot > b ? 'warn' : 'ok'}>{(tot - b).toFixed(1)}</span>];
      })}
      num={[1, 2, 3, 4, 5]}
    />
  );
}

function Staff() {
  const { m } = useApp();
  return (
    <SimpleTable
      head={['Person', 'Role', 'Credential', 'Clearance', 'Active from', 'PTIN', 'Note']}
      rows={m.staff.map((s) => [<Person key={s.id} id={s.id} />, ROLE_LABEL[s.role], s.credential ?? '', s.sensitive_data_clearance ? <Badge key="c" tone="green">cleared</Badge> : <Badge key="c" tone="red">masked</Badge>, s.active_from, m.p.firm.firm_identity.ptins[s.id] ?? '', s.note ?? ''])}
    />
  );
}

function Access() {
  const { m, wp } = useApp();
  return (
    <>
      <p className="lead">Every reveal of an SSN, account number, bank number or IP PIN is logged. Staff without clearance cannot reveal.</p>
      {wp.viewLog.length === 0 && <div className="empty">No sensitive data has been revealed.</div>}
      <SimpleTable head={['When (wall clock)', 'Season', 'Who', 'Field', 'Item']} rows={wp.viewLog.slice().reverse().map((x) => [fmtDateTime(x.at), fmtDate(x.simAt), m.staffName(x.by), x.field, x.target])} />
      <Section title="Household (masked)">
        <SimpleTable head={['Person', 'SSN', 'IP PIN']} rows={m.p.household.people.map((p) => [p.name, <Sensitive key="s" value={p.ssn} field={`${p.id}.ssn`} target={`household:${p.id}`} />, p.ip_pin ? <Sensitive key="p" value={p.ip_pin} field={`${p.id}.ip_pin`} target={`household:${p.id}`} /> : '—'])} />
        <div className="row">Refund account: <Sensitive value={m.p.household.bank_account_for_refund_or_payment.account} field="bank.account" target="household:bank" /> routing <Sensitive value={m.p.household.bank_account_for_refund_or_payment.routing} field="bank.routing" target="household:bank" /></div>
      </Section>
    </>
  );
}
export { fmt };
