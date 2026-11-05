import { useMemo, useState } from 'react';
import { useApp } from '../ctx';
import { maskIds } from '../../data/model';
import { fmt } from '../components/bits';

export function SearchBox() {
  const { m, v, wp, findings, me, setFocus, go } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { kind: string; label: string; sub: string; go: () => void }[] = [];
    const n = Number(s.replace(/,/g, ''));
    const isNum = !isNaN(n) && /\d/.test(s);
    for (const l of v.lines) if (l.key.toLowerCase().includes(s) || l.label.toLowerCase().includes(s) || (isNum && l.value === n)) out.push({ kind: 'Line', label: `${l.key} · ${l.label}`, sub: fmt(l.value), go: () => setFocus(l.key) });
    for (const d of m.p.documents) if (`${d.id} ${d.title} ${d.document_type}`.toLowerCase().includes(s)) out.push({ kind: 'Document', label: `${d.id} · ${d.title}`, sub: d.document_type, go: () => go(`#/doc/${d.id}`) });
    // without clearance, search the masked text too, so a hit can't confirm an identifier
    const pageText = (t: string) => (me.clearance ? t : maskIds(t));
    for (const d of m.p.documents) for (const p of d.pages) if (pageText(p.printed_content).toLowerCase().includes(s) && out.filter((x) => x.kind === 'Page text').length < 12) out.push({ kind: 'Page text', label: `${d.id} p${p.page}`, sub: maskIds(excerpt(pageText(p.printed_content), s)), go: () => go(`#/doc/${d.id}/${p.page}`) });
    for (const e of m.p.extracted_values) if ((isNum && e.value === n) || e.id === s) out.push({ kind: 'Value', label: `${e.id} · ${e.label}`, sub: `${e.document_id} p${e.page} · ${fmt(e.value)}`, go: () => setFocus(e.id) });
    for (const x of m.p.client.questionnaire) if (`${x.id} ${x.question} ${x.answer}`.toLowerCase().includes(s)) out.push({ kind: 'Client answer', label: `${x.id} · ${x.question}`, sub: x.answer, go: () => setFocus(x.id) });
    for (const x of m.p.client.messages) if (`${x.id} ${x.text}`.toLowerCase().includes(s)) out.push({ kind: 'Message', label: `${x.id} · ${x.from}`, sub: x.text, go: () => setFocus(x.id) });
    for (const f of findings) if (f.title.toLowerCase().includes(s)) out.push({ kind: 'Check', label: f.title, sub: f.area, go: () => go(`#/area/${f.area}`) });
    for (const x of wp.notes) if (x.text.toLowerCase().includes(s)) out.push({ kind: 'Note', label: x.text.slice(0, 80), sub: m.staffName(x.by), go: () => go('#/review/notes') });
    for (const a of wp.adjustments) if (`${a.title} ${a.target} ${a.reason} ${a.authority ?? ''}`.toLowerCase().includes(s)) out.push({ kind: 'Adjustment', label: a.title, sub: `${a.target} · ${a.status}`, go: () => go('#/review/adjustments') });
    for (const x of wp.questions) if (`${x.text} ${x.answer?.text ?? ''}`.toLowerCase().includes(s)) out.push({ kind: 'Question', label: x.text.slice(0, 80), sub: x.answer ? `answered by ${m.staffName(x.answer.by)}` : 'open', go: () => go('#/review/questions') });
    for (const x of wp.attachments) if (`${x.name} ${(x as any).note ?? ''}`.toLowerCase().includes(s)) out.push({ kind: 'Attachment', label: x.name, sub: m.staffName(x.by), go: () => setFocus(x.target[0] ?? null) });
    for (const x of wp.judgments) if (`${x.title} ${x.decision}`.toLowerCase().includes(s)) out.push({ kind: 'Judgment', label: x.title, sub: x.kind, go: () => go('#/review/judgments') });
    return out.slice(0, 40);
  }, [q, v, wp, findings, me]);
  return (
    <div className="search">
      <input placeholder="Search lines, documents, page text, amounts, answers, notes…" value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} onChange={(e) => setQ(e.target.value)} />
      {open && res.length > 0 && (
        <div className="pop search-pop">
          {res.map((r, i) => (
            <button key={i} className="sr" onMouseDown={() => { r.go(); setOpen(false); }}>
              <span className="sr-k">{r.kind}</span>
              <span className="sr-l">{r.label}</span>
              <span className="sr-s">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function excerpt(t: string, s: string) {
  const i = t.toLowerCase().indexOf(s);
  return (i > 40 ? '…' : '') + t.slice(Math.max(0, i - 40), i + s.length + 50) + '…';
}
