// Baustein „Zähler“: eine kleine Zahl mit − und + daneben (z. B. Personen einer Firma im Bautagebuch). Tippen geht auch;
// leer heißt „keine Angabe“. Gespeichert wird beim Klick auf − / + sofort, beim Tippen beim Verlassen des Feldes.
import type { Wert } from '../../kern/modell';

export function Zaehler(p: { wert: Wert; onWert: (w: number | null) => void; titel: string; min?: number; gesperrt?: boolean }) {
  const zahl = () => (p.wert === null || p.wert === undefined || p.wert === '' ? null : Number(p.wert));
  const setze = (n: number | null) => { if (n !== zahl()) p.onWert(n === null ? null : Math.max(p.min ?? 0, n)); };
  return (
    <span class="zaehler-feld" role="group" aria-label={p.titel}>
      <button type="button" class="knopf klein still" aria-label={`${p.titel} weniger`} disabled={p.gesperrt || (zahl() ?? 0) <= (p.min ?? 0)} onClick={() => setze((zahl() ?? 1) - 1)}>−</button>
      <input type="text" inputMode="numeric" value={zahl() ?? ''} placeholder="–" aria-label={p.titel} readOnly={p.gesperrt}
        onChange={(e) => { const t = e.currentTarget.value.trim(); setze(t === '' ? null : Number.isFinite(Number(t)) ? Math.round(Number(t)) : zahl()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'ArrowUp') { e.preventDefault(); setze((zahl() ?? 0) + 1); } if (e.key === 'ArrowDown') { e.preventDefault(); setze((zahl() ?? 1) - 1); } }} />
      <button type="button" class="knopf klein still" aria-label={`${p.titel} mehr`} disabled={p.gesperrt} onClick={() => setze((zahl() ?? 0) + 1)}>+</button>
    </span>
  );
}
