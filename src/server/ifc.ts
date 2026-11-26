// IFC einlesen: Der IFC-Dienst (Hilfscontainer, Python) liest die Datei, hier wird sie mit dem vorhandenen
// Gebäudemodell verglichen. Erst die Vorschau („was würde sich ändern“), dann – nach Bestätigung – die Übernahme
// als ein Vorgang: alles oder nichts. Was von Hand eingetragen wurde, überschreibt ein neuer Planstand nicht.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import { KENNUNG } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import { ASSISTENT, abgleicher, merken, versionPruefen, type Vorschau, type Zahl } from './uebernahme';
import { KEIN_KG_KATALOG, aufbautenAusPlan, kostengruppen, type Schicht } from './gebaeudemodell';
import { BAUTEILARTEN, kostengruppeNummer } from '../module/gebaeudemodell/beipackzettel';
import type { Benutzer } from './anmeldung';
import { netzDa, netzRechnen, netzSpeichern } from './netz';

interface Gelesen {
  schema: string;
  gebaeude: { kennung: string; name: string }[];
  geschosse: { kennung: string; name: string; ebene: number; hoehe: number | null; gebaeude: string | null }[];
  raeume: { kennung: string; nummer: string; name: string; nutzung: string; flaeche: number | null; hoehe: number | null; geschoss: string | null }[];
  bauteile: { kennung: string; art: string; name: string; geschoss: string | null; lage: string; menge: number | null; einheit: string; abmessung: string; schichten?: Schicht[]; gewerk?: string; tragend?: boolean | null; wand?: string | null }[];
  uebersprungen: Record<string, number>;
  flaechen_aus_geometrie: number;
  lage_aus_geometrie?: number;
  teile_in_oeffnungen?: number;
}
async function lies(datei: Buffer): Promise<Gelesen> {
  let r: Response;
  try {
    r = await fetch(`${process.env.IFCDIENST_URL ?? 'http://ifcdienst:8000'}/auswerten`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-schluessel': process.env.DIENST_SCHLUESSEL ?? '' }, body: new Uint8Array(datei), signal: AbortSignal.timeout(300000),
    });
  } catch { throw new Ablehnung('Der IFC-Dienst des Bauportals antwortet nicht'); }
  const d = (await r.json().catch(() => ({}))) as Gelesen & { fehler?: string };
  if (!r.ok) throw new Ablehnung(d.fehler ?? `Der IFC-Dienst meldet Fehler ${r.status}`);
  return d;
}

