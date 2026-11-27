// Bearbeiten des Bauzeitenplans als reine Rechnung: Jede Handlung (einfügen, löschen, Vorgänger eintragen, gliedern,
// verschieben) liefert die Befehle, die das Bauportal dann als einen Schritt ausführt – Strg+Z nimmt alles zusammen zurück.
// „Automatisch verknüpfen“ wie gewohnt: Einfügen setzt den neuen Vorgang in die Kette, Löschen überbrückt sie.
import type { Wert } from '../../kern/modell';
import { abschnitteLesen, abschnitteSchreiben, type Abschnitt, type Art } from './rechnung';
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

// ---------- Gruppieren (wie im bisherigen Bauportal): Ebenen Gebäudeteil, Bauphase, Gewerk, Firma in wählbarer Reihenfolge ----------
// Die Gliederungszeilen werden neu gebildet; alles andere (Leistungen, eigene Gruppen mit allem darunter) bleibt, wie es ist, und
// behält Dauer und Vorgänger. Bauphase und Gebäudeteil stehen an jeder Leistung (vom Assistenten gesetzt, sonst beim ersten
// Gruppieren aus den Gruppen darüber gelesen und gespeichert). Gewerk und Firma bekommen nur eine Zeile, wo sie mindestens zwei
// Leistungen zusammenfassen; eine Ebene mit nur einem Wert entfällt. Verknüpfungen an wegfallenden Gliederungszeilen gelten danach
// für jede Leistung darunter – so bleibt der Ablauf wie berechnet.

export type Gruppenebene = 'teil' | 'phase' | 'gewerk' | 'firma';
export const GRUPPENEBENEN: { wert: Gruppenebene; titel: string }[] = [{ wert: 'teil', titel: 'Gebäudeteil' }, { wert: 'phase', titel: 'Bauphase' }, { wert: 'gewerk', titel: 'Gewerk' }, { wert: 'firma', titel: 'Firma' }];
export interface GV extends V { kennung?: string; name: string; gewerk?: string; firma?: string; abschnitt?: string; teil?: string }

/** Gliederungszeilen, die das Gruppieren selbst bildet (vom Assistenten oder einem früheren Gruppieren). */
export const istGliederung = (x: { kennung?: string }) => /^(assistent:_(grp|unit|bau)|gruppe:)/.test(x.kennung ?? '');
const festOben = (x: { kennung?: string }) => /^assistent:_start/.test(x.kennung ?? ''), festUnten = (x: { kennung?: string }) => /^assistent:_end/.test(x.kennung ?? '');

/** Bauphase und Gebäudeteil einer Zeile: gespeichert, sonst aus den Gliederungszeilen darüber. */
export function einordnung(v: GV[]): Map<string, { phase: string; teil: string }> {
  const r = new Map<string, { phase: string; teil: string }>(), stapel: GV[] = [];
  for (const x of v) {
    while (stapel.length && stapel[stapel.length - 1]!.ebene >= x.ebene) stapel.pop();
    const ueber = (re: RegExp) => [...stapel].reverse().find((a) => re.test(a.kennung ?? ''))?.name ?? '';
    r.set(x.id, { phase: x.abschnitt || ueber(/^(assistent:_grp|gruppe:.*phase=)/), teil: x.teil || ueber(/^(assistent:_(unit|bau)|gruppe:.*teil=)/) });
    stapel.push(x);
  }
  return r;
}

