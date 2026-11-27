// Master und Kopien im Bauzeitenplan: Eine Änderung am Master geht auf Nachfrage in alle Kopien – reine Rechnung
// (vorher im Balkenplan selbst). Übernommen wird nur, was in einer Kopie noch so steht wie vorher im Master (von Hand
// Geändertes bleibt); der Name der obersten Zeile bleibt in jeder Kopie ihr eigener. Neue Zeilen im Master kommen an die
// entsprechende Stelle jeder Kopie, gelöschte nehmen ihre Gegenstücke mit (Kette überbrückt wie bei Entf).
import type { Wert } from '../../kern/modell';
import { block, kopienVon, loeschen, masterNeu, type L, type VM, type Vorlage } from './bearbeiten';

export const MASTERFELDER = ['name', 'dauer', 'unterbrechung', 'gewerk', 'vob', 'unternehmer', 'firma', 'farbe', 'notiz'];
type W = Record<string, Wert>;
type Befehl = { objekt: string; art: string; objektId: string; werte?: W | null };

export interface MasterUmfeld {
  v: () => VM[]; l: () => L[];                     // Plan jetzt (Getter: „übernehmen“ rechnet später mit dem dann gültigen Stand)
  werte: (id: string) => W | undefined;            // Werte eines Vorgangs jetzt
  linkAlt: (id: string) => W | undefined;          // Werte einer (gerade gelöschten) Verknüpfung
  kopienDer: (id: string) => string[];             // Vorgänge, die Kopie dieser Zeile sind
  z: W; neu: () => string; autom: boolean;
}

/** Was ein eigener Schritt für die Kopien bedeutet – null, wenn er keinen Master berührt. */
export function masterNachziehen(wieder: Befehl[], gegen: Befehl[], u: MasterUmfeld): { mname: string; kopien: number; uebernehmen: () => Vorlage[] } | null {
  const v = u.v(), l = u.l();
  const aenderungen = wieder.filter((b) => b.objekt === 'vorgang' && b.art === 'aendern' && Object.keys(b.werte ?? {}).some((k) => MASTERFELDER.includes(k)));
  const neue = wieder.filter((b) => b.objekt === 'vorgang' && b.art === 'anlegen' && !b.werte?.kopie_von);
  const weg = wieder.filter((b) => b.objekt === 'vorgang' && b.art === 'loeschen'), wegLinks = wieder.filter((b) => b.objekt === 'verknuepfung' && b.art === 'loeschen');
  if (!aenderungen.length && !neue.length && !weg.length) return null;
  // zu welchem Master gehört die geänderte Zeile? (der Master selbst oder eine Zeile darin)
  const masterVon = (id: string) => { let i = v.findIndex((x) => x.id === id); if (i < 0) return undefined; const e = v[i]!.ebene, an = i;
    for (; i >= 0; i--) if (v[i]!.master && v[i]!.ebene <= e && block(v, i) > an) return v[i]!; return undefined; };
  const name = (id: string) => String(u.werte(id)?.name ?? '');
  const befehle: Vorlage[] = [], spaeter: (() => Vorlage[])[] = []; let kopien = 0, mname = '';
  for (const b of aenderungen) {
    const m = masterVon(b.objektId); if (!m) continue;
    const K = kopienVon(v, m.id); if (!K.length) continue;
    kopien = K.length; mname = name(m.id);
    const alt = gegen.find((g) => g.objektId === b.objektId)?.werte ?? {};
    for (const k of K) {
      const ziel = k.glieder.get(b.objektId), z0 = ziel ? u.werte(ziel) : undefined; if (!ziel || !z0) continue;
      const w = Object.fromEntries(Object.entries(b.werte ?? {}).filter(([f]) => MASTERFELDER.includes(f) && !(f === 'name' && b.objektId === m.id) && (z0[f] ?? null) === (alt[f] ?? null)));
      if (Object.keys(w).length) befehle.push({ objekt: 'vorgang', art: 'aendern', objektId: ziel, werte: w });
    }
  }
  for (const b of neue) {
    const m = masterVon(b.objektId); if (!m || m.id === b.objektId) continue;
    const K = kopienVon(v, m.id); if (!K.length) continue;
    kopien = K.length; mname = name(m.id);
    // erst beim Übernehmen gerechnet: so kommt mit, was inzwischen an der neuen Zeile eingetragen wurde (z. B. ihr Name)
    spaeter.push(() => { const jetzt = u.werte(b.objektId); if (!jetzt) return [];
      const w = Object.fromEntries(Object.entries(jetzt).filter(([f]) => [...MASTERFELDER, 'fortschritt', 'anfang_nicht_vor', 'abschnitt', 'teil'].includes(f)));
      return masterNeu(u.v(), u.l(), m.id, b.objektId, w, u.z, u.neu); });
    // gelöschte Verknüpfungen zwischen Zeilen des Masters: auch in den Kopien (sonst bliebe dort die Kette, die der Master überbrückt hat)
    for (const x of wegLinks) { const a = u.linkAlt(x.objektId); if (!a) continue;
      for (const k of K) { const von = k.glieder.get(String(a.von)), nach = k.glieder.get(String(a.nach));
        const g = von && nach && l.find((y) => y.von === von && y.nach === nach); if (g) befehle.push({ objekt: 'verknuepfung', art: 'loeschen', objektId: g.id }); } }
  }
  for (const b of weg) {
    const gegenstuecke = u.kopienDer(b.objektId); if (!gegenstuecke.length) continue;
    kopien = Math.max(kopien, gegenstuecke.length); mname = mname || 'Master';
    befehle.push(...loeschen(v, l, gegenstuecke, u.z, u.neu, u.autom));   // wie Entf: Kette überbrücken, Verknüpfungen mit weg
  }
  if (!befehle.length && !spaeter.length) return null;
  return { mname, kopien, uebernehmen: () => [...befehle, ...spaeter.flatMap((f) => f())] };
}
