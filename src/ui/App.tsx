import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { MERKER, Netzfehler, Serverfehler, ich, merkeZustand, ruf, setZustand, zustand, type Zustand } from './api';
import { abgelaufen, geraetLeeren, lage, rueckgaengig, starte, verlauf, wartendAnzahl, wiederholen } from './abgleich';
import { AnsichtZeigen, sichtbar } from './ansichten';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { Hinweise, hinweis } from './baukasten/hinweise';
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
        <Match when={bereit()}><Portal /></Match>
      </Switch>
      <Hinweise />
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
        <div class="schritte" aria-label={`Schritt ${schritt()} von 3`}><For each={[1, 2, 3]}>{(n) => <i classList={{ an: n <= schritt() }} />}</For><span>Schritt {schritt()} von 3</span></div>
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

function Portal() {
  const z = () => zustand()!;
  const module = createMemo(() => z().module.map((m) => ({ modul: m, ansichten: m.ansichten.filter(sichtbar) })).filter((m) => m.ansichten.length));
  const [modulId, setModulId] = createSignal('');
  const [ansichtId, setAnsichtId] = createSignal('');
  const modul = () => module().find((m) => m.modul.id === modulId()) ?? module()[0];
  const ansicht = () => modul()?.ansichten.find((a) => a.id === ansichtId()) ?? modul()?.ansichten[0];
  const schluessel = createMemo(() => (ansicht() ? `${modul()!.modul.id}.${ansicht()!.id}` : undefined));
  const [menue, setMenue] = createSignal(false);
  const [kennwortFenster, setKennwortFenster] = createSignal(false);

  const taste = (e: KeyboardEvent) => {
    const ziel = e.target as HTMLElement;
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
      <header class="kopf">
        <strong class="marke">Bauportal</strong>
        <nav aria-label="Module">
          <For each={module()}>{(m) => <button classList={{ aktiv: modul()?.modul.id === m.modul.id }} onClick={() => { setModulId(m.modul.id); setAnsichtId(''); }}>{m.modul.name}</button>}</For>
        </nav>
        <span class="status" classList={{ getrennt: lage() === 'getrennt', wartet: wartendAnzahl() > 0 }}><i />{status()}</span>
        <button class="knopf still" aria-label="Rückgängig" title="Rückgängig (Strg+Z)" disabled={!verlauf().zurueck} onClick={rueckgaengig}>↶</button>
        <button class="knopf still" aria-label="Wiederholen" title="Wiederholen (Strg+Y)" disabled={!verlauf().vor} onClick={wiederholen}>↷</button>
        <div class="menue">
          <button class="knopf still" aria-haspopup="menu" aria-expanded={menue()} onClick={() => setMenue(!menue())}>{ich().name} ▾</button>
          <Show when={menue()}>
            <div class="menue-liste" role="menu" onClick={() => setMenue(false)}>
              <button role="menuitem" onClick={() => setKennwortFenster(true)}>Kennwort ändern …</button>
              <button role="menuitem" onClick={abmelden}>Abmelden</button>
              <div class="menue-fuss">{z().rollen.find((r) => r.name === ich().rolle)?.titel} · Version {z().version}</div>
            </div>
          </Show>
        </div>
      </header>
      <Show when={(modul()?.ansichten.length ?? 0) > 1}>
        <nav class="unterleiste" aria-label={modul()!.modul.name}>
          <For each={modul()!.ansichten}>{(a) => <button classList={{ aktiv: ansicht()?.id === a.id }} onClick={() => setAnsichtId(a.id)}>{a.titel}</button>}</For>
        </nav>
      </Show>
      <main>
        {/* Schlüssel ist der Name der Ansicht: sie bleibt stehen (Auswahl, Suche), auch wenn sich Rechte oder Zustand ändern. */}
        <Show when={schluessel()} keyed fallback={<div class="mitte"><p class="still-text">Für dich ist noch nichts freigegeben. Bitte wende dich an eine Administratorin oder einen Administrator.</p></div>}>
          {(_s: string) => <AnsichtZeigen modul={modul()!.modul} ansicht={ansicht()!} />}
        </Show>
      </main>
      <Show when={kennwortFenster()}>
        <Dialog titel="Kennwort ändern" onAbbrechen={() => setKennwortFenster(false)} knoepfe={<button class="knopf" onClick={() => setKennwortFenster(false)}>Abbrechen</button>}>
          <Formular knopf="Kennwort ändern" pfad="/api/kennwort" text="Auf anderen Geräten wirst du dabei abgemeldet."
            felder={[
              { name: 'altesKennwort', titel: 'Bisheriges Kennwort', typ: 'password', auto: 'current-password' },
              { name: 'kennwort', titel: 'Neues Kennwort (mindestens 10 Zeichen)', typ: 'password', auto: 'new-password' },
            ]}
            onFertig={() => { setKennwortFenster(false); hinweis('Kennwort geändert.'); }} />
        </Dialog>
      </Show>
    </div>
  );
}
