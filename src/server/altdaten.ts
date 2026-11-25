// Übernahme aus dem bisherigen Bautagebuch: Dessen Export (eine JSON-Datei mit den Tabellen projects, reports, items,
// images, contacts) wird in Objekte des neuen Bauportals übersetzt und über die gemeinsame Übernahme eingespielt –
// mit Vorschau, wiederholbar (jeder Eintrag trägt die Kennung seiner alten Zeile), ohne etwas doppelt anzulegen.
// Die Fotos selbst stecken nicht im Export; sie werden danach als Dateien nachgereicht und über ihren Namen zugeordnet.
// Aus dem alten Programm stammt hier nur das Datenformat, kein Code.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';
import { fotoAblegen } from './foto';
import { abgleicher, merken, type Eintrag, type Vorschau, type Zahl } from './uebernahme';

type Alt = Record<string, unknown>;
interface Export { format?: number; tables?: Record<string, Alt[]> }
type Fest = { kennung: string; werte: Werte };
export interface Uebersetzt { kontakte: Fest[]; projekte: Fest[]; berichte: (Fest & { projekt: string; bauleitung: string })[]; eintraege: (Fest & { bericht: string; firma: string })[]; bilder: { datei: string; bericht: string; beschriftung: string; reihe: number }[]; hinweise: string[] }

const ARTEN: Record<string, string> = { anwesende: 'anwesend', notizen: 'notiz', maengel: 'mangel', zu_erledigen: 'aufgabe', weisungen: 'weisung' };
const text = (w: unknown) => (w == null ? '' : String(w)).trim();
const zahl = (w: unknown) => { const n = Number(text(w).replace(',', '.').replace(/[^\d.-]/g, '')); return text(w) && Number.isFinite(n) ? n : null; };
const datum = (w: unknown) => (/^\d{4}-\d{2}-\d{2}/.exec(text(w))?.[0] ?? '');
function wetter(lage: string, niederschlag: string): string {
  const t = `${lage} ${niederschlag}`.toLowerCase();
  if (t.includes('gewitter') || t.includes('sturm')) return 'sturm';
  if (t.includes('schnee')) return 'schnee';
  if (t.includes('regen')) return 'regen';
  if (t.includes('frost')) return 'frost';
  if (t.includes('heiter') || t.includes('sonn')) return 'sonnig';
  return /wolk|bedeckt|nebel|bewölkt/.test(t) ? 'bewoelkt' : '';
}

