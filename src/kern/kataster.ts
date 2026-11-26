// Kataster zur Baustelle (wie im bisherigen Bauportal): Gemarkung, Flur, Flurstück aus ALKIS von Geobasis NRW – dieselben
// amtlichen Daten wie in TIM-online. Hier die reinen Rechenteile: Koordinaten nach UTM 32, Flurstücke aus der GML-Antwort,
// welches Flurstück zur Baustelle gehört (unter dem Punkt, dazu weitere mit derselben Hausnummer) und die Werte fürs Projekt.
import { xmlLesen, type XmlKnoten } from './xml';

/** Geographische Koordinaten (Grad, WGS84 ≈ ETRS89) → Rechtswert e und Hochwert n in Metern (UTM Zone 32, EPSG:25832). */
export function utm32(lat: number, lon: number): { e: number; n: number } {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = (9 * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180;
  const nu = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), t = Math.tan(phi) ** 2, c = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const m = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  return {
    e: k0 * nu * (A + ((1 - t + c) * A ** 3) / 6 + ((5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * A ** 5) / 120) + 500000,
    n: k0 * (m + nu * Math.tan(phi) * (A ** 2 / 2 + ((5 - t + 9 * c + 4 * c ** 2) * A ** 4) / 24 + ((61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * A ** 6) / 720)),
  };
}

export interface Flurstueck {
  gemarkung: string; flur: string; flurstueck: string; kennzeichen: string; flaeche: number | null; lage: string; gemeinde: string;
  amPunkt: boolean; abstand: number; gleicheAdresse?: boolean;
}

type Punkt = [number, number];
const drin = ([x, y]: Punkt, ring: Punkt[]) => {
  let ja = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]!, [x2, y2] = ring[j]!;
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1 || 1e-12) + x1) ja = !ja;
  }
  return ja;
};
/** Alle Ringe einer Geometrie (der erste ist der äußere), aus posList bzw. coordinates. */
function ringe(k: XmlKnoten): Punkt[][] {
  const aus: Punkt[][] = [];
  const geh = (x: XmlKnoten) => {
    if ((x.name === 'posList' || x.name === 'coordinates') && x.text.trim()) {
      const z = x.text.trim().split(/[\s,]+/).map(Number), dim = x.name === 'coordinates' ? 2 : Number(x.attr.srsDimension ?? x.attr.dimension ?? 2);
      const r: Punkt[] = [];
      for (let i = 0; i + 1 < z.length; i += dim) r.push([z[i]!, z[i + 1]!]);
      aus.push(r);
    }
    x.kinder.forEach(geh);
  };
  geh(k);
  return aus;
}

/** Flurstücke aus der Antwort des WFS „NW ALKIS Vereinfacht“ (GML) – mit der Angabe, ob der Punkt (e, n) darin liegt. */
export function flurstueckeLesen(gml: string, e: number, n: number): Flurstueck[] {
  const wurzel = xmlLesen(gml);
  const fehler = (k: XmlKnoten): boolean => k.name === 'ExceptionReport' || k.name === 'ServiceExceptionReport' || k.kinder.some(fehler);
  if (fehler(wurzel)) throw new Error('Der ALKIS-Dienst meldet einen Fehler');
  const aus: Flurstueck[] = [];
  const suche = (k: XmlKnoten) => {
    if (k.name !== 'Flurstueck') { k.kinder.forEach(suche); return; }
    const w: Record<string, string> = {};
    let r: Punkt[][] = [];
    for (const c of k.kinder) { if (c.kinder.length) r = r.concat(ringe(c)); else w[c.name] = c.text.trim(); }
    let amPunkt = !!r[0] && drin([e, n], r[0]);
    if (amPunkt && r.slice(1).some((loch) => drin([e, n], loch))) amPunkt = false;   // im Loch des Flurstücks
    const mitte = r[0]?.length ? r[0].reduce((s, [x, y]) => [s[0] + x / r[0]!.length, s[1] + y / r[0]!.length] as Punkt, [0, 0] as Punkt) : null;
    const zae = (w.flstnrzae ?? '').replace(/^0+/, ''), nen = (w.flstnrnen ?? '').replace(/^0+/, '');
    const flur = /(\d+)\s*$/.exec(w.flur ?? '')?.[1]?.replace(/^0+(?=\d)/, '') ?? (w.flur ?? '');
    const fl = Number(String(w.flaeche ?? '').replace(',', '.'));
    aus.push({ gemarkung: w.gemarkung ?? '', flur, flurstueck: nen ? `${zae}/${nen}` : zae, kennzeichen: w.flstkennz ?? '', flaeche: w.flaeche && Number.isFinite(fl) ? fl : null,
      lage: w.lagebeztxt ?? '', gemeinde: w.gemeinde ?? '', amPunkt, abstand: mitte ? Math.round(Math.hypot(mitte[0] - e, mitte[1] - n) * 10) / 10 : 9e9 });
  };
  suche(wurzel);
  return aus;
}

const norm = (t: string) => t.toLowerCase().replace(/ß/g, 'ss').replace(/strasse|str\./g, 'str').replace(/[^a-z0-9äöü]/g, '');
/** „Grillostraße 24 a“ → Straße „grillostr“, Nummer „24a“ */
const strNr = (t: string): [string, string] => { const m = /^(.*?)(\d+[a-z]?)$/.exec(norm(t)); return m ? [m[1]!, m[2]!] : [norm(t), '']; };

/** Das Flurstück unter dem Punkt und weitere mit derselben Lage (Straße und Hausnummer); liegt der Punkt dazwischen, das nächste. */
export function flurstueckeDerBaustelle(liste: Flurstueck[], strasse: string): Flurstueck[] {
  const [s, nr] = strNr(strasse);
  const treffer = liste.filter((f) => {
    f.gleicheAdresse = !!s && !!nr && f.lage.split(/[;,|]\s*|\s{2,}/).filter((x) => x.trim()).map(strNr).some(([ls, ln]) => ln === nr && (ls === s || ls.slice(0, 7) === s.slice(0, 7)));
    return f.amPunkt || f.gleicheAdresse;
  }).sort((a, b) => Number(b.amPunkt) - Number(a.amPunkt) || a.abstand - b.abstand);
  return treffer.length ? treffer : [...liste].sort((a, b) => a.abstand - b.abstand).slice(0, 1);
}

/** Die Werte fürs Projekt: Gemarkung, Flur(en), Flurstück(e), Fläche – nur die der ersten Gemarkung. */
export function katasterWerte(fs: Flurstueck[]): { gemarkung: string; flur: string; flurstueck: string; flaeche: number | null } | null {
  if (!fs.length) return null;
  const gem = fs[0]!.gemarkung, gleich = fs.filter((f) => f.gemarkung === gem), fluren = [...new Set(gleich.map((f) => f.flur))];
  return {
    gemarkung: gem, flur: fluren.join(', '),
    flurstueck: fluren.length === 1 ? gleich.map((f) => f.flurstueck).join(', ') : fluren.map((fl) => `Flur ${fl}: ${gleich.filter((f) => f.flur === fl).map((f) => f.flurstueck).join(', ')}`).join('; '),
    flaeche: gleich.every((f) => f.flaeche != null) ? Math.round(gleich.reduce((s, f) => s + f.flaeche!, 0) * 100) / 100 : null,
  };
}

/** In Nordrhein-Westfalen? (Die Abfrage nutzt die Dienste von Geobasis NRW.) */
export const inNrw = (lat: number, lon: number) => lat >= 50.2 && lat <= 52.6 && lon >= 5.8 && lon <= 9.5;
