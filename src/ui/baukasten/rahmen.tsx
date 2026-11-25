// Baustein „Rahmen“: der feste Aufbau jeder App.
//   Abfolge-Leiste (nur bei Apps mit Abfolge) · Menüleiste · darunter drei Plätze: Baum | Inhalt | Details
// Die App setzt fertige Bausteine auf die Plätze. Ein leerer Platz fehlt einfach; wer zugeklappt ist,
// gibt seinen Platz an die Mitte ab. Am Handy stehen die Plätze nacheinander statt nebeneinander.
import { Show, createContext, createSignal, useContext, type JSX } from 'solid-js';
import { Abfolgeleiste, type Schritt } from './abfolgeleiste';
import { Menueleiste, type Knopf, type Reiter, type Rueckgaengig } from './menueleiste';

/** Was das Portal jeder Ansicht mitgibt: die Reiter der App und Rückgängig/Wiederholen. */
export const AppUmgebung = createContext<{ reiter: () => Reiter[]; aktiv: () => string; onReiter: (id: string) => void; rueckgaengig: Rueckgaengig }>();

export interface RahmenSteuer { detailsZeigen: () => void; detailsZuklappen: () => void }

const LINKS = 230, RECHTS = 400;   // Breiten ab Werk

/** Griff ⋮ zwischen zwei Plätzen: ziehen ändert die Breite, Pfeiltasten in Schritten, Doppelklick setzt zurück. */
function Griff(p: { titel: string; wert: number; min: number; max: number; werk: number; richtung: 1 | -1; onWert: (w: number) => void; onFertig: (w: number) => void }) {
  const klemmen = (w: number) => Math.max(p.min, Math.min(p.max, w));
  const ziehen = (e: PointerEvent) => {
    e.preventDefault();
    const start = e.clientX, w0 = p.wert, el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId); el.classList.add('zieht');
    const bewegen = (m: PointerEvent) => p.onWert(klemmen(w0 + (m.clientX - start) * p.richtung));
    const los = () => { el.removeEventListener('pointermove', bewegen); el.removeEventListener('pointerup', los); el.classList.remove('zieht'); p.onFertig(p.wert); };
    el.addEventListener('pointermove', bewegen); el.addEventListener('pointerup', los);
  };
  const taste = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!d) return;
    e.preventDefault(); const w = klemmen(p.wert + d * p.richtung); p.onWert(w); p.onFertig(w);
  };
  return (
    <div class="griff-trenner" role="separator" aria-orientation="vertical" aria-label={p.titel} aria-valuenow={p.wert} aria-valuemin={p.min} aria-valuemax={p.max} tabindex="0"
      title="Ziehen ändert die Breite · Doppelklick: wie ab Werk" onPointerDown={ziehen} onKeyDown={taste} onDblClick={() => { p.onWert(p.werk); p.onFertig(p.werk); }}><span>⋮</span></div>
  );
}