/** Übersetzt den Export in Einträge je Objekt. Reine Funktion – Verweise stehen noch als alte Kennungen da. */
export function altdatenLesen(roh: unknown): Uebersetzt {
  const t = (roh as Export)?.tables;
  if (!t || !Array.isArray(t.projects) || !Array.isArray(t.reports)) throw new Ablehnung('Das ist kein Export des Bautagebuchs (Datei „bautagebuch-…json“ aus Einstellungen → Export)');
  const hinweise: string[] = [];
  const kontakte = (t.contacts ?? []).filter((k) => text(k.name)).map((k): Fest => ({ kennung: `alt:kontakt:${k.id}`, werte: {
    name: text(k.name).slice(0, 300), art: ['firma', 'person', 'behoerde', 'plotdienst'].includes(text(k.art)) ? text(k.art) : 'firma', ansprechpartner: text(k.contact_person), gewerk: text(k.trade),
    strasse: text(k.street), plz: text(k.zip), ort: text(k.city), telefon: text(k.phone), mobil: text(k.mobile), email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(k.email)) ? text(k.email) : '', web: text(k.website), notiz: text(k.notes) } }));
  const projekte = t.projects.filter((p) => text(p.name)).map((p): Fest => ({ kennung: `alt:projekt:${p.id}`, werte: {
    name: text(p.name), bauherr: text(p.client), strasse: text(p.street), plz: text(p.zip), ort: text(p.city), ordner: text(p.folder), status: Number(p.archived) ? 'archiviert' : 'aktiv' } }));
  const projektDa = new Set(projekte.map((p) => p.kennung));
  const berichte = t.reports.filter((r) => projektDa.has(`alt:projekt:${r.project_id}`) && datum(r.date)).map((r) => ({ kennung: `alt:bericht:${r.id}`, projekt: `alt:projekt:${r.project_id}`, bauleitung: text(r.site_manager), werte: {
    nummer: zahl(r.number), datum: datum(r.date), uhrzeit: /^\d{1,2}:\d{2}/.exec(text(r.time))?.[0] ?? '', titel: `Tagesbericht ${zahl(r.number) ?? ''}`.trim(),
    wetter: wetter(text(r.weather), text(r.precip)), temperatur: zahl(r.temp), luftfeuchte: zahl(r.humidity), wind: zahl(r.wind),
    aufgeraeumt: !!Number(r.chk_tidy), masskontrolle: !!Number(r.chk_measure), fotodoku: !!Number(r.chk_photos), firmen_angesprochen: !!Number(r.chk_firms) } as Werte }));
  const ohneDatum = t.reports.length - berichte.length;
  if (ohneDatum) hinweise.push(`${ohneDatum} Berichte ohne Datum oder ohne Projekt wurden ausgelassen.`);
  const berichtDa = new Set(berichte.map((b) => b.kennung));
  const namen = new Map(kontakte.map((k) => [String(k.werte.name).toLowerCase(), k.kennung]));
  const reihe = new Map<string, number>();
  let fremd = 0;
  const eintraege = (t.items ?? []).filter((i) => { const ok = berichtDa.has(`alt:bericht:${i.report_id}`) && ARTEN[text(i.kind)]; if (!ok) fremd++; return ok; }).sort((a, b) => Number(a.id) - Number(b.id)).map((i) => {
    const art = ARTEN[text(i.kind)]!, bericht = `alt:bericht:${i.report_id}`;
    const n = (reihe.get(bericht + art) ?? 0) + 1; reihe.set(bericht + art, n);
    // Firma: verknüpfter Kontakt, sonst der Name (bei Anwesenden steht er im Text, bei Mängeln und Weisungen im Feld „company“)
    const firmenname = art === 'anwesend' ? text(i.text) : text(i.company);
    const firma = i.contact_id != null ? `alt:kontakt:${i.contact_id}` : namen.get(firmenname.toLowerCase()) ?? '';
    return { kennung: `alt:eintrag:${i.id}`, bericht, firma, werte: {
      art, text: art === 'anwesend' ? [firma ? '' : firmenname, text(i.activity)].filter(Boolean).join(' – ') : [text(i.text), !firma && firmenname ? `(${firmenname})` : ''].filter(Boolean).join(' '),
      personen: art === 'anwesend' ? zahl(i.headcount) : null, frist: art === 'anwesend' ? '' : datum(i.due), erledigt: (art === 'mangel' || art === 'aufgabe') && !!Number(i.done), reihe: n } as Werte };
  });
  if (fremd) hinweise.push(`${fremd} Einträge aus Abschnitten, die es im neuen Bautagebuch nicht gibt, wurden ausgelassen.`);
  const bildreihe = new Map<string, number>();
  const bilder = (t.images ?? []).filter((b) => berichtDa.has(`alt:bericht:${b.report_id}`) && text(b.file)).sort((a, b) => Number(a.id) - Number(b.id)).map((b) => {
    const bericht = `alt:bericht:${b.report_id}`; const n = (bildreihe.get(bericht) ?? 0) + 1; bildreihe.set(bericht, n);
    return { datei: text(b.file), bericht, beschriftung: text(b.caption).slice(0, 300), reihe: n };
  });
  return { kontakte, projekte, berichte, eintraege, bilder, hinweise };
}

export async function altdatenPlanen(db: Db, register: Modulregister, wer: Benutzer, u: Uebersetzt): Promise<{ je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[] }> {
  return alsBenutzer(db, wer, async (c) => {
    const { liste, je, ort, abgleichen } = abgleicher(c, register, {}, 'uebernahme', ['uebernahme']);
    const alt = (k: string) => k.startsWith('alt:');
    // Kontakte und Projekte, die es unter demselben Namen schon gibt, werden weitergeführt statt doppelt angelegt
    const gleicherName = (e: Fest, da: Record<string, unknown>[]) => da.find((x) => x.kennung === '' && String(x.name).toLowerCase() === String(e.werte.name).toLowerCase());
    await abgleichen('kontakt', u.kontakte, alt, gleicherName);
    await abgleichen('projekt', u.projekte, alt, gleicherName);
    const benutzer = new Map<string, string>((await c.query('select id, name from o_benutzer where not geloescht')).rows.map((b) => [String(b.name).toLowerCase(), b.id]));
    let ohneLeitung = 0;
    await abgleichen('tagesbericht', u.berichte.map((b) => {
      const leitung = b.bauleitung.split(/[,;/]+/).map((n) => benutzer.get(n.trim().toLowerCase())).find(Boolean) ?? null;
      if (b.bauleitung && !leitung) ohneLeitung++;
      return { kennung: b.kennung, werte: { ...b.werte, projekt: ort.projekt!.get(b.projekt)!, bauleitung: leitung } };
    }), alt);
    const projektVon = new Map(u.berichte.map((b) => [b.kennung, ort.projekt!.get(b.projekt)!]));
    await abgleichen('bericht_eintrag', u.eintraege.map((e) => ({ kennung: e.kennung, werte: { ...e.werte, projekt: projektVon.get(e.bericht)!, bericht: ort.tagesbericht!.get(e.bericht)!, firma: (e.firma && ort.kontakt!.get(e.firma)) || null } })), alt);
    const behalten = Object.values(je).reduce((n, z) => n + z.behalten, 0);
    return { je, liste, hinweise: [
      !liste.length && 'Alles aus diesem Export ist schon im Bauportal – es gibt nichts zu übernehmen.',
      behalten && `${behalten} Einträge wurden im neuen Bauportal schon von Hand geändert. Sie bleiben, wie sie sind.`,
      ohneLeitung && `Bei ${ohneLeitung} Berichten steht als Bauleitung ein Name, den es hier nicht als Benutzer gibt – das Feld bleibt leer. (Erst die Benutzer anlegen, dann noch einmal übernehmen.)`,
      'Wer im alten Bautagebuch ein Projekt sehen durfte, steht nicht im Export. Die Mitglieder der Projekte trägst du unter Projekte ein; Büroleitung und Administrator:innen sehen alle.',
      u.bilder.length && `${u.bilder.length} Fotos gehören zu diesen Berichten. Sie werden im zweiten Schritt als Dateien nachgereicht.`,
      ...u.hinweise,
      'Alles Übernommene trägt die Marke „übernommen“. Die Übernahme lässt sich wiederholen: Sie ergänzt und ändert, legt aber nichts doppelt an.',
    ].filter((x): x is string => typeof x === 'string') };
  });
}

