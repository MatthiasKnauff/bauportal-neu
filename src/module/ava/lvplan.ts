// LV aus einer Quelle speisen (Fenster- & Türliste, Gebäudemodell): die Quelle plant Zeilen mit einem festen Schlüssel
// „Quelle | Gruppe [| …]“, das LV trägt ihn im Feld `quelle`. So bleiben LV und Quelle abgleichbar, ohne dass etwas gelöscht wird.
// Reine Rechnung: im Browser, auf dem Server und in den Tests gleich.
import type { Werte } from '../../kern/modell';
import { istText } from '../../kern/lvarten';

type E = { id: string; werte: Werte };

/** Eine geplante LV-Zeile. `herkunft`: Kennungen der Einträge in der Quelle, aus denen sie entsteht. */
export interface LvZeilePlan { schluessel: string; art: 'titel' | 'hinweis' | 'normal'; kurztext: string; langtext: string; menge: number | null; einheit: string; herkunft: string[] }

/** Kurzer, fester Fingerabdruck eines Textes (FNV-1a, 8 Hex-Zeichen). */
export function abdruck(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const quelleVon = (p: E) => String(p.werte.quelle ?? '').split('|')[0] ?? '';

export interface Abgleich { neu: LvZeilePlan[]; aendern: { id: string; werte: Werte }[]; null: string[]; gleich: number }
/** Was sich im LV ändern muss, damit es zur Quelle passt: neue Zeilen, geänderte Mengen und Texte, weggefallene Positionen auf Menge 0
 *  (OZ, Preise und Vergabe bleiben – gelöscht wird nichts). Nur Zeilen mit dem Schlüssel dieser Quelle zählen. */
export function abgleichen(plan: LvZeilePlan[], vorhanden: E[], quelle: string): Abgleich {
  const da = new Map(vorhanden.filter((p) => quelleVon(p) === quelle).map((p) => [String(p.werte.quelle), p]));
  const erg: Abgleich = { neu: [], aendern: [], null: [], gleich: 0 };
  const geplant = new Set(plan.map((z) => z.schluessel));
  for (const z of plan) {
    const p = da.get(z.schluessel);
    if (!p) { erg.neu.push(z); continue; }
    const w: Werte = {};
    if (String(p.werte.kurztext ?? '') !== z.kurztext) w.kurztext = z.kurztext;
    if (z.art !== 'titel' && String(p.werte.langtext ?? '') !== z.langtext) w.langtext = z.langtext;
    if (z.menge != null && Number(p.werte.menge ?? 0) !== z.menge) w.menge = z.menge;
    if (Object.keys(w).length) erg.aendern.push({ id: p.id, werte: w }); else erg.gleich++;
  }
  for (const [k, p] of da) if (!geplant.has(k) && !istText(p.werte.art) && Number(p.werte.menge ?? 0) !== 0) erg.null.push(p.id);
  return erg;
}

/** Nur die Zeilen, die schon im LV stehen oder gewählt sind – Titel und Hinweise kommen mit, wenn eine Position unter ihrem Schlüssel
 *  dabei ist („modell|330“ ist Titel von „modell|330|…“). Eine Quelle wie das Gebäudemodell geht oft auf mehrere LVs (je Gewerk);
 *  jedes LV gleicht nur ab, was es von ihr übernommen hat. */
export function teilplan(plan: LvZeilePlan[], vorhanden: E[], quelle: string, gewaehlt: Set<string> = new Set()): LvZeilePlan[] {
  const im = new Set(vorhanden.filter((p) => quelleVon(p) === quelle).map((p) => String(p.werte.quelle)));
  const nimm = (z: LvZeilePlan) => im.has(z.schluessel) || gewaehlt.has(z.schluessel);
  const genommen = plan.filter((z) => z.art === 'normal' && nimm(z)).map((z) => z.schluessel);
  return plan.filter((z) => nimm(z) || (z.art !== 'normal' && genommen.some((k) => k.startsWith(`${z.schluessel}|`))));
}