export function gruppieren(v: GV[], l: L[], ebenen: Gruppenebene[], z: Record<string, Wert>, neu: Neu): Vorlage[] {
  const ein = einordnung(v);
  // Einheiten: Zeilen, die keine Gliederungszeile sind und nur unter Gliederungszeilen stehen – mit allem darunter
  const einheiten: { zeilen: GV[]; phase: string; teil: string; gewerk: string; firma: string }[] = [];
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (istGliederung(x)) continue;
    let k = i - 1, unterEigener = false, eb = x.ebene;
    for (; k >= 0; k--) if (v[k]!.ebene < eb) { if (!istGliederung(v[k]!)) { unterEigener = true; break; } eb = v[k]!.ebene; }
    if (unterEigener) continue;
    const e = ein.get(x.id)!;
    einheiten.push({ zeilen: v.slice(i, block(v, i)), ...e, gewerk: x.gewerk ?? '', firma: x.firma ?? '' });
  }
  const oben = einheiten.filter((u) => festOben(u.zeilen[0]!)), unten = einheiten.filter((u) => festUnten(u.zeilen[0]!));
  const mitte = einheiten.filter((u) => !oben.includes(u) && !unten.includes(u));
  // eine Ebene mit höchstens einem Wert entfällt (Gebäudeteil bei einem Haus)
  const E = ebenen.filter((e) => new Set(mitte.map((u) => u[e]).filter(Boolean)).size > (e === 'teil' ? 1 : 0));
  const alteGl = new Map(v.filter(istGliederung).map((x) => [x.kennung!, x]));
  const out: { x: GV | null; kennung?: string; name?: string; ebene: number }[] = [];
  const setze = (u: (typeof einheiten)[number], ebene: number) => { const d = ebene - u.zeilen[0]!.ebene; for (const x of u.zeilen) out.push({ x, ebene: x.ebene + d }); };
  const rek = (U: typeof einheiten, rest: Gruppenebene[], ebene: number, pfad: string) => {
    if (!rest.length) { U.forEach((u) => setze(u, ebene)); return; }
    const [e, ...weiter] = rest as [Gruppenebene, ...Gruppenebene[]], innen = e === 'gewerk' || e === 'firma';
    const G = new Map<string, typeof einheiten>();
    for (const u of U) { const k = u[e]; G.set(k, [...(G.get(k) ?? []), u]); }
    if (innen && (G.size < 2 || U.length < 2)) { rek(U, weiter, ebene, pfad); return; }
    // ohne Wert: beim Gebäudeteil zuerst (Gemeinsames vorn), sonst zuletzt (z. B. „Wohnung 1 fertiggestellt“ hinter den Phasen);
    // die Werte in der Reihenfolge des Plans
    const leerZuerst = e === 'teil';
    for (const [k, L] of [...G].sort(([a], [b]) => (Number(!!a) - Number(!!b)) * (leerZuerst ? 1 : -1))) {
      if (!k || (innen && L.length < 2)) { rek(L, weiter, ebene, pfad); continue; }
      const kennung = `gruppe:${pfad}${e}=${k}`;
      out.push({ x: null, kennung, name: k, ebene });
      rek(L, weiter, ebene + 1, `${kennung.slice(7)}|`);
    }
  };
  oben.forEach((u) => setze(u, 0));
  rek(mitte, E, 0, '');
  unten.forEach((u) => setze(u, 0));
  // Befehle: Gliederungszeilen wiederverwenden (gleiche Kennung) oder anlegen, Reihenfolge und Ebene setzen, übrige Gliederung weg
  const b: Vorlage[] = [], bleibt = new Set<string>();
  out.forEach((o, i) => {
    const reihe = i + 1;
    if (o.x) {
      const e = ein.get(o.x.id)!, w: Record<string, Wert> = {};
      if (o.x.reihe !== reihe) w.reihe = reihe;
      if (o.x.ebene !== o.ebene) w.ebene = o.ebene;
      if (!o.x.abschnitt && e.phase) w.abschnitt = e.phase;   // beim ersten Gruppieren gelesen – jetzt gespeichert
      if (!o.x.teil && e.teil) w.teil = e.teil;
      if (Object.keys(w).length) b.push({ objekt: 'vorgang', art: 'aendern', objektId: o.x.id, werte: w });
      return;
    }
    const alt = alteGl.get(o.kennung!);
    if (alt) { bleibt.add(alt.id); if (alt.reihe !== reihe || alt.ebene !== o.ebene) b.push({ objekt: 'vorgang', art: 'aendern', objektId: alt.id, werte: { reihe, ebene: o.ebene } }); }
    else b.push({ objekt: 'vorgang', art: 'anlegen', objektId: neu(), werte: { ...z, name: o.name!, kennung: o.kennung!, reihe, ebene: o.ebene, dauer: 0, fortschritt: 0 } });
  });
  // wegfallende Gliederungszeilen: ihre Verknüpfungen gelten für jede Leistung darunter
  const weg = v.filter((x) => istGliederung(x) && !bleibt.has(x.id)), wegIds = new Set(weg.map((x) => x.id));
  const blattUnter = (g: GV) => { const i = v.indexOf(g); return v.slice(i + 1, block(v, i)).filter((x, k, arr) => !(arr[k + 1] && arr[k + 1]!.ebene > x.ebene) && !istGliederung(x)).map((x) => x.id); };
  const da = new Set(l.map((x) => `${x.von}>${x.nach}`));
  for (const g of weg) {
    const unter = blattUnter(g);
    for (const x of l) {
      if (x.nach === g.id && !wegIds.has(x.von)) for (const u of unter) { const k = `${x.von}>${u}`; if (!da.has(k)) { da.add(k); b.push(linkNeu(neu, z, x.von, u, x.art, x.abstand)); } }
      if (x.von === g.id && !wegIds.has(x.nach)) for (const u of unter) { const k = `${u}>${x.nach}`; if (!da.has(k)) { da.add(k); b.push(linkNeu(neu, z, u, x.nach, x.art, x.abstand)); } }
    }
  }
  for (const x of l) if (wegIds.has(x.von) || wegIds.has(x.nach)) b.push(linkWeg(x));
  for (const g of weg) b.push({ objekt: 'vorgang', art: 'loeschen', objektId: g.id });
  return b;
}

