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

/** Die Zeile und alles darunter (in LV-Reihenfolge). */
export function mitUnterzeilen(zeilen: LvZeile[], id: string): LvZeile[] {
  const i = zeilen.findIndex((z) => z.id === id); if (i < 0) return [];
  const e = zeilen[i]!.ebene; let j = i + 1;
  while (j < zeilen.length && zeilen[j]!.ebene > e) j++;
  return zeilen.slice(i, j);
}

/** Gliederungspunkt eine Ebene höher (−1, mit seinen Untertiteln: hinter seinen bisherigen Oberpunkt) oder tiefer (+1: unter den
 *  Gliederungspunkt davor auf derselben Ebene). GAEB: höchstens 4 Titelebenen. null: geht nicht. Die OZ vergibt danach nummerieren(). */
export function ebeneAendern(zeilen: LvZeile[], id: string, richtung: -1 | 1): LvZeile[] | null {
  const t = zeilen.find((z) => z.id === id);
  if (!t?.titel) return null;
  const block = mitUnterzeilen(zeilen, id), ids = new Set(block.map((z) => z.id));
  const tiefe = Math.max(...block.filter((z) => z.titel).map((z) => z.ebene)) - t.ebene;
  if (richtung === 1) {
    const vor = [...zeilen.slice(0, zeilen.indexOf(t))].reverse().find((z) => z.ebene <= t.ebene);
    if (!vor || !vor.titel || vor.ebene !== t.ebene || t.ebene + 1 + tiefe > 3) return null;
    return zeilen.map((z) => (!ids.has(z.id) ? z : { ...z, ebene: z.ebene + 1, eltern: z.id === id ? vor.id : z.eltern }));
  }
  if (!t.eltern) return null;
  const oben = zeilen.find((z) => z.id === t.eltern)!;
  const ohne = zeilen.filter((z) => !ids.has(z.id));
  const ende = mitUnterzeilen(ohne, oben.id).at(-1)!;
  const neu = block.map((z) => ({ ...z, ebene: z.ebene - 1, eltern: z.id === id ? oben.eltern : z.eltern }));
  const k = ohne.indexOf(ende) + 1;
  return [...ohne.slice(0, k), ...neu, ...ohne.slice(k)];
}

/** Passt die Maske zum LV (wie bisher beim Nummerieren)? Titelstufen, Titel je Stufe und Positionen je Titel müssen in die Stellen passen. */
export function maskePruefen(zeilen: LvZeile[], m: OzMaske): string[] {
  const tiefe = Math.max(0, ...zeilen.filter((z) => z.titel).map((z) => z.ebene + 1));
  const titelJe = new Map<string | null, number>(), posJe = new Map<string | null, number>();
  for (const z of zeilen) (z.titel ? titelJe : posJe).set(z.eltern, ((z.titel ? titelJe : posJe).get(z.eltern) ?? 0) + 1);
  const maxT = Math.max(0, ...titelJe.values()), maxP = Math.max(0, ...posJe.values()), w: string[] = [];
  if (m.titel.length < tiefe) w.push(`Im LV gibt es ${tiefe} Titelstufen – bitte mindestens ${tiefe} wählen.`);
  const ts = Math.min(...m.titel);
  if (maxT >= 10 ** ts) w.push(`Auf einer Stufe stehen ${maxT} Titel – dafür reichen ${ts} Stelle${ts > 1 ? 'n' : ''} nicht (höchstens ${10 ** ts - 1}).`);
  if (maxP * m.schritt >= 10 ** m.position) w.push(`Ein Titel hat ${maxP} Positionen – mit Schrittweite ${m.schritt} reichen ${m.position} Stellen nicht (bis ${maxP * m.schritt}).`);
  return w;
}
/** Beispiel zur Maske: „01.02.0010 (Titel 01, Positionen 0010, 0020 …)“. */
export const maskeBeispiel = (m: OzMaske) => {
  const t = m.titel.map((s, i) => String(i + 1).padStart(s, '0')).join('.'), p = (k: number) => String(k * m.schritt).padStart(m.position, '0');
  return `${t}.${p(1)} (Titel ${'1'.padStart(m.titel[0] ?? 2, '0')}, Positionen ${p(1)}, ${p(2)} …)`;
};

/** Neue Position direkt unter „nach“ (wie bisher: unter der markierten Zeile; hinter einem Titel als erste darin). Ist zwischen den
 *  Nachbarn keine Nummer frei, rücken die Positionen danach auf (neu im Schritt der Maske) – sonst stünde die neue an falscher Stelle.
 *  → Kennung → OZ; die neue Zeile unter „neu“. */
export function positionEinfuegen(zeilen: LvZeile[], wo: { nach: string | null } | { amEnde: string | null }, m: OzMaske = MASKE_VORGABE, neu = '\u0000neu'): Map<string, string> {
  // „amEnde“: ans Ende dieser Gliederungsebene (Titel, null: oberste) – hinter ihre letzte eigene Position, sonst als erste darin
  const nach = 'nach' in wo ? wo.nach : ([...zeilen].reverse().find((z) => z.eltern === wo.amEnde && !z.titel)?.id ?? wo.amEnde);
  const oz = neueOz(zeilen, { nach, titel: false }, m), n = zeilen.find((z) => z.id === nach);
  const eltern = n ? (n.titel ? n.id : n.eltern) : null;
  const gruppe = zeilen.filter((z) => z.eltern === eltern && !z.titel);
  const stelle = n && !n.titel ? gruppe.findIndex((z) => z.id === n.id) + 1 : n ? 0 : gruppe.length;
  const nummer = (o: string) => Number(teile(o).pop() ?? 0) || 0;
  const vor = gruppe[stelle - 1], hinter = gruppe[stelle];
  if ((!vor || nummer(vor.oz) < nummer(oz)) && (!hinter || nummer(oz) < nummer(hinter.oz))) return new Map([[neu, oz]]);
  // kein Platz: die Gruppe in der neuen Reihenfolge im Schritt der Maske
  const vorn = eltern ? zeilen.find((z) => z.id === eltern)!.oz : '', reihe = [...gruppe.slice(0, stelle).map((z) => z.id), neu, ...gruppe.slice(stelle).map((z) => z.id)];
  const aus = new Map<string, string>();
  reihe.forEach((id, k) => { const o = (vorn ? `${vorn}.` : '') + stellen((k + 1) * m.schritt, m.position); if (id === neu || zeilen.find((z) => z.id === id)!.oz !== o) aus.set(id, o); });
  return aus;
}
