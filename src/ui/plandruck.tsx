// Druckdialog des Bauzeitenplans: Format, Ausrichtung, Maßstab, Zeitraum, Spalten und was mitgedruckt wird – mit
// Vorschau aus derselben Funktion, die auf dem Server das PDF baut. Die Einstellungen merkt sich das Gerät.
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { DRUCKSPALTEN, FORMATE, STANDARD, planDruck, type Druckoptionen } from '../module/bauzeitenplan/druck';
import type { Plan } from '../module/bauzeitenplan/plan';
import { sicht } from './abgleich';
import { ladeDatei, ruf, zustand } from './api';
import { Dialog } from './baukasten/dialog';
import { hinweis } from './baukasten/hinweise';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';

const MERKER = 'bzp.druck';
const gemerkt = (): Druckoptionen => { try { return { ...STANDARD, ...(JSON.parse(localStorage.getItem(MERKER) ?? '{}') as Partial<Druckoptionen>) }; } catch { return { ...STANDARD }; } };

export function PlanDrucken(p: { plan: Plan; projekt: string; version: string; onZu: () => void }) {
  const [o, setO] = createSignal<Druckoptionen>(gemerkt());
  const setze = <K extends keyof Druckoptionen>(k: K, w: Druckoptionen[K]) => { const n = { ...o(), [k]: w }; setO(n); try { localStorage.setItem(MERKER, JSON.stringify(n)); } catch { /* egal */ } };
  const [laeuft, setLaeuft] = createSignal(false);
  const test = () => zustand()!.umgebung === 'test';
  const projekt = () => sicht.projekt?.[p.projekt]?.werte ?? {};
  const daten = () => ({
    titel: `Bauzeitenplan ${[projekt().nummer, projekt().name].filter(Boolean).join(' · ')}`, unter: `Version „${sicht.version?.[p.version]?.werte.name ?? ''}“`,
    buero: String(sicht.buero?.[BUERO_ID]?.werte.name ?? ''), zeilen: p.plan.zeilen, links: p.plan.links, kal: p.plan.kal, ende: p.plan.erg.endeDatum, heute: new Date().toLocaleDateString('sv'),
  });
  const seite = createMemo(() => planDruck(daten(), o()));
  // Vorschau so breit wie ihr Platz: das Blatt passt immer ganz hinein
  const [platz, setPlatz] = createSignal(680);
  const beobachten = (el: HTMLElement) => { const r = new ResizeObserver(() => setPlatz(Math.max(200, el.clientWidth - 30))); r.observe(el); onCleanup(() => r.disconnect()); };
  const zoom = () => Math.min(1, platz() / (seite().blatt.b * 3.7795));
  const vorschau = () => seite().html.replace('</style>', `body { background: #e9e9e4; zoom: ${zoom()}; padding: 12px; } .blatt { margin: 0 auto 16px; box-shadow: 0 1px 6px rgba(0,0,0,.25); }</style>`);
  const pdf = async () => { setLaeuft(true); try { await ladeDatei('/api/bauzeitenplan/pdf', { version: p.version, optionen: o() }); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } finally { setLaeuft(false); } };
  const ablegen = async () => { setLaeuft(true); try { const r = await ruf<{ pfad: string }>('/api/bauzeitenplan/ablegen', { version: p.version, optionen: o() }); hinweis(`Im Projektordner abgelegt: ${r.pfad}`); } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); } finally { setLaeuft(false); } };
  const haken = (k: keyof Druckoptionen, titel: string) => <label class="druck-haken"><input type="checkbox" checked={o()[k] as boolean} onChange={(e) => setze(k, e.currentTarget.checked as never)} /> {titel}</label>;
  const zahl = (k: keyof Druckoptionen, titel: string, min: number, max: number, schritt = 1) => (
    <label class="druck-feld">{titel} <input type="number" min={min} max={max} step={schritt} value={Number(o()[k] ?? 0)} onChange={(e) => { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) setze(k, Math.max(min, Math.min(max, n)) as never); }} /></label>
  );
  return (
    <Dialog titel="Bauzeitenplan drucken" gross onAbbrechen={p.onZu}
      knoepfe={<>
        <button class="knopf" onClick={p.onZu}>Schließen</button>
        <button class="knopf" disabled={laeuft() || test()} title={test() ? 'Der Testserver darf den Dateiserver nur lesen – ablegen geht auf dem Produktivserver' : 'Als PDF in den Ordner „Bauzeitenplan“ des Projekts'} onClick={ablegen}>Im Projektordner ablegen</button>
        <button class="knopf haupt" disabled={laeuft()} onClick={pdf}>{laeuft() ? 'PDF wird erzeugt …' : 'PDF herunterladen'}</button>
      </>}>
      <div class="plandruck">
        <div class="plandruck-optionen">
          <fieldset><legend>Papier</legend>
            <label class="druck-feld">Format <select value={o().format} onChange={(e) => setze('format', e.currentTarget.value)}>
              <For each={Object.entries(FORMATE)}>{([k, f]) => <option value={k}>{f.titel}{f.b ? ` (${f.b} × ${f.h} mm)` : ''}</option>}</For></select></label>
            <Show when={o().format === 'EIGEN'}>{zahl('eigenB', 'Breite mm', 50, 5000)}{zahl('eigenH', 'Höhe mm', 50, 5000)}</Show>
            <Show when={o().format === 'ROLLE'}>{zahl('rolle', 'Rollenbreite mm', 200, 1600)}<p class="still-text klein-text">Die Länge ergibt sich aus dem Plan.</p></Show>
            <Show when={o().format !== 'ROLLE'}><div class="reihe" role="radiogroup">
              <label class="druck-haken"><input type="radio" checked={o().quer} onChange={() => setze('quer', true)} /> quer</label>
              <label class="druck-haken"><input type="radio" checked={!o().quer} onChange={() => setze('quer', false)} /> hoch</label></div></Show>
            {zahl('rand', 'Rand mm', 0, 40)}
          </fieldset>
          <fieldset><legend>Maßstab</legend>
            <label class="druck-haken"><input type="radio" checked={o().anpassen === 'breite'} onChange={() => setze('anpassen', 'breite')} /> an Seitenbreite anpassen</label>
            <Show when={o().anpassen === 'breite' && o().format !== 'ROLLE'}>{zahl('seitenBreit', 'auf Seiten breit', 1, 20)}</Show>
            <label class="druck-haken"><input type="radio" checked={o().anpassen === 'fest'} onChange={() => setze('anpassen', 'fest')} /> feste Zeitskala</label>
            <Show when={o().anpassen === 'fest'}>{zahl('mmJeTag', 'mm je Tag', 0.2, 20, 0.1)}</Show>
            {zahl('seitenHoch', 'Zeilen auf Seiten hoch (0: aus)', 0, 20)}
            {zahl('schrift', 'Schrift pt', 5, 14, 0.5)}
          </fieldset>
          <fieldset><legend>Zeitraum</legend>
            <label class="druck-feld">von <input type="date" value={o().von ?? ''} onChange={(e) => setze('von', e.currentTarget.value || undefined)} /></label>
            <label class="druck-feld">bis <input type="date" value={o().bis ?? ''} onChange={(e) => setze('bis', e.currentTarget.value || undefined)} /></label>
            <p class="still-text klein-text">Leer: der ganze Plan.</p>
          </fieldset>
          <fieldset><legend>Spalten</legend>
            <For each={DRUCKSPALTEN}>{(sp) => <label class="druck-haken"><input type="checkbox" checked={o().spalten.includes(sp.id)} onChange={(e) => setze('spalten', DRUCKSPALTEN.map((x) => x.id).filter((id) => (id === sp.id ? e.currentTarget.checked : o().spalten.includes(id))))} /> {sp.titel}</label>}</For>
            {haken('tabelleJedeSeite', 'Tabelle auf jeder Seite')}
          </fieldset>
          <fieldset><legend>Mitdrucken</legend>
            {haken('kritisch', 'Kritischer Weg')}{haken('heute', 'Heute-Linie')}{haken('legende', 'Legende')}{haken('kopf', 'Kopfzeile')}{haken('seitenzahl', 'Fußzeile mit Seitenzahl')}
            <label class="druck-feld">Pfeile <select value={o().pfeile} onChange={(e) => setze('pfeile', e.currentTarget.value as Druckoptionen['pfeile'])}>
              <option value="keine">keine</option><option value="kritisch">kritischer Weg</option><option value="alle">alle</option></select></label>
          </fieldset>
        </div>
        <div class="plandruck-vorschau" ref={beobachten}>
          <p class="still-text klein-text">{seite().seiten} {seite().seiten === 1 ? 'Seite' : 'Seiten'} · {Math.round(seite().blatt.b)} × {Math.round(seite().blatt.h)} mm</p>
          <iframe title="Vorschau" srcdoc={vorschau()} />
        </div>
      </div>
    </Dialog>
  );
}
