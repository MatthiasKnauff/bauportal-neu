import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Netzfehler, Serverfehler, ruf, type Benutzer, type Zustand } from './api';
import { abgelaufen, geraetLeeren, lage, rueckgaengig, starte, verlauf, wartendAnzahl, wiederholen } from './abgleich';
import { Dialog } from './baukasten/dialog';
import { Hinweise, hinweis } from './baukasten/hinweise';
import { ObjektListe } from './baukasten/objektliste';

const MERKER = 'bp_zustand';

export function App() {
  const [zustand, setZustand] = createSignal<Zustand | null>(null);
  const [bereit, setBereit] = createSignal(false);
  const [stoerung, setStoerung] = createSignal('');

  const laden = async () => {
    setStoerung('');
    let z: Zustand;
    try {
      z = await ruf<Zustand>('/api/zustand');
      if (z.benutzer) localStorage.setItem(MERKER, JSON.stringify(z)); else localStorage.removeItem(MERKER);
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
        <Match when={bereit()}><Portal zustand={zustand()!} /></Match>
      </Switch>
      <Hinweise />
    </>
  );
}

function Formular(p: { titel: string; text?: string; felder: { name: string; titel: string; typ?: string; auto?: string }[]; knopf: string; pfad: string; fest?: Record<string, unknown>; onFertig: (antwort: unknown) => void }) {
  const [werte, setWerte] = createStore<Record<string, string>>({});
  const [fehler, setFehler] = createStore<{ text: string; felder: Record<string, string> }>({ text: '', felder: {} });
  const [laeuft, setLaeuft] = createSignal(false);
  const senden = async (e: Event) => {
    e.preventDefault();
    setLaeuft(true); setFehler({ text: '', felder: {} });
    try { p.onFertig(await ruf(p.pfad, { ...p.fest, ...werte })); }
    catch (err) {
      if (err instanceof Serverfehler) setFehler({ text: err.felder && Object.keys(err.felder).length ? '' : err.message, felder: err.felder ?? {} });
      else setFehler({ text: (err as Error).message, felder: {} });
    } finally { setLaeuft(false); }
  };
  return (
    <form class="formular" onSubmit={senden}>
      <Show when={p.titel}><h1>{p.titel}</h1></Show>
      <Show when={p.text}><p class="still-text">{p.text}</p></Show>
      <For each={p.felder}>{(f) => (
        <div class="feld" classList={{ 'mit-fehler': !!fehler.felder[f.name] }}>
          <label for={'f-' + f.name}>{f.titel}</label>
          <input id={'f-' + f.name} type={f.typ ?? 'text'} autocomplete={f.auto ?? 'off'} value={werte[f.name] ?? ''} onInput={(e) => setWerte(f.name, e.currentTarget.value)} />
          <Show when={fehler.felder[f.name]}><div class="feld-fehler">{fehler.felder[f.name]}</div></Show>
        </div>
      )}</For>
      <Show when={fehler.text}><div class="feld-fehler" role="alert">{fehler.text}</div></Show>
      <button class="knopf haupt" type="submit" disabled={laeuft()}>{p.knopf}</button>
    </form>
  );
}

function Einrichtung() {
  return (
    <div class="mitte">
      <Formular titel="Bauportal einrichten" knopf="Einrichten und anmelden" pfad="/api/einrichtung" onFertig={() => location.reload()}
        text="Dieses Bauportal ist neu. Lege zuerst das Konto für die Administratorin oder den Administrator an – weitere Benutzer kommen danach."
        felder={[
          { name: 'name', titel: 'Dein Name', auto: 'name' },
          { name: 'anmeldename', titel: 'Anmeldename (z. B. Kürzel oder E-Mail-Adresse)', auto: 'username' },
          { name: 'kennwort', titel: 'Kennwort (mindestens 10 Zeichen)', typ: 'password', auto: 'new-password' },
        ]} />
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

function Portal(p: { zustand: Zustand }) {
  const [modul, setModul] = createSignal(p.zustand.module[0]!);
  const [menue, setMenue] = createSignal(false);
  const [benutzerFenster, setBenutzerFenster] = createSignal(false);
  const ich = p.zustand.benutzer!;

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
          <For each={p.zustand.module}>{(m) => <button classList={{ aktiv: modul().id === m.id }} onClick={() => setModul(m)}>{m.name}</button>}</For>
        </nav>
        <span class="status" classList={{ getrennt: lage() === 'getrennt', wartet: wartendAnzahl() > 0 }}><i />{status()}</span>
        <button class="knopf still" aria-label="Rückgängig" title="Rückgängig (Strg+Z)" disabled={!verlauf().zurueck} onClick={rueckgaengig}>↶</button>
        <button class="knopf still" aria-label="Wiederholen" title="Wiederholen (Strg+Y)" disabled={!verlauf().vor} onClick={wiederholen}>↷</button>
        <div class="menue">
          <button class="knopf still" aria-haspopup="menu" aria-expanded={menue()} onClick={() => setMenue(!menue())}>{ich.name} ▾</button>
          <Show when={menue()}>
            <div class="menue-liste" role="menu" onClick={() => setMenue(false)}>
              <Show when={ich.rolle === 'admin'}><button role="menuitem" onClick={() => setBenutzerFenster(true)}>Benutzer …</button></Show>
              <button role="menuitem" onClick={abmelden}>Abmelden</button>
              <div class="menue-fuss">Version {p.zustand.version}</div>
            </div>
          </Show>
        </div>
      </header>
      <main>
        <For each={modul().objekte}>{(o) => <ObjektListe modell={o} />}</For>
      </main>
      <Show when={benutzerFenster()}><BenutzerFenster onZu={() => setBenutzerFenster(false)} /></Show>
    </div>
  );
}

function BenutzerFenster(p: { onZu: () => void }) {
  const [liste, setListe] = createSignal<Benutzer[]>([]);
  const [runde, setRunde] = createSignal(0);
  const holen = async () => {
    try { setListe((await ruf<{ benutzer: Benutzer[] }>('/api/benutzer')).benutzer); }
    catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  };
  onMount(holen);
  return (
    <Dialog titel="Benutzer" onAbbrechen={p.onZu} knoepfe={<button class="knopf" onClick={p.onZu}>Schließen</button>}>
      <ul class="benutzer">
        <For each={liste()}>{(b) => <li><strong>{b.name}</strong><span>{b.anmeldename}</span><span>{b.rolle === 'admin' ? 'Administrator:in' : 'Mitarbeiter:in'}</span></li>}</For>
      </ul>
      <h3>Benutzer hinzufügen</h3>
      <Show when={runde() + 1} keyed>
        <Formular titel="" knopf="Hinzufügen" pfad="/api/benutzer" onFertig={() => { hinweis('Benutzer angelegt.'); setRunde(runde() + 1); void holen(); }}
          felder={[
            { name: 'name', titel: 'Name' },
            { name: 'anmeldename', titel: 'Anmeldename' },
            { name: 'kennwort', titel: 'Erstes Kennwort (mindestens 10 Zeichen)', typ: 'password', auto: 'new-password' },
          ]} />
      </Show>
    </Dialog>
  );
}
