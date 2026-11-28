// Updates wie bei einem Produkt: Das Programm kommt über Freigaben (GitHub → Portainer); die Verwaltung zeigt, welche
// Version läuft und was die neueste ist. Kataloge kommen unabhängig davon über den Katalog-Kanal – auf Knopfdruck,
// mit Prüfsumme, erst Vorschau, dann Übernahme. Der Kanal ist eine Adresse mit „index.json“ und den Katalogdateien.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { Modulregister, Nachschlag } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { nurAdmin, pruefeBereich } from './bereich';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';
import { abgleicher, merken, type Vorschau, type Zahl } from './uebernahme';

const kanal = () => (process.env.KATALOG_KANAL ?? 'https://raw.githubusercontent.com/MatthiasKnauff/bauportal-neu/kataloge').replace(/\/+$/, '');
const programm = () => process.env.PROGRAMM_REPO ?? 'MatthiasKnauff/bauportal-neu';
const GRENZE = 20 * 1024 * 1024;

interface Teil { datei: string; sha256: string }
// Ein Katalog ist eine Datei – große Kataloge (Nachschläge) bestehen aus mehreren Teilen
interface Angebot { id: string; titel: string; beschreibung: string; version: number; stand: string; quelle: string; datei?: string; sha256?: string; teile?: Teil[] }
interface Katalogdatei { id: string; version: number; stand: string; eintraege: { schluessel: string; werte: Werte }[] }

