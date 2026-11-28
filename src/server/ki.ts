// KI im Bauportal: Der Server bereitet vor (Aufgabe, Anonymisierung, Protokoll) und gibt die Frage an den KI-Ausgang
// (Hilfscontainer) – die eine Stelle, die mit einer KI spricht. Was eine KI liefert, ist immer nur ein Vorschlag:
// übernommen wird in der Oberfläche erst nach Bestätigung, und der Wert trägt dann die Marke „von der KI“.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PLATZHALTER_HINWEIS, anonymisieren, klartext } from '../kern/anonym';
import { KENNUNG } from '../kern/modell';
import { deckelErreicht, guthaben, kosten } from '../kern/kikosten';
import { alsBenutzer, type Db } from './db';
import { geheimnisLesen, geheimnisSetzen } from './ablage';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';

/** Was die KI mit einem Text tun kann – die Anweisungen stehen hier, nicht in der Oberfläche. */
export const AUFGABEN: Record<string, { titel: string; anweisung: string; json?: boolean; eigen?: boolean /* nur, wo ein Feld sie verlangt (Stellschraube „ki“) */ }> = {
  ausformulieren: { titel: 'Stichworte ausformulieren', anweisung: 'Formuliere die Stichworte zu einem sachlichen, knappen Text in ganzen Sätzen aus, wie er in einem Bautagebuch oder Protokoll eines Architekturbüros steht. Erfinde nichts dazu: keine Mengen, Namen, Termine oder Bewertungen, die nicht in den Stichworten stehen.' },
  glaetten: { titel: 'Text glätten', anweisung: 'Glätte den Text sprachlich: klare, sachliche Sätze, gleiche Zeitform, keine Wiederholungen. Der Inhalt bleibt vollständig und unverändert; füge nichts hinzu.' },
  rechtschreibung: { titel: 'Rechtschreibung prüfen', anweisung: 'Korrigiere nur Rechtschreibung, Grammatik und Zeichensetzung. Wortwahl, Satzbau und Inhalt bleiben, wie sie sind.' },
  // LV: aus Kurztext und Stichworten ein Langtext (wie im bisherigen Bauportal „✨ Langtext vorschlagen“)
  langtext_kurz: { titel: 'Langtext kurz', eigen: true, anweisung: 'Schreib den Langtext einer Position für ein Leistungsverzeichnis (VOB/A, produktneutral, Gewerk wie im Kurztext). Grundlage sind Kurztext, Einheit und, falls vorhanden, der bisherige Text oder Stichworte. Erfinde keine Maße, Mengen oder Fabrikate, die dort nicht stehen – wo eine Angabe fehlt, setze „…“ zum Ausfüllen. Kurz: zwei bis drei Sätze, nur Material, Ausführung und Maße; ohne die immer gleichen Floskeln (Liefern, Einbauen, Nebenleistungen) – die stehen in den Vorbemerkungen.' },
  langtext_mittel: { titel: 'Langtext mittel', eigen: true, anweisung: 'Schreib den Langtext einer Position für ein Leistungsverzeichnis (VOB/A, produktneutral, Gewerk wie im Kurztext). Grundlage sind Kurztext, Einheit und, falls vorhanden, der bisherige Text oder Stichworte. Erfinde keine Maße, Mengen oder Fabrikate, die dort nicht stehen – wo eine Angabe fehlt, setze „…“ zum Ausfüllen. Mittel: ein Absatz mit Material, Ausführung, Maßen und Qualitätsangaben; ohne die immer gleichen Floskeln (Liefern, Einbauen, Nebenleistungen) – die stehen in den Vorbemerkungen.' },
  langtext_lang: { titel: 'Langtext lang', eigen: true, anweisung: 'Schreib den Langtext einer Position für ein Leistungsverzeichnis (VOB/A, produktneutral, Gewerk wie im Kurztext). Grundlage sind Kurztext, Einheit und, falls vorhanden, der bisherige Text oder Stichworte. Erfinde keine Maße, Mengen oder Fabrikate, die dort nicht stehen – wo eine Angabe fehlt, setze „…“ zum Ausfüllen. Lang: vollständige Beschreibung mit Liefern und Einbauen, Material, Ausführung, Maßen, Qualitätsanforderungen und Abrechnungshinweis.' },
  kuerzen: { titel: 'Kürzen', anweisung: 'Kürze den Text auf das Wesentliche, etwa auf die Hälfte. Alle Fakten (Mengen, Namen, Termine, Mängel, Anordnungen) bleiben erhalten.' },
  // Bautagebuch per Sprache: der frei diktierte Bericht wird auf die Bereiche des Tagesberichts verteilt
  diktat: { titel: 'Diktat ordnen', json: true, anweisung: `Der Text ist ein frei diktierter Baustellenbericht (Spracherkennung, Fehler möglich). Verteile ihn auf die Bereiche eines Bautagesberichts.
Antworte nur mit JSON in genau dieser Form:
{"wetter": "", "temperatur": null, "anwesend": [{"firma": "", "personen": null, "taetigkeit": ""}], "notizen": [""], "maengel": [{"text": "", "firma": "", "frist": ""}], "aufgaben": [{"text": "", "frist": ""}], "weisungen": [{"text": "", "firma": ""}]}
wetter: eines von sonnig, bewoelkt, regen, schnee, frost, sturm oder leer. temperatur: Zahl in °C oder null. frist: Datum als JJJJ-MM-TT oder leer.
Übernimm nur, was im Text steht – erfinde keine Firmen, Mengen, Fristen oder Mängel. Was in keinen Bereich passt, kommt zu notizen. Schreib die Einträge als kurze, sachliche Sätze.` },
};
const RAHMEN_JSON = 'Du arbeitest in der Software eines Architekturbüros. Antworte ausschließlich mit gültigem JSON, ohne Einleitung und ohne Codeblock.';
const RAHMEN = 'Du arbeitest in der Software eines Architekturbüros. Antworte auf Deutsch und gib ausschließlich den fertigen Text zurück – ohne Einleitung, ohne Erklärung, ohne Anführungszeichen, ohne Formatierungszeichen.';
const GRENZE = 20000;

