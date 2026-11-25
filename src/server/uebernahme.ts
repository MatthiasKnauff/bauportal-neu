// Übernahme aus einer Quelle (IFC-Plan, Assistent, Katalog): Die Quelle liefert Einträge mit einer Kennung; hier werden
// sie mit dem Vorhandenen verglichen (im Gebäudemodell: mit einer Version). Erst die Vorschau („was würde sich ändern“), dann – nach
// Bestätigung – die Übernahme als ein Vorgang: alles oder nichts. Von Hand Eingetragenes überschreibt keine Quelle.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Modulregister } from '../kern/modul';
import type { Befehl } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { spalte, tabelle, type Db } from './db';
import { Ablehnung, vorgangAusfuehren } from './protokoll';

export type Zahl = { neu: number; geaendert: number; entfernt: number; unveraendert: number; behalten: number };
export interface Vorschau { token: string; je: Record<string, Zahl>; hinweise: string[]; befehle: number; eintraege: number /* ohne Befehle eingespielt (Nachschlag) */ }
/** werte als Funktion: wird erst ausgewertet, wenn alle Einträge derselben Art ihre Kennung haben (Bauteil verweist auf Bauteil). */
export interface Eintrag { kennung: string; werte: Werte | (() => Werte) }
type Vorhanden = Record<string, unknown>;
/** So beginnen die Kennungen dessen, was der Assistent geschätzt hat. */
export const ASSISTENT = 'assistent:';

/**
 * Vergleicht Einträge einer Quelle mit dem Modell und sammelt die Befehle.
 * herkunft: Marke der übernommenen Werte. ueberschreibbar: Werte mit diesen Marken darf die Quelle ersetzen
 * (alles andere gilt als von Hand eingetragen und bleibt).
 */
export function abgleicher(c: PoolClient, register: Modulregister, ziel: Werte, herkunft: string, ueberschreibbar: string[]) {
  // ziel: der Zusammenhang, in dem verglichen wird (z. B. Projekt und Version) – neue Einträge bekommen ihn mit
  const wo = Object.keys(ziel).filter((k) => k !== 'projekt');
  const liste: Befehl[] = [];
  const je: Record<string, Zahl> = {};
  // Kennung der Quelle -> Kennung im Bauportal, je Objektart; so finden Geschosse ihr Gebäude und Bauteile ihr Geschoss
  const ort: Record<string, Map<string, string>> = {};
  const kopf = () => ({ id: randomUUID(), gesehen: 0, herkunft });

  /**
   * gehoert: welche vorhandenen Einträge zu dieser Quelle zählen – fehlen sie im neuen Stand, entfallen sie.
   * ersatz: vorhandener Eintrag, den ein neuer Eintrag weiterführt, statt daneben zu entstehen (z. B. das geschätzte
   *         Erdgeschoss wird das Erdgeschoss aus dem Plan – was daran hängt, bleibt hängen).
   */
  const abgleichen = async (objekt: string, eintraege: Eintrag[], gehoert: (kennung: string) => boolean, ersatz?: (e: { kennung: string; werte: Werte }, vorhanden: Vorhanden[]) => Vorhanden | undefined) => {
    const m = register.modell(objekt)!;
    const z: Zahl = (je[objekt] = { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 0, behalten: 0 });
    const alle: Vorhanden[] = (await c.query(`select * from ${tabelle(objekt)}${wo.length ? ' where ' + wo.map((k, i) => `${spalte(k)} = $${i + 1}`).join(' and ') : ''}`, wo.map((k) => ziel[k]))).rows;
    const da = new Map<string, Vorhanden>(alle.filter((x) => x.kennung !== '').map((x) => [x.kennung as string, x]));
    const vergeben = new Set<unknown>();
    const karte = (ort[objekt] = new Map<string, string>());
    // 1. Durchgang: Wer ist wer? Jeder Eintrag bekommt seine Kennung im Bauportal (vorhanden, weitergeführt oder neu).
    const paare = eintraege.map((e) => {
      let alt = da.get(e.kennung);
      let ersetzt = false;
      if (!alt && ersatz) {
        alt = ersatz({ kennung: e.kennung, werte: typeof e.werte === 'function' ? {} : e.werte }, alle.filter((x) => !x.geloescht && !vergeben.has(x.id) && !eintraege.some((n) => n.kennung === x.kennung)));
        ersetzt = !!alt;
      }
      const id = alt ? (alt.id as string) : randomUUID();
      if (alt) vergeben.add(id);
      karte.set(e.kennung, id);
      return { e, alt, id, ersetzt };
    });
    // 2. Durchgang: Werte vergleichen und die Befehle bilden
    for (const { e, alt, id, ersetzt } of paare) {
      const roh = typeof e.werte === 'function' ? e.werte() : e.werte;
      const werte = ersetzt ? { ...roh, kennung: e.kennung } : roh;
      if (!alt) {
        liste.push({ ...kopf(), objekt, art: 'anlegen', objektId: id, werte: { ...ziel, kennung: e.kennung, ...werte } });
        z.neu++;
        continue;
      }
      if (alt.geloescht) liste.push({ ...kopf(), objekt, art: 'wiederherstellen', objektId: id });
      const stand = alt._stand as Record<string, { herkunft?: string }>;
      const aendern: Werte = {};
      let behalten = false;
      for (const [k, w] of Object.entries(werte)) {
        const jetzt = alt[k] ?? null;
        const gleich = jetzt === w || (jetzt === '' && w === null) || (typeof w === 'number' && jetzt !== null && Number(jetzt) === w);
        if (gleich || !m.felder.some((f) => f.name === k)) continue;
        // Von Hand eingetragen (keine überschreibbare Marke) und nicht leer: bleibt, auch wenn die Quelle jetzt anderes sagt.
        if (!ueberschreibbar.includes(stand[k]?.herkunft ?? '') && jetzt !== '' && jetzt !== null) behalten = true; else aendern[k] = w;
      }
      if (Object.keys(aendern).length) { liste.push({ ...kopf(), objekt, art: 'aendern', objektId: id, werte: aendern }); z.geaendert++; }
      else if (alt.geloescht) z.neu++;
      else z.unveraendert++;
      if (behalten) z.behalten++;
    }
    // Was aus der Quelle stammte und im neuen Stand fehlt, wird entfernt (bleibt im Protokoll und lässt sich zurückholen).
    for (const alt of da.values()) if (!alt.geloescht && !vergeben.has(alt.id) && gehoert(alt.kennung as string)) { liste.push({ ...kopf(), objekt, art: 'loeschen', objektId: alt.id as string }); z.entfernt++; }
    return alle;
  };
  return { liste, je, ort, abgleichen };
}

