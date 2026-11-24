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

export function Rahmen(p: {
  schluessel: string;                       // merkt sich je Ansicht, was zugeklappt ist
  abfolge?: { schritte: Schritt[]; aktiv: string; onWahl?: (id: string) => void };
  knoepfe?: Knopf[]; menueMitte?: JSX.Element;
  baum?: JSX.Element; baumTitel?: string;
  inhalt: JSX.Element;
  details?: JSX.Element; detailsTitel?: string;
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
      <div class="plaetze" classList={{ 'mit-details': !!p.details && !rechtsWeg(), 'baum-offen': baumAmHandy() }}>
        <Show when={p.baum}>
          <Show when={!linksZu() || baumAmHandy()} fallback={<button class="reiter links" title={`${p.baumTitel ?? 'Gliederung'} aufklappen`} onClick={() => setLinksZu(false)}><span>{p.baumTitel ?? 'Gliederung'}</span></button>}>
            <aside class="platz-links" aria-label={p.baumTitel ?? 'Gliederung'} onClick={() => setBaumAmHandy(false)}>{p.baum}</aside>
          </Show>
        </Show>
        <section class="platz-mitte">{p.inhalt}</section>
        <Show when={p.details}>
          <Show when={!rechtsWeg()} fallback={<button class="reiter" title="Details aufklappen" onClick={() => setRechtsZu(false)}><span>{p.detailsTitel ?? 'Details'}</span></button>}>
            <div class="platz-rechts">{p.details}</div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
