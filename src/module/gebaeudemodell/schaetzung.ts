// Assistent-Logik: aus wenigen Antworten zum Gebäude (Art, Größe, Bauweise) ein erstes, grobes Gebäudemodell schätzen –
// Geschosse und die großen Bauteile mit Mengen. Alles daraus trägt die Marke „geschätzt“ und wird ersetzt,
// sobald ein Plan (IFC) eingelesen ist. Reine Rechnung ohne Datenbank: läuft auf dem Server und in den Tests.
import type { Werte } from '../../kern/modell';
import { gebaeude } from './beipackzettel';

export interface Schaetzung {
  geschosse: { schluessel: string; name: string; ebene: number; hoehe: number; flaeche: number }[];
  bauteile: { schluessel: string; art: string; name: string; geschoss: string | null; lage: string; menge: number; einheit: string; aufbau: string }[];
  bgf: number;
  annahmen: string[];   // was angenommen wurde, weil die Antwort fehlte – steht in der Vorschau
}

// Kennwerte je Gebäudeart: Anteil der Wohn-/Nutzfläche an der Brutto-Grundfläche, Fensteranteil der Fassade,
// Innenwandfläche je m² Geschossfläche, übliche Raumhöhe. Richtwerte für den Anfang – der Plan ersetzt sie.
const ART: Record<string, { nutz: number; fenster: number; innenwand: number; hoehe: number }> = {
  efh: { nutz: 0.75, fenster: 0.2, innenwand: 0.9, hoehe: 2.5 }, mfh: { nutz: 0.72, fenster: 0.22, innenwand: 1.0, hoehe: 2.5 },
  wohnung: { nutz: 0.85, fenster: 0.22, innenwand: 0.9, hoehe: 2.5 }, wohn_geschaeft: { nutz: 0.72, fenster: 0.28, innenwand: 0.8, hoehe: 2.75 },
  buero: { nutz: 0.7, fenster: 0.35, innenwand: 0.6, hoehe: 2.9 }, bildung: { nutz: 0.65, fenster: 0.3, innenwand: 0.55, hoehe: 3.1 },
  gesundheit: { nutz: 0.62, fenster: 0.25, innenwand: 0.9, hoehe: 2.9 }, gewerbe: { nutz: 0.9, fenster: 0.1, innenwand: 0.1, hoehe: 6 },
  handel: { nutz: 0.75, fenster: 0.3, innenwand: 0.4, hoehe: 3.2 }, garage: { nutz: 0.92, fenster: 0.02, innenwand: 0.05, hoehe: 2.4 },
  landwirtschaft: { nutz: 0.92, fenster: 0.05, innenwand: 0.05, hoehe: 4.5 }, sonder: { nutz: 0.7, fenster: 0.25, innenwand: 0.6, hoehe: 3 },
};
const NEIGUNG: Record<string, number> = { sattel: 35, walm: 30, pult: 12 };
const DECKE = 0.35;        // Deckenaufbau zwischen Raumhöhe und Geschosshöhe in m
const SEITEN = 1.5;        // angenommenes Seitenverhältnis des Grundrisses (Länge : Breite)
const DG_ANTEIL = 0.7;     // nutzbarer Anteil eines ausgebauten Dachgeschosses

const titel = (feld: string, wert: unknown) => gebaeude.felder.find((f) => f.name === feld)?.optionen?.find((o) => o.wert === wert && o.wert !== '')?.titel ?? '';
const rund = (x: number) => Math.round(x * 10) / 10;
const zahl = (w: unknown) => (typeof w === 'number' && w > 0 ? w : null);

