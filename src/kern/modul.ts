// Modulgerüst: Jedes Modul bringt einen Beipackzettel mit.
// Der Kern liest daraus, welche Objekte es gibt und was das Modul braucht.

import { pruefeModell, type ObjektModell, type Werte } from './modell';
import type { Ausdruck } from './druck';

export interface Beipackzettel {
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  zeichen?: string;           // Symbol der App (Apps-Menü, Startseite) – Name aus ui/baukasten/zeichen
  braucht: string[];          // Module, ohne die dieses nicht läuft
  objekte: ObjektModell[];    // Objekte, die das Modul mitbringt
  ansichten: Ansicht[];       // was das Modul in der Oberfläche zeigt
  kataloge?: Katalog[];       // Kataloge, die über den Katalog-Kanal kommen und sich auf Knopfdruck aktualisieren lassen
  ausdrucke?: Ausdruck[];     // was das Modul drucken kann (Druckwerk)
  versionen?: Versionsbereich[];   // Bereiche mit benannten Versionen (z. B. der Bauzeitenplan eines Projekts)
}

/** Ein Katalog füllt ein Objekt; seine Einträge erkennt man an der Kennung (Feld „kennung“). */
export interface Katalog { id: string; titel: string; objekt: string }

/** Wege, eine neue Version anzulegen: aus der aktuellen, leer, aus einem anderen Projekt. */
export type Versionsweg = 'kopie' | 'leer' | 'projekt';
export interface Versionsbereich { bereich: string; titel: string; wege: Versionsweg[] }

export interface Ansicht {
  id: string;
  titel: string;
  objekt?: string;            // Liste dieses Objekts; ohne Angabe bringt die Oberfläche eine eigene Ansicht mit
  baum?: string[];            // Felder, nach denen der Baum links gliedert
  brauchtProjekt?: boolean;   // zeigt nur die Einträge des oben gewählten Projekts
  filter?: Werte;             // zeigt nur Einträge mit diesen Werten (z. B. nur die Mängel); neue Einträge bekommen sie
  nurAdmin?: boolean;
  hilfe?: string;             // Hilfe zur Ansicht (Knopf „?“ oben): was man hier tut und wie – Absätze mit Leerzeile getrennt
  abschnitt?: string;         // Überschrift, unter der die Ansicht links steht (z. B. „Terminplan“, „Vorlagen“)
  zeichen?: string;           // Name des Symbols (Baustein „Zeichen“ der Oberfläche)
  /** Links statt des Baums: Filter in Abschnitten (wie im bisherigen Bauportal, z. B. Kontakte nach Art, Gewerke, Ämter). */
  linksFilter?: LinksFilter[];
}

export interface LinksFilter {
  feld: string;                          // nach diesem Feld
  titel: string;                         // Überschrift des Abschnitts
  alle?: string;                         // erster Eintrag ohne Filter (z. B. „Alle“)
  suche?: boolean;                       // eigenes Suchfeld im Abschnitt
  nur?: Record<string, string[]>;        // nur Einträge mit diesen Werten zählen (z. B. Ämter: nur Behörden)
  zeichen?: Record<string, string>;      // Symbol je Wert
  mehrzahl?: Record<string, string>;     // Name je Wert, wenn anders als in der Auswahl (z. B. „Firmen“)
}

export class Modulregister {
  private zettel = new Map<string, Beipackzettel>();
  private modelle = new Map<string, ObjektModell>();

  constructor(module: Beipackzettel[]) {
    for (const z of module) {
      if (this.zettel.has(z.id)) throw new Error(`Modul doppelt: ${z.id}`);
      this.zettel.set(z.id, z);
      for (const m of z.objekte) {
        pruefeModell(m);
        if (this.modelle.has(m.name)) throw new Error(`Objekt doppelt: ${m.name}`);
        this.modelle.set(m.name, m);
      }
    }
    for (const z of module) for (const b of z.braucht) {
      if (!this.zettel.has(b)) throw new Error(`Modul „${z.id}“ braucht „${b}“, das fehlt`);
    }
    // Ausdrucke dürfen nur Felder nennen, die es gibt
    for (const a of this.ausdrucke) {
      const m = this.modelle.get(a.objekt);
      if (!m) throw new Error(`Ausdruck „${a.id}“: Objekt „${a.objekt}“ fehlt`);
      for (const n of a.bloecke.flatMap((b) => (b.art === 'felder' ? b.felder : b.art === 'text' ? [b.feld] : []))) {
        if (!m.felder.some((f) => f.name === n)) throw new Error(`Ausdruck „${a.id}“: Feld „${n}“ fehlt`);
      }
      for (const b of a.bloecke) if (b.art === 'liste' || b.art === 'bilder') {
        const k = this.modelle.get(b.objekt);
        for (const n of b.art === 'liste' ? [b.ueber, ...b.spalten, ...Object.keys(b.filter ?? {})] : [b.ueber, b.beschriftung]) if (!k?.felder.some((f) => f.name === n)) throw new Error(`Ausdruck „${a.id}“: Liste „${b.id}“ – Feld „${b.objekt}.${n}“ fehlt`);
      }
    }
  }
  get module(): Beipackzettel[] { return [...this.zettel.values()]; }
  get alleModelle(): ObjektModell[] { return [...this.modelle.values()]; }
  get kataloge(): Katalog[] { return this.module.flatMap((m) => m.kataloge ?? []); }
  get ausdrucke(): Ausdruck[] { return this.module.flatMap((m) => m.ausdrucke ?? []); }
  get versionsbereiche(): Versionsbereich[] { return this.module.flatMap((m) => m.versionen ?? []); }
  modell(name: string): ObjektModell | undefined { return this.modelle.get(name); }
}
