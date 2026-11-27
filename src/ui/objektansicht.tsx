// Die übliche Ansicht eines Objekts: Sie baut nichts selbst, sondern setzt die fertigen Bausteine
// in den Rahmen – Baum links, Tabelle in die Mitte, Detailkarte rechts – und verbindet sie.
import { herunterladen } from './baukasten/herunterladen';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack, useContext, type JSX } from 'solid-js';
import { sprungAbholen } from './sprung';
import { unwrap } from 'solid-js/store';
import { Eingabefehler, leerwert, pruefeWerte, type ObjektModell, type Werte } from '../kern/modell';
import { enthaeltDazu, satz, werteIn } from '../kern/filterbedingung';
import { objektFilter } from './baukasten/objektfilter';
import { projektId } from './projekt';
import { Filterkaesten, Filtersuche } from './baukasten/filterkaesten';
import type { Vorlage, Zeile } from '../kern/befehl';
import { ausfuehrenMehrere, geaendert, lebende, objektname, rueckgaengig, sicht } from './unterbau/abgleich';
import { ausdrucke, darf, neueKennung, zustand } from './unterbau/api';
import { druckOeffnen, verzeichnisDrucken } from './druck';
import type { Anpassung } from './baukasten/anpassung';
import type { Knopf } from './baukasten/menueleiste';
import { Baum, type Knoten } from './baukasten/baum';
import { Seitenliste } from './baukasten/seitenliste';
import { sammelfilter, type LinksFilter } from '../kern/modul';
import { Schwebefenster } from './baukasten/schwebefenster';
import { Detailkarte, NeuFenster, inEigenemFenster, loesche, feldAendern } from './baukasten/detailkarte';
import { anzeige, excelWert } from './baukasten/feld';
import { AppUmgebung, Rahmen, type RahmenSteuer } from './baukasten/rahmen';
import { Tabelle, sortieren, type ExcelBedienung, type Sortierung, type TabellenSteuer } from './baukasten/tabelle';
import { wertAusText } from '../kern/werttext';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Kacheln } from './baukasten/kacheln';
import { Auswahlleiste, auswahlAnlegen, auswahlMenue, type AuswahlBefehl } from './baukasten/auswahl';
import { feldSetzenOeffnen } from './baukasten/feldsetzen';
import { Dialog } from './baukasten/dialog';
import { spaltenFuer } from './baukasten/spalten';
import { xlsxSchreiben } from '../kern/xlsx';
import { hinweis } from './unterbau/meldungen';
import { handy } from './unterbau/geraet';

const vergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
const TRENNER = '\u0001';

