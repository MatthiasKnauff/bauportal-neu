// Druckwerk auf dem Server: baut die Seite aus denselben Bausteinen wie die Vorschau (kern/druck.ts) und lässt den
// Druckdienst (Hilfscontainer mit Chromium) daraus das PDF machen. Gelesen wird als der Benutzer – wer ein Objekt
// nicht sehen darf, bekommt auch keinen Ausdruck davon.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import { dateiname, druckSeite, listenfolge, type Druckdaten, type Einstellungen } from '../kern/druck';
import { KENNUNG, type ObjektModell, type Werte } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { alsBenutzer, spalte, tabelle, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';

/** Zeile aus der Datenbank -> Werte des Modells (Zahlen kommen als Text an). */
const werteAus = (m: ObjektModell, z: Record<string, unknown> | undefined): Werte =>
  Object.fromEntries(m.felder.map((f) => [f.name, f.art === 'zahl' && z?.[f.name] != null ? Number(z[f.name]) : ((z?.[f.name] ?? null) as Werte[string])]));

export async function seiteBauen(db: Db, register: Modulregister, wer: Benutzer, ausdruckId: string, objektId: string): Promise<{ html: string; name: string }> {
  const a = register.ausdrucke.find((x) => x.id === ausdruckId);
  if (!a) throw new Ablehnung('Diesen Ausdruck gibt es nicht');
  const m = register.modell(a.objekt)!;
  return alsBenutzer(db, wer, async (c) => {
    const zeile = (await c.query(`select * from ${tabelle(m.name)} where id = $1 and not geloescht`, [objektId])).rows[0];
    if (!zeile) throw new Ablehnung(`${m.titel} nicht gefunden`);
    const werte = werteAus(m, zeile);
    // Verweise der gedruckten Felder vorab auflösen
    const namen = new Map<string, string>();
    for (const f of m.felder.filter((x) => x.art === 'verweis' && werte[x.name])) {
      const ziel = register.modell(f.ziel!)!;
      const z = (await c.query(`select * from ${tabelle(ziel.name)} where id = $1`, [werte[f.name]])).rows[0];
      namen.set(`${ziel.name}:${werte[f.name]}`, String(z?.[ziel.anzeigeFeld] ?? ''));
    }
    // Listen: die Einträge, die am Objekt hängen – gelesen als der Benutzer, in der Reihenfolge des Berichts
    const kinder = new Map<string, Werte[]>();
    for (const b of a.bloecke) if (b.art === 'liste') {
      const k = register.modell(b.objekt)!;
      const filter = Object.entries(b.filter ?? {});
      const zeilen = (await c.query(`select * from ${tabelle(k.name)} where ${spalte(b.ueber)} = $1 and not geloescht${filter.map(([n], i) => ` and ${spalte(n)} = $${i + 2}`).join('')}`, [objektId, ...filter.map(([, w]) => w)])).rows
        .map((z) => ({ id: z.id as string, werte: werteAus(k, z) })).sort(listenfolge);
      kinder.set(b.id, zeilen.map((z) => z.werte));
      for (const f of k.felder.filter((x) => x.art === 'verweis' && b.spalten.includes(x.name))) {
        const ziel = register.modell(f.ziel!)!;
        const ids = [...new Set(zeilen.map((z) => z.werte[f.name]).filter(Boolean))];
        if (ids.length) for (const z of (await c.query(`select id, ${spalte(ziel.anzeigeFeld)} as name from ${tabelle(ziel.name)} where id = any($1)`, [ids])).rows) namen.set(`${ziel.name}:${z.id}`, String(z.name ?? ''));
      }
    }
    const projekt = m.projektFeld && m.projektFeld !== 'id' ? namen.get(`projekt:${werte[m.projektFeld]}`) ?? '' : '';
    const buero = werteAus(register.modell('buero')!, (await c.query('select * from o_buero where id = $1', [BUERO_ID])).rows[0]);
    const e: Einstellungen = {};
    // bei doppelten Einträgen (zwei Geräte ohne Netz) gilt überall derselbe: der mit der kleinsten Kennung
    for (const r of (await c.query('select stelle, wert from o_druckeinstellung where ausdruck = $1 and not geloescht order by id desc', [a.id])).rows) e[r.stelle] = r.wert;
    const d: Druckdaten = { werte, buero, projekt, verweis: (ziel, id) => namen.get(`${ziel}:${id}`) ?? '', kinder: (id) => kinder.get(id) ?? [], modell: (o) => register.modell(o)! };
    return { html: druckSeite(a, m, d, e), name: dateiname(a, m, d) };
  });
}

export async function pdfAus(html: string): Promise<Buffer> {
  let r: Response;
  try {
    r = await fetch(`${process.env.DRUCKDIENST_URL ?? 'http://druckdienst:8000'}/pdf`, {
      method: 'POST', headers: { 'content-type': 'text/html; charset=utf-8', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: html, signal: AbortSignal.timeout(90000),
    });
  } catch { throw new Ablehnung('Der Druckdienst des Bauportals antwortet nicht'); }
  if (!r.ok) throw new Ablehnung(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `Der Druckdienst meldet Fehler ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export function druckRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/druck/pdf', { preHandler: e.nurAngemeldet }, async (req, reply) => {
    const b = (req.body ?? {}) as { ausdruck?: string; objekt?: string };
    if (!KENNUNG.test(b.objekt ?? '')) throw new Ablehnung('Was gedruckt werden soll, fehlt');
    const { html, name } = await seiteBauen(e.db, e.register, req.benutzer!, String(b.ausdruck ?? ''), b.objekt!);
    const pdf = await pdfAus(html);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`).send(pdf);
  });
}
