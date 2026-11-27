// Baustein „Bilder“: Fotos, die an einem Objekt hängen, in dessen Karte – ansehen, beschriften, hinzufügen, entfernen.
// Hochladen braucht die Verbindung zum Server: Der Browser verkleinert jedes Foto zu einem Vorschaubild und schickt
// es zusammen mit dem Original; das Original wandert in den Projektordner, im Bauportal bleibt das Vorschaubild.
import { ansehen, type Ansehbar } from './ansehen';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { listenfolge } from '../../kern/druck';
import type { Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, rueckgaengig, sicht } from '../unterbau/abgleich';
import { darf, modell, ruf } from '../unterbau/api';
import { feldAendern } from './detailkarte';
import { hinweis } from '../unterbau/meldungen';

/** Fotos hochladen – jedes einzeln mit Vorschaubild, Fortschritt über lage (Bilder, Fotos an Einträgen). */
export async function fotosHochladen(adresse: string, fest: Werte, dateien: File[], lage: (t: string) => void): Promise<void> {
  let n = 0;
  for (const d of dateien) {
    lage(`Foto ${++n} von ${dateien.length} wird abgelegt …`);
    try { await ruf(adresse, { ...fest, name: d.name, original: await base64(d), vorschau: await base64(await vorschaubild(d)) }); }
    catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
  }
  lage('');
}

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
  ohneTitel?: boolean;            // Überschrift steht schon außen (z. B. auf der Karte eines Abschnitts)
  titel: string;
  objekt: string;              // Modell der Fotos
  fest: Werte;                 // woran sie hängen (Projekt, Bericht) – geht beim Hochladen mit
  beschriftung: string;        // Feld für die Bildunterschrift
  hochladen: string;           // Adresse, die Original und Vorschaubild annimmt
  gewaehlt?: string | null; onWahl?: (id: string) => void;   // mit Auswahl: Klick zeigt das Foto groß (z. B. rechts), statt das Original zu öffnen
}) {
  const m = () => modell(p.objekt);
  const schreiben = () => darf(p.objekt, 'schreiben');
  const [lage, setLage] = createSignal('');
  const bilder = createMemo(() => Object.values(sicht[p.objekt] ?? {}).filter((z) => !z.geloescht && Object.entries(p.fest).every(([k, w]) => z.werte[k] === w)).sort(listenfolge));
  let wahl!: HTMLInputElement;
  const dazu = async () => { const d = [...(wahl.files ?? [])]; wahl.value = ''; await fotosHochladen(p.hochladen, p.fest, d, setLage); };
  const weg = (z: Zeile) => {
    ausfuehren({ objekt: p.objekt, art: 'loeschen', objektId: z.id }, `Foto „${z.werte.name}“ entfernen`);
    hinweis('Foto aus dem Bericht entfernt. Das Original bleibt im Projektordner liegen.', { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <fieldset class="bilder">
      <Show when={!p.ohneTitel}><legend>{p.titel}<Show when={bilder().length}><span class="anzahl">{bilder().length}</span></Show></legend></Show>
      <div class="bilder-raster">
        <For each={bilder()}>{(z) => (
          <figure>
            <a href={`/api/foto/original/${z.id}`} classList={{ an: p.gewaehlt === z.id }} title={p.onWahl ? `${z.werte.name} – groß zeigen` : `${z.werte.name} – Original öffnen (${z.werte.ort === 'ablage' ? 'liegt im Projektordner' : 'liegt im Bauportal'})`}
              onClick={(e) => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); if (p.onWahl) p.onWahl(z.id); else ansehen(alleAnsehbar(bilder(), p.beschriftung), bilder().indexOf(z)); }}><img src={`/api/foto/vorschau/${z.id}`} alt={String(z.werte[p.beschriftung] || z.werte.name)} loading="lazy" /></a>
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

const alleAnsehbar = (l: Zeile[], beschriftung: string): Ansehbar[] => l.map((x) => ({ url: `/api/foto/original/${x.id}`, name: String(x.werte[beschriftung] || x.werte.name || 'Foto'), typ: 'bild' }));
/** Ein Foto groß – wie rechts im bisherigen Bautagebuch: Bild (Klick öffnet das Original), ‹ 1 von n ›, Beschriftung, darunter alle als Streifen. */
export function FotoGross(p: { objekt: string; id: string; alle: Zeile[]; beschriftung: string; onWahl: (id: string) => void; onZu: () => void }) {
  const m = () => modell(p.objekt);
  const z = () => p.alle.find((x) => x.id === p.id);
  const i = () => p.alle.findIndex((x) => x.id === p.id);
  const schritt = (d: -1 | 1) => { const n = p.alle[i() + d]; if (n) p.onWahl(n.id); };
  return (
    <Show when={z()}>{(f) => (
      <aside class="karte foto-ansicht" aria-label={`Foto ${String(f().werte.name)}`} tabindex="-1"
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') schritt(-1); if (e.key === 'ArrowRight') schritt(1); if (e.key === 'Escape') p.onZu(); }}>
        <div class="karte-kopf">
          <button class="knopf klein still" aria-label="Voriges Foto" disabled={i() <= 0} onClick={() => schritt(-1)}>‹</button>
          <span>{i() + 1} von {p.alle.length}</span>
          <button class="knopf klein still" aria-label="Nächstes Foto" disabled={i() >= p.alle.length - 1} onClick={() => schritt(1)}>›</button>
          <span class="still-text klein-text foto-name">{String(f().werte.name)}</span>
          <button class="knopf still" aria-label="Foto schließen" title="Schließen (Esc)" onClick={p.onZu}>×</button>
        </div>
        <a class="foto-gross" href={`/api/foto/original/${f().id}`} title="Groß ansehen – mit ‹ › durch alle Fotos" onClick={(e) => { e.preventDefault(); ansehen(alleAnsehbar(p.alle, p.beschriftung), i()); }}><img src={`/api/foto/original/${f().id}`} alt={String(f().werte[p.beschriftung] || f().werte.name)} /></a>
        <label class="foto-beschriftung">Beschreibung
          <input value={String(f().werte[p.beschriftung] ?? '')} readOnly={!darf(p.objekt, 'schreiben')} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => feldAendern(m(), f(), m().felder.find((x) => x.name === p.beschriftung)!, e.currentTarget.value)} />
        </label>
        <div class="foto-streifen">
          <For each={p.alle}>{(x) => <button type="button" classList={{ an: x.id === p.id }} aria-label={String(x.werte[p.beschriftung] || x.werte.name)} onClick={() => p.onWahl(x.id)}><img src={`/api/foto/vorschau/${x.id}`} alt="" loading="lazy" /></button>}</For>
        </div>
      </aside>
    )}</Show>
  );
}
