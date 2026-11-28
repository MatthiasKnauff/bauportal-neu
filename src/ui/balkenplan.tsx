// Balkenplan des Bauzeitenplans: links die Leistungstabelle, rechts die Balken – in der Mitte der üblichen Ansicht
// (Rahmen, Suche, Versionen, Karte und Anlegen kommen wie überall vom Baukasten). Gerechnet wird mit rechnung.ts,
// bearbeitet mit bearbeiten.ts; jede Handlung ist ein Schritt für Strg+Z.
// Bedienung wie gewohnt: Zelle anklicken und lostippen, F2, Enter/Tab/Esc; Einfg, Entf; Alt+Umschalt+Pfeile gliedern und
// verschieben; Balken ziehen (verschieben), rechte Kante ziehen (Dauer), Punkt am Balkenende auf einen anderen ziehen (verknüpfen).
import { Prozent } from './baukasten/prozent';
import { zeilenZiehen } from './baukasten/zeilenzug';
import { Zeichen } from './baukasten/zeichen';
import { spaltenwahl, zusatzMessen } from './baukasten/spalten';
import { zeilenwahl } from './baukasten/zeilenwahl';
import { Klappe, Ordner } from './baukasten/baum';
import { Spaltenfeld } from './baukasten/spaltenfeld';
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { Vorlage as KernVorlage, Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { BUNDESLAENDER, MONATE_KURZ as MONATE, datumLesen, isoAus, kurz, tagAus, tagname, wochentag } from '../module/bauzeitenplan/kalender';
import { pfeilWege } from '../module/bauzeitenplan/pfeile';
import { abschnitteLesen, abschnitteSchreiben, type Art, type Termin } from '../module/bauzeitenplan/rechnung';
import { balkenFarbe, gewerkFarbenAus, naechsterMontag as montag, planAus } from '../module/bauzeitenplan/plan';
import { dauerLesen, vorgaengerLesen, vorgaengerSchreiben } from '../module/bauzeitenplan/schreibweise';
import { masterNachziehen } from '../module/bauzeitenplan/master';
import { umlegen, umlegenVorschlag, teilAendern, ablageAus, gruppeUm, unterbrechen as unterbrechenAm, ueberfluessigeLinks, ablageEinfuegen, bloeckeVon, block, type GV, einfuegen, gliedern, loeschen, verschiebenAlle, verschiebenNach, vorgaengerSetzen, type Ablage, type L, type VM, type Vorlage } from '../module/bauzeitenplan/bearbeiten';
import { DuplizierenFenster } from './duplizieren';
import { GruppierenFenster } from './gruppieren';
import { nachEigenemSchritt, ausfuehren, ausfuehrenMehrere, geaendert, sicht } from './unterbau/abgleich';
import { Dialog } from './baukasten/dialog';
import { feldSetzenOeffnen } from './baukasten/feldsetzen';
import { PlanSatz } from './plansatz';
import { Auswahlliste } from './baukasten/auswahlliste';
import { darf, modell, neueKennung, ruf } from './unterbau/api';
import type { Mitte } from './baukasten/anpassung';
import { hinweis } from './unterbau/meldungen';
import { zeigeMenue } from './baukasten/kontextmenue';
import { PlanDrucken } from './plandruck';
import { PlanAssistent } from './planassistent';
import { holen, merken } from './unterbau/speicher';
import { herunterladen } from './baukasten/herunterladen';
import { csvAus, mspdiAus, planJsonAus } from '../module/bauzeitenplan/austausch';
import { vorschauZeigen, type Vorschau } from './uebernahme';
import { SollFesthalten, SollZurueck } from './sollfenster';
import { sollLesen, vergleichen, type SollZeile } from '../module/bauzeitenplan/soll';
import { handy as geraetHandy } from './unterbau/geraet';
import { dateiWaehlen } from './baukasten/dateiwahl';

const H = 30, KOPF = 46;
type Spalte = { id: 'nr' | 'name' | 'dauer' | 'anfang' | 'ende' | 'vorg' | 'gewerk' | 'pct'; titel: string; breite: number; rechts?: boolean };
const SPALTEN: Spalte[] = [
  { id: 'nr', titel: 'Nr.', breite: 40, rechts: true }, { id: 'name', titel: 'Leistung', breite: 260 }, { id: 'dauer', titel: 'Dauer', breite: 70, rechts: true },
  { id: 'anfang', titel: 'Anfang', breite: 88 }, { id: 'ende', titel: 'Ende', breite: 88 }, { id: 'vorg', titel: 'Vorgänger', breite: 96 },
  { id: 'gewerk', titel: 'Gewerk', breite: 120 }, { id: 'pct', titel: '%', breite: 46, rechts: true },
];
const BEARBEITBAR = new Set(['name', 'dauer', 'anfang', 'vorg', 'gewerk', 'pct']);
const ZOOM = [3, 6, 12, 24, 40];   // Bildpunkte je Kalendertag
const naechsterMontag = () => montag(new Date().toLocaleDateString('sv'));


export function Balkenplan(p: Mitte) {
  const z = () => p.fest() as Record<string, Wert> & { projekt: string; version: string };
  const lebend = (o: string) => { geaendert(o); return untrack(() => Object.values(sicht[o] ?? {}).map((x) => unwrap(x)).filter((x) => !x.geloescht && x.werte.version === z().version)); };
  const schreiben = () => darf('vorgang', 'schreiben');
  // Zeilen bleiben Teil des Speichers (nicht ausgepackt): so folgt jede Zelle ihren Feldern
  const vorgaenge = createMemo(() => [...p.alle()].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0)));
  const links = createMemo(() => lebend('verknuepfung'));
  const zp = createMemo(() => lebend('zeitplan')[0], undefined, { equals: false });   // dasselbe Objekt mit neuen Werten: trotzdem melden
  const [land] = createResource(() => z().projekt, (id) => ruf<{ land: string }>('/api/projekt/land', { projekt: id }).then((r) => r.land, () => ''));
  const farben = createMemo(() => gewerkFarbenAus(zp()?.werte));   // „Gewerke & Farben“
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
  const V_ = (): VM[] => vorgaenge().map((v) => ({ id: v.id, reihe: Number(v.werte.reihe ?? 0), ebene: Number(v.werte.ebene ?? 0), master: v.werte.master === true, kopieVon: (v.werte.kopie_von as string | null) || null }));
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
  // Darstellung wie bisher (je Gerät gemerkt): Beschriftung der Balken links · im Balken · rechts, Dauer der Gruppen, Zeilen,
  // beim Löschen fragen (Gesamtzeit verkürzen oder die Dauer auf eine Hauptleistung umlegen)
  const [beschriftung, setBeschriftung] = createSignal<{ l: string; m: string; r: string }>({ l: '', m: 'pct', r: 'name_firma', ...holen<Partial<{ l: string; m: string; r: string }>>('bzp.beschriftung', {}) });
  const [gruppenDauer, setGruppenDauer] = createSignal<'spanne' | 'summe' | 'beides'>(holen('bzp.gruppendauer', 'spanne'));
  const [zeilenArt, setZeilenArt] = createSignal<'' | 'band' | 'linie'>(holen('bzp.zeilen', ''));
  const [loeschFragen, setLoeschFragen] = createSignal<boolean>(holen('bzp.loeschfragen', true));
  createEffect(() => { merken('bzp.beschriftung', beschriftung()); merken('bzp.gruppendauer', gruppenDauer()); merken('bzp.zeilen', zeilenArt()); merken('bzp.loeschfragen', loeschFragen()); });
  const [darstellung, setDarstellung] = createSignal(false);
  const [satz, setSatz] = createSignal(false);
  const [drucken, setDrucken] = createSignal(false);
  const [assi, setAssi] = createSignal(false);
  // Export als Datei (im Browser erzeugt) und Plan aus einer Datei einlesen (Vorschau wie jede Übernahme)
  const titel = () => { const pr = sicht.projekt?.[z().projekt]?.werte; return `Bauzeitenplan ${[pr?.nummer, pr?.name].filter(Boolean).join(' ')} ${sicht.version?.[z().version]?.werte.name ?? ''}`.trim(); };
  const speichern = (inhalt: string, endung: string, typ: string) => herunterladen(inhalt, `${titel()} ${new Date().toLocaleDateString('sv')}.${endung}`, typ);
  // Befehle des Balkenplans in der Menüleiste (Band) – wie im bisherigen Bauportal
  p.setNeu(() => neuDarunter());
  // Bearbeiten und Gliederung im Band wie im bisherigen Bauportal – dieselben Befehle wie Tastatur und Kontextmenü
  // mit Mehrfachauswahl: jede oberste gewählte Zeile mit allem darunter; hoch/runter rücken alle gewählten zusammen
  const gliederung = (art: 'aus' | 'ein' | 'hoch' | 'runter') => {
    const ids = gewaehlt(); if (!ids.length) return;
    const v = V_(), l = L_();
    const b = art === 'hoch' || art === 'runter' ? verschiebenAlle(v, ids, art === 'hoch' ? -1 : 1)
      : bloeckeVon(v, ids).flatMap(([a]) => gliedern(v, l, v[a]!.id, art === 'ein' ? 1 : -1));
    tun(b, art === 'ein' ? 'Einrücken' : art === 'aus' ? 'Ausrücken' : 'Verschieben');
  };
  createEffect(() => p.setKnoepfe([
    // Neu wie bisher: nach „Leistung“ auch Gruppe (um die gewählten Zeilen) und Meilenstein
    ...(schreiben() ? [{ titel: 'Gruppe', zeichen: 'gruppe_neu', gruppe: 'Neu', tun: neueGruppe },
      { titel: 'Meilenstein', zeichen: 'meilenstein', gruppe: 'Neu', tun: () => neuDarunter({ name: 'Neuer Meilenstein', dauer: 0 }) }] : []),
    // Knöpfe und Reihenfolge wie im bisherigen Bauportal (rahmen.js, 27.11.2026); wird es eng, regelt die Menüleiste das wie bisher
    // (kleiner Text, dann nur Symbole, dann „»“)
    ...(schreiben() ? [
      { titel: 'Kopieren', zeichen: 'kopieren', gruppe: 'Bearbeiten', gesperrt: !markiert(), tun: kopieren },
      { titel: 'Ausschneiden', zeichen: 'ausschneiden', gruppe: 'Bearbeiten', gesperrt: !markiert() || !darf('vorgang', 'loeschen'), tun: ausschneiden },
      { titel: 'Einfügen', zeichen: 'einfuegen', gruppe: 'Bearbeiten', gesperrt: !ablage(), tun: ablageEinfuegenHier },
      { titel: 'Duplizieren …', zeichen: 'duplizieren', gruppe: 'Bearbeiten', gesperrt: !markiert(), tun: duplizieren },
      { titel: 'Löschen', zeichen: 'loeschen', rot: true, gruppe: 'Bearbeiten', gesperrt: !markiert() || !darf('vorgang', 'loeschen'), tun: () => entfernen() },
      { titel: 'Höher', zeichen: 'ausruecken', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('aus') },
      { titel: 'Tiefer', zeichen: 'einruecken', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('ein') },
      { titel: 'Hoch', zeichen: 'nach_oben', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('hoch') },
      { titel: 'Runter', zeichen: 'nach_unten', gruppe: 'Gliederung', gesperrt: !markiert(), tun: () => gliederung('runter') },
    ] : []),
    ...(schreiben() ? [{ titel: 'Verknüpfen', zeichen: 'verknuepfen', gruppe: 'Planen', gesperrt: !markiert() || vorgaenge()[0]?.id === markiert(), tun: mitVorigerVerknuepfen },
      { titel: 'Lösen', zeichen: 'entkoppeln', gruppe: 'Planen', gesperrt: !links().some((l) => l.werte.von === markiert() || l.werte.nach === markiert()), tun: verknuepfungenLoesen },
      { titel: 'Unterbrechen', zeichen: 'unterbrechen', gruppe: 'Planen', an: teilen(), gesperrt: !vorgaenge().length, tun: () => setTeilen(!teilen()) },
      { titel: 'Aufräumen', zeichen: 'aufraeumen', gruppe: 'Planen', gesperrt: !links().length, tun: aufraeumen },
      { titel: 'In einem Satz', zeichen: 'satz', gruppe: 'Planen', gesperrt: !vorgaenge().length, tun: () => setSatz(true) },   // wie bisher „Fragen und Antworten“: „Fliesen 1 Woche später“ …
      { titel: 'Assistent', zeichen: 'assistent', gruppe: 'Planen', tun: () => setAssi(true) },
      { titel: 'Auto', zeichen: 'ablauf', gruppe: 'Planen', an: autom(), tun: () => setAutom(!autom()) }] : []),
    // Fortschritt der gewählten Leistungen: Stufen und Schieber (Baustein Prozent) wie bisher (bei einer Gruppe: alle Leistungen darunter)
    ...(schreiben() ? [{ titel: fortschrittIds().length ? `Fortschritt ${fortschrittJetzt()} %` : 'Fortschritt – erst eine Leistung markieren', gruppe: 'Fortschritt', tun: () => {},
      inhalt: () => <Prozent klein schieber titel="Fortschritt" wert={fortschrittIds().length ? fortschrittJetzt() : null} gesperrt={!fortschrittIds().length} onWert={fortschrittSetzen} /> }] : []),
    ...(darf('soll', 'schreiben') && vorgaenge().length ? [{ titel: sollJetzt() ? 'Soll neu …' : 'Scharf schalten …', zeichen: 'anheften', gruppe: 'Fortschritt', tun: () => setSollFenster('fest') },
      ...(sollJetzt() ? [{ titel: 'Soll zurück …', zeichen: 'zurueck', gruppe: 'Fortschritt', tun: () => setSollFenster('zurueck') }] : [])] : []),
    ...(schreiben() ? [{ titel: 'Gruppieren …', zeichen: 'baum', gruppe: 'Gruppieren', gesperrt: !vorgaenge().length, tun: () => setGrp(true) }] : []),
    ...(gruppenIds().length ? (['grob', 'mittel', 'fein'] as const).map((d) => ({ titel: d[0]!.toUpperCase() + d.slice(1), zeichen: 'liste', gruppe: 'Detail', an: detailJetzt() === d, tun: () => detail(d) })) : []),
    { titel: 'Größer', zeichen: 'groesser', gruppe: 'Ansicht', gesperrt: zoom() === ZOOM.length - 1, tun: () => setZoom(zoom() + 1) },
    { titel: 'Kleiner', zeichen: 'kleiner', gruppe: 'Ansicht', gesperrt: zoom() === 0, tun: () => setZoom(zoom() - 1) },
    { titel: 'Ganzer Plan', zeichen: 'einpassen', gruppe: 'Ansicht', gesperrt: !vorgaenge().length, tun: ganzerPlan },
    { titel: 'Heute', zeichen: 'kalender', gruppe: 'Ansicht', tun: () => zumTag(tagAus(new Date().toLocaleDateString('sv')), 0.3) },
    { titel: 'Zur Leistung', zeichen: 'zielen', gruppe: 'Ansicht', gesperrt: !markiert(), tun: zurLeistung },
    { titel: 'Krit. Weg', zeichen: 'kritisch', gruppe: 'Ansicht', an: kritisch(), tun: () => setKritisch(!kritisch()) },
    ...(sollJetzt() ? [{ titel: 'Soll', zeichen: 'version', gruppe: 'Ansicht', an: !sollAus(), tun: () => setSollAus(!sollAus()) }] : []),
    { titel: 'Darstellung', zeichen: 'pfeile', gruppe: 'Ansicht', tun: () => setDarstellung(true) },
    { titel: 'Export', zeichen: 'export', gruppe: 'Datei', rechts: true, tun: (e) => austauschMenue(e) },
    ...(schreiben() ? [{ titel: 'Einlesen', zeichen: 'import', gruppe: 'Datei', rechts: true, tun: () => einlesen() }] : []),
    { titel: 'Drucken', zeichen: 'drucken', gruppe: 'Ausgabe', rechts: true, tun: () => setDrucken(true) },   // wie bisher: Drucker, „Drucken“
  ]));
  const fortschrittIds = () => { const l = vorgaenge(), ids = new Set(gewaehlt()); const aus: string[] = [];
    l.forEach((v, i) => { if (!ids.has(v.id)) return; const e = Number(v.werte.ebene ?? 0); let k = i + 1; if (Number(l[k]?.werte.ebene ?? -1) <= e) { aus.push(v.id); return; }
      for (; k < l.length && Number(l[k]!.werte.ebene ?? 0) > e; k++) if (!(Number(l[k + 1]?.werte.ebene ?? -1) > Number(l[k]!.werte.ebene ?? 0))) aus.push(l[k]!.id); });
    return [...new Set(aus)]; };
  const fortschrittJetzt = () => Math.round(Number(sicht.vorgang?.[fortschrittIds()[0] ?? '']?.werte.fortschritt ?? 0));
  const fortschrittSetzen = (w: number) => tun(fortschrittIds().filter((id) => Number(sicht.vorgang?.[id]?.werte.fortschritt ?? 0) !== w)
    .map((id) => ({ objekt: 'vorgang', art: 'aendern' as const, objektId: id, werte: { fortschritt: w } })), `Fortschritt ${w} %`);
  // Soll und Ist wie bisher: das gültige Soll der Version liegt blass unter dem Plan; je Person ausblendbar
  const sollJetzt = createMemo(() => lebend('soll').find((x) => x.werte.gilt === true));
  const [sollAus, setSollAus] = createSignal<boolean>(holen('bzp.sollAus', false));
  createEffect(() => merken('bzp.sollAus', sollAus()));
  const [sollFenster, setSollFenster] = createSignal<'fest' | 'zurueck' | null>(null);
  const istZeilen = (): SollZeile[] => vorgaenge().flatMap((v) => { const t = erg().termine.get(v.id); return t ? [{ id: v.id, name: String(v.werte.name ?? ''), reihe: Number(v.werte.reihe ?? 0), anfang: t.anfang, ende: t.ende, gruppe: t.gruppe }] : []; });
  const vgl = createMemo(() => { const s = sollJetzt(); return s && !sollAus() ? { soll: s, ...vergleichen(sollLesen(s.werte.stand), istZeilen()) } : null; });
  // Unterbrechen wie bisher: Knopf an, dann auf die Stelle im Balken klicken, an der die Pause beginnt (Esc bricht ab)
  const [teilen, setTeilenRoh] = createSignal(false);
  const setTeilen = (an: boolean) => { setTeilenRoh(an); if (an) hinweis('Unterbrechen: auf die Stelle im Balken klicken, an der die Pause beginnen soll (Esc bricht ab).'); };
  const teilenAn = (e: MouseEvent, v: Zeile) => {   // auch „Hier unterbrechen …“ im Kontextmenü
    setTeilenRoh(false);
    const t = erg().termine.get(v.id); if (!t) return;
    if (t.gruppe) { hinweis('Gruppen lassen sich nicht unterbrechen – nur Leistungen.', { art: 'fehler' }); return; }
    const w = kal().arbeitstag(achse().t0 + Math.floor(svgX(e.clientX) / px()));
    const r = unterbrechenAm(v.id, Number(v.werte.dauer ?? 0), v.werte.unterbrechung as string, t.abschnitte, w, L_());
    if (typeof r === 'string') { hinweis(r, { art: 'fehler' }); return; }
    tun(r, 'Unterbrechen');
    hinweis(`Unterbrochen ab ${tagname(kal().anfangsdatum(w))}, 5 Arbeitstage Pause. Den hinteren Teil kannst du mit der Maus verschieben.`);
  };
  const neueGruppe = () => {
    const r = gruppeUm(V_(), gewaehlt(), zu(), neueKennung);
    tun(r.befehle, 'Gruppe einfügen'); setMarkiert(r.id); queueMicrotask(() => bearbeiten(r.id, 'name'));
  };
  // Aufräumen wie bisher: überflüssige Verknüpfungen entfernen – die Termine bleiben gleich
  const aufraeumen = () => {
    const weg = ueberfluessigeLinks(V_(), L_());
    if (!weg.length) { hinweis('Keine überflüssigen Verknüpfungen gefunden.'); return; }
    tun(weg.map((id) => ({ objekt: 'verknuepfung', art: 'loeschen' as const, objektId: id })), 'Aufräumen');
    hinweis(`${weg.length} überflüssige Verknüpfung${weg.length === 1 ? '' : 'en'} entfernt – die Termine bleiben gleich.`);
  };
  // Strg+Mausrad (wie bisher), aber der Tag unter der Maus bleibt stehen; das einfache Mausrad rollt wie überall
  const zoomBei = (clientX: number, richtung: 1 | -1) => {
    const z = Math.max(0, Math.min(ZOOM.length - 1, zoom() + richtung)); if (z === zoom()) return;
    const mx = svgX(clientX), tag = achse().t0 + mx / px(), vorher = flaeche.scrollLeft;
    setZoom(z);
    requestAnimationFrame(() => { flaeche.scrollLeft = vorher + ((tag - achse().t0) * px() - mx); });
  };
  // Ansicht wie bisher: zu einem Tag rollen (Anteil der Breite links davor), den ganzen Plan einpassen, zur markierten Leistung
  const zumTag = (tag: number, anteil: number) => { flaeche.scrollLeft = Math.max(0, (tag - achse().t0) * px() - (flaeche.clientWidth - breiteT()) * anteil); };   // die Spalten links stehen fest (sticky)
  const ganzerPlan = () => {
    const t = [...erg().termine.values()]; if (!t.length) return;
    const k = kal(); let a = Infinity, e = -Infinity;
    for (const x of t) { a = Math.min(a, k.tag(x.s)); e = Math.max(e, k.tag(Math.max(x.s, x.f - 1)) + 1); }
    const frei = flaeche.clientWidth - breiteT() - 40;
    let z = 0; for (let i = ZOOM.length - 1; i >= 0; i--) if ((e - a) * ZOOM[i]! <= frei) { z = i; break; }
    setZoom(z); queueMicrotask(() => zumTag(a, 0.02));
  };
  const zurLeistung = () => { const t = erg().termine.get(markiert() ?? ''); if (t) zumTag(kal().tag(t.s), 0.05); };
  const austauschMenue = (e: MouseEvent) => zeigeMenue(e, [
    { titel: 'Excel / CSV', tun: () => speichern(csvAus(plan()), 'csv', 'text/csv;charset=utf-8') },
    { titel: 'MS Project (XML)', tun: () => speichern(mspdiAus(plan(), titel()), 'xml', 'application/xml') },
    { titel: 'Sicherung (.gantt)', tun: () => speichern(planJsonAus(plan(), titel(), (zp()?.werte ?? {}) as Record<string, Wert>, lebend('freier_tag')), 'gantt', 'application/json') },
  ]);
  const einlesen = () => dateiWaehlen('.gantt,.json,application/json', async (d) => { const inhalt = await d.text();
    void vorschauZeigen({ titel: `Plan einlesen – ${d.name}`, wartetext: 'Die Datei wird gelesen und mit dieser Version verglichen …', fertig: 'Der Plan ist übernommen.' }, () => ruf<Vorschau>('/api/bauzeitenplan/einlesen', { version: z().version, inhalt })); });
  // Auf dem Handy nur Nummer und Leistung links – der Platz gehört den Balken
  const schmal = geraetHandy;
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

  // Zeitachse: vom Montag vor dem Anfang bis vier Wochen nach dem Ende – und mindestens so weit, dass sie die sichtbare Fläche füllt
  const [sichtBreite, setSichtBreite] = createSignal(0);
  const achse = createMemo(() => {
    const k = kal(), t = [...erg().termine.values()];
    let a = k.tag(0), e = k.tag(Math.max(1, erg().ende));
    for (const x of t) { a = Math.min(a, k.tag(x.s)); e = Math.max(e, k.tag(Math.max(x.s, x.f - 1))); }
    a -= 7 + wochentag(a - 7);
    const fuellen = Math.ceil((sichtBreite() - spalten().reduce((n, c) => n + c.breite, 0)) / px());
    return { t0: a, t1: Math.max(e + 28, a + fuellen) };
  });
  const x = (w: number) => (kal().tag(w) - achse().t0) * px();
  const xEnde = (s: number, f: number) => (f > s ? (kal().tag(f - 1) + 1 - achse().t0) * px() : x(s));
  const breiteL = () => spalten().reduce((s, c) => s + c.breite, 0);
  const breiteR = () => (achse().t1 - achse().t0 + 1) * px();
  // Tabelle | Diagramm wie bisher: die Trennung lässt sich ziehen (je Gerät gemerkt), die Tabelle rollt in ihrem Teil waagerecht
  const [teilWunsch, setTeilWunsch] = createSignal<number>(holen('bzp.teil', 0));
  createEffect(() => merken('bzp.teil', teilWunsch()));
  const breiteT = () => Math.max(120, Math.min(breiteL(), teilWunsch() || Math.round(sichtBreite() * 0.6), sichtBreite() - 160));
  const [tabX, setTabX] = createSignal(0);
  const tabXMax = () => Math.max(0, breiteL() - breiteT());
  createEffect(() => { if (tabX() > tabXMax()) setTabX(tabXMax()); });
  const tabRollen = (e: WheelEvent) => {
    const d = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    if (!d || e.ctrlKey || !tabXMax()) return;
    e.preventDefault(); e.stopPropagation(); setTabX(Math.max(0, Math.min(tabXMax(), tabX() + d)));
  };
  const teilerZiehen = (e: PointerEvent) => {
    if (e.button !== 0) return; e.preventDefault();
    const el = e.currentTarget as HTMLElement, x0 = e.clientX, w0 = breiteT(); el.setPointerCapture(e.pointerId);
    el.onpointermove = (m) => setTeilWunsch(Math.round(w0 + m.clientX - x0));
    el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; };
  };

  // ---------- Tabelle: Zeiger, Bearbeiten ----------
  // Markieren zeigt die Karte rechts (wie bisher); Doppelklick, Umschalt+Enter oder „Informationen“ springen hinein
  const wahl = zeilenwahl({ reihe: () => vorgaenge().map((v) => v.id), sichtbar: () => sichtbar().map((v) => v.id), onZeiger: (id) => p.onWahl(id) });
  const { markiert, auswahl, setMarkiert, istGewaehlt, gewaehlt } = wahl;
  const zeileKlick = (e: MouseEvent, id: string) => wahl.klick(e, id);
  createEffect(() => { const g = p.gewaehlt(); if (g && g !== untrack(markiert)) wahl.zeigerStill(g); });   // z. B. Sprung aus der Suche
  const oeffnen = (id = markiert()) => { if (id) { setMarkiert(id); p.onWahl(id); p.onOeffnen(); } };
  const [spalte, setSpalte] = createSignal<Spalte['id']>('name');
  const [edit, setEdit] = createSignal<{ id: string | 'neu'; spalte: Spalte['id']; text: string } | null>(null);
  let flaeche!: HTMLDivElement;
  // Die Balkenfläche reicht immer bis unten: auch unter der letzten Leistung lässt sich eine neue aufziehen (sie kommt ans Ende)
  const [sichtHoehe, setSichtHoehe] = createSignal(0);
  onMount(() => { const ro = new ResizeObserver(() => { setSichtHoehe(flaeche.clientHeight); setSichtBreite(flaeche.clientWidth); }); ro.observe(flaeche); onCleanup(() => ro.disconnect()); });
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
  // Doppelklick auf eine Trennlinie im Kopf: alle Spalten passend zum Inhalt (wie in jeder Tabelle); Einrückung, Klappe und Ordner gemessen
  const spaltenPassend = () => {
    const zelle = flaeche.querySelector('.bzp-zeilen .bzp-zelle') ?? flaeche;
    const sp = spalten(), zellen: Parameters<typeof zusatzMessen>[0] = [], sb = sichtbar();
    flaeche.querySelectorAll('.bzp-zeilen .bzp-zeile').forEach((r, k) => r.querySelectorAll(':scope > .bzp-zelle').forEach((el, i) => {
      const s = sp[i], v = sb[k]; if (s && v) zellen.push({ spalte: s.id, el, text: wert(v, s.id) });
    }));
    spw.allePassend((n) => vorgaenge().map((v) => wert(v, n as Spalte['id'])), getComputedStyle(zelle).font, `600 13px ${getComputedStyle(flaeche).fontFamily}`, zusatzMessen(zellen, getComputedStyle(zelle).font));
  };
  // Summe der Arbeit je Gruppe (Dauer ihrer Leistungen) – für „Dauer der Gruppen: Summe“
  const summen = createMemo(() => {
    const m = new Map<string, number>();
    for (const v of vorgaenge()) {
      const t = erg().termine.get(v.id); if (!t || t.gruppe) continue;
      const d = abschnitteLesen(v.werte.unterbrechung as string)?.reduce((a, b) => a + b.dauer, 0) ?? Number(v.werte.dauer ?? 0);
      for (let e = t.eltern; e; e = erg().termine.get(e)?.eltern ?? null) m.set(e, (m.get(e) ?? 0) + d);
    }
    return m;
  });
  // Text an einem Balken (Beschriftung links / im Balken / rechts)
  const beschrift = (v: Zeile, k: string): string => {
    const t = erg().termine.get(v.id);
    switch (k) {
      case 'name': return String(v.werte.name ?? '');
      case 'name_firma': return `${String(v.werte.name ?? '')}${v.werte.unternehmer ? ` · ${v.werte.unternehmer}` : ''}`;
      case 'unternehmer': return String(v.werte.unternehmer ?? '');
      case 'gewerk': return String(v.werte.gewerk ?? '');
      case 'dauer': return wert(v, 'dauer');
      case 'anfang': return kurz(t?.anfang ?? '');
      case 'ende': return kurz(t?.ende ?? '');
      case 'daten': return t ? `${kurz(t.anfang)} – ${kurz(t.ende)}` : '';
      case 'pct': return `${Math.round(Number(v.werte.fortschritt ?? 0))} %`;
      default: return '';
    }
  };
  const wert = (v: Zeile, s: Spalte['id']): string => {
    const t = erg().termine.get(v.id);
    switch (s) {
      case 'nr': return String(t?.nr ?? '');
      case 'name': return String(v.werte.name ?? '');
      case 'dauer': {
        if (!t) return '';
        if (!t.gruppe) return `${abschnitteLesen(v.werte.unterbrechung as string)?.reduce((a, b) => a + b.dauer, 0) ?? Number(v.werte.dauer ?? 0)} T`;
        const gd = gruppenDauer(), sum = summen().get(v.id) ?? 0;
        return gd === 'summe' ? `${sum} T` : gd === 'beides' ? `${sum} T · ${t.f - t.s} T` : `${t.f - t.s} T`;
      }
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
  // Zwischenablage (Strg+C/X/V, wie im bisherigen Bauportal): die gewählten Leistungen mit allem darunter und den Verknüpfungen
  // zwischen ihnen – in diesem Browser gemerkt, also auch über Pläne und Versionen hinweg. Eingefügt wird unter der markierten Zeile
  // (hinter ihrer Gruppe), auf ihrer Ebene.
  const KOPIERT = ['name', 'dauer', 'anfang_nicht_vor', 'unterbrechung', 'gewerk', 'vob', 'unternehmer', 'firma', 'farbe', 'notiz'];
  const [ablage, setAblageRoh] = createSignal<Ablage | null>((() => { try { return JSON.parse(localStorage.getItem('bzp.ablage') ?? 'null') as Ablage | null; } catch { return null; } })());
  const setAblage = (a: Ablage) => { setAblageRoh(a); try { localStorage.setItem('bzp.ablage', JSON.stringify(a)); } catch { /* nur in diesem Fenster */ } };
  const werteVon = (id: string) => { const v = vorgaenge().find((x) => x.id === id)!; return Object.fromEntries(KOPIERT.map((k) => [k, v.werte[k] ?? null])); };
  const anzahlText = (n: number) => `${n} ${n === 1 ? 'Leistung' : 'Leistungen'}`;
  const einfuegenBei = (a: Ablage, ziel: number, ebene: number | undefined, titel: string) => {
    if (!schreiben() || !a.zeilen.length) return;
    const r = ablageEinfuegen(V_(), ziel, a, zu(), neueKennung, ebene);
    tun(r.befehle, titel);
    const neu = [...r.neu.values()];
    wahl.mehrere(neu);
  };
  /** unter der markierten Zeile, hinter ihrer Gruppe, auf ihrer Ebene (ohne Markierung am Ende) */
  const unterMarkierter = (): [number, number | undefined] => { const v = V_(), i = v.findIndex((x) => x.id === markiert()); return i < 0 ? [v.length, undefined] : [block(v, i), v[i]!.ebene]; };
  const kopieren = () => { const ids = gewaehlt(); if (!ids.length) return; setAblage(ablageAus(V_(), L_(), ids, werteVon)); hinweis(`${anzahlText(ablage()!.zeilen.length)} kopiert – mit Strg+V unter einer Zeile einfügen.`); };
  const ausschneiden = () => { const ids = gewaehlt(); if (!ids.length) return; setAblage(ablageAus(V_(), L_(), ids, werteVon)); entfernen(ids); };
  const ablageEinfuegenHier = () => { const a = ablage(); if (!a) return hinweis('Nichts zum Einfügen – erst Leistungen kopieren (Strg+C).', { art: 'fehler' }); const [z, e] = unterMarkierter(); einfuegenBei(a, z, e, `${anzahlText(a.zeilen.length)} einfügen`); };
  // Änderung am Master → auf Nachfrage in alle Kopien (gerechnet in module/bauzeitenplan/master.ts)
  const masterSchritt = ({ wieder, gegen }: { wieder: KernVorlage[]; gegen: KernVorlage[] }) => {
    const r = masterNachziehen(wieder, gegen, { v: V_, l: L_, werte: (id) => sicht.vorgang?.[id]?.werte, linkAlt: (id) => sicht.verknuepfung?.[id]?.werte,
      kopienDer: (id) => vorgaenge().filter((x) => x.werte.kopie_von === id).map((x) => x.id), z: zu(), neu: neueKennung, autom: autom() });
    if (r) hinweis(`„${r.mname}“ ist Master von ${r.kopien} ${r.kopien === 1 ? 'Kopie' : 'Kopien'}.`, { aktion: { titel: `In ${r.kopien === 1 ? 'die Kopie' : `alle ${r.kopien} Kopien`} übernehmen`, tun: () => ausfuehrenMehrere(r.uebernehmen(), `Änderung am Master „${r.mname}“ in die Kopien übernehmen`) } });
  };
  nachEigenemSchritt.add(masterSchritt); onCleanup(() => nachEigenemSchritt.delete(masterSchritt));
  // Gruppieren …: Gliederung nach Gebäudeteil, Bauphase, Gewerk, Firma neu bilden (im Fenster mit Vorschau)
  const [grp, setGrp] = createSignal(false);
  const GV_ = (): GV[] => vorgaenge().map((v) => ({ id: v.id, reihe: Number(v.werte.reihe ?? 0), ebene: Number(v.werte.ebene ?? 0), kennung: String(v.werte.kennung ?? ''), name: String(v.werte.name ?? ''),
    gewerk: String(v.werte.gewerk ?? ''), firma: String((v.werte.firma && sicht.kontakt?.[String(v.werte.firma)]?.werte.name) || v.werte.unternehmer || ''), abschnitt: String(v.werte.abschnitt ?? ''), teil: String(v.werte.teil ?? '') }));
  // Detail grob · mittel · fein: oberste Gruppen zu · innerste Gruppen zu · alles offen (die Leistungen bleiben darunter erhalten)
  const gruppenIds = () => { const l = vorgaenge(); return l.filter((v, i) => Number(l[i + 1]?.werte.ebene ?? -1) > Number(v.werte.ebene ?? 0)); };
  const detail = (stufe: 'grob' | 'mittel' | 'fein') => {
    const l = vorgaenge(), g = gruppenIds();
    if (stufe === 'fein') return setEingeklappt(new Set<string>());
    if (stufe === 'grob') return setEingeklappt(new Set(g.filter((v) => Number(v.werte.ebene ?? 0) === 0).map((v) => v.id)));
    // mittel: Gruppen, in denen keine weitere Gruppe steckt
    setEingeklappt(new Set(g.filter((v) => { const i = l.indexOf(v), e = Number(v.werte.ebene ?? 0); for (let k = i + 1; k < l.length && Number(l[k]!.werte.ebene ?? 0) > e; k++) if (g.includes(l[k]!)) return false; return true; }).map((v) => v.id)));
  };
  const detailJetzt = () => { const z = eingeklappt(), g = gruppenIds(); return !z.size ? 'fein' : g.filter((v) => Number(v.werte.ebene ?? 0) === 0).every((v) => z.has(v.id)) ? 'grob' : 'mittel'; };
  // Duplizieren … (Strg+D): Kopien mit Master, Verknüpfung wählbar – im Fenster mit Vorschau
  const [dupl, setDupl] = createSignal<string[] | null>(null);
  const duplizieren = () => { const ids = gewaehlt(); if (ids.length && schreiben()) setDupl(ids); };
  const probe = (vg: Zeile[], lk: Zeile[]) => planAus({ vorgaenge: vg, links: lk, zeitplan: zp()?.werte, frei: lebend('freier_tag'), land: land() ?? '', heute: new Date().toLocaleDateString('sv') });
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
  const UV = () => vorgaenge().map((v) => ({ id: v.id, reihe: Number(v.werte.reihe ?? 0), ebene: Number(v.werte.ebene ?? 0), dauer: Number(v.werte.dauer ?? 0), gewerk: String(v.werte.gewerk ?? ''), unterbrechung: (v.werte.unterbrechung as string | null) ?? null }));
  const [umlegeFrage, setUmlegeFrage] = createSignal<{ ids: string[]; posten: { id: string; dauer: number; ziel: string | null }[] } | null>(null);
  const entfernen = (ids = gewaehlt(), zuordnung?: { dauer: number; ziel: string | null }[]) => {
    if (!ids.length || !darf('vorgang', 'loeschen')) return;
    if (!zuordnung && loeschFragen()) {
      const posten = umlegenVorschlag(UV(), L_(), ids);
      if (posten.some((x) => x.ziel)) { setUmlegeFrage({ ids, posten }); return; }
    }
    const i = zeileIndex(), name = ids.length === 1 ? `„${String(vorgaenge().find((v) => v.id === ids[0])?.werte.name ?? '')}“` : anzahlText(ids.length);
    tun([...(zuordnung ? umlegen(UV(), zuordnung) : []), ...loeschen(V_(), L_(), ids, zu(), neueKennung, autom())], `${name} löschen`);
    queueMicrotask(() => waehle(i));
  };
  // Aufklappen öffnet nur die nächste Stufe: Untergruppen der aufgeklappten Gruppe bleiben zu
  const umschalten = (id: string) => setEingeklappt((s) => {
    const n = new Set(s);
    if (!n.has(id)) { n.add(id); return n; }
    n.delete(id);
    for (const g of gruppenIds()) if (erg().termine.get(g.id)?.eltern === id) n.add(g.id);
    return n;
  });

  const taste = (e: KeyboardEvent) => {
    if (edit() || (e.target as HTMLElement).closest('input, select, .bzp-leiste')) return;
    const i = zeileIndex(), c = spalten().findIndex((s) => s.id === spalte()), id = markiert();
    const k = e.key;
    if (e.altKey && e.shiftKey && id && schreiben()) {
      const art = ({ ArrowRight: 'ein', ArrowLeft: 'aus', ArrowUp: 'hoch', ArrowDown: 'runter' } as const)[k as 'ArrowRight'];
      if (art) { e.preventDefault(); gliederung(art); }
      return;
    }
    // Windows-Tasten: Strg+C/X/V kopieren, ausschneiden, einfügen · Strg+D duplizieren · Strg+A alle · Esc nur noch die markierte
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const t = k.toLowerCase();
      if (t === 'a') { e.preventDefault(); wahl.alle(); return; }
      if (t === 'c' && id) { e.preventDefault(); kopieren(); return; }
      if (schreiben() && t === 'x' && id && darf('vorgang', 'loeschen')) { e.preventDefault(); ausschneiden(); return; }
      if (schreiben() && t === 'v') { e.preventDefault(); ablageEinfuegenHier(); return; }
      if (schreiben() && t === 'd' && id) { e.preventDefault(); duplizieren(); return; }
    }
    if (k === 'Escape' && teilen()) { e.preventDefault(); setTeilenRoh(false); return; }
    if (k === 'Escape' && auswahl().size > 1 && id) { e.preventDefault(); setMarkiert(id); return; }
    // Umschalt+↑/↓: Auswahl erweitern
    if ((k === 'ArrowDown' || k === 'ArrowUp') && e.shiftKey && id) {
      e.preventDefault();
      const l = sichtbar(), n = l[Math.max(0, Math.min(l.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))];
      if (n) wahl.erweitern(n.id);
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
  const [ziehen, setZiehen] = createSignal<{ id: string; art: 'schieben' | 'dauer' | 'anfang' | 'link' | 'neu'; x0: number; dx: number; y: number; yMaus: number; xs?: number; teil?: number | null } | null>(null);
  const tageAus = (dx: number) => Math.round(dx / px());
  const startZiehen = (e: PointerEvent, v: Zeile, art: 'schieben' | 'dauer' | 'anfang' | 'link', y: number, teil: number | null = null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (teilen()) { teilenAn(e, v); return; }
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
      const r = flaeche.getBoundingClientRect(), links = Math.max(r.left, r.left + breiteT() - flaeche.scrollLeft), RAND = 40;
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
    // ein Teil einer unterbrochenen Leistung: nur dieser Teil (die anderen bleiben stehen)
    const ab = abschnitteLesen(v.werte.unterbrechung as string);
    if (g.teil != null && ab && ab.length > 1) {
      const r = teilAendern(ab, g.teil, g.art === 'dauer' ? 'ende' : g.art === 'anfang' ? 'anfang' : 'schieben', d);
      if (typeof r === 'string') return hinweis(r, { art: 'fehler' });
      ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { unterbrechung: abschnitteSchreiben(r.abschnitte), dauer: r.abschnitte.reduce((x, a) => x + a.dauer, 0),
        ...(r.anfang ? { anfang_nicht_vor: isoAus(k.tag(k.arbeitstag(k.tag(t.s) + r.anfang))) } : {}) } }, `Teil ${g.teil + 1} von „${name}“ ${g.art === 'schieben' ? 'verschieben' : 'ändern'}`);
      return;
    }
    if (g.art === 'anfang') {   // linke Kante: der Anfang wandert, das Ende bleibt
      const dauer = Number(v.werte.dauer ?? 0) - d;
      if (dauer < 1) return hinweis('Eine Leistung braucht mindestens einen Tag – für einen Meilenstein die Dauer 0 in der Karte eintragen.', { art: 'fehler' });
      ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { anfang_nicht_vor: isoAus(k.tag(k.arbeitstag(k.tag(t.s) + d))), dauer } }, `Anfang von „${name}“ ändern`);
      return;
    }
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
  // ---------- Zeilen ziehen (links in der Tabelle): die gewählten an eine andere Stelle; mit Strg als Kopie ----------
  const [zeilenZug, setZeilenZug] = createSignal<{ ids: string[]; ziel: number; kopie: boolean } | null>(null);
  let klickSchlucken = false;
  const zeileDruecken = (e: PointerEvent, id: string) => {
    if (e.button !== 0 || !schreiben() || edit() || (e.target as Element).closest('input, .klappe, button')) return;
    const liste = (e.currentTarget as HTMLElement).parentElement!;
    const stelle = (m: PointerEvent) => Math.max(0, Math.min(sichtbar().length, Math.round((m.clientY - liste.getBoundingClientRect().top) / H)));
    // derselbe Baustein wie im LV: Schwelle, mehrere gewählte, Strg kopiert, Esc bricht ab
    zeilenZiehen<number>({
      start: e,
      ids: () => { if (!istGewaehlt(id)) setMarkiert(id); return gewaehlt(); },
      ziel: (m) => stelle(m),
      onZug: (z) => setZeilenZug(z ? { ids: z.ids, ziel: z.ziel, kopie: z.kopie } : null),
      onAblegen: (z) => {
        klickSchlucken = true; setTimeout(() => (klickSchlucken = false));
        const l = sichtbar(), v = V_(), i = z.ziel, ziel = i < l.length ? v.findIndex((x) => x.id === l[i]!.id) : v.length;
        if (z.kopie) einfuegenBei(ablageAus(v, L_(), z.ids, werteVon), ziel, undefined, `${anzahlText(bloeckeVon(v, z.ids).reduce((n, [a, b]) => n + b - a, 0))} kopieren`);
        else tun(verschiebenNach(v, z.ids, ziel), `${anzahlText(z.ids.length)} verschieben`);
      },
    });
  };
  // Vorschau beim Ziehen: die ganze Leistung (teil null) oder nur ein Teil einer unterbrochenen – verschoben bzw. eine Kante
  const verschiebung = (id: string) => { const g = ziehen(); return g && g.id === id && g.art === 'schieben' && g.teil == null ? tageAus(g.dx) * px() : 0; };
  const verlaengerung = (id: string) => { const g = ziehen(); return g && g.id === id && g.art === 'dauer' && g.teil == null ? tageAus(g.dx) * px() : 0; };
  const teilVersatz = (id: string, k: number, letzter: boolean): { x: number; w: number } => {
    const g = ziehen(); if (!g || g.id !== id) return { x: 0, w: 0 };
    const D = tageAus(g.dx) * px();
    if (g.teil == null) return g.art === 'schieben' ? { x: D, w: 0 } : g.art === 'dauer' && letzter ? { x: 0, w: D } : g.art === 'anfang' && k === 0 ? { x: D, w: -D } : { x: 0, w: 0 };
    if (g.teil !== k) return { x: 0, w: 0 };
    return g.art === 'schieben' ? { x: D, w: 0 } : g.art === 'anfang' ? { x: D, w: -D } : g.art === 'dauer' ? { x: 0, w: D } : { x: 0, w: 0 };
  };

  // ---------- Pfeile ----------
  const pfeilListe = createMemo(() => pfeilWege(L_(), erg().termine, new Map(sichtbar().map((v, i) => [v.id, i])), pfeile(), markiert(), { x, xEnde, h: H }));
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
    // auf einer gewählten Zeile gilt das Menü für alle gewählten (wie im Explorer)
    if (istGewaehlt(v.id) && auswahl().size > 1) {
      wahl.zeiger(v.id);
      const n = anzahlText(auswahl().size);
      return zeigeMenue(e, [
        ...(schreiben() ? [{ titel: `${n} ändern …`, tun: () => feldSetzenOeffnen('vorgang', gewaehlt(), ['projekt', 'version'], 'gewählt') }] : []),   // wie bisher „Mehrere Leistungen bearbeiten“
        { titel: `${n} kopieren`, tun: kopieren },
        ...(schreiben() ? [{ titel: `${n} duplizieren …`, tun: duplizieren }, { titel: 'Einfügen darunter', gesperrt: !ablage(), tun: ablageEinfuegenHier }] : []),
        ...(schreiben() && darf('vorgang', 'loeschen') ? [{ titel: `${n} ausschneiden`, tun: ausschneiden }, { titel: `${n} löschen`, gefahr: true, tun: () => entfernen() }] : []),
      ]);
    }
    setMarkiert(v.id);
    zeigeMenue(e, [
      { titel: 'Informationen …', tun: () => oeffnen(v.id) },
      ...(schreiben() ? [
        { titel: 'Leistung darunter einfügen', tun: () => neuDarunter() },
        { titel: 'Kopieren', tun: kopieren },
        ...(darf('vorgang', 'loeschen') ? [{ titel: 'Ausschneiden', tun: ausschneiden }] : []),
        { titel: 'Einfügen darunter', gesperrt: !ablage(), tun: ablageEinfuegenHier },
        { titel: 'Duplizieren …', tun: duplizieren },
        // wie bisher höchstens 9 Punkte: Unterbrechen und Entfernen teilen sich einen Platz, „Anfang wieder automatisch“ nur, wenn er fest ist
        abschnitteLesen(v.werte.unterbrechung as string)
          ? { titel: 'Unterbrechungen entfernen', tun: () => { const ab = abschnitteLesen(v.werte.unterbrechung as string)!; ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { unterbrechung: '', dauer: ab.reduce((x, a) => x + a.dauer, 0) } }, `Unterbrechungen von „${String(v.werte.name ?? '')}“ entfernen`); } }
          : { titel: 'Hier unterbrechen …', gesperrt: erg().termine.get(v.id)!.gruppe || Number(v.werte.dauer ?? 0) < 2, tun: () => teilenAn(e, v) },
        ...(v.werte.anfang_nicht_vor ? [{ titel: 'Anfang wieder automatisch', tun: () => ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { anfang_nicht_vor: null } }, 'Anfang wieder automatisch') }] : []),
      ] : []),
      ...(darf('vorgang', 'loeschen') ? [{ titel: 'Löschen', gefahr: true, tun: () => entfernen([v.id]) }] : []),
    ]);
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
  const grundText = (g: unknown) => { const o = modell('vorgang').felder.find((f) => f.name === 'ueberzug_grund')?.optionen?.find((x) => x.wert === g); return g ? (o?.titel ?? String(g)) : ''; };


  return (
    <div class="bzp">
      <Show when={erg().zyklen.length}><p class="feld-fehler bzp-warnung">Zirkelbezug: {erg().zyklen.length} Verknüpfung{erg().zyklen.length > 1 ? 'en gelten' : ' gilt'} nicht</p></Show>
      <div class="bzp-rahmen">
      <div class="bzp-flaeche" classList={{ teilen: teilen(), 'zeilen-band': zeilenArt() === 'band', 'zeilen-linie': zeilenArt() === 'linie' }} ref={flaeche} tabIndex={0} onKeyDown={taste} aria-label="Balkenplan" role="grid"
        style={{ '--bzp-t': `${breiteT()}px`, '--bzp-tx': `${-tabX()}px` }}
        onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); zoomBei(e.clientX, e.deltaY < 0 ? 1 : -1); } else if (e.clientX - flaeche.getBoundingClientRect().left < breiteT()) tabRollen(e); }}>
        <div class="bzp-innen" style={{ width: `${breiteT() + breiteR()}px`, height: `${KOPF + flaechenZeilen() * H}px` }}>
          <div class="bzp-kopf" style={{ width: `${breiteT() + breiteR()}px` }}>
            <div class="bzp-links bzp-kopfzellen" onContextMenu={(e) => { e.preventDefault(); setSpaltenFeld({ x: e.clientX, y: e.clientY }); }}>
              <For each={spalten()}>{(s) => (
                // wie in jeder Tabelle: Kopf mit der Maus verschieben (Reihenfolge), an der Kante ziehen (Breite)
                <div class="bzp-zelle" classList={{ rechts: !!s.rechts }} style={{ width: `${s.breite}px` }} {...(schmal() ? {} : spw.ziehbar(s.id))}>{s.titel}
                  <Show when={!schmal()}><i class="griff" aria-hidden="true" title="Ziehen: Breite ändern · Doppelklick: alle Spalten passend zum Inhalt" onPointerDown={(e) => spw.breiteZiehen(e, s.id)} onDblClick={(e) => { e.stopPropagation(); spaltenPassend(); }} /></Show>
                </div>)}</For>
            </div>
            <svg class="bzp-achse" width={breiteR()} height={KOPF}>
              <For each={kopf().monate}>{(m) => <><line x1={m.x} x2={m.x} y1={0} y2={KOPF} class="bzp-linie" /><text x={m.x + 4} y={16} class={kopf().tage ? "bzp-woche-oben" : "bzp-monat"}>{m.w > 50 ? m.t : ''}</text></>}</For>
              <For each={kopf().unten}>{(u) => <><line x1={u.x} x2={u.x} y1={24} y2={KOPF} class="bzp-linie" /><text x={kopf().tage ? u.x + px() / 2 : u.x + 3} y={39} class="bzp-woche" classList={{ frei: !!u.frei }} text-anchor={kopf().tage ? 'middle' : 'start'}>{u.t}</text></>}</For>
            </svg>
          </div>
          <svg class="bzp-balken" width={breiteR()} height={flaechenZeilen() * H} style={{ left: `${breiteT()}px`, top: `${KOPF}px` }}
            onPointerDown={aufziehen} onPointerMove={bewegen} onPointerUp={loslassen}>
            <defs><pattern id="bzp-schraffur" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--gefahr-hell)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--gefahr)" stroke-width="2" /></pattern></defs>
            <For each={freieTage()}>{(f) => <rect x={f.x} y={0} width={px()} height="100%" class={f.feiertag ? 'bzp-feiertag' : 'bzp-wochenende'}>{f.feiertag ? <title>{f.feiertag}</title> : null}</rect>}</For>
            <For each={sichtbar()}>{(v, i) => <rect x={0} y={i() * H} width="100%" height={H} class="bzp-streifen" classList={{ gewaehlt: v.id === markiert() || istGewaehlt(v.id), band: i() % 2 === 1 }} />}</For>
            <line x1={heute()} x2={heute()} y1={0} y2="100%" class="bzp-heute" />
            <For each={sichtbar()}>{(v, i) => {
              const t = (): Termin | undefined => erg().termine.get(v.id);
              const y = () => i() * H;
              const fb = () => balkenFarbe(v.werte, farben());
              return (
                <Show when={t()}>{(tt) => (
                  <g class="bzp-vorgang" onDblClick={() => oeffnen(v.id)} onContextMenu={(e) => balkenMenue(e, v)}>
                    <Show when={tt().gruppe} fallback={
                      <Show when={tt().f > tt().s} fallback={
                        <path d={`M${x(tt().s) + verschiebung(v.id)},${y() + 7} l8,8 l-8,8 l-8,-8 z`} class="bzp-meilenstein" onPointerDown={(e) => startZiehen(e, v, 'schieben', y())} />}>
                        <For each={tt().abschnitte}>{(a, k) => (
                          <>
                            <Show when={k() > 0}><line x1={xEnde(tt().abschnitte[k() - 1]!.s, tt().abschnitte[k() - 1]!.f) + verschiebung(v.id)} x2={x(a.s) + verschiebung(v.id)} y1={y() + H / 2} y2={y() + H / 2} class="bzp-pause" /></Show>
                            {(() => { const geteilt = () => tt().abschnitte.length > 1, o = () => teilVersatz(v.id, k(), k() === tt().abschnitte.length - 1), links = () => x(a.s) + o().x, breite = () => Math.max(2, xEnde(a.s, a.f) - x(a.s) + o().w);
                              return <>
                                <rect x={links()} y={y() + 8} rx={3} height={14} width={breite()}
                                  fill={fb()} class="bzp-balken-teil" classList={{ kritisch: kritisch() && tt().kritisch }} onPointerDown={(e) => startZiehen(e, v, 'schieben', y(), geteilt() ? k() : null)}>
                                  <Show when={geteilt()}><title>{`Teil ${k() + 1}: ziehen verschiebt nur diesen Teil`}</title></Show></rect>
                                {/* Kanten zum Greifen (breiter als sie aussehen): links der Anfang, rechts das Ende – bei geteilten je Teil */}
                                <Show when={schreiben()}>
                                  <rect x={links() - 5} y={y() + 4} width={10} height={22} class="bzp-griff" onPointerDown={(e) => startZiehen(e, v, 'anfang', y(), geteilt() ? k() : null)}><title>Ziehen ändert den Anfang</title></rect>
                                  <Show when={geteilt() && k() < tt().abschnitte.length - 1}><rect x={links() + breite() - 5} y={y() + 4} width={10} height={22} class="bzp-griff" onPointerDown={(e) => startZiehen(e, v, 'dauer', y(), k())}><title>Ziehen ändert das Ende dieses Teils</title></rect></Show>
                                </Show>
                              </>; })()}
                          </>
                        )}</For>
                        <Show when={vgl()?.je.get(v.id)?.soll}>{(so) => (
                          <rect x={(tagAus(so().anfang) - achse().t0) * px()} y={y() + 23} height={4} rx={2} width={Math.max(2, (tagAus(so().ende) + 1 - tagAus(so().anfang)) * px())} class="bzp-soll"><title>{`Soll: ${kurz(so().anfang)} – ${kurz(so().ende)}`}</title></rect>)}</Show>
                        <Show when={tt().ueberzug > 0}>{(_) => { const la = () => tt().abschnitte[tt().abschnitte.length - 1]!; return (
                          // später fertig als geplant: das Stück am Ende schraffiert (wie bisher), mit Grund als Hinweis
                          <rect x={xEnde(la().s, la().f - tt().ueberzug) + verschiebung(v.id)} y={y() + 6} height={18} width={Math.max(2, xEnde(la().s, la().f) - xEnde(la().s, la().f - tt().ueberzug))} class="bzp-ueberzug">
                            <title>{`Fertig ${tt().ueberzug} AT später als geplant${grundText(v.werte.ueberzug_grund) ? ` – ${grundText(v.werte.ueberzug_grund)}` : ''}`}</title></rect>); }}</Show>
                        <Show when={Number(v.werte.fortschritt ?? 0) > 0}>
                          <rect x={x(tt().s) + verschiebung(v.id)} y={y() + 13} height={4} width={(xEnde(tt().s, tt().f) - x(tt().s)) * Math.min(100, Number(v.werte.fortschritt)) / 100} class="bzp-fortschritt" />
                        </Show>
                        <Show when={beschriftung().m && xEnde(tt().s, tt().f) - x(tt().s) >= 30}>
                          <text x={x(tt().s) + verschiebung(v.id) + 3} y={y() + 19} class="bzp-pct">{beschrift(v, beschriftung().m)}</text>
                        </Show>
                        <rect x={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) + teilVersatz(v.id, tt().abschnitte.length - 1, true).w * Number(ziehen()?.teil != null) - 5} y={y() + 4} width={10} height={22} class="bzp-griff" onPointerDown={(e) => startZiehen(e, v, 'dauer', y(), tt().abschnitte.length > 1 ? tt().abschnitte.length - 1 : null)}><title>Ziehen ändert die Dauer</title></rect>
                      </Show>
                    }>
                      <path d={`M${x(tt().s)},${y() + 9} H${xEnde(tt().s, tt().f)} v10 l-5,-4 H${x(tt().s) + 5} l-5,4 z`} class="bzp-gruppe" />
                    </Show>
                    <Show when={schreiben()}><circle cx={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) + 9} cy={y() + H / 2} r={6} class="bzp-punkt" onPointerDown={(e) => startZiehen(e, v, 'link', y(), tt().abschnitte.length > 1 ? tt().abschnitte.length - 1 : null)}><title>Auf eine andere Leistung ziehen: verknüpfen</title></circle>
                      {/* geteilte Leistung: auch jeder frühere Teil hat seinen Punkt – Pfeile gehen von und zu jedem Teil */}
                      <For each={tt().abschnitte.length > 1 ? tt().abschnitte.slice(0, -1) : []}>{(a, k) => (
                        <circle cx={xEnde(a.s, a.f) + verschiebung(v.id) + 4} cy={y() + H / 2 - 9} r={5} class="bzp-punkt" onPointerDown={(e) => startZiehen(e, v, 'link', y(), k())}><title>{`Teil ${k() + 1} auf eine andere Leistung ziehen: verknüpfen`}</title></circle>
                      )}</For></Show>
                    <text x={xEnde(tt().s, tt().f) + verschiebung(v.id) + verlaengerung(v.id) + 18} y={y() + 19} class="bzp-text">{beschrift(v, beschriftung().r)}<Show when={vgl()?.je.get(v.id)}>{(g) => <Show when={g().art === 'neu' || g().tage}><tspan class="bzp-soll-text" classList={{ spaet: g().tage > 0, frueh: g().tage < 0 }}>{g().art === 'neu' ? '  neu' : `  ${g().tage > 0 ? '+' : ''}${g().tage} T`}</tspan></Show>}</Show></text>
                    <Show when={beschriftung().l}><text x={x(tt().s) + verschiebung(v.id) - 6} y={y() + 19} class="bzp-text bzp-text-links">{beschrift(v, beschriftung().l)}</text></Show>
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
          <div class="bzp-zeilen" style={{ top: `${KOPF}px`, width: `${breiteT() + breiteR()}px` }}>
            <For each={sichtbar()}>{(v) => {
              const t = () => erg().termine.get(v.id);
              return (
                <div class="bzp-links bzp-zeile" classList={{ 'soll-neu': vgl()?.je.get(v.id)?.art === 'neu', gewaehlt: v.id === markiert() || istGewaehlt(v.id), gruppe: !!t()?.gruppe, kritisch: kritisch() && !!t()?.kritisch }} role="row" aria-selected={istGewaehlt(v.id)}
                  onClick={(e) => { if (!klickSchlucken) zeileKlick(e, v.id); }} onPointerDown={(e) => zeileDruecken(e, v.id)} onDblClick={() => oeffnen(v.id)} onContextMenu={(e) => balkenMenue(e, v)}>
                  <For each={spalten()}>{(s) => (
                    <div class="bzp-zelle" role="gridcell" classList={{ rechts: !!s.rechts, zeiger: v.id === markiert() && spalte() === s.id, fest: !!(s.id === 'anfang' && v.werte.anfang_nicht_vor) }} style={{ width: `${s.breite}px` }}
                      onClick={() => setSpalte(s.id)} onDblClick={(e) => { if (BEARBEITBAR.has(s.id) && schreiben()) { e.stopPropagation(); bearbeiten(v.id, s.id); } }}>
                      <Show when={edit()?.id === v.id && edit()?.spalte === s.id} fallback={
                        s.id === 'name'
                          ? <span class="bzp-name" style={{ 'padding-left': `${Number(v.werte.ebene ?? 0) * 16}px` }}>
                              <Show when={t()?.gruppe} fallback={<i class="klappe-platz" />}><Klappe zu={eingeklappt().has(v.id)} onKlick={() => umschalten(v.id)} /><Ordner offen={!eingeklappt().has(v.id)} /></Show>
                              <Show when={!t()?.gruppe}><i class="bzp-farbe" style={{ background: balkenFarbe(v.werte, farben()) }} /></Show>
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
            <Show when={zeilenZug()}>{(z) => <div class="bzp-zug-linie" classList={{ kopie: z().kopie }} style={{ top: `${z().ziel * H - 1}px`, width: `${breiteT()}px` }}><span>{z().kopie ? `+ ${anzahlText(z().ids.length)} kopieren` : `${anzahlText(z().ids.length)} hierher`}</span></div>}</Show>
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
      <div class="bzp-teiler" style={{ left: `${breiteT() - 3}px` }} title="Ziehen: Tabelle breiter oder schmaler · Doppelklick: ganze Tabelle · in der Tabelle mit Umschalt+Mausrad seitlich rollen" onPointerDown={teilerZiehen} onDblClick={() => setTeilWunsch(breiteL())} />
      </div>
      <div class="bzp-status" role="status">
        <span>{vorgaenge().length} {vorgaenge().length === 1 ? 'Leistung' : 'Leistungen'}</span>
        <Show when={erg().termine.size}>
          <span>Anfang {tagname(erg().termine.size ? [...erg().termine.values()].reduce((m, t) => (t.anfang < m ? t.anfang : m), '9999') : '')}</span>
          <span>Ende <strong>{tagname(erg().endeDatum)}</strong></span>
          <span class="nur-breit">{erg().ende} Arbeitstage</span>
        </Show>
        <Show when={vgl()}>{(g) => <span class="bzp-soll-stand" classList={{ spaet: g().abweichung > 0 }} title={String(g().soll.werte.begruendung ?? '')}>
          Soll „{String(g().soll.werte.name ?? '')}“: Ende {tagname(g().endeSoll)} → {tagname(g().endeIst)}{g().abweichung ? ` (${g().abweichung > 0 ? '+' : ''}${g().abweichung} T)` : ''}{g().entfallen.length ? ` · ${g().entfallen.length} entfallen` : ''}</span>}</Show>
        <span class="nur-breit">{kal().woche}-Tage-Woche</span>
        <span class="nur-breit">Feiertage {zp()?.werte.bundesland ? BUNDESLAENDER.find((b) => b.wert === zp()!.werte.bundesland)?.titel : land() ? `${BUNDESLAENDER.find((b) => b.wert === land())?.titel} (Baustelle)` : 'bundesweit'}</span>
        <Show when={schreiben()}><span class="nur-breit">{autom() ? 'Neue Leistungen: automatisch verknüpft' : 'Neue Leistungen: ohne Verknüpfung'}</span></Show>
        {/* Zoom wie im bisherigen Bauportal unten rechts – nur hier im Plan, keine gemeinsame Fußzeile */}
        <label class="bzp-zoom nur-breit-flex" title="Zeitachse enger oder weiter"><Zeichen name="kleiner" groesse={14} />
          <input type="range" min={0} max={ZOOM.length - 1} step={1} value={zoom()} aria-label="Zoom der Zeitachse" onInput={(e) => setZoom(Number(e.currentTarget.value))} />
          <Zeichen name="groesser" groesse={14} /></label>
      </div>
      <Show when={assi()}><PlanAssistent projekt={z().projekt} version={z().version} gespeichert={String(zp()?.werte.assistent ?? '')} onZu={() => setAssi(false)} /></Show>
      <Show when={drucken()}><PlanDrucken plan={plan()} projekt={z().projekt} version={z().version} onZu={() => setDrucken(false)} /></Show>
      <Show when={!vorgaenge().length}><p class="still-text bzp-leer">Noch keine Leistungen. Mit „✦ Assistent“ entsteht ein Plan aus dem Gebäudemodell – oder unten in „+ Neue Leistung“ tippen: Dauer „5“, „2w“; Vorgänger „3;4AA+2t“.</p></Show>
      <Show when={satz()}><PlanSatz vorgaenge={vorgaenge()} links={links()} plan={plan()} probe={probe} zu={zu()} neu={neueKennung} onAusfuehren={(b, t) => tun(b, t)} onZu={() => setSatz(false)} /></Show>
      <Show when={darstellung()}><DarstellungFenster beschriftung={beschriftung()} onBeschriftung={setBeschriftung} pfeile={pfeile()} onPfeile={setPfeile}
        gruppenDauer={gruppenDauer()} onGruppenDauer={setGruppenDauer} zeilen={zeilenArt()} onZeilen={setZeilenArt} loeschFragen={loeschFragen()} onLoeschFragen={setLoeschFragen}
        onAlle={(auf) => setEingeklappt(new Set(auf ? [] : gruppenIds().map((g) => g.id)))} onZu={() => setDarstellung(false)} /></Show>
      <Show when={umlegeFrage()}>{(f) => <UmlegenFenster posten={f().posten} vorgaenge={vorgaenge()} gesperrt={new Set(f().ids)} fragen={loeschFragen()} onFragen={setLoeschFragen}
        onZu={() => setUmlegeFrage(null)} onLos={(z) => { const ids = f().ids; setUmlegeFrage(null); entfernen(ids, z); }} />}</Show>
      <Show when={dupl()}>{(ids) => <DuplizierenFenster v={V_()} l={L_()} ids={ids()} vorgaenge={vorgaenge()} links={links()} plan={plan()} probe={probe} werteVon={werteVon} zu={zu()} neu={neueKennung}
        onZu={() => setDupl(null)} onFertig={(b, tops, t) => { tun(b, t); setDupl(null); wahl.mehrere(tops); }} />}</Show>
      <Show when={sollFenster() === 'fest'}><SollFesthalten bisher={sollJetzt()} zusammenhang={zu()} ist={istZeilen} onZu={() => setSollFenster(null)} /></Show>
      <Show when={sollFenster() === 'zurueck' && sollJetzt()}>{(x) => <SollZurueck soll={x()} onZu={() => setSollFenster(null)} />}</Show>
      <Show when={grp()}><GruppierenFenster v={GV_()} l={L_()} zu={zu()} neu={neueKennung} onZu={() => setGrp(false)}
        onFertig={(b) => { tun(b, 'Gruppieren'); setGrp(false); setEingeklappt(new Set<string>()); }} /></Show>
      <Show when={spaltenFeld()}>{(o) => <Spaltenfeld spalten={spw} ort={o()} onZu={() => setSpaltenFeld(null)} />}</Show>
    </div>
  );
}

function kw(t: number): number {
  const d = t + 3 - wochentag(t);   // Donnerstag derselben Woche
  const j = Number(isoAus(d).slice(0, 4));
  return 1 + Math.floor((d - tagAus(`${j}-01-01`)) / 7);
}

/** Rückfrage beim Löschen (wie bisher): je gelöschter Leistung mit Dauer das Ziel, auf das ihre Dauer umgelegt wird – oder „entfällt“. */
function UmlegenFenster(p: { posten: { id: string; dauer: number; ziel: string | null }[]; vorgaenge: Zeile[]; gesperrt: Set<string>; fragen: boolean; onFragen: (an: boolean) => void;
  onZu: () => void; onLos: (z: { dauer: number; ziel: string | null }[]) => void }) {
  const [ziele, setZiele] = createSignal(p.posten.map((x) => x.ziel ?? ''));
  const name = (id: string) => String(p.vorgaenge.find((v) => v.id === id)?.werte.name ?? '');
  // wählbar: Leistungen mit Dauer, die bleiben (keine Gruppen)
  const optionen = () => [{ wert: '', titel: '– entfällt –' }, ...p.vorgaenge.filter((v, i) => !p.gesperrt.has(v.id) && Number(v.werte.dauer ?? 0) > 0
    && !(i + 1 < p.vorgaenge.length && Number(p.vorgaenge[i + 1]!.werte.ebene ?? 0) > Number(v.werte.ebene ?? 0))).map((v) => ({ wert: v.id, titel: String(v.werte.name ?? '') }))];
  const summe = () => p.posten.reduce((a, x) => a + x.dauer, 0);
  return (
    <Dialog titel="Leistungen löschen" breite={700} onAbbrechen={p.onZu}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button>
        <span class="knopf-paar"><button class="knopf" onClick={() => p.onLos([])}>Gesamtzeit verkürzen</button>
        <button class="knopf haupt" onClick={() => p.onLos(p.posten.map((x, i) => ({ dauer: x.dauer, ziel: ziele()[i] || null })))}>Dauer umlegen</button></span></>}>
      <p>{p.posten.length === 1 ? 'Die Leistung wird' : `${p.posten.length} Leistungen werden`} gelöscht – zusammen <b>{summe()} T</b> Arbeit. Soll sich die Gesamtzeit verkürzen oder wird die Dauer auf die Hauptleistung umgelegt?</p>
      <table class="einlesen-tabelle">
        <thead><tr><th>Gelöschte Leistung</th><th style={{ width: '80px' }}>Dauer</th><th>Dauer umlegen auf</th></tr></thead>
        <tbody><For each={p.posten}>{(x, i) => (
          <tr><td>{name(x.id)}</td><td>{x.dauer} T</td>
            <td><Auswahlliste titel={`${name(x.id)}: Dauer umlegen auf`} wert={ziele()[i()] ?? ''} optionen={optionen()} onWert={(w: string) => setZiele(ziele().map((z, k) => (k === i() ? w : z)))} /></td></tr>
        )}</For></tbody>
      </table>
      <label class="haken-zeile"><input type="checkbox" checked={!p.fragen} onChange={(e) => p.onFragen(!e.currentTarget.checked)} /> nicht mehr fragen (immer verkürzen) – wieder einschalten unter „Darstellung“</label>
    </Dialog>
  );
}

const BESCHRIFTUNG = [{ wert: '', titel: '– keine –' }, { wert: 'name', titel: 'Leistung' }, { wert: 'name_firma', titel: 'Leistung · Unternehmer:in' }, { wert: 'unternehmer', titel: 'Unternehmer:in' },
  { wert: 'gewerk', titel: 'Gewerk' }, { wert: 'dauer', titel: 'Dauer' }, { wert: 'anfang', titel: 'Anfang' }, { wert: 'ende', titel: 'Ende' }, { wert: 'daten', titel: 'Anfang – Ende' }, { wert: 'pct', titel: '% abgeschlossen' }];
/** Darstellung wie bisher: Beschriftung der Balken, Pfeile, Dauer der Gruppen, Zeilen, Gruppen auf/zu, beim Löschen fragen – wirkt sofort. */
function DarstellungFenster(p: { beschriftung: { l: string; m: string; r: string }; onBeschriftung: (b: { l: string; m: string; r: string }) => void; pfeile: string; onPfeile: (w: 'markiert' | 'alle' | 'kritisch' | 'keine') => void;
  gruppenDauer: string; onGruppenDauer: (w: 'spanne' | 'summe' | 'beides') => void; zeilen: string; onZeilen: (w: '' | 'band' | 'linie') => void; loeschFragen: boolean; onLoeschFragen: (an: boolean) => void;
  onAlle: (auf: boolean) => void; onZu: () => void }) {
  const feld = (titel: string, wert: string, optionen: { wert: string; titel: string }[], setzen: (w: string) => void) => (
    <div class="feld"><label>{titel}</label><Auswahlliste titel={titel} wert={wert} optionen={optionen} onWert={setzen} /></div>);
  return (
    <Dialog titel="Darstellung" breite={620} onAbbrechen={p.onZu} knoepfe={<button class="knopf haupt" onClick={p.onZu}>Fertig</button>}>
      <h3>Beschriftung der Balken</h3>
      <div class="raster drei">
        {feld('Links', p.beschriftung.l, BESCHRIFTUNG, (w) => p.onBeschriftung({ ...p.beschriftung, l: w }))}
        {feld('Im Balken', p.beschriftung.m, BESCHRIFTUNG, (w) => p.onBeschriftung({ ...p.beschriftung, m: w }))}
        {feld('Rechts', p.beschriftung.r, BESCHRIFTUNG, (w) => p.onBeschriftung({ ...p.beschriftung, r: w }))}
      </div>
      <h3>Anzeige</h3>
      <div class="raster">
        {feld('Verknüpfungspfeile', p.pfeile, [{ wert: 'alle', titel: 'alle anzeigen' }, { wert: 'markiert', titel: 'nur bei markierten Leistungen' }, { wert: 'kritisch', titel: 'nur kritischer Weg' }, { wert: 'keine', titel: 'keine anzeigen' }], (w) => p.onPfeile(w as 'alle'))}
        {feld('Dauer der Gruppen', p.gruppenDauer, [{ wert: 'spanne', titel: 'Zeitspanne (wie MS Project)' }, { wert: 'summe', titel: 'Summe der Leistungen' }, { wert: 'beides', titel: 'Summe und Zeitspanne' }], (w) => p.onGruppenDauer(w as 'spanne'))}
        {feld('Zeilen', p.zeilen, [{ wert: '', titel: 'Markierte Zeilen farbig' }, { wert: 'band', titel: 'Bänderung – jede zweite Zeile getönt' }, { wert: 'linie', titel: 'Nur die aktive Zeile – dünner roter Rahmen' }], (w) => p.onZeilen(w as ''))}
      </div>
      <h3>Gruppen</h3>
      <p><button class="knopf" onClick={() => p.onAlle(true)}>alle aufklappen</button> <button class="knopf" onClick={() => p.onAlle(false)}>alle zuklappen</button></p>
      <label class="haken-zeile"><input type="checkbox" checked={p.loeschFragen} onChange={(e) => p.onLoeschFragen(e.currentTarget.checked)} /> Beim Löschen fragen, ob die Dauer auf eine Hauptleistung umgelegt wird</label>
    </Dialog>
  );
}
