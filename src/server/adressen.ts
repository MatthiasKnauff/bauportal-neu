// Adressen aufräumen: doppelte Kontakte finden und zusammenführen. Doppelt heißt: gleicher Name (ohne Rechtsform,
// Satzzeichen, Groß-/Kleinschreibung), gleiche E-Mail oder gleiche Telefonnummer. Beim Zusammenführen zeigt alles,
// was auf einen Doppelten verweist (Beteiligte, Anwesende, Mängel …), auf den behaltenen Kontakt; leere Felder des
// behaltenen werden aus den Doppelten ergänzt; die Doppelten werden entfernt. Vorschau wie überall.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Befehl } from '../kern/befehl';
import { KENNUNG, type Werte } from '../kern/modell';
import type { Modulregister } from '../kern/modul';
import { alsBenutzer, spalte, tabelle, type Db } from './db';
import { werteAus } from './druck';
import { Ablehnung } from './protokoll';
import { merken, type Vorschau, type Zahl } from './uebernahme';

const RECHTSFORMEN = /\b(gmbh|mbh|co|kg|ag|ug|ohg|gbr|e\s?k|e\s?v|inh|haftungsbeschraenkt|und|u)\b/g;
/** Name zum Vergleichen: klein, Umlaute ausgeschrieben, ohne Rechtsform und Satzzeichen. */
export function nameSchluessel(n: string): string {
  return n.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[.,&+()/'"-]/g, ' ').replace(RECHTSFORMEN, ' ').replace(/\s+/g, '');
}
const ziffern = (t: unknown) => { const d = String(t ?? '').replace(/^\+49/, '0').replace(/\D/g, ''); return d.length >= 6 ? d : ''; };

export interface Kontakt { id: string; werte: Werte }
/** Gruppen von Kontakten, die wohl dieselben sind (je mindestens zwei). */
export function doppelteFinden(kontakte: Kontakt[]): { ids: string[]; grund: string[] }[] {
  const eltern = new Map(kontakte.map((k) => [k.id, k.id]));
  const wurzel = (id: string): string => { let x = id; while (eltern.get(x) !== x) x = eltern.get(x)!; return x; };
  const gruende = new Map<string, Set<string>>();
  const verbinden = (a: string, b: string, grund: string) => {
    const ra = wurzel(a), rb = wurzel(b);
    if (ra !== rb) eltern.set(rb, ra);
    for (const id of [a, b]) (gruende.get(id) ?? gruende.set(id, new Set()).get(id)!).add(grund);
  };
  const nach = (schluessel: (k: Kontakt) => string[], grund: string) => {
    const erster = new Map<string, string>();
    for (const k of kontakte) for (const s of schluessel(k)) { if (!s) continue; const e = erster.get(s); if (e) verbinden(e, k.id, grund); else erster.set(s, k.id); }
  };
  nach((k) => [nameSchluessel(String(k.werte.name ?? ''))].filter((s) => s.length >= 3), 'gleicher Name');
  nach((k) => [String(k.werte.email ?? '').trim().toLowerCase()].filter((s) => s.includes('@')), 'gleiche E-Mail');
  nach((k) => [ziffern(k.werte.telefon), ziffern(k.werte.mobil)], 'gleiche Telefonnummer');
  const gruppen = new Map<string, string[]>();
  for (const k of kontakte) { const r = wurzel(k.id); (gruppen.get(r) ?? gruppen.set(r, []).get(r)!).push(k.id); }
  return [...gruppen.values()].filter((g) => g.length > 1)
    .map((ids) => ({ ids, grund: [...new Set(ids.flatMap((id) => [...(gruende.get(id) ?? [])]))] }));
}

export function adressenRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> }): void {
  const kontaktModell = () => e.register.modell('kontakt')!;
  // Alle Felder, die auf einen Kontakt verweisen
  const verweise = () => e.register.alleModelle.flatMap((m) => m.felder.filter((f) => f.art === 'verweis' && f.ziel === 'kontakt').map((f) => ({ m, f })));

  app.get('/api/adressen/doppelte', { preHandler: e.nurAngemeldet }, async (req) => alsBenutzer(e.db, req.benutzer!, async (c) => {
    const kontakte = (await c.query(`select * from ${tabelle('kontakt')} where not geloescht`)).rows.map((z) => ({ id: z.id as string, werte: werteAus(kontaktModell(), z) }));
    return doppelteFinden(kontakte);
  }));

  app.post('/api/adressen/zusammenfuehren', { preHandler: e.nurAngemeldet }, async (req): Promise<Vorschau> => {
    const gruppen = ((req.body ?? {}) as { gruppen?: { behalten?: string; weg?: string[] }[] }).gruppen ?? [];
    const alle = gruppen.flatMap((g) => [g.behalten, ...(g.weg ?? [])]);
    if (!gruppen.length || alle.some((id) => !KENNUNG.test(id ?? '')) || new Set(alle).size !== alle.length) throw new Ablehnung('Die Auswahl passt nicht');
    // Verweise, die der Benutzer nicht sieht (Projekte ohne Zugang), würden ins Leere zeigen – solche Gruppen bleiben stehen
    const insgesamt = new Map<string, number>();
    for (const { m, f } of verweise()) for (const r of (await e.db.query(`select ${spalte(f.name)} as k, count(*)::int as n from ${tabelle(m.name)} where not geloescht and ${spalte(f.name)} = any($1) group by 1`, [alle])).rows) insgesamt.set(r.k, (insgesamt.get(r.k) ?? 0) + r.n);
    const ergebnis = await alsBenutzer(e.db, req.benutzer!, async (c) => {
      if (!(await c.query("select bp_darf('kontakt', 'loeschen', null) as d")).rows[0].d) throw new Ablehnung('Zum Zusammenführen fehlt dir das Recht');
      const km = kontaktModell();
      const kontakte = new Map((await c.query(`select * from ${tabelle('kontakt')} where not geloescht and id = any($1)`, [alle])).rows.map((z) => [z.id as string, werteAus(km, z)]));
      const liste: Befehl[] = [], je: Record<string, Zahl> = {}, hinweise: string[] = [];
      const zaehle = (titel: string, art: keyof Zahl) => { (je[titel] ??= { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 0, behalten: 0 })[art]++; };
      const kopf = () => ({ id: randomUUID(), gesehen: 0, herkunft: 'aufraeumen' });
      for (const g of gruppen) {
        const behalten = kontakte.get(g.behalten!);
        const weg = (g.weg ?? []).filter((id) => kontakte.has(id));
        if (!behalten || !weg.length) continue;
        const gesehen = new Map<string, number>();
        const befehle: Befehl[] = [], zahl: [string, keyof Zahl][] = [];
        for (const { m, f } of verweise()) {
          const zeilen = (await c.query(`select * from ${tabelle(m.name)} where not geloescht and ${spalte(f.name)} = any($1)`, [[g.behalten, ...weg]])).rows;
          for (const z of zeilen) gesehen.set(z[f.name], (gesehen.get(z[f.name]) ?? 0) + 1);
          // Reine Zuordnungen (alle Pflichtfelder sind Verweise, z. B. Beteiligte) gibt es danach nur einmal
          const zuordnung = m.felder.filter((x) => x.pflicht).every((x) => x.art === 'verweis');
          const andere = m.felder.filter((x) => x.pflicht && x.name !== f.name).map((x) => x.name);
          const schon = new Set(zeilen.filter((z) => z[f.name] === g.behalten).map((z) => andere.map((n) => z[n]).join('|')));
          for (const z of zeilen.filter((z) => weg.includes(z[f.name]))) {
            const s = andere.map((n) => z[n]).join('|');
            if (zuordnung && schon.has(s)) { befehle.push({ ...kopf(), objekt: m.name, art: 'loeschen', objektId: z.id }); zahl.push([m.titelMehrzahl, 'entfernt']); }
            else { befehle.push({ ...kopf(), objekt: m.name, art: 'aendern', objektId: z.id, werte: { [f.name]: g.behalten! } }); zahl.push([m.titelMehrzahl, 'geaendert']); schon.add(s); }
          }
        }
        const versteckt = [g.behalten!, ...weg].some((id) => (insgesamt.get(id) ?? 0) > (gesehen.get(id) ?? 0));
        const name = String(behalten.name ?? '');
        if (versteckt) { hinweise.push(`„${name}“ bleibt, wie es ist: Ein Doppelter steht in Projekten, die du nicht siehst.`); continue; }
        // Leere Felder des behaltenen ergänzen; Notizen hängen aneinander
        const ergaenzt: Werte = {};
        for (const f of km.felder) {
          if (f.verborgen || f.name === 'name') continue;
          for (const id of weg) {
            const w = kontakte.get(id)![f.name];
            if (w == null || w === '') continue;
            const jetzt = ergaenzt[f.name] ?? behalten[f.name];
            if (jetzt == null || jetzt === '') ergaenzt[f.name] = w;
            else if (f.art === 'langtext' && !String(jetzt).includes(String(w))) ergaenzt[f.name] = `${String(jetzt)}\n${String(w)}`;
          }
        }
        if (Object.keys(ergaenzt).length) { befehle.push({ ...kopf(), objekt: 'kontakt', art: 'aendern', objektId: g.behalten!, werte: ergaenzt }); zahl.push(['Kontakte', 'geaendert']); }
        for (const id of weg) { befehle.push({ ...kopf(), objekt: 'kontakt', art: 'loeschen', objektId: id }); zahl.push(['Kontakte', 'entfernt']); }
        liste.push(...befehle);
        for (const [t, a] of zahl) zaehle(t, a);
        hinweise.push(`„${name}“ bleibt; ${weg.length === 1 ? `„${String(kontakte.get(weg[0]!)!.name ?? '')}“ wird entfernt` : `${weg.length} Doppelte werden entfernt`}.`);
      }
      hinweise.push('Was auf die Doppelten verwiesen hat (Beteiligte, Anwesende, Mängel …), zeigt danach auf den behaltenen Kontakt.');
      return { liste, je, hinweise };
    });
    return merken(req.benutzer!.id, ergebnis);
  });
}
