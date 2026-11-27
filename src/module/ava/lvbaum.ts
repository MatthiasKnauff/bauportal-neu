// Das LV als Baum (wie im bisherigen Bauportal): Titel bis zur 4. Ebene, darunter Positionen. Die Ebene ergibt sich aus der
// Ordnungszahl – ein Titel „01.02“ steht auf Ebene 2, seine Positionen „01.02.0010“ darunter. Nummerieren nach einer OZ-Maske wie
// in GAEB: je Titelebene feste Stellen, Positionen in Zehnerschritten. Reine Rechnung, ohne Oberfläche.

import type { Werte } from '../../kern/modell';
import { nachOz } from '../../kern/oz';

type E = { id: string; werte: Werte };
export interface LvZeile { id: string; ebene: number; titel: boolean; oz: string; eltern: string | null }
export interface OzMaske { titel: number[]; position: number; schritt: number }   // Stellen je Titelebene, Stellen der Position, Schrittweite
export const MASKE_VORGABE: OzMaske = { titel: [2, 2, 2, 2], position: 4, schritt: 10 };

const istTitel = (z: E) => z.werte.art === 'titel';
const teile = (oz: unknown) => String(oz ?? '').split('.').filter(Boolean);

/** Zeilen in LV-Reihenfolge mit Ebene: ein Titel hängt am nächsten Titel davor, dessen OZ ein Anfang seiner ist; eine Position am letzten Titel. */
export function lvZeilen(positionen: E[]): LvZeile[] {
  const stapel: LvZeile[] = [], aus: LvZeile[] = [];
  for (const z of nachOz(positionen)) {
    const oz = String(z.werte.oz ?? ''), titel = istTitel(z);
    while (stapel.length && !oz.startsWith(`${stapel[stapel.length - 1]!.oz}.`)) stapel.pop();
    const eltern = stapel[stapel.length - 1] ?? null;
    const zeile: LvZeile = { id: z.id, ebene: eltern ? eltern.ebene + 1 : 0, titel, oz, eltern: eltern?.id ?? null };
    aus.push(zeile);
    if (titel) stapel.push(zeile);
  }
  return aus;
}

const stellen = (n: number, k: number) => String(n).padStart(k, '0');

/** Neu nummerieren nach der Maske, in der jetzigen Reihenfolge. → Kennung → neue OZ (nur, was sich ändert). */
export function nummerieren(zeilen: LvZeile[], m: OzMaske = MASKE_VORGABE): Map<string, string> {
  const neu = new Map<string, string>(), zaehler = new Map<string | null, { t: number; p: number }>(), oz = new Map<string | null, string>([[null, '']]);
  for (const z of zeilen) {
    const c = zaehler.get(z.eltern) ?? { t: 0, p: 0 }; zaehler.set(z.eltern, c);
    const vorn = oz.get(z.eltern) ?? '', ebeneT = z.eltern ? (zeilen.find((x) => x.id === z.eltern)!.ebene + 1) : 0;
    const eigen = z.titel ? stellen(++c.t, m.titel[Math.min(ebeneT, m.titel.length - 1)] ?? 2) : stellen((++c.p) * m.schritt, m.position);
    const ganz = vorn ? `${vorn}.${eigen}` : eigen;
    oz.set(z.id, ganz);
    if (ganz !== z.oz) neu.set(z.id, ganz);
  }
  return neu;
}

/** OZ für eine neue Zeile hinter „nach“ (oder am Ende des Titels „in“): zwischen den Nachbarn, wenn Platz ist; sonst die nächste freie. */
export function neueOz(zeilen: LvZeile[], o: { nach?: string | null; titel: boolean }, m: OzMaske = MASKE_VORGABE): string {
  const nach = o.nach ? zeilen.find((z) => z.id === o.nach) : undefined;
  // neue Position hinter einem Titel: als erste darin; neuer Titel hinter einer Position: hinter deren Titel auf seiner Ebene
  const eltern = nach ? (nach.titel && !o.titel ? nach.id : nach.titel && o.titel ? nach.eltern : nach.eltern) : null;
  const geschwister = zeilen.filter((z) => z.eltern === eltern && z.titel === o.titel);
  const vorn = eltern ? zeilen.find((z) => z.id === eltern)!.oz : '';
  const nummer = (z: LvZeile) => Number(teile(z.oz).pop() ?? 0) || 0;
  const k = o.titel ? m.titel[Math.min(eltern ? zeilen.find((z) => z.id === eltern)!.ebene + 1 : 0, m.titel.length - 1)] ?? 2 : m.position;
  const davor = nach && nach.eltern === eltern && nach.titel === o.titel ? nummer(nach) : nach && nach.titel && !o.titel ? 0 : Math.max(0, ...geschwister.map(nummer));
  const dahinter = geschwister.map(nummer).filter((n) => n > davor).sort((a, b) => a - b)[0];
  const schritt = o.titel ? 1 : m.schritt;
  let n = dahinter !== undefined && dahinter - davor > 1 ? Math.floor((davor + dahinter) / 2) : davor + schritt;
  if (!o.titel && dahinter === undefined) n = Math.ceil((davor + 1) / schritt) * schritt;
  while (geschwister.some((z) => nummer(z) === n)) n++;
  return (vorn ? `${vorn}.` : '') + stellen(n, k);
}

