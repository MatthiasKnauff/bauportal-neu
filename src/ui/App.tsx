// Das Portal: Einrichtung, Anmeldung, Startseite mit den Kacheln und der Rahmen um jedes Modul (Kopfleiste, Reiter, Rückgängig).
import { AppSymbol } from './baukasten/zeichen';
import { designBeobachten } from './unterbau/design';
import { Projektwahl } from './projektwahl';
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import { MERKER, Netzfehler, Serverfehler, darf, ich, merkeZustand, modell, ruf, setZustand, wartetLange, zustand, type Zustand } from './unterbau/api';
import { abgelaufen, geraetLeeren, lage, rueckgaengig, sicht, starte, verlauf, wartendAnzahl, wiederholen } from './unterbau/abgleich';
import { AnsichtZeigen, kartenZusatz, sichtbar } from './ansichten';
import { Kontextmenue } from './baukasten/kontextmenue';
import { Detailkarte } from './baukasten/detailkarte';
import { Abfolgeleiste } from './baukasten/abfolgeleiste';
import { Kopfleiste } from './baukasten/kopfleiste';
import { Suche, type Treffer } from './suche';
import { Hilfe } from './hilfe';
import { Projektkacheln } from './startkacheln';
import { springeZu, sprung } from './sprung';
import { AppUmgebung } from './baukasten/rahmen';
import { projektId, setProjektId } from './projekt';
import { Uebernahmefenster } from './uebernahme';
import { Aufraeumen } from './aufraeumen';
import { Druck } from './druck';
import { KiFenster } from './baukasten/ki';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { Hinweise } from './baukasten/hinweise';
import { hinweis } from './unterbau/meldungen';
import { BUNDESLAENDER } from '../module/verwaltung/beipackzettel';

export function App() {
  const [bereit, setBereit] = createSignal(false);
  const [stoerung, setStoerung] = createSignal('');

  const laden = async () => {
    setStoerung('');
    let z: Zustand;
    try {
      z = await ruf<Zustand>('/api/zustand');
      merkeZustand(z);
    } catch (e) {
      // ohne Netz: mit dem zuletzt bekannten Zustand und den Daten im Gerät weiterarbeiten
      const alt = localStorage.getItem(MERKER);
      if (!(e instanceof Netzfehler) || !alt) { setStoerung((e as Error).message); return; }
      z = JSON.parse(alt) as Zustand;
    }
    setZustand(z);
    if (z.benutzer) { await starte(z); setBereit(true); }
  };
  onMount(laden);

  return (
    <>
      <Show when={zustand()?.umgebung === 'test'}><div class="banner">Testserver – wird {zustand()!.version}</div></Show>
      <Switch fallback={<div class="mitte"><p class="still-text">{stoerung() || 'Bauportal wird geladen …'}</p><Show when={stoerung()}><button class="knopf" onClick={laden}>Erneut versuchen</button></Show></div>}>
        <Match when={zustand() && !zustand()!.eingerichtet}><Einrichtung /></Match>
        <Match when={zustand() && (!zustand()!.benutzer || abgelaufen())}><Anmeldung hinweis={abgelaufen() ? 'Deine Anmeldung ist abgelaufen. Deine Änderungen im Gerät bleiben erhalten.' : ''} /></Match>
        <Match when={bereit() && einzelkarte}><Kartenfenster objekt={einzelkarte![0]!} id={einzelkarte![1]!} /></Match>
        <Match when={bereit()}><Portal /></Match>
      </Switch>
      <Hinweise />
      <Kontextmenue />
      <Uebernahmefenster />
      <Aufraeumen />
      <Druck />
      <KiFenster />
      <Show when={wartetLange() > 0}><div class="warte" role="status">Einen Moment …</div></Show>
    </>
  );
}

