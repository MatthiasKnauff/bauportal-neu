// Bearbeiten des Bauzeitenplans als reine Rechnung: Jede Handlung (einfügen, löschen, Vorgänger eintragen, gliedern,
// verschieben) liefert die Befehle, die das Bauportal dann als einen Schritt ausführt – Strg+Z nimmt alles zusammen zurück.
// „Automatisch verknüpfen“ wie gewohnt: Einfügen setzt den neuen Vorgang in die Kette, Löschen überbrückt sie.
import type { Wert } from '../../kern/modell';
import type { Art } from './rechnung';
import type { Vorgaenger } from './schreibweise';

export interface V { id: string; reihe: number; ebene: number; name?: string }
export interface L { id: string; von: string; nach: string; art: Art; abstand: number; vonAbschnitt?: number | null; nachAbschnitt?: number | null }   // Abschnitt: welcher Teil eines geteilten Vorgangs (null: der ganze)
export interface Vorlage { objekt: string; art: 'anlegen' | 'aendern' | 'loeschen'; objektId: string; werte?: Record<string, Wert> }
type Neu = () => string;

const linkNeu = (neu: Neu, z: Record<string, Wert>, von: string, nach: string, art: Art = 'ea', abstand = 0): Vorlage =>
  ({ objekt: 'verknuepfung', art: 'anlegen', objektId: neu(), werte: { ...z, von, nach, art, abstand, von_abschnitt: null, nach_abschnitt: null, kennung: '' } });
const linkWeg = (l: L): Vorlage => ({ objekt: 'verknuepfung', art: 'loeschen', objektId: l.id });

/** Der Vorgang i und alle unter ihm gegliederten (Index-Bereich [i, ende)). */
export function block(v: V[], i: number): number {
  let e = i + 1;
  while (e < v.length && v[e]!.ebene > v[i]!.ebene) e++;
  return e;
}
const istGruppe = (v: V[], i: number) => i + 1 < v.length && v[i + 1]!.ebene > v[i]!.ebene;

/** Neuer Vorgang vor Position i (i = Länge: am Ende). */
export function einfuegen(v: V[], l: L[], i: number, werte: Record<string, Wert>, z: Record<string, Wert>, neu: Neu, autom: boolean): { befehle: Vorlage[]; id: string } {
  const davor = v[i - 1], danach = v[i];
  const reihe = davor && danach ? (davor.reihe + danach.reihe) / 2 : davor ? davor.reihe + 1 : danach ? danach.reihe - 1 : 1;
  const ebene = danach ? danach.ebene : davor ? (istGruppe(v, i - 1) ? davor.ebene + 1 : davor.ebene) : 0;
  const id = neu();
  const b: Vorlage[] = [{ objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, dauer: 1, fortschritt: 0, ...werte, reihe, ebene } }];
  if (autom && davor && !istGruppe(v, i - 1)) {
    const kette = danach && l.find((x) => x.von === davor.id && x.nach === danach.id);
    if (kette) { b.push(linkWeg(kette), linkNeu(neu, z, davor.id, id), linkNeu(neu, z, id, danach.id, kette.art, kette.abstand)); }
    else b.push(linkNeu(neu, z, davor.id, id));
  }
  return { befehle: b, id };
}

/** Vorgänge löschen (Gruppen mit allem darunter); die Kette wird überbrückt, Zeitabstände bleiben. */
export function loeschen(v: V[], l: L[], ids: string[], z: Record<string, Wert>, neu: Neu, autom: boolean): Vorlage[] {
  const weg = new Set<string>();
  for (const id of ids) { const i = v.findIndex((x) => x.id === id); if (i >= 0) for (let k = i; k < block(v, i); k++) weg.add(v[k]!.id); }
  const b: Vorlage[] = [];
  if (autom) {
    const vorher = new Set(l.map((x) => `${x.von}>${x.nach}`));
    for (const ein of l.filter((x) => !weg.has(x.von) && weg.has(x.nach))) {
      // über alle gelöschten hinweg zu den Nachfolgern außerhalb
      const ziele: L[] = [], gesehen = new Set<string>(), offen = [ein.nach];
      while (offen.length) { const n = offen.pop()!; if (gesehen.has(n)) continue; gesehen.add(n); for (const x of l.filter((y) => y.von === n)) { if (weg.has(x.nach)) offen.push(x.nach); else ziele.push(x); } }
      for (const aus of ziele) {
        const k = `${ein.von}>${aus.nach}`;
        if (vorher.has(k) || ein.von === aus.nach) continue;
        vorher.add(k);
        b.push(linkNeu(neu, z, ein.von, aus.nach, ein.art, ein.abstand + aus.abstand));
      }
    }
  }
  for (const x of l) if (weg.has(x.von) || weg.has(x.nach)) b.push(linkWeg(x));
  for (const id of weg) b.push({ objekt: 'vorgang', art: 'loeschen', objektId: id });
  return b;
}

