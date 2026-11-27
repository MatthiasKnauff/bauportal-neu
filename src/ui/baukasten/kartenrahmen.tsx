// Baustein „Kartenrahmen“: der Rahmen jeder Karte rechts – Kopf (Titel, eigene Knöpfe, die eine Heftzwecke), Reiter, Inhalt.
// Die Detailkarte nutzt ihn ebenso wie Datei-, Foto-, Aufmaß- und Aufbau-Karte und das Bautagebuch rechts – so sehen Kopf,
// Heftzwecke und Schließen überall gleich aus. Geschlossen wird angeheftet über die Heftzwecke (bzw. Esc), am Handy über „‹ Liste“;
// ein Kreuz nur, wo die Karte frei schwebt (ohne Heftzwecke).
import { For, Show, type JSX } from 'solid-js';

export interface KartenReiter { titel: string; inhalt: () => JSX.Element }

export function Kartenrahmen(p: {
  label: string;                      // Name für Vorlesen
  titel?: JSX.Element;                // Überschrift im Kopf (ohne: kein Kopf – die Heftzwecke steht dann in der Reiterzeile)
  knoepfe?: JSX.Element;              // eigene Knöpfe im Kopf, vor der Heftzwecke (z. B. ‹ › beim Blättern, „In eigenem Fenster“)
  heftzwecke?: JSX.Element;           // die Heftzwecke der rechten Seite (vom Rahmen)
  onZu?: () => void;                  // „‹ Liste“ am Handy; ohne Heftzwecke auch ein Kreuz
  unterKopf?: JSX.Element;            // Zeile unter dem Kopf (z. B. „3 von 42“ beim Blättern)
  schliessenZeichen?: string;         // anderes Zeichen für das Kreuz
  reiter?: KartenReiter[];            // Reiter oben; der gewählte zeigt seinen Inhalt statt children
  reiterWahl?: number; onReiterWahl?: (i: number) => void;
  ohneKopf?: boolean;                 // das Fenster drumherum trägt den Titel (Karte im Fenster, schwebende Karte)
  ohneRahmen?: boolean;               // steht schon in einer Fläche – ohne eigenen Rand und Schatten
  ohneInhaltRand?: boolean;           // Inhalt bis an den Rand (z. B. großes Foto, PDF)
  klasse?: string;
  ref?: (el: HTMLElement) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  children?: JSX.Element;
}): JSX.Element {
  const reiter = () => p.reiter ?? [];
  const wahl = () => Math.min(p.reiterWahl ?? 0, Math.max(0, reiter().length - 1));
  const kopf = () => !p.ohneKopf && p.titel !== undefined;
  return (
    <aside class={`karte ${p.klasse ?? ''}`} classList={{ 'ohne-rahmen': !!p.ohneRahmen }} aria-label={p.label} ref={p.ref} tabindex={p.onKeyDown ? -1 : undefined} onKeyDown={p.onKeyDown}>
      <Show when={kopf()}>
        <div class="karte-kopf">
          <Show when={p.onZu}><button class="knopf still nur-schmal" onClick={p.onZu}>‹ Liste</button></Show>
          <h2>{p.titel}</h2>
          {p.knoepfe}
          <Show when={p.heftzwecke}><span class="nur-breit-flex">{p.heftzwecke}</span></Show>
          <Show when={p.onZu && !p.heftzwecke}><button class="knopf still nur-breit" aria-label="Karte schließen" title="Schließen (Esc)" onClick={p.onZu}>{p.schliessenZeichen ?? '×'}</button></Show>
        </div>
      </Show>
      {p.unterKopf}
      <Show when={reiter().length}>
        <div class="karte-reiter" role="tablist" aria-label={`${p.label} – Reiter`}>
          <For each={reiter()}>{(r, i) => <button type="button" role="tab" aria-selected={wahl() === i()} onClick={() => p.onReiterWahl?.(i())}>{r.titel}</button>}</For>
          <Show when={!kopf() && p.heftzwecke}><span class="karte-reiter-zwecke">{p.heftzwecke}</span></Show>
        </div>
      </Show>
      <div class="karte-inhalt" classList={{ 'ohne-rand': !!p.ohneInhaltRand }}>
        <Show when={reiter().length} fallback={p.children}>{reiter()[wahl()]!.inhalt()}</Show>
      </div>
    </aside>
  );
}
