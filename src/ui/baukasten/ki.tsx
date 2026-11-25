// Baustein „KI“: ein Fenster für alle langen Textfelder (der Baustein „Feld“ ruft es auf) und die Einrichtung
// einer Anbindung in der Verwaltung. Die KI schlägt nur vor – übernommen wird erst nach Bestätigung.
import { For, Show, createResource, createSignal } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, sicht } from '../unterbau/abgleich';
import { ruf } from '../unterbau/api';
import { Dialog } from './dialog';
import { Formular } from './formular';
import { hinweis } from '../unterbau/meldungen';

/** Eingeschaltete Anbindungen, die der Benutzer sehen darf – die KI im Büro zuerst. */
export const kiAnbindungen = (): Zeile[] => Object.values(sicht.ki_anbindung ?? {}).filter((z) => !z.geloescht && z.werte.aktiv === true && z.werte.modell)
  .sort((a, b) => Number(b.werte.art === 'ollama') - Number(a.werte.art === 'ollama') || String(a.werte.name).localeCompare(String(b.werte.name), 'de'));

interface Auftrag { titel: string; text: string; onUebernehmen: (text: string) => void }
const [auftrag, setAuftrag] = createSignal<Auftrag | null>(null);
export const kiOeffnen = (a: Auftrag) => setAuftrag(a);
const MERKER = 'bp_ki';
const [aufgaben] = createResource(() => (auftrag() ? true : undefined), () => ruf<{ wert: string; titel: string }[]>('/api/ki/aufgaben'));

function KiTextFenster(p: { auftrag: Auftrag }) {
  const zu = () => setAuftrag(null);
  const gemerkt = (() => { try { return JSON.parse(localStorage.getItem(MERKER) ?? '{}') as { anbindung?: string; aufgabe?: string }; } catch { return {}; } })();
  const [anbindung, setAnbindung] = createSignal(kiAnbindungen().find((z) => z.id === gemerkt.anbindung)?.id ?? kiAnbindungen()[0]?.id ?? '');
  const [aufgabe, setAufgabe] = createSignal(gemerkt.aufgabe ?? 'ausformulieren');
  const [lage, setLage] = createSignal<{ art: 'bereit' } | { art: 'laeuft' } | { art: 'vorschlag'; ersetzt: number; extern: boolean } | { art: 'fehler'; text: string }>({ art: 'bereit' });
  const [vorschlag, setVorschlag] = createSignal('');
  const extern = () => sicht.ki_anbindung?.[anbindung()]?.werte.art !== 'ollama';
  const holen = async () => {
    localStorage.setItem(MERKER, JSON.stringify({ anbindung: anbindung(), aufgabe: aufgabe() }));
    setLage({ art: 'laeuft' });
    try {
      const r = await ruf<{ vorschlag: string; extern: boolean; ersetzt: number }>('/api/ki/text', { anbindung: anbindung(), aufgabe: aufgabe(), text: p.auftrag.text });
      setVorschlag(r.vorschlag); setLage({ art: 'vorschlag', ersetzt: r.ersetzt, extern: r.extern });
    } catch (e) { setLage({ art: 'fehler', text: (e as Error).message }); }
  };
  return (
    <Dialog titel={`KI – ${p.auftrag.titel}`} breit onAbbrechen={lage().art === 'laeuft' ? undefined : zu}
      knoepfe={<>
        <button class="knopf" disabled={lage().art === 'laeuft'} onClick={zu}>Abbrechen</button>
        <button class="knopf" classList={{ haupt: lage().art !== 'vorschlag' }} disabled={lage().art === 'laeuft' || !anbindung() || !p.auftrag.text.trim()} onClick={holen}>{lage().art === 'vorschlag' ? 'Neuer Vorschlag' : lage().art === 'laeuft' ? 'Die KI schreibt …' : 'Vorschlag holen'}</button>
        <Show when={lage().art === 'vorschlag'}><button class="knopf haupt" disabled={!vorschlag().trim()} onClick={() => { p.auftrag.onUebernehmen(vorschlag().trim()); zu(); }}>Übernehmen</button></Show>
      </>}>
      <Show when={p.auftrag.text.trim()} fallback={<p class="still-text">In diesem Feld steht noch nichts. Schreib ein paar Stichworte hinein – die KI macht daraus einen Text.</p>}>
        <div class="feld"><label>Was soll die KI tun?</label>
          <div class="auswahl" role="radiogroup" aria-label="Was soll die KI tun?">
            <For each={aufgaben() ?? []}>{(a) => <button type="button" role="radio" aria-checked={aufgabe() === a.wert} classList={{ aktiv: aufgabe() === a.wert }} onClick={() => setAufgabe(a.wert)}>{a.titel}</button>}</For>
          </div></div>
        <Show when={kiAnbindungen().length > 1}>
          <div class="feld"><label>Welche KI?</label>
            <div class="auswahl" role="radiogroup" aria-label="Welche KI?">
              <For each={kiAnbindungen()}>{(z) => <button type="button" role="radio" aria-checked={anbindung() === z.id} classList={{ aktiv: anbindung() === z.id }} onClick={() => setAnbindung(z.id)}>{String(z.werte.name)}</button>}</For>
            </div></div>
        </Show>
        <p class="still-text klein-text">{extern()
          ? 'Diese KI läuft außerhalb des Büros. Namen, Anschriften, E-Mail-Adressen und Telefonnummern werden vor dem Senden durch Nummern ersetzt und in der Antwort wieder eingesetzt.'
          : 'Diese KI läuft im Büro. Der Text verlässt das Haus nicht.'}</p>
        <div class="ki-texte">
          <div class="feld"><label>Dein Text</label><textarea rows={9} readOnly value={p.auftrag.text} /></div>
          <div class="feld"><label for="ki-vorschlag">Vorschlag der KI{lage().art === 'vorschlag' ? ' – du kannst ihn noch ändern' : ''}</label>
            <textarea id="ki-vorschlag" rows={9} value={vorschlag()} readOnly={lage().art !== 'vorschlag'} placeholder={lage().art === 'laeuft' ? 'Die KI schreibt …' : ''} onInput={(e) => setVorschlag(e.currentTarget.value)} /></div>
        </div>
        {(() => { const l = lage();
          if (l.art === 'fehler') return <p class="feld-fehler" role="alert">{l.text}</p>;
          if (l.art === 'vorschlag' && l.extern) return <p class="still-text klein-text">{l.ersetzt ? `${l.ersetzt} Namen und Angaben wurden vor dem Senden ersetzt.` : 'Im Text stand nichts, was ersetzt werden musste.'}</p>;
          return null; })()}
      </Show>
    </Dialog>
  );
}