/** Vorgänger aus der Tabelle („3;4AA+2t“) für einen Vorgang setzen: nur was sich ändert, wird angelegt, geändert oder gelöscht. */
export function vorgaengerSetzen(v: V[], l: L[], nach: string, liste: Vorgaenger[], z: Record<string, Wert>, neu: Neu): Vorlage[] {
  const soll = new Map<string, Vorgaenger>();
  for (const x of liste) {
    const von = v[x.nr - 1];
    if (!von) throw new Error(`Zeile ${x.nr} gibt es nicht`);
    if (von.id === nach) throw new Error('Ein Vorgang kann nicht sein eigener Vorgänger sein');
    soll.set(von.id, x);
  }
  const b: Vorlage[] = [];
  const da = new Set<string>();   // mehrere Pfeile vom selben Vorgang (je Teil einer geteilten Leistung) bleiben alle
  for (const x of l.filter((y) => y.nach === nach)) {
    const s = soll.get(x.von);
    if (!s) b.push(linkWeg(x));
    else { if (s.art !== x.art || s.abstand !== x.abstand) b.push({ objekt: 'verknuepfung', art: 'aendern', objektId: x.id, werte: { art: s.art, abstand: s.abstand } }); da.add(x.von); }
  }
  for (const [von, s] of soll) if (!da.has(von)) b.push(linkNeu(neu, z, von, nach, s.art, s.abstand));
  return b;
}

/** Ein- oder ausrücken (Alt+Umschalt+→/←): der Vorgang samt allem darunter. Einrücken geht nur unter einen Vorgang darüber. */
export function gliedern(v: V[], l: L[], id: string, schritt: 1 | -1): Vorlage[] {
  const i = v.findIndex((x) => x.id === id);
  if (i < 0) return [];
  if (schritt > 0 && (i === 0 || v[i - 1]!.ebene < v[i]!.ebene)) return [];
  if (schritt < 0 && v[i]!.ebene === 0) return [];
  const b: Vorlage[] = [];
  // Wird die Zeile darüber zur Gruppe über dieser, ist eine Verknüpfung zwischen beiden sinnlos: Was der Gruppe
  // vorausgeht, gilt ohnehin für alles darin.
  if (schritt > 0 && v[i - 1]!.ebene === v[i]!.ebene) for (const x of l) if ((x.von === v[i - 1]!.id && x.nach === id) || (x.nach === v[i - 1]!.id && x.von === id)) b.push(linkWeg(x));
  for (let k = i; k < block(v, i); k++) b.push({ objekt: 'vorgang', art: 'aendern', objektId: v[k]!.id, werte: { ebene: v[k]!.ebene + schritt } });
  return b;
}

/** Nach oben/unten (Alt+Umschalt+↑/↓): tauscht den Vorgang samt allem darunter mit dem Nachbarn derselben Ebene. */
export function verschieben(v: V[], id: string, richtung: 1 | -1): Vorlage[] {
  const i = v.findIndex((x) => x.id === id);
  if (i < 0) return [];
  const e = block(v, i);
  let a: number, aEnde: number, bAnf: number, bEnde: number;
  if (richtung < 0) {
    let j = i - 1;
    while (j >= 0 && v[j]!.ebene > v[i]!.ebene) j--;
    if (j < 0 || v[j]!.ebene !== v[i]!.ebene) return [];
    a = j; aEnde = i; bAnf = i; bEnde = e;     // Nachbar [j,i) kommt hinter uns
  } else {
    if (e >= v.length || v[e]!.ebene !== v[i]!.ebene) return [];
    a = i; aEnde = e; bAnf = e; bEnde = block(v, e);
  }
  // neue Reihenfolge: zweiter Block vor dem ersten, die Reihe-Werte des Bereichs werden neu verteilt
  const bereich = [...v.slice(bAnf, bEnde), ...v.slice(a, aEnde)];
  const werte = v.slice(a, bEnde).map((x) => x.reihe);
  return bereich.flatMap((x, k) => (x.reihe === werte[k] ? [] : [{ objekt: 'vorgang', art: 'aendern' as const, objektId: x.id, werte: { reihe: werte[k]! } }]));
}

// ---------- Mehrere Leistungen auf einmal (Strg/Umschalt-Auswahl): verschieben, kopieren, einfügen ----------

