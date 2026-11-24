// Verwaltung → Übernahme: die Daten des bisherigen Bautagebuchs ins neue Bauportal holen. Schritt 1 nimmt dessen
// Export (JSON) und zeigt die Vorschau der gemeinsamen Übernahme; Schritt 2 reicht die Fotos als Dateien nach.
import { Show, createResource, createSignal } from 'solid-js';
import { ruf } from './api';
import { vorschaubild, base64 } from './baukasten/bilder';
import { hinweis } from './baukasten/hinweise';
import { Rahmen } from './baukasten/rahmen';
import { vorschauZeigen, type Vorschau } from './uebernahme';

export function Altdaten() {
  const [fotos, { refetch }] = createResource(() => ruf<{ offen: string[]; erledigt: number }>('/api/altdaten/fotos'));
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
    <Rahmen schluessel="verwaltung.uebernahme" inhalt={<section class="blatt schmal">
      <h2>Aus dem bisherigen Bautagebuch übernehmen</h2>
      <p class="still-text">Projekte, Kontakte, Berichte mit ihren Einträgen und Fotos. Das alte Bautagebuch bleibt dabei unverändert und läuft weiter. Die Übernahme lässt sich wiederholen: Sie ergänzt, was neu dazugekommen ist, und legt nichts doppelt an.</p>
      <div class="update-kasten">
        <h3>1. Daten</h3>
        <p class="still-text">Im alten Bautagebuch als Administrator:in den Export herunterladen (Adresse des alten Bautagebuchs mit <code>/api/export</code> am Ende) und die Datei „bautagebuch-….json“ hier wählen. Vor dem Übernehmen siehst du, was angelegt würde.</p>
        <input ref={exportWahl} type="file" accept=".json,application/json" hidden onChange={exportGewaehlt} />
        <div class="reihe"><button class="knopf haupt" onClick={() => exportWahl.click()}>Export wählen …</button></div>
      </div>
      <div class="update-kasten">
        <h3>2. Fotos</h3>
        <Show when={fotos()} fallback={<p class="still-text">{fotos.error ? (fotos.error as Error).message : 'Wird abgefragt …'}</p>}>{(f) => (
          <Show when={f().offen.length + f().erledigt} fallback={<p class="still-text">Erst die Daten übernehmen – danach steht hier, welche Fotos fehlen.</p>}>
            <p class="still-text">{f().erledigt} Fotos sind übernommen, {f().offen.length} fehlen noch. Die Fotos liegen im alten Bautagebuch im Ordner <code>data/uploads</code>. Wähle den Ordner (oder einzelne Dateien) – das Bauportal nimmt nur, was zu einem übernommenen Bericht gehört, und ordnet es über den Dateinamen zu.</p>
            <Show when={f().offen.length}>
              <input ref={fotoWahl} type="file" accept="image/*" multiple hidden onChange={() => void fotosGewaehlt()} />
              <div class="reihe"><button class="knopf haupt" disabled={!!lage()} onClick={() => fotoWahl.click()}>{lage() || 'Fotos wählen …'}</button></div>
            </Show>
          </Show>
        )}</Show>
      </div>
    </section>} />
  );
}
