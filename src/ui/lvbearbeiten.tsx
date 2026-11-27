// Baustein „LV-Baum“ (wie im bisherigen Bauportal, dort viermal getrennt gebaut – hier einmal): Projekt → LVs als Ordner → Gliederung →
// Positionen. Das gewählte LV ist offen, die anderen stehen zugeklappt darüber und darunter (Klick öffnet). Die erste Spalte
// „Bezeichnung“ (OZ und Kurztext) gehört dem Baustein; die übrigen Spalten bringt jede Ansicht mit (LV: Menge, EH, Art, KG, EP, GP –
// Preisspiegel: Preise je Bieter:in – Aufträge: Auftrag, Prognose, abgerechnet). Summen je Titel, LV und Projekt rechnet der Baustein
// aus der Summe der Spalte. Bearbeiten in der Zelle (Enter eine Zeile tiefer, Tab zur nächsten Spalte), Auswahl wie in Windows,
// Spalten wählen/ordnen/passend machen. Mit „struktur“ (LV bearbeiten) dazu: neue Zeilen, Gliederung, Nummerieren, Ziehen an der OZ,
// Kopieren/Einfügen, Langtext, Löschen. Nach der Vergabe ist das LV gesperrt – 🔒 schaltet es bis zum Neuladen frei.
import { Spaltenfeld } from './baukasten/spaltenfeld';
import { zeilenZiehen } from './baukasten/zeilenzug';
import { passt, suchworte } from '../module/ava/suche';
import { avaSuchtext } from './avasuche';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { ebeneAendern, gaebPruefung, gliederungEinfuegen, lvZeilen, mitUnterzeilen, maskeLesen, maskeSchreiben, neueOz, nummerieren, verschieben, type LvZeile, type OzMaske } from '../module/ava/lvbaum';
import { istZuschlag, summeGeschaetzt, zaehlt, zahl } from '../module/ava/rechnung';
import { Dialog } from './baukasten/dialog';
import { langtextMenue, ErgaenzungFenster } from './textergaenzung';
import { LvQuellenLeiste } from './lvquelle';
import { ModellInsLv } from './modellinslv';
import { NeuesLv } from './neueslv';
import { projektId } from './projekt';
import { lvFolge, lvVon, lvWaehlen } from './avakopf';
import { druckOeffnen } from './druck';
import { springeZu } from './sprung';
import { gaebAusgeben, gpMit, nachtragNeu } from './avadaten';
import { gaebEinlesen } from './uebernahme';
import { LvExcelFenster, lvExcelAusgeben, lvExcelEinlesen } from './lvexcel';
import type { Mitte } from './baukasten/anpassung';
import { Klappe, Ordner } from './baukasten/baum';
import { zeigeMenue, type Menuepunkt } from './baukasten/kontextmenue';
import type { Knopf } from './baukasten/menueleiste';
import { spaltenwahl, zusatzMessen } from './baukasten/spalten';
import { Zeichen } from './baukasten/zeichen';
import { zeilenwahl } from './baukasten/zeilenwahl';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { istHinweis } from '../kern/lvarten';

/** Eine Spalte des LV-Baums (die erste, „Bezeichnung“, bringt der Baustein selbst mit). */
export interface BaumSpalte {
  id: string; titel: string; breite: number; rechts?: boolean; hilfe?: string;
  /** Anzeige in der Zeile einer Position (Titel: die Summe, wenn es eine gibt) */
  wert: (pos: Zeile) => string;
  /** Summe über Positionen – für Titel, LV, Projekt und den Fuß. Ohne: die Zelle bleibt dort leer. */
  summe?: (positionen: Zeile[]) => number | null;
  /** Bearbeiten in der Zelle: Text im Feld (ohne: wie angezeigt) und Übernehmen – Fehlertext zurück, wenn es nicht geht */
  setzen?: (pos: Zeile, text: string) => string | void;
  roh?: (pos: Zeile) => string;
  klasse?: (pos: Zeile) => string | undefined;
  /** Hinweis zur Zelle (Tooltip, kleine Marke in der Ecke), z. B. die Bieterangaben zu einem Preis */
  hinweis?: (pos: Zeile) => string | undefined;
  /** frei: nicht in der Spaltenwahl, immer hinten (z. B. je Bieter:in eine Spalte) */
  frei?: boolean;
  /** ab Werk ausgeblendet (in der Spaltenwahl einschaltbar) – damit die Standardbreite ohne waagerechtes Rollen auskommt */
  aus?: boolean;
  kopf?: () => JSX.Element;
}
/** Eine Zeile unter der Tabelle: links der Titel, je Spalte ein Wert (aus den Positionen des LV). */
export interface FussZeile { titel: string; wert: (s: BaumSpalte, positionen: Zeile[]) => JSX.Element | string; klasse?: string }

/** Kurzzeichen der Art wie im bisherigen Bauportal: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext. */
export const ART_KURZ: Record<string, string> = { normal: 'N', bedarf: 'E', alternativ: 'A', pauschal: 'P', stundenlohn: 'S', hinweis: 'H', vorbemerkung: 'V', zuschlag: 'Z', titel: '' };
const ARTEN_MENUE: [string, string][] = [['normal', 'Normal'], ['bedarf', 'Bedarf'], ['alternativ', 'Wahl'], ['pauschal', 'Pauschal'], ['stundenlohn', 'Stundenlohn'], ['hinweis', 'Hinweistext'], ['vorbemerkung', 'Vorbemerkung'], ['zuschlag', 'Zuschlag']];
const ART_AUS = Object.fromEntries(Object.entries(ART_KURZ).filter(([, k]) => k).map(([w, k]) => [k, w]));
export const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const zahlText = (w: unknown) => (w === null || w === undefined || w === '' ? '' : zahl(w).toLocaleString('de-DE', { maximumFractionDigits: 3 }));
/** Zahl aus einer Eingabe – null bei leer, Fehlertext, wenn es keine Zahl ist. */
export const zahlAus = (t: string): number | null | string => (!t.trim() ? null : /^-?[\d.\s]*,?\d*$/.test(t.trim()) ? zahl(t.replace(/\s/g, '')) : 'Bitte eine Zahl eintragen, z. B. 12,5');
const FREI = new Set<string>();   // freigeschaltete vergebene LVs – bis zum Neuladen
/** Die markierte Zeile – rechts steht dann ihre Karte (Eigenschaften der Position, wie im bisherigen Bauportal). */
export const [lvZeiger, setLvZeiger] = createSignal<string | null>(null);
// Blättern in der Karte (wie bisher „3 von 35“): durch die Positionen in der Reihenfolge, die der Baum gerade zeigt
const [lvReihe, setLvReihe] = createSignal<string[]>([]);
export const lvBlaettern = () => {
  const ids = lvReihe(), i = ids.indexOf(lvZeiger() ?? '');
  return i < 0 ? undefined : { nr: i + 1, anzahl: ids.length, onSchritt: (s: -1 | 1) => { const n = ids[i + s]; if (n) setLvZeiger(n); } };
};
const aendern = (id: string, werte: Record<string, Wert>, titel: string) => ausfuehren({ objekt: 'lv_position', art: 'aendern', objektId: id, werte }, titel);
const positionenDes = (lv: string, mitNachtraegen: boolean) => lebende('lv_position').filter((x) => x.werte.lv === lv && (mitNachtraegen || !x.werte.nachtrag));

