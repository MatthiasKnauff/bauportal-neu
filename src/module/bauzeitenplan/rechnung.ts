// Terminrechnung des Bauzeitenplans – rein und ohne Oberfläche, im Browser wie auf dem Server gleich.
// Alles in Arbeitstagen: Ein Vorgang beginnt am Arbeitstag s und endet vor f (f = s + Dauer, Meilenstein: f = s).
// Jede Verknüpfung wird zu einer Bedingung „Nachfolger.s ≥ Vorgänger.s + C“ – damit sind Vorwärtsrechnung (frühester
// Anfang), Rückwärtsrechnung (spätester Anfang, Puffer, kritischer Weg) und unterbrochene Vorgänge ein und dasselbe.
import type { Kalender } from './kalender';

export type Art = 'ea' | 'aa' | 'ee' | 'ae';   // Ende–Anfang, Anfang–Anfang, Ende–Ende, Anfang–Ende
export const ARTEN: { wert: Art; titel: string }[] = [
  { wert: 'ea', titel: 'Ende → Anfang (EA)' }, { wert: 'aa', titel: 'Anfang → Anfang (AA)' }, { wert: 'ee', titel: 'Ende → Ende (EE)' }, { wert: 'ae', titel: 'Anfang → Ende (AE)' },
];
export interface Abschnitt { dauer: number; pause: number }   // pause: Arbeitstage vor diesem Abschnitt (beim ersten 0)
export interface Eingang { id: string; ebene: number; dauer: number; abschnitte?: Abschnitt[] | null; anfangNichtVor?: string | null; ueberzug?: number }
export interface Verbindung { id: string; von: string; nach: string; art: Art; abstand: number; vonAbschnitt?: number | null; nachAbschnitt?: number | null }
export interface Termin {
  s: number; f: number;               // Arbeitstage
  anfang: string; ende: string;       // Datum (ISO), Ende = letzter Arbeitstag
  gruppe: boolean; kritisch: boolean; puffer: number;
  abschnitte: { s: number; f: number }[];
  ueberzug: number;                   // so viele Arbeitstage später fertig als geplant (am Ende des letzten Abschnitts)
  nr: number; eltern: string | null;
}
export interface Ergebnis { termine: Map<string, Termin>; ende: number; endeDatum: string; zyklen: string[] }

/** Abschnitte aus der Schreibweise „3+(2)+4“: Zahlen arbeiten, Klammern sind Pausen. Leer oder nur ein Abschnitt: keine Unterbrechung. */
export function abschnitteLesen(text: string | null | undefined): Abschnitt[] | null {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t) return null;
  const l: Abschnitt[] = []; let pause = 0;
  for (const teil of t.split('+')) {
    const m = /^\((\d+)\)$/.exec(teil), n = /^(\d+)$/.exec(teil);
    if (m) pause += Number(m[1]);
    else if (n && Number(n[1]) > 0) { l.push({ dauer: Number(n[1]), pause: l.length ? pause : 0 }); pause = 0; }
    else return null;
  }
  return l.length > 1 ? l : null;
}
export const abschnitteSchreiben = (a: Abschnitt[]): string => a.map((x, i) => (i && x.pause ? `(${x.pause})+` : '') + x.dauer).join('+');

const versatz = (a: Abschnitt[] | null, dauer: number) => {
  // Anfang und Ende jedes Abschnitts relativ zum Anfang des Vorgangs; ohne Abschnitte ist es einer über die ganze Dauer
  if (!a) return [{ a: 0, e: dauer }];
  let x = 0;
  return a.map((s) => { x += s.pause; const r = { a: x, e: x + s.dauer }; x += s.dauer; return r; });
};

