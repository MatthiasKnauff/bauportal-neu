// Baustein „Bilder“: Fotos, die an einem Objekt hängen, in dessen Karte – ansehen, beschriften, hinzufügen, entfernen.
// Hochladen braucht die Verbindung zum Server: Der Browser verkleinert jedes Foto zu einem Vorschaubild und schickt
// es zusammen mit dem Original; das Original wandert in den Projektordner, im Bauportal bleibt das Vorschaubild.
import { For, Show, createMemo, createSignal } from 'solid-js';
import { listenfolge } from '../../kern/druck';
import type { Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig, sicht } from '../abgleich';
import { darf, modell, ruf } from '../api';
import { feldAendern } from './detailkarte';
import { hinweis } from './hinweise';

const KANTE = 800;   // längste Kante des Vorschaubilds in Pixeln – reicht für Karte und Ausdruck (zwei Bilder je Zeile)

export const base64 = (b: Blob) => new Promise<string>((ok, nein) => { const l = new FileReader(); l.onload = () => ok(String(l.result).split(',')[1] ?? ''); l.onerror = () => nein(l.error); l.readAsDataURL(b); });
export async function vorschaubild(datei: File): Promise<Blob> {
  let bild: ImageBitmap;
  try { bild = await createImageBitmap(datei, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`„${datei.name}“ kann dieser Browser nicht lesen (bei HEIC-Fotos vom iPhone: in den Kamera-Einstellungen „Maximale Kompatibilität“ wählen)`); }
  const f = Math.min(1, KANTE / Math.max(bild.width, bild.height));
  const flaeche = document.createElement('canvas');
  flaeche.width = Math.round(bild.width * f); flaeche.height = Math.round(bild.height * f);
  flaeche.getContext('2d')!.drawImage(bild, 0, 0, flaeche.width, flaeche.height);
  bild.close();
  return new Promise((ok, nein) => flaeche.toBlob((b) => (b ? ok(b) : nein(new Error('Vorschaubild ließ sich nicht erzeugen'))), 'image/jpeg', 0.8));
}

export function Bilder(p: {
  titel: string;
  objekt: string;              // Modell der Fotos
  fest: Werte;                 // woran sie hängen (Projekt, Bericht) – geht beim Hochladen mit
  beschriftung: string;        // Feld für die Bildunterschrift
  hochladen: string;           // Adresse, die Original und Vorschaubild annimmt
}) {
  const m = () => modell(p.objekt);
  const schreiben = () => darf(p.objekt, 'schreiben');
  const [lage, setLage] = createSignal('');
  const bilder = createMemo(() => Object.values(sicht[p.objekt] ?? {}).filter((z) => !z.geloescht && Object.entries(p.fest).every(([k, w]) => z.werte[k] === w)).sort(listenfolge));
  let wahl!: HTMLInputElement;
  const dazu = async () => {
    const dateien = [...(wahl.files ?? [])];
    wahl.value = '';
    let n = 0;
    for (const d of dateien) {
      setLage(`Foto ${++n} von ${dateien.length} wird abgelegt …`);
      try { await ruf(p.hochladen, { ...p.fest, name: d.name, original: await base64(d), vorschau: await base64(await vorschaubild(d)) }); }
      catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    }
    setLage('');
  };
  const weg = (z: Zeile) => {
    ausfuehren({ objekt: p.objekt, art: 'loeschen', objektId: z.id }, `Foto „${z.werte.name}“ entfernen`);
    hinweis('Foto aus dem Bericht entfernt. Das Original bleibt im Projektordner liegen.', { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <fieldset class="bilder">
      <legend>{p.titel}<Show when={bilder().length}><span class="anzahl">{bilder().length}</span></Show></legend>
      <div class="bilder-raster">
        <For each={bilder()}>{(z) => (
          <figure>
            <a href={`/api/foto/original/${z.id}`} target="_blank" rel="noopener" title={`${z.werte.name} – Original öffnen (${z.werte.ort === 'ablage' ? 'liegt im Projektordner' : 'liegt im Bauportal'})`}><img src={`/api/foto/vorschau/${z.id}`} alt={String(z.werte[p.beschriftung] || z.werte.name)} loading="lazy" /></a>
            <figcaption>
              <input aria-label={`Beschriftung: ${z.werte.name}`} placeholder="Beschriftung" value={String(z.werte[p.beschriftung] ?? '')} readOnly={!schreiben()}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onChange={(e) => feldAendern(m(), z, m().felder.find((f) => f.name === p.beschriftung)!, e.currentTarget.value)} />
              <Show when={darf(p.objekt, 'loeschen')}><button class="knopf klein still" aria-label={`Foto entfernen: ${z.werte.name}`} title="Aus dem Bericht entfernen" onClick={() => weg(z)}>×</button></Show>
            </figcaption>
          </figure>
        )}</For>
      </div>
      <Show when={schreiben()}>
        <input ref={wahl} type="file" accept="image/*" multiple hidden onChange={dazu} />
        <button class="knopf" disabled={!!lage()} onClick={() => wahl.click()}>{lage() || '+ Fotos hinzufügen'}</button>
      </Show>
    </fieldset>
  );
}
