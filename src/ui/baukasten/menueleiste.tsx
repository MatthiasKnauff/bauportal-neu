// Baustein „Menüleiste“: ein Band wie im bisherigen Bauportal – Knöpfe mit Symbol über dem Text, in Gruppen mit kleiner
// Überschrift. Ganz links immer RÜCKGÄNGIG, in der Mitte die Suche der Ansicht (FINDEN), rechts Ausgabe und Teilen.
// Für jede App gleich aufgebaut. Am Handy: nur Symbole, darunter die Ansichten als Reiter (links ist dort kein Platz).
import { For, Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { Zeichen, istZeichen } from './zeichen';

export interface Reiter { id: string; titel: string; abschnitt?: string; zeichen?: string; abgesetzt?: boolean }
export interface Rueckgaengig { zurueck: () => boolean; vor: () => boolean; onZurueck: () => void; onVor: () => void }
export interface Knopf {
  titel: string; tun: (e: MouseEvent) => void;   // das Ereignis z. B. für ein Menü am Knopf
  zeichen?: string;            // Symbol (Baustein Zeichen)
  gruppe?: string;             // Überschrift der Gruppe, z. B. „Neu“, „Ansicht“, „Ausgabe“
  rechts?: boolean;            // hinter der Suche (Ausgabe, Teilen)
  haupt?: boolean; gesperrt?: boolean; an?: boolean;   // an = eingeschaltet (z. B. Kacheln statt Tabelle)
  handyPlus?: boolean;         // am Handy das ＋ unten in der Leiste (sonst der Hauptknopf)
  nurHandy?: boolean;          // nur am Handy (dort ohnehin unten als ＋) – nicht in der Menüleiste
}

/** Knöpfe zu Gruppen zusammenfassen – aufeinanderfolgende mit derselben Überschrift bilden eine Gruppe. */
function gruppen(k: Knopf[]): { titel: string; knoepfe: Knopf[] }[] {
  const aus: { titel: string; knoepfe: Knopf[] }[] = [];
  for (const x of k) { const t = x.gruppe ?? ''; const l = aus[aus.length - 1]; if (l && l.titel === t) l.knoepfe.push(x); else aus.push({ titel: t, knoepfe: [x] }); }
  return aus;
}

function Bandknopf(p: { k: Knopf }) {
  return (
    <button type="button" class="band-knopf" classList={{ haupt: p.k.haupt, an: p.k.an }} disabled={p.k.gesperrt} aria-label={p.k.titel} aria-pressed={p.k.an === undefined ? undefined : p.k.an}
      title={p.k.titel} onClick={(e) => p.k.tun(e)}>
      <Show when={p.k.zeichen && istZeichen(p.k.zeichen)} fallback={<span class="band-zeichen-text">{p.k.zeichen ?? ''}</span>}><Zeichen name={p.k.zeichen as never} groesse={20} /></Show>
      <span class="band-text">{p.k.titel}</span>
    </button>
  );
}
function Gruppe(p: { titel: string; children: JSX.Element; class?: string }) {
  return <div class={`band-gruppe ${p.class ?? ''}`} role="group" aria-label={p.titel || undefined}><div class="band-inhalt">{p.children}</div><Show when={p.titel}><div class="band-titel">{p.titel}</div></Show></div>;
}

export function Menueleiste(p: { rueckgaengig?: Rueckgaengig; reiter?: Reiter[]; aktiv?: string; onReiter?: (id: string) => void; knoepfe?: Knopf[]; children?: JSX.Element; ende?: JSX.Element }) {   // ende: ganz rechts (Heftzwecke)
  const links = () => (p.knoepfe ?? []).filter((k) => !k.rechts), rechts = () => (p.knoepfe ?? []).filter((k) => k.rechts);
  // Reicht der Platz nicht: erst nur Symbole (Text bleibt als Hinweis), dann eine zweite Zeile – nie waagerecht rollen.
  // Gemerkt wird, wie breit die Leiste in der größeren Form war; erst wenn wieder so viel Platz ist, kehrt sie zurück.
  const [stufe, setStufe] = createSignal(0);
  const bedarf: number[] = [];
  let leiste!: HTMLDivElement;
  const pruefen = () => {
    const frei = leiste.clientWidth;
    if (stufe() < 2 && leiste.scrollWidth > frei + 1) { bedarf[stufe()] = leiste.scrollWidth; setStufe(stufe() + 1); queueMicrotask(pruefen); }
    else if (stufe() > 0 && frei >= (bedarf[stufe() - 1] ?? Infinity)) { setStufe(stufe() - 1); queueMicrotask(pruefen); }
  };
  onMount(() => { const ro = new ResizeObserver(pruefen); ro.observe(leiste); const mo = new MutationObserver(() => requestAnimationFrame(pruefen)); mo.observe(leiste, { childList: true, subtree: true }); onCleanup(() => { ro.disconnect(); mo.disconnect(); }); });
  return (
    <div class="menueleiste" ref={leiste} classList={{ 'band-kompakt': stufe() >= 1, 'band-umbruch': stufe() >= 2 }} role="toolbar" aria-label="Menüleiste">
      <Show when={p.rueckgaengig}>{(r) => (
        <Gruppe titel="Rückgängig" class="band-verlauf">
          <Bandknopf k={{ titel: 'Zurück', zeichen: 'zurueck', gesperrt: !r().zurueck(), tun: r().onZurueck }} />
          <Bandknopf k={{ titel: 'Wieder', zeichen: 'wieder', gesperrt: !r().vor(), tun: r().onVor }} />
        </Gruppe>
      )}</Show>
      <For each={gruppen(links())}>{(g) => <Gruppe titel={g.titel}><For each={g.knoepfe}>{(k) => <Bandknopf k={k} />}</For></Gruppe>}</For>
      <Show when={p.children}><Gruppe titel="Finden" class="band-mitte"><div class="menue-mitte">{p.children}</div></Gruppe></Show>
      <For each={gruppen(rechts())}>{(g) => <Gruppe titel={g.titel}><For each={g.knoepfe}>{(k) => <Bandknopf k={k} />}</For></Gruppe>}</For>
      <Show when={(p.reiter?.length ?? 0) > 1}>
        <div class="menue-reiter nur-schmal-flex" role="tablist" aria-label="Ansichten">
          <For each={p.reiter}>{(r) => <button role="tab" aria-selected={p.aktiv === r.id} classList={{ aktiv: p.aktiv === r.id }} onClick={() => p.onReiter?.(r.id)}>{r.titel}</button>}</For>
        </div>
      </Show>
      {p.ende}
    </div>
  );
}
