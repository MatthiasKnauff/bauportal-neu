// Modulgerüst: Jedes Modul bringt einen Beipackzettel mit.
// Der Kern liest daraus, welche Objekte es gibt und was das Modul braucht.

import { pruefeModell, type Feld, type ObjektModell, type Werte } from './modell';
import type { Ausdruck } from './druck';

export interface Beipackzettel {
  id: string;
  name: string;
  version: string;
  beschreibung: string;
  zeichen?: string;           // Symbol der App (Apps-Menü, Startseite) – Name aus ui/baukasten/zeichen
  farbe?: string;             // App-Farbe (#rrggbb) wie im bisherigen Bauportal – für Verlauf und Strich der Flächen (Darstellung)
  braucht: string[];          // Module, ohne die dieses nicht läuft
  objekte: ObjektModell[];    // Objekte, die das Modul mitbringt
  ansichten: Ansicht[];       // was das Modul in der Oberfläche zeigt
  kataloge?: Katalog[];       // Kataloge, die über den Katalog-Kanal kommen und sich auf Knopfdruck aktualisieren lassen
  nachschlagen?: Nachschlag[];   // große Kataloge, die nur am Server liegen und seitenweise gesucht werden
  ausdrucke?: Ausdruck[];     // was das Modul drucken kann (Druckwerk)
  versionen?: Versionsbereich[];   // Bereiche mit benannten Versionen (z. B. der Bauzeitenplan eines Projekts)
  dokumentarten?: Dokumentart[];   // was sich als PDF, Scan oder Foto in diese App ziehen lässt (Ablegen mit Erkennung)
  abgesetzt?: string[];       // Abschnitte links, die farbig abgesetzt sind und den Namen der angemeldeten Person tragen (z. B. „Für mich“ in der Verwaltung)
  /** Was die App am Handy kann (wie im bisherigen Bauportal): voll – alles · eigen – eigene Handyansicht, alles ·
   *  ansicht – ansehen und kleine Handgriffe, nichts Neues anlegen · lesen – nur ansehen · keine – am Handy nur ein Hinweis. Ohne Angabe: lesen. */
  handy?: Handystufe;
}
/** Eine Art Dokument (PDF, Scan, Foto), die sich ins Fenster ziehen lässt: woran man sie erkennt, wohin das Original kommt
 *  und welcher Eintrag daraus wird. Die Erkennung (kern/dokumenterkennung) und der Ablegen-Dialog richten sich ganz danach. */
export interface Dokumentart {
  art: string; titel: string;
  /** Wendungen (regulärer Ausdruck, Groß/klein egal), an denen man sie erkennt – je gefundener Wendung ein Punkt */
  merkmale: string[];
  /** Wort vor „-nummer“/„Nr.“ für die Nummer des Dokuments (z. B. „rechnung“ → „Rechnungsnummer: 4711“) */
  nummerWort?: string;
  /** In diesen Ansichten der App ist sie vorbelegt */
  ansichten?: string[];
  /** Unterordner im Projektordner; „{lv}“ wird zum Namen des LV */
  ordner: string;
  /** Daraus wird ein Eintrag dieses Objekts (sonst wird das Dokument nur abgelegt) */
  objekt?: string;
  /** Erkannte Angaben → Felder des Objekts */
  felder?: Partial<Record<'lv' | 'firma' | 'nummer' | 'datum' | 'betrag' | 'eingang', string>>;
  /** Feste Werte für den neuen Eintrag */
  vorgaben?: Record<string, string | number | boolean>;
  /** Felder, an denen ein vorhandener Eintrag erkannt wird – dann wird er ergänzt statt neu angelegt (z. B. Angebot: LV und Bieter:in) */
  vorhanden?: string[];
}
export type Handystufe = 'voll' | 'eigen' | 'ansicht' | 'lesen' | 'keine';

/** Ein Katalog füllt ein Objekt (seine Einträge erkennt man an der Kennung, Feld „kennung“) – oder einen Nachschlag. */
export interface Katalog { id: string; titel: string; objekt?: string; nachschlag?: string }

/** Großer Katalog zum Nachschlagen (z. B. 70.000 Positionen): liegt nur am Server, nicht im lokalen Stand der Geräte;
 *  gesucht und geblättert wird seitenweise. Kommt ganz aus dem Katalog-Kanal und wird nur gelesen. */