export function rechnen(vorgaenge: Eingang[], verbindungen: Verbindung[], k: Kalender): Ergebnis {
  const n = vorgaenge.length;
  const eltern: (number | null)[] = [], blaetter: number[][] = vorgaenge.map(() => []);
  const stapel: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = Math.max(0, Math.round(vorgaenge[i]!.ebene || 0));
    while (stapel.length && Math.max(0, Math.round(vorgaenge[stapel[stapel.length - 1]!]!.ebene || 0)) >= e) stapel.pop();
    eltern.push(stapel.length ? stapel[stapel.length - 1]! : null);
    stapel.push(i);
  }
  const gruppe = vorgaenge.map((_, i) => i + 1 < n && eltern[i + 1] === i);
  for (let i = 0; i < n; i++) if (!gruppe[i]) for (let p: number | null = eltern[i] ?? null; p !== null; p = eltern[p] ?? null) blaetter[p]!.push(i);
  for (let i = 0; i < n; i++) if (!gruppe[i]) blaetter[i]!.push(i);
  const pos = new Map(vorgaenge.map((v, i) => [v.id, i]));
  const vorfahr = (a: number, b: number) => { for (let p = eltern[b] ?? null; p !== null; p = eltern[p] ?? null) if (p === a) return true; return false; };
  const abschn = vorgaenge.map((v, i) => (gruppe[i] ? null : v.abschnitte && v.abschnitte.length > 1 ? v.abschnitte : null));
  const dauer = vorgaenge.map((v, i) => (abschn[i] ? abschn[i]!.reduce((s, x) => s + x.dauer, 0) : Math.max(0, Math.round(Number(v.dauer) || 0))));
  const vs = vorgaenge.map((_, i) => versatz(abschn[i]!, dauer[i]!));
  // später fertig als geplant: verlängert den letzten Abschnitt, Nachfolger rücken mit (nicht bei Gruppen und Meilensteinen)
  const ue = vorgaenge.map((v, i) => (gruppe[i] || !dauer[i] ? 0 : Math.max(0, Math.round(Number(v.ueberzug) || 0))));
  vs.forEach((x, i) => { if (ue[i]) x[x.length - 1]!.e += ue[i]!; });
  const spanne = vs.map((x) => x[x.length - 1]!.e);

  // Bedingungen zwischen Blättern: nach.s ≥ von.s + c
  type Kante = { von: number; nach: number; c: number; id: string };
  const kanten: Kante[] = [];
  for (const v of verbindungen) {
    const a = pos.get(v.von), b = pos.get(v.nach);
    if (a === undefined || b === undefined || a === b) continue;
    if (blaetter[a]!.includes(b) || blaetter[b]!.includes(a) || vorfahr(a, b) || vorfahr(b, a)) continue;   // Gruppe und ihr eigener Teil: sagt nichts
    const vonEnde = v.art === 'ea' || v.art === 'ee', nachEnde = v.art === 'ee' || v.art === 'ae';
    for (const x of blaetter[a]!) for (const y of blaetter[b]!) {
      if (x === y) continue;
      const ax = (v.vonAbschnitt != null ? vs[x]![v.vonAbschnitt] : undefined) ?? { a: 0, e: spanne[x]! };
      const by = (v.nachAbschnitt != null ? vs[y]![v.nachAbschnitt] : undefined) ?? { a: 0, e: spanne[y]! };
      kanten.push({ von: x, nach: y, c: (vonEnde ? ax.e : ax.a) + (Number(v.abstand) || 0) - (nachEnde ? by.e : by.a), id: v.id });
    }
  }
  // Zirkelbezüge: Kanten, die einen Kreis schließen, gelten nicht (und werden gemeldet)
  const aus: Kante[][] = vorgaenge.map(() => []);
  for (const e of kanten) aus[e.von]!.push(e);
  const farbe = new Uint8Array(n), zyklen = new Set<string>(), reihenfolge: number[] = [];
  const besuche = (start: number) => {
    const st: [number, number][] = [[start, 0]]; farbe[start] = 1;
    while (st.length) {
      const oben = st[st.length - 1]!; const [u, i] = oben;
      if (i < aus[u]!.length) {
        oben[1]++;
        const e = aus[u]![i]!;
        if (farbe[e.nach] === 1) { zyklen.add(e.id); (e as Kante & { aus?: boolean }).aus = true; }
        else if (farbe[e.nach] === 0) { farbe[e.nach] = 1; st.push([e.nach, 0]); }
      } else { farbe[u] = 2; reihenfolge.push(u); st.pop(); }
    }
  };
  for (let i = 0; i < n; i++) if (!gruppe[i] && farbe[i] === 0) besuche(i);
  reihenfolge.reverse();
  const gilt = kanten.filter((e) => !(e as Kante & { aus?: boolean }).aus);
  const ein: Kante[][] = vorgaenge.map(() => []);
  for (const e of gilt) ein[e.nach]!.push(e);

  // vorwärts
  const s = new Array<number>(n).fill(0);
  for (const i of reihenfolge) {
    const v = vorgaenge[i]!;
    let x = v.anfangNichtVor && /^\d{4}-\d{2}-\d{2}/.test(v.anfangNichtVor) ? k.arbeitstag(tagAus_(v.anfangNichtVor)) : 0;   // ein fester Anfang gilt auch vor dem Projektanfang
    for (const e of ein[i]!) x = Math.max(x, s[e.von]! + e.c);
    s[i] = x;
  }
  let ende = 0;
  for (let i = 0; i < n; i++) if (!gruppe[i]) ende = Math.max(ende, s[i]! + spanne[i]!);
  // rückwärts
  const ls = vorgaenge.map((_, i) => ende - spanne[i]!);
  for (const i of [...reihenfolge].reverse()) for (const e of aus[i]!) if (!(e as Kante & { aus?: boolean }).aus) ls[i] = Math.min(ls[i]!, ls[e.nach]! - e.c);

  const termine = new Map<string, Termin>();
  const sG = new Array<number>(n), fG = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    if (gruppe[i]) { const b = blaetter[i]!; sG[i] = b.length ? Math.min(...b.map((x) => s[x]!)) : 0; fG[i] = b.length ? Math.max(...b.map((x) => s[x]! + spanne[x]!)) : 0; }
    else { sG[i] = s[i]!; fG[i] = s[i]! + spanne[i]!; }
  }
  vorgaenge.forEach((v, i) => {
    const puffer = gruppe[i] ? 0 : ls[i]! - s[i]!;
    termine.set(v.id, {
      s: sG[i]!, f: fG[i]!, anfang: k.anfangsdatum(sG[i]!), ende: k.endedatum(sG[i]!, fG[i]!),
      gruppe: gruppe[i]!, kritisch: !gruppe[i] && puffer <= 0, puffer,
      abschnitte: gruppe[i] ? [{ s: sG[i]!, f: fG[i]! }] : vs[i]!.map((x) => ({ s: s[i]! + x.a, f: s[i]! + x.e })), ueberzug: ue[i]!,
      nr: i + 1, eltern: eltern[i] === null ? null : vorgaenge[eltern[i]!]!.id,
    });
  });
  return { termine, ende, endeDatum: k.endedatum(0, ende), zyklen: [...zyklen] };
}
const tagAus_ = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
