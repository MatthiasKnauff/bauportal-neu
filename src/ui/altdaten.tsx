// Verwaltung → Übernahme: die Daten des bisherigen Bautagebuchs ins neue Bauportal holen. Am einfachsten holt das
// Bauportal selbst: Es meldet sich am alten Bautagebuch an, holt den Export (Vorschau wie bei jeder Übernahme) und danach
// die Fotos. Ohne Verbindung geht es weiter mit dem Export als Datei und den Fotos als Dateien.
import { For, Show, createResource, createSignal, onCleanup } from 'solid-js';
import { Dialog } from './baukasten/dialog';
import { Formular } from './baukasten/formular';
import { ruf } from './unterbau/api';
import { vorschaubild, base64 } from './baukasten/bilder';
import { hinweis } from './unterbau/meldungen';
import { Rahmen } from './baukasten/rahmen';
import { vorschauZeigen, type Vorschau } from './uebernahme';

export function Altdaten() {
  type Fotos = { offen: string[]; erledigt: number; laeuft: { n: number; von: number; fehler: string[]; fertig: boolean } | null };
  const [fotos, { refetch }] = createResource(() => ruf<Fotos>('/api/altdaten/fotos'));
  const [quelle, quelleNeu] = createResource(() => ruf<{ adresse: string; name: string; kennwortGesetzt: boolean }>('/api/altdaten/quelle'));
  const [verbindung, setVerbindung] = createSignal(false);
  const verbunden = () => !!(quelle()?.adresse && quelle()?.name && quelle()?.kennwortGesetzt);
  // solange Fotos geholt werden, alle zwei Sekunden nachsehen
  const uhr = setInterval(() => { const l = fotos()?.laeuft; if (l && !l.fertig) void refetch(); }, 2000);
  onCleanup(() => clearInterval(uhr));
  const holen = () => void vorschauZeigen({ titel: 'Aus dem alten Bautagebuch übernehmen', wartetext: 'Anmeldung am alten Bautagebuch, der Export wird geholt und mit dem Bauportal verglichen …', fertig: 'Die Daten sind übernommen. Die Fotos werden jetzt nachgeholt.', danach: () => void refetch() },
    () => ruf<Vorschau>('/api/altdaten/abholen', {}));
  const darstellung = () => void vorschauZeigen({ titel: 'Benutzer übernehmen', wartetext: 'Die Benutzer werden aus dem bisherigen Bauportal geholt und zugeordnet …', fertig: 'Die Benutzer sind übernommen – alle melden sich mit ihrem bisherigen Kennwort an.' },
    () => ruf<Vorschau>('/api/altdaten/darstellung', {}));
  type AltPlan = { id: string; name: string; leistungen: number; geaendert: string; uebernommen: boolean };
  const [plaene, setPlaene] = createSignal<AltPlan[] | null>(null);
  const [planLage, setPlanLage] = createSignal('');
  const plaeneHolen = async () => {
    setPlanLage('Wird abgerufen …');
    try { setPlaene((await ruf<{ plaene: AltPlan[] }>('/api/altdaten/plaene', {})).plaene); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } finally { setPlanLage(''); }
  };
  const einen = (pl: AltPlan) => void vorschauZeigen({ titel: `Bauzeitenplan übernehmen – ${pl.name}`, wartetext: 'Der Plan wird geholt und mit dem Bauportal verglichen …', fertig: `„${pl.name}“ ist übernommen.`, danach: () => void plaeneHolen() },
    () => ruf<Vorschau>('/api/altdaten/plan', { id: pl.id }));
  // Alle nacheinander, ohne Rückfrage je Plan – die Vorschau wäre bei vielen Plänen nur Klickerei
  const alle = async () => {
    const l = plaene() ?? [];
    let n = 0, fehler = 0;
    for (const pl of l) {
      setPlanLage(`Plan ${++n} von ${l.length} …`);
      try { const v = await ruf<Vorschau>('/api/altdaten/plan', { id: pl.id }); if (v.befehle) await ruf('/api/uebernehmen', { token: v.token }); }
      catch (e) { fehler++; if (fehler <= 3) hinweis(`${pl.name}: ${(e as Error).message}`, { art: 'fehler' }); }
    }
    setPlanLage('');
    hinweis(`${l.length - fehler} von ${l.length} Bauzeitenplänen übernommen.`);
    void plaeneHolen();
  };
  const fotosHolen = async () => { try { await ruf('/api/altdaten/fotos-holen', {}); void refetch(); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } };
  const [lage, setLage] = createSignal('');
  let exportWahl!: HTMLInputElement, fotoWahl!: HTMLInputElement;
  const exportGewaehlt = () => {
    const datei = exportWahl.files?.[0];
    exportWahl.value = '';
    if (datei) void vorschauZeigen({ titel: `Bautagebuch übernehmen – ${datei.name}`, wartetext: 'Der Export wird gelesen und mit dem Bauportal verglichen …', fertig: 'Die Daten des Bautagebuchs sind übernommen.', danach: () => void refetch() },
      () => ruf<Vorschau>('/api/altdaten/vorschau', datei));
  };
  const fotosGewaehlt = async () => {
    const offen = new Set(fotos()?.offen ?? []);
    const dateien = [...(fotoWahl.files ?? [])].filter((d) => offen.has(d.name));
    const gewaehlt = fotoWahl.files?.length ?? 0;
    fotoWahl.value = '';
    if (!dateien.length) { hinweis(gewaehlt ? 'Keine der gewählten Dateien gehört zu einem übernommenen Bericht.' : 'Keine Datei gewählt.', { art: 'fehler' }); return; }
    let n = 0, fehler = 0;
    for (const d of dateien) {
      setLage(`Foto ${++n} von ${dateien.length} wird abgelegt …`);
      try { await ruf('/api/altdaten/foto', { datei: d.name, original: await base64(d), vorschau: await base64(await vorschaubild(d)) }); }
      catch (e) { fehler++; if (fehler <= 3) hinweis(`${d.name}: ${(e as Error).message}`, { art: 'fehler' }); }
    }
    setLage('');
    hinweis(`${dateien.length - fehler} Fotos abgelegt${fehler ? `, ${fehler} mit Fehler` : ''}.`);
    void refetch();
  };
  return (
    <Rahmen schluessel="verwaltung.uebernahme" inhalt={<section class="blatt frei">
      <h2>Aus dem bisherigen Bautagebuch übernehmen</h2>
      <p class="still-text">Projekte, Kontakte, Berichte mit ihren Einträgen und Fotos. Das alte Bautagebuch bleibt dabei unverändert und läuft weiter. Die Übernahme lässt sich wiederholen: Sie ergänzt, was neu dazugekommen ist, und legt nichts doppelt an.</p>
      <div class="update-kasten">
        <h3>1. Daten</h3>
        <p class="still-text">{verbunden() ? <>Verbindung: <strong>{quelle()!.adresse}</strong>, angemeldet als {quelle()!.name}. </> : 'Trag die Adresse des alten Bautagebuchs und ein Administrator-Konto ein. Das Bauportal meldet sich dort an und holt alles selbst, nur lesend. '}Vor dem Übernehmen siehst du, was angelegt würde.</p>
        <div class="reihe">
          <Show when={verbunden()}><button class="knopf haupt" onClick={holen}>Jetzt holen</button></Show>
          <button class="knopf" classList={{ haupt: !verbunden() }} onClick={() => setVerbindung(true)}>{verbunden() ? 'Verbindung ändern …' : 'Verbindung eintragen …'}</button>
          <input ref={exportWahl} type="file" accept=".json,application/json" hidden onChange={exportGewaehlt} />
          <button class="knopf still" onClick={() => exportWahl.click()}>oder Export als Datei …</button>
        </div>
        <Show when={verbindung()}>
          <Dialog titel="Verbindung zum alten Bautagebuch" onAbbrechen={() => setVerbindung(false)} knoepfe={<button class="knopf" onClick={() => setVerbindung(false)}>Abbrechen</button>}>
            <Formular knopf="Speichern" pfad="/api/altdaten/quelle" vorgaben={{ adresse: quelle()?.adresse ?? '', name: quelle()?.name ?? '' }}
              text={`Das Kennwort wird verschlüsselt gespeichert. ${quelle()?.kennwortGesetzt ? 'Es ist schon eines hinterlegt – leer lassen, um es zu behalten.' : ''}`}
              felder={[{ name: 'adresse', titel: 'Adresse des alten Bautagebuchs (z. B. https://bauportal.firma.de/bautagebuch)' }, { name: 'name', titel: 'Anmeldename (Administrator:in)', auto: 'username' }, { name: 'kennwort', titel: 'Kennwort', typ: 'password', auto: 'current-password' }]}
              onFertig={() => { setVerbindung(false); hinweis('Verbindung gespeichert.'); void quelleNeu.refetch(); }} />
          </Dialog>
        </Show>
      </div>
      <div class="update-kasten">
        <h3>2. Fotos</h3>
        <Show when={fotos()} fallback={<p class="still-text">{fotos.error ? (fotos.error as Error).message : 'Wird abgefragt …'}</p>}>{(f) => (
          <Show when={f().offen.length + f().erledigt} fallback={<p class="still-text">Erst die Daten übernehmen – danach steht hier, welche Fotos fehlen.</p>}>
            <p class="still-text">{f().erledigt} Fotos sind übernommen, {f().offen.length} fehlen noch.</p>
            <Show when={f().laeuft}>{(l) => (
              <p class="still-text" role="status">{l().fertig ? `Fotos geholt: ${l().von - l().fehler.length} von ${l().von}.` : `Fotos werden geholt: ${l().n} von ${l().von || '…'}`}{l().fehler.length ? ` ${l().fehler.length} ohne Erfolg, z. B. ${l().fehler[0]}` : ''}</p>
            )}</Show>
            <Show when={f().offen.length && !(f().laeuft && !f().laeuft!.fertig)}>
              <input ref={fotoWahl} type="file" accept="image/*" multiple hidden onChange={() => void fotosGewaehlt()} />
              <div class="reihe">
                <Show when={verbunden()}><button class="knopf haupt" onClick={() => void fotosHolen()}>Fotos vom alten Bautagebuch holen</button></Show>
                <button class="knopf" classList={{ still: verbunden(), haupt: !verbunden() }} disabled={!!lage()} onClick={() => fotoWahl.click()}>{lage() || (verbunden() ? 'oder Fotos als Dateien …' : 'Fotos wählen …')}</button>
              </div>
              <Show when={!verbunden()}><p class="still-text klein-text">Die Fotos liegen im alten Bautagebuch im Ordner <code>data/uploads</code>. Das Bauportal nimmt nur, was zu einem übernommenen Bericht gehört, und ordnet es über den Dateinamen zu.</p></Show>
            </Show>
          </Show>
        )}</Show>
      </div>
      <div class="update-kasten">
        <h3>3. Bauzeitenpläne</h3>
        <Show when={verbunden()} fallback={<p class="still-text">Mit der Verbindung aus Schritt 1 holt das Bauportal auch die Pläne der alten Gantt-App. Einzelne Pläne lassen sich außerdem im Balkenplan unter „Export / Import“ aus einer Datei einlesen.</p>}>
          <p class="still-text">Jeder Plan kommt als eigene Version in sein Projekt – in das aus dem Bautagebuch übernommene, wenn er damit verknüpft war. Wiederholbar: Von Hand Geändertes bleibt.</p>
          <div class="reihe">
            <button class="knopf" disabled={!!planLage()} onClick={() => void plaeneHolen()}>{plaene() ? 'Liste neu abrufen' : 'Pläne abrufen'}</button>
            <Show when={plaene()?.length}><button class="knopf haupt" disabled={!!planLage()} onClick={() => void alle()}>{planLage() || 'Alle übernehmen'}</button></Show>
          </div>
          <Show when={plaene()}>{(l) => (
            <ul class="planliste">
              <For each={l()} fallback={<li class="still-text">Im alten Bauportal gibt es keine Bauzeitenpläne.</li>}>{(pl) => (
                <li>
                  <span><strong>{pl.name}</strong> <span class="still-text">· {pl.leistungen} Leistungen{pl.uebernommen ? ' · schon übernommen' : ''}</span></span>
                  <button class="knopf klein" disabled={!!planLage()} onClick={() => einen(pl)}>{pl.uebernommen ? 'Erneut übernehmen' : 'Übernehmen'}</button>
                </li>
              )}</For>
            </ul>
          )}</Show>
        </Show>
      </div>
      <div class="update-kasten">
        <h3>4. Benutzer</h3>
        <Show when={verbunden()} fallback={<p class="still-text">Mit der Verbindung aus Schritt 1 übernimmt das Bauportal die Benutzer: Name, Rolle, Kennwort und Darstellung.</p>}>
          <p class="still-text">Wer hier noch fehlt, wird angelegt (Rolle wie bisher; gesperrt, wenn dort nicht mehr aktiv). Alle melden sich mit ihrem bisherigen Kennwort an – übernommen wird nur sein Prüfwert, nie das Kennwort selbst; wer hier schon ein Kennwort hat, behält es. Dazu je Person Farbschema, Akzent, Schrift, Größe und Stil – jede:r kann das danach unter „Darstellung“ ändern.</p>
          <div class="reihe"><button class="knopf haupt" onClick={darstellung}>Benutzer übernehmen</button></div>
        </Show>
      </div>
    </section>} />
  );
}