export function Rahmen(p: {
  schluessel: string;                       // merkt sich je Ansicht, was zugeklappt ist
  abfolge?: { schritte: Schritt[]; aktiv: string; onWahl?: (id: string) => void };
  knoepfe?: Knopf[]; menueMitte?: JSX.Element;
  unterMenue?: JSX.Element;                 // z. B. die Versionsleiste
  baum?: JSX.Element; baumTitel?: string;
  inhalt: JSX.Element;
  details?: JSX.Element; detailsTitel?: string;
  detailsHinweis?: string;                  // ohne Details: was rechts zu tun ist (am großen Bildschirm; rechts bleibt so immer da)
  steuer?: (s: RahmenSteuer) => void;
}) {
  const app = useContext(AppUmgebung);
  const merk = (seite: string) => `bp_rahmen_${p.schluessel}_${seite}`;
  const lies = (seite: string) => { try { return localStorage.getItem(merk(seite)) === 'zu'; } catch { return false; } };
  const [linksZu, setLinksZuRoh] = createSignal(lies('links'));
  const [rechtsZu, setRechtsZuRoh] = createSignal(lies('rechts'));
  const [baumAmHandy, setBaumAmHandy] = createSignal(false);
  const setze = (seite: string, setter: (b: boolean) => void) => (zu: boolean) => { setter(zu); try { localStorage.setItem(merk(seite), zu ? 'zu' : 'auf'); } catch { /* gesperrt */ } };
  const setLinksZu = setze('links', setLinksZuRoh), setRechtsZu = setze('rechts', setRechtsZuRoh);
  // Breite links und rechts: am Griff ⋮ zwischen den Plätzen ziehen (Doppelklick: wie ab Werk) – gemerkt je Ansicht
  const zahl = (seite: string, d: number) => { try { return Number(localStorage.getItem(merk(`breite_${seite}`))) || d; } catch { return d; } };
  const [linksBreite, setLinksBreite] = createSignal(zahl('links', LINKS));
  const [rechtsBreite, setRechtsBreite] = createSignal(zahl('rechts', RECHTS));
  const breiteMerken = (seite: string, w: number) => { try { localStorage.setItem(merk(`breite_${seite}`), String(Math.round(w))); } catch { /* gesperrt */ } };
  p.steuer?.({ detailsZeigen: () => setRechtsZu(false), detailsZuklappen: () => setRechtsZu(true) });
  // Am Handy stehen die Plätze nacheinander: der Baum ist dort ein eigener Schritt, unabhängig vom Zuklappen am großen Bildschirm.
  const schmal = () => matchMedia('(max-width: 860px)').matches;
  const rechtsWeg = () => rechtsZu() && !schmal();   // am Handy gibt es kein Zuklappen: Details sind dort ein eigener Schritt
  const knoepfe = (): Knopf[] => [
    ...(p.baum ? [{ titel: p.baumTitel ?? 'Gliederung', symbol: '☷', nurSymbol: true, tun: () => (schmal() ? setBaumAmHandy(!baumAmHandy()) : setLinksZu(!linksZu())) }] : []),
    ...(p.knoepfe ?? []),
  ];
  return (
    <div class="rahmen">
      <Show when={p.abfolge}>{(a) => <Abfolgeleiste schritte={a().schritte} aktiv={a().aktiv} onWahl={a().onWahl} />}</Show>
      <Menueleiste rueckgaengig={app?.rueckgaengig} reiter={app?.reiter()} aktiv={app?.aktiv()} onReiter={app?.onReiter} knoepfe={knoepfe()}>{p.menueMitte}</Menueleiste>
      {p.unterMenue}
      <div class="plaetze" classList={{ 'mit-details': !!p.details && !rechtsWeg(), 'baum-offen': baumAmHandy() }}
        style={{ '--links-breite': `${linksBreite()}px`, '--rechts-breite': `${rechtsBreite()}px` }}>
        <Show when={p.baum}>
          <Show when={!linksZu() || baumAmHandy()} fallback={<button class="reiter links" title={`${p.baumTitel ?? 'Gliederung'} aufklappen`} onClick={() => setLinksZu(false)}><span>{p.baumTitel ?? 'Gliederung'}</span></button>}>
            <aside class="platz-links" aria-label={p.baumTitel ?? 'Gliederung'} onClick={() => setBaumAmHandy(false)}>{p.baum}</aside>
            <Griff titel={`Breite ${p.baumTitel ?? 'Gliederung'}`} wert={linksBreite()} min={160} max={520} werk={LINKS} richtung={1} onWert={setLinksBreite} onFertig={(w) => breiteMerken('links', w)} />
          </Show>
        </Show>
        <section class="platz-mitte">{p.inhalt}</section>
        <Show when={p.details || (p.detailsHinweis && !schmal())}>
          <Show when={!rechtsWeg()} fallback={<button class="reiter" title="Details aufklappen" onClick={() => setRechtsZu(false)}><span>{p.detailsTitel ?? 'Details'}</span></button>}>
            <Griff titel="Breite der Details" wert={rechtsBreite()} min={280} max={800} werk={RECHTS} richtung={-1} onWert={setRechtsBreite} onFertig={(w) => breiteMerken('rechts', w)} />
            <div class="platz-rechts">{p.details ?? (
              <aside class="karte karte-hinweis" aria-label="Details">
                <div class="karte-kopf"><h2>Details</h2><button class="knopf still" aria-label="Details zuklappen" title="Zuklappen" onClick={() => setRechtsZu(true)}>⇥</button></div>
                <div class="karte-inhalt"><p class="still-text">{p.detailsHinweis}</p></div>
              </aside>)}</div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