// ---------- die Spalten des LV (LV bearbeiten) ----------
const kgNummer = (id: unknown) => String(sicht.kostengruppe?.[String(id ?? '')]?.werte.nummer ?? '');
export const LV_SPALTEN: BaumSpalte[] = [
  { id: 'menge', titel: 'Menge', breite: 70, rechts: true, wert: (q) => zahlText(q.werte.menge),
    setzen: (q, t) => { const n = zahlAus(t); if (typeof n === 'string') return n; aendern(q.id, { menge: n }, 'Menge'); } },
  { id: 'einheit', titel: 'EH', breite: 46, wert: (q) => (istZuschlag(q.werte.art) ? '%' : String(q.werte.einheit ?? '')), setzen: (q, t) => aendern(q.id, { einheit: t }, 'Einheit') },
  { id: 'art', titel: 'Art', breite: 38, hilfe: 'N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext', wert: (q) => ART_KURZ[String(q.werte.art ?? 'normal')] ?? '',
    setzen: (q, t) => { const w = ART_AUS[t.toUpperCase()]; if (!w) return 'Art: N Normal · E Bedarf · A Wahl · P Pauschal · S Stundenlohn · H Hinweistext'; aendern(q.id, { art: w }, 'Art'); } },
  { id: 'kg', titel: 'KG', breite: 48, hilfe: 'Kostengruppe nach DIN 276 – leer: wie das LV', wert: (q) => kgNummer(q.werte.kostengruppe) || kgNummer(sicht.lv?.[String(q.werte.lv)]?.werte.kostengruppe),
    klasse: (q) => (q.werte.kostengruppe ? undefined : 'geerbt'), roh: (q) => kgNummer(q.werte.kostengruppe),
    setzen: (q, t) => {
      if (!t) { aendern(q.id, { kostengruppe: null }, 'Kostengruppe'); return; }
      const kg = lebende('kostengruppe').find((k) => String(k.werte.nummer) === t);
      if (!kg) return `Kostengruppe ${t} gibt es nicht (DIN 276, z. B. 330).`;
      aendern(q.id, { kostengruppe: kg.id }, 'Kostengruppe');
    } },
  { id: 'ep', titel: 'EP (Schätzung)', breite: 110, rechts: true, wert: (q) => (q.werte.ep === null || q.werte.ep === undefined || q.werte.ep === '' ? '' : `${eur(zahl(q.werte.ep))}${istZuschlag(q.werte.art) ? ' %' : ''}`), roh: (q) => zahlText(q.werte.ep),
    setzen: (q, t) => { const n = zahlAus(t); if (typeof n === 'string') return n; aendern(q.id, { ep: n }, 'Einheitspreis'); } },
  { id: 'gp', titel: 'GP', breite: 108, rechts: true, wert: (q) => (zaehlt(q) ? (q.werte.ep === null || q.werte.ep === undefined || q.werte.ep === '' ? '' : eur(gpMit(q))) : istHinweis(q.werte.art) ? '' : 'ohne GP'),
    summe: summeGeschaetzt },
];

/** Breite der rechten Spalte mit den Knöpfen je Zeile (stil.css .lvt-aktionen) */
const AKTIONEN_BREITE = 92;

/** Eine Spalte des LV zum Ansehen in anderen Ansichten (Preisspiegel, Aufträge, Aufmaß) – aus: ab Werk ausgeblendet, in der Spaltenwahl einschaltbar. */
export const lvSpalteLesen = (id: string, aus = false): BaumSpalte => ({ ...LV_SPALTEN.find((x) => x.id === id)!, setzen: undefined, aus });

export interface LvBaumProps {
  m: Mitte; spalten: () => BaumSpalte[]; speicher: string;
  struktur?: boolean;                 // LV bearbeiten: neue Zeilen, Gliederung, Ziehen, Kopieren, Langtext, Löschen
  mitNachtraegen?: boolean;           // Nachtragspositionen an ihrer Stelle zeigen (Aufträge, Aufmaß)
  knoepfe?: () => Knopf[];            // weitere Knöpfe der Ansicht
  menue?: (pos: Zeile) => Menuepunkt[];   // weitere Punkte im Kontextmenü (vorne)
  fuss?: FussZeile[];                 // Zeilen unter der Tabelle (Summen, Nachlass, Wertung …)
  ohneHinweise?: boolean;             // Hinweistexte nicht zeigen (Preisspiegel)
  bezeichnung?: { darf: (pos: Zeile) => boolean; setzen: (pos: Zeile, text: string) => void };   // Bezeichnung ohne „struktur“ ändern (z. B. Nachtrag in den Aufträgen)
  oben?: (lv: Zeile) => JSX.Element;  // über der Tabelle (z. B. Hinweise)
}

/** LV bearbeiten: der LV-Baum mit den Spalten des LV und allem zum Gliedern. */
const SUMME: FussZeile = { titel: 'Summe netto (ohne Bedarfs-/Wahlpositionen)', wert: (s, pos) => { const n = s.summe?.(pos); return n === null || n === undefined ? '' : eur(n); } };
// Nachträge stehen wie bisher an ihrer Stelle im LV (orange, NT) – Preisspiegel und X83 lassen sie weg
export const LvBearbeiten = (m: Mitte) => <LvBaum m={m} spalten={() => LV_SPALTEN} speicher="bp_spalten_lv2" struktur mitNachtraegen fuss={[SUMME]} />;