/** Die obersten gewählten Zeilen mit allem darunter als Bereiche [anfang, ende) in Plan-Reihenfolge (Untergeordnete einer gewählten Gruppe zählen nicht extra). */
export function bloeckeVon(v: V[], ids: Iterable<string>): [number, number][] {
  const idx = [...new Set(ids)].map((id) => v.findIndex((x) => x.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
  const r: [number, number][] = [];
  for (const i of idx) if (!r.some(([a, e]) => i >= a && i < e)) r.push([i, block(v, i)]);
  return r;
}

/** Reihe-Werte für m Zeilen zwischen zwei Nachbarn (ohne Nachbarn: in ganzen Schritten davor oder dahinter). */
function reihenZwischen(lo: number | undefined, hi: number | undefined, m: number): number[] {
  return Array.from({ length: m }, (_, k) => (lo !== undefined && hi !== undefined ? lo + ((hi - lo) * (k + 1)) / (m + 1) : lo !== undefined ? lo + k + 1 : hi !== undefined ? hi - (m - k) : k + 1));
}

/** Ebene für Zeilen, die vor Position ziel (Index in liste) landen: wie die Zeile dort, am Ende wie die letzte (unter einer Gruppe: darin). */
function ebeneBei(liste: V[], ziel: number): number {
  const danach = liste[ziel], davor = liste[ziel - 1];
  return danach ? danach.ebene : davor ? (istGruppe(liste, ziel - 1) ? davor.ebene + 1 : davor.ebene) : 0;
}

/** Gewählte Leistungen (mit allem darunter) vor die Zeile ziel ziehen (ziel = Länge: ans Ende). Die Ebene richtet sich nach der Stelle. */
export function verschiebenNach(v: V[], ids: Iterable<string>, ziel: number): Vorlage[] {
  const R = bloeckeVon(v, ids);
  if (!R.length || R.some(([a, e]) => ziel > a && ziel < e)) return [];   // nicht in sich selbst
  const drin = new Set(R.flatMap(([a, e]) => v.slice(a, e).map((x) => x.id)));
  const rest = v.filter((x) => !drin.has(x.id)), z = v.slice(0, ziel).filter((x) => !drin.has(x.id)).length;
  const basis = ebeneBei(rest, z);
  const bewegt = R.flatMap(([a, e]) => v.slice(a, e).map((x) => ({ x, ebene: x.ebene - v[a]!.ebene + basis })));
  const reihen = reihenZwischen(rest[z - 1]?.reihe, rest[z]?.reihe, bewegt.length);
  return bewegt.flatMap(({ x, ebene }, k) => (x.reihe === reihen[k] && x.ebene === ebene ? [] : [{ objekt: 'vorgang', art: 'aendern' as const, objektId: x.id, werte: { reihe: reihen[k]!, ebene } }]));
}

/** Nach oben/unten mit Mehrfachauswahl: alle gewählten Blöcke zusammen vor den Nachbarn darüber bzw. hinter den darunter. */
export function verschiebenAlle(v: V[], ids: Iterable<string>, richtung: 1 | -1): Vorlage[] {
  const R = bloeckeVon(v, ids);
  if (!R.length) return [];
  if (richtung < 0) {
    const [a] = R[0]!; let j = a - 1;
    while (j >= 0 && v[j]!.ebene > v[a]!.ebene) j--;
    return j < 0 ? [] : verschiebenNach(v, ids, j);
  }
  const e = R[R.length - 1]![1];
  return e >= v.length ? [] : verschiebenNach(v, ids, block(v, e));
}

/** Zwischenablage: die gewählten Zeilen (Ebenen ab 0), ihre Werte und die Verknüpfungen zwischen ihnen (nach außen nicht). */
export interface Ablage { zeilen: { alt: string; ebene: number; werte: Record<string, Wert> }[]; links: Omit<L, 'id'>[] }
export function ablageAus(v: V[], l: L[], ids: Iterable<string>, werteVon: (id: string) => Record<string, Wert>): Ablage {
  const R = bloeckeVon(v, ids);
  const zeilen = R.flatMap(([a, e]) => v.slice(a, e).map((x) => ({ alt: x.id, ebene: x.ebene - v[a]!.ebene, werte: werteVon(x.id) })));
  const drin = new Set(zeilen.map((z) => z.alt));
  return { zeilen, links: l.filter((x) => drin.has(x.von) && drin.has(x.nach)).map(({ id: _, ...rest }) => rest) };
}

/** Zwischenablage vor Zeile ziel einfügen: neue Kennungen, Verknüpfungen innerhalb mitgenommen. → Befehle und die neuen Kennungen (alt → neu). */
export function ablageEinfuegen(v: V[], ziel: number, a: Ablage, z: Record<string, Wert>, neu: Neu, ebene?: number): { befehle: Vorlage[]; neu: Map<string, string> } {
  const basis = ebene ?? ebeneBei(v, ziel), reihen = reihenZwischen(v[ziel - 1]?.reihe, v[ziel]?.reihe, a.zeilen.length), karte = new Map<string, string>();
  const befehle: Vorlage[] = a.zeilen.map((x, k) => { const id = neu(); karte.set(x.alt, id); return { objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, ...x.werte, reihe: reihen[k]!, ebene: basis + x.ebene } }; });
  for (const x of a.links) befehle.push({ objekt: 'verknuepfung', art: 'anlegen', objektId: neu(), werte: { ...z, von: karte.get(x.von)!, nach: karte.get(x.nach)!, art: x.art, abstand: x.abstand, von_abschnitt: x.vonAbschnitt ?? null, nach_abschnitt: x.nachAbschnitt ?? null, kennung: '' } });
  return { befehle, neu: karte };
}

// ---------- Duplizieren mit Master (wie im bisherigen Bauportal): wiederholende Blöcke, z. B. Wohnung 1 → 2, 3 … ----------
// Die gewählten obersten Zeilen werden Master; jede Zeile einer Kopie kennt ihr Gegenstück im Master (kopie_von). Wer einen Master
// oder eine seiner Kopien noch einmal dupliziert, hängt die neuen hinten an die Kette (die Zahl im Namen läuft weiter).
// Verknüpfung der Kopie: „ende“ Ende des letzten → Anfang des ersten (Standard) · „eigen“ frei gewählte Paare · „takt“ jede
// Leistung wartet auf dieselbe der vorigen Kopie · „parallel“ ohne. Bei „ende“/„eigen“ hängen auch die übrigen Anfänge der Kopie
// mit ihrem Abstand dran – der Block bleibt in Form.

export type Duplizierart = 'ende' | 'eigen' | 'takt' | 'parallel';
export interface Paar { von: string; vonEnde: boolean; nach: string; nachEnde: boolean }   // Kennungen im Master (bzw. im Original)
export interface VM extends V { master?: boolean; kopieVon?: string | null }

/** Zahl im Namen hochzählen: die letzte Zahl um k erhöhen („Wohnung 1“ → „Wohnung 3“, „1. OG“ → „2. OG“); ohne Zahl „Name (k+1)“. */
export function nummer(name: string, k: number): string {
  const m = /(\d+)(?!.*\d)/.exec(name);
  return m ? name.slice(0, m.index) + (Number(m[1]) + k) + name.slice(m.index + m[1]!.length) : `${name} (${k + 1})`.trim();
}
const ART_AUS = (vonEnde: boolean, nachEnde: boolean): L['art'] => (vonEnde ? (nachEnde ? 'ee' : 'ea') : nachEnde ? 'ae' : 'aa');

/** Die Kopien eines Masters in Plan-Reihenfolge: je Kopie ihre oberste Zeile und Master-Kennung → Kennung in der Kopie. */
export function kopienVon(v: VM[], master: string): { top: string; glieder: Map<string, string>; ende: number }[] {
  const r: { top: string; glieder: Map<string, string>; ende: number }[] = [];
  v.forEach((x, i) => {
    if (x.kopieVon !== master) return;
    const e = block(v, i), g = new Map<string, string>();
    for (let k = i; k < e; k++) if (v[k]!.kopieVon) g.set(v[k]!.kopieVon!, v[k]!.id);
    r.push({ top: x.id, glieder: g, ende: e });
  });
  return r;
}

export function duplizieren(v: VM[], l: L[], ids: Iterable<string>, n: number, art: Duplizierart, schema: boolean, werteVon: (id: string) => Record<string, Wert>,
  z: Record<string, Wert>, neu: Neu, paare: Paar[] = [], lage: Map<string, { s: number; f: number }> = new Map()): { befehle: Vorlage[]; tops: string[] } {
  let R = bloeckeVon(v, ids);
  if (!R.length || !(n >= 1)) return { befehle: [], tops: [] };
  // Kette: Master oder eine Kopie gewählt → vom Master aus, hinten an die letzte Kopie, verknüpft mit ihr
  let kette: { schon: number; nach: number; vorige: Map<string, string> } | null = null;
  if (R.length === 1) {
    const t = v[R[0]![0]]!, mu = t.master ? t.id : t.kopieVon, im = mu ? v.findIndex((x) => x.id === mu && x.master) : -1;
    const K = im >= 0 ? kopienVon(v, mu!) : [];
    if (K.length) { R = [[im, block(v, im)]]; const letzte = K[K.length - 1]!; kette = { schon: K.length, nach: letzte.ende, vorige: letzte.glieder }; }
  }
  const zeilen = R.flatMap(([a, e]) => v.slice(a, e)), drin = new Set(zeilen.map((x) => x.id)), tops = new Set(R.map(([a]) => v[a]!.id));
  const blatt = (x: V) => { const i = v.indexOf(x as VM); return !(i + 1 < v.length && v[i + 1]!.ebene > x.ebene && drin.has(v[i + 1]!.id)); };
  const blaetter = zeilen.filter(blatt).map((x) => x.id), istBlatt = new Set(blaetter);
  const wurzeln = blaetter.filter((m) => !l.some((x) => x.nach === m && drin.has(x.von)));
  const P = art === 'ende' && blaetter.length ? [{ von: blaetter[blaetter.length - 1]!, vonEnde: true, nach: blaetter[0]!, nachEnde: false }]
    : art === 'eigen' ? paare.filter((x) => istBlatt.has(x.von) && istBlatt.has(x.nach)) : [];
  const befehle: Vorlage[] = [...tops].filter((id) => !v.find((x) => x.id === id)!.master).map((id) => ({ objekt: 'vorgang', art: 'aendern' as const, objektId: id, werte: { master: true } }));
  const ort = kette ? kette.nach : R[R.length - 1]![1];
  const reihen = reihenZwischen(v[ort - 1]?.reihe, v[ort]?.reihe, zeilen.length * n);
  const neueTops: string[] = [];
  const link = (von: string, nach: string, a: L['art'], abstand: number, vonAbschnitt: number | null = null, nachAbschnitt: number | null = null): Vorlage =>
    ({ objekt: 'verknuepfung', art: 'anlegen', objektId: neu(), werte: { ...z, von, nach, art: a, abstand, von_abschnitt: vonAbschnitt, nach_abschnitt: nachAbschnitt, kennung: '' } });
  let vorige = kette ? kette.vorige : null, r = 0;
  for (let j = 1; j <= n; j++) {
    const k = j + (kette?.schon ?? 0), karte = new Map<string, string>(), da = new Set<string>();
    for (const x of zeilen) {
      const id = neu(); karte.set(x.id, id);
      const w = werteVon(x.id);
      befehle.push({ objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, ...w, ...(tops.has(x.id) ? { name: nummer(String(w.name ?? ''), k) } : {}), reihe: reihen[r++]!, ebene: x.ebene, master: false, kopie_von: x.id } });
      if (tops.has(x.id)) neueTops.push(id);
    }
    const dazu = (von: string, nach: string, a: L['art'], abstand: number, va: number | null = null, na: number | null = null) => { const s = `${von}>${nach}`; if (da.has(s)) return; da.add(s); befehle.push(link(von, nach, a, abstand, va, na)); };
    for (const x of l) {
      if (drin.has(x.von) && drin.has(x.nach)) dazu(karte.get(x.von)!, karte.get(x.nach)!, x.art, x.abstand, x.vonAbschnitt ?? null, x.nachAbschnitt ?? null);
      else if (schema && drin.has(x.nach)) dazu(x.von, karte.get(x.nach)!, x.art, x.abstand, x.vonAbschnitt ?? null, x.nachAbschnitt ?? null);   // Vorgänger außerhalb gelten auch für die Kopie
      else if (schema && drin.has(x.von)) dazu(karte.get(x.von)!, x.nach, x.art, x.abstand, x.vonAbschnitt ?? null, x.nachAbschnitt ?? null);   // Nachfolger außerhalb warten auch auf die Kopie
    }
    if (art === 'takt') for (const m of blaetter) { const vor = vorige ? vorige.get(m) : m; if (vor) dazu(vor, karte.get(m)!, 'ea', 0); }
    for (const x of P) {
      const vor = vorige ? vorige.get(x.von) : x.von; if (!vor) continue;
      dazu(vor, karte.get(x.nach)!, ART_AUS(x.vonEnde, x.nachEnde), 0);
      const ln = lage.get(x.nach); if (!ln) continue;
      const tN = x.nachEnde ? ln.f : ln.s;
      for (const m of wurzeln) { const lm = lage.get(m); if (!lm || m === x.nach) continue; dazu(vor, karte.get(m)!, x.vonEnde ? 'ea' : 'aa', lm.s - tN); }
    }
    vorige = karte;
  }
  return { befehle, tops: neueTops };
}