function Einrichtung() {
  const [schritt, setSchritt] = createSignal(1);
  const [w, setW] = createStore({ bueroname: '', bundesland: '', name: '', anmeldename: '', kennwort: '', musterprojekt: true });
  const [fehler, setFehler] = createStore<{ text: string; felder: Record<string, string> }>({ text: '', felder: {} });
  const [laeuft, setLaeuft] = createSignal(false);
  const weiter = async (e: Event) => {
    e.preventDefault();
    setFehler({ text: '', felder: {} });
    if (schritt() === 2) {
      const f: Record<string, string> = {};
      if (!w.name.trim()) f.name = 'Bitte deinen Namen eintragen';
      if (w.anmeldename.trim().length < 2) f.anmeldename = 'Bitte einen Anmeldenamen eintragen';
      if (w.kennwort.length < 10) f.kennwort = 'Das Kennwort braucht mindestens 10 Zeichen';
      if (Object.keys(f).length) { setFehler({ text: '', felder: f }); return; }
    }
    if (schritt() < 3) { setSchritt(schritt() + 1); return; }
    setLaeuft(true);
    try { await ruf('/api/einrichtung', { ...w }); location.reload(); }
    catch (err) {
      const felder = err instanceof Serverfehler ? err.felder ?? {} : {};
      setFehler({ text: Object.keys(felder).length ? '' : (err as Error).message, felder });
      if (Object.keys(felder).length) setSchritt(2);
    } finally { setLaeuft(false); }
  };
  const feld = (name: 'bueroname' | 'name' | 'anmeldename' | 'kennwort', titel: string, typ = 'text', auto = 'off') => (
    <div class="feld" classList={{ 'mit-fehler': !!fehler.felder[name] }}>
      <label for={'e-' + name}>{titel}</label>
      <input id={'e-' + name} type={typ} autocomplete={auto} value={w[name]} onInput={(e) => setW(name, e.currentTarget.value)} />
      <Show when={fehler.felder[name]}><div class="feld-fehler">{fehler.felder[name]}</div></Show>
    </div>
  );
  return (
    <div class="mitte">
      <form class="formular" onSubmit={weiter}>
        <Abfolgeleiste bisher aktiv={String(schritt())} onWahl={(id) => setSchritt(Number(id))} schritte={[{ id: '1', titel: 'Büro' }, { id: '2', titel: 'Konto' }, { id: '3', titel: 'Ausprobieren' }]} />
        <Switch>
          <Match when={schritt() === 1}>
            <h1>Bauportal einrichten</h1>
            <p class="still-text">Dieses Bauportal ist neu. In drei Schritten ist es startklar – alles lässt sich später in der Verwaltung ändern.</p>
            {feld('bueroname', 'Name des Büros')}
            <div class="feld">
              <label for="e-land">Bundesland</label>
              <Auswahlliste id="e-land" titel="Bundesland" wert={w.bundesland} onWert={(x) => setW('bundesland', x)}
                optionen={[{ wert: '', titel: 'später wählen' }, ...BUNDESLAENDER.map((b) => ({ wert: b, titel: b }))]} />
              <div class="still-text klein-text">Vorgabe für Bauanträge und Landesrecht, je Projekt änderbar.</div>
            </div>
          </Match>
          <Match when={schritt() === 2}>
            <h1>Dein Konto</h1>
            <p class="still-text">Das erste Konto darf alles (Administrator:in). Weitere Benutzer legst du danach in der Verwaltung an.</p>
            {feld('name', 'Dein Name', 'text', 'name')}
            {feld('anmeldename', 'Anmeldename (z. B. Kürzel oder E-Mail-Adresse)', 'text', 'username')}
            {feld('kennwort', 'Kennwort (mindestens 10 Zeichen)', 'password', 'new-password')}
          </Match>
          <Match when={schritt() === 3}>
            <h1>Zum Ausprobieren</h1>
            <p class="still-text">Ein Musterprojekt mit drei Kontakten zeigt, wie alles zusammenhängt. Es lässt sich jederzeit löschen.</p>
            <div class="feld quer">
              <label for="e-muster">Musterprojekt anlegen</label>
              <button type="button" id="e-muster" role="switch" aria-checked={w.musterprojekt} class="schalter" classList={{ aktiv: w.musterprojekt }} onClick={() => setW('musterprojekt', !w.musterprojekt)}><span /></button>
            </div>
          </Match>
        </Switch>
        <Show when={fehler.text}><div class="feld-fehler" role="alert">{fehler.text}</div></Show>
        <div class="reihe">
          <Show when={schritt() > 1}><button type="button" class="knopf" onClick={() => setSchritt(schritt() - 1)}>Zurück</button></Show>
          <button class="knopf haupt" type="submit" disabled={laeuft()}>{schritt() < 3 ? 'Weiter' : 'Einrichten und anmelden'}</button>
        </div>
      </form>
    </div>
  );
}

