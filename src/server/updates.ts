// Updates wie bei einem Produkt: Das Programm kommt über Freigaben (GitHub → Portainer); die Verwaltung zeigt, welche
// Version läuft und was die neueste ist. Kataloge kommen unabhängig davon über den Katalog-Kanal – auf Knopfdruck,
// mit Prüfsumme, erst Vorschau, dann Übernahme. Der Kanal ist eine Adresse mit „index.json“ und den Katalogdateien.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';
import { abgleicher, merken, type Vorschau, type Zahl } from './uebernahme';

const kanal = () => (process.env.KATALOG_KANAL ?? 'https://raw.githubusercontent.com/MatthiasKnauff/bauportal-neu/kataloge').replace(/\/+$/, '');
const programm = () => process.env.PROGRAMM_REPO ?? 'MatthiasKnauff/bauportal-neu';
const GRENZE = 20 * 1024 * 1024;

interface Angebot { id: string; titel: string; beschreibung: string; version: number; stand: string; quelle: string; datei: string; sha256: string }
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
  return (roh.kataloge ?? []).filter((a) => register.kataloge.some((k) => k.id === a.id) && /^[\w./-]+$/.test(a.datei) && !a.datei.includes('..'));
}

/** Holt einen Katalog, prüft die Prüfsumme und vergleicht ihn mit dem, was da ist. */
export async function katalogPlanen(db: Db, register: Modulregister, wer: Benutzer, id: string): Promise<{ je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[]; angebot: Angebot }> {
  const k = register.kataloge.find((x) => x.id === id);
  const a = (await angebote(register)).find((x) => x.id === id);
  if (!k || !a) throw new Ablehnung('Diesen Katalog bietet der Kanal nicht an');
  const roh = await holen(`${kanal()}/${a.datei}`);
  if (createHash('sha256').update(roh).digest('hex') !== a.sha256) throw new Ablehnung('Die Prüfsumme des Katalogs stimmt nicht – er wird nicht eingespielt');
  let d: Katalogdatei;
  try { d = JSON.parse(roh.toString('utf8')); } catch { throw new Ablehnung('Die Katalogdatei ist nicht lesbar'); }
  if (d.id !== id || d.version !== a.version || !Array.isArray(d.eintraege) || d.eintraege.some((e) => typeof e?.schluessel !== 'string' || !e.schluessel || typeof e.werte !== 'object')) throw new Ablehnung('Die Katalogdatei passt nicht zum Verzeichnis');
  return alsBenutzer(db, wer, async (c) => {
    const { liste, je, abgleichen } = abgleicher(c, register, {}, 'katalog', ['katalog']);
    // Zum Katalog gehört, was eine Kennung hat; eigene Einträge des Büros (ohne Kennung) bleiben unberührt.
    await abgleichen(k.objekt, d.eintraege.map((e) => ({ kennung: e.schluessel, werte: e.werte })), () => true);
    const z = je[k.objekt]!;
    const hinweise = [
      !liste.length && 'Der Katalog im Bauportal entspricht schon diesem Stand – es gibt nichts zu übernehmen.',
      z.behalten && `${z.behalten} ${z.behalten === 1 ? 'Eintrag hat' : 'Einträge haben'} vom Büro geänderte Werte. Sie bleiben, wie sie eingetragen sind.`,
      z.entfernt && `${z.entfernt} ${z.entfernt === 1 ? 'Eintrag steht' : 'Einträge stehen'} nicht mehr im Katalog und ${z.entfernt === 1 ? 'entfällt' : 'entfallen'} (lässt sich zurückholen).`,
      'Eigene Einträge des Büros bleiben unberührt.',
      `Stand des Katalogs: ${a.stand}, Fassung ${a.version}. Quelle: ${a.quelle}`,
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
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };
  const versuch = async <T>(tun: () => Promise<T>): Promise<{ wert: T } | { fehler: string }> => { try { return { wert: await tun() }; } catch (err) { if (err instanceof Ablehnung) return { fehler: err.message }; throw err; } };

  app.get('/api/updates/zustand', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const da = new Map<string, { version: number; stand: string; eingespielt: string }>((await e.db.query('select id, version, stand, eingespielt from kern_katalog')).rows.map((r) => [r.id, r]));
    const [neueste, kanalAngebot] = await Promise.all([versuch(neuesteFreigabe), versuch(() => angebote(e.register))]);
    return {
      programm: { version: e.version, umgebung: e.umgebung, neueste },
      kataloge: e.register.kataloge.map((k) => ({ ...k, eingespielt: da.get(k.id) ?? null, angebot: 'wert' in kanalAngebot ? kanalAngebot.wert.find((a) => a.id === k.id) ?? null : null })),
      kanalFehler: 'fehler' in kanalAngebot ? kanalAngebot.fehler : null,
    };
  });

  app.post('/api/updates/katalog/vorschau', { preHandler: e.nurAngemeldet }, async (req): Promise<Vorschau> => {
    admin(req);
    const { angebot, ...plan } = await katalogPlanen(e.db, e.register, req.benutzer!, String(((req.body ?? {}) as { katalog?: string }).katalog ?? ''));
    const festhalten = async () => {
      await e.db.query('insert into kern_katalog (id, version, stand) values ($1,$2,$3) on conflict (id) do update set version = excluded.version, stand = excluded.stand, eingespielt = now()', [angebot.id, angebot.version, angebot.stand]);
    };
    if (!plan.liste.length) await festhalten();   // nichts zu ändern: der Stand gilt als eingespielt
    return merken(req.benutzer!.id, plan, festhalten);
  });
}
