// Balkenplan des Bauzeitenplans: links die Leistungstabelle, rechts die Balken – in der Mitte der üblichen Ansicht
// (Rahmen, Suche, Versionen, Karte und Anlegen kommen wie überall vom Baukasten). Gerechnet wird mit rechnung.ts,
// bearbeitet mit bearbeiten.ts; jede Handlung ist ein Schritt für Strg+Z.
// Bedienung wie gewohnt: Zelle anklicken und lostippen, F2, Enter/Tab/Esc; Einfg, Entf; Alt+Umschalt+Pfeile gliedern und
// verschieben; Balken ziehen (verschieben), rechte Kante ziehen (Dauer), Punkt am Balkenende auf einen anderen ziehen (verknüpfen).
import { Zeichen } from './baukasten/zeichen';
import { spaltenwahl } from './baukasten/spalten';
import { Klappe, Ordner } from './baukasten/baum';
import { Spaltenfeld } from './baukasten/spaltenfeld';
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { BUNDESLAENDER, isoAus, tagAus, wochentag } from '../module/bauzeitenplan/kalender';
import { abschnitteLesen, abschnitteSchreiben, type Art, type Termin } from '../module/bauzeitenplan/rechnung';
import { balkenFarbe, naechsterMontag as montag, planAus } from '../module/bauzeitenplan/plan';
import { dauerLesen, vorgaengerLesen, vorgaengerSchreiben } from '../module/bauzeitenplan/schreibweise';
import { einfuegen, gliedern, loeschen, verschieben, vorgaengerSetzen, type L, type V, type Vorlage } from '../module/bauzeitenplan/bearbeiten';
import { ausfuehren, ausfuehrenMehrere, geaendert, sicht } from './unterbau/abgleich';
import { darf, neueKennung, ruf } from './unterbau/api';
import type { Mitte } from './baukasten/anpassung';
import { hinweis } from './unterbau/meldungen';
import { zeigeMenue } from './baukasten/kontextmenue';
import { PlanDrucken } from './plandruck';
import { PlanAssistent } from './planassistent';
import { PlanHandy } from './planhandy';
import { herunterladen } from './baukasten/herunterladen';
import { csvAus, mspdiAus, planJsonAus } from '../module/bauzeitenplan/austausch';
import { vorschauZeigen, type Vorschau } from './uebernahme';
import { handy as geraetHandy } from './unterbau/geraet';

const H = 30, KOPF = 46;
type Spalte = { id: 'nr' | 'name' | 'dauer' | 'anfang' | 'ende' | 'vorg' | 'gewerk' | 'pct'; titel: string; breite: number; rechts?: boolean };
const SPALTEN: Spalte[] = [
  { id: 'nr', titel: 'Nr.', breite: 40, rechts: true }, { id: 'name', titel: 'Leistung', breite: 260 }, { id: 'dauer', titel: 'Dauer', breite: 70, rechts: true },
  { id: 'anfang', titel: 'Anfang', breite: 88 }, { id: 'ende', titel: 'Ende', breite: 88 }, { id: 'vorg', titel: 'Vorgänger', breite: 96 },
  { id: 'gewerk', titel: 'Gewerk', breite: 120 }, { id: 'pct', titel: '%', breite: 46, rechts: true },
];
const BEARBEITBAR = new Set(['name', 'dauer', 'anfang', 'vorg', 'gewerk', 'pct']);
const ZOOM = [3, 6, 12, 24, 40];   // Bildpunkte je Kalendertag
const tagname = (iso: string) => (iso ? `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][wochentag(tagAus(iso))]} ${kurz(iso)}` : '');
const kurz = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '');
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const naechsterMontag = () => montag(new Date().toLocaleDateString('sv'));
const merken = (k: string, w: unknown) => { try { localStorage.setItem(k, JSON.stringify(w)); } catch { /* ohne Speicher geht es auch */ } };
const holen = <T,>(k: string, d: T): T => { try { const x = localStorage.getItem(k); return x ? (JSON.parse(x) as T) : d; } catch { return d; } };

/** „16.11.2026“, „16.11.26“, „16.11.“ oder ISO → ISO; null, wenn nicht lesbar. */
export function datumLesen(t: string): string | null {
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(s);
  if (!m) return null;
  const j = !m[3] ? new Date().getFullYear() : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${j}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return isoAus(tagAus(iso)) === iso ? iso : null;
}

