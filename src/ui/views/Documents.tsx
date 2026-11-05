import { useState } from 'react';
import { useApp } from '../ctx';
import { areaName, docArea, fmtDate } from '../../data/model';
import { Badge } from '../components/bits';
import { DocView } from '../components/DocView';
import { DocStatus } from './Area';

export function DocRoute({ id, page, ev }: { id: string; page?: number; ev?: string }) {
  const { m } = useApp();
  if (!m.docs.get(id)) return <div className="page">Unknown document {id}</div>;
  return (
    <div className="page wide">
      <a className="link tiny" href="#/documents">← Document index</a>
      <DocView key={`${id}-${page}-${ev}`} docId={id} page={page} focusEv={ev} />
    </div>
  );
}

export function Documents() {
  const { m, v, wp, clock, go } = useApp();
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const all = m.p.documents;
  const received = all.filter((d) => d.received_at <= clock);
  const rows = all.filter((d) => {
    const l = m.landing(d.id, v.version);
    if (q && !`${d.id} ${d.title} ${d.document_type}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (f === 'received') return d.received_at <= clock;
    if (f === 'pending') return d.received_at > clock;
    if (f === 'explain') return d.received_at <= clock && !l.landed.length && !wp.dispositions.has(d.id) && !v.documents_superseded.includes(d.id);
    if (f === 'late') return d.received_at > '2026-03-02T22:15:00Z';
    if (f === 'issues') return d.marked_corrected || d.extraction?.status !== 'extracted' || (m.evsByDoc.get(d.id) ?? []).some((e) => e.confidence < 0.8);
    return true;
  });
  const needs = received.filter((d) => !m.landing(d.id, v.version).landed.length && !wp.dispositions.has(d.id) && !v.documents_superseded.includes(d.id));
  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="eyebrow">Document index · completeness</div>
          <h1>Every document, and where it landed</h1>
        </div>
      </div>
      <div className="proofbar">
        <div className="pb"><b>{received.length}/{all.length}</b><span>received by {fmtDate(clock)}</span></div>
        <div className="pb"><b>{received.filter((d) => m.landing(d.id, v.version).landed.length > 0).length}</b><span>have values on the return</span></div>
        <div className="pb"><b>{v.documents_superseded.length}</b><span>superseded</span></div>
        <div className="pb"><b>{wp.dispositions.size}</b><span>accounted for with a reason</span></div>
        <div className={'pb' + (needs.length ? ' bad' : '')} onClick={() => setF('explain')}><b>{needs.length}</b><span>need an explanation</span></div>
      </div>
      <div className="row toolbar">
        <div className="seg">
          {[['all', 'All'], ['received', 'Received'], ['pending', 'Not yet received'], ['explain', 'Need explanation'], ['late', 'Arrived late'], ['issues', 'Corrected / partial / low confidence']].map(([id, l]) => <button key={id} className={f === id ? 'on' : ''} onClick={() => setF(id)}>{l}</button>)}
        </div>
        <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl click">
          <thead><tr><th>ID</th><th>Document</th><th>Area</th><th>Belongs to</th><th>Received</th><th className="r">Values</th><th className="r">Landed</th><th className="r">Lines</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => {
              const l = m.landing(d.id, v.version);
              const nLines = new Set(l.landed.flatMap((x) => x.lines)).size;
              const recv = d.received_at <= clock;
              return (
                <tr key={d.id} onClick={() => go(`#/doc/${d.id}`)} className={recv ? '' : 'future'}>
                  <td className="mono">{d.id}</td>
                  <td>{d.title} {d.marked_corrected && <Badge tone="amber">corrected</Badge>}</td>
                  <td className="tiny">{areaName(docArea(d))}</td>
                  <td className="tiny">{d.belongs_to}</td>
                  <td className="tiny">{fmtDate(d.received_at)}</td>
                  <td className="r">{m.evsByDoc.get(d.id)?.length ?? 0}</td>
                  <td className="r">{l.landed.length}</td>
                  <td className="r">{nLines}</td>
                  <td>{recv ? <DocStatus id={d.id} /> : <Badge tone="neutral">expected</Badge>}</td>
                  <td>{wp.verifications.has(d.id) && <span className="ok">✓</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tiny muted">“Landed” counts extracted values cited by a line in engine {v.version}. Documents with no landed value must be superseded or carry a recorded disposition (duplicate, supporting, engagement…) before filing.</div>
    </div>
  );
}
