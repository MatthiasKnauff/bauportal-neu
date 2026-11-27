// Baustein „Tabelle“ (Platz Mitte): Spalten aus dem Datenmodell. Sortieren, Filtern je Spalte, Spalten einstellen,
// Bearbeiten direkt in der Zelle wie im bisherigen Bauportal: Zelle anklicken und tippen (oder F2); Doppelklick öffnet den
// Eintrag (onDoppelklick, z. B. im Schwebefenster). Tastatur, Kontextmenü.
// Im Dokument stehen nur die sichtbaren Zeilen – die Tabelle bleibt auch mit tausenden Einträgen schnell.
import { datumAusText, datumText } from '../../kern/datum';
import { For, Show, createEffect, createMemo, createSelector, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { mengenSumme, type Feld, type ObjektModell, type Wert } from '../../kern/modell';
import { HERKUNFT, type Zeile } from '../../kern/befehl';
import { anzeige, excelWert } from './feld';
import { zeigeMenue, type Menuepunkt } from './kontextmenue';
import { spaltenFuer, zusatzMessen } from './spalten';
import { Spaltenfeld } from './spaltenfeld';
import { Haken, KopfHaken, auswahlKlick, langTippen, type Auswahl } from './auswahl';
import { objektname } from '../unterbau/abgleich';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const ZEILENHOEHE = 37;
/** Diese Feldarten lassen sich in der Zelle schreiben; Ja/Nein schaltet der Doppelklick um. Alles andere öffnet die Karte. */
const IN_ZELLE = ['text', 'zahl', 'datum', 'email', 'telefon'];

// ☎ und ✉ hinter Telefonnummern und E-Mail-Adressen – direkt anrufen oder schreiben (wie im bisherigen Bauportal)
function Verbinden(p: { f: Feld; w: Wert | undefined }) {
  const ziel = () => (!p.w ? '' : p.f.art === 'telefon' ? `tel:${String(p.w).replace(/[^\d+]/g, '')}` : p.f.art === 'email' ? `mailto:${String(p.w)}` : '');
  return <Show when={ziel()}><a class="zelle-verbinden" href={ziel()} title={p.f.art === 'telefon' ? 'Anrufen' : 'E-Mail schreiben'} aria-label={p.f.art === 'telefon' ? `${String(p.w)} anrufen` : `E-Mail an ${String(p.w)}`}
    onClick={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()}>{p.f.art === 'telefon' ? '☎' : '✉'}</a></Show>;
}

// Filterfeld mit Vorschlägen aus den Einträgen der Spalte: Der Filter nimmt alles, was den Text enthält
// („dach“ → Dach, Dachdecker, Dacharbeiten); die Liste darunter zeigt diese Werte mit Anzahl – ↑↓ wählen, Enter übernimmt.
function FilterFeld(p: { f: Feld; text: string; werte: () => string[]; onText: (t: string) => void; onFest?: (t: string) => void; onWeiter: () => void }) {
  const [offen, setOffen] = createSignal(false);
  const [markiert, setMarkiert] = createSignal(-1);
  const vorschlaege = createMemo(() => {
    if (!offen()) return [];
    const t = p.text.trim().toLowerCase();
    const zahl = new Map<string, number>();
    for (const w of p.werte()) if (w && (!t || w.toLowerCase().includes(t))) zahl.set(w, (zahl.get(w) ?? 0) + 1);
    return [...zahl].sort((a, b) => Number(!a[0].toLowerCase().startsWith(t)) - Number(!b[0].toLowerCase().startsWith(t)) || vergleich.compare(a[0], b[0])).slice(0, 12);
  });
  const nehmen = (w: string) => { if (p.onFest) p.onFest(w); else p.onText(w); setOffen(false); setMarkiert(-1); };
  return (
    <div class="filterfeld">
      <input type="search" aria-label={`${p.f.titel} filtern`} placeholder="filtern" value={p.text} autocomplete="off" role="combobox" aria-expanded={offen() && vorschlaege().length > 0}
        onInput={(e) => { p.onText(e.currentTarget.value); setOffen(true); setMarkiert(-1); }} onFocus={() => setOffen(true)} onBlur={() => setTimeout(() => setOffen(false), 150)}
        onKeyDown={(e) => {
          e.stopPropagation();
          const l = vorschlaege();
          if (e.key === 'Escape') { if (offen() && l.length) setOffen(false); else p.onText(''); }
          else if (e.key === 'ArrowDown' && offen() && l.length) { e.preventDefault(); setMarkiert(Math.min(l.length - 1, markiert() + 1)); }
          else if (e.key === 'ArrowUp' && offen() && markiert() >= 0) { e.preventDefault(); setMarkiert(markiert() - 1); }
          else if (e.key === 'Enter' && markiert() >= 0 && l[markiert()]) { e.preventDefault(); nehmen(l[markiert()]![0]); }
          else if (e.key === 'Enter' && p.text.trim() && p.onFest) { e.preventDefault(); nehmen(p.text); }
          else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOffen(false); p.onWeiter(); }
        }} />
      <Show when={offen() && vorschlaege().length > 0}>
        <ul class="filter-vorschlaege" role="listbox" aria-label={`Werte in ${p.f.titel}`}>
          <For each={vorschlaege()}>{([w, n], i) => (
            <li role="option" aria-selected={markiert() === i()} classList={{ markiert: markiert() === i() }} onMouseDown={(e) => { e.preventDefault(); nehmen(w); }}>
              <span>{w}</span><span class="anzahl">{n}</span>
            </li>
          )}</For>
        </ul>
      </Show>
    </div>
  );
}

