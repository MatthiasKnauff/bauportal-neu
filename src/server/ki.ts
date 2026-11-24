// KI im Bauportal: Der Server bereitet vor (Aufgabe, Anonymisierung, Protokoll) und gibt die Frage an den KI-Ausgang
// (Hilfscontainer) – die eine Stelle, die mit einer KI spricht. Was eine KI liefert, ist immer nur ein Vorschlag:
// übernommen wird in der Oberfläche erst nach Bestätigung, und der Wert trägt dann die Marke „von der KI“.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PLATZHALTER_HINWEIS, anonymisieren, klartext } from '../kern/anonym';
import { KENNUNG } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { geheimnisLesen, geheimnisSetzen } from './ablage';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';

/** Was die KI mit einem Text tun kann – die Anweisungen stehen hier, nicht in der Oberfläche. */
export const AUFGABEN: Record<string, { titel: string; anweisung: string }> = {
  ausformulieren: { titel: 'Stichworte ausformulieren', anweisung: 'Formuliere die Stichworte zu einem sachlichen, knappen Text in ganzen Sätzen aus, wie er in einem Bautagebuch oder Protokoll eines Architekturbüros steht. Erfinde nichts dazu: keine Mengen, Namen, Termine oder Bewertungen, die nicht in den Stichworten stehen.' },
  glaetten: { titel: 'Text glätten', anweisung: 'Glätte den Text sprachlich: klare, sachliche Sätze, gleiche Zeitform, keine Wiederholungen. Der Inhalt bleibt vollständig und unverändert; füge nichts hinzu.' },
  rechtschreibung: { titel: 'Rechtschreibung prüfen', anweisung: 'Korrigiere nur Rechtschreibung, Grammatik und Zeichensetzung. Wortwahl, Satzbau und Inhalt bleiben, wie sie sind.' },
  kuerzen: { titel: 'Kürzen', anweisung: 'Kürze den Text auf das Wesentliche, etwa auf die Hälfte. Alle Fakten (Mengen, Namen, Termine, Mängel, Anordnungen) bleiben erhalten.' },
};
const RAHMEN = 'Du arbeitest in der Software eines Architekturbüros. Antworte auf Deutsch und gib ausschließlich den fertigen Text zurück – ohne Einleitung, ohne Erklärung, ohne Anführungszeichen, ohne Formatierungszeichen.';
const GRENZE = 20000;

interface Anbindung { id: string; name: string; art: string; adresse: string; modell: string; aktiv: boolean }

async function dienst<T>(pfad: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${process.env.KIDIENST_URL ?? 'http://kidienst:8000'}${pfad}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: JSON.stringify(body), signal: AbortSignal.timeout(330000),
    });
  } catch { throw new Ablehnung('Der KI-Ausgang des Bauportals antwortet nicht'); }
  const d = (await r.json().catch(() => ({}))) as T & { fehler?: string };
  if (!r.ok) throw new Ablehnung(d.fehler ?? `Der KI-Ausgang meldet Fehler ${r.status}`);
  return d;
}

/** Die Anbindung, wie der Benutzer sie sehen darf (Gäste sehen keine). */
async function anbindung(db: Db, wer: Benutzer, id: string): Promise<Anbindung> {
  if (!KENNUNG.test(id)) throw new Ablehnung('Die KI-Anbindung fehlt');
  const a = await alsBenutzer(db, wer, async (c) => (await c.query('select id, name, art, adresse, modell, aktiv from o_ki_anbindung where id = $1 and not geloescht', [id])).rows[0] as Anbindung | undefined);
  if (!a) throw new Ablehnung('Diese KI-Anbindung gibt es nicht');
  return a;
}
const zugang = async (db: Db, a: Anbindung) => ({ art: a.art, adresse: a.adresse, modell: a.modell, schluessel: a.art === 'ollama' ? '' : (await geheimnisLesen(db, `ki.${a.id}`)) ?? '' });

/** Alles, was im Büro als Name oder Anschrift bekannt ist – das geht nie im Klartext an eine KI außerhalb. */
async function bekannteNamen(db: Db): Promise<string[]> {
  // person = true: Namen von Menschen – im Text steht oft nur der Nachname, deshalb zählen auch die einzelnen Namensteile
  const r = await db.query(`
    select name as n, art = 'person' as person from o_kontakt union select ansprechpartner, true from o_kontakt union select strasse, false from o_kontakt
    union select name, false from o_projekt union select name, true from o_benutzer union select anmeldename, false from o_benutzer
    union select name, false from o_buero union select strasse, false from o_buero`);
  const aus = new Set<string>();
  for (const { n, person } of r.rows as { n: string | null; person: boolean }[]) {
    if (!n) continue;
    aus.add(n);
    if (person) for (const teil of n.split(/[\s,]+/)) if (teil.length >= 4 && /^\p{Lu}/u.test(teil) && !ANREDEN.has(teil.toLowerCase())) aus.add(teil);
  }
  return [...aus];
}
const ANREDEN = new Set(['herr', 'frau', 'familie', 'eheleute', 'dipl', 'dipl.-ing', 'prof']);

