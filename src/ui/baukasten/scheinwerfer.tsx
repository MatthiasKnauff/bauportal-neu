// Baustein „Scheinwerfer“ (wie bisher der Rundgang zu „Was ist neu“): dunkelt die Seite ab, lässt eine Stelle hell und erklärt sie
// in einer Karte daneben – Schritt für Schritt (Zurück · Weiter · Fertig). Die Stelle ist eine CSS-Auswahl; erscheint sie erst nach dem
// Wechsel in die App, wartet der Scheinwerfer bis zu drei Sekunden auf sie, sonst steht die Karte in der Mitte.
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';

export interface Schritt { titel: string; text: string; ziel?: string; ueber?: string }

export function Scheinwerfer(p: { schritte: Schritt[]; onZu: () => void }) {
  const [nr, setNr] = createSignal(0);
  const [rahmen, setRahmen] = createSignal<DOMRect | null>(null);
  const s = () => p.schritte[nr()]!;
  let suche = 0, el: Element | null = null;
  const messen = () => setRahmen(el && el.isConnected ? el.getBoundingClientRect() : null);
  createEffect(() => {
    const ziel = s().ziel; el = null; setRahmen(null); cancelAnimationFrame(suche);
    if (!ziel) return;
    const bis = performance.now() + 3000;
    const finden = () => { el = document.querySelector(ziel); if (el) { el.scrollIntoView({ block: 'nearest' }); messen(); } else if (performance.now() < bis) suche = requestAnimationFrame(finden); };
    finden();
  });
  addEventListener('resize', messen); addEventListener('scroll', messen, true);
  onCleanup(() => { cancelAnimationFrame(suche); removeEventListener('resize', messen); removeEventListener('scroll', messen, true); });
  // Karte neben der Stelle: darunter, sonst darüber; ohne Stelle in der Mitte
  const karte = () => { const r = rahmen(); if (!r) return undefined;
    const unten = r.bottom + 14 + 220 < innerHeight;
    return { left: `${Math.max(12, Math.min(innerWidth - 492, r.left))}px`, top: unten ? `${r.bottom + 14}px` : `${Math.max(12, r.top - 234)}px` }; };
  const letzter = () => nr() === p.schritte.length - 1;
  return (
    <div class="scheinwerfer" role="dialog" aria-modal="true" aria-label={s().titel}>
      <Show when={rahmen()} fallback={<div class="scheinwerfer-dunkel" />}>{(r) => <div class="scheinwerfer-licht" style={{ left: `${r().left - 6}px`, top: `${r().top - 6}px`, width: `${r().width + 12}px`, height: `${r().height + 12}px` }} />}</Show>
      <div class="scheinwerfer-karte" classList={{ mitte: !rahmen() }} style={karte()}>
        <Show when={s().ueber}><small class="scheinwerfer-ueber">{s().ueber}</small></Show>
        <h3>{s().titel}</h3>
        <p>{s().text}</p>
        <div class="scheinwerfer-knoepfe">
          <div class="scheinwerfer-punkte"><For each={p.schritte}>{(_, i) => <i classList={{ an: i() === nr() }} />}</For></div>
          <button type="button" class="knopf still" onClick={p.onZu}>Beenden</button>
          <button type="button" class="knopf" disabled={nr() === 0} onClick={() => setNr(nr() - 1)}>Zurück</button>
          <button type="button" class="knopf haupt" ref={(b) => queueMicrotask(() => b.focus())} onClick={() => (letzter() ? p.onZu() : setNr(nr() + 1))}>{letzter() ? 'Fertig' : 'Weiter'}</button>
        </div>
      </div>
    </div>
  );
}
