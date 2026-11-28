// Modul „Pläne und Dateien“: der Ordner des gewählten Projekts auf dem Dateiserver.
// Setzt nur fertige Bausteine in den Rahmen: Baum (Ordner) | Tabelle (Inhalt) | Details (Datei).
// Die Dateien bleiben auf dem Dateiserver und werden nicht ins Gerät geholt – diese Ansicht braucht Verbindung.
import { Kartenrahmen } from './baukasten/kartenrahmen';
import { dateiZeigen } from './baukasten/ansehen';
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Zeile } from '../kern/befehl';
import type { ObjektModell } from '../kern/modell';
import { sicht } from './unterbau/abgleich';
import { LEER, artWeg, erfuellt, hat, umschalten, werteIn, type Bedingung } from '../kern/filterbedingung';
import { Filterkaesten, Filtersuche, type FilterArt } from './baukasten/filterkaesten';
import { ruf } from './unterbau/api';
import { Baum, type Knoten } from './baukasten/baum';
import { Dialog } from './baukasten/dialog';
import { Rahmen, type RahmenSteuer } from './baukasten/rahmen';
import { Tabelle } from './baukasten/tabelle';
import { Kacheln } from './baukasten/kacheln';
import { zeigeMenue } from './baukasten/kontextmenue';
import type { Knopf } from './baukasten/menueleiste';
import { Seitenliste } from './baukasten/seitenliste';
import { projektId } from './projekt';

interface Eintrag { name: string; ordner: boolean; groesse: number; geaendert: string; kennung: string }