export async function versionPruefen(c: PoolClient, projekt: string, version: string): Promise<void> {
  const v = (await c.query("select 1 from o_version where id = $1 and projekt = $2 and bereich = 'gebaeudemodell' and not geloescht", [version, projekt])).rowCount;
  if (!v) throw new Ablehnung('Die Version des Gebäudemodells gibt es nicht (mehr)');
}

// Vorschauen warten 30 Minuten auf die Bestätigung
const plaene = new Map<string, { wer: string; befehle: Befehl[]; bis: number; danach?: () => Promise<void> }>();
/** danach: läuft nach der Übernahme (z. B. den eingespielten Katalogstand festhalten). */
export function merken(wer: string, plan: { je: Record<string, Zahl>; hinweise: string[]; liste: Befehl[]; eintraege?: number }, danach?: () => Promise<void>): Vorschau {
  const token = randomUUID();
  for (const [k, p] of plaene) if (p.bis < Date.now()) plaene.delete(k);
  plaene.set(token, { wer, befehle: plan.liste, bis: Date.now() + 30 * 60000, danach });
  return { token, je: plan.je, hinweise: plan.hinweise, befehle: plan.liste.length, eintraege: plan.eintraege ?? 0 };
}

export function uebernahmeRouten(app: FastifyInstance, e: { db: Db; register: Modulregister; nurAngemeldet: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>; nachBefehlen: () => void }): void {
  app.post('/api/uebernehmen', { preHandler: e.nurAngemeldet }, async (req) => {
    const token = String((req.body as { token?: unknown } | null)?.token ?? '');
    const plan = plaene.get(token);
    if (!plan || plan.wer !== req.benutzer!.id || plan.bis < Date.now()) throw new Ablehnung('Die Vorschau ist abgelaufen – bitte noch einmal beginnen');
    plaene.delete(token);
    if (plan.befehle.length) await vorgangAusfuehren(e.db, e.register, req.benutzer!, plan.befehle);
    await plan.danach?.();
    e.nachBefehlen();
    return { ok: true, befehle: plan.befehle.length };
  });
}
