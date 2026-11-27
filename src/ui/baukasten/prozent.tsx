// Prozent in Stufen (0 · 25 · 50 · 75 · 100) zum Antippen, wahlweise mit Schieber darunter – wie im bisherigen Bauportal
// (bpProzent): ein Baustein für den Fortschritt im Bautagebuch und in der Menüleiste des Bauzeitenplans.
import { For, Show, createEffect, createSignal } from 'solid-js';

export const STUFEN = [0, 25, 50, 75, 100];
/** Farbe nach dem Wert: 0 sehr rot · 25 rot · 50 gelb · 75 hellgrün · 100 grün (wie bisher). */
export const prozentFarbe = (w: number) => (w >= 100 ? '#2e7d32' : w >= 75 ? '#7cb342' : w >= 50 ? '#e0a800' : w >= 25 ? '#e5533d' : '#b71c1c');

/**
 * wert: der Prozentwert (null: nichts gewählt); onWert: neuer Wert (Stufe oder Schieber beim Loslassen).
 * schieber: Schieber in 5er-Schritten darunter; markiert: Stufe gestrichelt hervorheben (z. B. „etwa laut Plan“) mit hinweis als Tooltip;
 * klein: niedrig, für die Menüleiste.
 */
export function Prozent(p: { wert: number | null; onWert: (w: number) => void; titel: string; gesperrt?: boolean; schieber?: boolean; markiert?: number; hinweis?: string; klein?: boolean }) {
  const [zieht, setZieht] = createSignal<number | null>(null);
  createEffect(() => { p.wert; setZieht(null); });
  const w = () => zieht() ?? p.wert;
  return (
    <div class="prozent" classList={{ klein: p.klein }} style={{ '--pz': prozentFarbe(w() ?? 0) }}>
      <div class="prozent-stufen" role="radiogroup" aria-label={p.titel}>
        <For each={STUFEN}>{(s) => (
          <button type="button" role="radio" aria-checked={w() === s} classList={{ aktiv: w() === s, markiert: p.markiert === s }} disabled={p.gesperrt}
            title={p.markiert === s && p.hinweis ? `${s} % – ${p.hinweis}` : `${s} % fertig`} onClick={() => p.onWert(s)}>{s}</button>
        )}</For>
      </div>
      <Show when={p.schieber}>
        <div class="prozent-schieber">
          <input type="range" min="0" max="100" step="5" value={w() ?? 0} disabled={p.gesperrt} aria-label={`${p.titel} in Prozent`}
            onInput={(e) => setZieht(Number(e.currentTarget.value))} onChange={(e) => p.onWert(Number(e.currentTarget.value))} />
          <output>{w() ?? 0} %</output>
        </div>
      </Show>
    </div>
  );
}
