// Baustein „Seitenliste“: links in Abschnitten eine Liste mit farbigem Symbol, Name und Anzahl – wie im bisherigen
// Bauportal. Dieselbe Liste zeigt die Ansichten einer App und die Filter einer Ansicht (z. B. Kontakte nach Art, Gewerke).
// Abschnitte mit vielen Einträgen bekommen ein eigenes Suchfeld.
import { For, Show, createSignal, type JSX } from 'solid-js';
import { Zeichen, istZeichen } from './zeichen';

export interface SeitenEintrag { id: string; titel: string; zeichen?: string; anzahl?: number; nach?: JSX.Element }   // nach: steht unter dem Eintrag (z. B. eine Einstellung)
export interface SeitenAbschnitt { titel: string; eintraege: SeitenEintrag[]; suche?: boolean }

const FARBEN = ['#e8f0fd', '#e6f4ea', '#f1ebfa', '#fdf0e2', '#fde8e8', '#e7f6f6', '#fbf3dc'];

// aktiv: die eine gewählte Kennung – oder bei Filtern eine Prüfung, denn dort können mehrere gewählt sein (nicht: ausgeschlossen)
export function Seitenliste(p: { abschnitte: SeitenAbschnitt[]; aktiv: string | ((id: string) => boolean); nicht?: (id: string) => boolean; onWahl: (id: string) => void; name: string; art?: 'ansichten' | 'filter' }) {
  const an = (id: string) => (typeof p.aktiv === 'function' ? p.aktiv(id) : id === p.aktiv);
  let nr = 0;
  const farbe = new Map<string, string>();
  const farbeVon = (id: string) => farbe.get(id) ?? (farbe.set(id, FARBEN[nr++ % FARBEN.length]!), farbe.get(id)!);
  return (
    <nav class="ansichten-nav" classList={{ 'seitenliste-filter': p.art === 'filter' }} aria-label={p.name} role={p.art === 'filter' ? undefined : 'tablist'} aria-orientation="vertical">
      <For each={p.abschnitte}>{(a) => {
        const [such, setSuch] = createSignal('');
        const sichtbar = () => { const t = such().trim().toLowerCase(); return t ? a.eintraege.filter((e) => e.titel.toLowerCase().includes(t)) : a.eintraege; };
        return (<>
          <Show when={a.titel}><h3>{a.titel}</h3></Show>
          <Show when={a.suche}><input class="seitenliste-suche" type="search" placeholder={`${a.titel} suchen (${a.eintraege.length})`} aria-label={`${a.titel} suchen`} value={such()} onInput={(e) => setSuch(e.currentTarget.value)} /></Show>
          <For each={sichtbar()}>{(e) => (<>
            <button type="button" role={p.art === 'filter' ? undefined : 'tab'} aria-selected={p.art === 'filter' ? undefined : an(e.id)} aria-pressed={p.art === 'filter' ? an(e.id) || !!p.nicht?.(e.id) : undefined}
              classList={{ aktiv: an(e.id), nicht: !!p.nicht?.(e.id) }} onClick={(ev) => { if (p.art !== 'filter') ev.stopPropagation(); p.onWahl(e.id); }}   /* Filter: am Handy schließt die Seite danach (wie beim Baum) */>
              <span class="ansichten-zeichen" style={{ background: farbeVon(e.zeichen ?? e.id) }}>{e.zeichen && istZeichen(e.zeichen) ? <Zeichen name={e.zeichen} groesse={17} /> : e.titel.slice(0, 1)}</span>
              <span class="seitenliste-titel">{e.titel}</span>
              <Show when={e.anzahl !== undefined}><span class="seitenliste-anzahl">{e.anzahl}</span></Show>
            </button>
            <Show when={e.nach}><div class="seitenliste-nach">{e.nach}</div></Show>
          </>)}</For>
        </>);
      }}</For>
    </nav>
  );
}
