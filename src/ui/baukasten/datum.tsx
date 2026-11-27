// Baustein „Datum“: statt des Kalenders des Browsers (Systemdialog) ein eigenes Feld – tippen wie man es schreibt
// (27.11.2026, 27.11., +7, +2w, heute) oder den kleinen Kalender öffnen: oben drei Vorschläge zum Antippen (Stellschraube
// am Feld, ab Werk +1 Woche · +2 Wochen · +1 Monat ab heute), darunter der Monat. Esc oder ein Klick daneben schließt.
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { DATUM_VORSCHLAEGE, datumAusText, datumPlus, datumText, isoVon, type DatumVorschlag } from '../../kern/datum';
import type { Werte } from '../../kern/modell';
import { Zeichen } from './zeichen';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function Datumsfeld(p: {
  id?: string; wert: string; titel: string; gesperrt?: boolean; sofort?: boolean;
  vorschlaege?: DatumVorschlag[]; zusammenhang?: Werte;
  /** Text wie getippt in JJJJ-MM-TT übersetzt (unlesbar: wie getippt – die Prüfung des Felds meldet es) */
  onWert: (w: string) => void;
}) {
  let feld!: HTMLInputElement, knopf!: HTMLButtonElement;
  const [offen, setOffen] = createSignal<{ x: number; y: number } | null>(null);
  const heute = () => isoVon(new Date());
  const [monat, setMonat] = createSignal(heute().slice(0, 7));
  const melden = (text: string) => { const iso = datumAusText(text); const w = iso === null ? text : iso; if (w !== p.wert) p.onWert(w); feld.value = datumText(w); };
  const vorschlaege = createMemo(() => (p.vorschlaege ?? DATUM_VORSCHLAEGE).map((v) => {
    const basis = v.ab ? String(p.zusammenhang?.[v.ab] ?? '') : heute();
    return { titel: v.titel, iso: /^\d{4}-\d{2}-\d{2}$/.test(basis) ? datumPlus(basis, v) : '' };
  }).filter((v) => v.iso));
  const tage = createMemo(() => {
    const [j, m] = monat().split('-').map(Number) as [number, number], erster = new Date(j, m - 1, 1), vorn = (erster.getDay() + 6) % 7, n = new Date(j, m, 0).getDate();
    return [...Array<null>(vorn).fill(null), ...Array.from({ length: n }, (_, i) => isoVon(new Date(j, m - 1, i + 1)))];
  });
  const auf = () => {
    if (p.gesperrt) return;
    const r = knopf.getBoundingClientRect();
    setMonat((/^\d{4}-\d{2}/.test(p.wert) ? p.wert : heute()).slice(0, 7));
    setOffen({ x: Math.max(8, Math.min(r.right - 236, innerWidth - 244)), y: r.bottom + 290 > innerHeight ? Math.max(8, r.top - 290) : r.bottom + 4 });
  };
  const nimm = (iso: string) => { setOffen(null); melden(iso); feld.focus(); };
  const blaettern = (d: number) => { const [j, m] = monat().split('-').map(Number) as [number, number]; setMonat(isoVon(new Date(j, m - 1 + d, 1)).slice(0, 7)); };
  const weg = (e: PointerEvent) => { if (offen() && !(e.target as Element).closest('.datum-fenster') && e.target !== knopf && !knopf.contains(e.target as Node)) setOffen(null); };
  // Esc schließt nur den Kalender – vor dem Fenster drumherum (das hört auf dem Dokument, der Kalender schon am window)
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape' && offen()) { e.preventDefault(); e.stopImmediatePropagation(); setOffen(null); feld.focus(); } };
  document.addEventListener('pointerdown', weg, true); addEventListener('keydown', taste, true);
  onCleanup(() => { document.removeEventListener('pointerdown', weg, true); removeEventListener('keydown', taste, true); });
  return (
    <div class="feld-mit-knopf datumsfeld">
      <input ref={feld} id={p.id} type="text" inputMode="numeric" autocomplete="off" placeholder="TT.MM.JJJJ" value={datumText(p.wert)} readOnly={p.gesperrt}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); auf(); } }}
        onInput={(e) => { if (p.sofort) { const iso = datumAusText(e.currentTarget.value); if (iso !== null && iso !== p.wert) p.onWert(iso); } }}
        onChange={(e) => melden(e.currentTarget.value)} />
      <button ref={knopf} type="button" class="knopf klein still" disabled={p.gesperrt} aria-label="Kalender öffnen" title={`Kalender – ${p.titel}`} aria-expanded={!!offen()} onClick={() => (offen() ? setOffen(null) : auf())}><Zeichen name="kalender" groesse={16} /></button>
      <Show when={offen()}>{(o) => (
        <Portal>
          <div class="datum-fenster" role="dialog" aria-label={`${p.titel} wählen`} style={{ left: `${o().x}px`, top: `${o().y}px` }}
>
            <div class="datum-vorschlaege"><For each={vorschlaege()}>{(v) => <button type="button" class="knopf klein" title={datumText(v.iso)} onClick={() => nimm(v.iso)}>{v.titel}</button>}</For></div>
            <div class="datum-monat">
              <button type="button" class="knopf mini still" aria-label="Voriger Monat" onClick={() => blaettern(-1)}>‹</button>
              <b>{MONATE[Number(monat().slice(5, 7)) - 1]} {monat().slice(0, 4)}</b>
              <button type="button" class="knopf mini still" aria-label="Nächster Monat" onClick={() => blaettern(1)}>›</button>
            </div>
            <div class="datum-tage" role="grid">
              <For each={['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']}>{(t) => <span class="datum-wt">{t}</span>}</For>
              <For each={tage()}>{(t) => t ? <button type="button" classList={{ heute: t === heute(), an: t === p.wert }} aria-label={datumText(t)} onClick={() => nimm(t)}>{Number(t.slice(8))}</button> : <span />}</For>
            </div>
            <div class="datum-fuss">
              <button type="button" class="knopf mini still" onClick={() => nimm(heute())}>Heute</button>
              <Show when={p.wert}><button type="button" class="knopf mini still" onClick={() => nimm('')}>Leeren</button></Show>
            </div>
          </div>
        </Portal>)}</Show>
    </div>
  );
}
