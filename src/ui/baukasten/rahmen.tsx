// Baustein „Rahmen“: der feste Aufbau jeder App.
//   Abfolge-Leiste (nur bei Apps mit Abfolge) · Menüleiste · darunter drei Plätze: Baum | Inhalt | Details
// Die App setzt fertige Bausteine auf die Plätze. Ein leerer Platz fehlt einfach; wer zugeklappt ist,
// gibt seinen Platz an die Mitte ab. Am Handy stehen die Plätze nacheinander statt nebeneinander.
import { Kartenrahmen } from './kartenrahmen';
import { Show, createContext, createEffect, createSignal, onCleanup, useContext, type JSX } from 'solid-js';
import { Zeichen } from './zeichen';
import { Seitenliste, type SeitenAbschnitt } from './seitenliste';
import { Abfolgeleiste, type Schritt } from './abfolgeleiste';
import { Menueleiste, type Knopf, type Reiter, type Rueckgaengig } from './menueleiste';
import { handy, handystufe, nurAnsehen, setHandyPlus } from '../unterbau/geraet';
import { zustand } from '../unterbau/api';

/** Was das Portal jeder Ansicht mitgibt: die Reiter der App und Rückgängig/Wiederholen. */
export const AppUmgebung = createContext<{ reiter: () => Reiter[]; aktiv: () => string; onReiter: (id: string) => void; rueckgaengig: Rueckgaengig }>();

export interface RahmenSteuer { detailsZeigen: () => void; detailsZuklappen: () => void; heftzweckeRechts: () => JSX.Element }   // die eine Heftzwecke der rechten Seite – auch im Kopf der Karte

const LINKS = 240, RECHTS = 400;   // Breiten ab Werk wie bisher – rechts breit genug für zwei Spalten in der Karte

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

/** Links oben: die Ansichten der App in Abschnitten, mit farbigem Symbol – Baustein Seitenliste. */
function Ansichtsliste(p: { reiter: Reiter[]; aktiv: string; onWahl: (id: string) => void }) {
  const abschnitte = (): SeitenAbschnitt[] => { const l: SeitenAbschnitt[] = []; for (const r of p.reiter) { const t = r.abschnitt ?? ''; const e = { id: r.id, titel: r.titel, zeichen: r.zeichen }; const x = l.find((a) => a.schluessel === t); if (x) x.eintraege.push(e); else l.push({ schluessel: t, titel: r.abgesetzt ? `${t} – ${zustand()?.benutzer?.name ?? ''}` : t, eintraege: [e], abgesetzt: r.abgesetzt }); } return l; };
  return <Seitenliste name="Ansichten" abschnitte={abschnitte()} aktiv={p.aktiv} onWahl={p.onWahl} klappbar />;
}

// Kopf und Menüband ausblenden wie im bisherigen Bauportal: die Heftzwecke oben rechts schaltet reihum –
// 0 alles da · 1 Kopfleiste weg · 2 auch das Menüband weg. Gemerkt je App und Gerät. Ausgeblendet erscheinen beide, sobald die
// Maus an die Oberkante kommt – über dem Inhalt, nichts verschiebt sich; weg sind sie, wenn die Maus sie verlässt (nicht beim Tippen).
const OBEN_TEXT = ['Kopf ausblenden – mehr Platz', 'Auch das Menüband ausblenden – beide erscheinen, wenn die Maus an die Oberkante kommt', 'Kopf und Menüband wieder anheften'];
function obenSetzen(stufe: number) {
  const r = document.documentElement;
  if (stufe) r.dataset.oben = String(stufe); else delete r.dataset.oben;
  delete r.dataset.obenZeigen;
}
let obenBeobachtet = false;
function obenBeobachten() {
  if (obenBeobachtet) return; obenBeobachtet = true;
  let weg: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener('mousemove', (e) => {
    const r = document.documentElement;
    if (!r.dataset.oben) return;
    if (e.clientY <= 6 && !r.dataset.obenZeigen) {
      clearTimeout(weg); r.dataset.obenZeigen = '1';
      requestAnimationFrame(() => r.style.setProperty('--kopf-h', `${(document.querySelector('.kopf') as HTMLElement | null)?.offsetHeight ?? 0}px`));
      return;
    }
    if (!r.dataset.obenZeigen) return;
    // Eingeblendet stehen Kopf und Menüband fest (position: fixed) – offsetParent ist dann leer, deshalb nach der Größe fragen.
    // Was aus ihnen aufklappt (Menüs, Auswahllisten), gehört dazu: darüber bleiben beide stehen.
    if ((e.target as Element | null)?.closest?.('.kopf, .menueleiste, [role=menu], .auswahlliste-fenster')) { clearTimeout(weg); return; }
    const unten = Math.max(...[...document.querySelectorAll<HTMLElement>('.kopf, .menueleiste')].filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect().bottom), 0);
    if (e.clientY <= unten + 12) { clearTimeout(weg); return; }
    const tippen = (document.activeElement as HTMLElement | null)?.closest('.kopf, .menueleiste') && (document.activeElement as HTMLElement).matches('input, textarea');
    if (!tippen) { clearTimeout(weg); weg = setTimeout(() => delete r.dataset.obenZeigen, 350); }
  });
}