export interface Nachschlag {
  name: string; titel: string; titelMehrzahl: string;
  anzeigeFeld: string;
  felder: Feld[];
  gliederung: string[];       // Felder für den Baum links (z. B. Leistungsbereich, Gruppe)
  suche: string[];            // Felder, in denen die Suche sucht (Volltext, deutsch)
}

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
  einstellungen?: string;     // eigene Seite, die dieses Objekt einstellt (z. B. „buero“) – die Suche findet dann jedes seiner Felder
  abschnitt?: string;         // Überschrift, unter der die Ansicht links steht (z. B. „Terminplan“, „Vorlagen“)
  imMenue?: false;            // nicht im Menü links – erreichbar über Verweise, die Suche und „Zur Liste“ (z. B. die Liste aller Nachträge)
  zeichen?: string;           // Name des Symbols (Baustein „Zeichen“ der Oberfläche)
  /** Links statt des Baums: Filter in Abschnitten (wie im bisherigen Bauportal, z. B. Kontakte nach Art, Gewerke, Ämter). */
  linksFilter?: LinksFilter[];
  /** Weitere Arten für die Filterbedingung, die nur über das Suchfeld kommen (Vorschläge nach Art), z. B. Ort, Funktion, Tag. */
  suchArten?: { titel: string; felder: string[] }[];
  nachschlag?: string;        // statt eines Objekts: einen großen Katalog seitenweise durchsuchen (Baustein Nachschlagen)
}

export interface LinksFilter {
  feld?: string;                         // nach diesem Feld (je Wert ein Eintrag) …
  /** … oder: die Einträge, auf die in einem Projekt ein anderes Objekt verweist (z. B. Kontakte → „Beteiligte <Projekt>“);
   *  der Abschnitt zeigt das gewählte Projekt zuerst, darunter alle Projekte mit ihrer Anzahl. */
  beteiligt?: { objekt: string; feld: string; titel: string };
  titel: string;                         // Überschrift des Abschnitts
  art?: string;                          // Name der Art in der Filterbedingung (z. B. „Gewerk“ unter „Gewerke“) – sonst der Titel
  alle?: string;                         // erster Eintrag ohne Filter (z. B. „Alle“)
  suche?: boolean;                       // eigenes Suchfeld im Abschnitt
  nur?: Record<string, string[]>;        // nur Einträge mit diesen Werten zählen (z. B. Ämter: nur Behörden)
  zeichen?: Record<string, string>;      // Symbol je Wert
  mehrzahl?: Record<string, string>;     // Name je Wert, wenn anders als in der Auswahl (z. B. „Firmen“)
  auto?: boolean;                        // vom Sammelfilter selbst gebildet: Abschnitt nur, wenn es mindestens zwei Werte gibt
}

export class Modulregister {
  private zettel = new Map<string, Beipackzettel>();
  private modelle = new Map<string, ObjektModell>();
  private nachschlaege = new Map<string, Nachschlag>();