interface Anbindung { id: string; name: string; art: string; adresse: string; modell: string; aktiv: boolean; preis_ein: number | null; preis_aus: number | null; deckel: number | null; aufgeladen: number | null; aufgeladen_am: string | null }

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
  const a = await alsBenutzer(db, wer, async (c) => (await c.query('select id, name, art, adresse, modell, aktiv, preis_ein, preis_aus, deckel, aufgeladen, aufgeladen_am from o_ki_anbindung where id = $1 and not geloescht', [id])).rows[0] as Anbindung | undefined);
  if (!a) throw new Ablehnung('Diese KI-Anbindung gibt es nicht');
  return a;
}
/** Tokens einer Anbindung seit einem Zeitpunkt (aus dem Protokoll des KI-Ausgangs). */
async function tokensSeit(db: Db, anbindungId: string, seit: string): Promise<{ ein: number; aus: number; anfragen: number }> {
  const r = (await db.query('select coalesce(sum(tokens_ein), 0)::int as ein, coalesce(sum(tokens_aus), 0)::int as aus, (count(*) filter (where fehler is null))::int as anfragen from kern_ki_ausgang where anbindung_id = $1 and zeit >= $2', [anbindungId, seit])).rows[0];
  return { ein: r.ein, aus: r.aus, anfragen: r.anfragen };
}
const monatsanfang = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };
const zugang = async (db: Db, a: Anbindung) => ({ art: a.art, adresse: a.adresse, modell: a.modell, schluessel: a.art === 'ollama' ? '' : (await geheimnisLesen(db, `ki.${a.id}`)) ?? '' });

/** Alles, was im Büro als Name oder Anschrift bekannt ist – das geht nie im Klartext an eine KI außerhalb. */
async function bekannteNamen(db: Db): Promise<string[]> {
  // person = true: Namen von Menschen – im Text steht oft nur der Nachname, deshalb zählen auch die einzelnen Namensteile
  const r = await db.query(`
    select name as n, (art = 'bauherr' and not coalesce(ist_firma, false)) as person from o_kontakt union select ansprechpartner, true from o_kontakt union select strasse, false from o_kontakt
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
  // Kostendeckel: ist der Monat ausgeschöpft, geht nichts mehr hinaus
  if (extern && a.deckel) {
    const m = await tokensSeit(db, a.id, monatsanfang());
    if (deckelErreicht(kosten(m.ein, m.aus, a), a.deckel)) throw new Ablehnung(`Der Kostendeckel von ${String(a.deckel).replace('.', ',')} € für „${a.name}“ ist in diesem Monat erreicht – in der Verwaltung unter KI anheben oder bis zum Monatsende warten.`);
  }
  // Nach außen nur ohne Namen; im Büro bleibt der Text, wie er ist.
  const e = extern ? anonymisieren(text, await bekannteNamen(db)) : { text, karte: new Map<string, string>() };
  const merke = (fehler: string | null, ein = 0, aus = 0) => db.query(
    'insert into kern_ki_ausgang (benutzer_id, benutzer_name, anbindung, anbindung_id, art, modell, aufgabe, extern, zeichen, ersetzt, tokens_ein, tokens_aus, fehler) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [wer.id, wer.name, a.name, a.id, a.art, a.modell, aufgabe, extern, e.text.length, e.karte.size, ein, aus, fehler]);
  try {
    const r = await dienst<{ text: string; ein: number; aus: number }>('/frage', { ...(await zugang(db, a)), anweisung: [auf.json ? RAHMEN_JSON : RAHMEN, auf.anweisung, extern ? PLATZHALTER_HINWEIS : ''].filter(Boolean).join('\n\n'), text: e.text });
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

  app.get('/api/ki/aufgaben', { preHandler: e.nurAngemeldet }, async () => Object.entries(AUFGABEN).filter(([, a]) => !a.json).map(([wert, a]) => ({ wert, titel: a.titel, ...(a.eigen ? { eigen: true } : {}) })));

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
  // Verbrauch einer Anbindung: dieser Monat (Tokens, €, Ø je Tag), Kostendeckel, Guthaben seit der letzten Aufladung
  app.post('/api/ki/verbrauch', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const a = await anbindung(db, req.benutzer!, String(((req.body ?? {}) as Ein).anbindung ?? ''));
    const m = await tokensSeit(db, a.id, monatsanfang());
    const euro = kosten(m.ein, m.aus, a), tage = new Date().getDate();
    const seit = a.aufgeladen_am ? await tokensSeit(db, a.id, new Date(a.aufgeladen_am).toISOString()) : null;
    return { monat: { ...m, euro, jeTag: euro / tage }, deckel: a.deckel, erreicht: deckelErreicht(euro, a.deckel), guthaben: seit ? guthaben(a.aufgeladen, kosten(seit.ein, seit.aus, a)) : null };
  });
  app.get('/api/ki/protokoll', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    return (await db.query('select zeit, benutzer_name, anbindung, art, modell, aufgabe, extern, zeichen, ersetzt, tokens_ein, tokens_aus, fehler from kern_ki_ausgang order by id desc limit 200')).rows;
  });
}