export function LvBaum(p: LvBaumProps): JSX.Element {
  const lv = () => lvVon(p.m);
  const positionen = createMemo(() => (lv() ? positionenDes(lv()!.id, !!p.mitNachtraegen).filter((x) => !p.ohneHinweise || !istHinweis(x.werte.art)) : []));
  const zeilen = createMemo(() => lvZeilen(positionen()));
  createEffect(() => setLvReihe(zeilen().filter((z) => !z.titel).map((z) => z.id)));
  const nachZeile = createMemo(() => new Map(zeilen().map((z) => [z.id, z])));   // Zeilen über ihre Kennung – die Darstellung hängt an der Kennung, nicht am Objekt (sonst ginge ein offenes Feld bei jedem Abgleich verloren)
  const nachId = (id: string) => sicht.lv_position?.[id];
  // GAEB-Prüfhinweis (wie bisher in der Leiste): gleiche Tiefe der Positionen, höchstens 4 Ebenen, keine übersprungene Ebene
  // geprüft wird, was als GAEB hinausgeht: das LV ohne Nachträge (X83)
  const gaeb = createMemo(() => gaebPruefung(lvZeilen(positionen().filter((q) => !q.werte.nachtrag)), (id) => istHinweis(nachId(id)?.werte.art)));
  const [zu, setZu] = createSignal<Set<string>>(new Set());
  const [lvZu, setLvZu] = createSignal(false);
  const [lang, setLang] = createSignal<Set<string>>(new Set());
  // Suche im LV (wie bisher die Volltextsuche): OZ, Kurz- und Langtext; Treffer mit ihren Titeln, der Rest ist ausgeblendet
  const suche = avaSuchtext;   // die Suche der Ausschreibung links oben (avasuche.tsx) blendet im LV aus, was nicht passt
  const treffer = createMemo((): Set<string> | null => {
    const w = suchworte(suche()); if (!w.length) return null;
    const eltern = new Map(zeilen().map((z) => [z.id, z.eltern])), drin = new Set<string>();
    for (const z of zeilen()) {
      if (!passt({ ...nachId(z.id)?.werte, oz: z.oz }, w)) continue;
      for (let id: string | null | undefined = z.id; id; id = eltern.get(id)) drin.add(id);
    }
    return drin;
  });
  const sichtbar = createMemo(() => { if (lvZu()) return []; const t = treffer(); const aus: LvZeile[] = [], weg = new Set<string>(); for (const z of zeilen()) { if (t) { if (t.has(z.id)) aus.push(z); continue; } if (z.eltern && (weg.has(z.eltern) || zu().has(z.eltern))) { weg.add(z.id); continue; } aus.push(z); } return aus; });
  const [frei, setFrei] = createSignal(0);
  const maske = () => maskeLesen(lv()?.werte.oz_maske);
  const vergeben = () => lv()?.werte.status === 'vergeben' || lv()?.werte.status === 'abgerechnet';
  const gesperrt = () => { frei(); return vergeben() && !FREI.has(lv()?.id ?? ''); };
  const schreiben = () => darf('lv_position', 'schreiben') && !gesperrt();
  const wahl = zeilenwahl({ reihe: () => zeilen().map((z) => z.id), sichtbar: () => sichtbar().map((z) => z.id), onZeiger: (id) => { setLvZeiger(id); if (id && !p.m.gewaehlt() && lv()) p.m.onWahl(lv()!.id); } });
  // erste Spalte „Bezeichnung“ gehört dem Baustein; die übrigen bringt die Ansicht mit
  const BEZ: BaumSpalte = { id: 'kurztext', titel: 'Bezeichnung', breite: 380, wert: (q) => String(q.werte.kurztext ?? '') };
  const alleSpalten = () => [BEZ, ...p.spalten()];
  const spw = spaltenwahl(p.speicher, alleSpalten().filter((x) => !x.frei).map((x) => ({ ...x, name: x.id, inListe: !x.aus, fest: x.id === 'kurztext' })));
  // „Bezeichnung“ füllt den Platz, den die übrigen Spalten lassen – kein waagerechtes Rollen in der Standardbreite
  const [spaltenFeld, setSpaltenFeld] = createSignal<{ x: number; y: number } | null>(null);   // Spaltenwahl am Kopf (Rechtsklick), wie in jeder Tabelle
  const [platz, setPlatz] = createSignal(0);
  const spalten = () => {
    const l = [...spw.sichtbare().map((x) => ({ ...alleSpalten().find((s) => s.id === x.id)!, breite: spw.breite(x) })), ...p.spalten().filter((x) => x.frei)];
    const rest = l.reduce((n, s) => n + (s.id === 'kurztext' ? 0 : s.breite), 0) + (p.struktur ? AKTIONEN_BREITE : 0);
    return platz() ? l.map((s) => (s.id === 'kurztext' ? { ...s, breite: Math.max(220, platz() - rest) } : s)) : l;
  };
  const spalteVon = (id: string) => alleSpalten().find((s) => s.id === id);
  // Summen: Positionen unter einem Titel, eines LV, des ganzen Projekts
  const unterTitel = (t: LvZeile) => zeilen().filter((z) => !z.titel && z.oz.startsWith(`${t.oz}.`)).map((z) => nachId(z.id)!).filter(Boolean);
  const summeText = (s: BaumSpalte, pos: Zeile[]) => { const n = s.summe?.(pos); return n === null || n === undefined ? '' : eur(n); };
  const wert = (z: LvZeile, s: BaumSpalte): string => { const q = nachId(z.id); if (!q) return ''; return z.titel ? (s.id === 'kurztext' ? s.wert(q) : summeText(s, unterTitel(z))) : s.wert(q); };
  // die LVs des Projekts (das gewählte offen, die anderen als Ordner), das Archiv nur, wenn es gewählt ist
  const lvs = createMemo(() => lebende('lv').filter((l) => l.werte.projekt === projektId() && (!l.werte.archiviert || l.id === lv()?.id)).sort(lvFolge));
  const vorher = () => lvs().slice(0, Math.max(0, lvs().findIndex((l) => l.id === lv()?.id)));
  const nachher = () => lvs().slice(lvs().findIndex((l) => l.id === lv()?.id) + 1);
  const projekt = () => sicht.projekt?.[projektId() ?? ''];
  // das LV gilt als gewählt (wie bisher): rechts steht seine Karte, solange keine Zeile markiert ist
  createEffect(() => { const l = lv(); if (l && p.m.gewaehlt() !== l.id && p.m.alle().some((x) => x.id === l.id)) p.m.onWahl(l.id); });
  // ---------- Zellen bearbeiten ----------
  type Ed = { id: string; spalte: string; text: string; alles?: boolean };   // alles: Text markiert (neue Zeile – Tippen ersetzt den Vorschlag)
  const [edit, setEdit] = createSignal<Ed | null>(null);
  const [spalte, setSpalte] = createSignal('kurztext');
  const bearbeitbar = (z: LvZeile, s: string) => (s === 'oz' ? !!p.struktur : s === 'kurztext' ? !!p.struktur || (!!nachId(z.id) && !!p.bezeichnung?.darf(nachId(z.id)!)) : !z.titel && !!spalteVon(s)?.setzen);
  const uebernehmen = (): boolean => {
    const e = edit(); if (!e) return true;
    const q = nachId(e.id), z = nachZeile().get(e.id), t = e.text.trim();
    if (!q || !z) { setEdit(null); return true; }
    if (e.spalte === 'oz') {
      if (t === z.oz) { setEdit(null); return true; }
      if (!t) { hinweis('Die OZ darf nicht leer sein.', { art: 'fehler' }); return false; }
      if (zeilen().some((x) => x.oz === t && x.id !== e.id)) { hinweis(`Die OZ ${t} gibt es schon.`, { art: 'fehler' }); return false; }
      aendern(e.id, { oz: t }, 'OZ');
    } else if (e.spalte === 'kurztext') {
      if (t !== String(q.werte.kurztext ?? '')) { if (p.struktur || !p.bezeichnung) aendern(e.id, { kurztext: t }, 'Kurztext'); else p.bezeichnung.setzen(q, t); }
    } else {
      const s = spalteVon(e.spalte)!;
      if (t !== (s.roh ?? s.wert)(q).trim()) { const f = s.setzen!(q, t); if (f) { hinweis(f, { art: 'fehler' }); return false; } }
    }
    setEdit(null); return true;
  };
  const bearbeiten = (id: string, s: string, text?: string, alles = false) => {
    const z = nachZeile().get(id), q = nachId(id); if (!z || !q || !bearbeitbar(z, s) || (p.struktur ? !schreiben() : false)) return;
    const sp = spalteVon(s);
    setSpalte(s); wahl.setMarkiert(id); setEdit({ id, spalte: s, text: text ?? (s === 'oz' ? z.oz : sp ? (sp.roh ?? sp.wert)(q) : ''), alles });
  };
  // ---------- neue Zeilen, Gliederung, löschen, nummerieren (nur LV bearbeiten) ----------
  const neu = (titel: boolean) => {
    if (!schreiben() || !lv()) return;
    const nach = wahl.markiert(), id = neueKennung(), oz = neueOz(zeilen(), { nach, titel }, maske());
    ausfuehren({ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz, art: titel ? 'titel' : 'normal', kurztext: titel ? 'Neuer Gliederungspunkt' : 'Neue Position', menge: null, einheit: titel ? '' : 'Stk', ep: null } }, titel ? 'Gliederungspunkt einfügen' : 'Position einfügen');
    setLvZu(false); wahl.setMarkiert(id); queueMicrotask(() => bearbeiten(id, 'kurztext', undefined, true));
  };
  /** Neuer Gliederungspunkt eine Ebene unter der markierten Zeile – gewählte Positionen kommen hinein (wie bisher). */
  const gliederung = () => {
    if (!schreiben() || !lv()) return;
    const id = neueKennung(), r = gliederungEinfuegen(zeilen(), id, wahl.markiert(), wahl.gewaehlt(), maske().titel.length);
    if (typeof r === 'string') { hinweis(r, { art: 'fehler' }); return; }
    const oz = nummerieren(r, maske()), mit = r.filter((z) => z.eltern === id).length;
    ausfuehrenMehrere([{ objekt: 'lv_position', art: 'anlegen', objektId: id, werte: { projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz: oz.get(id) ?? '', art: 'titel', kurztext: 'Neuer Gliederungspunkt' } },
      ...[...oz].filter(([k]) => k !== id).map(([k, v]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: k, werte: { oz: v } }))], mit ? `Gliederungspunkt mit ${mit} ${mit === 1 ? 'Position' : 'Positionen'}` : 'Gliederungspunkt einfügen');
    if (mit) hinweis(`${mit === 1 ? 'Die Position steht' : `Die ${mit} Positionen stehen`} jetzt unter ${oz.get(id)} – rückgängig mit Strg+Z.`);
    setLvZu(false); wahl.setMarkiert(id); queueMicrotask(() => bearbeiten(id, 'kurztext', undefined, true));
  };
  const loeschen = () => {
    const ids = new Set(wahl.gewaehlt()); if (!p.struktur || !ids.size || !darf('lv_position', 'loeschen') || gesperrt()) return;
    for (const z of zeilen()) if (z.eltern && ids.has(z.eltern)) ids.add(z.id);   // ein Titel nimmt alles darunter mit
    ausfuehrenMehrere([...ids].map((id) => ({ objekt: 'lv_position', art: 'loeschen' as const, objektId: id })), ids.size === 1 ? 'Zeile löschen' : `${ids.size} Zeilen löschen`);
    hinweis(`${ids.size === 1 ? 'Zeile' : `${ids.size} Zeilen`} gelöscht.`);
    wahl.setMarkiert(null);
  };
  const [numFenster, setNumFenster] = createSignal(false);
  const neuNummerieren = (m: OzMaske) => {
    const n = nummerieren(zeilen(), m), alt = String(lv()?.werte.oz_maske ?? ''), neuM = maskeSchreiben(m);
    if (!n.size && alt === neuM) { hinweis('Die Ordnungszahlen stimmen schon.'); return; }
    ausfuehrenMehrere([...(alt !== neuM ? [{ objekt: 'lv', art: 'aendern' as const, objektId: lv()!.id, werte: { oz_maske: neuM } }] : []),
      ...[...n].map(([id, oz]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: id, werte: { oz } }))], 'Nummerieren');
    hinweis(n.size ? `${n.size} Ordnungszahl${n.size === 1 ? '' : 'en'} neu vergeben.` : 'OZ-Maske gemerkt – die Ordnungszahlen passen schon.');
  };
  const [vorbem, setVorbem] = createSignal(false);
  // ---------- Zeilen ziehen (an der OZ greifen) und Zwischenablage (Strg+C/X/V) ----------
  const ozSetzen = (neu: Map<string, string>, titel: string) => { if (neu.size) ausfuehrenMehrere([...neu].map(([id, oz]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: id, werte: { oz } })), titel); };
  // Ziehen (Baustein Zeilen ziehen): die ganze Zeile ist der Griff, mehrere gewählte wandern zusammen, Strg kopiert,
  // über einem zugeklappten Gliederungspunkt kurz stillhalten klappt ihn auf
  const [zug, setZug] = createSignal<{ ids: string[]; nach: string | null; y: number } | null>(null);
  const zugStart = (e: PointerEvent, id: string) => {
    if (e.button !== 0 || !p.struktur || !schreiben() || edit() || (e.target as Element).closest('input, textarea, button, .klappe')) return;
    const zeileUnter = (ev: PointerEvent) => (document.elementFromPoint(ev.clientX, ev.clientY) as Element | null)?.closest<HTMLElement>('.lvt-zeile[data-id]') ?? null;
    zeilenZiehen<{ nach: string | null; y: number }>({
      start: e, rollen: flaeche,
      ids: () => { if (!wahl.istGewaehlt(id)) wahl.setMarkiert(id); return wahl.gewaehlt(); },
      ziel: (ev) => {
        const r = zeileUnter(ev); if (!r) return null;
        const b = r.getBoundingClientRect(), unten = ev.clientY > b.top + b.height / 2, l = sichtbar(), i = l.findIndex((z) => z.id === r.dataset.id);
        return { nach: unten ? r.dataset.id! : l[i - 1]?.id ?? null, y: (unten ? b.bottom : b.top) - flaeche.getBoundingClientRect().top + flaeche.scrollTop };
      },
      onZug: (z) => setZug(z ? { ids: z.ids, ...z.ziel } : null),
      zu: (ev) => { const r = zeileUnter(ev); return r && zu().has(r.dataset.id!) ? r.dataset.id! : null; },
      aufklappen: (x) => umschalten(x),
      onAblegen: (z) => {
        if (z.kopie) { einfuegenAblage(ablageVon(z.ids), z.ziel.nach); return; }
        const neu = verschieben(zeilen(), z.ids, z.ziel.nach, maske());
        if (!neu.size) { hinweis('Dorthin geht es nicht – ein Titel lässt sich nicht in sich selbst ziehen.', { art: 'fehler' }); return; }
        ozSetzen(neu, z.ids.length === 1 ? 'Zeile verschieben' : `${z.ids.length} Zeilen verschieben`);
      },
    });
  };
  type Ablage = { titel: boolean; oz: string; werte: Record<string, Wert> }[];
  const KOPIERT = ['art', 'kurztext', 'langtext', 'menge', 'einheit', 'ep', 'kostengruppe'];
  /** Die Zeilen (mit allem unter ihren Titeln) als Ablage – zum Kopieren über die Zwischenablage oder beim Ziehen mit Strg. */
  const ablageVon = (gewaehlt: string[]): Ablage => {
    const ids = new Set(gewaehlt);
    for (const z of zeilen()) if (z.eltern && ids.has(z.eltern)) ids.add(z.id);
    return zeilen().filter((z) => ids.has(z.id)).map((z) => ({ titel: z.titel, oz: z.oz, werte: Object.fromEntries(KOPIERT.map((f) => [f, (nachId(z.id)?.werte[f] ?? null) as Wert])) }));
  };
  const kopieren = (weg = false) => {
    if (!wahl.gewaehlt().length) return;
    const a = ablageVon(wahl.gewaehlt());
    try { localStorage.setItem('bp.lv.ablage', JSON.stringify(a)); } catch { /* ohne Speicher */ }
    if (weg) loeschen(); else hinweis(`${a.length === 1 ? 'Zeile' : `${a.length} Zeilen`} kopiert – Strg+V fügt sie unter der markierten ein.`);
  };
  const einfuegen = () => { let a: Ablage = []; try { a = JSON.parse(localStorage.getItem('bp.lv.ablage') ?? '[]') as Ablage; } catch { /* unlesbar */ } einfuegenAblage(a, wahl.markiert()); };
  /** Ablage hinter „nach“ einfügen (Strg+V unter der markierten Zeile, Ziehen mit Strg an die Stelle der Einfügelinie). */
  const einfuegenAblage = (a: Ablage, nach: string | null) => {
    if (!a.length || !p.struktur || !schreiben() || !lv()) return;
    // vorläufige OZ „~k…“ (Gliederung bleibt), dann wie beim Ziehen hinter die markierte Zeile
    const wurzeln = a.filter((x) => !a.some((t) => t.titel && t !== x && x.oz.startsWith(`${t.oz}.`)));
    const neueIds = a.map(() => neueKennung()), vorl = a.map((x) => { const w = wurzeln.findIndex((r) => r === x || x.oz.startsWith(`${r.oz}.`)); return `~${w}${x.oz.slice(wurzeln[w]!.oz.length)}`; });
    const tmp = lvZeilen([...zeilen().map((z) => ({ id: z.id, werte: { oz: z.oz, art: z.titel ? 'titel' : 'normal' } })), ...a.map((x, i) => ({ id: neueIds[i]!, werte: { oz: vorl[i]!, art: x.titel ? 'titel' : 'normal' } }))]);
    const oz = verschieben(tmp, wurzeln.map((r) => neueIds[a.indexOf(r)]!), nach, maske());
    ausfuehrenMehrere(a.map((x, i) => ({ objekt: 'lv_position', art: 'anlegen' as const, objektId: neueIds[i]!, werte: { ...x.werte, projekt: lv()!.werte.projekt ?? null, lv: lv()!.id, oz: oz.get(neueIds[i]!) ?? vorl[i]! } })), a.length === 1 ? 'Zeile einfügen' : `${a.length} Zeilen einfügen`);
    wahl.mehrere(neueIds);
  };
  const [modellFenster, setModellFenster] = createSignal(false);
  const [neuFenster, setNeuFenster] = createSignal(false);
  p.m.setNeu(() => setNeuFenster(true));   // „LV“ unter Neu: Womit anfangen? (statt der leeren Karte)
  const freischalten = () => { const id = lv()?.id; if (!id) return; if (FREI.has(id)) FREI.delete(id); else FREI.add(id); setFrei(frei() + 1); };
  createEffect(() => p.m.setKnoepfe([
    ...(p.struktur && darf('lv_position', 'schreiben') && lv() ? [{ titel: 'Gliederung', zeichen: 'gruppe_neu', gruppe: 'Neu', gesperrt: gesperrt(), tun: gliederung },
      { titel: 'Position', zeichen: 'neu', gruppe: 'Neu', gesperrt: gesperrt(), tun: () => neu(false) },
      { titel: 'Aus dem Gebäudemodell …', zeichen: 'modell3d', gruppe: 'Neu', gesperrt: String(lv()!.werte.status ?? 'bearbeitung') !== 'bearbeitung', tun: () => setModellFenster(true) },
      { titel: 'Art', zeichen: 'bearbeiten', gruppe: 'Bearbeiten', gesperrt: gesperrt() || !artZeilen().length, tun: (e: MouseEvent) => zeigeMenue(e, ARTEN_MENUE.map(([w, t]) => ({ titel: `${t} (${ART_KURZ[w]})`, tun: () => artSetzen(w, t) }))) },
      { titel: 'Nummerieren …', zeichen: 'liste', gruppe: 'Bearbeiten', gesperrt: gesperrt() || !zeilen().length, tun: () => setNumFenster(true) },
      { titel: 'Löschen', zeichen: 'loeschen', rot: true, gruppe: 'Bearbeiten', gesperrt: gesperrt() || !wahl.markiert(), tun: loeschen }] : []),
    ...(p.knoepfe?.() ?? []),
    ...(p.struktur && lv() ? [{ titel: 'Vorbemerkungen', zeichen: 'bericht', gruppe: 'Ansicht', an: vorbem(), tun: () => setVorbem(!vorbem()) }] : []),
    ...(lv() ? [{ titel: 'Langtexte', zeichen: 'notiz', gruppe: 'Ansicht', an: lang().size > 0, tun: () => setLang(lang().size ? new Set<string>() : new Set(zeilen().filter((z) => !z.titel).map((z) => z.id))) }] : []),
    ...(p.struktur && lv() ? [
      ...(darf('lv_position', 'schreiben') ? [{ titel: 'Import', zeichen: 'import', gruppe: 'Datei', rechts: true, tun: (e: MouseEvent) => zeigeMenue(e, [
        { titel: 'GAEB (X83, X84 Angebot, X86) …', tun: () => gaebEinlesen(String(lv()!.werte.projekt), lv()!.id) }, { titel: 'Excel / CSV …', tun: () => lvExcelEinlesen(lv()!) }]) }] : []),
      { titel: 'Export', zeichen: 'export', gruppe: 'Datei', rechts: true, gesperrt: !zeilen().length, tun: (e: MouseEvent) => zeigeMenue(e, [
        { titel: 'GAEB X83', tun: () => gaebAusgeben(lv()!) }, { titel: 'Excel', tun: () => lvExcelAusgeben(lv()!) }]) },
      { titel: 'Drucken', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: () => druckOeffnen('ava.lv', lv()!.id) }] : []),
    ...(p.struktur && vergeben() ? [{ titel: gesperrt() ? 'Gesperrt' : 'Freigeschaltet', zeichen: 'schluessel', gruppe: 'Vertrag', an: !gesperrt(), tun: freischalten }] : []),
  ]));
  // ---------- Tastatur ----------
  let flaeche!: HTMLDivElement;
  onMount(() => { const r = new ResizeObserver(() => setPlatz(flaeche.clientWidth - 30)); r.observe(flaeche); onCleanup(() => r.disconnect()); });
  const bearbeitbareSpalten = (z: LvZeile) => spalten().map((x) => x.id).filter((x) => bearbeitbar(z, x));
  const taste = (e: KeyboardEvent) => {
    if (edit()) return;
    const l = sichtbar(), i = l.findIndex((z) => z.id === wahl.markiert()), m = l[i];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { if (e.shiftKey) wahl.erweitern(n.id); else wahl.setMarkiert(n.id); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); wahl.alle(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); einfuegen(); return; }
    if (e.key === 'Escape') { wahl.setMarkiert(m?.id ?? null); return; }
    if (!m) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && p.struktur) { e.preventDefault(); kopieren(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && p.struktur && schreiben()) { e.preventDefault(); kopieren(true); return; }
    if (e.key === 'Delete') { e.preventDefault(); loeschen(); return; }
    if (e.key === 'Insert' && p.struktur) { e.preventDefault(); neu(e.altKey); return; }
    if (e.key === 'ArrowLeft' && m.titel && !zu().has(m.id)) { setZu(new Set([...zu(), m.id])); return; }
    if (e.key === 'ArrowRight' && m.titel && zu().has(m.id)) { const n = new Set(zu()); n.delete(m.id); setZu(n); return; }
    const sp = bearbeitbar(m, spalte()) ? spalte() : bearbeitbareSpalten(m)[0];
    if (!sp) return;
    if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); bearbeiten(m.id, sp); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); bearbeiten(m.id, sp, e.key); }
  };
  const editTaste = (e: KeyboardEvent, z: LvZeile) => {
    e.stopPropagation();   // sonst bearbeitet die Fläche dieselbe Taste gleich noch einmal (Enter öffnet das nächste Feld)
    if (e.key === 'Escape') { e.preventDefault(); setEdit(null); flaeche.focus(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); const s = edit()!.spalte; if (!uebernehmen()) return;
      if (e.key === 'Enter') {   // wie Excel: dieselbe Spalte eine Zeile tiefer (in der Ansicht mit Preisen gleich weitertippen)
        const l = sichtbar(), n = l.slice(l.findIndex((x) => x.id === z.id) + 1).find((x) => bearbeitbar(x, s));
        if (n) { wahl.setMarkiert(n.id); if (!p.struktur) queueMicrotask(() => bearbeiten(n.id, s)); }
        flaeche.focus(); return;
      }
      const sp = bearbeitbareSpalten(z), k = sp[(sp.indexOf(s) + (e.shiftKey ? -1 : 1) + sp.length) % sp.length];
      if (k) bearbeiten(z.id, k);
    }
  };
  // Art für alle markierten Positionen auf einmal (wie bisher „Als Normal / Bedarf / Wahl …“) – Titel bleiben Titel
  const artZeilen = () => wahl.gewaehlt().map((id) => nachId(id)).filter((q): q is Zeile => !!q && q.werte.art !== 'titel');
  const artSetzen = (art: string, titel: string) => {
    const Z = artZeilen().filter((q) => q.werte.art !== art); if (!Z.length) return;
    ausfuehrenMehrere(Z.map((q) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: q.id, werte: { art } })), `${Z.length === 1 ? 'Position' : `${Z.length} Positionen`} als ${titel}`);
  };
  const menue = (e: MouseEvent, z: LvZeile) => {
    e.preventDefault(); if (!wahl.istGewaehlt(z.id)) wahl.setMarkiert(z.id);
    const q = nachId(z.id);
    zeigeMenue(e, [
      ...(q && p.menue ? p.menue(q) : []),
      ...(p.struktur && schreiben() ? (z.titel ? [{ titel: 'Position darin', tun: () => neu(false) }, { titel: 'Gliederungspunkt darin', tun: gliederung }]
        : [{ titel: 'Position darunter', tun: () => neu(false) }, { titel: 'Gliederungspunkt darunter', tun: () => neu(true) }]) : []),
      ...(p.struktur ? [{ titel: 'Kopieren', tun: () => kopieren() }, ...(schreiben() ? [{ titel: 'Einfügen darunter', tun: einfuegen }] : [])] : []),
      ...(!z.titel ? [{ titel: lang().has(z.id) ? 'Langtext zuklappen' : 'Langtext zeigen', tun: () => umschaltenLang(z.id) }] : []),
      ...(z.titel ? [{ titel: zu().has(z.id) ? 'Aufklappen' : 'Zuklappen', tun: () => umschalten(z.id) }] : []),
      ...(p.struktur && schreiben() && darf('lv_position', 'loeschen') ? [{ titel: wahl.gewaehlt().length > 1 ? `${wahl.gewaehlt().length} Zeilen löschen` : z.titel ? 'Gliederungspunkt mit Inhalt löschen' : 'Position löschen', gefahr: true, tun: loeschen }] : []),
    ]);
  };
  const umschalten = (id: string) => { const n = new Set(zu()); if (n.has(id)) n.delete(id); else n.add(id); setZu(n); };
  // wie bisher: ist genau ein Langtext offen – der der gewählten Zeile –, wandert er mit der Auswahl
  let vorige: string | null = null;
  createEffect(() => {
    const jetzt = lvZeiger(), offen = untrack(lang);
    if (jetzt && vorige && jetzt !== vorige && offen.size === 1 && offen.has(vorige) && !zeilen().find((z) => z.id === jetzt)?.titel) setLang(new Set([jetzt]));
    vorige = jetzt;
  });
  const umschaltenLang = (id: string) => { const n = new Set(lang()); if (n.has(id)) n.delete(id); else n.add(id); setLang(n); };
  const spaltenPassend = () => {
    const sp = spalten(), zellen: Parameters<typeof zusatzMessen>[0] = [], sb = sichtbar(), zelle = flaeche.querySelector('.lvt-zeile .lvt-zelle') ?? flaeche;
    flaeche.querySelectorAll('.lvt-zeilen .lvt-zeile[data-id]').forEach((r, k) => r.querySelectorAll(':scope > .lvt-zelle').forEach((el, i) => { const s = sp[i], z = sb[k]; if (s && z) zellen.push({ spalte: s.id, el, text: wert(z, s) }); }));
    spw.allePassend((n) => zeilen().map((z) => wert(z, spalteVon(n)!)), getComputedStyle(zelle).font, `600 13px ${getComputedStyle(flaeche).fontFamily}`, zusatzMessen(zellen, getComputedStyle(zelle).font));
  };
  // ---------- Zeilen über dem LV-Inhalt: Projekt und LVs ----------
  const lvTitel = (l: Zeile) => [l.werte.nummer, l.werte.name].filter(Boolean).join(' ');
  const lvHinweis = (l: Zeile) => {
    const auftrag = lebende('angebot').find((a) => a.werte.lv === l.id && a.werte.beauftragt === true);
    return [sicht.gewerk?.[String(l.werte.gewerk ?? '')]?.werte.name, { bearbeitung: 'Entwurf', versendet: 'versandt', vergeben: 'vergeben', abgerechnet: 'abgerechnet', aufgehoben: 'aufgehoben' }[String(l.werte.status ?? 'bearbeitung')],
      auftrag ? sicht.kontakt?.[String(auftrag.werte.bieter ?? '')]?.werte.name : undefined, l.werte.archiviert ? 'im Archiv' : undefined].filter(Boolean).join(' · ');
  };
  const OrdnerZeile = (z: { ebene: number; offen: boolean; text: JSX.Element; summe: (s: BaumSpalte) => string; klick: () => void; klasse: string; dbl?: () => void }) => (
    <div class={`lvt-zeile ${z.klasse}`} role="row" onClick={z.klick} onDblClick={z.dbl}>
      <For each={spalten()}>{(s) => (
        <div class="lvt-zelle" classList={{ rechts: !!s.rechts }} style={{ width: `${s.breite}px` }}>
          <Show when={s.id === 'kurztext'} fallback={z.summe(s)}>
            <span class="lvt-baum" style={{ 'padding-left': `${z.ebene * 16}px` }}><Klappe zu={!z.offen} onKlick={z.klick} /><Ordner offen={z.offen} />{z.text}</span>
          </Show>
        </div>)}</For>
      <Show when={p.struktur}><div class="lvt-zelle lvt-aktionen" /></Show>
    </div>
  );
  const LvOrdner = (l: Zeile) => (
    <OrdnerZeile ebene={1} offen={false} klasse="lvt-lv" klick={() => { wahl.setMarkiert(null); setLvZeiger(null); lvWaehlen(p.m, l.id); setLvZu(false); }}
      text={<><b>{lvTitel(l)}</b><span class="lvt-still">{lvHinweis(l)}</span></>} summe={(s) => summeText(s, positionenDes(l.id, !!p.mitNachtraegen))} />
  );
  // ---------- Rechte Spalte (wie bisher): Gliederungspunkt NT · ⇤ · ⇥ · Löschen; Position Eigenschaften · ¶ · Löschen ----------
  const ebene = (id: string, r: -1 | 1) => {
    const neu = ebeneAendern(zeilen(), id, r); if (!neu || gesperrt()) return;
    const n = nummerieren(neu, maske());
    ausfuehrenMehrere([...n].map(([x, oz]) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: x, werte: { oz } })), r < 0 ? 'Eine Ebene höher' : 'Eine Ebene tiefer');
  };
  /** NT: der Gliederungspunkt wird ein Nachtrag – er und alles darunter gehören dazu; noch einmal: wieder normale Positionen. */
  const nachtragTitel = (z: LvZeile) => {
    const q = nachId(z.id); if (!q || !lv()) return;
    const ids = mitUnterzeilen(zeilen(), z.id).map((x) => x.id), alt = q.werte.nachtrag ? String(q.werte.nachtrag) : null;
    if (alt) {
      const bleibt = lebende('lv_position').some((x) => x.werte.nachtrag === alt && !ids.includes(x.id));
      ausfuehrenMehrere([...ids.map((x) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: x, werte: { nachtrag: null } })),
        ...(bleibt ? [] : [{ objekt: 'nachtrag', art: 'loeschen' as const, objektId: alt }])], 'Nachtrag aufheben');
      return;
    }
    const { id, nr, befehl } = nachtragNeu(lv()!, String(q.werte.kurztext ?? ''));
    ausfuehrenMehrere([befehl,
      ...ids.map((x) => ({ objekt: 'lv_position', art: 'aendern' as const, objektId: x, werte: { nachtrag: id } }))], `Nachtrag ${nr}`);
  };
  const Aktionen = (z: LvZeile) => {
    const q = () => nachId(z.id), darfS = () => schreiben(), darfL = () => schreiben() && darf('lv_position', 'loeschen');
    const weg = () => { wahl.setMarkiert(z.id); loeschen(); };
    return z.titel ? <>
      <Show when={darfS() && darf('nachtrag', 'schreiben')}><button type="button" class="lvt-akt nt" classList={{ an: !!q()?.werte.nachtrag }} title={q()?.werte.nachtrag ? 'Nachtrag aufheben – die Positionen darunter werden wieder normale Positionen' : 'Diesen Gliederungspunkt als Nachtrag kennzeichnen – alle Positionen darunter gehören dann zum Nachtrag'} onClick={() => nachtragTitel(z)}>NT</button></Show>
      <Show when={darfS()}><button type="button" class="lvt-akt" title="eine Ebene höher (mit seinen Untertiteln)" disabled={!ebeneAendern(zeilen(), z.id, -1)} onClick={() => ebene(z.id, -1)}>⇤</button>
        <button type="button" class="lvt-akt" title="zum Untertitel machen – eine Ebene tiefer (GAEB: höchstens 4 Ebenen)" disabled={!ebeneAendern(zeilen(), z.id, 1)} onClick={() => ebene(z.id, 1)}>⇥</button></Show>
      <Show when={darfL()}><button type="button" class="lvt-akt" title="Gliederungspunkt mit Inhalt löschen" aria-label="Gliederungspunkt löschen" onClick={weg}><Zeichen name="loeschen" groesse={13} /></button></Show>
    </> : <>
      <button type="button" class="lvt-akt" title="Eigenschaften der Position (auch Doppelklick auf die OZ)" aria-label="Eigenschaften" onClick={() => { wahl.setMarkiert(z.id); setLvZeiger(z.id); p.m.onOeffnen(); }}><Zeichen name="bearbeiten" groesse={13} /></button>
      <button type="button" class="lvt-akt" classList={{ an: lang().has(z.id) || !!q()?.werte.langtext }} title="Langtext" onClick={() => umschaltenLang(z.id)}>¶</button>
      <Show when={darfL()}><button type="button" class="lvt-akt" title="Position löschen" aria-label="Position löschen" onClick={weg}><Zeichen name="loeschen" groesse={13} /></button></Show>
    </>;
  };
  const Art = (q: Zeile | undefined) => { const k = ART_KURZ[String(q?.werte.art ?? 'normal')] ?? 'N'; return <i class={`lvt-art a-${k}`} classList={{ nt: !!q?.werte.nachtrag }} aria-hidden="true">{k === 'N' || k === 'H' ? '' : k}</i>; };
  return (
    <div class="lvt" ref={flaeche} tabIndex={0} onKeyDown={taste} role="treegrid" aria-label="Leistungsverzeichnis">
      <Show when={p.struktur}><LvExcelFenster /></Show>
      <Show when={p.struktur && neuFenster() && projektId()}><NeuesLv projekt={projektId()!} onZu={() => setNeuFenster(false)} onFertig={(id, weg) => { lvWaehlen(p.m, id); setLvZu(false); if (weg === 'modell') setModellFenster(true); }} /></Show>
      <Show when={lv()} fallback={<p class="still-text">Noch kein Leistungsverzeichnis – oben unter Neu „LV“ anlegen.</p>}>
        <Show when={p.struktur && vorbem()}>
          <div class="lvt-vorbem"><label for="lvt-vorbem">Vorbemerkungen</label>
            <textarea id="lvt-vorbem" rows={6} value={String(lv()!.werte.vorbemerkungen ?? '')} readOnly={!darf('lv', 'schreiben') || gesperrt()} placeholder="Vorbemerkungen zum LV – gelten für alle Positionen (Baustelle, Ausführung, Abrechnung …)"
              onChange={(e) => ausfuehren({ objekt: 'lv', art: 'aendern', objektId: lv()!.id, werte: { vorbemerkungen: e.currentTarget.value } }, 'Vorbemerkungen')} /></div>
        </Show>
        <Show when={treffer()}><p class="still-text klein-text lvt-treffer">{[...treffer()!].filter((id) => !zeilen().find((z) => z.id === id)?.titel).length} Treffer für „{suche().trim()}“ in diesem LV</p></Show>
        <Show when={p.struktur}><LvQuellenLeiste lv={lv()!} /></Show>
        <Show when={p.struktur && gaeb().length}><div class="hinweis-kasten lvt-hinweis-oben lvt-gaeb" role="note"><b>GAEB-Prüfung:</b> <For each={gaeb()}>{(t) => <span>{t} </span>}</For></div></Show>
        {p.oben?.(lv()!)}
        <Show when={modellFenster()}><ModellInsLv lv={lv()!} onZu={() => setModellFenster(false)} /></Show>
        <Show when={numFenster()}><NummerierenFenster maske={maske()} beispiel={zeilen()} onZu={() => setNumFenster(false)} onFertig={(m) => { setNumFenster(false); neuNummerieren(m); }} /></Show>
        <Show when={p.struktur}><ErgaenzungFenster /></Show>
        <Show when={spaltenFeld()}>{(o) => <Spaltenfeld spalten={spw} ort={o()} onZu={() => setSpaltenFeld(null)} />}</Show>
        <div class="lvt-tabelle">
          <div class="lvt-zeile lvt-kopf" role="row" title="Rechtsklick: Spalten wählen und ordnen" onContextMenu={(e) => { e.preventDefault(); setSpaltenFeld({ x: e.clientX, y: e.clientY }); }}>
            <For each={spalten()}>{(s) =>  <div class="lvt-zelle" classList={{ rechts: !!s.rechts }} style={{ width: `${s.breite}px` }} role="columnheader" data-spalte={s.id} title={s.hilfe} {...(s.frei ? {} : spw.ziehbar(s.id))}>{s.kopf ? s.kopf() : s.titel}
              <i class="griff" aria-hidden="true" title="Ziehen: Breite ändern · Doppelklick: alle Spalten passend zum Inhalt" onPointerDown={(e) => { if (!s.frei) spw.breiteZiehen(e, s.id); }} onDblClick={(e) => { e.stopPropagation(); spaltenPassend(); }} /></div>}</For>
            <Show when={p.struktur}><div class="lvt-zelle lvt-aktionen" role="columnheader" aria-label="Aktionen" /></Show>
          </div>
          <div class="lvt-zeilen">
            <Show when={zug()}>{(g) => <div class="lvt-ziel" style={{ top: `${g().y - 1}px` }} />}</Show>
            <OrdnerZeile ebene={0} offen klasse="lvt-projekt" klick={() => {}} text={<><b>{[projekt()?.werte.nummer, projekt()?.werte.name].filter(Boolean).join(' ')}</b><span class="lvt-zahl">{lvs().length}</span></>}
              summe={(s) => summeText(s, lvs().flatMap((l) => positionenDes(l.id, !!p.mitNachtraegen)))} />
            <For each={vorher()}>{LvOrdner}</For>
            <OrdnerZeile ebene={1} offen={!lvZu()} klasse="lvt-lv offen" dbl={() => springeZu('lv', lv()!.id, { modul: 'ava', ansicht: 'lvs' })} klick={() => { if (lvZeiger() || wahl.markiert()) { wahl.setMarkiert(null); setLvZeiger(null); p.m.onWahl(lv()!.id); } else setLvZu(!lvZu()); }}
              text={<><b>{lvTitel(lv()!)}</b><span class="lvt-still">{lvHinweis(lv()!)}</span>
                <Show when={p.struktur && vergeben()}><button type="button" class="lvt-sperre" onClick={(e) => { e.stopPropagation(); freischalten(); }} title={gesperrt() ? 'Beauftragt – Positionen sind Vertragsinhalt. Klick schaltet das Bearbeiten frei.' : 'Bearbeiten freigeschaltet – Klick sperrt wieder'}>{gesperrt() ? '🔒' : '🔓'}</button></Show></>}
              summe={(s) => summeText(s, positionen())} />
            <For each={sichtbar().map((x) => x.id)} fallback={<Show when={!lvZu()}><p class="still-text lvt-leer">Noch keine Positionen. Mit „Gliederung“ und „Position“ oben anfangen, aus dem Gebäudemodell übernehmen oder eine GAEB-Datei einlesen.</p></Show>}>{(id) => { const z = () => nachZeile().get(id)!; return (<>
              <div class="lvt-zeile" data-id={id} role="row" aria-level={z().ebene + 3} aria-selected={wahl.istGewaehlt(z().id)} classList={{ titel: z().titel, gewaehlt: wahl.istGewaehlt(z().id) || wahl.markiert() === z().id, 'lvt-hinweis': istHinweis(nachId(z().id)?.werte.art), 'lvt-nt': !!nachId(z().id)?.werte.nachtrag }}
                onClick={(e) => { if (!edit()) wahl.klick(e, z().id); }} onContextMenu={(e) => menue(e, z())} onPointerDown={(e) => zugStart(e, id)}>
                <For each={spalten()}>{(s) => (
                   <div class={`lvt-zelle ${(!z().titel && nachId(id) && s.klasse?.(nachId(id)!)) || ''}`} role="gridcell" data-spalte={s.id} title={(!z().titel && nachId(id) && s.hinweis?.(nachId(id)!)) || undefined} classList={{ rechts: !!s.rechts, zeiger: wahl.markiert() === z().id && spalte() === s.id, ed: bearbeitbar(z(), s.id), 'mit-hinweis': !z().titel && !!nachId(id) && !!s.hinweis?.(nachId(id)!) }} style={{ width: `${s.breite}px` }}
                    onClick={() => setSpalte(s.id)} onDblClick={() => bearbeiten(z().id, s.id)}>
                    <Show when={edit()?.id === z().id && (edit()?.spalte === s.id || (s.id === 'kurztext' && edit()?.spalte === 'oz'))} fallback={
                      s.id === 'kurztext' ? <span class="lvt-baum" style={{ 'padding-left': `${(z().ebene + 2) * 16}px` }}>
                        <Show when={z().titel} fallback={<button type="button" class="lvt-lang-knopf" classList={{ an: lang().has(z().id) || !!nachId(z().id)?.werte.langtext }} title="Langtext" onClick={(e) => { e.stopPropagation(); umschaltenLang(z().id); }}>¶</button>}>
                          <Klappe zu={zu().has(z().id)} onKlick={() => umschalten(z().id)} /></Show>
                        <Show when={z().titel} fallback={Art(nachId(id))}><Zeichen name="gliederung" groesse={14} /></Show>
                        <span class="lvt-oz" title={p.struktur ? 'Zum Verschieben die Zeile greifen und ziehen (Strg: kopieren) · Doppelklick: OZ ändern' : undefined} onDblClick={(e) => { e.stopPropagation(); bearbeiten(id, 'oz'); }}>{z().oz}</span>
                        <span class="lvt-text">{wert(z(), s)}</span></span> : wert(z(), s)}>
                      <input class="lvt-edit" value={edit()!.text} aria-label={edit()!.spalte === 'oz' ? 'OZ' : s.titel} ref={(el) => queueMicrotask(() => { el.focus(); if (edit()?.alles) el.select(); else el.setSelectionRange(el.value.length, el.value.length); })}
                        onInput={(e) => setEdit({ ...edit()!, text: e.currentTarget.value })} onKeyDown={(e) => editTaste(e, z())} onBlur={() => { const e = edit(); if (e && e.id === id) uebernehmen(); }} />
                    </Show>
                  </div>)}</For>
                <Show when={p.struktur}><div class="lvt-zelle lvt-aktionen" role="gridcell" onClick={(e) => e.stopPropagation()}>{Aktionen(z())}</div></Show>
              </div>
              <Show when={!z().titel && lang().has(z().id)}>
                <div class="lvt-lang" style={{ 'padding-left': `${(z().ebene + 2) * 16 + 40}px` }}>
                  <textarea rows={5} value={String(nachId(z().id)?.werte.langtext ?? '')} readOnly={!p.struktur || !schreiben()} placeholder="Langtext – Leistungsbeschreibung, Material, Fabrikat, Ausführung, Abrechnung"
                    aria-label={`Langtext ${z().oz}`} onChange={(e) => aendern(z().id, { langtext: e.currentTarget.value }, 'Langtext')}
                    onContextMenu={(e) => { if (p.struktur && schreiben()) langtextMenue(e, e.currentTarget, (t) => aendern(z().id, { langtext: t }, 'Bietertextergänzung')); }} />
                </div>
              </Show>
            </>); }}</For>
            <For each={nachher()}>{LvOrdner}</For>
          </div>
          <div class="lvt-fuss">
            <For each={p.fuss ?? []}>{(f) => (
              <div class={`lvt-zeile ${f.klasse ?? ''}`} role="row">
                <For each={spalten()}>{(s, i) => <div class="lvt-zelle" classList={{ rechts: true }} style={{ width: `${s.breite}px` }} data-spalte={s.id}>{i() === 0 ? f.titel : f.wert(s, positionen())}</div>}</For>
                <Show when={p.struktur}><div class="lvt-zelle lvt-aktionen" /></Show>
              </div>)}</For>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Nummerieren: OZ-Maske wie in GAEB – Stellen je Titelebene, Stellen der Position, Schritt – mit Beispiel. */
function NummerierenFenster(p: { maske: OzMaske; beispiel: LvZeile[]; onZu: () => void; onFertig: (m: OzMaske) => void }) {
  const [titel, setTitel] = createSignal(p.maske.titel.join('.')), [pos, setPos] = createSignal(String(p.maske.position)), [schritt, setSchritt] = createSignal(String(p.maske.schritt));
  const m = () => maskeLesen(`${titel()}:${pos()}:${schritt()}`);
  const gueltig = () => maskeSchreiben(m()) === `${titel()}:${pos()}:${schritt()}`;
  const probe = () => { const n = nummerieren(p.beispiel, m()); return p.beispiel.slice(0, 4).map((z) => `${n.get(z.id) ?? z.oz}  ${z.titel ? 'Titel' : 'Position'}`); };
  return (
    <Dialog titel="Nummerieren" onAbbrechen={p.onZu} knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!gueltig()} onClick={() => p.onFertig(m())}>Nummerieren</button></>}>
      <p class="still-text">Die Ordnungszahlen werden in der jetzigen Reihenfolge neu vergeben. Die Maske wird am LV gemerkt und gilt auch für neue Zeilen.</p>
      <label class="feld"><span>Stellen je Titelebene (z. B. 2.2 – zwei Ebenen mit je zwei Stellen)</span><input value={titel()} onInput={(e) => setTitel(e.currentTarget.value.trim())} /></label>
      <label class="feld"><span>Stellen der Position</span><input value={pos()} inputmode="numeric" onInput={(e) => setPos(e.currentTarget.value.trim())} /></label>
      <label class="feld"><span>Schritt zwischen Positionen</span><input value={schritt()} inputmode="numeric" onInput={(e) => setSchritt(e.currentTarget.value.trim())} /></label>
      <Show when={gueltig()} fallback={<p class="fehler-text">Titelebenen 1 bis 4 Stellen (höchstens 4 Ebenen), Position 1 bis 6 Stellen, Schritt ab 1.</p>}>
        <p class="still-text">So sieht es aus: {probe().join(' · ')}</p>
      </Show>
    </Dialog>
  );
}
