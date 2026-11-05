import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../ctx';
import { fmtDateTime, locate, maskIds } from '../../data/model';
import type { Doc, EV } from '../../data/types';
import { Badge, Money, Ref, Section, fmt } from './bits';
import { AttachForm, NoteForm, VerifyForm } from './actions';
import { Related } from './Inspector';
import { can } from '../../logic/rules';

/**
 * Rendering a source page is behind one interface. Today pages are simulated from printed_content;
 * a real document supplies an image or PDF canvas as the background, and the same fractional field
 * boxes (extracted_values.position) and value links land on it unchanged.
 */
export interface PageSource {
  kind: 'simulated' | 'image';
  background(doc: Doc, page: number): ReactNode;
}
export const simulatedSource: PageSource = {
  kind: 'simulated',
  background: (doc, page) => <div className="paper-faint">{maskIds(doc.pages.find((p) => p.page === page)?.printed_content ?? '')}</div>,
};
// e.g. export const imageSource: PageSource = { kind: 'image', background: (d, p) => <img src={`/docs/${d.file_name}#${p}`} /> };

function TextPage({ text, evs, focusEv, onPick }: { text: string; evs: EV[]; focusEv?: string | null; onPick: (id: string) => void }) {
  // place every extracted value it can find; overlapping ranges keep the first
  const spans = useMemo(() => {
    const ranges: { s: number; e: number; ev: EV }[] = [];
    for (const ev of evs) {
      const r = locate(ev, text);
      if (r && !ranges.some((x) => r[0] < x.e && r[1] > x.s)) ranges.push({ s: r[0], e: r[1], ev });
    }
    return ranges.sort((a, b) => a.s - b.s);
  }, [text, evs]);
  const parts: ReactNode[] = [];
  let i = 0;
  for (const r of spans) {
    if (r.s > i) parts.push(text.slice(i, r.s));
    const mismatch = typeof r.ev.value === 'number' && r.ev.text_as_read && Math.abs(Number(r.ev.text_as_read.replace(/[,$]/g, '')) - r.ev.value) > 0.005;
    parts.push(
      <mark
        key={r.ev.id}
        id={`hl-${r.ev.id}`}
        className={'hl' + (r.ev.id === focusEv ? ' focus' : '') + (r.ev.confidence < 0.8 ? ' low' : '') + (mismatch ? ' bad' : '')}
        title={`${r.ev.id} · ${r.ev.label} · read “${maskIds(r.ev.text_as_read ?? '')}” → ${maskIds(String(r.ev.value))} · ${Math.round(r.ev.confidence * 100)}%`}
        onClick={() => onPick(r.ev.id)}
      >
        {text.slice(r.s, r.e)}
      </mark>
    );
    i = r.e;
  }
  parts.push(text.slice(i));
  return <div className="paper-text">{parts}</div>;
}

function LayoutPage({ doc, page, evs, focusEv, onPick, source }: { doc: Doc; page: number; evs: EV[]; focusEv?: string | null; onPick: (id: string) => void; source: PageSource }) {
  return (
    <div className="paper-layout">
      {source.background(doc, page)}
      {evs.map((e) => (
        <button
          key={e.id}
          className={'box' + (e.id === focusEv ? ' focus' : '') + (e.confidence < 0.8 ? ' low' : '')}
          style={{ left: `${e.position.x0 * 100}%`, top: `${e.position.y0 * 100}%`, width: `${(e.position.x1 - e.position.x0) * 100}%`, height: `${Math.max(e.position.y1 - e.position.y0, 0.012) * 100}%` }}
          title={`${e.label}: ${maskIds(e.text_as_read || '(blank)')}`}
          onClick={() => onPick(e.id)}
        >
          <span>{e.field}</span>
        </button>
      ))}
    </div>
  );
}