  constructor(module: Beipackzettel[]) {
    for (const z of module) {
      if (this.zettel.has(z.id)) throw new Error(`Modul doppelt: ${z.id}`);
      this.zettel.set(z.id, z);
      for (const m of z.objekte) {
        pruefeModell(m);
        if (this.modelle.has(m.name)) throw new Error(`Objekt doppelt: ${m.name}`);
        this.modelle.set(m.name, m);
      }
      for (const n of z.nachschlagen ?? []) {
        if (this.modelle.has(n.name) || this.nachschlaege.has(n.name)) throw new Error(`Nachschlag doppelt: ${n.name}`);
        for (const f of [n.anzeigeFeld, ...n.gliederung, ...n.suche]) if (!n.felder.some((x) => x.name === f)) throw new Error(`Nachschlag „${n.name}“: Feld „${f}“ fehlt`);
        this.nachschlaege.set(n.name, n);
      }
    }
    for (const k of this.kataloge) {
      if (!!k.objekt === !!k.nachschlag) throw new Error(`Katalog „${k.id}“: genau eins von Objekt oder Nachschlag angeben`);
      if (k.objekt && !this.modelle.has(k.objekt)) throw new Error(`Katalog „${k.id}“: Objekt „${k.objekt}“ fehlt`);
      if (k.nachschlag && !this.nachschlaege.has(k.nachschlag)) throw new Error(`Katalog „${k.id}“: Nachschlag „${k.nachschlag}“ fehlt`);
    }
    for (const z of module) for (const a of z.ansichten) if (a.nachschlag && !this.nachschlaege.has(a.nachschlag)) throw new Error(`Ansicht „${a.id}“: Nachschlag „${a.nachschlag}“ fehlt`);
    // Filter links und Arten im Suchfeld: die Felder muss es am Objekt geben
    for (const z of module) for (const a of z.ansichten) {
      const m = a.objekt ? this.modelle.get(a.objekt) : undefined;
      const felder = [...(a.linksFilter ?? []).flatMap((l) => (l.feld ? [l.feld] : [])), ...(a.suchArten ?? []).flatMap((x) => x.felder)];
      for (const f of felder) if (!m?.felder.some((x) => x.name === f)) throw new Error(`Ansicht „${a.id}“: Feld „${f}“ für den Filter fehlt`);
      if (a.einstellungen && !this.modelle.has(a.einstellungen)) throw new Error(`Ansicht „${a.id}“: Objekt „${a.einstellungen}“ für die Einstellungen fehlt`);
    }
    for (const z of module) if (z.farbe && !/^#[0-9a-f]{6}$/i.test(z.farbe)) throw new Error(`Modul „${z.id}“: App-Farbe „${z.farbe}“ ist kein #rrggbb`);
    // Dokumentarten: Objekt, Felder und Ansichten müssen es geben; Merkmale müssen gültige Ausdrücke sein
    const arten = new Set<string>();
    for (const z of module) for (const d of z.dokumentarten ?? []) {
      if (arten.has(d.art)) throw new Error(`Dokumentart doppelt: ${d.art}`);
      arten.add(d.art);
      for (const m of d.merkmale) new RegExp(m, 'i');
      for (const a of d.ansichten ?? []) if (!z.ansichten.some((x) => x.id === a)) throw new Error(`Dokumentart „${d.art}“: Ansicht „${a}“ fehlt`);
      if (!d.objekt) { if (d.felder || d.vorgaben || d.vorhanden) throw new Error(`Dokumentart „${d.art}“: Felder ohne Objekt`); continue; }
      const m = this.modelle.get(d.objekt);
      if (!m) throw new Error(`Dokumentart „${d.art}“: Objekt „${d.objekt}“ fehlt`);
      for (const f of [...Object.values(d.felder ?? {}), ...Object.keys(d.vorgaben ?? {}), ...(d.vorhanden ?? [])]) if (!m.felder.some((x) => x.name === f)) throw new Error(`Dokumentart „${d.art}“: Feld „${f}“ fehlt in „${d.objekt}“`);
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
      for (const b of a.bloecke) if (b.art === 'verzeichnis') for (const n of b.spalten) if (!m.felder.some((f) => f.name === n)) throw new Error(`Ausdruck „${a.id}“: Spalte „${n}“ fehlt`);
      for (const b of a.bloecke) if (b.art === 'liste' || b.art === 'bilder' || b.art === 'lv') {
        const k = this.modelle.get(b.objekt);
        for (const n of b.art === 'liste' ? [b.ueber, ...b.spalten, ...Object.keys(b.filter ?? {})] : b.art === 'lv' ? [b.ueber, 'oz', 'art', 'kurztext', 'langtext', 'menge', 'einheit', 'ep', ...(b.ohne ? [b.ohne] : [])] : [b.ueber, b.beschriftung]) if (!k?.felder.some((f) => f.name === n)) throw new Error(`Ausdruck „${a.id}“: Liste „${b.id}“ – Feld „${b.objekt}.${n}“ fehlt`);
      }
    }
  }
  get module(): Beipackzettel[] { return [...this.zettel.values()]; }
  get alleModelle(): ObjektModell[] { return [...this.modelle.values()]; }
  get kataloge(): Katalog[] { return this.module.flatMap((m) => m.kataloge ?? []); }
  get ausdrucke(): Ausdruck[] { return this.module.flatMap((m) => m.ausdrucke ?? []); }
  get versionsbereiche(): Versionsbereich[] { return this.module.flatMap((m) => m.versionen ?? []); }
  modell(name: string): ObjektModell | undefined { return this.modelle.get(name); }
  nachschlag(name: string): Nachschlag | undefined { return this.nachschlaege.get(name); }
  get alleNachschlaege(): Nachschlag[] { return [...this.nachschlaege.values()]; }
}

/** Sammelfilter für Ansichten ohne eigene Filter links: je Auswahl-, Verweis- und Stichwortfeld der Liste ein Abschnitt
 *  (UND, ODER, NICHT wie in den Adressen). Nicht dabei: was der Zusammenhang festlegt (Projekt, Version, fester Filter)
 *  und was schon der Baum gliedert. */
export function sammelfilter(m: ObjektModell, ohne: string[]): LinksFilter[] {
  return m.felder.filter((f) => !f.verborgen && f.inListe && !ohne.includes(f.name) && f.name !== m.projektFeld && f.name !== 'version'
    && (f.art === 'auswahl' || f.art === 'verweis' || f.art === 'mehrfach' || f.art === 'schlagworte'))
    .map((f) => ({ feld: f.name, titel: f.titel, art: f.titel, auto: true }));
}