// ---------- Aufräumen: überflüssige Verknüpfungen ----------
/** Eine Verknüpfung Ende → Anfang ohne Abstand ist überflüssig, wenn der Nachfolger über andere solche Verknüpfungen ohnehin
 *  auf den Vorgänger wartet – entfernt ändern sich die Termine nicht (wie im bisherigen Bauzeitenplan). Nur zwischen Leistungen,
 *  nicht an Gruppen und nicht an Teilen eines unterbrochenen Vorgangs. v in Reihenfolge des Plans. → Kennungen der Verknüpfungen */
export function ueberfluessigeLinks(v: V[], l: L[]): string[] {
  const reihe = [...v].sort((a, b) => a.reihe - b.reihe);
  const blatt = new Set(reihe.filter((x, i) => !(i + 1 < reihe.length && reihe[i + 1]!.ebene > x.ebene)).map((x) => x.id));
  const schlicht = (k: L) => k.art === 'ea' && k.abstand >= 0 && k.vonAbschnitt == null && k.nachAbschnitt == null && blatt.has(k.von) && blatt.has(k.nach);
  const vor = new Map<string, L[]>();
  for (const k of l) if (schlicht(k)) vor.set(k.nach, [...(vor.get(k.nach) ?? []), k]);
  const weg = new Set<string>();
  // wartet „von“ (rückwärts über Vorgänger) auf „ziel“, ohne die Verknüpfung „ohne“?
  const wartet = (von: string, ziel: string, ohne: string, gesehen = new Set<string>()): boolean => {
    for (const k of vor.get(von) ?? []) {
      if (k.id === ohne || weg.has(k.id)) continue;
      if (k.von === ziel) return true;
      if (gesehen.has(k.von)) continue; gesehen.add(k.von);
      if (wartet(k.von, ziel, ohne, gesehen)) return true;
    }
    return false;
  };
  for (const x of reihe) for (const k of vor.get(x.id) ?? []) if (k.abstand === 0 && wartet(k.nach, k.von, k.id)) weg.add(k.id);
  return [...weg];
}

/** „Neu → Gruppe“ wie bisher: eine Leistungsgruppe über die gewählten Zeilen (mit allem darunter) – sie rücken eine Ebene tiefer.
 *  v in Reihenfolge des Plans. Ohne Wahl: eine leere Gruppe am Ende. */
export function gruppeUm(v: V[], ids: string[], z: Record<string, Wert>, neu: Neu, name = 'Neue Leistungsgruppe'): { befehle: Vorlage[]; id: string } {
  const bl = bloeckeVon(v, ids), id = neu();
  if (!bl.length) return { befehle: [{ objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, name, dauer: 1, fortschritt: 0, reihe: (v[v.length - 1]?.reihe ?? 0) + 1, ebene: 0 } }], id };
  const a = bl[0]![0], e = Math.max(...bl.map(([, x]) => x));
  const ebene = Math.min(...v.slice(a, e).map((x) => x.ebene));
  const reihe = a > 0 ? (v[a - 1]!.reihe + v[a]!.reihe) / 2 : v[a]!.reihe - 1;
  return { befehle: [{ objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, name, dauer: 1, fortschritt: 0, reihe, ebene } },
    ...v.slice(a, e).map((x): Vorlage => ({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte: { ebene: x.ebene + 1 } }))], id };
}

/** „Unterbrechen“ wie bisher: an Arbeitstag w (innerhalb des Balkens, nicht am ersten Tag eines Abschnitts) beginnt eine Pause
 *  von „pause“ Arbeitstagen. teile: die Abschnitte des Vorgangs in Arbeitstagen (Ergebnis der Terminrechnung), unterbrechung: sein
 *  Feld. Verknüpfungen an späteren Abschnitten rücken um eins weiter. → Befehle oder ein Hinweis, warum es nicht geht. */
