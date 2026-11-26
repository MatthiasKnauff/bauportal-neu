// Baustein „Farbwahl“: eigene Farbe wählen ohne Systemdialog – ein Knopf mit der Farbe öffnet darunter ein Feld (Sättigung/
// Helligkeit) und eine Farbton-Leiste, dazu das Feld #rrggbb. „Übernehmen“ setzt die Farbe (ein Rückgängig), Esc oder
// daneben klicken schließt ohne Änderung. Für Akzentfarbe (Darstellung) und überall, wo eine eigene Farbe gebraucht wird.
import { Show, createSignal, onCleanup } from 'solid-js';

const hexAus = (h: number, s: number, v: number): string => {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
const hsvAus = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return [220, 0.7, 0.8];
  const n = parseInt(m[1]!, 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
};

export function Farbwahl(p: { wert: string; onWert: (hex: string) => void; titel: string; aktiv?: boolean }) {
  const [offen, setOffen] = createSignal(false);
  const [hsv, setHsv] = createSignal<[number, number, number]>(hsvAus(p.wert));
  const [text, setText] = createSignal('');
  const hex = () => hexAus(...hsv());
  let wurzel!: HTMLDivElement;
  const draussen = (e: MouseEvent) => { if (!wurzel.contains(e.target as Node)) zu(); };
  const auf = () => { setHsv(hsvAus(p.wert)); setText(''); setOffen(true); document.addEventListener('mousedown', draussen); };
  const zu = () => { setOffen(false); document.removeEventListener('mousedown', draussen); };
  onCleanup(() => document.removeEventListener('mousedown', draussen));
  // Ziehen im Feld bzw. auf der Leiste: Wert folgt der Maus, auch außerhalb (Zeiger festgehalten)
  const ziehen = (e: PointerEvent, setzen: (x: number, y: number) => void) => {
    const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId);
    const lage = (x: PointerEvent) => { const r = el.getBoundingClientRect(); setzen(Math.min(1, Math.max(0, (x.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (x.clientY - r.top) / r.height))); };
    lage(e);
    const weg = () => { el.removeEventListener('pointermove', lage); el.removeEventListener('pointerup', weg); };
    el.addEventListener('pointermove', lage); el.addEventListener('pointerup', weg);
  };
  const uebernehmen = () => { zu(); p.onWert(hex()); };
  return (
    <div class="farbwahl" ref={wurzel} onKeyDown={(e) => { if (e.key === 'Escape' && offen()) { e.stopPropagation(); zu(); } }}>
      <button type="button" class="farbwahl-knopf" classList={{ aktiv: !!p.aktiv }} aria-haspopup="dialog" aria-expanded={offen()} aria-label={p.titel} title={p.titel}
        onClick={() => (offen() ? zu() : auf())}><i style={{ background: p.aktiv ? p.wert : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />eigene …</button>
      <Show when={offen()}>
        <div class="farbwahl-feld" role="dialog" aria-label={p.titel}>
          <div class="farbwahl-sv" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hexAus(hsv()[0], 1, 1)})` }}
            onPointerDown={(e) => ziehen(e, (x, y) => setHsv([hsv()[0], x, 1 - y]))} aria-label="Sättigung und Helligkeit">
            <i style={{ left: `${hsv()[1] * 100}%`, top: `${(1 - hsv()[2]) * 100}%` }} />
          </div>
          <div class="farbwahl-ton" onPointerDown={(e) => ziehen(e, (x) => setHsv([x * 359.9, hsv()[1], hsv()[2]]))} aria-label="Farbton">
            <i style={{ left: `${(hsv()[0] / 360) * 100}%` }} />
          </div>
          <div class="farbwahl-fuss">
            <span class="farbwahl-probe" style={{ background: hex() }} />
            <input value={text() || hex()} maxLength={7} aria-label="Farbe als #rrggbb" onInput={(e) => { const v = e.currentTarget.value.trim(); setText(v); if (/^#[0-9a-f]{6}$/i.test(v)) setHsv(hsvAus(v)); }} />
          </div>
          <div class="farbwahl-knoepfe">
            <button type="button" class="knopf klein" onClick={zu}>Abbrechen</button>
            <button type="button" class="knopf klein haupt" onClick={uebernehmen}>Übernehmen</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