export function KiFenster() {
  return <Show when={auftrag()}>{(a) => <KiTextFenster auftrag={a()} />}</Show>;
}

/** Verwaltung → KI: unter der Karte einer Anbindung – Zugangsschlüssel, Modell aus der Liste des Anbieters wählen, ausprobieren. */
export function KiEinrichten(p: { anbindung: Zeile }) {
  const z = () => p.anbindung;
  const [schluessel, setSchluessel] = createSignal(false);
  const [lage, { refetch }] = createResource(() => z().id, (anbindung) => ruf<{ schluesselGesetzt: boolean }>('/api/ki/zustand', { anbindung }));
  const [modelle, setModelle] = createSignal<string[] | null>(null);
  const [ergebnis, setErgebnis] = createSignal<{ gut: boolean; text: string } | null>(null);
  const melde = async (tun: () => Promise<string>) => {
    setErgebnis({ gut: true, text: 'Einen Moment …' });
    try { setErgebnis({ gut: true, text: await tun() }); } catch (e) { setErgebnis({ gut: false, text: (e as Error).message }); }
  };
  const abrufen = () => melde(async () => { const r = await ruf<{ modelle: string[] }>('/api/ki/modelle', { anbindung: z().id }); setModelle(r.modelle); return r.modelle.length ? `${r.modelle.length} Modelle gefunden – wähle eins aus.` : 'Der Anbieter hat keine Modelle gemeldet.'; });
  const probe = () => melde(async () => `Antwort der KI: ${(await ruf<{ vorschlag: string }>('/api/ki/text', { anbindung: z().id, aufgabe: 'ausformulieren', text: 'Bodenplatte betoniert, Wetter trocken, keine Mängel' })).vorschlag}`);
  return (
    <fieldset>
      <legend>Einrichten und ausprobieren</legend>
      <Show when={z().werte.art !== 'ollama'}>
        <p class="still-text klein-text">Der Zugangsschlüssel des Anbieters wird verschlüsselt gespeichert und steht nie im Protokoll. {lage()?.schluesselGesetzt ? 'Es ist ein Schlüssel hinterlegt.' : 'Es ist noch kein Schlüssel hinterlegt.'} Texte gehen nur ohne Namen und Anschriften an diesen Anbieter.</p>
      </Show>
      <div class="reihe">
        <Show when={z().werte.art !== 'ollama'}><button class="knopf" onClick={() => setSchluessel(true)}>Zugangsschlüssel eintragen …</button></Show>
        <button class="knopf" onClick={abrufen}>Modelle abrufen</button>
        <button class="knopf haupt" disabled={!z().werte.modell || z().werte.aktiv !== true} title={z().werte.aktiv === true ? '' : 'Erst Modell wählen und einschalten'} onClick={probe}>Ausprobieren</button>
      </div>
      <Show when={modelle()?.length}>
        <div class="auswahl senkrecht ki-modelle" role="radiogroup" aria-label="Modell">
          <For each={modelle()}>{(m) => <button type="button" role="radio" aria-checked={z().werte.modell === m} classList={{ aktiv: z().werte.modell === m }}
            onClick={() => ausfuehren({ objekt: 'ki_anbindung', art: 'aendern', objektId: z().id, werte: { modell: m } }, `Modell von „${z().werte.name}“ ändern`)}>{m}</button>}</For>
        </div>
      </Show>
      <Show when={ergebnis()}>{(e) => <p classList={{ 'feld-fehler': !e().gut, 'gut-text': e().gut }} role="status">{e().text}</p>}</Show>
      <Show when={schluessel()}>
        <Dialog titel={`Zugangsschlüssel für „${z().werte.name}“`} onAbbrechen={() => setSchluessel(false)} knoepfe={<button class="knopf" onClick={() => setSchluessel(false)}>Abbrechen</button>}>
          <Formular knopf="Speichern" pfad="/api/ki/schluessel" fest={{ anbindung: z().id }} felder={[{ name: 'schluessel', titel: 'Zugangsschlüssel (API-Key) des Anbieters', typ: 'password', auto: 'new-password' }]}
            onFertig={() => { setSchluessel(false); hinweis('Zugangsschlüssel gespeichert.'); void refetch(); }} />
        </Dialog>
      </Show>
    </fieldset>
  );
}