/** Summe eines Titels: alle Positionen darunter, die zählen (Menge × EP). */
export function titelSumme(zeilen: LvZeile[], titel: string, gpVon: (id: string) => number | null): number {
  const t = zeilen.find((z) => z.id === titel); if (!t) return 0;
  return Math.round(zeilen.filter((z) => !z.titel && z.oz.startsWith(`${t.oz}.`)).reduce((s, z) => s + (gpVon(z.id) ?? 0), 0) * 100) / 100;
}

/** Zeilen an eine andere Stelle (wie im bisherigen Bauportal an der OZ gezogen): die gewählten – ein Titel mit allem darunter –
 *  hinter „nach“ (null: an den Anfang). Bewegt werden nur ihre OZ; die übrigen Zeilen behalten ihre. → Kennung → neue OZ. */
export function verschieben(zeilen: LvZeile[], ids: string[], nach: string | null, m: OzMaske = MASKE_VORGABE): Map<string, string> {
  const gewaehlt = new Set(ids), unter = (z: LvZeile, t: LvZeile) => z.oz.startsWith(`${t.oz}.`);
  const wurzeln = zeilen.filter((z) => gewaehlt.has(z.id) && !zeilen.some((t) => t.titel && gewaehlt.has(t.id) && unter(z, t)));
  if (!wurzeln.length || wurzeln.some((w) => w.id === nach || (nach && w.titel && unter(zeilen.find((z) => z.id === nach)!, w)))) return new Map();
  const mit = new Set(wurzeln.flatMap((w) => [w.id, ...(w.titel ? zeilen.filter((z) => unter(z, w)).map((z) => z.id) : [])]));
  // der Stand ohne die bewegten Zeilen; jede Wurzel kommt hinter die vorige
  let rest = zeilen.filter((z) => !mit.has(z.id));
  const neu = new Map<string, string>(), art = (z: LvZeile) => (z.titel ? 'titel' : 'normal');
  let anker = nach;
  for (const w of wurzeln) {
    const oz = anker ? neueOz(rest, { nach: anker, titel: w.titel }, m) : (w.titel ? '00' : '0000');
    neu.set(w.id, oz);
    const dazu = [w, ...(w.titel ? zeilen.filter((z) => unter(z, w)) : [])].map((z) => ({ id: z.id, werte: { oz: z.id === w.id ? oz : oz + z.oz.slice(w.oz.length), art: art(z) } }));
    for (const d of dazu) if (d.id !== w.id) neu.set(d.id, String(d.werte.oz));
    rest = lvZeilen([...rest.map((z) => ({ id: z.id, werte: { oz: z.oz, art: art(z) } })), ...dazu]);
    anker = w.id;
  }
  for (const z of zeilen) if (neu.get(z.id) === z.oz) neu.delete(z.id);
  return neu;
}

/** OZ-Maske aus dem Feld des LV („2.2.2.2:4:10“) – unlesbar oder leer: die Vorgabe. */
export function maskeLesen(t: unknown): OzMaske {
  const m = /^(\d(?:\.\d){0,3}):(\d):(\d{1,3})$/.exec(String(t ?? '').trim());
  if (!m) return MASKE_VORGABE;
  const titel = m[1]!.split('.').map(Number), position = Number(m[2]), schritt = Number(m[3]);
  return titel.every((x) => x >= 1 && x <= 4) && position >= 1 && position <= 6 && schritt >= 1 ? { titel, position, schritt } : MASKE_VORGABE;
}
export const maskeSchreiben = (m: OzMaske) => `${m.titel.join('.')}:${m.position}:${m.schritt}`;

/** Teilbaum einer Zeile: sie selbst und alles, was (in der Reihenfolge) unter ihr hängt. */
function teilbaum(zeilen: LvZeile[], i: number): number {
  const z = zeilen[i]!, unter = new Set([z.id]);
  let e = i + 1;
  while (e < zeilen.length && zeilen[e]!.eltern && unter.has(zeilen[e]!.eltern!)) { unter.add(zeilen[e]!.id); e++; }
  return e;   // erste Zeile danach
}

