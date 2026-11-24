// Modulgerüst: Jedes Modul bringt einen Beipackzettel mit.
// Der Kern liest daraus, welche Objekte es gibt und was das Modul braucht.

import { pruefeModell, type ObjektModell } from './modell';

export interface Beipackzettel {
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  braucht: string[];          // Module, ohne die dieses nicht läuft
  objekte: ObjektModell[];    // Objekte, die das Modul mitbringt
  ansichten: Ansicht[];       // was das Modul in der Oberfläche zeigt
}

export interface Ansicht {
  id: string;
  titel: string;
  objekt?: string;            // Liste dieses Objekts; ohne Angabe bringt die Oberfläche eine eigene Ansicht mit
  baum?: string[];            // Felder, nach denen der Baum links gliedert
  nurAdmin?: boolean;
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
  }
  get module(): Beipackzettel[] { return [...this.zettel.values()]; }
  get alleModelle(): ObjektModell[] { return [...this.modelle.values()]; }
  modell(name: string): ObjektModell | undefined { return this.modelle.get(name); }
}