export interface Sortierung { feld: string; ab: boolean }
/** Zeilen nach einem Feld sortieren, wie es angezeigt wird (natürliche Zahlen, ohne Groß/klein) – für Tabelle und Kacheln gleich. */
export function sortieren(zeilen: Zeile[], m: ObjektModell, s: Sortierung): Zeile[] {
  const f = m.felder.find((x) => x.name === s.feld) ?? m.felder.find((x) => x.name === m.anzeigeFeld)!;
  // ohne Abhören lesen: die Zeilen kommen bei jeder Änderung neu, das genügt als Auslöser
  const schluessel = new Map(zeilen.map((z) => { const r = unwrap(z); return [r.id, anzeige(f, r.werte[f.name])]; }));
  return [...zeilen].sort((a, b) => vergleich.compare(schluessel.get(a.id)!, schluessel.get(b.id)!) * (s.ab ? -1 : 1));
}
export interface TabellenSteuer { spaltenEinstellen: () => void; fokus: () => void; ersteWaehlen: () => void; alsZeilen: (ids?: Set<string>) => (string | number | Date | null)[][] }

export function Tabelle(p: {
  modell: ObjektModell;
  zeilen: Zeile[];                              // schon gefiltert; sortiert wird hier
  onReihe?: (ids: string[]) => void;            // meldet die gezeigte Reihenfolge (z. B. zum Blättern in der Karte)
  gewaehlt: string | null;
  onWahl: (id: string | null) => void;
  onOeffnen?: (z: Zeile) => void;               // Enter: den Eintrag rechts in der Karte zeigen
  onDoppelklick?: (z: Zeile) => void;           // Doppelklick: den Eintrag öffnen (ohne Angabe wie Enter)
  filter?: Record<string, string>;              // Filterzeile: Text je Spalte (gefiltert wird außerhalb – so stimmt auch der Zähler)
  onFilter?: (feld: string, text: string) => void;
  onFilterFest?: (feld: string, text: string) => void;   // Enter oder Vorschlag: der Wert wird ein fester Filter (wandert nach links)
  filterWerte?: (f: Feld) => string[];          // alle Werte der Spalte (ungefiltert) – für die Vorschläge im Filterfeld
  onZelle?: (z: Zeile, f: Feld, w: Wert) => string | undefined;   // Wert aus der Zelle übernehmen; liefert den Fehlertext, wenn er nicht passt
  onLoeschen?: (z: Zeile) => void;              // Entf
  onSuche?: () => void;                         // Taste /
  zeilenMenue?: (z: Zeile) => Menuepunkt[];
  zelle?: (f: Feld, z: Zeile) => JSX.Element | undefined;
  leer: string;
  fuss?: JSX.Element;                           // z. B. Summenzeile
  steuer?: (s: TabellenSteuer) => void;
  sort?: () => Sortierung; onSort?: (s: Sortierung) => void;   // Sortierung von außen (sonst eigene)
  reihenfolgeFest?: boolean;                    // Zeilen bleiben in der gegebenen Reihenfolge (z. B. vom Server sortiert und seitenweise geladen)
  onEnde?: () => void;                          // die letzten Zeilen kommen in Sicht – z. B. um die nächste Seite zu holen
  auswahl?: Auswahl;                            // mehrere wählen: Haken vorn, Strg/Umschalt+Klick, Strg+A (Baustein Auswahl)
  auswahlMenue?: (e: MouseEvent) => void;       // rechte Maustaste auf einer gewählten Zeile
  zeilenKlasse?: (z: Zeile) => Record<string, boolean>;   // Zeile hervorheben (z. B. „Nachfassen fällig“, „gibt nicht ab“)
  summe?: (f: Feld, zeilen: Zeile[]) => string | undefined;   // Summenzeile je Spalte (der gezeigten Zeilen); in der ersten Spalte ohne Summe steht summeTitel
  summeTitel?: string;
}) {
  const m = p.modell;
  const spalten = spaltenFuer(m);
  // Sortierung: eigene, oder von außen geführt (Stellschraube sort/onSort – z. B. gemeinsam mit den Kacheln derselben Ansicht)
  const [eigen, setEigen] = createSignal<Sortierung>({ feld: m.sortierFeld ?? m.anzeigeFeld, ab: false });
  const sort = () => p.sort?.() ?? eigen();
  const setSort = (f: (s: Sortierung) => Sortierung) => { const n = f(sort()); if (p.onSort) p.onSort(n); else setEigen(n); };
  const [spaltenFeld, setSpaltenFeld] = createSignal<{ x: number; y: number } | null>(null);   // kleines Feld „Spalten“ am Tabellenkopf
  // ohne Mausposition (Knopf ☰): oben rechts an der Tabelle
  const spaltenAuf = (e?: MouseEvent) => { const r = kasten.getBoundingClientRect(); setSpaltenFeld(e ? { x: e.clientX, y: e.clientY } : { x: r.right - 250, y: r.top + 8 }); };
  const [rollen, setRollen] = createSignal({ oben: 0, hoehe: 600 });
  const [platz, setPlatz] = createSignal(0);   // Breite, die die Tabelle hat – kein waagerechtes Rollen in der Standardbreite
  const istGewaehlt = createSelector(() => p.gewaehlt);
  const [inArbeit, setInArbeit] = createSignal<{ id: string; feld: string; fehler?: string; start?: string } | null>(null);
  const [zelle, setZelle] = createSignal<{ id: string; feld: string } | null>(null);   // zuletzt angeklickte Zelle – Tippen schreibt hinein
  const kopfHoehe = () => (p.onFilter ? 71 : 35);
  let kasten!: HTMLDivElement;

  const sortiert = createMemo(() => (p.reihenfolgeFest ? p.zeilen : sortieren(p.zeilen, m, sort())));
  createEffect(() => p.onReihe?.(sortiert().map((z) => z.id)));
  const fenster = createMemo(() => {
    const von = Math.max(0, Math.floor(rollen().oben / ZEILENHOEHE) - 8);
    const bis = Math.min(sortiert().length, Math.ceil((rollen().oben + rollen().hoehe) / ZEILENHOEHE) + 8);
    return { von, bis, teil: sortiert().slice(von, bis) };
  });
  createEffect(() => { const f = fenster(); if (p.onEnde && sortiert().length && f.bis >= sortiert().length - 20) untrack(() => p.onEnde!()); });
  const reihe = () => sortiert().map((z) => z.id);
  const HAKEN = 34;   // Spalte für die Haken der Auswahl
  const haken = () => (p.auswahl ? HAKEN : 0);   // feste Breite – schmaler werden nur die Spalten
  const summe = createMemo(() => spalten.sichtbare().reduce((s, f) => s + spalten.breite(f), 0));
  // Voreingestellt passen die Spalten in den Platz: zu breite werden alle im selben Verhältnis schmaler – kein waagerechtes Rollen.
  // Hat der Benutzer Breiten gezogen, gelten sie genau wie in Excel; wird die Tabelle breiter als der Platz, rollt sie waagerecht.
  const faktor = () => (!spalten.eigeneBreiten() && platz() && summe() + haken() > platz() ? (platz() - haken()) / summe() : 1);
  const breite = () => summe() * faktor() + haken();
  const spaltenbreite = (f: Feld) => spalten.breite(f) * faktor();

  const waehle = (z: Zeile | undefined) => {
    if (!z) return;
    p.onWahl(z.id);
    const oben = sortiert().indexOf(z) * ZEILENHOEHE, kopf = kopfHoehe();
    if (oben < kasten.scrollTop) kasten.scrollTop = oben;
    else if (oben + ZEILENHOEHE + kopf > kasten.scrollTop + kasten.clientHeight) kasten.scrollTop = oben + ZEILENHOEHE + kopf - kasten.clientHeight;
  };
  onMount(() => {
    const b = new ResizeObserver(() => { setRollen((r) => ({ ...r, hoehe: kasten.clientHeight })); setPlatz(kasten.clientWidth); });
    b.observe(kasten);
    onCleanup(() => b.disconnect());
    p.steuer?.({
      spaltenEinstellen: () => spaltenAuf(),
      fokus: () => kasten.focus(),
      ersteWaehlen: () => { kasten.scrollTop = 0; if (!sortiert().some((z) => z.id === p.gewaehlt)) waehle(sortiert()[0]); },
      // so, wie die Tabelle gerade aussieht: gezeigte Spalten in ihrer Reihenfolge, gefilterte Zeilen in ihrer Sortierung
      alsZeilen: (ids) => [spalten.sichtbare().map((f) => f.titel), ...sortiert().filter((z) => !ids || ids.has(z.id)).map((z) => spalten.sichtbare().map((f) => excelWert(f, z.werte[f.name])))],
    });
  });

  const tasten = (e: KeyboardEvent) => {
    const l = sortiert();
    const i = l.findIndex((z) => z.id === p.gewaehlt);
    const seite = Math.max(1, Math.floor(kasten.clientHeight / ZEILENHOEHE) - 2);
    const schritt: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + seite, PageUp: i - seite, Home: 0, End: l.length - 1 };
    if (e.key in schritt) { e.preventDefault(); waehle(l[Math.max(0, Math.min(l.length - 1, schritt[e.key]!))]); }
    else if (e.key === 'Enter' && l[i] && p.onOeffnen) { e.preventDefault(); p.onOeffnen(l[i]); }
    else if (e.key === 'F2' && l[i]) { const f = (zelle()?.id === l[i].id && spalten.sichtbare().find((x) => x.name === zelle()!.feld && IN_ZELLE.includes(x.art))) || spalten.sichtbare().find((x) => p.onZelle && IN_ZELLE.includes(x.art)); if (f && p.onZelle) { e.preventDefault(); setInArbeit({ id: l[i].id, feld: f.name }); } }
    else if (e.key === ' ' && l[i] && p.onZelle && zelle()?.id === l[i].id) {   // Leertaste schaltet Ja/Nein in der angeklickten Zelle
      const f = m.felder.find((x) => x.name === zelle()!.feld); if (f?.art === 'ja_nein' && !p.zelle?.(f, l[i])) { e.preventDefault(); p.onZelle(l[i], f, l[i].werte[f.name] !== true); } }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && l[i] && p.onZelle && zelle()?.id === l[i].id) {   // Zelle angeklickt und tippen
      const f = m.felder.find((x) => x.name === zelle()!.feld); if (f && IN_ZELLE.includes(f.art) && f.art !== 'datum') { e.preventDefault(); setInArbeit({ id: l[i].id, feld: f.name, start: e.key }); } }
    else if (e.key === 'Delete' && l[i] && p.onLoeschen) { e.preventDefault(); const z = l[i]; waehle(l[i + 1] ?? l[i - 1]); p.onLoeschen(z); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && p.auswahl) { e.preventDefault(); p.auswahl.alle(reihe(), true); }
    else if (e.key === 'Escape' && p.auswahl?.anzahl()) { e.preventDefault(); p.auswahl.leeren(); }
    else if (e.key === 'Escape' && p.gewaehlt) { e.preventDefault(); p.onWahl(null); }
    else if (e.key === '/' && p.onSuche) { e.preventDefault(); p.onSuche(); }
  };

  // ---- Bearbeiten in der Zelle ----
  const zeigen = (f: Feld, w: Wert | undefined) => (w === null || w === undefined ? '' : typeof w === 'number' ? String(w).replace('.', ',') : f.art === 'datum' ? datumText(w) : String(w));
  // Der erste Klick eines Doppelklicks wählt die Zeile – dabei kann die Karte aufgehen und die Spalten rücken.
  // Gemeint ist die Zelle des ersten Klicks, deshalb wird sie gemerkt.
  const doppelklick = (z: Zeile) => (p.onDoppelklick ?? p.onOeffnen)?.(z);
  /** Übernimmt die Eingabe. weiter: +1/-1 = danach die nächste/vorige schreibbare Zelle der Zeile öffnen (Tab). */
  const fertig = (z: Zeile, f: Feld, feld: HTMLInputElement, weiter = 0) => {
    if (inArbeit()?.id !== z.id || inArbeit()?.feld !== f.name) return;   // schon weitergezogen (Tab) oder abgebrochen
    const iso = f.art === 'datum' ? datumAusText(feld.value) : feld.value;   // Datum wie man es schreibt (27.11.26, +1w) → JJJJ-MM-TT
    const fehler = feld.value === zeigen(f, z.werte[f.name]) ? undefined : iso === null ? 'Bitte ein Datum eintragen (TT.MM.JJJJ)' : p.onZelle!(z, f, iso);
    if (fehler) { setInArbeit({ id: z.id, feld: f.name, fehler }); feld.focus(); return; }
    const reihe = spalten.sichtbare().filter((x) => IN_ZELLE.includes(x.art));
    const naechste = weiter ? reihe[reihe.indexOf(f) + weiter] : undefined;
    setInArbeit(naechste ? { id: z.id, feld: naechste.name } : null);
    if (!naechste) kasten.focus();
  };
  const eingabeTaste = (e: KeyboardEvent, z: Zeile, f: Feld) => {
    e.stopPropagation();
    const feld = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') { e.preventDefault(); fertig(z, f, feld); }
    else if (e.key === 'Tab') { e.preventDefault(); fertig(z, f, feld, e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); setInArbeit(null); kasten.focus(); }
  };

  // Bevor zum ersten Mal eine Breite gesetzt wird, bleiben alle Spalten so breit, wie sie gerade zu sehen sind – nichts springt
  const festhalten = () => { if (!spalten.eigeneBreiten()) spalten.setzeBreiten(Object.fromEntries(spalten.sichtbare().map((x) => [x.name, spaltenbreite(x)]))); };
  // Vorläufige Summe unten: je Menge mit Einheitsfeld (Stellschraube „einheit“ im Datenmodell) über alle gezeigten Zeilen –
  // eine Summe, wenn die Einheiten passen; sonst „Einheiten gemischt“ mit den Summen je Einheit im Hinweis.
  const summenSpalten = createMemo(() => spalten.sichtbare().filter((f) => f.art === 'zahl' && f.einheit));
  const einheitText = (f: Feld, e: string) => { const ef = m.felder.find((x) => x.name === f.einheit); return ef ? anzeige(ef, e) || e : e; };
  // Summe je Spalte (Stellschraube summe): eine Zeile unter den gezeigten Zeilen, in der Reihenfolge der gewählten Spalten
  const spaltenSumme = () => <tr class="summenzeile spaltensumme"><Show when={p.auswahl}><td /></Show>
    <For each={spalten.sichtbare()}>{(f, i) => { const w = () => p.summe!(f, sortiert()); return <td classList={{ zahl: f.art === 'zahl' }}>{w() ?? (i() === 0 ? p.summeTitel ?? 'Summe' : '')}</td>; }}</For></tr>;
  const summenZeile = () => {
    const werte = sortiert().map((z) => unwrap(z).werte);
    // über die ganze Breite: eine schmale Mengenspalte schneidet die Zahl sonst ab
    const teile = () => summenSpalten().map((f) => {
      const l = mengenSumme(werte, f);
      return l.length === 1 ? `${f.titel} ${anzeige(f, l[0]!.summe)} ${einheitText(f, l[0]!.einheit)}`.trim()
        : l.length ? `${f.titel}: Einheiten gemischt (${l.map((x) => `${anzeige(f, x.summe)} ${einheitText(f, x.einheit)}`.trim()).join(' · ')})` : '';
    }).filter(Boolean);
    return (
      <tr class="summenzeile">
        <td colSpan={spalten.sichtbare().length + (p.auswahl ? 1 : 0)}><span>Summe ({werte.length})</span><For each={teile()}>{(t) => <b>{t}</b>}</For></td>
      </tr>
    );
  };
  // Doppelklick auf eine Trennlinie: alle Spalten so breit wie ihr längster Inhalt (alle Zeilen, nicht nur die sichtbaren)
  const passend = () => {
    const zelle = kasten.querySelector('tbody td:not(.haken-zelle)') ?? kasten;
    // was eine Zelle außer dem Text zeigt (Symbol, Abstand eines Bausteins) – an den gezeigten Zeilen gemessen
    const sp = spalten.sichtbare(), gezeigt = sortiert().slice(fenster().von), zellen: Parameters<typeof zusatzMessen>[0] = [];
    kasten.querySelectorAll('tbody tr:not([aria-hidden]):not(.summenzeile)').forEach((tr, k) => tr.querySelectorAll('td:not(.haken-zelle)').forEach((td, i) => {
      const f = sp[i], z = gezeigt[k]; if (f && z) zellen.push({ spalte: f.name, el: td, text: anzeige(f, unwrap(z).werte[f.name]) });
    }));
    const zusatz = zusatzMessen(zellen, getComputedStyle(zelle).font);
    spalten.allePassend((n) => { const f = sp.find((x) => x.name === n)!; return sortiert().map((z) => anzeige(f, unwrap(z).werte[n])); },
      getComputedStyle(zelle).font, `600 13px ${getComputedStyle(kasten).fontFamily}`, zusatz);
  };

  return (
    <>
      <div class="tabelle-rollen" tabindex="0" ref={kasten} onKeyDown={tasten} onScroll={() => setRollen({ oben: kasten.scrollTop, hoehe: kasten.clientHeight })}>
        <table class="tabelle" style={{ width: `${breite()}px` }}>
          <colgroup><Show when={p.auswahl}><col style={{ width: `${HAKEN}px` }} /></Show><For each={spalten.sichtbare()}>{(f) => <col style={{ width: `${spaltenbreite(f)}px` }} />}</For></colgroup>
          <thead><tr onContextMenu={(e) => { e.preventDefault(); spaltenAuf(e); }}>
            <Show when={p.auswahl}>{(a) => <th class="haken-zelle" rowSpan={p.onFilter ? 2 : 1}><KopfHaken auswahl={a()} reihe={reihe} /></th>}</Show>
            <For each={spalten.sichtbare()}>{(f) => (
              <th aria-sort={!p.reihenfolgeFest && sort().feld === f.name ? (sort().ab ? 'descending' : 'ascending') : 'none'} {...spalten.ziehbar(f.name)}>
                <button onClick={() => { if (!p.reihenfolgeFest) setSort((s) => ({ feld: f.name, ab: s.feld === f.name ? !s.ab : false })); }}>
                  <span>{f.titel}</span><span class="pfeil">{!p.reihenfolgeFest && sort().feld === f.name ? (sort().ab ? '▼' : '▲') : ''}</span>
                </button>
                <i class="griff" aria-hidden="true" title="Ziehen: Breite ändern · Doppelklick: alle Spalten passend zum Inhalt" onPointerDown={(e) => spalten.breiteZiehen(e, f.name, festhalten)} onClick={(e) => e.stopPropagation()} onDblClick={(e) => { e.stopPropagation(); passend(); }} />
              </th>
            )}</For>
          </tr>
          <Show when={p.onFilter}>
            <tr class="filterzeile">
              <For each={spalten.sichtbare()}>{(f) => (
                <th><FilterFeld f={f} text={p.filter?.[f.name] ?? ''} werte={() => p.filterWerte?.(f) ?? []} onText={(t) => p.onFilter!(f.name, t)} onFest={p.onFilterFest ? (t) => p.onFilterFest!(f.name, t) : undefined}
                  onWeiter={() => { kasten.focus(); if (!sortiert().some((z) => z.id === p.gewaehlt)) waehle(sortiert()[0]); }} /></th>
              )}</For>
            </tr>
          </Show>
          </thead>
          <tbody>
            <tr aria-hidden="true" style={{ height: `${fenster().von * ZEILENHOEHE}px` }} />
            <For each={fenster().teil}>{(z) => { const lang = langTippen(p.auswahl, z.id); return (
              <tr classList={{ ...p.zeilenKlasse?.(z), gewaehlt: istGewaehlt(z.id), markiert: !!p.auswahl?.hat(z.id) }}
                onClick={(e) => { if (lang.schlucken(e) || auswahlKlick(p.auswahl, e, z.id, reihe)) return; p.onWahl(z.id); }}
                onPointerDown={lang.onPointerDown} onPointerMove={lang.onPointerMove} onPointerUp={lang.onPointerUp} onPointerCancel={lang.onPointerCancel}
                onContextMenu={(e) => { lang.onContextMenu(e); if (e.defaultPrevented) return; if (p.auswahl?.hat(z.id) && p.auswahlMenue) { e.preventDefault(); p.auswahlMenue(e); return; } if (!p.zeilenMenue) return; p.onWahl(z.id); zeigeMenue(e, p.zeilenMenue(z)); }}>
                <Show when={p.auswahl}>{(a) => <td class="haken-zelle"><Haken auswahl={a()} id={z.id} name={objektname(m, z.werte)} reihe={reihe} /></td>}</Show>
                <For each={spalten.sichtbare()}>{(f) => (
                  <td class={z.herkunft?.[f.name] ? `herkunft-${z.herkunft[f.name]}` : undefined} classList={{ 'in-arbeit': inArbeit()?.id === z.id && inArbeit()?.feld === f.name, 'aktiv-zelle': zelle()?.id === z.id && zelle()?.feld === f.name && istGewaehlt(z.id) && !inArbeit() }}
                    title={z.herkunft?.[f.name] ? HERKUNFT[z.herkunft[f.name]!] : undefined}
                    onClick={() => setZelle({ id: z.id, feld: f.name })} onDblClick={() => doppelklick(z)}>
                    <Show when={inArbeit()?.id === z.id && inArbeit()?.feld === f.name} fallback={p.zelle?.(f, z) ?? <><Verbinden f={f} w={z.werte[f.name]} />{anzeige(f, z.werte[f.name])}</>}>
                      <input ref={(el) => queueMicrotask(() => { el.focus(); if (inArbeit()?.start === undefined) el.select?.(); })} type="text" placeholder={f.art === 'datum' ? 'TT.MM.JJJJ' : undefined} inputMode={f.art === 'zahl' ? 'decimal' : undefined} value={inArbeit()?.start ?? zeigen(f, z.werte[f.name])}
                        aria-label={f.titel} aria-invalid={!!inArbeit()?.fehler} title={inArbeit()?.fehler} classList={{ falsch: !!inArbeit()?.fehler }}
                        onKeyDown={(e) => eingabeTaste(e, z, f)} onBlur={(e) => fertig(z, f, e.currentTarget)} onClick={(e) => e.stopPropagation()} onDblClick={(e) => e.stopPropagation()} />
                    </Show>
                  </td>
                )}</For>
              </tr>); }}</For>
            <tr aria-hidden="true" style={{ height: `${(sortiert().length - fenster().bis) * ZEILENHOEHE}px` }} />
          </tbody>
          <Show when={p.fuss ?? (p.summe ? spaltenSumme() : summenSpalten().length && sortiert().length > 1 ? summenZeile() : undefined)}>{(fuss) => <tfoot>{fuss()}</tfoot>}</Show>
        </table>
        <Show when={!sortiert().length}><div class="leer">{p.leer}</div></Show>
      </div>
      <Show when={spaltenFeld()}>{(o) => <Spaltenfeld spalten={spalten} ort={o()} onZu={() => setSpaltenFeld(null)} />}</Show>
    </>
  );
}