export function unterbrechen(id: string, dauer: number, unterbrechung: string | null | undefined, teile: { s: number; f: number }[], w: number, l: L[], pause = 5): Vorlage[] | string {
  if (!(dauer > 1)) return 'Nur Leistungen mit mindestens 2 Tagen Dauer lassen sich unterbrechen.';
  const k = teile.findIndex((t) => w >= t.s && w < t.f);
  if (k < 0 || w <= teile[k]!.s) return 'Bitte auf einen Tag innerhalb des Balkens klicken – nicht auf den ersten Tag eines Abschnitts.';
  const ab = abschnitteLesen(unterbrechung) ?? [{ dauer, pause: 0 }];
  const d1 = w - teile[k]!.s, d2 = ab[k]!.dauer - d1;
  if (d2 <= 0) return 'Bitte auf einen Tag innerhalb des Balkens klicken.';
  ab.splice(k, 1, { dauer: d1, pause: ab[k]!.pause }, { dauer: d2, pause: Math.max(1, pause) });
  const b: Vorlage[] = [{ objekt: 'vorgang', art: 'aendern', objektId: id, werte: { unterbrechung: abschnitteSchreiben(ab) } }];
  for (const x of l) {
    const w2: Record<string, Wert> = {};
    if (x.nach === id && x.nachAbschnitt != null && x.nachAbschnitt > k) w2.nach_abschnitt = x.nachAbschnitt + 1;
    if (x.von === id && x.vonAbschnitt != null && x.vonAbschnitt > k) w2.von_abschnitt = x.vonAbschnitt + 1;
    if (Object.keys(w2).length) b.push({ objekt: 'verknuepfung', art: 'aendern', objektId: x.id, werte: w2 });
  }
  return b;
}

/** Neue Zeile im Master → in jede Kopie an die entsprechende Stelle (hinter das Gegenstück der Zeile davor, gleiche Einrückung
 *  relativ dazu), mit „kopie_von“. Verknüpfungen der neuen Zeile mit anderen Zeilen des Masters kommen in jeder Kopie mit.
 *  v: Stand nach dem Anlegen (in Plan-Reihenfolge); master: Kennung des Masters; werte: Werte der neuen Zeile. */
export function masterNeu(v: VM[], l: L[], master: string, neuId: string, werte: Record<string, Wert>, z: Record<string, Wert>, neu: Neu): Vorlage[] {
  const i = v.findIndex((x) => x.id === neuId); if (i <= 0) return [];
  const davor = v[i - 1]!, b: Vorlage[] = [];
  for (const k of kopienVon(v, master)) {
    const gegen = k.glieder.get(davor.id) ?? (davor.id === master ? k.top : undefined); if (!gegen) continue;
    const gi = v.findIndex((x) => x.id === gegen), g = v[gi]!;
    // hinter das Gegenstück – war die Zeile davor eine Gruppe, in die die neue Zeile hineinrückt, direkt dahinter, sonst hinter ihren Block
    const nachGi = v[i]!.ebene > davor.ebene ? gi + 1 : block(v, gi);
    const reihe = v[nachGi] ? (v[nachGi - 1]!.reihe + v[nachGi]!.reihe) / 2 : v[nachGi - 1]!.reihe + 1;
    const id = neu();
    b.push({ objekt: 'vorgang', art: 'anlegen', objektId: id, werte: { ...z, ...werte, reihe, ebene: g.ebene + (v[i]!.ebene - davor.ebene), master: false, kopie_von: neuId } });
    for (const x of l) {
      const von = x.von === neuId ? id : x.nach === neuId ? k.glieder.get(x.von) : undefined, nach = x.nach === neuId ? id : x.von === neuId ? k.glieder.get(x.nach) : undefined;
      if (von && nach) b.push(linkNeu(neu, z, von, nach, x.art, x.abstand));
    }
  }
  return b;
}

/** Ein Teil einer unterbrochenen Leistung mit der Maus geändert (wie man es erwartet: nur dieser Teil, die anderen bleiben stehen).
 *  art: schieben – der ganze Teil; anfang/ende – nur diese Kante. d in Arbeitstagen. Ergebnis: neue Abschnitte und um wie viel
 *  der Anfang der Leistung wandert (nur beim ersten Teil) – oder ein Hinweis, warum es so nicht geht (Teile dürfen sich nicht
 *  berühren, jeder Teil hat mindestens einen Tag). */
export function teilAendern(ab: Abschnitt[], k: number, art: 'schieben' | 'anfang' | 'ende', d: number): { abschnitte: Abschnitt[]; anfang: number } | string {
  const neu = ab.map((a) => ({ ...a })), t = neu[k], nach = neu[k + 1];
  if (!t || !d) return { abschnitte: neu, anfang: 0 };
  let anfang = 0;
  if (art === 'schieben') {
    if (k === 0) anfang = d; else t.pause += d;
    if (nach) nach.pause -= d;
  } else if (art === 'anfang') {
    if (k === 0) anfang = d; else t.pause += d;
    t.dauer -= d;
  } else {
    t.dauer += d;
    if (nach) nach.pause -= d;
  }
  if (neu.some((a) => a.dauer < 1)) return 'Ein Teil braucht mindestens einen Tag.';
  if (neu.some((a, i) => i > 0 && a.pause < 1)) return 'Die Teile dürfen sich nicht berühren – für eine durchgehende Leistung die Unterbrechung in der Karte entfernen.';
  return { abschnitte: neu, anfang };
}
