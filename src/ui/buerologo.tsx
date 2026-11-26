// Büro-Logo in Verwaltung → Büro & Standort: zeigen, hochladen (im Browser verkleinert, als PNG), entfernen.
// Es steht danach im Briefkopf jedes Ausdrucks.
import { Show, createSignal } from 'solid-js';
import { logoAdresse } from './druck';
import { darf, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const RAND = { breite: 900, hoehe: 360 };   // größer braucht der Briefkopf nicht

async function verkleinern(datei: File): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const f = Math.min(1, RAND.breite / bild.width, RAND.hoehe / bild.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bild.width * f)); c.height = Math.max(1, Math.round(bild.height * f));
  c.getContext('2d')!.drawImage(bild, 0, 0, c.width, c.height);
  return new Promise((ok, nein) => c.toBlob((b) => (b ? ok(b) : nein(new Error('Das Bild lässt sich nicht lesen'))), 'image/png'));
}

export function BueroLogo() {
  const [laeuft, setLaeuft] = createSignal(false);
  let eingabe!: HTMLInputElement;
  const schreiben = () => darf('buero', 'schreiben');
  const hoch = async (datei: File | undefined) => {
    if (!datei) return;
    setLaeuft(true);
    try {
      const png = await verkleinern(datei);
      const r = await fetch('/api/buero/logo', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/png' }, body: png });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `Fehler ${r.status}`);
      hinweis('Logo übernommen – es steht jetzt im Briefkopf der Ausdrucke.');
    } catch (e) { hinweis(`Logo nicht übernommen: ${(e as Error).message}`, { art: 'fehler' }); }
    finally { setLaeuft(false); eingabe.value = ''; }
  };
  const weg = async () => { try { await ruf('/api/buero/logo/weg', {}); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } };
  return (
    <fieldset class="buero-logo"><legend>Logo</legend>
      <div class="buero-logo-feld">
        <Show when={logoAdresse()} fallback={<span class="still-text">Noch kein Logo – es steht dann im Briefkopf jedes Ausdrucks.</span>}>
          {(a) => <img src={a()} alt="Logo des Büros" />}
        </Show>
      </div>
      <Show when={schreiben()}>
        <div class="reihe">
          <input ref={eingabe} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void hoch(e.currentTarget.files?.[0])} />
          <button type="button" class="knopf" disabled={laeuft()} onClick={() => eingabe.click()}>{laeuft() ? 'Wird übernommen …' : logoAdresse() ? 'Anderes Logo …' : 'Logo hochladen …'}</button>
          <Show when={logoAdresse()}><button type="button" class="knopf" onClick={() => void weg()}>Entfernen</button></Show>
        </div>
      </Show>
    </fieldset>
  );
}
