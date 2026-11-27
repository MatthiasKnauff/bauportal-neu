// Baustein „PDF-Ansicht“: ein PDF als Seiten in der eigenen Oberfläche (pdf.js) – nie der PDF-Betrachter des Browsers mit seinen
// eigenen Menüs und Einstellungen. Die Seiten passen sich der Breite an; Drucken und Ablegen bleiben beim Druckwerk.
import { For, Show, createResource, createSignal, onCleanup, onMount } from 'solid-js';

export function PdfAnsicht(p: { inhalt: Blob; titel?: string }) {
  let kasten!: HTMLDivElement;
  const [breite, setBreite] = createSignal(0);
  onMount(() => { const ro = new ResizeObserver(() => setBreite(kasten.clientWidth)); ro.observe(kasten); onCleanup(() => ro.disconnect()); });
  // pdf.js 6: das Ladeobjekt räumt auf (Worker und Dokument) – je PDF eins, das vorige geht beim Wechsel und am Ende
  let laden: { destroy: () => Promise<void> } | undefined;
  const [dok] = createResource(() => p.inhalt, async (b) => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    void laden?.destroy();
    const t = pdfjs.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }); laden = t;
    return t.promise;
  });
  onCleanup(() => void laden?.destroy());
  const seiten = () => Array.from({ length: dok()?.numPages ?? 0 }, (_, i) => i + 1);
  return (
    <div class="pdf-ansicht" ref={kasten} role="document" aria-label={p.titel ?? 'PDF'}>
      <Show when={!dok.error} fallback={<p class="fehler-text">Das PDF lässt sich nicht anzeigen.</p>}>
        <For each={seiten()}>{(n) => <PdfSeite dok={dok()!} nr={n} breite={breite()} />}</For>
      </Show>
    </div>
  );
}

function PdfSeite(p: { dok: { getPage: (n: number) => Promise<import('pdfjs-dist').PDFPageProxy> }; nr: number; breite: number }) {
  let leinwand!: HTMLCanvasElement;
  let lauf: { cancel: () => void } | null = null;
  const zeichnen = async () => {
    if (!p.breite) return;
    const seite = await p.dok.getPage(p.nr), b0 = seite.getViewport({ scale: 1 }), dpr = window.devicePixelRatio || 1;
    const massstab = (p.breite - 16) / b0.width, vp = seite.getViewport({ scale: massstab * dpr });
    leinwand.width = Math.floor(vp.width); leinwand.height = Math.floor(vp.height);
    leinwand.style.width = `${Math.floor(vp.width / dpr)}px`; leinwand.style.height = `${Math.floor(vp.height / dpr)}px`;
    lauf?.cancel();
    const r = seite.render({ canvas: leinwand, canvasContext: leinwand.getContext('2d')!, viewport: vp });
    lauf = r; await r.promise.catch(() => { /* abgebrochen: neu gezeichnet */ });
  };
  const [_] = createResource(() => [p.breite, p.nr] as const, () => zeichnen());
  return <canvas ref={leinwand} class="pdf-seite" aria-label={`Seite ${p.nr}`} />;
}
