// Bautagebuch wie gewohnt: links Kalender (oder Liste) und die Abschnitte des Berichts, in der Mitte der Bericht als
// Seite – Kopf mit Datum, Wetter und Kontrollen, darunter je Abschnitt eine Karte –, rechts das Detail des angeklickten
// Eintrags. Die Abschnitte sind dieselben Bausteine wie in „Schritt für Schritt“ (Unterliste, Bilder, Feld).
import { Seitenliste } from './baukasten/seitenliste';
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import type { Feld } from '../kern/modell';
import { ausfuehren, rueckgaengig, sicht } from './unterbau/abgleich';
import { ausdrucke, darf, modell, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import type { Mitte } from './baukasten/anpassung';
import { Bilder } from './baukasten/bilder';
import { Detailkarte, feldAendern, loesche } from './baukasten/detailkarte';
import { FeldEingabe, anzeige } from './baukasten/feld';
import { Schrittweise } from './baukasten/schrittweise';
import { Unterliste } from './baukasten/unterliste';
import { Verlauf } from './baukasten/verlauf';
import { Diktieren } from './diktat';
import { druckOeffnen } from './druck';
import { Zeichen, type Zeichenname } from './baukasten/zeichen';

const lebende = (objekt: string) => Object.values(sicht[objekt] ?? {}).filter((z) => !z.geloescht);
const heute = () => new Date().toLocaleDateString('sv');
const datumText = (d: unknown) => (d ? new Date(`${String(d)}T12:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const merke = (k: string, w: string) => { try { localStorage.setItem(k, w); } catch { /* ohne Speicher gilt es bis zum Neuladen */ } };
const hole = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

// Was rechts steht: ein Eintrag des Berichts, der Bericht selbst zum Bearbeiten – oder nichts
const [eintrag, setEintrag] = createSignal<string | null>(null);
const [bearbeiten, setBearbeiten] = createSignal(false);

/** Die Abschnitte eines Berichts – Reihenfolge wie im alten Bautagebuch. */
const ABSCHNITTE: { id: string; titel: string; zeichen: Zeichenname; art?: string }[] = [
  { id: 'anwesend', titel: 'Anwesende', zeichen: 'personen', art: 'anwesend' },
  { id: 'notiz', titel: 'Notizen', zeichen: 'notiz', art: 'notiz' },
  { id: 'fotos', titel: 'Bilder', zeichen: 'foto' },
  { id: 'mangel', titel: 'Mängel', zeichen: 'mangel', art: 'mangel' },
  { id: 'aufgabe', titel: 'Zu erledigen', zeichen: 'aufgabe', art: 'aufgabe' },
  { id: 'weisung', titel: 'Weisungen', zeichen: 'weisung', art: 'weisung' },
];
const anzahl = (bericht: string, a: (typeof ABSCHNITTE)[number]) =>
  a.art ? lebende('bericht_eintrag').filter((e) => e.werte.bericht === bericht && e.werte.art === a.art).length : lebende('foto').filter((f) => f.werte.bericht === bericht).length;
const zumAbschnitt = (id: string) => document.getElementById(`abschnitt-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------- links: Kalender oder Liste, darunter die Abschnitte ----------
export function BerichtLinks(p: Mitte) {
  const [form, setForm] = createSignal(hole('bp.bautagebuch.links', 'kalender'));
  const gewaehlt = () => (p.gewaehlt() ? sicht.tagesbericht?.[p.gewaehlt()!] : undefined);
  const [monat, setMonat] = createSignal((String(gewaehlt()?.werte.datum ?? '') || heute()).slice(0, 7));
  createEffect(on(() => gewaehlt()?.werte.datum, (d) => { if (d) setMonat(String(d).slice(0, 7)); }));
  const proTag = createMemo(() => {
    const m = new Map<string, Zeile[]>();
    for (const z of p.alle()) { const d = String(z.werte.datum ?? ''); if (d) (m.get(d) ?? m.set(d, []).get(d)!).push(z); }
    return m;
  });
  const tage = createMemo(() => {
    const [j, mo] = monat().split('-').map(Number) as [number, number];
    const erster = new Date(j, mo - 1, 1), versatz = (erster.getDay() + 6) % 7, n = new Date(j, mo, 0).getDate();
    return [...Array(versatz).fill(null), ...Array.from({ length: n }, (_, i) => `${monat()}-${String(i + 1).padStart(2, '0')}`)] as (string | null)[];
  });
  const blaettern = (s: number) => { const [j, mo] = monat().split('-').map(Number) as [number, number]; const d = new Date(j, mo - 1 + s, 1); setMonat(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const titelMonat = () => new Date(`${monat()}-15T12:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const waehle = (id: string) => { setEintrag(null); setBearbeiten(false); p.onWahl(id); };
  const liste = () => [...p.zeilen()].sort((a, b) => String(b.werte.datum ?? '').localeCompare(String(a.werte.datum ?? '')) || Number(b.werte.nummer ?? 0) - Number(a.werte.nummer ?? 0));
  return (
    <div class="bt-links">
      <div class="auswahl bt-form" role="radiogroup" aria-label="Berichte zeigen als">
        <For each={[['kalender', 'Kalender'], ['liste', 'Liste']] as const}>{([k, t]) =>
          <button type="button" role="radio" aria-checked={form() === k} classList={{ aktiv: form() === k }} onClick={(e) => { e.stopPropagation(); setForm(k); merke('bp.bautagebuch.links', k); }}>{t}</button>}</For>
      </div>
      <Show when={form() === 'kalender'} fallback={
        <ul class="bt-berichte"><For each={liste()} fallback={<li class="still-text">Keine Berichte.</li>}>{(z) => (
          <li><button classList={{ an: z.id === p.gewaehlt() }} onClick={() => waehle(z.id)}>
            <strong>Nr. {String(z.werte.nummer ?? '')}</strong> <span>{datumText(z.werte.datum)}</span><span class="still-text">{String(z.werte.titel ?? '')}</span>
          </button></li>)}</For></ul>}>
        <div class="bt-kalender" onClick={(e) => e.stopPropagation()}>
          <div class="bt-monat"><button class="knopf klein still" aria-label="Voriger Monat" onClick={() => blaettern(-1)}>‹</button><strong>{titelMonat()}</strong><button class="knopf klein still" aria-label="Nächster Monat" onClick={() => blaettern(1)}>›</button></div>
          <div class="bt-tage" role="grid" aria-label={titelMonat()}>
            <For each={['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']}>{(t) => <span class="bt-wt">{t}</span>}</For>
            <For each={tage()}>{(d) => d ? (() => { const b = () => proTag().get(d) ?? []; return (
              <button class="bt-tag" classList={{ bericht: b().length > 0, an: !!gewaehlt() && gewaehlt()!.werte.datum === d, heute: d === heute() }}
                disabled={!b().length} aria-label={`${datumText(d)}${b().length ? `: ${b().length} Bericht${b().length > 1 ? 'e' : ''}` : ''}`}
                onClick={() => { const z = b(); if (z.length) waehle(z[z.length - 1]!.id); }}>{Number(d.slice(8))}</button>); })() : <span />}</For>
          </div>
        </div>
      </Show>
      <Show when={gewaehlt()}>{(g) => (
        <Seitenliste name="Abschnitte des Berichts" art="filter" aktiv="" onWahl={zumAbschnitt} abschnitte={[{ titel: `Tagesbericht Nr. ${String(g().werte.nummer ?? '')} · ${datumText(g().werte.datum)}`,
          eintraege: [{ id: 'kopf', titel: 'Allgemein', zeichen: 'bericht' }, ...ABSCHNITTE.map((a) => ({ id: a.id, titel: a.titel, zeichen: a.zeichen, anzahl: anzahl(g().id, a) }))] }]} />
      )}</Show>
    </div>
  );
}

// ---------- Mitte: der Bericht als Seite ----------
/** Firmen zur Auswahl: zuerst die Beteiligten des Projekts, dann alle übrigen Kontakte. */
const firmenFuer = (projekt: unknown) => () => {
  const beteiligt = new Set(lebende('projekt_kontakt').filter((e) => e.werte.projekt === projekt).map((e) => e.werte.kontakt));
  return lebende('kontakt').map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – '), vorn: beteiligt.has(k.id) }))
    .sort((a, b) => Number(b.vorn) - Number(a.vorn) || a.titel.localeCompare(b.titel, 'de'));
};

/** Die Listen eines Berichts – dieselben in der Seite und im Ablauf „Schritt für Schritt“. */
function listen(bericht: Zeile, seite: boolean): Record<string, () => JSX.Element> {
  const fest = (art: string) => ({ projekt: bericht.werte.projekt ?? null, bericht: bericht.id, art });
  const wahl = seite ? { ohneTitel: true, onWahl: (id: string) => { setBearbeiten(false); setEintrag(id); } } : {};
  return {
    anwesend: () => <Unterliste titel="Anwesende" objekt="bericht_eintrag" fest={fest('anwesend')} haupt="text" neben={['personen']} neuUeber="firma" angebot={firmenFuer(bericht.werte.projekt)} platzhalter="+ Firma hinzufügen …" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    notiz: () => <Unterliste titel="Notizen" objekt="bericht_eintrag" fest={fest('notiz')} haupt="text" neben={['frist']} platzhalter="Notiz eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    fotos: () => <Show when={darf('foto', 'lesen')}><Bilder titel="Bilder" ohneTitel={seite} objekt="foto" fest={{ projekt: bericht.werte.projekt ?? null, bericht: bericht.id }} beschriftung="beschriftung" hochladen="/api/foto" /></Show>,
    mangel: () => <Unterliste titel="Mängel" objekt="bericht_eintrag" fest={fest('mangel')} haupt="text" haken="erledigt" neben={['firma', 'frist']} platzhalter="Mangel eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    aufgabe: () => <Unterliste titel="Zu erledigen" objekt="bericht_eintrag" fest={fest('aufgabe')} haupt="text" haken="erledigt" neben={['frist']} platzhalter="Aufgabe eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
    weisung: () => <Unterliste titel="Weisungen" objekt="bericht_eintrag" fest={fest('weisung')} haupt="text" neben={['firma', 'frist']} platzhalter="Weisung eingeben und Enter" {...wahl} gewaehlt={seite ? eintrag() : undefined} />,
  };
}

export function WetterHolen(p: { bericht: Zeile }) {
  const [laeuft, setLaeuft] = createSignal(false);
  const holen = async () => {
    setLaeuft(true);
    try {
      const { ort, ...w } = await ruf<{ ort: string; wetter: string; temperatur: number; luftfeuchte: number; wind: number; niederschlag: number }>('/api/wetter', { projekt: p.bericht.werte.projekt, datum: p.bericht.werte.datum, uhrzeit: p.bericht.werte.uhrzeit });
      ausfuehren({ objekt: 'tagesbericht', art: 'aendern', objektId: p.bericht.id, werte: w, herkunft: 'wetterdienst' }, 'Wetter eintragen');
      hinweis(`Wetter für ${ort} eingetragen.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  return <Show when={darf('tagesbericht', 'schreiben')}><button class="knopf klein still" title="Wetter vom Standort der Baustelle holen" disabled={laeuft()} onClick={holen}>{laeuft() ? 'Wetter wird geholt …' : '📍 Standort'}</button></Show>;
}

/** „Schritt für Schritt“ durch einen Bericht – am Handy auf der Baustelle. */
function Schritte(p: { bericht: Zeile; steuer?: (oeffnen: () => void) => void }) {
  const m = modell('tagesbericht');
  const felder = (gruppe: string) => () => (
    <div class="schritt-felder">
      <For each={m.felder.filter((f) => f.gruppe === gruppe && !f.verborgen)}>{(f) =>
        <FeldEingabe feld={f} wert={sicht.tagesbericht?.[p.bericht.id]?.werte[f.name] ?? null} onWert={(w) => feldAendern(m, sicht.tagesbericht![p.bericht.id]!, f, w)} />}</For>
    </div>
  );
  const l = listen(p.bericht, false);
  const schritte = [
    { titel: 'Wetter', inhalt: () => <><WetterHolen bericht={p.bericht} />{felder('Wetter')()}</> },
    ...ABSCHNITTE.map((a) => ({ titel: a.titel, inhalt: l[a.id]! })),
    { titel: 'Kontrollen', inhalt: felder('Kontrollen') },
  ];
  return <Schrittweise knopf="Schritt für Schritt" titel="Tagesbericht" schritte={schritte} steuer={p.steuer} />;
}

// Werkzeuge des Berichts (Diktieren, Schritt für Schritt) stehen wie im bisherigen Bauportal in der Menüleiste;
// ihre Fenster hängen hier am Bericht – geöffnet über die gemeldeten Funktionen.
interface Werkzeuge { diktat?: () => void; schritte?: () => void }
function Kopf(p: { bericht: Zeile; werkzeuge: Werkzeuge }) {
  const m = modell('tagesbericht');
  const w = () => p.bericht.werte;
  const feld = (n: string) => m.felder.find((f) => f.name === n)!;
  const bauleitung = () => (w().bauleitung ? String(sicht.benutzer?.[String(w().bauleitung)]?.werte.name ?? '') : '');
  const zahl = (x: unknown, e: string) => (x == null || x === '' ? '' : `${Number(x).toLocaleString('de-DE')} ${e}`);
  const wetter = () => [zahl(w().temperatur, '°C'), anzeige(feld('wetter'), w().wetter as never), w().niederschlag == null ? '' : Number(w().niederschlag) ? zahl(w().niederschlag, 'mm') : 'trocken', zahl(w().wind, 'km/h'), zahl(w().luftfeuchte, '%')].filter((x) => x && x !== 'keine Angabe');
  const kontrollen = () => m.felder.filter((f) => f.gruppe === 'Kontrollen' && f.art === 'ja_nein');
  const schreiben = () => darf('tagesbericht', 'schreiben');
  return (
    <section class="bt-kopf bt-karte" id="abschnitt-kopf" aria-label="Tagesbericht">
      <div class="bt-kopf-zeile">
        <span class="bt-symbol"><Zeichen name="bericht" groesse={18} /></span>
        <div class="bt-kopf-titel">
          <h2>Tagesbericht Nr. {String(w().nummer ?? '')}</h2>
          <p classList={{ 'bt-nicht-heute': !!w().datum && w().datum !== heute() }}>
            {w().datum === heute() ? 'Heute' : datumText(w().datum)}{w().datum && w().datum !== heute() ? ' · nicht von heute' : ''}{w().uhrzeit ? ` · ${String(w().uhrzeit)} Uhr` : ''}
          </p>
          <p class="still-text">{[String(w().titel ?? ''), bauleitung()].filter(Boolean).join(' · ')}</p>
        </div>
        <Show when={schreiben()}><button class="knopf still" aria-label="Bericht bearbeiten" title="Bericht bearbeiten" onClick={() => { setEintrag(null); setBearbeiten(true); }}>✎</button></Show>
      </div>
      <div class="bt-kopf-zeile bt-wetter">
        <span>☁ {wetter().join(' · ') || 'kein Wetter eingetragen'}</span>
        <WetterHolen bericht={p.bericht} />
        <span class="bt-schalter">
          <For each={kontrollen()}>{(f) => (
            <button type="button" role="switch" aria-checked={w()[f.name] === true} classList={{ an: w()[f.name] === true }} disabled={!schreiben()}
              onClick={() => feldAendern(m, p.bericht, f, w()[f.name] !== true)}><i />{kurz(f)}</button>
          )}</For>
        </span>
      </div>
      <div class="bt-kopf-zeile bt-fuss">
        <Show when={w().pdf} fallback={<span class="still-text klein-text">Noch nicht als PDF exportiert</span>}><span class="gut-text klein-text">✓ Als PDF exportiert: {String(w().pdf)}</span></Show>
        <span class="bt-werkzeuge">
          <Show when={darf('bericht_eintrag', 'schreiben')}><Diktieren bericht={p.bericht} steuer={(f) => (p.werkzeuge.diktat = f)} /><Schritte bericht={p.bericht} steuer={(f) => (p.werkzeuge.schritte = f)} /></Show>
          <Verlauf objekt="tagesbericht" id={p.bericht.id} unter={[{ objekt: 'bericht_eintrag', feld: 'bericht' }, { objekt: 'foto', feld: 'bericht' }]} />
        </span>
      </div>
    </section>
  );
}
const KURZ: Record<string, string> = { aufgeraeumt: 'aufgeräumt', masskontrolle: 'Maßkontrolle', fotodoku: 'Fotos', firmen_angesprochen: 'Firmen angesprochen' };
const kurz = (f: Feld) => KURZ[f.name] ?? f.titel;

function Abschnitt(p: { a: (typeof ABSCHNITTE)[number]; bericht: Zeile; inhalt: () => JSX.Element }) {
  const schluessel = `bp.bautagebuch.zu.${p.a.id}`;
  const [zu, setZu] = createSignal(hole(schluessel, '') === 'zu');
  let karte!: HTMLElement;
  const neu = () => { setZu(false); merke(schluessel, ''); queueMicrotask(() => karte.querySelector<HTMLElement>('.unterliste-neu, .unterliste .auswahlliste-knopf, .bilder input[type=file], .bilder button')?.focus()); };
  return (
    <section class={`bt-karte bt-${p.a.id}`} id={`abschnitt-${p.a.id}`} ref={karte} aria-label={p.a.titel}>
      <div class="bt-karte-kopf">
        <span class="bt-symbol"><Zeichen name={p.a.zeichen} groesse={18} /></span>
        <h3>{p.a.titel}</h3><span class="anzahl">{anzahl(p.bericht.id, p.a)}</span>
        <button class="knopf still" aria-label={zu() ? `${p.a.titel} aufklappen` : `${p.a.titel} zuklappen`} aria-expanded={!zu()} onClick={() => { setZu(!zu()); merke(schluessel, zu() ? 'zu' : ''); }}>{zu() ? '▸' : '▾'}</button>
        <Show when={darf(p.a.id === 'fotos' ? 'foto' : 'bericht_eintrag', 'schreiben')}><button class="knopf bt-plus" aria-label={`${p.a.titel}: neuer Eintrag`} onClick={neu}>+</button></Show>
      </div>
      <Show when={!zu()}>{p.inhalt()}</Show>
    </section>
  );
}

export function Berichtsseite(p: Mitte) {
  // Ohne Wahl: der neueste Bericht – wie beim Aufschlagen des Bautagebuchs
  createEffect(() => {
    if (p.gewaehlt() && sicht.tagesbericht?.[p.gewaehlt()!] && !sicht.tagesbericht[p.gewaehlt()!]!.geloescht) return;
    const neu = [...p.alle()].sort((a, b) => String(b.werte.datum ?? '').localeCompare(String(a.werte.datum ?? '')) || Number(b.werte.nummer ?? 0) - Number(a.werte.nummer ?? 0))[0];
    if (neu) p.onWahl(neu.id);
  });
  createEffect(on(() => p.gewaehlt(), () => { setEintrag(null); setBearbeiten(false); }, { defer: true }));
  const bericht = () => (p.gewaehlt() ? sicht.tagesbericht?.[p.gewaehlt()!] : undefined);
  const werkzeuge: Werkzeuge = {};
  // Menüleiste wie im bisherigen Bauportal: NEU Diktieren · BERICHT Schritt für Schritt, Löschen · AUSGABE PDF
  createEffect(() => {
    const b = bericht();
    p.setKnoepfe(b ? [
      ...(darf('bericht_eintrag', 'schreiben') ? [{ titel: 'Diktieren', zeichen: 'diktieren', gruppe: 'Neu', tun: () => werkzeuge.diktat?.() },
        { titel: 'Schritt für Schritt', zeichen: 'schrittweise', gruppe: 'Bericht', tun: () => werkzeuge.schritte?.() }] : []),
      ...(darf('tagesbericht', 'loeschen') ? [{ titel: 'Löschen', zeichen: 'loeschen', gruppe: 'Bericht', tun: () => loesche(modell('tagesbericht'), b) }] : []),
      ...ausdrucke('tagesbericht').map((a) => ({ titel: 'PDF', zeichen: 'pdf', gruppe: 'Ausgabe', rechts: true, tun: () => druckOeffnen(a.id, b.id) })),
    ] : []);
  });
  return (
    <div class="bt-seite">
      <Show when={bericht()} fallback={<p class="leer">{p.alle().length ? 'Links einen Bericht wählen.' : darf('tagesbericht', 'schreiben') ? 'Noch kein Tagesbericht. Mit „+ Tagesbericht“ legst du den ersten an.' : 'Noch kein Tagesbericht.'}</p>}>{(b) => {
        const l = listen(b(), true);
        return (<>
          <Kopf bericht={b()} werkzeuge={werkzeuge} />
          <Show when={darf('bericht_eintrag', 'lesen')}>
            <For each={ABSCHNITTE}>{(a) => <Abschnitt a={a} bericht={b()} inhalt={l[a.id]!} />}</For>
          </Show>
        </>);
      }}</Show>
    </div>
  );
}

// ---------- rechts: das Detail des angeklickten Eintrags oder der Bericht zum Bearbeiten ----------
export function BerichtDetails(z: Zeile): JSX.Element | undefined {
  return (
    <Show when={eintrag() && sicht.bericht_eintrag?.[eintrag()!] && !sicht.bericht_eintrag[eintrag()!]!.geloescht ? sicht.bericht_eintrag[eintrag()!] : undefined}
      fallback={<Show when={bearbeiten()}><Detailkarte modell={modell('tagesbericht')} zeile={z} onZu={() => setBearbeiten(false)} verborgen={['projekt']} /></Show>}>
      {(e) => <Detailkarte modell={modell('bericht_eintrag')} zeile={e()} onZu={() => setEintrag(null)} verborgen={['projekt', 'bericht', 'reihe']} />}
    </Show>
  );
}
/** Rechts ist nur etwas, wenn ein Eintrag gewählt ist oder der Bericht bearbeitet wird – sonst bekommt die Seite den Platz. */
export const berichtDetailsDa = () => !!eintrag() || bearbeiten();
