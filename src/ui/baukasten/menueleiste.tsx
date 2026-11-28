// Baustein „Menüleiste“: ein Band wie im bisherigen Bauportal – Knöpfe mit Symbol über dem Text, in Gruppen mit kleiner
// Überschrift. Ganz links immer RÜCKGÄNGIG, in der Mitte die Suche der Ansicht (FINDEN), rechts Ausgabe und Teilen.
// Für jede App gleich aufgebaut. Am Handy: nur Symbole, darunter die Ansichten als Reiter (links ist dort kein Platz).
import { HOECHSTENS, zeigeMenue } from './kontextmenue';
import { For, Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { Zeichen, istZeichen } from './zeichen';

export interface Reiter { id: string; titel: string; abschnitt?: string; zeichen?: string; abgesetzt?: boolean }
export interface Rueckgaengig { zurueck: () => boolean; vor: () => boolean; onZurueck: () => void; onVor: () => void;
  /** wie bisher „▾ n“: so viele Schritte gibt es zurück, die letzten (neueste zuerst) und bis zu welchem zurück */
  zahl?: () => number; letzte?: (n: number) => string[]; onBis?: (n: number) => void;
  aeltere?: () => void }   // „Ältere Stände …“ am Ende der Liste (Verlauf aller Einträge der Ansicht)
export interface Knopf {
  titel: string; tun: (e: MouseEvent) => void;   // das Ereignis z. B. für ein Menü am Knopf
  zeichen?: string;            // Symbol (Baustein Zeichen)
  gruppe?: string;             // Überschrift der Gruppe, z. B. „Neu“, „Ansicht“, „Ausgabe“
  rechts?: boolean;            // hinter der Suche (Ausgabe, Teilen)
  haupt?: boolean; gesperrt?: boolean; an?: boolean;   // an = eingeschaltet (z. B. Kacheln statt Tabelle)
  rot?: boolean;               // in Rot (Löschen) – wie im bisherigen Bauportal
  handyPlus?: boolean;         // am Handy das ＋ unten in der Leiste (sonst der Hauptknopf)
  nurHandy?: boolean;          // nur am Handy (dort ohnehin unten als ＋) – nicht in der Menüleiste
  inhalt?: () => JSX.Element;  // statt eines Knopfs ein eigenes Element in der Gruppe (z. B. die Fortschrittsstufen im Bauzeitenplan); tun bleibt dann ungenutzt
}

/** Knöpfe zu Gruppen zusammenfassen – alle mit derselben Überschrift bilden eine Gruppe, an der Stelle ihres ersten Knopfs
 *  (z. B. „Datei“: Import vom Modul, Excel und Drucken von der Ansicht). Ohne Überschrift nur aufeinanderfolgende. */
function gruppen(k: Knopf[]): { titel: string; knoepfe: Knopf[] }[] {
  const aus: { titel: string; knoepfe: Knopf[] }[] = [];
  for (const x of k) { const t = x.gruppe ?? ''; const g = t ? aus.find((y) => y.titel === t) : aus[aus.length - 1]?.titel === '' ? aus[aus.length - 1] : undefined; if (g) g.knoepfe.push(x); else aus.push({ titel: t, knoepfe: [x] }); }
  return aus;
}

/** In der Gruppe „Neu“ trägt jedes Symbol ein kleines ＋ (außer es ist selbst eins) – wie im bisherigen Bauportal. */
const NEU = /^Neu\b/;
function Bandknopf(p: { k: Knopf; neu?: boolean }) {
  if (p.k.inhalt) return <div class="band-eigen" title={p.k.titel}>{p.k.inhalt()}</div>;
  return (
    <button type="button" class="band-knopf" classList={{ haupt: p.k.haupt, an: p.k.an, rot: p.k.rot, 'band-neu': p.neu && p.k.zeichen !== 'neu' }} disabled={p.k.gesperrt} aria-label={p.k.titel} aria-pressed={p.k.an === undefined ? undefined : p.k.an}
      title={p.k.titel} onClick={(e) => p.k.tun(e)}>
      <Show when={p.k.zeichen && istZeichen(p.k.zeichen)} fallback={<span class="band-zeichen-text">{p.k.zeichen ?? ''}</span>}><Zeichen name={p.k.zeichen as never} groesse={20} /></Show>
      <span class="band-text">{p.k.titel}</span>
    </button>
  );
}
function Gruppe(p: { titel: string; children: JSX.Element; class?: string }) {
  return <div class={`band-gruppe ${p.class ?? ''}`} role="group" aria-label={p.titel || undefined}><div class="band-inhalt">{p.children}</div><Show when={p.titel}><div class="band-titel">{p.titel}</div></Show></div>;
}

export function Menueleiste(p: { rueckgaengig?: Rueckgaengig; reiter?: Reiter[]; aktiv?: string; onReiter?: (id: string) => void; knoepfe?: Knopf[]; children?: JSX.Element; mitteTitel?: string; ende?: JSX.Element }) {   // ende: ganz rechts (Heftzwecke); mitteTitel: Name der Mitte (ab Werk „Finden“)
  const links = () => (p.knoepfe ?? []).filter((k) => !k.rechts), rechts = () => (p.knoepfe ?? []).filter((k) => k.rechts);
  // Reicht der Platz nicht – wie im bisherigen Bauportal: erst kleiner Text unter den Symbolen, dann nur Symbole (Text als Hinweis),
  // dann wandern die hinteren Gruppen links in „»“ (aufklappen). Nie waagerecht rollen. Gemerkt wird, wie breit die Leiste in der
  // größeren Form war; erst wenn wieder so viel Platz ist, kehrt sie zurück. Stufe 3 + n: n Gruppen in „»“.
  const [stufe, setStufe] = createSignal(0);
  const [mehrAuf, setMehrAuf] = createSignal<{ x: number; y: number } | null>(null);
  const bedarf: number[] = [];
  let leiste!: HTMLDivElement;
  const linkeGruppen = () => gruppen(links().filter((k) => !k.nurHandy));
  const weg = () => Math.max(0, Math.min(stufe() - 2, linkeGruppen().length - 1));
  const hoechste = () => 2 + Math.max(0, linkeGruppen().length - 1);
  const pruefen = () => {
    const frei = leiste.clientWidth;
    if (stufe() < hoechste() && leiste.scrollWidth > frei + 1) { bedarf[stufe()] = leiste.scrollWidth; setStufe(stufe() + 1); queueMicrotask(pruefen); }
    else if (stufe() > 0 && frei >= (bedarf[stufe() - 1] ?? Infinity)) { setStufe(stufe() - 1); queueMicrotask(pruefen); }
  };
  const sichtbar = () => linkeGruppen().slice(0, linkeGruppen().length - weg()), imMehr = () => linkeGruppen().slice(linkeGruppen().length - weg());
  onMount(() => { const ro = new ResizeObserver(pruefen); ro.observe(leiste); const mo = new MutationObserver(() => requestAnimationFrame(pruefen)); mo.observe(leiste, { childList: true, subtree: true }); onCleanup(() => { ro.disconnect(); mo.disconnect(); }); });
  return (
    <div class="menueleiste" ref={leiste} classList={{ 'band-klein': stufe() === 1, 'band-kompakt': stufe() >= 2 }} role="toolbar" aria-label="Menüleiste">
      <Show when={p.rueckgaengig}>{(r) => (
        <Gruppe titel="Rückgängig" class="band-verlauf">
          <Bandknopf k={{ titel: 'Zurück', zeichen: 'zurueck', gesperrt: !r().zurueck(), tun: r().onZurueck }} />
          <Bandknopf k={{ titel: 'Wieder', zeichen: 'wieder', gesperrt: !r().vor(), tun: r().onVor }} />
          <Show when={r().letzte}>
            <button type="button" class="band-schritte" aria-label="Letzte Schritte" title="Letzte Schritte – bis zu einem zurück" disabled={!r().zahl?.() && !r().aeltere} aria-haspopup="menu"
              onClick={(e) => { const l = r().letzte!(r().aeltere ? HOECHSTENS - 1 : HOECHSTENS);
                zeigeMenue(e, [...l.map((t, i) => ({ titel: i ? `${t} (und ${i} danach)` : t, tun: () => r().onBis!(i + 1) })), ...(r().aeltere ? [{ titel: 'Ältere Stände …', tun: r().aeltere }] : [])]); }}>▾<small>{r().zahl?.() ?? 0}</small></button>
          </Show>
        </Gruppe>
      )}</Show>
      <For each={sichtbar()}>{(g) => <Gruppe titel={g.titel}><For each={g.knoepfe}>{(k) => <Bandknopf k={k} neu={NEU.test(g.titel)} />}</For></Gruppe>}</For>
      <Show when={weg() > 0}>
        <button type="button" class="band-mehr" aria-label="Weitere Befehle" title="Weitere Befehle" aria-expanded={!!mehrAuf()} aria-haspopup="true"
          onClick={(e) => { if (mehrAuf()) { setMehrAuf(null); return; } const r = e.currentTarget.getBoundingClientRect(); setMehrAuf({ x: Math.max(8, Math.min(r.left, innerWidth - 568)), y: r.bottom + 4 }); }}>»</button>
        <Show when={mehrAuf()}>{(o) => (
          <div class="band-mehr-fenster" role="group" aria-label="Weitere Befehle" style={{ left: `${o().x}px`, top: `${o().y}px` }}
            ref={(el) => { const zu = (ev: Event) => { if (!el.contains(ev.target as Node) && !(ev.target as Element).closest?.('.band-mehr')) setMehrAuf(null); }; queueMicrotask(() => document.addEventListener('pointerdown', zu)); onCleanup(() => document.removeEventListener('pointerdown', zu)); }}
            onClick={(e) => { if ((e.target as Element).closest('.band-knopf')) setMehrAuf(null); }}>
            <For each={imMehr()}>{(g) => <Gruppe titel={g.titel}><For each={g.knoepfe}>{(k) => <Bandknopf k={k} neu={NEU.test(g.titel)} />}</For></Gruppe>}</For>
          </div>
        )}</Show>
      </Show>
      <Show when={p.children}><Gruppe titel={p.mitteTitel ?? 'Finden'} class="band-mitte"><div class="menue-mitte">{p.children}</div></Gruppe></Show>
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