export function DocView({ docId, page: pageProp, focusEv }: { docId: string; page?: number; focusEv?: string | null }) {
  const { m, v, wp, setFocus, act, me, focus, go, clock } = useApp();
  const doc = m.docs.get(docId)!;
  const [page, setPage] = useState(pageProp ?? m.evs.get(focusEv ?? '')?.page ?? 1);
  const [mode, setMode] = useState<'text' | 'layout'>('text');
  const [panel, setPanel] = useState<'' | 'verify' | 'note' | 'attach'>('');
  const [revealed, setRevealed] = useState(false);
  const evs = (m.evsByDoc.get(docId) ?? []).filter((e) => e.page === page);
  const landing = m.landing(docId, v.version);
  const pg = doc.pages.find((p) => p.page === page);
  const disp = wp.dispositions.get(docId);
  const received = doc.received_at <= clock;
  const used = v.documents_used.includes(docId), superseded = v.documents_superseded.includes(docId);
  const pick = (id: string) => setFocus(id);
  const verifs = wp.verifications.get(docId) ?? [];
  const atts = wp.attachments.filter((a) => a.target.includes(docId));
  const pagesWithVals = new Set((m.evsByDoc.get(docId) ?? []).map((e) => e.page));
  const many = doc.pages.length > 12;

  return (
    <div className="docview">
      <div className="doc-head">
        <div>
          <div className="eyebrow">{doc.id} · {doc.document_type} · {doc.belongs_to} · {doc.uploaded_by === 'client' ? 'uploaded by client' : 'from firm'}</div>
          <h2>{doc.title}</h2>
          <div className="meta">
            Received {fmtDateTime(doc.received_at)} · {doc.file_name ?? 'no file name'} · {doc.page_count} page{doc.page_count > 1 ? 's' : ''}
            {doc.marked_corrected && <Badge tone="amber">CORRECTED by issuer</Badge>}
            {!received && <Badge tone="red">not yet received at this point in the season</Badge>}
          </div>
        </div>
        <div className="doc-status">
          {superseded ? <Badge tone="amber">Superseded in {v.version}</Badge> : used ? <Badge tone="green">Used by engine {v.version}</Badge> : <Badge tone="neutral">Not used by engine {v.version}</Badge>}
          {doc.extraction?.status && <Badge tone={doc.extraction.status === 'extracted' ? 'green' : doc.extraction.status === 'partial' ? 'amber' : 'neutral'}>{doc.extraction.status.replace('_', ' ')}</Badge>}
          {verifs.length > 0 && <Badge tone="green">✓ verified ×{verifs.length}</Badge>}
        </div>
      </div>
      {doc.extraction?.reason && <div className="callout amber">Pipeline: {doc.extraction.reason}</div>}

      <div className="doc-body">
        <div className="doc-pages">
          {doc.pages.map((p) => (
            <button key={p.page} className={'pg' + (p.page === page ? ' on' : '') + (pagesWithVals.has(p.page) ? ' has' : '') + (many && !pagesWithVals.has(p.page) && p.page !== doc.page_count && p.page !== page ? ' dim' : '')} onClick={() => setPage(p.page)} title={maskIds(p.printed_content.slice(0, 80))}>
              {p.page}
            </button>
          ))}
        </div>
        <div className="doc-paper">
          <div className="row">
            <div className="seg">
              <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}>Page text</button>
              <button className={mode === 'layout' ? 'on' : ''} onClick={() => setMode('layout')}>Field layout</button>
            </div>
            {pg && maskIds(pg.printed_content) !== pg.printed_content && (revealed ? <Badge tone="amber">identifiers shown (logged)</Badge> : me.clearance ? <button className="link tiny" onClick={() => { act('view_sensitive', [docId], { field: `page ${page} identifiers` }); setRevealed(true); }}>reveal identifiers (logged)</button> : <span className="tiny muted">identifiers masked</span>)}
            <span className="tiny muted">{mode === 'text' ? 'Simulated from printed_content; highlights are the extracted fields. Amber = low confidence, red = read differs from print.' : 'Field boxes at their extracted positions — the same overlay a scanned image or PDF would get.'}</span>
          </div>
          <div className="paper">
            <div className="paper-hd">{doc.issuer ?? doc.title.split(' - ')[0]} <span>Page {page} of {doc.page_count}</span></div>
            {pg && (mode === 'text' ? <TextPage text={revealed ? pg.printed_content : maskIds(pg.printed_content)} evs={evs} focusEv={focusEv ?? focus} onPick={pick} /> : <LayoutPage doc={doc} page={page} evs={evs} focusEv={focusEv ?? focus} onPick={pick} source={simulatedSource} />)}
          </div>
        </div>
        <div className="doc-fields">
          <Section title={`Where it landed (${v.version})`}>
            {landing.landed.length + landing.docLevel.length === 0 && (
              <div className="callout">{superseded ? 'Superseded: no values used.' : disp ? `Accounted for: ${disp.status.replace(/_/g, ' ')} — ${disp.note}` : 'No value from this document reaches the return. Record why below.'}</div>
            )}
            <div className="fieldlist">
              {(m.evsByDoc.get(docId) ?? []).filter((e) => e.page === page || (m.evsByDoc.get(docId)!.length < 40)).slice(0, 120).map((e) => {
                const lines = landing.landed.find((x) => x.ev.id === e.id)?.lines ?? [];
                const vs = wp.verifications.get(e.id)?.length;
                return (
                  <div key={e.id} className={'field' + (e.id === (focusEv ?? focus) ? ' on' : '')} onClick={() => pick(e.id)}>
                    <div className="f-top">
                      <span className="f-label">{e.label}</span>
                      <span className="sp" />
                      <span className={'conf' + (e.confidence < 0.8 ? ' low' : '')}>{Math.round(e.confidence * 100)}%</span>
                    </div>
                    <div className="f-val">{typeof e.value === 'number' ? <Money v={e.value} cents={e.value_type === 'money'} /> : fmt(e.value)} {vs ? <span className="ok">✓</span> : null}</div>
                    <div className="f-lines">{lines.length ? lines.slice(0, 4).map((k) => <Ref key={k} r={k} compact />) : <span className="tiny muted">not on the return</span>}{lines.length > 4 && <span className="tiny">+{lines.length - 4}</span>}</div>
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="Account for this document">
            {disp && <div className="callout green">{disp.status.replace(/_/g, ' ')} · {disp.note} <span className="tiny">— {m.staffName(disp.by)}</span></div>}
            {can(me, 'disposition') && <Disposition docId={docId} />}
          </Section>
          <Section title="Work on this document" right={<div className="seg"><button onClick={() => setPanel('verify')}>Verify</button><button onClick={() => setPanel('note')}>Note</button><button onClick={() => setPanel('attach')}>Attach</button></div>}>
            {panel === 'verify' && <VerifyForm targets={[docId]} onDone={() => setPanel('')} />}
            {panel === 'note' && <NoteForm targets={[docId]} onDone={() => setPanel('')} />}
            {panel === 'attach' && <AttachForm targets={[docId]} onDone={() => setPanel('')} />}
            {verifs.map((x) => <div key={x.id} className="logline">✓ {x.method.replace(/_/g, ' ')} — {x.note} <span className="tiny">{m.staffName(x.by)}</span></div>)}
            {atts.map((a) => <div key={a.id} className="logline">📎 {a.name} <span className="tiny">{m.staffName(a.by)}</span></div>)}
            {wp.notes.filter((n) => n.target.includes(docId)).map((n) => <div key={n.id} className="logline">✎ {n.text}</div>)}
            <Related k={docId} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Disposition({ docId }: { docId: string }) {
  const { act } = useApp();
  const [status, setStatus] = useState('supporting');
  const [note, setNote] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        await act('disposition', [docId], { status, note });
        setNote('');
      }}
    >
      <div className="row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {['supporting', 'duplicate', 'superseded', 'reviewed', 'engagement', 'used_for_filing', 'third_party', 'not_relevant', 'outside_scope'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <input placeholder="Why it did or didn’t land" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" type="submit">Record</button>
      </div>
    </form>
  );
}

export function Snippet({ evId }: { evId: string }) {
  const { m, go } = useApp();
  const e = m.evs.get(evId);
  if (!e) return null;
  const d = m.docs.get(e.document_id)!;
  const raw = d.pages.find((p) => p.page === e.page)?.printed_content ?? '';
  const r = locate(e, raw);
  const text = maskIds(raw);
  const s = r ? Math.max(0, r[0] - 90) : 0;
  const end = r ? Math.min(text.length, r[1] + 90) : 180;
  return (
    <div className="snippet" onClick={() => go(`#/doc/${d.id}/${e.page}/${e.id}`)}>
      <div className="snip-hd">{d.id} · {d.title} · page {e.page} · field <b>{e.field}</b></div>
      <div className="snip-body">
        {s > 0 && '…'}
        {r ? (
          <>
            {text.slice(s, r[0])}
            <mark className="hl focus">{text.slice(r[0], r[1])}</mark>
            {text.slice(r[1], end)}
          </>
        ) : (
          text.slice(0, 180)
        )}
        {end < text.length && '…'}
      </div>
      <div className="snip-ft">
        read “{maskIds(e.text_as_read || '(blank)')}” → <b>{fmt(e.value, e.value_type === 'money')}</b> · confidence {Math.round(e.confidence * 100)}%
      </div>
    </div>
  );
}
