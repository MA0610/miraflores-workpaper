import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { AREAS, areaName, lineArea } from '../../data/model';
import type { AdjCategory } from '../../ledger/types';
import { adjEffect, adjustedSummary, sumEffects } from '../../logic/effects';
import { adjustedValue, can } from '../../logic/rules';
import { Badge, Delta, Money, Section, fmt } from '../components/bits';

export function Compare() {
  const { m, v, wp, setFocus } = useApp();
  const options = [...m.versions.map((x) => x.version), 'workpaper', ...(wp.filing.frozen ? ['filed'] : [])];
  const [a, setA] = useState('v2');
  const [b, setB] = useState('workpaper');
  const [area, setArea] = useState('');
  const valuesOf = (id: string): Record<string, any> => {
    if (id === 'workpaper') return Object.fromEntries(v.lines.map((l) => [l.key, adjustedValue(wp, l.key, l.value)]));
    if (id === 'filed') return wp.filing.frozen?.snapshot.lines ?? {};
    return Object.fromEntries(m.version(id).lines.map((l) => [l.key, l.value]));
  };
  const A = valuesOf(a), B = valuesOf(b);
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])];
  const diff = keys
    .filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]))
    .filter((k) => {
      const l = m.line(v.version, k) ?? m.line('v1', k);
      return !area || (l && lineArea(l) === area);
    });
  const label = (k: string) => (m.line(v.version, k) ?? m.line('v1', k) ?? m.line('v2', k))?.label ?? k;
  const sum = (id: string) => (id === 'workpaper' ? adjustedSummary(v, sumEffects(wp.adjustments.filter((x) => x.status !== 'rejected').map((x) => adjEffect(x, v, m.p.what_if.alternatives)))) : id === 'filed' ? wp.filing.frozen?.snapshot.summary : m.version(id).summary);
  const sa = sum(a), sb = sum(b);
  return (
    <div className="page">
      <div className="page-hd">
        <div><div className="eyebrow">Versions</div><h1>Compare versions</h1></div>
        <div className="row">
          <select value={a} onChange={(e) => setA(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select> →
          <select value={b} onChange={(e) => setB(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
          <select value={area} onChange={(e) => setArea(e.target.value)}><option value="">All areas</option>{AREAS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
      </div>
      {sa && sb && (
        <div className="grid2">
          {(['federal', 'california'] as const).map((j) => (
            <div key={j} className="sumcard">
              <h4>{j === 'federal' ? 'Federal' : 'California'}</h4>
              <table className="sumtbl">
                <thead><tr><th /><th className="r">{a}</th><th className="r">{b}</th><th className="r">Δ</th></tr></thead>
                <tbody>
                  {Object.keys((sa as any)[j]).map((k) => (
                    <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="r"><Money v={(sa as any)[j][k]} /></td><td className="r"><Money v={(sb as any)[j][k]} /></td><td className="r"><Delta v={(sb as any)[j][k] - (sa as any)[j][k]} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <Section title={`${diff.length} lines differ`}>
        <div className="tbl-wrap">
          <table className="tbl click">
            <thead><tr><th>Line</th><th>Label</th><th>Area</th><th className="r">{a}</th><th className="r">{b}</th><th className="r">Δ</th></tr></thead>
            <tbody>
              {diff.map((k) => (
                <tr key={k} onClick={() => setFocus(k)}>
                  <td className="mono">{k}</td><td>{label(k)}</td><td className="tiny">{(() => { const l = m.line(v.version, k) ?? m.line('v1', k); return l ? areaName(lineArea(l)) : ''; })()}</td>
                  <td className="r">{A[k] === undefined ? <Badge tone="neutral">absent</Badge> : <Money v={A[k]} />}</td>
                  <td className="r">{B[k] === undefined ? <Badge tone="neutral">absent</Badge> : <Money v={B[k]} />}</td>
                  <td className="r">{typeof A[k] === 'number' && typeof B[k] === 'number' ? <Delta v={B[k] - A[k]} /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">“workpaper” is the current engine version with every live adjustment applied line by line (downstream totals are not re-propagated without the engine; see Overview for the estimated tax effect). “filed” appears once the return is frozen.</p>
      </Section>
    </div>
  );
}

export function WhatIf() {
  const { m, v, wp, me, actMany } = useApp();
  const alts = m.p.what_if.alternatives;
  const live = wp.adjustments.filter((a) => a.status !== 'rejected');
  const [off, setOff] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<AdjCategory>('ltcg');
  const [amt, setAmt] = useState('10000');
  const [ca, setCa] = useState<'rate' | 'ca_source' | 'none'>('rate');
  const scen = useMemo(() => adjustedSummary(v, sumEffects(live.filter((a) => !off.has(a.id)).map((a) => adjEffect(a, v, alts)))), [live, off, v]);
  const sand = adjEffect({ title: '', target: '', area: '', from: 0, to: 0, amount: Number(amt) || 0, category: cat, caTreatment: ca, reason: '' }, v, alts);
  return (
    <div className="page">
      <div className="page-hd"><div><div className="eyebrow">Nothing here changes the return until you adopt it</div><h1>What-ifs</h1></div></div>
      <Section title="Engine alternatives (computed by the engine from v3)">
        <div className="cards">
          {alts.map((w) => {
            const adopted = live.find((a) => a.whatIf === w.id) ?? (wp.judgments.some((j) => j.whatIf === w.id) && !w.changed_lines.length ? { status: 'judgment recorded' } : undefined);
            // alternatives that set the same choice (e.g. equipment: s179 vs macrs) exclude each other
            const clash = !adopted && alts.find((x) => x.id !== w.id && live.some((a) => a.whatIf === x.id) && Object.keys(x.choices ?? {}).some((c) => c in (w.choices ?? {})));
            const first = w.changed_lines[0];
            const area = first ? lineArea(m.line(v.version, first.key)!) : 'tax';
            const judgment = { type: 'judgment' as const, target: first ? [first.key] : [], payload: { area, kind: 'election', title: w.description, decision: `Adopted: federal ${w.federal.total_tax_change}, California ${w.california.total_tax_change}.`, authority: 'Engine what-if ' + w.id, whatIf: w.id } };
            return (
              <div key={w.id} className="card">
                <div className="row"><b>{w.description}</b></div>
                <div className="kv">
                  <div><span className="cap">Federal tax</span><Delta v={w.federal.total_tax_change} /></div>
                  <div><span className="cap">California tax</span><Delta v={w.california.total_tax_change} /></div>
                  <div><span className="cap">Lines changed</span>{w.changed_lines.length}</div>
                </div>
                <details><summary className="tiny">Changed lines</summary>{w.changed_lines.slice(0, 30).map((c: any) => <div key={c.key} className="tiny mono">{c.key}: {fmt(c.old)} → {fmt(c.new)}</div>)}</details>
                {adopted ? <Badge tone="green">adopted ({adopted.status})</Badge> : clash ? <span className="tiny warn">Excludes the adopted alternative “{clash.description}” — reject that adjustment first.</span> : can(me, 'adjust') && (
                  <button className="btn sm" onClick={() => actMany(first ? [
                    { type: 'adjust', target: [first.key], payload: { title: w.description, target: first.key, area, from: first.old, to: first.new, amount: 0, category: 'manual', whatIf: w.id, reason: `Adopt engine alternative ${w.id}.` } },
                    judgment,
                  ] : [judgment])}>{first ? 'Adopt as election' : 'Record as election (no line changes)'}</button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
      <div className="grid2">
        <Section title="Scenario: switch adjustments on and off">
          <div className="kv big">
            <div><span className="cap">Federal balance</span><Money v={scen.federal.balance_due} /></div>
            <div><span className="cap">California balance</span><Money v={scen.california.balance_due} /></div>
          </div>
          {live.map((a) => {
            const e = adjEffect(a, v, alts);
            return (
              <label key={a.id} className="scen">
                <input type="checkbox" checked={!off.has(a.id)} onChange={() => { const s = new Set(off); s.has(a.id) ? s.delete(a.id) : s.add(a.id); setOff(s); }} />
                <span>{a.title}</span><span className="sp" />
                <span className="tiny">Fed <Money v={e.fedTax - e.fedPay} signed /> · CA <Money v={e.caTax - e.caPay} signed /></span>
              </label>
            );
          })}
        </Section>
        <Section title="Sandbox: “what if this changed by…”">
          <div className="form">
            <div className="row">
              <select value={cat} onChange={(e) => setCat(e.target.value as AdjCategory)}>{Object.keys(v.tax_effect_rates).map((k) => <option key={k}>{k}</option>)}<option value="payment_fed">payment_fed</option><option value="credit_fed">credit_fed</option></select>
              <input value={amt} onChange={(e) => setAmt(e.target.value)} />
              <select value={ca} onChange={(e) => setCa(e.target.value as any)}><option value="rate">CA prorated</option><option value="ca_source">CA-source</option><option value="none">no CA</option></select>
            </div>
            <div className="kv big">
              <div><span className="cap">Federal</span><Delta v={sand.fedTax - sand.fedPay} /></div>
              <div><span className="cap">California</span><Delta v={sand.caTax - sand.caPay} /></div>
            </div>
            <div className="tiny muted">Rate per dollar from {v.version}: {cat in v.tax_effect_rates ? `${(v.tax_effect_rates as any)[cat].federal_per_dollar} federal / ${(v.tax_effect_rates as any)[cat].california_per_dollar} CA` : '1:1'}. Large changes can cross brackets and phase-outs.</div>
          </div>
        </Section>
      </div>
    </div>
  );
}
