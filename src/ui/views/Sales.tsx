import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { adjustedValue } from '../../logic/rules';
import { Badge, Money, SimpleTable, fmt } from '../components/bits';

const BOX: Record<string, string> = { A: 'ST covered', B: 'ST noncovered', D: 'LT covered', E: 'LT noncovered', F: 'LT other (S corp excess distribution)', H: 'ST digital, basis not reported', K: 'LT digital, basis not reported' };
const num = (s?: string) => (s ? Number(s.replace(/,/g, '')) : 0);

export function Sales() {
  const { m, v, wp, setFocus, actMany, me, findings } = useApp();
  const lots = useMemo(
    () =>
      v.lines
        .filter((l) => l.form === 'F8949' && !l.key.endsWith('.total'))
        .map((l) => {
          const box = l.line.split('.')[0];
          const ev = l.sources.map((s) => m.evs.get(s)).find(Boolean);
          const doc = ev ? m.docs.get(ev.document_id) : undefined;
          return {
            key: l.key,
            box,
            desc: l.label.split(' (acquired')[0],
            acq: l.label.match(/acquired (\S+?),/)?.[1] ?? '',
            sold: l.label.match(/sold (\S+?);/)?.[1] ?? '',
            proceeds: num(l.label.match(/proceeds ([\d,.]+)/)?.[1]),
            basis: num(l.label.match(/basis ([\d,.]+)/)?.[1]),
            adj: l.label.match(/adjustment (\w) (-?[\d,.]+)/),
            gain: l.value as number,
            broker: doc ? (doc.issuer ?? doc.title.split(' 20')[0]) : 'Woodworks K-1 / F7203',
            docId: doc?.id,
          };
        }),
    [v, m]
  );
  const [box, setBox] = useState('');
  const [broker, setBroker] = useState('');
  const [ex, setEx] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<'sold' | 'gain' | 'proceeds'>('sold');
  const flagged = new Set(findings.flatMap((f) => (f.severity !== 'pass' ? [...f.lines, ...(f.proposals?.map((p) => p.target) ?? [])] : [])));
  const filtered = lots
    .filter((x) => (!box || x.box === box) && (!broker || x.broker === broker) && (!q || x.desc.toLowerCase().includes(q.toLowerCase())))
    .filter((x) => {
      if (ex === 'zero') return x.basis === 0;
      if (ex === 'wash') return !!x.adj && x.adj[1] === 'W';
      if (ex === 'flag') return flagged.has(x.key) || wp.adjustments.some((a) => a.target === x.key);
      if (ex === 'unverified') return !wp.verifications.has(x.key);
      if (ex === 'loss') return x.gain < 0;
      if (ex === 'big') return Math.abs(x.gain) >= 1000;
      return true;
    })
    .sort((a, b) => (sort === 'sold' ? (a.sold < b.sold ? -1 : 1) : sort === 'gain' ? Math.abs(b.gain) - Math.abs(a.gain) : b.proceeds - a.proceeds));
  const per = 50;
  const brokers = [...new Set(lots.map((x) => x.broker))];
  const byBroker = brokers.map((b) => {
    const xs = lots.filter((x) => x.broker === b);
    return [b, xs.length, fmt(xs.reduce((s, x) => s + x.proceeds, 0), true), fmt(xs.reduce((s, x) => s + x.basis, 0), true), fmt(xs.reduce((s, x) => s + x.gain, 0), true), xs.filter((x) => wp.verifications.has(x.key)).length];
  });
  const boxes = [...new Set(lots.map((x) => x.box))].sort();
  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="eyebrow">Form 8949 / Schedule D · {lots.length} dispositions</div>
          <h1>Sales detail — review by exception</h1>
        </div>
      </div>
      <div className="grid2">
        <div>
          <h4 className="sub">By source</h4>
          <SimpleTable head={['Source', 'Lots', 'Proceeds', 'Basis', 'Gain', 'Verified']} rows={byBroker} num={[1, 2, 3, 4, 5]} />
        </div>
        <div>
          <h4 className="sub">By 8949 box</h4>
          <SimpleTable
            head={['Box', 'Lots', 'Gain (engine)', 'Totals line']}
            rows={boxes.map((b) => [`${b} — ${BOX[b] ?? ''}`, lots.filter((x) => x.box === b).length, fmt(m.line(v.version, `F8949.${b}.total`)?.value), <button key={b} className="link tiny" onClick={() => setFocus(`F8949.${b}.total`)}>F8949.{b}.total</button>])}
            num={[1, 2]}
          />
        </div>
      </div>
      <div className="row toolbar">
        <select value={broker} onChange={(e) => { setBroker(e.target.value); setPage(0); }}><option value="">All sources</option>{brokers.map((b) => <option key={b}>{b}</option>)}</select>
        <select value={box} onChange={(e) => { setBox(e.target.value); setPage(0); }}><option value="">All boxes</option>{boxes.map((b) => <option key={b} value={b}>{b} — {BOX[b]}</option>)}</select>
        <div className="seg">
          {[['', 'All'], ['flag', 'Flagged by checks'], ['zero', 'Zero basis'], ['wash', 'Wash sales'], ['loss', 'Losses'], ['big', '≥ 1,000'], ['unverified', 'Unverified']].map(([id, l]) => <button key={id} className={ex === id ? 'on' : ''} onClick={() => { setEx(id); setPage(0); }}>{l}</button>)}
        </div>
        <input placeholder="Security…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value as any)}><option value="sold">Sort: date sold</option><option value="gain">Sort: |gain|</option><option value="proceeds">Sort: proceeds</option></select>
        <span className="sp" />
        {me.role !== 'client' && (
          <button className="btn sm primary" disabled={!filtered.length} onClick={() => actMany([{ type: 'verify', target: filtered.map((x) => x.key), payload: { method: 'recalculated', note: `Bulk: ${filtered.length} lots recalculated (filter: ${[broker, box, ex, q].filter(Boolean).join(', ') || 'all'})` } }])}>
            Verify {filtered.length} shown
          </button>
        )}
      </div>
      <div className="tiny muted">Totals of the filtered set: proceeds <Money v={filtered.reduce((s, x) => s + x.proceeds, 0)} cents /> · basis <Money v={filtered.reduce((s, x) => s + x.basis, 0)} cents /> · gain <Money v={filtered.reduce((s, x) => s + x.gain, 0)} cents />. Bulk actions undo as one step (↶ Undo).</div>
      <div className="tbl-wrap">
        <table className="tbl click">
          <thead><tr><th>Line</th><th>Security</th><th>Box</th><th>Acquired</th><th>Sold</th><th className="r">Proceeds</th><th className="r">Basis</th><th>Adj</th><th className="r">Gain</th><th>Proof</th></tr></thead>
          <tbody>
            {filtered.slice(page * per, page * per + per).map((x) => {
              const adj = adjustedValue(wp, x.key, x.gain);
              return (
                <tr key={x.key} onClick={() => setFocus(x.key)} className={flagged.has(x.key) ? 'flag' : ''}>
                  <td className="mono">{x.key.replace('F8949.', '')}</td>
                  <td>{x.desc}</td>
                  <td>{x.box}</td>
                  <td className="tiny">{x.acq}</td>
                  <td className="tiny">{x.sold}</td>
                  <td className="r"><Money v={x.proceeds} cents /></td>
                  <td className="r">{x.basis === 0 ? <Badge tone="red">0.00</Badge> : <Money v={x.basis} cents />}</td>
                  <td className="tiny">{x.adj ? `${x.adj[1]} ${x.adj[2]}` : ''}</td>
                  <td className="r">{adj !== x.gain ? <><s className="muted"><Money v={x.gain} cents /></s> <b><Money v={adj} cents /></b></> : <Money v={x.gain} cents />}</td>
                  <td>{wp.verifications.has(x.key) ? <span className="ok">✓</span> : <span className="muted">○</span>}{flagged.has(x.key) && <span className="warn"> ⚑</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="tiny">{filtered.length ? page * per + 1 : 0}–{Math.min(filtered.length, page * per + per)} of {filtered.length}</span>
        <button className="btn sm" disabled={(page + 1) * per >= filtered.length} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
