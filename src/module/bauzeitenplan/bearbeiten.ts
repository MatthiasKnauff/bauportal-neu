// Bearbeiten des Bauzeitenplans als reine Rechnung: Jede Handlung (einfügen, löschen, Vorgänger eintragen, gliedern,
// verschieben) liefert die Befehle, die das Bauportal dann als einen Schritt ausführt – Strg+Z nimmt alles zusammen zurück.
// „Automatisch verknüpfen“ wie gewohnt: Einfügen setzt den neuen Vorgang in die Kette, Löschen überbrückt sie.
import type { Wert } from '../../kern/modell';
import type { Art } from './rechnung';
import type { Vorgaenger } from './schreibweise';

export interface V { id: string; reihe: number; ebene: number; name?: string }
export interface L { id: string; von: string; nach: string; art: Art; abstand: number }
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
  for (const x of l.filter((y) => y.nach === nach)) {
    const s = soll.get(x.von);
    if (!s) b.push(linkWeg(x));
    else { if (s.art !== x.art || s.abstand !== x.abstand) b.push({ objekt: 'verknuepfung', art: 'aendern', objektId: x.id, werte: { art: s.art, abstand: s.abstand } }); soll.delete(x.von); }
  }
  for (const [von, s] of soll) b.push(linkNeu(neu, z, von, nach, s.art, s.abstand));
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
