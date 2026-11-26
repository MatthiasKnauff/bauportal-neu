// Gruppieren (Bauzeitenplan, wie im bisherigen Bauportal): Regler Gebäudeteil → + Bauphase → + Gewerk → + Firma, außen wahlweise
// Gebäudeteil › Bauphase oder Bauphase › Gebäudeteil, mit Vorschau der neuen Gliederung. Die Rechnung steckt in bauzeitenplan/bearbeiten.
import { For, createMemo, createSignal } from 'solid-js';
import type { Wert } from '../kern/modell';
import { gruppieren, istGliederung, type GV, type Gruppenebene, type L, type Vorlage } from '../module/bauzeitenplan/bearbeiten';
import { Dialog } from './baukasten/dialog';

const STUFEN = ['Gebäudeteil', '+ Bauphase', '+ Gewerk', '+ Firma'];

export function GruppierenFenster(p: { v: GV[]; l: L[]; zu: Record<string, Wert>; neu: () => string; onFertig: (b: Vorlage[]) => void; onZu: () => void }) {
  const v = p.v, l = p.l;   // Stand beim Öffnen
  const [stufe, setStufe] = createSignal(2);
  const [phaseAussen, setPhaseAussen] = createSignal(false);
  const ebenen = (): Gruppenebene[] => {
    const aussen: Gruppenebene[] = stufe() >= 2 ? (phaseAussen() ? ['phase', 'teil'] : ['teil', 'phase']) : ['teil'];
    return [...aussen, ...(stufe() >= 3 ? ['gewerk' as const] : []), ...(stufe() >= 4 ? ['firma' as const] : [])];
  };
  // Vorschau: die Befehle auf eine Kopie anwenden und als Baum zeigen
  const vorschau = createMemo(() => {
    let k = 0;
    const b = gruppieren(v, l, ebenen(), p.zu, () => `probe-${++k}`);
    const z = new Map<string, { id: string; name: string; ebene: number; reihe: number; gliederung: boolean; gewerk?: string }>(v.map((x) => [x.id, { id: x.id, name: x.name, ebene: x.ebene, reihe: x.reihe, gliederung: istGliederung(x), gewerk: x.gewerk }]));
    for (const c of b) {
      if (c.objekt !== 'vorgang') continue;
      if (c.art === 'loeschen') { z.delete(c.objektId); continue; }
      const alt = z.get(c.objektId), w = c.werte ?? {};
      z.set(c.objektId, { id: c.objektId, name: String(w.name ?? alt?.name ?? ''), ebene: Number(w.ebene ?? alt?.ebene ?? 0), reihe: Number(w.reihe ?? alt?.reihe ?? 0), gliederung: alt ? alt.gliederung : true, gewerk: alt?.gewerk });
    }
    const l2 = [...z.values()].sort((a, c) => a.reihe - c.reihe);
    return l2.map((x, i) => ({ ...x, gruppe: !!l2[i + 1] && l2[i + 1]!.ebene > x.ebene }));
  });
  return (
    <Dialog titel="Gruppieren" breit onAbbrechen={p.onZu} geaendert={() => false}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button>
        <button class="knopf haupt" onClick={() => p.onFertig(gruppieren(v, l, ebenen(), p.zu, p.neu))}>Gruppieren</button></>}>
      <div class="grp">
        <b>Vorschau</b>
        <div class="grp-vorschau" role="tree" aria-label="Vorschau der Gliederung">
          <For each={vorschau()}>{(x) => (
            <div class="grp-zeile" classList={{ gruppe: x.gruppe }} role="treeitem" style={{ 'padding-left': `${8 + x.ebene * 18}px` }}>
              {x.name}
            </div>
          )}</For>
        </div>
        <input type="range" min={1} max={4} step={1} value={stufe()} aria-label="Ebenen" class="grp-regler" onInput={(e) => setStufe(Number(e.currentTarget.value))} />
        <div class="grp-stufen"><For each={STUFEN}>{(t, i) => <span classList={{ an: i() + 1 === stufe() }}>{t}</span>}</For></div>
        <div class="grp-aussen">
          <span>Außen:</span>
          <div class="auswahl" role="radiogroup" aria-label="Außen">
            <button type="button" role="radio" aria-checked={!phaseAussen()} classList={{ aktiv: !phaseAussen() }} onClick={() => setPhaseAussen(false)}>Gebäudeteil › Bauphase</button>
            <button type="button" role="radio" aria-checked={phaseAussen()} classList={{ aktiv: phaseAussen() }} disabled={stufe() < 2} onClick={() => setPhaseAussen(true)}>Bauphase › Gebäudeteil</button>
          </div>
        </div>
        <p class="still-text klein-text">Gewerk- und Firmenzeilen nur, wo sie mindestens zwei Leistungen zusammenfassen; ein Gebäudeteil allein bekommt keine Zeile. Dauer, Vorgänger und Firmen bleiben; eigene Gruppen bleiben mit allem darunter zusammen. Rückgängig oben links.</p>
      </div>
    </Dialog>
  );
}
