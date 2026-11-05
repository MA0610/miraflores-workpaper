import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Packet } from './data/types';
import { Store } from './ledger/store';
import { AppProvider } from './ui/ctx';
import { App } from './ui/App';
import './styles.css';

const store = new Store();

function Boot() {
  const [packet, setPacket] = useState<Packet | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    // The packet is loaded exactly as delivered; nothing in it is modified.
    Promise.all([fetch('/packet.json').then((r) => (r.ok ? r.json() : Promise.reject(r.statusText))), store.init()])
      .then(([p]) => setPacket(p))
      .catch((e) => setErr(String(e)));
  }, []);
  if (err)
    return (
      <div className="boot">
        <p>Could not load /packet.json ({err}). Choose the packet file:</p>
        <input type="file" accept=".json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await store.init(); setPacket(JSON.parse(await f.text())); } }} />
      </div>
    );
  if (!packet) return <div className="boot">Loading the Okafor-Lindqvist packet…</div>;
  return (
    <AppProvider packet={packet} store={store}>
      <App />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>
);