const HEFT_GROESSE = 18;   // eine Größe für alle Heftzwecken

export function Rahmen(p: {
  schluessel: string;                       // merkt sich je Ansicht, was zugeklappt ist
  kopf?: JSX.Element;                       // über Abfolge und Menüleiste: was die ganze Ansicht betrifft (z. B. das gewählte LV)
  abfolge?: { schritte: Schritt[]; aktiv: string; hier?: string; onWahl?: (id: string) => void };
  knoepfe?: Knopf[]; menueMitte?: JSX.Element; menueMitteTitel?: string;
  unterMenue?: JSX.Element;                 // unter der Menüleiste (Dialoge, Umfang „Dieses Projekt / Alle“)
  linksOben?: () => JSX.Element;            // oben in der Gliederung, steht still beim Rollen – z. B. die Auswahl der Version
  baum?: JSX.Element; baumTitel?: string;
  baumZuerst?: boolean;                     // Baum bzw. eigene Darstellung links über den Ansichten der App
  inhalt: JSX.Element;
  details?: JSX.Element; detailsTitel?: string;
  detailsHinweis?: string;                  // ohne Details: was rechts zu tun ist (am großen Bildschirm; rechts bleibt so immer da)
  steuer?: (s: RahmenSteuer) => void;
}) {
  const app = useContext(AppUmgebung);
  const ansichten = () => app?.reiter() ?? [];
  // Die Heftzwecke gilt für die ganze Seitenleiste – in allen Ansichten und Apps gleich, nicht je Reiter
  const merk = (seite: string) => `bp_rahmen_${seite}`;
  const lies = (seite: string) => { try { return localStorage.getItem(merk(seite)) === 'zu'; } catch { return false; } };
  const [linksZu, setLinksZuRoh] = createSignal(lies('links'));
  const [rechtsZu, setRechtsZuRoh] = createSignal(lies('rechts'));
  const [baumAmHandy, setBaumAmHandy] = createSignal(false);
  const setze = (seite: string, setter: (b: boolean) => void) => (zu: boolean) => { setter(zu); try { localStorage.setItem(merk(seite), zu ? 'zu' : 'auf'); } catch { /* gesperrt */ } };
  const setLinksZu = setze('links', setLinksZuRoh), setRechtsZu = setze('rechts', setRechtsZuRoh);
  // Heftzwecke wie im bisherigen Bauportal: „zu“ heißt gelöst – dann blendet sich die Seite aus und gleitet bei Bedarf über den Inhalt
  const [linksSchwebt, setLinksSchwebt] = createSignal(false), [rechtsSchwebt, setRechtsSchwebt] = createSignal(false);
  // Breite links und rechts: am Griff ⋮ zwischen den Plätzen ziehen (Doppelklick: wie ab Werk) – gemerkt je Ansicht
  const zahl = (seite: string, d: number) => { try { return Number(localStorage.getItem(`bp_rahmen_${p.schluessel}_breite_${seite}`)) || d; } catch { return d; } };
  const [linksBreite, setLinksBreite] = createSignal(zahl('links', LINKS));
  const [rechtsBreite, setRechtsBreite] = createSignal(zahl('rechts', RECHTS));
  const breiteMerken = (seite: string, w: number) => { try { localStorage.setItem(`bp_rahmen_${p.schluessel}_breite_${seite}`, String(Math.round(w))); } catch { /* gesperrt */ } };

  // Am Handy stehen die Plätze nacheinander: der Baum ist dort ein eigener Schritt, unabhängig vom Zuklappen am großen Bildschirm.
  const schmal = handy;
  const rechtsWeg = () => rechtsZu() && !schmal();   // am Handy gibt es kein Zuklappen: Details sind dort ein eigener Schritt
  // Am Handy (wie im bisherigen Bauportal): der Hauptknopf „Neu“ wandert als ＋ in die Leiste unten – nur in Apps, die dort alles können;
  // in Apps zum Ansehen mit Handgriffen gibt es dort nichts Neues anzulegen.
  const plusDa = () => schmal() && ['voll', 'eigen'].includes(handystufe());
  createEffect(() => { const l = p.knoepfe ?? [], h = l.find((k) => k.handyPlus && !k.gesperrt) ?? l.find((k) => k.haupt && !k.gesperrt); setHandyPlus(plusDa() && h ? { titel: h.titel, tun: () => h.tun(new MouseEvent('click')) } : null); });
  onCleanup(() => setHandyPlus(null));
  // Am Handy nur zum Ansehen (wie im bisherigen Bauportal): keine Befehle – nur die Reiter der Ansichten bleiben
  const knoepfe = (): Knopf[] => nurAnsehen() ? [] : [
    ...(p.knoepfe ?? []).filter((k) => !k.nurHandy).filter((k) => !schmal() || !(k.haupt || k.gruppe === 'Neu') || (!plusDa() && handystufe() !== 'ansicht')),
    // Links ein-/ausblenden: am Rechner über die Heftzwecke des Bereichs (kein eigener Knopf – 27.11.2026); am Handy der einzige Weg zum Baum
    ...(schmal() && (p.baum || ansichten().length > 1) ? [{ titel: p.baumTitel ?? 'Links', zeichen: 'gliederung', gruppe: 'Ansicht', an: baumAmHandy(), tun: () => setBaumAmHandy(!baumAmHandy()) }] : []),
  ];
  const linksTitel = () => ansichten().find((a) => a.id === app?.aktiv())?.titel ?? p.baumTitel ?? 'Gliederung';
  // Alle Heftzwecken gleich groß (Bereiche links und rechts, Kopf und Menüleiste)
  const heftzwecke = (zu: () => boolean, setZu: (b: boolean) => void, schwebt: (b: boolean) => void) => (
    <button type="button" class="heftzwecke" classList={{ geloest: zu() }} aria-pressed={!zu()} aria-label={zu() ? 'Anheften' : 'Lösen – blendet sich aus'} title={zu() ? 'Anheften' : 'Lösen – blendet sich aus und erscheint, wenn die Maus an den Rand kommt'}
      onClick={(e) => { e.stopPropagation(); setZu(!zu()); schwebt(false); }}><Zeichen name={zu() ? 'loesen' : 'anheften'} groesse={HEFT_GROESSE} /></button>
  );
  p.steuer?.({ detailsZeigen: () => { if (rechtsZu()) setRechtsSchwebt(true); }, detailsZuklappen: () => { setRechtsZu(true); setRechtsSchwebt(false); }, heftzweckeRechts: () => heftzwecke(rechtsZu, setRechtsZu, setRechtsSchwebt) });
  const linksInhalt = () => (<>
    <div class="platz-kopf nur-breit-flex"><span>{p.baumTitel ?? ''}</span>{heftzwecke(linksZu, setLinksZu, setLinksSchwebt)}</div>
    {p.linksOben?.()}
    <div class="platz-rollen">
      <Show when={p.baumZuerst}>{p.baum}</Show>
      <Show when={ansichten().length > 1}><Ansichtsliste reiter={ansichten()} aktiv={app!.aktiv()} onWahl={app!.onReiter} /></Show>
      <Show when={!p.baumZuerst}>{p.baum}</Show>
    </div>
  </>);
  const rechtsInhalt = () => p.details ?? (
    <Kartenrahmen klasse="karte-hinweis" label="Details" titel="Details" heftzwecke={heftzwecke(rechtsZu, setRechtsZu, setRechtsSchwebt)}>
      <p class="still-text">{p.detailsHinweis}</p>
    </Kartenrahmen>);
  // Kopf und Menüband: Stufe je App (erster Teil des Schlüssels)
  const obenMerk = () => `bp.oben.${p.schluessel.split('.')[0]}`;
  const [oben, setOben] = createSignal(0);
  createEffect(() => { let s = 0; try { s = Math.min(2, Math.max(0, Number(localStorage.getItem(obenMerk())) || 0)); } catch { /* gesperrt */ } setOben(s); obenSetzen(s); obenBeobachten(); });
  onCleanup(() => obenSetzen(0));
  const obenWeiter = () => { const s = (oben() + 1) % 3; setOben(s); obenSetzen(s); try { localStorage.setItem(obenMerk(), String(s)); } catch { /* gesperrt */ } };
  return (
    <div class="rahmen">
      {p.kopf}
      <Show when={p.abfolge}>{(a) => <Abfolgeleiste schritte={a().schritte} aktiv={a().aktiv} hier={a().hier} onWahl={a().onWahl} />}</Show>
      <Menueleiste rueckgaengig={nurAnsehen() ? undefined : app?.rueckgaengig} reiter={app?.reiter()} aktiv={app?.aktiv()} onReiter={app?.onReiter} knoepfe={knoepfe()}
        ende={<button type="button" class="heftzwecke oben-heftzwecke nur-breit-flex" classList={{ geloest: oben() !== 0 }} aria-label={OBEN_TEXT[oben()]} title={OBEN_TEXT[oben()]} onClick={obenWeiter}>
          <Zeichen name={oben() === 0 ? 'anheften' : 'loesen'} groesse={HEFT_GROESSE} />
        </button>} mitteTitel={p.menueMitteTitel}>{p.menueMitte}</Menueleiste>
      <Show when={nurAnsehen()}><p class="handy-hinweis" role="note">Am Handy nur zum Ansehen – bearbeiten am Rechner.</p></Show>
      {p.unterMenue}
      <div class="plaetze" classList={{ 'mit-details': !!p.details && !rechtsWeg(), 'baum-offen': baumAmHandy() }}
        style={{ '--links-breite': `${linksBreite()}px`, '--rechts-breite': `${rechtsBreite()}px` }}>
        <Show when={p.baum || p.linksOben || ansichten().length > 1}>
          <Show when={!linksZu() || baumAmHandy()} fallback={<button class="reiter links" title="Einblenden" onMouseEnter={() => setLinksSchwebt(true)} onClick={() => setLinksSchwebt(true)}><span>{linksTitel()}</span></button>}>
            <aside class="platz-links" aria-label={p.baumTitel ?? 'Gliederung'} onClick={() => setBaumAmHandy(false)}>{linksInhalt()}</aside>
            <Griff titel={`Breite ${p.baumTitel ?? 'Gliederung'}`} wert={linksBreite()} min={160} max={520} werk={LINKS} richtung={1} onWert={setLinksBreite} onFertig={(w) => breiteMerken('links', w)} />
          </Show>
          <Show when={linksZu() && linksSchwebt() && !schmal()}>
            <aside class="platz-links schwebend" aria-label={p.baumTitel ?? 'Gliederung'} onMouseLeave={() => setLinksSchwebt(false)}>{linksInhalt()}</aside>
          </Show>
        </Show>
        <section class="platz-mitte">{p.inhalt}</section>
        <Show when={p.details || (p.detailsHinweis && !schmal())}>
          <Show when={!rechtsWeg()} fallback={<button class="reiter" title="Einblenden" onMouseEnter={() => setRechtsSchwebt(true)} onClick={() => setRechtsSchwebt(true)}><span>{p.detailsTitel ?? 'Details'}</span></button>}>
            <Griff titel="Breite der Details" wert={rechtsBreite()} min={280} max={800} werk={RECHTS} richtung={-1} onWert={setRechtsBreite} onFertig={(w) => breiteMerken('rechts', w)} />
            <div class="platz-rechts">{rechtsInhalt()}</div>
          </Show>
          <Show when={rechtsWeg() && rechtsSchwebt()}>
            <div class="platz-rechts schwebend" onMouseLeave={() => setRechtsSchwebt(false)}>{rechtsInhalt()}</div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