export function schaetzen(a: Werte): Schaetzung | { fehlt: string } {
  const annahmen: string[] = [];
  const art = String(a.nutzung ?? '');
  const k = ART[art] ?? ART.sonder!;
  if (!ART[art]) annahmen.push('Gebäudeart offen – gerechnet mit mittleren Kennwerten');
  const wohnung = art === 'wohnung';
  const n = wohnung ? 1 : Math.max(1, Math.round(zahl(a.geschosszahl) ?? 0));
  if (!wohnung && !zahl(a.geschosszahl)) annahmen.push('Geschosszahl offen – gerechnet mit einem Geschoss');
  const keller = !wohnung && ['wu', 'gemauert', 'fertig'].includes(String(a.keller));
  const flach = a.dachform === 'flach' || a.dach_oben === 'nichts';
  const dg = !wohnung && !flach && a.dach_oben === 'ausgebaut';
  const ebenen = n + (keller ? 1 : 0) + (dg ? DG_ANTEIL : 0);
  let bgf = zahl(a.bgf);
  if (!bgf) {
    const nutz = zahl(a.wohnflaeche);
    if (!nutz) return { fehlt: 'Für die Schätzung braucht es die Wohn-/Nutzfläche oder die Brutto-Grundfläche.' };
    // Die Wohn-/Nutzfläche liegt in den Geschossen und im ausgebauten Dach, der Keller kommt dazu
    const oben = nutz / k.nutz;
    bgf = rund(oben * ebenen / (n + (dg ? DG_ANTEIL : 0)));
    annahmen.push(`Brutto-Grundfläche aus der Wohn-/Nutzfläche geschätzt (${Math.round(k.nutz * 100)} % davon nutzbar)`);
  }
  const gr = bgf / ebenen;                          // Grundfläche eines Geschosses
  const breite = Math.sqrt(gr / SEITEN), umfang = 2 * (breite + breite * SEITEN);
  const raumhoehe = zahl(a.raumhoehe) ?? k.hoehe;
  if (!zahl(a.raumhoehe)) annahmen.push(`Raumhöhe offen – gerechnet mit ${String(raumhoehe).replace('.', ',')} m`);
  const hoehe = rund(raumhoehe + DECKE);
  annahmen.push(`Grundriss als Rechteck ${String(rund(breite * SEITEN)).replace('.', ',')} × ${String(rund(breite)).replace('.', ',')} m angenommen`);

  const geschosse: Schaetzung['geschosse'] = [];
  const name = (e: number) => (e < 0 ? 'Keller' : e === 0 ? (wohnung ? 'Wohnung' : 'Erdgeschoss') : e === n && dg ? 'Dachgeschoss' : `${e}. Obergeschoss`);
  for (let e = keller ? -1 : 0; e < n + (dg ? 1 : 0); e++) {
    geschosse.push({ schluessel: `geschoss:${e}`, name: name(e), ebene: e, hoehe: e < 0 ? rund(2.3 + DECKE) : hoehe, flaeche: rund(e === n && dg ? gr * DG_ANTEIL : gr) });
  }

  const wand = [titel('tragwerk', a.tragwerk), titel('fassade', a.fassade === 'keine' ? '' : a.fassade)].filter(Boolean).join(', ');
  const bauteile: Schaetzung['bauteile'] = [];
  const dazu = (g: Schaetzung['geschosse'][number] | null, art_: string, n_: string, lage: string, menge: number, einheit: string, aufbau: string) => {
    if (menge > 0) bauteile.push({ schluessel: `${art_}:${g ? g.ebene : 'x'}`, art: art_, name: g ? `${n_} ${g.name}` : n_, geschoss: g?.schluessel ?? null, lage, menge: rund(menge), einheit, aufbau });
  };
  const oberstes = geschosse[geschosse.length - 1]!;
  for (const g of geschosse) {
    const fassade = umfang * g.hoehe * (wohnung ? 0.5 : g.ebene === n && dg ? 0.4 : 1);   // Wohnung: etwa die halbe Hülle; Dachgeschoss: nur Giebel und Drempel
    if (g.ebene < 0) {
      dazu(g, 'aussenwand', 'Kellerwand', 'aussen', umfang * g.hoehe, 'm2', titel('keller', a.keller));
    } else {
      dazu(g, 'aussenwand', 'Außenwand', 'aussen', fassade * (1 - k.fenster), 'm2', wand);
      dazu(g, 'fenster', 'Fenster', 'aussen', fassade * k.fenster, 'm2', titel('fenster', a.fenster));
    }
    dazu(g, 'innenwand', 'Innenwände', 'innen', g.flaeche * k.innenwand * (g.ebene < 0 ? 0.4 : 1), 'm2', titel('innenausbau', a.innenausbau));
    // Über dem obersten Geschoss liegt nur beim kalten Dach noch eine Decke – sonst ist das Dach der Abschluss
    if (!wohnung && (g !== oberstes || (!flach && !dg))) dazu(g, 'decke', 'Decke über', 'innen', gr, 'm2', '');
  }
  if (!wohnung) {
    const dach = [titel('dachform', a.dachform), titel('dachdeckung', a.dachdeckung)].filter(Boolean).join(', ');
    const grad = NEIGUNG[String(a.dachform)] ?? (flach ? 0 : 35);
    if (!flach && !NEIGUNG[String(a.dachform)]) annahmen.push('Dachform offen – gerechnet als Satteldach mit 35°');
    dazu(null, 'dach', 'Dach', 'aussen', flach ? gr * 1.05 : (gr * 1.1) / Math.cos((grad * Math.PI) / 180), 'm2', dach);   // 5 % Attika bzw. 10 % Dachüberstand
    dazu(geschosse[0]!, 'bodenplatte', 'Bodenplatte', 'aussen', gr, 'm2', keller ? titel('keller', a.keller) : '');
    if (!keller) dazu(geschosse[0]!, 'fundament', 'Streifenfundamente', 'aussen', umfang * 0.5 * 0.8, 'm3', '');   // 50 cm breit, 80 cm tief (frostfrei)
  }
  return { geschosse, bauteile, bgf: rund(bgf), annahmen };
}
