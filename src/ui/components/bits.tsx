import { useState, type ReactNode } from 'react';
import { useApp } from '../ctx';
import { fmtDate } from '../../data/model';

export const fmt = (v: any, cents = false) => {
  if (typeof v !== 'number') return v == null || v === '' ? '—' : String(v);
  if (Math.abs(v) < 1 && v !== 0 && !cents) return v.toFixed(4);
  return v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};

export function Money({ v, cents, signed, muted }: { v: any; cents?: boolean; signed?: boolean; muted?: boolean }) {
  if (typeof v !== 'number') return <span className={'num' + (muted ? ' muted' : '')}>{fmt(v)}</span>;
  const s = signed && v > 0 ? '+' : '';
  return <span className={'num' + (v < 0 ? ' neg' : '') + (muted ? ' muted' : '')}>{s + fmt(v, cents)}</span>;
}

export function Delta({ v }: { v: number }) {
  if (!v) return <span className="num muted">0</span>;
  return <span className={'num delta ' + (v > 0 ? 'up' : 'down')}>{v > 0 ? '+' : ''}{fmt(Math.round(v))}</span>;
}

const KIND_ICON: Record<string, string> = { ev: '◉', doc: '▤', page: '▤', line: '∑', qa: '?', msg: '✉', call: '☎', py: '↶', agency: '⚑', asset: '⌂', household: '☺', param: '⚙', fx: '¤', timeline: '◷', version: 'v', unknown: '·' };

/** A clickable reference to anything in the packet or the workpaper. */
export function Ref({ r, label, compact }: { r: string; label?: string; compact?: boolean }) {
  const { m, v, setFocus, go } = useApp();
  const x = m.resolve(r, v.version);
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (x.kind === 'doc' || x.kind === 'page') go(`#/doc/${x.docId}${x.page ? `/${x.page}` : ''}`);
    else setFocus(r);
  };
  return (
    <button className={`ref ref-${x.kind}`} onClick={click} title={`${x.title}${x.detail ? ' — ' + x.detail : ''}`}>
      <span className="ref-i">{KIND_ICON[x.kind]}</span>
      {label ?? (compact ? r : `${r}${x.kind !== 'line' && x.kind !== 'unknown' ? ' · ' + truncate(x.title, 38) : ''}`)}
    </button>
  );
}
export const truncate = (s: string, n: number) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: string; title?: string }) {
  return <span className={`badge b-${tone}`} title={title}>{children}</span>;
}

export const SEV_TONE: Record<string, string> = { error: 'red', warning: 'amber', info: 'blue', pass: 'green' };

export function Person({ id, small }: { id: string; small?: boolean }) {
  const { m } = useApp();
  const name = m.staffName(id);
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <span className={'person' + (small ? ' small' : '')} title={name}>
      <span className={`avatar av-${id}`}>{initials}</span>
      {!small && <span>{name}</span>}
    </span>
  );
}

export function When({ at }: { at: string }) {
  return <span className="when">{fmtDate(at)}</span>;
}

/** SSNs, bank and account numbers, IP PINs: masked unless the viewer is cleared; every reveal is logged. */
export function Sensitive({ value, field, target }: { value: string; field: string; target: string }) {
  const { me, act } = useApp();
  const [shown, setShown] = useState(false);
  if (!value) return <span>—</span>;
  const masked = value.replace(/[0-9A-Za-z](?=[0-9A-Za-z -]{4})/g, '•');
  if (shown) return <span className="mono sensitive shown">{value}</span>;
  return (
    <span className="mono sensitive">
      {masked}{' '}
      {me.clearance ? (
        <button
          className="link tiny"
          onClick={() => {
            act('view_sensitive', [target], { field });
            setShown(true);
          }}
          title="Reveal (logged)"
        >
          reveal
        </button>
      ) : (
        <span className="tiny muted" title="No sensitive-data clearance">masked</span>
      )}
    </span>
  );
}

export function Section({ title, right, children, id }: { title: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="section" id={id}>
      <header>
        <h3>{title}</h3>
        <div className="sp" />
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={'tab' + (t.id === value ? ' on' : '')} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SimpleTable({ head, rows, num = [] }: { head: string[]; rows: ReactNode[][]; num?: number[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={num.includes(i) ? 'r' : ''}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={num.includes(j) ? 'r num' : ''}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