export function Balkenplan(p: Mitte) {
  const z = () => p.fest() as Record<string, Wert> & { projekt: string; version: string };
  const lebend = (o: string) => { geaendert(o); return untrack(() => Object.values(sicht[o] ?? {}).map((x) => unwrap(x)).filter((x) => !x.geloescht && x.werte.version === z().version)); };
  const schreiben = () => darf('vorgang', 'schreiben');
  // Zeilen bleiben Teil des Speichers (nicht ausgepackt): so folgt jede Zelle ihren Feldern
  const vorgaenge = createMemo(() => [...p.alle()].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)));
  const links = createMemo(() => lebend('verknuepfung'));
  const zp = createMemo(() => lebend('zeitplan')[0], undefined, { equals: false });   // dasselbe Objekt mit neuen Werten: trotzdem melden
  const [land] = createResource(() => z().projekt, (id) => ruf<{ land: string }>('/api/projekt/land', { projekt: id }).then((r) => r.land, () => ''));
  // Jede Version hat einen Kalender – fehlt er, legt ihn an, wer schreiben darf (einmal je Version)
  const angelegt = new Set<string>();
  createEffect(() => {
    const v = z().version;
    const ver = sicht.version?.[v];   // nur für eine Version, die es (noch) gibt – nicht für die gerade gelöschte
    if (zp() || !darf('zeitplan', 'schreiben') || angelegt.has(v) || !ver || ver.geloescht) return;
    angelegt.add(v);
    ausfuehren({ objekt: 'zeitplan', art: 'anlegen', objektId: neueKennung(), werte: { projekt: z().projekt, version: v, anfang: naechsterMontag(), arbeitswoche: '5', bundesland: '', notiz: '' } }, 'Kalender anlegen', true);
  });
    // Kalender, Terminrechnung und Zeilen – dieselbe Aufbereitung wie für Ausdruck und Export
  const plan = createMemo(() => planAus({ vorgaenge: vorgaenge(), links: links(), zeitplan: zp()?.werte, frei: lebend('freier_tag'), land: land() ?? '', heute: new Date().toLocaleDateString('sv') }));
  const kal = () => plan().kal;
  const erg = () => plan().erg;
  const V_ = (): V[] => vorgaenge().map((v) => ({ id: v.id, reihe: Number(v.werte.reihe ?? 0), ebene: Number(v.werte.ebene ?? 0) }));
  const L_ = (): L[] => links().map((l) => ({ id: l.id, von: String(l.werte.von), nach: String(l.werte.nach), art: (l.werte.art || 'ea') as Art, abstand: Number(l.werte.abstand ?? 0),
    vonAbschnitt: l.werte.von_abschnitt == null ? null : Number(l.werte.von_abschnitt), nachAbschnitt: l.werte.nach_abschnitt == null ? null : Number(l.werte.nach_abschnitt) }));
  const zu = () => ({ projekt: z().projekt, version: z().version });

  // Ansicht: eingeklappte Gruppen, Zoom, Pfeile, kritischer Weg, automatisch verknüpfen – je Gerät gemerkt
  const schl = () => `bzp.${z().version}`;
  const [eingeklappt, setEingeklappt] = createSignal<Set<string>>(new Set(holen<string[]>(`${schl()}.zu`, [])));
  createEffect(() => merken(`${schl()}.zu`, [...eingeklappt()]));
  const [zoom, setZoom] = createSignal<number>(holen('bzp.zoom', 2));
  const [pfeile, setPfeile] = createSignal<'markiert' | 'alle' | 'kritisch' | 'keine'>(holen('bzp.pfeile', 'markiert'));
  const [kritisch, setKritisch] = createSignal<boolean>(holen('bzp.kritisch', true));
  const [autom, setAutom] = createSignal<boolean>(holen('bzp.autom', true));
  createEffect(() => { merken('bzp.zoom', zoom()); merken('bzp.pfeile', pfeile()); merken('bzp.kritisch', kritisch()); merken('bzp.autom', autom()); });
  const px = () => ZOOM[zoom()] ?? 12;
  const [drucken, setDrucken] = createSignal(false);
  const [assi, setAssi] = createSignal(false);
  // Export als Datei (im Browser erzeugt) und Plan aus einer Datei einlesen (Vorschau wie jede Übernahme)
  let dateiWahl!: HTMLInputElement;
  const titel = () => { const pr = sicht.projekt?.[z().projekt]?.werte; return `Bauzeitenplan ${[pr?.nummer, pr?.name].filter(Boolean).join(' ')} ${sicht.version?.[z().version]?.werte.name ?? ''}`.trim(); };
  const speichern = (inhalt: string, endung: string, typ: string) => herunterladen(inhalt, `${titel()} ${new Date().toLocaleDateString('sv')}.${endung}`, typ);
  // Befehle des Balkenplans in der Menüleiste (Band) – wie im bisherigen Bauportal
  const PFEILE = [{ wert: 'markiert', titel: 'bei markierter' }, { wert: 'kritisch', titel: 'kritischer Weg' }, { wert: 'alle', titel: 'alle' }, { wert: 'keine', titel: 'keine' }] as const;
  p.setNeu(() => neuDarunter());
  // Bearbeiten und Gliederung im Band wie im bisherigen Bauportal – dieselben Befehle wie Tastatur und Kontextmenü
  const gliederung = (art: 'aus' | 'ein' | 'hoch' | 'runter') => {
    const id = markiert(); if (!id) return;
    const b = art === 'ein' ? gliedern(V_(), L_(), id, 1) : art === 'aus' ? gliedern(V_(), L_(), id, -1) : verschieben(V_(), id, art === 'hoch' ? -1 : 1);
    if (b) tun(b, art === 'ein' ? 'Einrücken' : art === 'aus' ? 'Ausrücken' : 'Verschieben');
  };
  createEffect(() => p.setKnoepfe([
    ...(schreiben() ? [
      { titel: 'Kopieren', zeichen: 'kopieren', gruppe: 'Bearbeiten', gesperrt: !markiert(), tun: kopieren },
      { titel: 'Ausschneiden', zeichen: 'ausschneiden', gruppe: 'Bearbeiten', gesperrt: !markiert() || !darf('vorgang', 'loeschen'), tun: ausschneiden },
      { titel: 'Einfügen', zeichen: 'einfuegen', gruppe: 'Bearbeiten', gesperrt: !ablage(), tun: ablageEinfuegen },
      { titel: 'Duplizieren', zeichen: 'duplizieren', gruppe: 'Bearbeiten', gesperrt: !markiert(), tun: duplizieren },
      { titel: 'Löschen', zeichen: 'loeschen', gruppe: 'Bearbeiten', gesperrt: !markiert() || !darf('vorgang', 'loeschen'), tun: () => entfernen() },
      { titel: 'Höher', zeichen: 'ausruecken', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('aus') },
      { titel: 'Tiefer', zeichen: 'einruecken', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('ein') },
      { titel: 'Nach oben', zeichen: 'nach_oben', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('hoch') },
      { titel: 'Nach unten', zeichen: 'nach_unten', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('runter') },
    ] : []),
    ...(schreiben() ? [{ titel: 'Verknüpfen', zeichen: 'verknuepfen', gruppe: 'Planen', gesperrt: !markiert() || vorgaenge()[0]?.id === markiert(), tun: mitVorigerVerknuepfen },
      { titel: 'Lösen', zeichen: 'entkoppeln', gruppe: 'Planen', gesperrt: !links().some((l) => l.werte.von === markiert() || l.werte.nach === markiert()), tun: verknuepfungenLoesen },
      { titel: 'Assistent', zeichen: 'assistent', gruppe: 'Planen', tun: () => setAssi(true) },
      { titel: 'Auto', zeichen: 'ablauf', gruppe: 'Planen', an: autom(), tun: () => setAutom(!autom()) }] : []),
    { titel: 'Krit. Weg', zeichen: 'kritisch', gruppe: 'Ansicht', an: kritisch(), tun: () => setKritisch(!kritisch()) },
    { titel: `Pfeile: ${PFEILE.find((x) => x.wert === pfeile())?.titel ?? ''}`, zeichen: 'pfeile', gruppe: 'Ansicht', tun: (e) => zeigeMenue(e, PFEILE.map((x) => ({ titel: `${x.wert === pfeile() ? '✓ ' : ''}Pfeile ${x.titel}`, tun: () => setPfeile(x.wert) }))) },
    { titel: 'Größer', zeichen: 'groesser', gruppe: 'Ansicht', gesperrt: zoom() === ZOOM.length - 1, tun: () => setZoom(zoom() + 1) },
    { titel: 'Kleiner', zeichen: 'kleiner', gruppe: 'Ansicht', gesperrt: zoom() === 0, tun: () => setZoom(zoom() - 1) },
    { titel: 'Spalten', zeichen: 'spalten', gruppe: 'Ansicht', tun: (e) => setSpaltenFeld({ x: e.clientX, y: e.clientY + 12 }) },
    { titel: 'Export', zeichen: 'export', gruppe: 'Datei', rechts: true, tun: (e) => austauschMenue(e) },
    ...(schreiben() ? [{ titel: 'Einlesen', zeichen: 'import', gruppe: 'Datei', rechts: true, tun: () => dateiWahl.click() }] : []),
    { titel: 'PDF', zeichen: 'pdf', gruppe: 'Ausgabe', rechts: true, tun: () => setDrucken(true) },
  ]));
  const austauschMenue = (e: MouseEvent) => zeigeMenue(e, [
    { titel: 'Excel / CSV', tun: () => speichern(csvAus(plan()), 'csv', 'text/csv;charset=utf-8') },
    { titel: 'MS Project (XML)', tun: () => speichern(mspdiAus(plan(), titel()), 'xml', 'application/xml') },
    { titel: 'Sicherung (.gantt)', tun: () => speichern(planJsonAus(plan(), titel(), (zp()?.werte ?? {}) as Record<string, Wert>, lebend('freier_tag')), 'gantt', 'application/json') },
  ]);
  const einlesen = async () => {
    const d = dateiWahl.files?.[0];
    dateiWahl.value = '';
    if (!d) return;
    const inhalt = await d.text();
    void vorschauZeigen({ titel: `Plan einlesen – ${d.name}`, wartetext: 'Die Datei wird gelesen und mit dieser Version verglichen …', fertig: 'Der Plan ist übernommen.' }, () => ruf<Vorschau>('/api/bauzeitenplan/einlesen', { version: z().version, inhalt }));
  };
  // Auf dem Handy nur Nummer und Leistung links – der Platz gehört den Balken
  const schmal = geraetHandy;
  const [handy, setHandy] = createSignal<'jetzt' | 'ablauf' | 'gewerke' | 'plan'>(holen('bzp.handy', 'jetzt'));
  createEffect(() => merken('bzp.handy', handy()));
  // Spalten wählen und ordnen: derselbe Baustein wie bei jeder Tabelle (Spaltenwahl, Spaltenfeld)
  const spw = spaltenwahl('bp_spalten_bauzeitenplan', SPALTEN.map((x) => ({ ...x, name: x.id, inListe: true, fest: x.id === 'nr' || x.id === 'name' })));
  const [spaltenFeld, setSpaltenFeld] = createSignal<{ x: number; y: number } | null>(null);
  const spalten = () => (schmal() ? SPALTEN.slice(0, 2).map((s) => (s.id === 'name' ? { ...s, breite: 150 } : s)) : spw.sichtbare().map((x) => ({ ...x, breite: spw.breite(x) })));

  const sichtbar = createMemo(() => {
    const t = erg().termine, zuSet = eingeklappt();
    const gefiltert = p.zeilen().length !== p.alle().length ? new Set(p.zeilen().map((x) => x.id)) : null;
    return vorgaenge().filter((v) => {
      if (gefiltert && !gefiltert.has(v.id)) return false;
      for (let e = t.get(v.id)?.eltern; e; e = t.get(e)?.eltern) if (zuSet.has(e)) return false;
      return true;
    });
  });
  createEffect(() => p.setReihe(sichtbar().map((v) => v.id)));   // die Karte blättert in der Reihenfolge des Plans
  const nrVon = (id: string) => erg().termine.get(id)?.nr ?? 0;
  const vorgaengerText = (id: string) => vorgaengerSchreiben(L_().filter((l) => l.nach === id).map((l) => ({ nr: nrVon(l.von), art: l.art, abstand: l.abstand })).sort((a, b) => a.nr - b.nr));

  // Zeitachse: vom Montag vor dem Anfang bis vier Wochen nach dem Ende
  const achse = createMemo(() => {
    const k = kal(), t = [...erg().termine.values()];
    let a = k.tag(0), e = k.tag(Math.max(1, erg().ende));
    for (const x of t) { a = Math.min(a, k.tag(x.s)); e = Math.max(e, k.tag(Math.max(x.s, x.f - 1))); }
    a -= 7 + wochentag(a - 7);
    return { t0: a, t1: e + 28 };
  });
  const x = (w: number) => (kal().tag(w) - achse().t0) * px();
  const xEnde = (s: number, f: number) => (f > s ? (kal().tag(f - 1) + 1 - achse().t0) * px() : x(s));
  const breiteL = () => spalten().reduce((s, c) => s + c.breite, 0);
  const breiteR = () => (achse().t1 - achse().t0 + 1) * px();

  // ---------- Tabelle: Zeiger, Bearbeiten ----------
  // Markieren zeigt die Karte rechts (wie bisher); Doppelklick, Umschalt+Enter oder „Informationen“ springen hinein
  const [markiert, markieren] = createSignal<string | null>(null);
  const setMarkiert = (id: string | null) => { markieren(id); p.onWahl(id); };
  createEffect(() => { const g = p.gewaehlt(); if (g && g !== untrack(markiert)) markieren(g); });   // z. B. Sprung aus der Suche
  const oeffnen = (id = markiert()) => { if (id) { setMarkiert(id); p.onWahl(id); p.onOeffnen(); } };
  const [spalte, setSpalte] = createSignal<Spalte['id']>('name');
  const [edit, setEdit] = createSignal<{ id: string | 'neu'; spalte: Spalte['id']; text: string } | null>(null);
  let flaeche!: HTMLDivElement;
  // Die Balkenfläche reicht immer bis unten: auch unter der letzten Leistung lässt sich eine neue aufziehen (sie kommt ans Ende)
  const [sichtHoehe, setSichtHoehe] = createSignal(0);
  onMount(() => { const ro = new ResizeObserver(() => setSichtHoehe(flaeche.clientHeight)); ro.observe(flaeche); onCleanup(() => ro.disconnect()); });
  const flaechenZeilen = () => Math.max(sichtbar().length + 1, Math.floor((sichtHoehe() - KOPF) / H));
  const zeileIndex = () => sichtbar().findIndex((v) => v.id === markiert());
  const waehle = (i: number) => {
    const l = sichtbar();
    if (!l.length) return;
    const k = Math.max(0, Math.min(l.length - 1, i));
    setMarkiert(l[k]!.id);
    const y = KOPF + k * H;
    if (y < flaeche.scrollTop + KOPF) flaeche.scrollTop = y - KOPF;
    else if (y + H > flaeche.scrollTop + flaeche.clientHeight) flaeche.scrollTop = y + H - flaeche.clientHeight;
  };
  const wert = (v: Zeile, s: Spalte['id']): string => {
    const t = erg().termine.get(v.id);
    switch (s) {
      case 'nr': return String(t?.nr ?? '');
      case 'name': return String(v.werte.name ?? '');
      case 'dauer': return t ? `${t.gruppe ? t.f - t.s : abschnitteLesen(v.werte.unterbrechung as string)?.reduce((a, b) => a + b.dauer, 0) ?? Number(v.werte.dauer ?? 0)} T` : '';
      case 'anfang': return kurz(t?.anfang ?? '');
      case 'ende': return kurz(t?.ende ?? '');
      case 'vorg': return vorgaengerText(v.id);
      case 'gewerk': return String(v.werte.gewerk ?? '');
      case 'pct': return v.werte.fortschritt ? `${v.werte.fortschritt}` : '';
    }
  };
  const bearbeiten = (id: string | 'neu', s: Spalte['id'], start?: string) => {
    if (!schreiben() || !BEARBEITBAR.has(s)) return;
    const v = id === 'neu' ? undefined : vorgaenge().find((x) => x.id === id);
    if (id === 'neu' && s !== 'name') s = 'name';
    const roh = !v ? '' : s === 'dauer' ? String(v.werte.dauer ?? '') : s === 'anfang' ? kurz(String(v.werte.anfang_nicht_vor ?? '')) || kurz(erg().termine.get(v.id)?.anfang ?? '') : s === 'pct' ? String(v.werte.fortschritt ?? '') : wert(v, s);
    setSpalte(s);
    setEdit({ id, spalte: s, text: start ?? roh });
  };
  const fehler = (t: string) => { hinweis(t, { art: 'fehler' }); return false; };
  /** Eingabe übernehmen – false, wenn sie nicht lesbar ist (dann bleibt das Feld offen). */
  const uebernehmen = (): boolean => {
    const e = edit();
    if (!e) return true;
    const text = e.text.trim();
    if (e.id === 'neu') {
      if (text) { const r = einfuegen(V_(), L_(), vorgaenge().length, { name: text }, zu(), neueKennung, autom()); ausfuehrenMehrere(r.befehle, `Leistung „${text}“ anlegen`); setMarkiert(r.id); }
      setEdit(null); return true;
    }
    const v = vorgaenge().find((x) => x.id === e.id);
    if (!v) { setEdit(null); return true; }
    const t = erg().termine.get(v.id)!, name = String(v.werte.name ?? '');
    const aendern = (werte: Record<string, Wert>, titel: string) => ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte }, `${titel} von „${name}“ ändern`);
    switch (e.spalte) {
      case 'name': if (!text) return fehler('Die Leistung braucht eine Bezeichnung'); if (text !== name) aendern({ name: text }, 'Bezeichnung'); break;
      case 'gewerk': if (text !== String(v.werte.gewerk ?? '')) aendern({ gewerk: text }, 'Gewerk'); break;
      case 'pct': { const n = text ? Number(text.replace(',', '.').replace('%', '')) : 0; if (!Number.isFinite(n) || n < 0 || n > 100) return fehler('% abgeschlossen: eine Zahl von 0 bis 100'); if (n !== Number(v.werte.fortschritt ?? 0)) aendern({ fortschritt: Math.round(n) }, '% abgeschlossen'); break; }
      case 'dauer': {
        if (t.gruppe) return fehler('Die Dauer einer Gruppe ergibt sich aus ihren Leistungen');
        const d = dauerLesen(text, kal().woche);
        if (d === null) return fehler('Dauer: z. B. 5, 5t, 2w oder 0 für einen Meilenstein');
        const ab = abschnitteLesen(v.werte.unterbrechung as string);
        if (ab) {   // unterbrochen: der Unterschied geht auf den letzten Abschnitt
          const rest = d - ab.slice(0, -1).reduce((s, x) => s + x.dauer, 0);
          aendern(rest > 0 ? { dauer: d, unterbrechung: abschnitteSchreiben([...ab.slice(0, -1), { ...ab[ab.length - 1]!, dauer: rest }]) } : { dauer: d, unterbrechung: '' }, 'Dauer');
        } else if (d !== Number(v.werte.dauer ?? 0)) aendern({ dauer: d }, 'Dauer');
        break;
      }
      case 'anfang': {
        if (!text) { if (v.werte.anfang_nicht_vor) aendern({ anfang_nicht_vor: null }, 'Anfang'); break; }
        const d = datumLesen(text);
        if (!d) return fehler('Anfang: Datum wie 16.11.2026');
        if (t.gruppe) return fehler('Den Anfang einer Gruppe bestimmen ihre Leistungen');
        if (d !== v.werte.anfang_nicht_vor) aendern({ anfang_nicht_vor: d }, 'Anfang');
        break;
      }
      case 'vorg': {
        const l = vorgaengerLesen(text, kal().woche);
        if (!l) return fehler('Vorgänger: Zeilennummern mit ; getrennt, z. B. 3;4AA+2t;5EE-1t');
        try { ausfuehrenMehrere(vorgaengerSetzen(V_(), L_(), v.id, l, zu(), neueKennung), `Vorgänger von „${name}“ ändern`); }
        catch (x) { return fehler((x as Error).message); }
        break;
      }
      default: break;
    }
    setEdit(null);
    return true;
  };
  const tun = (b: Vorlage[], titel: string) => { if (b.length) ausfuehrenMehrere(b, titel); };
  // Neue Leistung: wie üblich unterhalb der markierten (ohne Markierung am Ende)
  const neuDarunter = (werte: Record<string, Wert> = {}, unter = markiert(), verknuepfen = autom()) => {
    if (!schreiben()) return;
    const i = unter ? vorgaenge().findIndex((v) => v.id === unter) + 1 : 0;
    const r = einfuegen(V_(), L_(), i <= 0 ? vorgaenge().length : i, { name: 'Neue Leistung', ...werte }, zu(), neueKennung, verknuepfen);
    tun(r.befehle, 'Leistung einfügen');
    setMarkiert(r.id);
    queueMicrotask(() => bearbeiten(r.id, 'name'));
  };
  // Zwischenablage für Leistungen (Kopieren/Ausschneiden → Einfügen unterhalb der markierten), wie im bisherigen Bauportal
  const KOPIERT = ['name', 'dauer', 'anfang_nicht_vor', 'unterbrechung', 'gewerk', 'vob', 'unternehmer', 'firma', 'farbe', 'notiz'];
  const [ablage, setAblage] = createSignal<Record<string, Wert> | null>(null);
  const werteVon = (id = markiert()) => { const v = vorgaenge().find((x) => x.id === id); return v ? Object.fromEntries(KOPIERT.map((k) => [k, v.werte[k] ?? null])) : null; };
  const kopieEinfuegen = (werte: Record<string, Wert>, titel: string) => {
    if (!schreiben()) return;
    const i = markiert() ? vorgaenge().findIndex((v) => v.id === markiert()) + 1 : vorgaenge().length;
    const r = einfuegen(V_(), L_(), i, werte, zu(), neueKennung, autom());
    tun(r.befehle, titel); setMarkiert(r.id);
  };
  const kopieren = () => setAblage(werteVon());
  const ausschneiden = () => { const w = werteVon(); if (w) { setAblage(w); entfernen(); } };
  const ablageEinfuegen = () => { const w = ablage(); if (w) kopieEinfuegen(w, `„${String(w.name ?? '')}“ einfügen`); };
  const duplizieren = () => { const w = werteVon(); if (w) kopieEinfuegen(w, `„${String(w.name ?? '')}“ duplizieren`); };
  // Verknüpfen: die markierte Leistung folgt der darüber (Ende–Anfang); Lösen: alle Verknüpfungen der markierten entfernen
  const mitVorigerVerknuepfen = () => {
    const i = vorgaenge().findIndex((v) => v.id === markiert()); const vor = vorgaenge()[i - 1], v = vorgaenge()[i];
    if (!v || !vor || links().some((l) => l.werte.von === vor.id && l.werte.nach === v.id)) return;
    ausfuehren({ objekt: 'verknuepfung', art: 'anlegen', objektId: neueKennung(), werte: { ...zu(), von: vor.id, nach: v.id, art: 'ea', abstand: 0, von_abschnitt: null, nach_abschnitt: null, kennung: '' } }, `„${String(vor.werte.name ?? '')}“ mit „${String(v.werte.name ?? '')}“ verknüpfen`);
  };
  const verknuepfungenLoesen = () => {
    const id = markiert(); const weg = links().filter((l) => l.werte.von === id || l.werte.nach === id);
    if (weg.length) ausfuehrenMehrere(weg.map((l) => ({ objekt: 'verknuepfung', art: 'loeschen' as const, objektId: l.id })), 'Verknüpfungen lösen');
  };
  const entfernen = (id = markiert()) => {
    if (!id || !darf('vorgang', 'loeschen')) return;
    const i = zeileIndex(), name = String(vorgaenge().find((v) => v.id === id)?.werte.name ?? '');
    tun(loeschen(V_(), L_(), [id], zu(), neueKennung, autom()), `„${name}“ löschen`);
    queueMicrotask(() => waehle(i));
  };
  const umschalten = (id: string) => setEingeklappt((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const taste = (e: KeyboardEvent) => {
    if (edit() || (e.target as HTMLElement).closest('input, select, .bzp-leiste')) return;
    const i = zeileIndex(), c = spalten().findIndex((s) => s.id === spalte()), id = markiert();
    const k = e.key;
    if (e.altKey && e.shiftKey && id && schreiben()) {
      const b = k === 'ArrowRight' ? gliedern(V_(), L_(), id, 1) : k === 'ArrowLeft' ? gliedern(V_(), L_(), id, -1) : k === 'ArrowUp' ? verschieben(V_(), id, -1) : k === 'ArrowDown' ? verschieben(V_(), id, 1) : null;
      if (b) { e.preventDefault(); tun(b, k === 'ArrowRight' ? 'Einrücken' : k === 'ArrowLeft' ? 'Ausrücken' : 'Verschieben'); }
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); waehle(i + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); waehle(i - 1); }
    else if (k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); setSpalte(spalten()[Math.min(spalten().length - 1, c + 1)]!.id); }
    else if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); setSpalte(spalten()[Math.max(0, c - 1)]!.id); }
    else if (k === 'Home') { e.preventDefault(); waehle(0); }
    else if (k === 'End') { e.preventDefault(); waehle(sichtbar().length - 1); }
    else if (k === 'Insert') { e.preventDefault(); neuDarunter(); }
    else if (k === 'Delete' && id) { e.preventDefault(); entfernen(); }
    else if ((k === 'Enter' || k === 'F2') && id) { e.preventDefault(); if (e.shiftKey || spalte() === 'nr') oeffnen(); else bearbeiten(id, spalte()); }
    else if (k === ' ' && id && erg().termine.get(id)?.gruppe && spalte() === 'name') { e.preventDefault(); umschalten(id); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && id) { e.preventDefault(); bearbeiten(id, spalte(), k); }
  };
  const eingabeTaste = (e: KeyboardEvent) => {
    e.stopPropagation();
    const ed = edit()!;
    if (e.key === 'Escape') { e.preventDefault(); setEdit(null); flaeche.focus(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const i = zeileIndex();
      if (!uebernehmen()) return;
      flaeche.focus();
      if (ed.id === 'neu') { queueMicrotask(() => bearbeiten('neu', 'name')); return; }
      if (e.key === 'Enter') waehle(i + 1);
      else { const c = spalten().findIndex((s) => s.id === ed.spalte); setSpalte(spalten()[Math.max(0, Math.min(spalten().length - 1, c + (e.shiftKey ? -1 : 1)))]!.id); }
    }
  };

  // ---------- Balken mit der Maus ----------
  const [ziehen, setZiehen] = createSignal<{ id: string; art: 'schieben' | 'dauer' | 'link' | 'neu'; x0: number; dx: number; y: number; yMaus: number; xs?: number; teil?: number | null } | null>(null);
  const tageAus = (dx: number) => Math.round(dx / px());
  const startZiehen = (e: PointerEvent, v: Zeile, art: 'schieben' | 'dauer' | 'link', y: number, teil: number | null = null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMarkiert(v.id);
    if (!schreiben() || erg().termine.get(v.id)?.gruppe && art !== 'link') return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setZiehen({ id: v.id, art, x0: svgX(e.clientX), dx: 0, y, yMaus: y, teil });
    mitrollen(e.clientX);
  };
  // Auf freier Fläche ziehen: neue Leistung vom ersten bis zum letzten überstrichenen Tag – unter der Zeile, in der gezogen wird
  const aufziehen = (e: PointerEvent) => {
    if (e.button !== 0 || !schreiben() || (e.target as Element).closest('.bzp-balken-teil, .bzp-meilenstein, .bzp-griff, .bzp-punkt')) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setZiehen({ id: '', art: 'neu', x0: svgX(e.clientX), dx: 0, y: Math.floor((e.clientY - r.top) / H) * H, yMaus: e.clientY - r.top, xs: e.clientX - r.left });
    mitrollen(e.clientX);
  };
  const aufgezogen = (g: { x0: number; dx: number; y: number; xs?: number }) => {
    const a = Math.min(g.xs!, g.xs! + g.dx), b = Math.max(g.xs!, g.xs! + g.dx);
    return { t0: achse().t0 + Math.floor(a / px()), t1: achse().t0 + Math.floor(b / px()) };
  };
  const svgY = (e: PointerEvent) => e.clientY - (flaeche.querySelector('.bzp-balken') as SVGElement).getBoundingClientRect().top;
  // Gezogen wird in Koordinaten der Balkenfläche: rollt sie mit, wandert der Balken weiter
  const svgX = (clientX: number) => clientX - (flaeche.querySelector('.bzp-balken') as SVGElement).getBoundingClientRect().left;
  let mausX = 0;
  const bewegen = (e: PointerEvent) => { mausX = e.clientX; const g = ziehen(); if (g) setZiehen({ ...g, dx: svgX(e.clientX) - g.x0, yMaus: svgY(e) }); };
  /** Am Rand der Fläche rollt sie beim Ziehen mit – sonst ginge es nur so weit, wie gerade zu sehen ist. */
  const mitrollen = (start: number) => {
    mausX = start;
    const schritt = () => {
      const g = ziehen(); if (!g) return;
      const r = flaeche.getBoundingClientRect(), links = Math.max(r.left, r.left + breiteL() - flaeche.scrollLeft), RAND = 40;
      const d = mausX > r.right - RAND ? Math.ceil((mausX - (r.right - RAND)) / 3) : mausX < links + RAND ? -Math.ceil((links + RAND - mausX) / 3) : 0;
      if (d) { const vor = flaeche.scrollLeft; flaeche.scrollLeft += d; if (flaeche.scrollLeft !== vor) setZiehen({ ...g, dx: svgX(mausX) - g.x0 }); }
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  };
  const loslassen = (e: PointerEvent) => {
    const g = ziehen();
    setZiehen(null);
    if (!g) return;
    if (g.art === 'neu') {
      if (Math.abs(g.dx) < px()) return;   // nur geklickt
      const k = kal(), { t0, t1 } = aufgezogen(g), w0 = k.arbeitstag(t0), w1 = k.arbeitstag(t1 + 1);
      // Aufgezogen heißt: genau dort – ohne automatische Verknüpfung, die den Anfang wieder verschieben würde
      return neuDarunter({ anfang_nicht_vor: isoAus(k.tag(w0)), dauer: Math.max(1, w1 - w0) }, sichtbar()[g.y / H]?.id ?? vorgaenge()[vorgaenge().length - 1]?.id, false);
    }
    const v = vorgaenge().find((x) => x.id === g.id), t = erg().termine.get(g.id);
    if (!v || !t) return;
    const k = kal(), name = String(v.werte.name ?? '');
    if (g.art === 'link') {
      const ziel = sichtbar()[Math.floor(svgY(e) / H)];
      if (!ziel || ziel.id === v.id) return;
      // Ziel bei einem geteilten Vorgang: der Teil unter der Maus (oder der nächste) – sonst der ganze Vorgang
      const zt = erg().termine.get(ziel.id), mx = svgX(e.clientX);
      const nachTeil = zt && zt.abschnitte.length > 1 ? zt.abschnitte.map((a, k) => ({ k, d: mx < x(a.s) ? x(a.s) - mx : mx > xEnde(a.s, a.f) ? mx - xEnde(a.s, a.f) : 0 })).sort((p, q) => p.d - q.d)[0]!.k : null;
      const vonTeil = g.teil ?? null;
      if (L_().some((l) => l.von === v.id && l.nach === ziel.id && (l.vonAbschnitt ?? null) === vonTeil && (l.nachAbschnitt ?? null) === nachTeil)) return hinweis('Diese Verknüpfung gibt es schon');
      ausfuehren({ objekt: 'verknuepfung', art: 'anlegen', objektId: neueKennung(), werte: { ...zu(), von: v.id, nach: ziel.id, art: 'ea', abstand: 0, von_abschnitt: vonTeil, nach_abschnitt: nachTeil, kennung: '' } }, `„${name}“ mit „${ziel.werte.name}“ verknüpfen`);
      return;
    }
    const d = tageAus(g.dx);
    if (!d) return;
    if (g.art === 'schieben') {
      const neu = k.arbeitstag(k.tag(t.s) + d);
      ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { anfang_nicht_vor: isoAus(k.tag(neu)) } }, `„${name}“ verschieben`);
    } else {
      const endeTag = (t.f > t.s ? k.tag(t.f - 1) : k.tag(t.s) - 1) + d;
      const f = k.arbeitstag(endeTag + 1);
      const dauer = Math.max(0, f - t.s - (abschnitteLesen(v.werte.unterbrechung as string) ? t.f - t.s - Number(v.werte.dauer ?? 0) : 0));
      ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { dauer, ...(abschnitteLesen(v.werte.unterbrechung as string) ? { unterbrechung: '' } : {}) } }, `Dauer von „${name}“ ändern`);
    }
  };
  const verschiebung = (id: string) => { const g = ziehen(); return g && g.id === id && g.art === 'schieben' ? tageAus(g.dx) * px() : 0; };
  const verlaengerung = (id: string) => { const g = ziehen(); return g && g.id === id && g.art === 'dauer' ? tageAus(g.dx) * px() : 0; };

  // ---------- Pfeile ----------
  const pfeilListe = createMemo(() => {
    const m = pfeile(), sel = markiert(), t = erg().termine, zeile = new Map(sichtbar().map((v, i) => [v.id, i]));
    if (m === 'keine') return [];
    return L_().filter((l) => zeile.has(l.von) && zeile.has(l.nach) && (m === 'alle' || (m === 'kritisch' ? t.get(l.von)?.kritisch && t.get(l.nach)?.kritisch : l.von === sel || l.nach === sel)))
      .map((l) => {
        // Pfeile an geteilten Vorgängen: vom bzw. zum gewählten Teil, sonst vom ganzen Vorgang
        const teil = (tm: { s: number; f: number; abschnitte: { s: number; f: number }[] }, k: number | null | undefined) => (k != null && tm.abschnitte[k]) || tm;
        const a = teil(t.get(l.von)!, l.vonAbschnitt), b = teil(t.get(l.nach)!, l.nachAbschnitt), ya = zeile.get(l.von)! * H + H / 2, yb = zeile.get(l.nach)! * H + H / 2;
        const vonEnde = l.art === 'ea' || l.art === 'ee', nachEnde = l.art === 'ee' || l.art === 'ae';
        const x1 = vonEnde ? xEnde(a.s, a.f) : x(a.s), x2 = nachEnde ? xEnde(b.s, b.f) : x(b.s);
        const knick = vonEnde ? x1 + 6 : x1 - 6, rein = nachEnde ? x2 + 6 : x2 - 6;
        return { id: l.id, d: `M${x1},${ya} H${knick} V${yb} H${rein} L${x2},${yb}`, kritisch: !!(t.get(l.von)!.kritisch && t.get(l.nach)!.kritisch), x2, yb, links: !nachEnde };
      });
  });
  const linkMenue = (e: MouseEvent, id: string) => {
    if (!schreiben()) return;
    const l = links().find((x) => x.id === id);
    if (!l) return;
    zeigeMenue(e, [
      ...(['ea', 'aa', 'ee', 'ae'] as Art[]).map((a) => ({ titel: `Art: ${a.toUpperCase()}`, gesperrt: l.werte.art === a, tun: () => ausfuehren({ objekt: 'verknuepfung', art: 'aendern', objektId: id, werte: { art: a } }, 'Art der Verknüpfung ändern') })),
      { titel: 'Verknüpfung löschen', gefahr: true, tun: () => ausfuehren({ objekt: 'verknuepfung', art: 'loeschen', objektId: id }, 'Verknüpfung löschen') },
    ]);
  };
  const balkenMenue = (e: MouseEvent, v: Zeile) => {
    setMarkiert(v.id);
    zeigeMenue(e, [
      { titel: 'Informationen …', tun: () => oeffnen(v.id) },
      ...(schreiben() ? [
        { titel: 'Leistung darunter einfügen', tun: () => neuDarunter() },
        { titel: 'Hier unterbrechen …', gesperrt: erg().termine.get(v.id)!.gruppe || Number(v.werte.dauer ?? 0) < 2, tun: () => unterbrechen(e, v) },
        { titel: 'Anfang wieder automatisch', gesperrt: !v.werte.anfang_nicht_vor, tun: () => ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { anfang_nicht_vor: null } }, 'Anfang wieder automatisch') },
      ] : []),
      ...(darf('vorgang', 'loeschen') ? [{ titel: 'Löschen', gefahr: true, tun: () => entfernen(v.id) }] : []),
    ]);
  };
  /** Unterbrechen an der Stelle, auf die geklickt wurde: zwei Abschnitte mit 5 Arbeitstagen Pause (in der Karte änderbar). */
  const unterbrechen = (e: MouseEvent, v: Zeile) => {
    const t = erg().termine.get(v.id)!, k = kal();
    const svg = flaeche.querySelector('.bzp-balken') as SVGElement;
    const tag = achse().t0 + Math.floor((e.clientX - svg.getBoundingClientRect().left) / px());
    const ab = abschnitteLesen(v.werte.unterbrechung as string) ?? [{ dauer: Number(v.werte.dauer ?? 0), pause: 0 }];
    let rel = k.arbeitstag(tag) - t.s, pos = 0;
    const neu = ab.flatMap((a, i) => {
      pos += a.pause;
      const r = rel - pos;
      pos += a.dauer;
      if (r > 0 && r < a.dauer) { rel = -1e9; return [{ dauer: r, pause: i ? a.pause : 0 }, { dauer: a.dauer - r, pause: 5 }]; }
      return [a];
    });
    if (neu.length === ab.length) return hinweis('Bitte innerhalb des Balkens unterbrechen, nicht am Rand');
    ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { unterbrechung: abschnitteSchreiben(neu) } }, `„${v.werte.name}“ unterbrechen`);
  };

  // ---------- Kopf der Zeitachse ----------
  const kopf = createMemo(() => {
    const { t0, t1 } = achse(), b = px(), oben: { x: number; w: number; t: string }[] = [], unten: { x: number; t: string; frei?: boolean }[] = [];
    const tage = b >= 12;   // fein: oben die Wochen, unten jeder Tag (Mo, Di …); grob: oben die Monate, unten die Wochen
    for (let t = t0; t <= t1; t++) {
      const d = isoAus(t), wt = wochentag(t);
      if (tage) {
        if (wt === 0 || t === t0) oben.push({ x: (t - t0) * b, w: 0, t: 7 * b >= 150 ? `KW ${kw(t)} · ${Number(d.slice(8, 10))}. ${MONATE[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : `KW ${kw(t)} · ${d.slice(8, 10)}.${d.slice(5, 7)}.` });
        unten.push({ x: (t - t0) * b, t: b >= 24 ? `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][wt]} ${Number(d.slice(8, 10))}` : 'MDMDFSS'[wt]!, frei: !kal().arbeit(t) });
      } else {
        if (d.endsWith('-01') || t === t0) oben.push({ x: (t - t0) * b, w: 0, t: `${MONATE[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` });
        if (wt === 0) unten.push({ x: (t - t0) * b, t: b >= 6 ? `KW ${kw(t)} · ${d.slice(8, 10)}.${d.slice(5, 7)}.` : `${kw(t)}` });
      }
    }
    oben.forEach((m, i) => (m.w = (oben[i + 1]?.x ?? (t1 - t0 + 1) * b) - m.x));
    return { monate: oben, unten, tage };
  });
  const freieTage = createMemo(() => {
    const { t0, t1 } = achse(), k = kal(), l: { x: number; feiertag: string }[] = [];
    for (let t = t0; t <= t1; t++) if (!k.arbeit(t)) { const n = k.frei(t); if (n || px() >= 6) l.push({ x: (t - t0) * px(), feiertag: n }); }
    return l;
  });
  const heute = () => (tagAus(new Date().toLocaleDateString('sv')) - achse().t0) * px();


  return (
    <div class="bzp">
      <Show when={schmal()}>
        <div class="ph-umschalter" role="tablist">
          <For each={[['jetzt', 'Jetzt'], ['ablauf', 'Ablauf'], ['gewerke', 'Gewerke'], ['plan', 'Balken']] as const}>{([k, t]) =>
            <button role="tab" aria-selected={handy() === k} classList={{ an: handy() === k }} onClick={() => setHandy(k)}>{t}</button>}</For>
        </div>
      </Show>
      <Show when={schmal() && handy() !== 'plan'}>
        <PlanHandy plan={plan()} heute={new Date().toLocaleDateString('sv')} ansicht={handy() as 'jetzt'} onOeffnen={(id) => oeffnen(id)} />
      </Show>
      <Show when={!schmal() || handy() === 'plan'}>
      <input ref={dateiWahl} type="file" accept=".gantt,.json,application/json" hidden onChange={() => void einlesen()} />
      <Show when={erg().zyklen.length}><p class="feld-fehler bzp-warnung">Zirkelbezug: {erg().zyklen.length} Verknüpfung{erg().zyklen.length > 1 ? 'en gelten' : ' gilt'} nicht</p></Show>
      <div class="bzp-flaeche" ref={flaeche} tabIndex={0} onKeyDown={taste} aria-label="Balkenplan" role="grid"
        onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(Math.max(0, Math.min(ZOOM.length - 1, zoom() + (e.deltaY < 0 ? 1 : -1)))); } }}>
        <div class="bzp-innen" style={{ width: `${breiteL() + breiteR()}px`, height: `${KOPF + flaechenZeilen() * H}px` }}>
          <div class="bzp-kopf" style={{ width: `${breiteL() + breiteR()}px` }}>
            <div class="bzp-links bzp-kopfzellen" onContextMenu={(e) => { e.preventDefault(); setSpaltenFeld({ x: e.clientX, y: e.clientY }); }}>
              <For each={spalten()}>{(s) => (
                // wie in jeder Tabelle: Kopf mit der Maus verschieben (Reihenfolge), an der Kante ziehen (Breite)
                <div class="bzp-zelle" classList={{ rechts: !!s.rechts }} style={{ width: `${s.breite}px` }} {...(schmal() ? {} : spw.ziehbar(s.id))}>{s.titel}
                  <Show when={!schmal()}><i class="griff" aria-hidden="true" title="Ziehen: Breite ändern" onPointerDown={(e) => spw.breiteZiehen(e, s.id)} /></Show>
                </div>)}</For>
            </div>
            <svg class="bzp-achse" width={breiteR()} height={KOPF}>
              <For each={kopf().monate}>{(m) => <><line x1={m.x} x2={m.x} y1={0} y2={KOPF} class="bzp-linie" /><text x={m.x + 4} y={16} class={kopf().tage ? "bzp-woche-oben" : "bzp-monat"}>{m.w > 50 ? m.t : ''}</text></>}</For>
              <For each={kopf().unten}>{(u) => <><line x1={u.x} x2={u.x} y1={24} y2={KOPF} class="bzp-linie" /><text x={kopf().tage ? u.x + px() / 2 : u.x + 3} y={39} class="bzp-woche" classList={{ frei: !!u.frei }} text-anchor={kopf().tage ? 'middle' : 'start'}>{u.t}</text></>}</For>
            </svg>
          </div>
          <svg class="bzp-balken" width={breiteR()} height={flaechenZeilen() * H} style={{ left: `${breiteL()}px`, top: `${KOPF}px` }}
            onPointerDown={aufziehen} onPointerMove={bewegen} onPointerUp={loslassen}>
            <For each={freieTage()}>{(f) => <rect x={f.x} y={0} width={px()} height="100%" class={f.feiertag ? 'bzp-feiertag' : 'bzp-wochenende'}>{f.feiertag ? <title>{f.feiertag}</title> : null}</rect>}</For>
            <For each={sichtbar()}>{(v, i) => <rect x={0} y={i() * H} width="100%" height={H} class="bzp-streifen" classList={{ gewaehlt: v.id === markiert() }} />}</For>
            <line x1={heute()} x2={heute()} y1={0} y2="100%" class="bzp-heute" />
            <For each={sichtbar()}>{(v, i) => {
              const t = (): Termin | undefined => erg().termine.get(v.id);
              const y = () => i() * H;
              const fb = () => balkenFarbe(v.werte);
              return (
                <Show when={t()}>{(tt) => (
                  <g class="bzp-vorgang" onDblClick={() => oeffnen(v.id)} onContextMenu={(e) => balkenMenue(e, v)}>
                    <Show when={tt().gruppe} fallback={
                      <Show when={tt().f > tt().s} fallback={
                        <path d={`M${x(tt().s) + verschiebung(v.id)},${y() + 7} l8,8 l-8,8 l-8,-8 z`} class="bzp-meilenstein" onPointerDown={(e) => startZiehen(e, v, 'schieben', y())} />}>
                        <For each={tt().abschnitte}>{(a, k) => (
                          <>
                            <Show when={k() > 0}><line x1={xEnde(tt().abschnitte[k() - 1]!.s, tt().abschnitte[k() - 1]!.f) + verschiebung(v.id)} x2={x(a.s) + verschiebung(v.id)} y1={y() + H / 2} y2={y() + H / 2} class="bzp-pause" /></Show>
                            <rect x={x(a.s) + verschiebung(v.id)} y={y() + 8} rx={3} height={14}
                              width={Math.max(2, xEnde(a.s, a.f) - x(a.s) + (k() === tt().abschnitte.length - 1 ? verlaengerung(v.id) : 0))}
                              fill={fb()} class="bzp-balken-teil" classList={{ kritisch: kritisch() && tt().kritisch }} onPointerDown={(e) => startZiehen(e, v, 'schieben', y())} />
                          </>
                        )}</For>
                        <Show when={Number(v.werte.fortschritt ?? 0) > 0}>
                          <rect x={x(tt().s) + verschiebung(v.id)} y={y() + 13} height={4} width={(xEnde(tt().s, tt().f) - x(tt().s)) * Math.min(100, Number(v.werte.fortschritt)) / 100} class="bzp-fortschritt" />
                        </Show>
                        <Show when={xEnde(tt().s, tt().f) - x(tt().s) >= 30}>
                          <text x={x(tt().s) + verschiebung(v.id) + 3} y={y() + 19} class="bzp-pct">{Math.round(Number(v.werte.fortschritt ?? 0))} %</text>
                        </Show>
                        <rect x={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) - 4} y={y() + 8} width={8} height={14} class="bzp-griff" onPointerDown={(e) => startZiehen(e, v, 'dauer', y())}><title>Ziehen ändert die Dauer</title></rect>
                      </Show>
                    }>
                      <path d={`M${x(tt().s)},${y() + 9} H${xEnde(tt().s, tt().f)} v10 l-5,-4 H${x(tt().s) + 5} l-5,4 z`} class="bzp-gruppe" />
                    </Show>
                    <Show when={schreiben()}><circle cx={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) + 9} cy={y() + H / 2} r={4} class="bzp-punkt" onPointerDown={(e) => startZiehen(e, v, 'link', y(), tt().abschnitte.length > 1 ? tt().abschnitte.length - 1 : null)}><title>Auf eine andere Leistung ziehen: verknüpfen</title></circle>
                      {/* geteilte Leistung: auch jeder frühere Teil hat seinen Punkt – Pfeile gehen von und zu jedem Teil */}
                      <For each={tt().abschnitte.length > 1 ? tt().abschnitte.slice(0, -1) : []}>{(a, k) => (
                        <circle cx={xEnde(a.s, a.f) + verschiebung(v.id) + 4} cy={y() + H / 2 - 9} r={3.5} class="bzp-punkt" onPointerDown={(e) => startZiehen(e, v, 'link', y(), k())}><title>{`Teil ${k() + 1} auf eine andere Leistung ziehen: verknüpfen`}</title></circle>
                      )}</For></Show>
                    <text x={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) + 18} y={y() + 19} class="bzp-text">{String(v.werte.name ?? '')}{v.werte.unternehmer ? ` · ${v.werte.unternehmer}` : ''}</text>
                  </g>
                )}</Show>
              );
            }}</For>
            <For each={pfeilListe()}>{(a) => <g class="bzp-pfeil" classList={{ kritisch: kritisch() && a.kritisch }} onContextMenu={(e) => linkMenue(e, a.id)}>
              <path d={a.d} /><path d={a.links ? `M${a.x2},${a.yb} l-6,-4 v8 z` : `M${a.x2},${a.yb} l6,-4 v8 z`} class="bzp-spitze" />
            </g>}</For>
            {/* Vorschau beim Aufziehen: folgt der Maus (bei jeder Bewegung neu gerechnet, nicht nur beim ersten Schritt) */}
            <Show when={ziehen()?.art === 'neu' && Math.abs(ziehen()!.dx) >= px()}>{(_) => { const f = () => { const g = ziehen(); return g ? aufgezogen(g) : { t0: achse().t0, t1: achse().t0 }; }; return <rect x={(f().t0 - achse().t0) * px()} y={(ziehen()?.y ?? 0) + 5} width={(f().t1 - f().t0 + 1) * px()} height={H - 10} rx={3} class="bzp-aufziehen" />; }}</Show>
            <Show when={ziehen()?.art === 'link' && erg().termine.get(ziehen()!.id)}>{(tg) => { const t = () => (ziehen()?.teil != null && tg().abschnitte[ziehen()!.teil!]) || tg(); return <line x1={xEnde(t().s, t().f) + 9} y1={(ziehen()?.y ?? 0) + H / 2} x2={xEnde(t().s, t().f) + 9 + (ziehen()?.dx ?? 0)} y2={ziehen()?.yMaus ?? 0} class="bzp-zieh" />; }}</Show>
          </svg>
          <div class="bzp-zeilen" style={{ top: `${KOPF}px` }}>
            <For each={sichtbar()}>{(v) => {
              const t = () => erg().termine.get(v.id);
              return (
                <div class="bzp-links bzp-zeile" classList={{ gewaehlt: v.id === markiert(), gruppe: !!t()?.gruppe, kritisch: kritisch() && !!t()?.kritisch }} role="row"
                  onClick={() => setMarkiert(v.id)} onDblClick={() => oeffnen(v.id)} onContextMenu={(e) => balkenMenue(e, v)}>
                  <For each={spalten()}>{(s) => (
                    <div class="bzp-zelle" role="gridcell" classList={{ rechts: !!s.rechts, zeiger: v.id === markiert() && spalte() === s.id, fest: !!(s.id === 'anfang' && v.werte.anfang_nicht_vor) }} style={{ width: `${s.breite}px` }}
                      onClick={() => setSpalte(s.id)} onDblClick={(e) => { if (BEARBEITBAR.has(s.id) && schreiben()) { e.stopPropagation(); bearbeiten(v.id, s.id); } }}>
                      <Show when={edit()?.id === v.id && edit()?.spalte === s.id} fallback={
                        s.id === 'name'
                          ? <span class="bzp-name" style={{ 'padding-left': `${Number(v.werte.ebene ?? 0) * 16}px` }}>
                              <Show when={t()?.gruppe} fallback={<i class="klappe-platz" />}><Klappe zu={eingeklappt().has(v.id)} onKlick={() => umschalten(v.id)} /><Ordner offen={!eingeklappt().has(v.id)} /></Show>
                              <Show when={!t()?.gruppe}><i class="bzp-farbe" style={{ background: balkenFarbe(v.werte) }} /></Show>
                              {wert(v, 'name')}
                            </span>
                          : wert(v, s.id)}>
                        <input class="bzp-eingabe" value={edit()!.text} ref={(el) => queueMicrotask(() => { el.focus(); if (edit()?.text.length !== 1) el.select(); })}
                          onInput={(e) => setEdit({ ...edit()!, text: e.currentTarget.value })} onKeyDown={eingabeTaste} onBlur={() => { if (edit()) uebernehmen() || setEdit(null); }} />
                      </Show>
                    </div>
                  )}</For>
                </div>
              );
            }}</For>
            <Show when={schreiben()}>
              <div class="bzp-links bzp-zeile bzp-neu" onClick={() => bearbeiten('neu', 'name')}>
                <div class="bzp-zelle" style={{ width: `${spalten()[0]!.breite}px` }} />
                <div class="bzp-zelle" style={{ width: `${spalten()[1]!.breite}px` }}>
                  <Show when={edit()?.id === 'neu'} fallback={<span class="still-text">+ Neue Leistung …</span>}>
                    <input class="bzp-eingabe" value={edit()!.text} placeholder="Bezeichnung, Enter" ref={(el) => queueMicrotask(() => el.focus())}
                      onInput={(e) => setEdit({ ...edit()!, text: e.currentTarget.value })} onKeyDown={eingabeTaste} onBlur={() => { if (edit()?.id === 'neu') uebernehmen(); }} />
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
      <div class="bzp-status" role="status">
        <span>{vorgaenge().length} {vorgaenge().length === 1 ? 'Leistung' : 'Leistungen'}</span>
        <Show when={erg().termine.size}>
          <span>Anfang {tagname(erg().termine.size ? [...erg().termine.values()].reduce((m, t) => (t.anfang < m ? t.anfang : m), '9999') : '')}</span>
          <span>Ende <strong>{tagname(erg().endeDatum)}</strong></span>
          <span class="nur-breit">{erg().ende} Arbeitstage</span>
        </Show>
        <span class="nur-breit">{kal().woche}-Tage-Woche</span>
        <span class="nur-breit">Feiertage {zp()?.werte.bundesland ? BUNDESLAENDER.find((b) => b.wert === zp()!.werte.bundesland)?.titel : land() ? `${BUNDESLAENDER.find((b) => b.wert === land())?.titel} (Baustelle)` : 'bundesweit'}</span>
        <Show when={schreiben()}><span class="nur-breit">{autom() ? 'Neue Leistungen: automatisch verknüpft' : 'Neue Leistungen: ohne Verknüpfung'}</span></Show>
        {/* Zoom wie im bisherigen Bauportal unten rechts – nur hier im Plan, keine gemeinsame Fußzeile */}
        <label class="bzp-zoom nur-breit-flex" title="Zeitachse enger oder weiter"><Zeichen name="kleiner" groesse={14} />
          <input type="range" min={0} max={ZOOM.length - 1} step={1} value={zoom()} aria-label="Zoom der Zeitachse" onInput={(e) => setZoom(Number(e.currentTarget.value))} />
          <Zeichen name="groesser" groesse={14} /></label>
      </div>
      </Show>
      <Show when={assi()}><PlanAssistent projekt={z().projekt} version={z().version} gespeichert={String(zp()?.werte.assistent ?? '')} onZu={() => setAssi(false)} /></Show>
      <Show when={drucken()}><PlanDrucken plan={plan()} projekt={z().projekt} version={z().version} onZu={() => setDrucken(false)} /></Show>
      <Show when={!vorgaenge().length}><p class="still-text bzp-leer">Noch keine Leistungen. Mit „✦ Assistent“ entsteht ein Plan aus dem Gebäudemodell – oder unten in „+ Neue Leistung“ tippen: Dauer „5“, „2w“; Vorgänger „3;4AA+2t“.</p></Show>
      <Show when={spaltenFeld()}>{(o) => <Spaltenfeld spalten={spw} ort={o()} onZu={() => setSpaltenFeld(null)} />}</Show>
    </div>
  );
}

function kw(t: number): number {
  const d = t + 3 - wochentag(t);   // Donnerstag derselben Woche
  const j = Number(isoAus(d).slice(0, 4));
  return 1 + Math.floor((d - tagAus(`${j}-01-01`)) / 7);
}
