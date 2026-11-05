// Cloudflare Pages Function: the shared ledger API on the free plan, backed by D1 (SQLite).
// Same endpoints as server/server.mjs, except live updates are polled (POST /api/poll) instead of pushed over SSE.
// Free-plan limits shape this: few queries per request, 100 bound parameters per query, ~2 MB per row.

interface D1Stmt { bind(...v: unknown[]): D1Stmt; all<T = any>(): Promise<{ results: T[] }>; first<T = any>(): Promise<T | null>; run(): Promise<unknown> }
interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown[]> }
interface Ctx { request: Request; env: { DB: D1 }; params: { route?: string[] } }

const ROWS_PER_INSERT = 30; // 3 params per row, D1 allows 100
const PRESENCE_TTL = 20000;
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
// events are stored as JSON text; serverSeq is added on the way out without re-parsing
const withSeq = (rows: { seq: number; body: string }[]) => `[${rows.map((r) => `${r.body.slice(0, -1)},"serverSeq":${r.seq}}`).join(',')}]`;

async function epochOf(db: D1) {
  return (await db.prepare(`SELECT v FROM meta WHERE k = 'epoch'`).first<{ v: number }>())?.v ?? 0;
}

export const onRequest = async ({ request, env, params }: Ctx): Promise<Response> => {
  const db = env.DB;
  const route = (params.route ?? []).join('/');
  const method = request.method;
  try {
    if (route === 'health') {
      const epoch = await db.prepare(`SELECT v FROM meta WHERE k = 'epoch'`).first<{ v: number }>();
      const n = (await db.prepare(`SELECT COUNT(*) AS n FROM events`).first<{ n: number }>())?.n ?? 0;
      // fresh = never used (never reset, no events): the client loads the demo season once
      return json({ ok: true, live: 'poll', fresh: !epoch && n === 0, epoch: epoch?.v ?? 0, events: n });
    }
    if (route === 'events' && method === 'GET') {
      const { results } = await db.prepare(`SELECT seq, body FROM events WHERE epoch = ? ORDER BY seq`).bind(await epochOf(db)).all<{ seq: number; body: string }>();
      return new Response(withSeq(results), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (route === 'events' && method === 'POST') {
      const incoming: any = await request.json();
      const list = (Array.isArray(incoming) ? incoming : [incoming]).filter((e) => e && typeof e.id === 'string');
      const epoch = await epochOf(db);
      const stmts: D1Stmt[] = [];
      for (let i = 0; i < list.length; i += ROWS_PER_INSERT) {
        const chunk = list.slice(i, i + ROWS_PER_INSERT);
        const vals: unknown[] = [];
        for (const e of chunk) {
          const { serverSeq, ...rest } = e;
          vals.push(e.id, epoch, JSON.stringify(rest));
        }
        stmts.push(db.prepare(`INSERT OR IGNORE INTO events (id, epoch, body) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}`).bind(...vals));
      }
      if (stmts.length) await db.batch(stmts);
      return json({ added: list.length });
    }
    if (route === 'poll' && method === 'POST') {
      const { since = 0, epoch: theirs = 0, me }: any = await request.json();
      const now = Date.now();
      const writes: D1Stmt[] = [db.prepare(`DELETE FROM presence WHERE at < ?`).bind(now - PRESENCE_TTL * 3)];
      if (me?.tab) writes.push(db.prepare(`INSERT INTO presence (tab, body, at) VALUES (?, ?, ?) ON CONFLICT(tab) DO UPDATE SET body = excluded.body, at = excluded.at`).bind(String(me.tab), JSON.stringify(me), now));
      await db.batch(writes);
      const epoch = await epochOf(db);
      const after = epoch === theirs ? Number(since) || 0 : 0; // after a reset the client reloads everything
      const [{ results: ev }, { results: pr }] = await Promise.all([
        db.prepare(`SELECT seq, body FROM events WHERE epoch = ? AND seq > ? ORDER BY seq LIMIT 1000`).bind(epoch, after).all<{ seq: number; body: string }>(),
        db.prepare(`SELECT body FROM presence WHERE at > ?`).bind(now - PRESENCE_TTL).all<{ body: string }>(),
      ]);
      return new Response(`{"epoch":${epoch},"events":${withSeq(ev)},"presence":[${pr.map((p) => p.body).join(',')}]}`, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (route === 'reset' && method === 'POST') {
      // Demo convenience only: starts a new epoch; earlier events stay in the table (archived, not deleted).
      const r = await db.prepare(`INSERT INTO meta (k, v) VALUES ('epoch', 1) ON CONFLICT(k) DO UPDATE SET v = v + 1 RETURNING v`).first<{ v: number }>();
      return json({ epoch: r?.v ?? 1 });
    }
    if (route === 'presence' && method === 'POST') return new Response(null, { status: 204 }); // sent with each poll instead
    return json({ error: 'not found' }, 404);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
};