// So sieht eine Datei für den Tabellen-Baustein aus (nur Anzeige, kein Objekt der Datenbank).
const DATEI: ObjektModell = {
  name: 'datei', titel: 'Datei', titelMehrzahl: 'Dateien', anzeigeFeld: 'name', rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Name', art: 'text', inListe: true, breite: 380 },
    { name: 'art', titel: 'Art', art: 'text', inListe: true, breite: 110 },
    { name: 'groesse', titel: 'Größe', art: 'zahl', inListe: true, breite: 110 },
    { name: 'geaendert', titel: 'Geändert', art: 'text', inListe: true, breite: 160 },
  ],
};
export const groesse = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('de', { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const zeit = (iso: string) => new Date(iso).toLocaleString('de', { dateStyle: 'medium', timeStyle: 'short' });
const endung = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
/** Dateiarten mit Vorschaubild (vom Dateidienst: PDF die erste Seite, Bilder verkleinert). */
const MIT_VORSCHAU = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'];

// ---------- Darstellung wie im bisherigen Bauportal: Liste oder Kacheln S / M / L (je Gerät gemerkt) ----------
type Form = 'liste' | 's' | 'm' | 'l';
const FORM = 'bp.dateien.form';
const GROESSEN: { form: Exclude<Form, 'liste'>; titel: string; breite: number }[] = [{ form: 's', titel: 'Klein', breite: 120 }, { form: 'm', titel: 'Mittel', breite: 180 }, { form: 'l', titel: 'Groß', breite: 280 }];
const [form, setFormRoh] = createSignal<Form>((() => { try { const f = localStorage.getItem(FORM); return f === 's' || f === 'm' || f === 'l' ? f : 'liste'; } catch { return 'liste'; } })());
const setForm = (f: Form) => { setFormRoh(f); try { localStorage.setItem(FORM, f); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
const kachelBreite = () => GROESSEN.find((g) => g.form === form())?.breite ?? 180;
/** Knöpfe „Liste“ und „Kacheln“ (mit Größe) für die Menüleiste – in beiden Dateiansichten gleich. */
const formKnoepfe = (): Knopf[] => [
  { titel: 'Liste', zeichen: 'tabelle', gruppe: 'Ansicht', an: form() === 'liste', tun: () => setForm('liste') },
  { titel: form() === 'liste' ? 'Kacheln' : `Kacheln ${GROESSEN.find((g) => g.form === form())!.titel.toLowerCase()}`, zeichen: 'kacheln', gruppe: 'Ansicht', an: form() !== 'liste',
    tun: (e) => zeigeMenue(e, GROESSEN.map((g) => ({ titel: `${g.form === form() ? '✓ ' : ''}${g.titel}`, tun: () => setForm(g.form) }))) },
];
const vorschauAdresse = (projekt: string, pfad: string, geaendert: string, breite: number) =>
  `/api/ablage/vorschau?projekt=${projekt}&pfad=${encodeURIComponent(pfad)}&geaendert=${encodeURIComponent(geaendert)}&breite=${breite}`;
/** Eine Kachel: Vorschaubild (oder bei anderen Arten die Endung groß), darunter der Name. */
function DateiKachel(p: { name: string; ordner?: boolean; vorschau?: string }) {
  const [fehlt, setFehlt] = createSignal(false);
  return (
    <figure class="datei-kachel" title={p.name}>
      <Show when={p.vorschau && !fehlt()} fallback={<div class="datei-kachel-art" classList={{ ordner: !!p.ordner }}>{p.ordner ? '▤' : (endung(p.name).toUpperCase() || 'Datei')}</div>}>
        <img src={p.vorschau} alt="" loading="lazy" decoding="async" onError={() => setFehlt(true)} />
      </Show>
      <figcaption>{p.name}</figcaption>
    </figure>
  );
}

export function DateienAnsicht() {
  const projekt = () => { const id = projektId(); const z = id ? sicht.projekt?.[id] : undefined; return z && !z.geloescht ? z : undefined; };
  const [ordner, setOrdner] = createStore<Record<string, Eintrag[]>>({});   // geladene Ordner: Pfad -> Inhalt
  const [pfad, setPfad] = createSignal('');
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [stoerung, setStoerung] = createSignal('');
  let rahmen!: RahmenSteuer;

  const hole = async (p: string, neu = false) => {
    if (ordner[p] && !neu) return;
    try { setOrdner(p, (await ruf<{ eintraege: Eintrag[] }>(`/api/ablage/liste?projekt=${projekt()!.id}&pfad=${encodeURIComponent(p)}`)).eintraege); setStoerung(''); }
    catch (e) { if (p === pfad()) setStoerung((e as Error).message); }
  };
  // Projekt gewechselt (oder sein Ordner geändert): von vorn
  createEffect(on(() => [projekt()?.id, projekt()?.werte.ordner], () => { for (const k of Object.keys(ordner)) setOrdner(k, undefined!); setPfad(''); setGewaehlt(null); setStoerung(''); if (projekt()) void hole('', true); }));
  const gehe = (p: string) => { setPfad(p); setGewaehlt(null); void hole(p); };

  const knoten = createMemo((): Knoten[] => {
    const unter = (p: string): Knoten[] => (ordner[p] ?? []).filter((e) => e.ordner).map((e) => { const kind = p ? `${p}/${e.name}` : e.name; return { id: kind, titel: e.name, kinder: unter(kind), hatKinder: !ordner[kind] || ordner[kind]!.some((x) => x.ordner) }; });
    return [{ id: '', titel: String(projekt()?.werte.name ?? 'Projekt'), kinder: unter('') }];
  });
  const zeilen = createMemo((): Zeile[] => (ordner[pfad()] ?? []).map((e) => ({ id: e.name, geloescht: false,
    werte: { name: e.name, art: e.ordner ? 'Ordner' : (endung(e.name).toUpperCase() || 'Datei'), groesse: e.ordner ? null : e.groesse, geaendert: e.geaendert } })));
  const eintrag = (name: string | null) => (ordner[pfad()] ?? []).find((e) => e.name === name);
  const datei = createMemo(() => { const e = eintrag(gewaehlt()); return e && !e.ordner ? e : undefined; });
  const adresse = (name: string, laden = false) => `/api/ablage/datei?projekt=${projekt()!.id}&pfad=${encodeURIComponent(pfad() ? `${pfad()}/${name}` : name)}${laden ? '&laden=1' : ''}`;
  const oeffne = (z: Zeile) => { const e = eintrag(z.id); if (!e) return; if (e.ordner) gehe(pfad() ? `${pfad()}/${e.name}` : e.name); else zeigen(e.name); };
  // Fotos und PDFs im Fenster des Bauportals ansehen (mit ‹ › durch die übrigen im Ordner), alles andere herunterladen – nie ein neuer Tab
  const zeigen = (name: string) => dateiZeigen((ordner[pfad()] ?? []).filter((x) => !x.ordner).map((x) => ({ name: x.name, url: adresse(x.name), laden: adresse(x.name, true) })), name);

  const krumen = () => pfad().split('/').filter(Boolean);
  const leer = (text: string) => <div class="mitte"><p class="still-text">{text}</p></div>;

  return (
    <Show when={projekt()} fallback={<Rahmen schluessel="dateien" inhalt={leer('Bitte oben ein Projekt wählen.')} />}>
      <Rahmen schluessel="dateien" steuer={(s) => (rahmen = s)}
        knoepfe={[...formKnoepfe(), { titel: 'Aktualisieren', zeichen: 'aktualisieren', gruppe: 'Ansicht', tun: () => void hole(pfad(), true) }]}
        menueMitte={
          <nav class="krumen" aria-label="Pfad">
            <button onClick={() => gehe('')}>{String(projekt()!.werte.name)}</button>
            <For each={krumen()}>{(t, i) => <><span aria-hidden="true">›</span><button onClick={() => gehe(krumen().slice(0, i() + 1).join('/'))}>{t}</button></>}</For>
          </nav>
        }
        baumTitel="Ordner"
        baum={<Baum titel="Ordner" knoten={knoten()} gewaehlt={pfad()} onWahl={gehe} anfangsZu onAuf={(id) => void hole(id)} symbol={() => '▤'} />}
        inhalt={
          <Show when={!stoerung()} fallback={leer(stoerung())}>
            <Show when={form() === 'liste'} fallback={
              <Kacheln zeilen={zeilen()} gewaehlt={gewaehlt()} breite={kachelBreite()} leer={ordner[pfad()] ? 'Dieser Ordner ist leer.' : 'Ordner wird gelesen …'}
                onWahl={(id) => setGewaehlt(id)} onOeffnen={() => { const e = eintrag(gewaehlt()); if (e?.ordner) gehe(pfad() ? `${pfad()}/${e.name}` : e.name); else if (e) rahmen.detailsZeigen(); }}
                inhalt={(z) => { const e = eintrag(z.id)!; return <DateiKachel name={e.name} ordner={e.ordner} vorschau={!e.ordner && MIT_VORSCHAU.includes(endung(e.name)) ? vorschauAdresse(projekt()!.id, pfad() ? `${pfad()}/${e.name}` : e.name, e.geaendert, kachelBreite()) : undefined} />; }} />}>
            <Tabelle modell={DATEI} zeilen={zeilen()} gewaehlt={gewaehlt()} onWahl={(id) => { setGewaehlt(id); if (id && eintrag(id) && !eintrag(id)!.ordner) rahmen.detailsZeigen(); }} onOeffnen={oeffne}
              leer={ordner[pfad()] ? 'Dieser Ordner ist leer.' : 'Ordner wird gelesen …'}
              zelle={(f, z) => (f.name === 'groesse' ? (z.werte.groesse === null ? '' : groesse(Number(z.werte.groesse))) : f.name === 'geaendert' ? zeit(String(z.werte.geaendert)) : f.name === 'name' && z.werte.art === 'Ordner' ? <span class="ordnername">▤ {String(z.werte.name)}</span> : undefined)}
              zeilenMenue={(z) => (z.werte.art === 'Ordner' ? [{ titel: 'Öffnen', tun: () => oeffne(z) }] : [
                { titel: 'Öffnen', tun: () => oeffne(z) },
                { titel: 'Herunterladen', tun: () => { location.href = adresse(z.id, true); } },
              ])} />
            </Show>
          </Show>
        }
        detailsTitel={datei()?.name}
        details={datei() ? <DateiKarte name={datei()!.name} groesse={datei()!.groesse} geaendert={datei()!.geaendert} ordner={pfad()} adresse={(laden) => adresse(datei()!.name, laden)}
          vorschau={vorschauAdresse(projekt()!.id, pfad() ? `${pfad()}/${datei()!.name}` : datei()!.name, datei()!.geaendert, 640)}
          onZu={() => setGewaehlt(null)} heftzwecke={rahmen.heftzweckeRechts()} /> : undefined} />
    </Show>
  );
}

/** Karte einer Datei rechts: Vorschau bei Bildern, Angaben, Öffnen und Herunterladen – in beiden Ansichten gleich. */
function DateiKarte(p: { name: string; groesse: number; geaendert: string; ordner: string; adresse: (laden?: boolean) => string; vorschau: string; onZu: () => void; heftzwecke: JSX.Element }) {
  const [fehlt, setFehlt] = createSignal(false);
  return (
    <Kartenrahmen label={`Datei ${p.name}`} titel={p.name} onZu={p.onZu} heftzwecke={p.heftzwecke}>
        <Show when={MIT_VORSCHAU.includes(endung(p.name)) && !fehlt()}><a class="vorschau-verweis" href={p.adresse()} title="Ansehen" onClick={(e) => { e.preventDefault(); dateiZeigen([{ name: p.name, url: p.adresse(), laden: p.adresse(true) }], p.name); }}><img class="vorschau" src={p.vorschau} alt={`Vorschau ${p.name}`} onError={() => setFehlt(true)} /></a></Show>
        <dl class="angaben">
          <dt>Art</dt><dd>{endung(p.name).toUpperCase() || 'Datei'}</dd>
          <dt>Größe</dt><dd>{groesse(p.groesse)}</dd>
          <dt>Geändert</dt><dd>{zeit(p.geaendert)}</dd>
          <dt>Ordner</dt><dd>{p.ordner || '(oberste Ebene)'}</dd>
        </dl>
        <div class="reihe">
          <a class="knopf haupt" href={p.adresse()} onClick={(e) => { e.preventDefault(); dateiZeigen([{ name: p.name, url: p.adresse(), laden: p.adresse(true) }], p.name); }}>Öffnen</a>
          <a class="knopf" href={p.adresse(true)}>Herunterladen</a>
        </div>
        <p class="still-text klein-text">Das Original liegt auf dem Dateiserver und bleibt dort.</p>
    </Kartenrahmen>
  );
}

// ---------- Alle Dateien: der ganze Projektordner mit Unterordnern, gefiltert nach Art, Zeitraum, Ordner und Suche ----------
const ARTEN: [string, string, string[]][] = [
  ['pdf', 'PDF', ['pdf']], ['foto', 'Fotos', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff']],
  ['cad', 'CAD', ['dwg', 'dxf', 'ifc', 'pln', 'plt', 'ndw', 'skp', 'rvt', 'nd1']], ['office', 'Office', ['doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'txt', 'csv']],
  ['mail', 'Mails', ['msg', 'eml']],
];
const artVon = (name: string) => ARTEN.find(([, , e]) => e.includes(endung(name)))?.[0] ?? 'andere';
const ZEITEN: [string, string, number][] = [['7', 'letzte 7 Tage', 7], ['30', 'letzte 30 Tage', 30], ['365', 'letztes Jahr', 365]];
const ALLE: ObjektModell = {
  ...DATEI, name: 'datei_alle',
  felder: [DATEI.felder[0]!, { name: 'ordner', titel: 'Ordner', art: 'text', inListe: true, breite: 260 }, ...DATEI.felder.slice(1)],
};

export function AlleDateien() {
  const projekt = () => { const id = projektId(); const z = id ? sicht.projekt?.[id] : undefined; return z && !z.geloescht ? z : undefined; };
  const [daten, setDaten] = createSignal<{ dateien: { pfad: string; groesse: number; geaendert: string }[]; abgeschnitten: boolean } | null>(null);
  const [stoerung, setStoerung] = createSignal('');
  const [bed, setBed] = createSignal<Bedingung>(LEER);   // Sammelfilter wie in den Adressen: Art, Geändert, Ordner – UND, ODER, NICHT
  const [suche, setSuche] = createSignal('');
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  let rahmen!: RahmenSteuer;
  const laden = async () => {
    const p = projekt(); if (!p) return;
    setDaten(null); setStoerung('');
    try { setDaten(await ruf(`/api/ablage/alle?projekt=${p.id}`)); } catch (e) { setStoerung((e as Error).message); }
  };
  createEffect(on(() => [projekt()?.id, projekt()?.werte.ordner], () => { setGewaehlt(null); setBed(LEER); void laden(); }));
  const oben = (pfad: string) => (pfad.includes('/') ? pfad.split('/')[0]! : '');
  const alle = createMemo(() => (daten()?.dateien ?? []).map((d) => ({ ...d, name: d.pfad.split('/').pop()!, art: artVon(d.pfad), ordner: d.pfad.split('/').slice(0, -1).join('/') })));
  type D = ReturnType<typeof alle>[number];
  const nachPfad = createMemo(() => new Map(alle().map((d) => [d.pfad, d])));
  // je Art die Werte einer Datei; „Geändert“: alle Zeiträume, in die sie fällt (7 Tage liegt auch in 30 Tagen)
  const werteVon = (d: D, art: string): string[] => (art === 'art' ? [d.art] : art === 'ordner' ? [oben(d.pfad)].filter(Boolean)
    : ZEITEN.filter(([, , tage]) => Date.now() - new Date(d.geaendert).getTime() <= tage * 86400000).map(([k]) => k));
  const TITEL: Record<string, string> = { art: 'Art', zeit: 'Geändert', ordner: 'Ordner' };
  const wertTitel: Record<string, (w: string) => string> = { art: (w) => ARTEN.find((a) => a[0] === w)?.[1] ?? 'Sonstige', zeit: (w) => ZEITEN.find((z) => z[0] === w)?.[1] ?? w };
  const arten = createMemo((): FilterArt[] => ['art', 'zeit', 'ordner'].map((k) => ({ key: k, titel: TITEL[k]!, wertTitel: wertTitel[k], werte: (id) => { const d = nachPfad().get(id); return d ? werteVon(d, k) : []; } })));
  const passt = (d: D, b: Bedingung) => {
    if (b.gruppen.length && !erfuellt(b, (k) => werteVon(d, k))) return false;
    const w = suche().toLowerCase().split(/\s+/).filter(Boolean);
    return w.every((x) => d.pfad.toLowerCase().includes(x));
  };
  const treffer = createMemo(() => alle().filter((d) => passt(d, bed())));
  // Anzahl je Wert: was der übrige Filter durchlässt und diesen Wert hat
  const zahl = (art: string, wert: string) => { const b = artWeg(bed(), art); return alle().filter((d) => passt(d, b) && werteVon(d, art).includes(wert)).length; };
  const abschnitte = createMemo(() => [
    { titel: 'Art', eintraege: [...ARTEN.map(([k, t]) => ({ id: `art:${k}`, titel: t, anzahl: zahl('art', k) })), { id: 'art:andere', titel: 'Sonstige', anzahl: zahl('art', 'andere') }] },
    { titel: 'Geändert', eintraege: ZEITEN.map(([k, t]) => ({ id: `zeit:${k}`, titel: t, anzahl: zahl('zeit', k) })) },
    { titel: 'Ordner', eintraege: [...new Set(alle().map((d) => oben(d.pfad)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')).map((o) => ({ id: `ordner:${o}`, titel: o, anzahl: zahl('ordner', o) })) },
  ]);
  const teile = (id: string) => { const i = id.indexOf(':'); return [id.slice(0, i), id.slice(i + 1)] as const; };
  const wahl = (id: string) => { const [k, w] = teile(id); setBed(umschalten(bed(), k, w)); };
  const zeilen = createMemo((): Zeile[] => [...treffer()].sort((a, b) => (a.geaendert < b.geaendert ? 1 : -1)).map((d) => ({ id: d.pfad, geloescht: false,
    werte: { name: d.name, ordner: d.ordner, art: endung(d.name).toUpperCase() || 'Datei', groesse: d.groesse, geaendert: d.geaendert } })));
  const datei = createMemo(() => alle().find((d) => d.pfad === gewaehlt()));
  const adresse = (pfad: string, laden = false) => `/api/ablage/datei?projekt=${projekt()!.id}&pfad=${encodeURIComponent(pfad)}${laden ? '&laden=1' : ''}`;
  const zeigen = (pfad: string) => dateiZeigen(zeilen().map((z) => ({ name: z.id, url: adresse(z.id), laden: adresse(z.id, true) })), pfad);
  const leer = (text: string) => <div class="mitte"><p class="still-text">{text}</p></div>;
  return (
    <Show when={projekt()} fallback={<Rahmen schluessel="dateien.alle" inhalt={leer('Bitte oben ein Projekt wählen.')} />}>
      <Rahmen schluessel="dateien.alle" steuer={(x) => (rahmen = x)}
        knoepfe={[...formKnoepfe(), { titel: 'Neu einlesen', zeichen: 'aktualisieren', gruppe: 'Ansicht', tun: () => void laden() }]}
        menueMitte={<>
          <Filtersuche text={suche()} onText={setSuche} arten={arten()} ids={() => alle().map((d) => d.pfad)} onNehmen={(k, w, nicht) => setBed(umschalten(bed(), k, w, nicht))} onWeiter={() => undefined}
            platzhalter="Dateien durchsuchen und filtern (Name, Ordner, Art)" name="Dateien durchsuchen" />
          <span class="zaehler">{daten() ? `${treffer().length === alle().length ? alle().length : `${treffer().length} von ${alle().length}`} Dateien${daten()!.abgeschnitten ? ' – sehr viele, nicht alle eingelesen' : ''}` : ''}</span>
        </>}
        baumTitel="Filter"
        baum={<><Filterkaesten bedingung={bed()} arten={arten()} onAendern={setBed} />
          <Seitenliste name="Filter" art="filter" abschnitte={abschnitte()} aktiv={(id) => { const [k, w] = teile(id); return werteIn(bed(), k).includes(w); }}
            nicht={(id) => { const [k, w] = teile(id); return hat(bed(), k, w) && !werteIn(bed(), k).includes(w); }} onWahl={wahl} /></>}
        inhalt={
          <Show when={!stoerung()} fallback={leer(stoerung())}>
            <Show when={daten()} fallback={leer('Der Projektordner wird gelesen …')}>
              <Show when={form() === 'liste'} fallback={
                <Kacheln zeilen={zeilen()} gewaehlt={gewaehlt()} breite={kachelBreite()} leer="Keine Dateien zu diesen Filtern." onWahl={(id) => setGewaehlt(id)} onOeffnen={() => rahmen.detailsZeigen()}
                  inhalt={(z) => <DateiKachel name={String(z.werte.name)} vorschau={MIT_VORSCHAU.includes(endung(String(z.werte.name))) ? vorschauAdresse(projekt()!.id, z.id, String(z.werte.geaendert), kachelBreite()) : undefined} />} />}>
              <Tabelle modell={ALLE} zeilen={zeilen()} gewaehlt={gewaehlt()} reihenfolgeFest onWahl={(id) => { setGewaehlt(id); if (id) rahmen.detailsZeigen(); }}
                onOeffnen={(z) => zeigen(z.id)} leer="Keine Dateien zu diesen Filtern."
                zelle={(f, z) => (f.name === 'groesse' ? groesse(Number(z.werte.groesse)) : f.name === 'geaendert' ? zeit(String(z.werte.geaendert)) : String(z.werte[f.name] ?? ''))}
                zeilenMenue={(z) => [{ titel: 'Öffnen', tun: () => zeigen(z.id) }, { titel: 'Herunterladen', tun: () => { location.href = adresse(z.id, true); } }]} />
              </Show>
            </Show>
          </Show>
        }
        detailsTitel={datei()?.name}
        details={datei() ? <DateiKarte name={datei()!.name} groesse={datei()!.groesse} geaendert={datei()!.geaendert} ordner={datei()!.ordner} adresse={(l) => adresse(datei()!.pfad, l)}
          vorschau={vorschauAdresse(projekt()!.id, datei()!.pfad, datei()!.geaendert, 640)}
          onZu={() => setGewaehlt(null)} heftzwecke={rahmen.heftzweckeRechts()} /> : undefined} />
    </Show>
  );
}

/** Fenster zum Zuordnen: einen Ordner der Freigabe wählen (für alle, die Projekte ändern dürfen). */
/** Stellschraube „datei“: statt eines Ordners eine Datei im Projektordner wählen (z. B. Unterlage für die Bieter:innen) – dann geht es
 *  vom Ordner des Projekts aus, Dateien stehen unter den Ordnern, ein Klick nimmt sie. */
export function OrdnerFenster(p: { start: string; onWahl: (pfad: string) => void; onZu: () => void; datei?: { projekt: string; onDatei: (pfad: string, bytes: number) => void } }) {
  const [pfad, setPfad] = createSignal(p.start.split(/[\\/]+/).filter(Boolean).join('/'));
  const [liste, setListe] = createSignal<string[] | null>(null);
  const [dateien, setDateien] = createSignal<Eintrag[]>([]);
  const [stoerung, setStoerung] = createSignal('');
  createEffect(() => {
    const hier = pfad(); setListe(null); setDateien([]); setStoerung('');
    const r = p.datei
      ? ruf<{ eintraege: Eintrag[] }>(`/api/ablage/liste?projekt=${encodeURIComponent(p.datei.projekt)}&pfad=${encodeURIComponent(hier)}`).then((x) => { if (hier === pfad()) setDateien(x.eintraege.filter((e) => !e.ordner)); return x.eintraege.filter((e) => e.ordner).map((e) => e.name); })
      : ruf<{ ordner: string[] }>(`/api/ablage/ordner?pfad=${encodeURIComponent(hier)}`).then((x) => x.ordner);
    r.then((o) => { if (hier === pfad()) setListe(o); }, (e: Error) => { if (hier === pfad()) setStoerung(e.message); });
  });
  const teile = () => pfad().split('/').filter(Boolean);
  return (
    <Dialog titel={p.datei ? 'Datei im Projektordner wählen' : 'Ordner auf dem Dateiserver wählen'} onAbbrechen={p.onZu}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><Show when={!p.datei}><button class="knopf haupt" disabled={!pfad()} onClick={() => p.onWahl(pfad())}>Diesen Ordner nehmen</button></Show></>}>
      <nav class="krumen" aria-label="Pfad">
        <button onClick={() => setPfad('')}>{p.datei ? 'Projektordner' : 'Freigabe'}</button>
        <For each={teile()}>{(t, i) => <><span aria-hidden="true">›</span><button onClick={() => setPfad(teile().slice(0, i() + 1).join('/'))}>{t}</button></>}</For>
      </nav>
      <Show when={!stoerung()} fallback={<p class="feld-fehler" role="alert">{stoerung()}</p>}>
        <Show when={liste()} fallback={<p class="still-text">Ordner wird gelesen …</p>}>
          <ul class="ordnerliste">
            <For each={liste()}>{(n) => <li><button onClick={() => setPfad(pfad() ? `${pfad()}/${n}` : n)}>▤ {n}</button></li>}</For>
            <For each={dateien()}>{(d) => <li><button onClick={() => p.datei!.onDatei(pfad() ? `${pfad()}/${d.name}` : d.name, d.groesse)}>▫ {d.name} <small class="still-text">{groesse(d.groesse)}</small></button></li>}</For>
            <Show when={!liste()!.length && !dateien().length}><li class="still-text">{p.datei ? 'Leer.' : 'Keine Unterordner.'}</li></Show>
          </ul>
        </Show>
      </Show>
    </Dialog>
  );
}