/** Vergleicht das Gelesene mit dem Modell einer Version und baut daraus die Befehle. */
export async function planen(db: Db, register: Modulregister, wer: Benutzer, projekt: string, version: string, d: Gelesen): Promise<{ je: Record<string, Zahl>; hinweise: string[]; ohneGeschoss: number; befehle: number; liste: Befehl[] }> {
  return alsBenutzer(db, wer, async (c) => {
    await versionPruefen(c, projekt, version);
    // Der Plan ersetzt auch, was der Assistent geschätzt hat: Alles mit einer Kennung zählt zur Quelle „Plan“.
    const { liste, je, ort, abgleichen } = abgleicher(c, register, { projekt, version }, 'ifc', ['ifc', 'geschaetzt']);
    const alles = () => true;
    const geschaetzt = (x: Record<string, unknown>) => x.kennung === '' || String(x.kennung).startsWith(ASSISTENT);

    const gebaeude = d.gebaeude.length ? d.gebaeude : [{ kennung: 'ohne-gebaeude', name: 'Gebäude' }];
    // Ein Gebäude im Plan, ein Gebäude ohne Plan im Modell (von Hand oder vom Assistenten): es ist dasselbe.
    await abgleichen('gebaeude', gebaeude.map((g) => ({ kennung: g.kennung, werte: { name: g.name } })), alles,
      (_e, vorhanden) => (gebaeude.length === 1 && vorhanden.length === 1 && geschaetzt(vorhanden[0]!) ? vorhanden[0] : undefined));
    const erstes = ort.gebaeude!.get(gebaeude[0]!.kennung)!;
    // Ein geschätztes Geschoss derselben Ebene wird zum Geschoss aus dem Plan.
    await abgleichen('geschoss', d.geschosse.map((g) => ({ kennung: g.kennung, werte: { name: g.name, ebene: g.ebene, hoehe: g.hoehe, gebaeude: (g.gebaeude && ort.gebaeude!.get(g.gebaeude)) || erstes } })), alles,
      (e, vorhanden) => vorhanden.find((x) => String(x.kennung).startsWith(ASSISTENT) && x.gebaeude === e.werte.gebaeude && Number(x.ebene) === e.werte.ebene));
    const mitGeschoss = d.raeume.filter((r) => r.geschoss && ort.geschoss!.has(r.geschoss));
    await abgleichen('raum', mitGeschoss.map((r) => ({ kennung: r.kennung, werte: { nummer: r.nummer, name: r.name, nutzung: r.nutzung, flaeche: r.flaeche, hoehe: r.hoehe, geschoss: ort.geschoss!.get(r.geschoss!)! } })), alles);
    // Aufbauten: gleiche Schichtfolge = ein Aufbau, den sich die Bauteile teilen
    const artTitel = (art: string) => BAUTEILARTEN.find((x) => x.wert === art)?.titel ?? art;
    const ab = aufbautenAusPlan(d.bauteile, artTitel);
    await abgleichen('aufbau', ab.eintraege, alles);
    await abgleichen('aufbau_schicht', ab.schichten(() => ort.aufbau!), alles);
    const kg = await kostengruppen(c);
    const vorher = await abgleichen('bauteil', d.bauteile.map((b) => {
      const tragend = b.tragend === true ? 'ja' : b.tragend === false ? 'nein' : '';
      const ohneDicke = (b.schichten ?? []).every((s) => !s.dicke);   // nur ein Material, keine Schichten
      return { kennung: b.kennung, werte: () => ({
        name: b.name, art: b.art, lage: b.lage, tragend, menge: b.menge, einheit: b.einheit, abmessung: b.abmessung, gewerk: b.gewerk ?? '',
        geschoss: (b.geschoss && ort.geschoss!.get(b.geschoss)) || null,
        aufbau: (ab.von.has(b.kennung) && ort.aufbau!.get(ab.von.get(b.kennung)!)) || null,
        material: ohneDicke ? (b.schichten ?? []).map((s) => s.material).filter(Boolean).join(', ') : '',
        wand: (b.wand && ort.bauteil!.get(b.wand)) || null,
        kostengruppe: kg.get(kostengruppeNummer(b.art, b.lage, tragend) ?? '') ?? null,
      }) };
    }), alles);

    const ohneGeschoss = d.raeume.length - mitGeschoss.length;
    const behalten = Object.values(je).reduce((s, z) => s + z.behalten, 0);
    const ersetzt = vorher.filter((x) => !x.geloescht && String(x.kennung).startsWith(ASSISTENT)).length;
    const hinweise = [
      !liste.length && 'Der Plan stimmt mit dem Gebäudemodell überein – es gibt nichts zu übernehmen.',
      ersetzt && `${ersetzt} geschätzte Bauteile aus dem Assistenten werden durch die Bauteile aus dem Plan ersetzt.`,
      ab.eintraege.length && `${ab.von.size} Bauteile teilen sich ${ab.eintraege.length} Aufbauten (gleiche Schichtfolge = ein Aufbau). Die Wärmeleitfähigkeit λ der Schichten steht nicht im Plan – sie lässt sich unter Aufbauten eintragen.`,
      d.bauteile.some((b) => b.wand) && `${d.bauteile.filter((b) => b.wand).length} Fenster und Türen kennen ihre Wand. Wandflächen sind ohne Öffnungen gerechnet.`,
      !kg.size && KEIN_KG_KATALOG,
      behalten && `${behalten} ${behalten === 1 ? 'Eintrag hat' : 'Einträge haben'} von Hand geänderte Werte, die vom Plan abweichen. Sie bleiben, wie du sie eingetragen hast.`,
      d.flaechen_aus_geometrie && `Bei ${d.flaechen_aus_geometrie} Bauteilen oder Räumen stand keine Menge in der Datei – die Fläche ist aus der Geometrie gerechnet.`,
      d.lage_aus_geometrie && `Bei ${d.lage_aus_geometrie} Wänden stand nicht in der Datei, ob sie außen oder innen liegen – das ist aus dem Grundriss ermittelt.`,
      d.teile_in_oeffnungen && `Fenster und Türen sind aus den Wandöffnungen gelesen; ihre ${d.teile_in_oeffnungen} Einzelteile (Rahmen, Flügel, Glas) zählen nicht als eigene Bauteile.`,
      ohneGeschoss && `${ohneGeschoss} Räume ohne Geschoss im Plan wurden ausgelassen.`,
      Object.keys(d.uebersprungen).length && `Nicht ins Modell übernommen: ${Object.entries(d.uebersprungen).map(([k, n]) => `${n} × ${k.replace(/^Ifc/, '')}`).join(', ')}.`,
      `Alles, was übernommen wird, trägt die Marke „aus IFC“. Format der Datei: ${d.schema}.`,
    ].filter((x): x is string => typeof x === 'string');
    return { je, hinweise, ohneGeschoss, befehle: liste.length, liste };
  });
}

export function ifcRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  // IFC-Dateien kommen als Ganzes (bis 300 MB)
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 300 * 1024 * 1024 }, (_req, body, fertig) => fertig(null, body));

  app.post('/api/gebaeudemodell/ifc/vorschau', { preHandler: e.nurAngemeldet, bodyLimit: 300 * 1024 * 1024 }, async (req): Promise<Vorschau> => {
    const q = req.query as { projekt?: string; version?: string };
    if (!KENNUNG.test(q.projekt ?? '') || !KENNUNG.test(q.version ?? '')) throw new Ablehnung('Projekt und Version fehlen');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Ablehnung('Die Datei fehlt');
    // Die 3D-Ansicht rechnet der IFC-Dienst nebenher; gespeichert wird sie mit der Übernahme (ohne auf sie zu warten).
    // Stimmt das Modell schon mit dem Plan überein, gibt es nichts zu übernehmen – dann zählt der Plan sofort, wenn noch keine 3D-Ansicht da ist.
    const netz = netzRechnen(req.body);
    const ablegen = () => { void netz.then((b) => (b ? netzSpeichern(e.db, e.register, q.version!, b).then(e.nachBefehlen) : undefined)).catch(() => undefined); };
    const plan = await planen(e.db, e.register, req.benutzer!, q.projekt!, q.version!, await lies(req.body));
    if (!plan.liste.length && !(await netzDa(q.version!))) ablegen();
    return merken(req.benutzer!.id, plan, async () => ablegen());
  });
}