export function altdatenRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; umgebung: string; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  const { db } = e;
  const admin = (req: FastifyRequest) => { if (req.benutzer!.rolle !== 'admin') throw new Ablehnung('Das dürfen nur Administrator:innen'); };

  // Schritt 1: der Export als Datei → Vorschau. Übernommen wird über /api/uebernehmen.
  app.post('/api/altdaten/vorschau', { preHandler: e.nurAngemeldet, bodyLimit: 300 * 1024 * 1024 }, async (req): Promise<Vorschau> => {
    admin(req);
    let roh: unknown;
    try { roh = JSON.parse((req.body as Buffer).toString('utf8')); } catch { throw new Ablehnung('Die Datei ist nicht lesbar (erwartet wird der JSON-Export des Bautagebuchs)'); }
    const u = altdatenLesen(roh);
    return merken(req.benutzer!.id, await altdatenPlanen(db, e.register, req.benutzer!, u), async () => {
      // welche Fotos zu welchem Bericht gehören, merken – bis die Dateien nachgereicht sind
      for (const b of u.bilder) await db.query('insert into kern_altbild (datei, bericht, beschriftung, reihe) values ($1,$2,$3,$4) on conflict (datei) do update set bericht = excluded.bericht, beschriftung = excluded.beschriftung, reihe = excluded.reihe', [b.datei, b.bericht, b.beschriftung, b.reihe]);
    });
  });

  // Schritt 2: Fotos nachreichen
  app.get('/api/altdaten/fotos', { preHandler: e.nurAngemeldet }, async (req) => {
    admin(req);
    const r = (await db.query('select datei, foto is not null as da from kern_altbild order by datei')).rows as { datei: string; da: boolean }[];
    return { offen: r.filter((x) => !x.da).map((x) => x.datei), erledigt: r.filter((x) => x.da).length };
  });
  app.post('/api/altdaten/foto', { preHandler: e.nurAngemeldet, bodyLimit: 60 * 1024 * 1024 }, async (req) => {
    admin(req);
    const b = (req.body ?? {}) as { datei?: string; original?: string; vorschau?: string };
    const z = (await db.query('select a.datei, a.beschriftung, a.reihe, a.foto, t.id as bericht, t.projekt from kern_altbild a join o_tagesbericht t on t.kennung = a.bericht and not t.geloescht where a.datei = $1', [String(b.datei ?? '')])).rows[0];
    if (!z) throw new Ablehnung('Dieses Foto gehört zu keinem übernommenen Bericht');
    if (z.foto) return { id: z.foto as string, schon: true };
    const f = await fotoAblegen(db, e.register, e.umgebung, req.benutzer!, { projekt: z.projekt, bericht: z.bericht, name: z.datei, original: Buffer.from(String(b.original ?? ''), 'base64'), vorschau: Buffer.from(String(b.vorschau ?? ''), 'base64'),
      beschriftung: z.beschriftung, kennung: `alt:bild:${z.datei}`, herkunft: 'uebernahme' });
    await db.query('update kern_altbild set foto = $2 where datei = $1', [z.datei, f.id]);
    e.nachBefehlen();
    return { id: f.id, schon: false };
  });
}
