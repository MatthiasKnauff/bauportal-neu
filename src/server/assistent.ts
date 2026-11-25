// Assistent fürs Gebäudemodell: Die Antworten stehen am Gebäude (von Hand eingetragen, jederzeit änderbar);
// daraus werden Geschosse und Bauteile geschätzt (schaetzung.ts) und über dieselbe Vorschau übernommen wie ein Plan.
// Liegt schon ein Plan (IFC) in der Version, schätzt der Assistent nichts dazu – er trägt nur die Antworten ein.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import { KENNUNG, pruefeWerte, type Werte } from '../kern/modell';
import { schaetzen } from '../module/gebaeudemodell/schaetzung';
import { alsBenutzer, type Db } from './db';
import { Ablehnung } from './protokoll';
import type { Benutzer } from './anmeldung';
import { KEIN_KG_KATALOG, kostengruppen } from './gebaeudemodell';
import { kostengruppeNummer } from '../module/gebaeudemodell/beipackzettel';
import { ASSISTENT, abgleicher, merken, versionPruefen, type Vorschau, type Zahl } from './uebernahme';

/** gebaeude = Kennung eines vorhandenen Gebäudes, sonst entsteht ein neues. */
export async function planeSchaetzung(db: Db, register: Modulregister, wer: Benutzer, projekt: string, version: string, gebaeude: string | null, antworten: Record<string, unknown>): Promise<{ je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[]; gebaeude: string }> {
  const m = register.modell('gebaeude')!;
  const { projekt: _p, version: _v, kennung: _k, ...roh } = antworten;
  const werte = pruefeWerte(m, roh, false);
  return alsBenutzer(db, wer, async (c) => {
    await versionPruefen(c, projekt, version);
    const alt = gebaeude ? (await c.query('select * from o_gebaeude where id = $1 and version = $2 and not geloescht', [gebaeude, version])).rows[0] : undefined;
    if (gebaeude && !alt) throw new Ablehnung('Das Gebäude gibt es nicht (mehr)');
    const id = gebaeude ?? randomUUID();
    // Zahlen kommen aus der Datenbank als Text – für die Rechnung wieder Zahlen
    const bisher = Object.fromEntries(m.felder.map((f) => [f.name, f.art === 'zahl' && alt?.[f.name] != null ? Number(alt[f.name]) : (alt?.[f.name] ?? null)]));
    const s = schaetzen({ ...bisher, ...werte });
    if ('fehlt' in s) throw new Ablehnung(s.fehlt);

    // Die Antworten selbst: von Hand gegeben, also ohne Marke. Nur die geschätzte Brutto-Grundfläche ist „geschätzt“.
    const vorweg: Befehl[] = [];
    const bgfGeschaetzt = !(typeof werte.bgf === 'number' && werte.bgf > 0) && (!alt || alt.bgf === null || alt._stand?.bgf?.herkunft === 'geschaetzt');
    const { bgf: _b, ...ohneBgf } = werte;
    const eigene = bgfGeschaetzt ? ohneBgf : werte;
    if (!alt) vorweg.push({ id: randomUUID(), gesehen: 0, objekt: 'gebaeude', art: 'anlegen', objektId: id, werte: { projekt, version, ...eigene, name: werte.name || 'Gebäude' } });
    else {
      const neu = Object.fromEntries(Object.entries(eigene).filter(([k, w]) => (alt[k] ?? null) !== w && !(typeof w === 'number' && Number(alt[k]) === w)));
      if (Object.keys(neu).length) vorweg.push({ id: randomUUID(), gesehen: 0, objekt: 'gebaeude', art: 'aendern', objektId: id, werte: neu });
    }
    if (bgfGeschaetzt && Number(alt?.bgf) !== s.bgf) vorweg.push({ id: randomUUID(), gesehen: 0, objekt: 'gebaeude', art: 'aendern', objektId: id, werte: { bgf: s.bgf }, herkunft: 'geschaetzt' });

    const { liste, je, ort, abgleichen } = abgleicher(c, register, { projekt, version }, 'geschaetzt', ['geschaetzt']);
    const vor = `${ASSISTENT}${id}:`;
    const meins = (k: string) => k.startsWith(vor);
    const ausPlan = (await c.query(`select count(*)::int as n from o_bauteil where version = $1 and not geloescht and kennung <> '' and kennung not like $2`, [version, `${ASSISTENT}%`])).rows[0].n as number;
    const hinweise: string[] = [];
    if (ausPlan) {
      // Was früher geschätzt wurde, hat der Plan schon ersetzt; hier bleibt nur aufzuräumen, falls etwas übrig ist.
      await abgleichen('bauteil', [], meins);
      await abgleichen('aufbau', [], meins);
      hinweise.push(`In dieser Version liegen schon ${ausPlan} Bauteile aus einem Plan. Der Assistent trägt deshalb nur die Angaben zum Gebäude ein und schätzt keine Bauteile dazu.`);
    } else {
      await abgleichen('geschoss', s.geschosse.map((g) => ({ kennung: vor + g.schluessel, werte: { name: g.name, ebene: g.ebene, hoehe: g.hoehe, flaeche: g.flaeche, gebaeude: id } })), meins);
      // Ein geschätzter Aufbau je Art und Beschreibung – ohne Schichten, die kennt erst der Plan
      const aufbauKennung = (b: { art: string; aufbau: string }) => `${vor}aufbau:${b.art}:${b.aufbau}`;
      const aufbauten = new Map(s.bauteile.filter((b) => b.aufbau).map((b) => [aufbauKennung(b), { kennung: aufbauKennung(b), werte: { name: b.aufbau, art: b.art } }]));
      await abgleichen('aufbau', [...aufbauten.values()], meins);
      const kg = await kostengruppen(c);
      await abgleichen('bauteil', s.bauteile.map((b) => ({ kennung: vor + b.schluessel, werte: () => ({
        name: b.name, art: b.art, lage: b.lage, menge: b.menge, einheit: b.einheit,
        aufbau: (b.aufbau && ort.aufbau!.get(aufbauKennung(b))) || null,
        kostengruppe: kg.get(kostengruppeNummer(b.art, b.lage, '') ?? '') ?? null,
        geschoss: (b.geschoss && ort.geschoss!.get(vor + b.geschoss)) || null }) })), meins);
      if (!kg.size) hinweise.push(KEIN_KG_KATALOG);
      const behalten = Object.values(je).reduce((n, z) => n + z.behalten, 0);
      if (behalten) hinweise.push(`${behalten} ${behalten === 1 ? 'Eintrag hat' : 'Einträge haben'} von Hand geänderte Werte. Sie bleiben, wie du sie eingetragen hast.`);
      hinweise.push(...s.annahmen.map((a) => `Annahme: ${a}.`));
      hinweise.push('Geschosse und Bauteile tragen die Marke „geschätzt“. Sobald ein Plan (IFC) eingelesen wird, ersetzt er sie.');
    }
    je.gebaeude = { neu: alt ? 0 : 1, geaendert: alt && vorweg.length ? 1 : 0, entfernt: 0, unveraendert: alt && !vorweg.length ? 1 : 0, behalten: 0 };
    const alle = [...vorweg, ...liste];
    if (!alle.length) hinweise.unshift('Das Gebäudemodell passt schon zu diesen Angaben – es gibt nichts zu übernehmen.');
    return { je: { gebaeude: je.gebaeude, ...je }, hinweise, liste: alle, gebaeude: id };
  });
}

export function assistentRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  app.post('/api/gebaeudemodell/assistent/vorschau', { preHandler: e.nurAngemeldet }, async (req): Promise<Vorschau> => {
    const b = (req.body ?? {}) as { projekt?: string; version?: string; gebaeude?: string | null; antworten?: Werte };
    if (!KENNUNG.test(b.projekt ?? '') || !KENNUNG.test(b.version ?? '') || (b.gebaeude && !KENNUNG.test(b.gebaeude))) throw new Ablehnung('Projekt und Version fehlen');
    return merken(req.benutzer!.id, await planeSchaetzung(e.db, e.register, req.benutzer!, b.projekt!, b.version!, b.gebaeude || null, b.antworten ?? {}));
  });
}