export async function kiText(db: Db, wer: Benutzer, anbindungId: string, aufgabe: string, text: string): Promise<{ vorschlag: string; extern: boolean; ersetzt: number }> {
  const auf = AUFGABEN[aufgabe];
  if (!auf) throw new Ablehnung('Diese Aufgabe gibt es nicht');
  if (typeof text !== 'string' || !text.trim()) throw new Ablehnung('Es steht noch kein Text da');
  if (text.length > GRENZE) throw new Ablehnung(`Der Text ist zu lang (höchstens ${GRENZE} Zeichen)`);
  const a = await anbindung(db, wer, anbindungId);
  if (!a.aktiv) throw new Ablehnung('Diese KI-Anbindung ist ausgeschaltet');
  const extern = a.art !== 'ollama';
  // Nach außen nur ohne Namen; im Büro bleibt der Text, wie er ist.
  const e = extern ? anonymisieren(text, await bekannteNamen(db)) : { text, karte: new Map<string, string>() };
  const merke = (fehler: string | null, ein = 0, aus = 0) => db.query(
    'insert into kern_ki_ausgang (benutzer_id, benutzer_name, anbindung, art, modell, aufgabe, extern, zeichen, ersetzt, tokens_ein, tokens_aus, fehler) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [wer.id, wer.name, a.name, a.art, a.modell, aufgabe, extern, e.text.length, e.karte.size, ein, aus, fehler]);
  try {
    const r = await dienst<{ text: string; ein: number; aus: number }>('/frage', { ...(await zugang(db, a)), anweisung: [RAHMEN, auf.anweisung, extern ? PLATZHALTER_HINWEIS : ''].filter(Boolean).join('\n\n'), text: e.text });
    await merke(null, r.ein, r.aus);
    return { vorschlag: klartext(r.text, e.karte).trim(), extern, ersetzt: e.karte.size };
  } catch (err) {
    await merke((err as Error).message.slice(0, 300));
    throw err;
  }
}

export function kiRouten(app: FastifyInstance, e: { db: Db; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const { db } = e;
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };
  type Ein = { anbindung?: string; schluessel?: string; aufgabe?: string; text?: string };

  app.get('/api/ki/aufgaben', { preHandler: e.nurAngemeldet }, async () => Object.entries(AUFGABEN).map(([wert, a]) => ({ wert, titel: a.titel })));

  app.post('/api/ki/text', { preHandler: e.nurAngemeldet }, async (req) => {
    const b = (req.body ?? {}) as Ein;
    return kiText(db, req.benutzer!, String(b.anbindung ?? ''), String(b.aufgabe ?? ''), b.text as string);
  });

  // ---- Einrichten (nur Administrator:innen) ----
  app.post('/api/ki/zustand', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const a = await anbindung(db, req.benutzer!, String(((req.body ?? {}) as Ein).anbindung ?? ''));
    return { schluesselGesetzt: !!(await geheimnisLesen(db, `ki.${a.id}`)) };
  });
  app.post('/api/ki/schluessel', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const b = (req.body ?? {}) as Ein;
    const a = await anbindung(db, req.benutzer!, String(b.anbindung ?? ''));
    if (typeof b.schluessel !== 'string' || !b.schluessel.trim() || b.schluessel.length > 500) throw new Ablehnung('Der Zugangsschlüssel fehlt');
    await geheimnisSetzen(db, `ki.${a.id}`, b.schluessel.trim());
    return { ok: true };
  });
  app.post('/api/ki/modelle', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const a = await anbindung(db, req.benutzer!, String(((req.body ?? {}) as Ein).anbindung ?? ''));
    return dienst<{ modelle: string[] }>('/modelle', await zugang(db, a));
  });
  app.get('/api/ki/protokoll', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    return (await db.query('select zeit, benutzer_name, anbindung, art, modell, aufgabe, extern, zeichen, ersetzt, tokens_ein, tokens_aus, fehler from kern_ki_ausgang order by id desc limit 200')).rows;
  });
}
