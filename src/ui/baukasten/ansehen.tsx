// Baustein „Ansehen“: Fotos und PDFs im Fenster des Bauportals ansehen und blättern – nie ein neuer Tab oder der Betrachter des
// Browsers (wie im bisherigen Bauportal: am Handy käme man sonst nicht zurück). ‹ › , Pfeiltasten und Wischen gehen durch die Reihe,
// Esc oder × schließt, „Herunterladen“ holt das Original. Aufruf: ansehen([{ url, name, typ }], start).
import { Show, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { PdfAnsicht } from './pdfansicht';
import { Zeichen } from './zeichen';

export interface Ansehbar { url: string; name: string; typ: 'bild' | 'pdf' }
const [reihe, setReihe] = createSignal<{ l: Ansehbar[]; i: number } | null>(null);
export const ansehen = (l: Ansehbar[], start = 0) => { if (l.length) setReihe({ l, i: Math.max(0, Math.min(l.length - 1, start)) }); };
/** Art nach dem Dateinamen: Bild, PDF – sonst nichts zum Ansehen (dann lädt der Aufrufer die Datei herunter). */
export const ansehArt = (name: string): Ansehbar['typ'] | null => (/\.(jpe?g|png|webp|gif)$/i.test(name) ? 'bild' : /\.pdf$/i.test(name) ? 'pdf' : null);

/** Eine Datei öffnen wie überall im Bauportal: Fotos und PDFs ansehen (mit den übrigen der Liste zum Blättern), alles andere herunterladen. */
export function dateiZeigen(liste: { name: string; url: string; laden: string }[], name: string): void {
  const d = liste.find((x) => x.name === name); if (!d) return;
  if (!ansehArt(name)) { const a = document.createElement('a'); a.href = d.laden; a.download = name; a.click(); return; }
  const l = liste.filter((x) => ansehArt(x.name));
  ansehen(l.map((x) => ({ url: x.url, name: x.name, typ: ansehArt(x.name)! })), l.indexOf(d));
}

export function Ansehen() {
  const jetzt = () => { const r = reihe(); return r ? r.l[r.i] : undefined; };
  const schritt = (d: -1 | 1) => { const r = reihe(); if (r && r.l[r.i + d]) setReihe({ ...r, i: r.i + d }); };
  const zu = () => setReihe(null);
  const taste = (e: KeyboardEvent) => {
    if (!reihe()) return;
    if (e.key === 'Escape') { e.preventDefault(); zu(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); schritt(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); schritt(1); }
  };
  onMount(() => { addEventListener('keydown', taste, true); onCleanup(() => removeEventListener('keydown', taste, true)); });
  let wischX = 0;
  const [pdf] = createResource(() => (jetzt()?.typ === 'pdf' ? jetzt()!.url : false), async (url) => (await fetch(url)).blob());
  const laden = () => { const j = jetzt(); if (!j) return; const a = document.createElement('a'); a.href = j.url + (j.url.includes('?') ? '&' : '?') + 'laden=1'; a.download = j.name; a.click(); };
  return (
    <Show when={reihe() && jetzt()}>{(_) => (
      <div class="ansehen" role="dialog" aria-modal="true" aria-label={`Ansehen: ${jetzt()!.name}`}
        onPointerDown={(e) => { wischX = e.clientX; }} onPointerUp={(e) => { const d = e.clientX - wischX; if (e.pointerType !== 'mouse' && Math.abs(d) > 60) schritt(d < 0 ? 1 : -1); }}>
        <div class="ansehen-kopf">
          <button class="knopf still auf-dunkel ohne-rand" aria-label="Voriges" disabled={reihe()!.i <= 0} onClick={() => schritt(-1)}><Zeichen name="links" groesse={20} /></button>
          <span class="ansehen-zahl">{reihe()!.i + 1} von {reihe()!.l.length}</span>
          <button class="knopf still auf-dunkel ohne-rand" aria-label="Nächstes" disabled={reihe()!.i >= reihe()!.l.length - 1} onClick={() => schritt(1)}><Zeichen name="rechts" groesse={20} /></button>
          <span class="ansehen-name">{jetzt()!.name}</span>
          <button class="knopf still auf-dunkel ohne-rand" aria-label="Herunterladen" title="Original herunterladen" onClick={laden}><Zeichen name="export" groesse={18} /></button>
          <button class="knopf still auf-dunkel ohne-rand" aria-label="Schließen" title="Schließen (Esc)" onClick={zu}><Zeichen name="schliessen" groesse={20} /></button>
        </div>
        <div class="ansehen-inhalt">
          <Show when={jetzt()!.typ === 'bild'} fallback={<Show when={pdf()} fallback={<p class="still-text">PDF wird geladen …</p>}>{(b) => <PdfAnsicht inhalt={b()} titel={jetzt()!.name} />}</Show>}>
            <img src={jetzt()!.url} alt={jetzt()!.name} />
          </Show>
        </div>
      </div>
    )}</Show>
  );
}