async function holen(adresse: string): Promise<Buffer> {
  let r: Response;
  try { r = await fetch(adresse, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json', 'user-agent': 'bauportal' } }); }
  catch { throw new Ablehnung('Der Server des Bauportals erreicht das Internet nicht – die Updates lassen sich gerade nicht abfragen'); }
  if (!r.ok) throw new Ablehnung(`Die Abfrage ist fehlgeschlagen (Fehler ${r.status})`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > GRENZE) throw new Ablehnung('Die Antwort ist unerwartet groß');
  return b;
}

/** Was der Kanal anbietet – nur Kataloge, die dieses Programm kennt. */
export async function angebote(register: Modulregister): Promise<Angebot[]> {
  let roh: { kataloge?: Angebot[] };
  try { roh = JSON.parse((await holen(`${kanal()}/index.json`)).toString('utf8')); } catch (e) { if (e instanceof Ablehnung) throw e; throw new Ablehnung('Das Verzeichnis des Katalog-Kanals ist nicht lesbar'); }
  const sicher = (d: unknown) => typeof d === 'string' && /^[\w./-]+$/.test(d) && !d.includes('..');
  return (roh.kataloge ?? []).filter((a) => register.kataloge.some((k) => k.id === a.id) && (a.teile ? a.teile.length > 0 && a.teile.every((t) => sicher(t.datei)) : sicher(a.datei)));
}

/** Eine Katalogdatei holen, Prüfsumme prüfen, lesen. */
async function datei(t: Teil, id: string, version: number): Promise<Katalogdatei> {
  const roh = await holen(`${kanal()}/${t.datei}`);
  if (createHash('sha256').update(roh).digest('hex') !== t.sha256) throw new Ablehnung('Die Prüfsumme des Katalogs stimmt nicht – er wird nicht eingespielt');
  let d: Katalogdatei;
  try { d = JSON.parse(roh.toString('utf8')); } catch { throw new Ablehnung('Die Katalogdatei ist nicht lesbar'); }
  if (d.id !== id || d.version !== version || !Array.isArray(d.eintraege) || d.eintraege.some((e) => typeof e?.schluessel !== 'string' || !e.schluessel || typeof e.werte !== 'object')) throw new Ablehnung('Die Katalogdatei passt nicht zum Verzeichnis');
  return d;
}

/** Nachschlag einspielen: ersetzt den ganzen bisherigen Stand (er kommt nur aus dem Kanal und wird nicht bearbeitet). */
async function nachschlagEinspielen(db: Db, n: Nachschlag, eintraege: { schluessel: string; werte: Werte }[]): Promise<void> {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('delete from kern_nachschlag where name = $1', [n.name]);
    for (let i = 0; i < eintraege.length; i += 2000) {
      const teil = eintraege.slice(i, i + 2000).map((e, j) => ({
        s: e.schluessel, r: i + j, p: n.gliederung.map((g) => String(e.werte[g] ?? '')),
        w: Object.fromEntries(n.felder.map((f) => [f.name, e.werte[f.name] ?? null])),
        t: n.suche.map((f) => String(e.werte[f] ?? '')).join(' '),
      }));
      await c.query(`insert into kern_nachschlag (name, schluessel, reihe, pfad, werte, such)
        select $1, x->>'s', (x->>'r')::int, array(select jsonb_array_elements_text(x->'p')), x->'w', to_tsvector('german', x->>'t') from jsonb_array_elements($2::jsonb) x`, [n.name, JSON.stringify(teil)]);
    }
    await c.query('commit');
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

/** Holt einen Katalog, prüft die Prüfsumme und vergleicht ihn mit dem, was da ist. */
export async function katalogPlanen(db: Db, register: Modulregister, wer: Benutzer, id: string, zuruecksetzen = false): Promise<{ je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[]; eintraege?: number; angebot: Angebot; einspielen?: () => Promise<void> }> {
  const k = register.kataloge.find((x) => x.id === id);
  const a = (await angebote(register)).find((x) => x.id === id);
  if (!k || !a) throw new Ablehnung('Diesen Katalog bietet der Kanal nicht an');
  const teile = a.teile ?? (a.datei && a.sha256 ? [{ datei: a.datei, sha256: a.sha256 }] : []);
  const eintraege = (await Promise.all(teile.map((t) => datei(t, id, a.version)))).flatMap((d) => d.eintraege);
  const quelle = `Stand des Katalogs: ${a.stand}, Fassung ${a.version}. Quelle: ${a.quelle}`;
  if (k.nachschlag) {
    const n = register.nachschlag(k.nachschlag)!;
    const da = (await db.query('select version from kern_katalog where id = $1', [id])).rows[0] as { version: number } | undefined;
    if (da?.version === a.version) return { je: {}, hinweise: ['Der Katalog im Bauportal entspricht schon diesem Stand – es gibt nichts zu übernehmen.', quelle], liste: [], angebot: a };
    return { je: {}, liste: [], eintraege: eintraege.length, angebot: a, einspielen: () => nachschlagEinspielen(db, n, eintraege),
      hinweise: [`${eintraege.length.toLocaleString('de-DE')} ${n.titelMehrzahl} werden eingespielt und ersetzen den bisherigen Stand. Sie liegen nur am Server und lassen sich in ${n.titelMehrzahl} suchen.`, quelle] };
  }
  const objekt = k.objekt!;
  return alsBenutzer(db, wer, async (c) => {
    // Zurücksetzen (wie bisher „↺ Zurücksetzen …“ im Leistungskatalog): auch vom Büro geänderte Werte gehen zurück auf ab Werk
    const { liste, je, abgleichen } = abgleicher(c, register, {}, 'katalog', zuruecksetzen ? ['katalog', ''] : ['katalog']);
    // Zum Katalog gehört, was eine Kennung hat; eigene Einträge des Büros (ohne Kennung) bleiben unberührt.
    await abgleichen(objekt, eintraege.map((e) => ({ kennung: e.schluessel, werte: e.werte })), () => true);
    const z = je[objekt]!;
    const hinweise = [
      !liste.length && (zuruecksetzen ? 'Nichts weicht vom Stand ab Werk ab – es gibt nichts zurückzusetzen.' : 'Der Katalog im Bauportal entspricht schon diesem Stand – es gibt nichts zu übernehmen.'),
      zuruecksetzen && liste.length && `${z.geaendert} ${z.geaendert === 1 ? 'Eintrag geht' : 'Einträge gehen'} zurück auf den Stand ab Werk – auch, was das Büro geändert hat. Rückgängig nimmt alles zurück.`,
      z.behalten && `${z.behalten} ${z.behalten === 1 ? 'Eintrag hat' : 'Einträge haben'} vom Büro geänderte Werte. Sie bleiben, wie sie eingetragen sind.`,
      z.entfernt && `${z.entfernt} ${z.entfernt === 1 ? 'Eintrag steht' : 'Einträge stehen'} nicht mehr im Katalog und ${z.entfernt === 1 ? 'entfällt' : 'entfallen'} (lässt sich zurückholen).`,
      'Eigene Einträge des Büros bleiben unberührt.',
      quelle,
    ].filter((x): x is string => typeof x === 'string');
    return { je, hinweise, liste, angebot: a };
  });
}

// Die neueste Freigabe des Programms – höchstens einmal je Stunde abgefragt
let freigabe: { bis: number; wert: { version: string; erschienen: string; text: string; adresse: string } | null } | undefined;
async function neuesteFreigabe() {
  if (freigabe && freigabe.bis > Date.now()) return freigabe.wert;
  const r = JSON.parse((await holen(`https://api.github.com/repos/${programm()}/releases?per_page=1`)).toString('utf8')) as { tag_name: string; published_at: string; body: string | null; html_url: string }[];
  const wert = r[0] ? { version: r[0].tag_name, erschienen: r[0].published_at, text: (r[0].body ?? '').slice(0, 4000), adresse: r[0].html_url } : null;
  freigabe = { bis: Date.now() + 3600000, wert };
  return wert;
}

export function updateRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; version: string; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const versuch = async <T>(tun: () => Promise<T>): Promise<{ wert: T } | { fehler: string }> => { try { return { wert: await tun() }; } catch (err) { if (err instanceof Ablehnung) return { fehler: err.message }; throw err; } };

  app.get('/api/updates/zustand', { preHandler: e.nurAngemeldet }, async (req) => {
    await pruefeBereich(e.db, req, 'system', 'lesen');
    const da = new Map<string, { version: number; stand: string; eingespielt: string }>((await e.db.query('select id, version, stand, eingespielt from kern_katalog')).rows.map((r) => [r.id, r]));
    const [neueste, kanalAngebot] = await Promise.all([versuch(neuesteFreigabe), versuch(() => angebote(e.register))]);
    return {
      programm: { version: e.version, umgebung: e.umgebung, neueste },
      kataloge: e.register.kataloge.map((k) => ({ ...k, eingespielt: da.get(k.id) ?? null, angebot: 'wert' in kanalAngebot ? kanalAngebot.wert.find((a) => a.id === k.id) ?? null : null })),
      kanalFehler: 'fehler' in kanalAngebot ? kanalAngebot.fehler : null,
    };
  });

  app.post('/api/updates/katalog/vorschau', { preHandler: e.nurAngemeldet }, async (req): Promise<Vorschau> => {
    nurAdmin(req);
    const body = (req.body ?? {}) as { katalog?: string; zuruecksetzen?: boolean };
    const { angebot, einspielen, ...plan } = await katalogPlanen(e.db, e.register, req.benutzer!, String(body.katalog ?? ''), body.zuruecksetzen === true);
    const festhalten = async () => {
      await e.db.query('insert into kern_katalog (id, version, stand) values ($1,$2,$3) on conflict (id) do update set version = excluded.version, stand = excluded.stand, eingespielt = now()', [angebot.id, angebot.version, angebot.stand]);
    };
    if (!plan.liste.length && !einspielen) await festhalten();   // nichts zu ändern: der Stand gilt als eingespielt
    return merken(req.benutzer!.id, plan, async () => { await einspielen?.(); await festhalten(); });
  });
}
