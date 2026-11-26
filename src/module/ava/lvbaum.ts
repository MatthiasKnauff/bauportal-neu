// Das LV als Baum (wie im bisherigen Bauportal): Titel bis zur 4. Ebene, darunter Positionen. Die Ebene ergibt sich aus der
// Ordnungszahl – ein Titel „01.02“ steht auf Ebene 2, seine Positionen „01.02.0010“ darunter. Nummerieren nach einer OZ-Maske wie
// in GAEB: je Titelebene feste Stellen, Positionen in Zehnerschritten. Reine Rechnung, ohne Oberfläche.

import { nachOz } from './rechnung';

type E = Parameters<typeof nachOz>[0][number];
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