/** Neuer Gliederungspunkt (wie im bisherigen Bauportal) – immer eine Ebene unter der markierten Zeile:
 *  · Positionen gewählt (oder eine markiert): genau sie kommen hinein; er steht hinter den übrigen Positionen ihres Titels.
 *  · ein Titel markiert: als letzter Punkt darin; hat er nur Positionen, kommen sie mit hinein (Titel und Positionen nie gemischt, GAEB).
 *  · nichts markiert: oberste Ebene, am Ende.
 *  → die neue Reihenfolge (zum Nummerieren) oder ein Fehlertext. */
export function gliederungEinfuegen(zeilen: LvZeile[], id: string, markiert: string | null, gewaehlt: string[], tiefe = MASKE_VORGABE.titel.length): LvZeile[] | string {
  const I = zeilen.map((z) => ({ ...z }));
  const nach = (ids: Set<string>, eltern: string) => { for (const z of I) if (ids.has(z.id)) z.eltern = eltern; };
  const ebeneVon = (eltern: string | null) => (eltern ? I.find((z) => z.id === eltern)!.ebene + 1 : 0);
  const zuTief = 'GAEB erlaubt höchstens 4 Gliederungsebenen – hier geht keine weitere.';
  const g = new Set(gewaehlt.length > 1 ? gewaehlt : markiert ? [markiert] : []);
  const pos = I.filter((z) => g.has(z.id) && !z.titel);
  if (pos.length) {
    const n0 = I.indexOf(pos[0]!), eltern = pos[0]!.eltern, ebene = ebeneVon(eltern);
    if (ebene >= tiefe) return zuTief;
    let e = n0; while (e < I.length && !I[e]!.titel) e++;
    const nachE = I[e] ?? null, rest = I.filter((z) => !g.has(z.id)), st = nachE ? rest.indexOf(nachE) : rest.length;
    rest.splice(st, 0, { id, ebene, titel: true, oz: '', eltern }, ...pos.map((p) => ({ ...p, eltern: id, ebene: ebene + 1 })));
    return rest;
  }
  const n = markiert ? I.findIndex((z) => z.id === markiert) : -1, akt = n >= 0 ? I[n]! : null;
  if (!akt) { I.push({ id, ebene: 0, titel: true, oz: '', eltern: null }); return I; }
  if (!akt.titel) return 'Bitte eine Position oder einen Titel markieren.';
  const eltern = akt.id, ebene = ebeneVon(eltern);
  if (ebene >= tiefe) return zuTief;
  const neu: LvZeile = { id, ebene, titel: true, oz: '', eltern };
  const e = teilbaum(I, n), drin = I.slice(n + 1, e);
  if (drin.some((z) => z.titel)) { I.splice(e, 0, neu); return I; }
  nach(new Set(drin.map((z) => z.id)), id); for (const z of drin) z.ebene = ebene + 1;
  I.splice(n + 1, 0, neu); return I;
}

/** GAEB-Prüfhinweis (wie bisher): alle Positionen auf derselben Gliederungstiefe, höchstens 4 Titelebenen, keine übersprungene
 *  Ebene in der OZ. Leer: das LV lässt sich so als GAEB ausgeben. Hinweistexte zählen nicht. */
export function gaebPruefung(zeilen: LvZeile[], hinweis: (id: string) => boolean = () => false): string[] {
  const aus: string[] = [], pos = zeilen.filter((z) => !z.titel && !hinweis(z.id));
  if (pos.length) {
    const n = new Map<number, number>(); for (const z of pos) n.set(z.ebene, (n.get(z.ebene) ?? 0) + 1);
    const ueblich = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    const anders = pos.filter((z) => z.ebene !== ueblich);
    if (anders.length) aus.push(`${anders.length} ${anders.length === 1 ? 'Position steht' : 'Positionen stehen'} auf einer anderen Gliederungstiefe als die übrigen (${anders.slice(0, 3).map((z) => z.oz || 'ohne OZ').join(', ')}${anders.length > 3 ? ' …' : ''}) – GAEB verlangt für alle Positionen dieselbe Tiefe.`);
  }
  if (zeilen.some((z) => z.titel && z.ebene >= 4)) aus.push('Mehr als 4 Gliederungsebenen – GAEB erlaubt höchstens 4.');
  const sprung = zeilen.filter((z) => z.oz && teile(z.oz).length - 1 > z.ebene);
  if (sprung.length) aus.push(`Übersprungene Gliederungsebene bei ${sprung.slice(0, 3).map((z) => z.oz).join(', ')}${sprung.length > 3 ? ' …' : ''} – fehlt ein Titel? „Nummerieren“ ordnet die OZ neu.`);
  return aus;
}
