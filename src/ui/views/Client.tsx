import { useState } from 'react';
import { useApp } from '../ctx';
import { fmtDate } from '../../data/model';
import { returnHash } from '../../logic/rules';
import { Badge, Section, SimpleTable, fmt } from '../components/bits';
import { ClientCopy } from './Filing';

export function ClientPortal() {
  const { m, v, wp, me, act, clock } = useApp();
  const [ans, setAns] = useState<Record<string, string>>({});
  const [pin, setPin] = useState('');
  const [agree, setAgree] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const open = wp.questions.filter((q) => q.to === 'client' && q.status === 'open');
  const done = wp.questions.filter((q) => q.to === 'client' && q.status === 'answered');
  const req = wp.filing.events.filter((e) => e.action === 'approval_requested').at(-1);
  const current = req && req.payload.hash === returnHash(v, wp);
  const approved = wp.filing.events.filter((e) => e.action === 'client_approved').at(-1);
  const myDocs = m.p.documents.filter((d) => d.uploaded_by === 'client' && d.received_at <= clock);
  const uploads = wp.attachments.filter((a) => a.target.includes('client-upload'));
  const stage = wp.filing.frozen ? 'Filed' : approved ? 'Approved — being filed' : current ? 'Ready for your approval' : 'Your preparer is working on it';
  const upload = (f: File, target: string[]) => {
    const r = new FileReader();
    r.onload = () => act('attach', target, { name: f.name, mime: f.type, size: f.size, data: r.result, kind: 'file' });
    r.readAsDataURL(f);
  };
  if (showCopy) return <div><button className="btn" onClick={() => setShowCopy(false)}>← Back</button><ClientCopy /></div>;
  return (
    <div className="page portal">
      <div className="page-hd">
        <div><div className="eyebrow">Client portal · {me.name}</div><h1>Your 2025 tax return</h1><div className="stage"><Badge tone={wp.filing.frozen ? 'green' : 'blue'}>{stage}</Badge></div></div>
      </div>
      <Section title={`Questions for you (${open.length})`}>
        {open.length === 0 && <div className="tiny muted">Nothing needed from you right now.</div>}
        {open.map((q) => (
          <div key={q.id} className="note">
            <div className="tiny muted">{m.staffName(q.by)} asked {fmtDate(q.simAt)}</div>
            <div>{q.text}</div>
            <textarea rows={2} placeholder="Your answer" value={ans[q.id] ?? ''} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} />
            <div className="row">
              <label className="drop sm"><input type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], q.target.length ? q.target : ['client-upload'])} />Attach a file</label>
              <span className="sp" />
              <button className="btn primary sm" onClick={() => ans[q.id] && act('answer', q.target, { questionId: q.id, text: ans[q.id] })}>Send answer</button>
            </div>
          </div>
        ))}
        {done.length > 0 && <details><summary className="tiny">Answered ({done.length})</summary>{done.map((q) => <div key={q.id} className="logline">{q.text}<div className="answer">↳ {q.answer!.text}</div></div>)}</details>}
      </Section>
      <Section title="Review and sign">
        {!req && <div className="tiny muted">We will send the return for your review when it is ready.</div>}
        {req && !current && !approved && <div className="callout amber">Your preparer changed the return after sending it; a new version is coming.</div>}
        {req && current && (
          <>
            <SimpleTable head={['', 'Federal', 'California']} rows={[['Total tax', fmt(req.payload.summary.federal.total_tax), fmt(req.payload.summary.california.total_tax)], ['Already paid', fmt(req.payload.summary.federal.payments), fmt(req.payload.summary.california.payments)], ['You owe (+) / refund (−)', fmt(req.payload.summary.federal.balance_due), fmt(req.payload.summary.california.balance_due)]]} num={[1, 2]} />
            <h4 className="sub">Where the return differs from what you told us</h4>
            <ul className="tiny">
              <li>You sold investments: 282 brokerage sales (mostly automatic trades in the Brightpath account) and 12 crypto sales are reported.</li>
              <li>Your Q4 federal estimate was 3,000 (IRS record), not 4,000.</li>
              <li>The car donation is limited to the 2,900 the charity sold it for.</li>
              <li>Erik’s health insurance is not deductible because he could have joined Ngozi’s employer plan.</li>
              <li>The 09/15/2025 California payment was marked for 2024; we asked FTB to refund it.</li>
            </ul>
            {approved && approved.payload.hash === req.payload.hash ? (
              <div className="callout green">Signed {fmtDate(approved.simAt)} by {m.staffName(approved.by)}. Thank you.</div>
            ) : (
              <div className="form">
                <label className="tiny"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have examined the return and, to the best of my knowledge, it is true, correct and complete. I authorize Miraflores (ERO) to file it (Forms 8879 and FTB 8879).</label>
                <div className="row">
                  <input placeholder="Your 5-digit signature PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))} />
                  <button className="btn primary" disabled={!agree || pin.length !== 5} onClick={() => act('filing', [], { action: 'client_approved', hash: req.payload.hash, pin_last: pin.slice(-1), signer: me.id, note: `8879 / FTB 8879 signed (prior-year AGI ${fmt(m.p.household.prior_year_agi_for_esignature)} verified)` })}>Approve and sign</button>
                </div>
                <div className="tiny muted">Both spouses sign; the PIN is stored masked.</div>
              </div>
            )}
          </>
        )}
        {wp.filing.frozen && <button className="btn" onClick={() => setShowCopy(true)}>Your client copy</button>}
      </Section>
      <Section title="Your documents">
        <div className="row"><label className="drop"><input type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], ['client-upload'])} />Upload a document</label></div>
        <SimpleTable head={['Document', 'Received']} rows={[...myDocs.map((d) => [d.title, fmtDate(d.received_at)]), ...uploads.map((u) => [u.name, fmtDate(u.simAt)])]} />
        {m.p.documents.some((d) => d.id === 'D37' && d.received_at > clock) && <div className="callout amber">Still expected: Ridgeline Real Estate Fund III K-1 (usually June).</div>}
      </Section>
    </div>
  );
}