function Anmeldung(p: { hinweis: string }) {
  return (
    <div class="mitte">
      <Formular titel="Bauportal" text={p.hinweis || undefined} knopf="Anmelden" pfad="/api/anmelden" onFertig={() => location.reload()}
        felder={[
          { name: 'anmeldename', titel: 'Anmeldename', auto: 'username' },
          { name: 'kennwort', titel: 'Kennwort', typ: 'password', auto: 'current-password' },
        ]} />
    </div>
  );
}

// Eine Karte im eigenen Browserfenster (?karte=objekt:kennung) – z. B. für den zweiten Bildschirm.
const einzelkarte = new URLSearchParams(location.search).get('karte')?.split(':') ?? null;

function Kartenfenster(p: { objekt: string; id: string }) {
  const m = modell(p.objekt);
  const z = () => { const x = m && sicht[p.objekt]?.[p.id]; return x && !x.geloescht ? x : undefined; };
  createEffect(() => { document.title = `${z()?.werte[m?.anzeigeFeld ?? ''] ?? 'Bauportal'}`; });
  return (
    <div class="kartenfenster">
      <Show when={z()} fallback={<div class="mitte"><p class="still-text">Diesen Eintrag gibt es nicht (mehr) oder du darfst ihn nicht sehen.</p></div>}>
        {(zeile) => <Detailkarte modell={m} zeile={zeile()} zusatz={kartenZusatz(p.objekt)} />}
      </Show>
      <div class="status" classList={{ getrennt: lage() === 'getrennt', wartet: wartendAnzahl() > 0 }}><i />{lage() === 'verbunden' ? (wartendAnzahl() ? 'Wird gespeichert …' : 'Alles gespeichert') : 'Ohne Verbindung'}</div>
    </div>
  );
}

