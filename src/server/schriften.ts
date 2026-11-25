// Schriften der Designs: Beim Einfügen eines Designs holt der Server die Schriftdateien EINMAL (Google Fonts) und liefert
// sie danach selbst aus – beim Benutzen geht nichts nach außen. /api/schriften.css enthält alle @font-face des Büros.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from './db';
import { Ablehnung } from './protokoll';

const NAME = /^[A-Za-z0-9 ]{2,40}$/;
// Ein Browser-Kennzeichen, für das Google Fonts woff2 liefert
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function holen(db: Db, familie: string): Promise<boolean> {
  if ((await db.query('select 1 from kern_schrift where familie = $1', [familie])).rowCount) return true;
  const r = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(familie).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return false;   // keine Google-Schrift: das Design nimmt dann die nächste Schrift aus seiner Liste
  let css = await r.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map((m) => m[1]!))];
  if (!urls.length) return false;
  const c = await db.connect();
  try {
    await c.query('begin');
    for (const u of urls) {
      const d = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!d.ok) throw new Error('Schriftdatei nicht erreichbar');
      const id = randomUUID();
      await c.query('insert into kern_schriftdatei (id, familie, daten) values ($1, $2, $3)', [id, familie, Buffer.from(await d.arrayBuffer())]);
      css = css.split(`url(${u})`).join(`url(/api/schrift/${id})`);
    }
    await c.query('insert into kern_schrift (familie, css) values ($1, $2) on conflict (familie) do nothing', [familie, css]);
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  return true;
}

export function schriftRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/schriften', { preHandler: e.nurAngemeldet }, async (req) => {
    const familien = ((req.body as { familien?: unknown })?.familien ?? []) as unknown[];
    if (!Array.isArray(familien) || familien.length > 4 || !familien.every((f) => typeof f === 'string' && NAME.test(f))) throw new Ablehnung('Ungültige Schriftnamen');
    const aus: Record<string, boolean> = {};
    for (const f of familien as string[]) { try { aus[f] = await holen(e.db, f); } catch { aus[f] = false; } }
    return { geholt: aus };
  });
  app.get('/api/schriften.css', async (_req, reply) => {
    const r = await e.db.query('select css from kern_schrift order by familie');
    return reply.header('content-type', 'text/css; charset=utf-8').header('cache-control', 'no-cache').send(r.rows.map((x) => x.css as string).join('\n'));
  });
  app.get('/api/schrift/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.code(404).send();
    const r = await e.db.query('select daten from kern_schriftdatei where id = $1', [id]);
    if (!r.rowCount) return reply.code(404).send();
    return reply.header('content-type', 'font/woff2').header('cache-control', 'public, max-age=31536000, immutable').send(r.rows[0].daten as Buffer);
  });
}