export function ObjektAnsicht(p: {
  schluessel: string; modell: ObjektModell; baum?: string[]; anpassung?: Anpassung;
  linksFilter?: LinksFilter[];   // links Filter in Abschnitten statt des Baums
  suchArten?: { titel: string; felder: string[] }[];   // weitere Arten der Filterbedingung, nur über das Suchfeld
  fest?: () => Werte;            // Zusammenhang: nur Einträge mit diesen Werten (Projekt, Version); neue bekommen sie
  unterMenue?: JSX.Element;      // z. B. die Dialoge der Versionen
  linksOben?: () => JSX.Element; // oben in der Gliederung, z. B. die Auswahl der Version
}) {
  const m = p.modell;
  const a = p.anpassung ?? {};
  // Spaltensätze der Tabelle (Stellschraube tabelle.saetze): der gewählte Reiter, je Ansicht gemerkt
  const satzSchluessel = `bp_spaltensatz_${p.schluessel}`;
  const [satzId, setSatzId] = createSignal<string>((() => { try { return localStorage.getItem(satzSchluessel) ?? ''; } catch { return ''; } })());
  const spSatz = () => (a.tabelle?.saetze?.length ? a.tabelle.saetze.find((x) => x.id === satzId()) ?? a.tabelle.saetze[0] : undefined);
  const satzWaehlen = (id: string) => { setSatzId(id); try { localStorage.setItem(satzSchluessel, id); } catch { /* egal */ } };
  const app = useContext(AppUmgebung);
  const baumFelder = (p.baum ?? []).map((n) => m.felder.find((f) => f.name === n)!);
  // Sammelfilter links: die Filter der Ansicht – oder, wo sie keine nennt, je Auswahl-/Verweisfeld der Liste einer (UND, ODER, NICHT)
  const lfs: LinksFilter[] = p.linksFilter ?? sammelfilter(m, [...Object.keys(p.fest?.() ?? {}), ...Object.keys(a.fest?.() ?? {}), ...(p.baum ?? [])]);
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [ast, setAst] = createSignal('');            // gewählter Knoten im Baum ('' = alle)
  const [dazuText, setDazuText] = createSignal('');   // „Filter hinzufügen“ links: Vorschläge nach Art; Enter nimmt auch Unvollständiges als „enthält“   // Filterbedingung (links und Vorschläge im Suchfeld): UND, ODER, NICHT
  const [neu, setNeu] = createSignal<Werte | null>(null);
  const [mitteKnoepfe, setMitteKnoepfe] = createSignal<Knopf[]>([]);   // Befehle einer eigenen Mitte
  const [reihe, setReihe] = createSignal<string[] | null>(null);   // Reihenfolge, die Tabelle oder eigene Mitte (Balkenplan) gerade zeigen
  // Tabelle oder Kacheln – nur, wo das Modul Kacheln einstellt; gemerkt je Objektart, am Handy zuerst Kacheln
  const FORM = `bp.form.${m.name}`;
  // Sortierung je Ansicht – Tabelle und Kacheln gemeinsam (wie im bisherigen Bauportal), je Gerät gemerkt
  const SORT = `bp.sort.${p.schluessel}`;
  const [sort, setSortRoh] = createSignal<Sortierung>((() => { try { return JSON.parse(localStorage.getItem(SORT) ?? 'null') ?? { feld: m.sortierFeld ?? m.anzeigeFeld, ab: false }; } catch { return { feld: m.sortierFeld ?? m.anzeigeFeld, ab: false }; } })());
  const setSort = (x: Sortierung) => { setSortRoh(x); try { localStorage.setItem(SORT, JSON.stringify(x)); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
  const [kacheln, setKacheln] = createSignal(!!a.kachel && (() => { try { const x = localStorage.getItem(FORM); return x ? x === 'kacheln' : !!a.kachelnZuerst || handy(); } catch { return false; } })());
  const formWechseln = () => { setKacheln(!kacheln()); try { localStorage.setItem(FORM, kacheln() ? 'kacheln' : 'tabelle'); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
  let rahmen!: RahmenSteuer, tabelle!: TabellenSteuer, suchfeld!: HTMLInputElement, wurzel!: HTMLDivElement;

  const fest = (): Werte => ({ ...p.fest?.(), ...a.fest?.() });
  // Listen hängen am Zähler der Objektart, nicht an jedem Feld jeder Zeile (siehe abgleich.ts) – gelesen wird ohne Abhören.
  const roh = (z: Zeile) => unwrap(z);
  const lebend = createMemo(() => {
    geaendert(m.name);
    const f = Object.entries(fest());
    return untrack(() => Object.values(sicht[m.name] ?? {}).filter((z) => { const r = roh(z); return !r.geloescht && f.every(([k, w]) => r.werte[k] === w); }));
  });
  // Neu im gewählten Ast des Baums: bekommt dessen Werte (z. B. eine neue Position im gewählten LV) – abgelesen an einem Eintrag dort
  const ausAst = (): Werte => {
    if (!ast()) return {};
    const soll = ast().slice(2), tiefe = soll.split(TRENNER).length, z = lebend().find((x) => pfad(x, tiefe) === soll);
    return z ? Object.fromEntries(baumFelder.slice(0, tiefe).map((f) => [f.name, roh(z).werte[f.name] ?? null])) : {};
  };
  // Neue Einträge übernehmen auch den Filter links, wo er genau einen Wert hat (wie im bisherigen Bauportal: Art und Gewerk vorbelegt)
  const ausFilter = (): Werte => Object.fromEntries(lfs.flatMap((lf, nr) => { const w = lf.feld ? werteIn(bed(), `l${nr}`) : []; return w.length === 1 ? [[lf.feld!, w[0]!]] : []; }));
  const neuStart = (werte: Werte = {}) => { const da = { ...ausFilter(), ...ausAst(), ...werte, ...fest() }; setNeu({ ...(a.neuVorgabe?.(lebend(), da) ?? {}), ...da }); };
  const pfad = (z: Zeile, tiefe: number) => baumFelder.slice(0, tiefe).map((f) => anzeige(f, roh(z).werte[f.name])).join(TRENNER);
  // Baum: Gliederung nach den Feldern, die der Beipackzettel nennt – mit Anzahl je Knoten.
  const knoten = createMemo((): Knoten[] => {
    const ebene = (zeilen: Zeile[], tiefe: number, vor: string): Knoten[] => {
      if (tiefe >= baumFelder.length) return [];
      const f = baumFelder[tiefe]!;
      const gruppen = new Map<string, Zeile[]>();
      for (const z of zeilen) { const w = anzeige(f, roh(z).werte[f.name]); (gruppen.get(w) ?? gruppen.set(w, []).get(w)!).push(z); }
      return [...gruppen.entries()].sort((x, y) => (x[0] === '' ? 1 : y[0] === '' ? -1 : vergleich.compare(x[0], y[0]))).map(([w, l]) => {
        const id = vor + w;
        return { id: 'k' + TRENNER + id, titel: w || `ohne ${f.titel}`, anzahl: l.length, kinder: ebene(l, tiefe + 1, id + TRENNER) };
      });
    };
    return [{ id: '', titel: `Alle ${m.titelMehrzahl}`, anzahl: lebend().length, kinder: ebene(lebend(), 0, '') }];
  });
  // ---------- Filter (Baustein Objektfilter): Abschnitte links, Suchfeld, Spaltenköpfe ----------
  const filter = objektFilter({ schluessel: p.schluessel, modell: m, lfs, suchArten: p.suchArten, lebend, projektId });
  const { suche, setSuche, bed, setBed, arten, nimm, entwurf, setEntwurf, wirksam, spalteFest, linksAbschnitte, linksAn, linksNicht, linksWahl } = filter;
  const zeilen = createMemo(() => {
    let l = filter.filtern(lebend());
    if (ast()) { const soll = ast().slice(2); const tiefe = soll.split(TRENNER).length; l = l.filter((z) => pfad(z, tiefe) === soll); }
    return l;
  });
  // Kacheln in derselben Sortierung wie die Tabelle – danach blättert auch die Karte
  const kachelZeilen = createMemo(() => sortieren(zeilen(), m, sort()));
  // Die Karte zeigt nur, was zum Zusammenhang gehört: nach dem Wechsel von Projekt oder Version bleibt keine fremde Karte stehen.
  const karte = createMemo(() => { const id = gewaehlt(); return id ? lebend().find((z) => z.id === id) : undefined; });

  // Sprung aus der Suche über alles: den Eintrag wählen und die Karte zeigen
  createEffect(() => { const id = sprungAbholen(m.name); if (id) { setGewaehlt(id); queueMicrotask(() => rahmen.detailsZeigen()); } });
  // Doppelklick wie im bisherigen Bauportal: der Eintrag öffnet sich im frei beweglichen Fenster
  const [schwebend, setSchwebend] = createSignal<string | null>(null);
  const schwebZeile = createMemo(() => { const id = schwebend(); return id ? lebend().find((z) => z.id === id) : undefined; });
  const insErsteFeld = () => { rahmen.detailsZeigen(); queueMicrotask(() => wurzel.querySelector<HTMLElement>('.karte input:not([readonly]), .karte textarea')?.focus()); };
  const duplizieren = (z: Zeile) => {
    const werte = { ...z.werte };
    for (const f of m.felder) if (f.eindeutig) werte[f.name] = leerwert(f);
    werte[m.anzeigeFeld] = `${z.werte[m.anzeigeFeld]} (Kopie)`;
    neuStart(werte);
  };
  // ---------- Bedienung wie in Excel (Stellschraube tabelle.excel): Zellen schreiben, einfügen, ausfüllen – je Aktion ein Schritt ----------
  const ausTexten = (texte: Record<string, string>): { werte: Werte; falsch: string[] } => {
    const werte: Werte = {}, falsch: string[] = [];
    for (const [n, t] of Object.entries(texte)) { const f = m.felder.find((x) => x.name === n); if (!f) continue; const w = wertAusText(f, t); if (w === undefined) falsch.push(f.titel); else werte[n] = w; }
    return { werte, falsch };
  };
  const excelBedienung = (): ExcelBedienung | undefined => (!a.tabelle?.excel || !darf(m.name, 'schreiben') ? undefined : {
    onZellen: (aenderungen, titel) => {
      const je = new Map<string, { z: Zeile; texte: Record<string, string> }>();
      for (const x of aenderungen) { const e = je.get(x.z.id) ?? { z: x.z, texte: {} }; e.texte[x.f.name] = x.text; je.set(x.z.id, e); }
      const befehle: Vorlage[] = [], falsch = new Set<string>();
      for (const { z, texte } of je.values()) {
        const r = ausTexten(texte); r.falsch.forEach((f) => falsch.add(f));
        try {
          const sauber = pruefeWerte(m, r.werte, false);
          const anders = Object.fromEntries(Object.entries(sauber).filter(([n, w]) => (w ?? '') !== (z.werte[n] ?? '')));
          if (Object.keys(anders).length) befehle.push({ objekt: m.name, art: 'aendern', objektId: z.id, werte: anders });
        } catch (e) { if (e instanceof Eingabefehler) Object.keys(e.felder).forEach((n) => falsch.add(m.felder.find((f) => f.name === n)?.titel ?? n)); else throw e; }
      }
      if (befehle.length) ausfuehrenMehrere(befehle, `${titel} (${befehle.length} ${befehle.length === 1 ? 'Zeile' : 'Zeilen'})`);
      if (falsch.size) hinweis(`Nicht übernommen, weil der Wert nicht passt: ${[...falsch].join(', ')}.`, { art: 'fehler' });
    },
    onNeueZeilen: (zeilen) => {
      const befehle: Vorlage[] = [];
      for (const texte of zeilen) { const r = ausTexten(texte); befehle.push({ objekt: m.name, art: 'anlegen', objektId: neueKennung(), werte: { ...r.werte, ...fest() } }); }
      ausfuehrenMehrere(befehle, `${befehle.length} ${befehle.length === 1 ? 'Zeile' : 'Zeilen'} eingefügt`);
    },
    onZeileEinfuegen: (nach) => {
      const id = neueKennung(), da = { ...fest() };
      ausfuehrenMehrere([{ objekt: m.name, art: 'anlegen', objektId: id, werte: { ...(a.neuVorgabe?.(nach ? [nach] : lebend(), da) ?? {}), ...da } }], `${m.titel} einfügen`);
      setGewaehlt(id);
    },
    onDuplizieren: (ids) => {
      const befehle: Vorlage[] = ids.map((id) => { const w = { ...roh(lebend().find((z) => z.id === id)!).werte }; for (const f of m.felder) if (f.eindeutig) w[f.name] = leerwert(f); return { objekt: m.name, art: 'anlegen' as const, objektId: neueKennung(), werte: w }; });
      ausfuehrenMehrere(befehle, `${ids.length} ${ids.length === 1 ? 'Zeile' : 'Zeilen'} duplizieren`);
    },
    onZeilenLoeschen: darfLoeschen() ? (ids) => { ausfuehrenMehrere(ids.map((id) => ({ objekt: m.name, art: 'loeschen' as const, objektId: id })), `${ids.length} ${ids.length === 1 ? 'Zeile' : 'Zeilen'} löschen`);
      hinweis(`${ids.length} ${ids.length === 1 ? 'Zeile' : 'Zeilen'} gelöscht.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } }); } : undefined,
  });
  let mitteNeu: (() => void) | undefined;   // wie die eigene Mitte neu anlegt, falls sie das selbst regelt
  const mitteP = { alle: lebend, zeilen, fest, gewaehlt, onWahl: setGewaehlt, onOeffnen: insErsteFeld, setReihe, setKnoepfe: setMitteKnoepfe, setNeu: (f: () => void) => { mitteNeu = f; } };
  // Blättern in der Karte: in der Reihenfolge, die die Mitte gerade zeigt
  const blaettern = () => {
    const ids = (!kacheln() && reihe()) || kachelZeilen().map((z) => z.id);
    const i = ids.indexOf(gewaehlt() ?? '');
    return i < 0 ? undefined : { nr: i + 1, anzahl: ids.length, onSchritt: (s: -1 | 1) => { const n = ids[i + s]; if (n) setGewaehlt(n); } };
  };
  const darfLoeschen = () => darf(m.name, 'loeschen') && !m.einzeln;
  // ---------- Mehrere wählen (nur wo das Modul Befehle dafür einstellt) ----------
  // Von Haus aus in jeder Liste, die man ändern darf: Haken, Leiste unten mit „Gemeinsam bearbeiten …“ und Excel
  const mitAuswahl = !!a.auswahl || (!a.mitte && !m.einzeln && darf(m.name, 'schreiben'));
  const auswahl = mitAuswahl ? auswahlAnlegen() : undefined;
  const reiheJetzt = () => ((!kacheln() && reihe()) || kachelZeilen().map((z) => z.id));
  // Excel: eine echte .xlsx (Zahlen und Daten rechnen in Excel weiter), Name wie die Liste mit Datum
  const excelSpeichern = (zeilen: (string | number | Date | null)[][]) =>
    herunterladen(new Blob([xlsxSchreiben(zeilen, m.titelMehrzahl)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${m.titelMehrzahl} ${new Date().toLocaleDateString('sv')}.xlsx`);
  const excel = (ids: string[]) => {
    const menge = new Set(ids);
    const zeilen = tabelle && !kacheln() ? tabelle.alsZeilen(menge) : (() => { const sp = spaltenFuer(m).sichtbare(); return [sp.map((f) => f.titel), ...lebend().filter((z) => menge.has(z.id)).map((z) => sp.map((f) => excelWert(f, roh(z).werte[f.name])))]; })();
    excelSpeichern(zeilen);
  };
  // Verwendet = ein anderes Objekt verweist darauf (außer eigenen Unterzeilen wie den Kontaktwegen, deren Verweis verborgen ist)
  const verwendet = (ids: string[]) => {
    const menge = new Set(ids), da = new Set<string>();
    for (const x of zustand()!.module.flatMap((mo) => mo.objekte)) for (const f of x.felder.filter((f) => f.art === 'verweis' && f.ziel === m.name && !f.verborgen))
      for (const z of lebende(x.name)) { const v = String(z.werte[f.name] ?? ''); if (menge.has(v)) da.add(v); }
    return da;
  };
  const [wegFrage, setWegFrage] = createSignal<{ frei: string[]; bleiben: number } | null>(null);
  const papierkorb: AuswahlBefehl = { titel: 'In den Papierkorb', gefahr: true, gesperrt: () => (darfLoeschen() ? undefined : 'Dazu fehlt dir das Recht'),
    tun: (ids) => { const v = verwendet(ids), frei = ids.filter((i) => !v.has(i)); if (!frei.length) { hinweis(`Alle gewählten ${m.titelMehrzahl} werden verwendet – nichts gelöscht.`); return; } setWegFrage({ frei, bleiben: ids.length - frei.length }); } };
  const wegLegen = (frei: string[]) => {
    setWegFrage(null);
    ausfuehrenMehrere(frei.map((id) => ({ objekt: m.name, art: 'loeschen' as const, objektId: id })), `${frei.length} ${frei.length === 1 ? m.titel : m.titelMehrzahl} in den Papierkorb`);
    frei.forEach((id) => auswahl?.ids().has(id) && auswahl.umschalten(id));
    hinweis(`${frei.length} ${frei.length === 1 ? m.titel : m.titelMehrzahl} im Papierkorb.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  // Verzeichnis drucken (wo das Modul eins hat): die gefilterte Liste in ihrer Reihenfolge oder die Auswahl – oben steht, welche es sind
  const verzeichnis = () => ausdrucke(m.name).find((x) => x.verzeichnis);
  const filterText = () => {
    const ar = arten(), teile = [
      ...(wirksam().gruppen.length ? [satz(wirksam(), (k) => ar.find((x) => x.key === k)?.titel ?? k, (k, w) => ar.find((x) => x.key === k)?.wertTitel?.(w) ?? w)] : []),
      ...(suche().trim() ? [`Text „${suche().trim()}“`] : []),
    ];
    return teile.length ? teile.join(' · ') : `alle ${m.titelMehrzahl}`;
  };
  // Im Fenster wählbar: die Auswahl (wenn eine da ist), die gefilterte Liste, alle
  const drucken = (ids?: string[]) => {
    const v = verzeichnis(); if (!v) return;
    const gewaehlt = ids ?? (auswahl?.anzahl() ? reiheJetzt().filter((id) => auswahl.hat(id)) : undefined);
    const gefiltert = reiheJetzt(), alle = [...lebend()].sort((x, y) => String(x.werte[m.anzeigeFeld] ?? '').localeCompare(String(y.werte[m.anzeigeFeld] ?? ''), 'de')).map((z) => z.id);
    verzeichnisDrucken(v.id, [
      ...(gewaehlt?.length ? [{ titel: 'Die Auswahl', ids: gewaehlt, filter: `Auswahl (${gewaehlt.length})` }] : []),
      ...(gefiltert.length !== alle.length ? [{ titel: 'Die gefilterte Liste', ids: gefiltert, filter: filterText() }] : []),
      { titel: `Alle ${m.titelMehrzahl}`, ids: alle, filter: '' },
    ]);
  };
  // Einzelausdruck (z. B. Tagesbericht): die gewählten Einträge nacheinander in einem PDF
  const einzeln = () => ausdrucke(m.name).find((x) => !x.verzeichnis);
  const hilfen = () => ({ excel, drucken: verzeichnis() ? (ids: string[]) => drucken(ids) : undefined,
    einzelnDrucken: einzeln() ? (ids: string[]) => druckOeffnen(einzeln()!.id, ids[0]!, ids) : undefined, aendern: (ids: string[]) => feldSetzenOeffnen(m.name, ids, Object.keys(fest()), 'gewählt') });
  const standard = (h: ReturnType<typeof hilfen>): AuswahlBefehl[] => [{ titel: 'Gemeinsam bearbeiten …', tun: h.aendern }, { titel: 'Excel', tun: h.excel },
    ...(h.einzelnDrucken ? [{ titel: 'Drucken', tun: h.einzelnDrucken }] : [])];
  const auswahlBefehle = (): AuswahlBefehl[] => (auswahl ? [...(a.auswahl ?? standard)(hilfen()), papierkorb] : []);
  // Am Handy erscheinen die Haken erst, wenn etwas gewählt ist (lange tippen)
  if (auswahl) { createEffect(() => document.documentElement.classList.toggle('auswahl-an', auswahl.anzahl() > 0)); onCleanup(() => document.documentElement.classList.remove('auswahl-an')); }
  // Gelöschte fallen aus der Auswahl
  if (auswahl) createEffect(() => { const da = new Set(lebend().map((z) => z.id)); untrack(() => { for (const id of auswahl.ids()) if (!da.has(id)) auswahl.umschalten(id); }); });
  const leer = () => lebend().length ? 'Kein Treffer für diese Auswahl.' : `Noch keine ${m.titelMehrzahl}.${darf(m.name, 'schreiben') ? ` Mit „+ ${m.titel}“ legst du den ersten Eintrag an.` : ''}`;

  // die Karte, die rechts steht (eine Ansicht mit eigenen Details kann sie mitbenutzen)
  const standardKarte = () => <Show when={karte()}>{(z) => <Detailkarte modell={m} zeile={z()} blaettern={blaettern()} onZu={() => setGewaehlt(null)} heftzwecke={rahmen.heftzweckeRechts()} zusatz={a.kartenZusatz} oben={a.kartenOben} einschub={a.kartenEinschub} reiter={a.kartenReiter} symbole={a.kartenSymbole} verborgen={Object.keys(fest())} />}</Show>;
  return (
    <div class="ansicht" ref={wurzel} onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('.karte')) { e.preventDefault(); tabelle?.fokus(); } }}>
      <Rahmen schluessel={p.schluessel} steuer={(s) => (rahmen = s)}
        kopf={a.kopf?.(mitteP)}
        abfolge={(() => { const f = a.abfolge?.(mitteP, app?.aktiv() ?? ''); return f ? { schritte: f.schritte, aktiv: f.stand, hier: f.hier, onWahl: app?.onReiter } : undefined; })()}
        knoepfe={[
          ...(darf(m.name, 'schreiben') && !a.ohneNeu ? [{ titel: a.neuTitel ?? m.titel, zeichen: 'neu', gruppe: 'Neu', haupt: true, tun: () => (a.mitte && mitteNeu ? mitteNeu() : neuStart()) }] : []),
          ...(a.knoepfe?.(fest()) ?? []),
          ...(a.mitte ? mitteKnoepfe() : []),
          ...(a.kachel ? [{ titel: 'Karten', zeichen: 'kacheln', gruppe: 'Ansicht', an: kacheln(), tun: () => { if (!kacheln()) formWechseln(); } },
            { titel: 'Tabelle', zeichen: 'tabelle', gruppe: 'Ansicht', an: !kacheln(), tun: () => { if (kacheln()) formWechseln(); } }] : []),
          // Spalten wählen: Rechtsklick auf den Tabellenkopf (kein eigener Knopf – Entscheidung 27.11.2026)
          ...(a.mitte || kacheln() ? [] : [{ titel: 'Excel', zeichen: 'export', gruppe: 'Datei', rechts: true, tun: () => excelSpeichern(tabelle.alsZeilen()) }]),
          ...(verzeichnis() ? [{ titel: 'Drucken', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: () => drucken() }] : []),
        ]}
        menueMitteTitel={a.menueMitte ? '' : undefined}
        menueMitte={a.menueMitte ? a.menueMitte(mitteP) : <>
          <Show when={arten().length} fallback={
            <input ref={suchfeld} class="suche" type="search" placeholder={`${m.titelMehrzahl} durchsuchen`} aria-label="Suchen" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)}
              onKeyDown={(e) => { if ((e.key === 'ArrowDown' || e.key === 'Enter') && tabelle && !kacheln()) { e.preventDefault(); tabelle.fokus(); tabelle.ersteWaehlen(); } }} />}>
            <Filtersuche ref={(el) => (suchfeld = el)} text={suche()} onText={setSuche} arten={arten()} ids={() => lebend().map((z) => z.id)} onNehmen={nimm} platzhalter={`${m.titelMehrzahl} durchsuchen und filtern`}
              onWeiter={() => { if (tabelle && !kacheln()) { tabelle.fokus(); tabelle.ersteWaehlen(); } }} />
          </Show>
          <span class="zaehler">{zeilen().length === lebend().length ? `${lebend().length} ${lebend().length === 1 ? m.titel : m.titelMehrzahl}` : `${zeilen().length} von ${lebend().length}`}</span>
        </>}
        unterMenue={<>{p.unterMenue}{a.oben?.(fest())}</>}
        linksOben={p.linksOben}
        baumTitel={typeof a.linksTitel === 'function' ? a.linksTitel(mitteP) : a.linksTitel ?? 'Gliederung'}
        baumZuerst={a.linksZuerst}
        // links über der Gliederung immer die Filterkästen: Filter links, aus dem Suchfeld und aus den Spaltenköpfen – verknüpfbar
        baum={a.links ? a.links(mitteP) : lfs.length ? <><div class="filter-dazu"><Filtersuche text={dazuText()} onText={setDazuText} arten={arten()} ids={() => lebend().map((z) => z.id)} onNehmen={nimm} onEnthaelt={(art, t) => setBed(enthaeltDazu(bed(), art, t))} onWeiter={() => undefined} platzhalter="Filter hinzufügen: Gewerk, Projekt, Ort …" name="Filter hinzufügen" /></div><Filterkaesten bedingung={bed()} arten={arten()} onAendern={setBed} /><Show when={baumFelder.length}><Baum titel={`Gliederung ${m.titelMehrzahl}`} knoten={knoten()} gewaehlt={ast()} onWahl={setAst} symbol={a.baumSymbol} /></Show><Seitenliste art="filter" name="Filter" abschnitte={linksAbschnitte()} aktiv={linksAn} nicht={linksNicht} onWahl={linksWahl} /></>
          : baumFelder.length ? <><Filterkaesten bedingung={bed()} arten={arten()} onAendern={setBed} /><Baum titel={`Gliederung ${m.titelMehrzahl}`} knoten={knoten()} gewaehlt={ast()} onWahl={setAst} symbol={a.baumSymbol} /></>
          : bed().gruppen.length ? <Filterkaesten bedingung={bed()} arten={arten()} onAendern={setBed} /> : undefined}
        inhalt={a.mitte ? a.mitte(mitteP) : a.leer && !lebend().length ? a.leer(fest(), () => neuStart()) : kacheln() && a.kachel ?
          <div class="kachel-flaeche">
            {/* wie im bisherigen Bauportal: über den Karten die Zahl und die Sortierung */}
            <div class="kachel-sortierung">
              <span class="still-text">{zeilen().length} {zeilen().length === 1 ? m.titel : m.titelMehrzahl}</span>
              <Auswahlliste titel="Sortieren nach" wert={sort().feld} optionen={m.felder.filter((f) => f.inListe && !f.verborgen).map((f) => ({ wert: f.name, titel: f.titel }))} onWert={(f) => setSort({ feld: f, ab: false })} />
              <button type="button" class="knopf klein still" aria-label={sort().ab ? 'absteigend – umkehren' : 'aufsteigend – umkehren'} title="Richtung umkehren" onClick={() => setSort({ ...sort(), ab: !sort().ab })}>{sort().ab ? '↓' : '↑'}</button>
            </div>
            <Kacheln zeilen={kachelZeilen()} gewaehlt={gewaehlt()} leer={leer()} inhalt={a.kachel} breite={a.kachelBreite} onWahl={setGewaehlt} onOeffnen={() => rahmen.detailsZeigen()}
              auswahl={auswahl} auswahlMenue={auswahl ? (e) => auswahlMenue(auswahl, auswahlBefehle(), e) : undefined} name={(z) => objektname(m, z.werte)} />
          </div> :
          <div class="tabelle-mit-reitern">
          <Show when={a.tabelle?.saetze?.length}>
            <div class="spaltensaetze" role="tablist" aria-label="Ansichten der Tabelle">
              <For each={a.tabelle!.saetze}>{(st) => <button type="button" role="tab" aria-selected={spSatz()?.id === st.id} classList={{ aktiv: spSatz()?.id === st.id }} onClick={() => satzWaehlen(st.id)}>
                {st.titel}<Show when={st !== a.tabelle!.saetze!.at(-1)}> <small>{st.spalten.length}</small></Show></button>}</For>
            </div>
          </Show>
          <Show when={spSatz()?.id ?? '-'} keyed>{(_satz) =>
          <Tabelle modell={m} zeilen={zeilen()} sort={sort} onSort={setSort} onReihe={setReihe} gewaehlt={gewaehlt()} leer={leer()} steuer={(s) => (tabelle = s)} zelle={a.zelle}
            spaltenSatz={spSatz()} excel={excelBedienung()} gruppenKopf={a.tabelle?.gruppenKopf} zeilenNummern={a.tabelle?.zeilenNummern} festeSpalten={a.tabelle?.festeSpalten}
            filter={a.tabelle?.ohneFilterzeile ? undefined : entwurf()} onFilter={a.tabelle?.ohneFilterzeile ? undefined : (feld, text) => setEntwurf({ ...entwurf(), [feld]: text })} onFilterFest={spalteFest} filterWerte={(f) => lebend().map((z) => anzeige(f, roh(z).werte[f.name]))}
            onZelle={darf(m.name, 'schreiben') ? (z, f, w) => feldAendern(m, z, f, w) : undefined}
            onWahl={setGewaehlt} onOeffnen={insErsteFeld} onDoppelklick={a.details ? undefined : (z) => setSchwebend(z.id)} onSuche={() => suchfeld.focus()}
            onLoeschen={darfLoeschen() ? (z) => loesche(m, z) : undefined}
            auswahl={auswahl} auswahlMenue={auswahl ? (e) => auswahlMenue(auswahl, auswahlBefehle(), e) : undefined}
            zeilenMenue={(z) => [
              { titel: 'Öffnen', tun: insErsteFeld },
              { titel: 'In eigenem Fenster öffnen', tun: () => inEigenemFenster(m, z.id) },
              ...(a.zeilenMenue?.(z) ?? []),
              ...(darf(m.name, 'schreiben') ? [{ titel: 'Duplizieren …', tun: () => duplizieren(z) }] : []),
              ...(darfLoeschen() ? [{ titel: 'Löschen', gefahr: true, tun: () => loesche(m, z) }] : []),
            ]} />}</Show>
          <Show when={a.tabelle?.hinweis}><p class="tabelle-hinweis still-text klein-text">{a.tabelle!.hinweis}</p></Show>
          </div>
        }
        detailsTitel={(karte() && objektname(m, karte()!.werte)) || m.titel}
        detailsHinweis={a.detailsHinweis ?? `${a.mitte ? 'Einen Eintrag' : 'Eine Zeile'} anklicken – hier stehen dann alle Angaben, direkt änderbar.`}
        details={karte() ? (a.details ? a.details(karte()!, () => rahmen.heftzweckeRechts(), standardKarte) : standardKarte()) : undefined} />
      <Show when={schwebZeile()}>{(z) => <Schwebefenster titel={objektname(m, z().werte) || m.titel} onZu={() => { setSchwebend(null); tabelle?.fokus(); }}>
        <Detailkarte modell={m} zeile={z()} ohneKopf ohneRahmen onZu={() => setSchwebend(null)} zusatz={a.kartenZusatz} oben={a.kartenOben} einschub={a.kartenEinschub} reiter={a.kartenReiter} symbole={a.kartenSymbole} verborgen={Object.keys(fest())} />
      </Schwebefenster>}</Show>
      <Show when={auswahl}>{(aw) => <Auswahlleiste auswahl={aw()} reihe={reiheJetzt} befehle={auswahlBefehle().filter((x) => !x.nurMenue)} />}</Show>
      <Show when={wegFrage()}>{(w) => (
        <Dialog titel="In den Papierkorb" onAbbrechen={() => setWegFrage(null)} knoepfe={<>
          <button class="knopf" onClick={() => setWegFrage(null)}>Abbrechen</button>
          <button class="knopf haupt gefahr" onClick={() => wegLegen(w().frei)}>In den Papierkorb</button></>}>
          <p>{w().frei.length} {w().frei.length === 1 ? m.titel : m.titelMehrzahl} in den Papierkorb legen? Zurückholen geht mit „Zurück“ oder aus dem Verlauf.</p>
          <Show when={w().bleiben}><p class="still-text">{w().bleiben} gewählte {w().bleiben === 1 ? 'bleibt, weil er' : 'bleiben, weil sie'} anderswo verwendet {w().bleiben === 1 ? 'wird' : 'werden'} (Projekt, Bautagebuch, Bauzeitenplan …).</p></Show>
        </Dialog>)}</Show>
      <Show when={neu()}>{(start) => <NeuFenster modell={m} start={start()} verborgen={Object.keys(fest())} onZu={(id) => { setNeu(null); if (id) { setGewaehlt(id); rahmen.detailsZeigen(); } }} />}</Show>
    </div>
  );
}