function Portal() {
  const z = () => zustand()!;
  const module = createMemo(() => z().module.map((m) => ({ modul: m, ansichten: m.ansichten.filter(sichtbar) })).filter((m) => m.ansichten.length));
  // '' = Startseite mit den Kacheln. Beim Neuladen bleibt man, wo man war; nach dem Anmelden beginnt man auf der Startseite.
  const gemerkt = (() => { try { return sessionStorage.getItem('bp_modul') ?? ''; } catch { return ''; } })();
  const [modulId, setModulIdRoh] = createSignal(gemerkt);
  const setModulId = (id: string) => { setModulIdRoh(id); try { sessionStorage.setItem('bp_modul', id); } catch { /* gesperrt */ } };
  const [ansichtId, setAnsichtId] = createSignal('');
  const modul = () => module().find((m) => m.modul.id === modulId());
  const ansicht = () => modul()?.ansichten.find((a) => a.id === ansichtId()) ?? modul()?.ansichten[0];
  const projekte = createMemo(() => Object.values(sicht.projekt ?? {}).filter((x) => !x.geloescht && x.werte.status !== 'archiviert')
    .map((x) => ({ wert: x.id, titel: [x.werte.nummer, x.werte.name].filter(Boolean).join(' · ') })).sort((x, y) => x.titel.localeCompare(y.titel, 'de', { numeric: true })));
  const schluessel = createMemo(() => (ansicht() ? `${modul()!.modul.id}.${ansicht()!.id}` : undefined));
  designBeobachten();
  const [suche, setSuche] = createSignal(false);
  const [hilfe, setHilfe] = createSignal(false);
  const oeffne = (id: string, ansichtId = '') => { setModulId(id); setAnsichtId(ansichtId); };
  // Treffer der Suche: Projekt und Version wählen, Ansicht öffnen, die Ansicht holt den Eintrag ab
  const springe = (t: Treffer) => springeZu(t.m.name, t.id, { projekt: t.projekt, version: t.version, modul: t.modul.id, ansicht: t.ansicht });
  // Ein Sprung (aus der Suche oder aus einer Karte) öffnet Modul und Ansicht; den Eintrag holt die Ansicht selbst ab
  createEffect(() => { const s = sprung(); if (s) untrack(() => oeffne(s.modul, s.ansicht)); });
  // Handy-Leiste unten: Start, die wichtigsten Apps für die Baustelle, Suche
  const leiste = () => ['bautagebuch', 'bauzeitenplan', 'adressen'].map((id) => module().find((m) => m.modul.id === id)).filter((m): m is NonNullable<typeof m> => !!m);

  const taste = (e: KeyboardEvent) => {
    const ziel = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSuche(true); return; }   // Suche über alles – auch aus Feldern
    if (!(e.ctrlKey || e.metaKey) || ziel.matches('input, textarea')) return;   // in Feldern gilt das Rückgängig des Browsers
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); wiederholen(); }
  };
  onMount(() => document.addEventListener('keydown', taste));
  onCleanup(() => document.removeEventListener('keydown', taste));

  const abmelden = async () => {
    if (wartendAnzahl() > 0) { hinweis('Es warten noch Änderungen auf den Server. Bitte erst abmelden, wenn die Verbindung wieder steht.', { art: 'fehler' }); return; }
    try { await ruf('/api/abmelden', {}); } catch { hinweis('Abmelden geht nur mit Verbindung zum Server.', { art: 'fehler' }); return; }
    localStorage.removeItem(MERKER);
    await geraetLeeren();
    location.reload();
  };

  const status = () => lage() === 'verbunden'
    ? (wartendAnzahl() ? 'Wird gespeichert …' : 'Alles gespeichert')
    : lage() === 'laden' ? 'Verbinde …'
    : (wartendAnzahl() ? `Ohne Verbindung – ${wartendAnzahl()} ${wartendAnzahl() === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : 'Ohne Verbindung');

  return (
    <div class="portal">
      <Kopfleiste marke="Bauportal" aktuell={modul()?.modul.name} onStart={() => { setModulId(''); setAnsichtId(''); }}
        status={{ text: status(), art: lage() === 'getrennt' ? 'getrennt' : wartendAnzahl() > 0 ? 'wartet' : 'gut' }}
        projekt={<Show when={projekte().length || darf('projekt', 'schreiben')}><Projektwahl kartenZusatz={kartenZusatz('projekt')} /></Show>}
        onSuche={() => setSuche(true)} onHilfe={() => setHilfe(true)}
        apps={module().map((m) => ({ id: m.modul.id, titel: m.modul.name, zeichen: m.modul.zeichen }))} projektName={projektId() && sicht.projekt?.[projektId()!] ? String(sicht.projekt[projektId()!]!.werte.name ?? '') : ''} onApp={(id) => oeffne(id)}
        benutzer={ich().name} menueFuss={`${z().rollen.find((r) => r.name === ich().rolle)?.titel} · Version ${z().version}`}
        benutzerMenue={[{ titel: 'Hilfe zu dieser Seite', tun: () => setHilfe(true) }, { titel: 'Mein Konto · Kennwort …', tun: () => oeffne('verwaltung', 'konto') }, { titel: 'Darstellung …', tun: () => oeffne('verwaltung', 'darstellung') }, { titel: 'Abmelden', tun: abmelden }]} />
      <main>
        {/* Schlüssel ist der Name der Ansicht: sie bleibt stehen (Auswahl, Suche), auch wenn sich Rechte oder Zustand ändern. */}
        <AppUmgebung.Provider value={{ reiter: () => modul()?.ansichten.map((a) => ({ id: a.id, titel: a.titel, abschnitt: a.abschnitt, zeichen: a.zeichen })) ?? [], aktiv: () => ansicht()?.id ?? '', onReiter: setAnsichtId,
          rueckgaengig: { zurueck: () => verlauf().zurueck > 0, vor: () => verlauf().vor > 0, onZurueck: rueckgaengig, onVor: wiederholen } }}>
          <Show when={schluessel()} keyed fallback={
            <div class="start"><div class="start-innen">
              <h1>Guten Tag, {ich().name.split(' ')[0]}</h1>
              <Show when={module().length} fallback={<p class="still-text">Für dich ist noch nichts freigegeben. Bitte wende dich an eine Administratorin oder einen Administrator.</p>}>
                <p class="still-text">Womit möchtest du arbeiten?</p>
                <div class="kacheln" role="list" aria-label="Module">
                  <For each={module()}>{(m) => <button class="kachel app-kachel" role="listitem" onClick={() => { setModulId(m.modul.id); setAnsichtId(''); }}><AppSymbol id={m.modul.id} zeichen={m.modul.zeichen} /><span class="app-kachel-text"><strong>{m.modul.name}</strong><span title={m.modul.beschreibung}>{m.modul.beschreibung}</span></span></button>}</For>
                </div>
                <Show when={projektId() && sicht.projekt?.[projektId()!] && !sicht.projekt[projektId()!]!.geloescht}><Projektkacheln projekt={projektId()!} onApp={(id, a) => oeffne(id, a ?? '')} /></Show>
              </Show>
            </div>
            <p class="start-version still-text klein-text">{zustand()!.umgebung === 'test' ? `Testserver · wird ${zustand()!.version}` : `Version ${zustand()!.version}`}</p>
            </div>}>
            {(_s: string) => <AnsichtZeigen modul={modul()!.modul} ansicht={ansicht()!} />}
          </Show>
        </AppUmgebung.Provider>
      </main>
      <nav class="handyleiste" aria-label="Schnellzugriff">
        <button classList={{ an: !modulId() }} onClick={() => oeffne('')}><Symbol name="start" />Start</button>
        <For each={leiste()}>{(m) => <button classList={{ an: modulId() === m.modul.id }} onClick={() => oeffne(m.modul.id)}><Symbol name={m.modul.id} />{m.modul.name}</button>}</For>
        <button onClick={() => setSuche(true)}><Symbol name="suche" />Suche</button>
      </nav>
      <Show when={suche()}><Suche onTreffer={springe} onZu={() => setSuche(false)} /></Show>
      <Show when={hilfe()}><Hilfe modul={modul()?.modul} ansicht={ansicht()} onZu={() => setHilfe(false)} /></Show>
    </div>
  );
}

// Symbole der Handy-Leiste – schlichte Linien, in der Farbe des Textes
const PFADE: Record<string, string> = {
  start: 'M3 11 12 4l9 7v9h-6v-6H9v6H3z',
  bautagebuch: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4',
  bauzeitenplan: 'M4 5h7M7 10h9M10 15h10M4 20h16',
  adressen: 'M5 4h14v16H5zM12 11a2.5 2.5 0 1 0 0-.01M8 17c1-2.5 7-2.5 8 0',
  suche: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
};
function Symbol(p: { name: string }) {
  return <svg class="symbol" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={PFADE[p.name] ?? PFADE.start} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}
