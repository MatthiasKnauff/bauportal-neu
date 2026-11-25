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
  // Filter links (Entscheidung C): Chips statt langer Listen – je Abschnitt die gewählten und die häufigsten, der Rest über „alle …“
  // bzw. „Filter hinzufügen“; Einträge ohne Treffer fallen weg; ein Eintrag mit Zusatz (Beteiligte des Projekts) steht als Kasten.
  if (p.art === 'filter') return (
    <nav class="ansichten-nav seitenliste-filter seitenliste-chips" aria-label={p.name}>
      <For each={p.abschnitte}>{(a) => {
        const [alle, setAlle] = createSignal(false);
        const HAEUFIG = 7;
        const kasten = () => a.eintraege.filter((e) => e.nach);
        const rest = () => a.eintraege.filter((e) => !e.nach && (e.anzahl !== 0 || an(e.id) || !!p.nicht?.(e.id)));
        const lang = () => rest().length > HAEUFIG + 1;
        const gezeigt = () => {
          if (!lang() || alle()) return rest();
          const vorn = rest().filter((e) => e.id.endsWith(':*'));
          const oft = rest().filter((e) => !e.id.endsWith(':*')).sort((x, y) => (y.anzahl ?? 0) - (x.anzahl ?? 0)).slice(0, HAEUFIG);
          const gewaehlt = rest().filter((e) => (an(e.id) || !!p.nicht?.(e.id)) && !oft.includes(e) && !vorn.includes(e));
          return [...vorn, ...oft, ...gewaehlt];
        };
        return (
          <Show when={kasten().length || rest().length}>
            <Show when={a.titel}><h3>{lang() && !alle() ? `Häufige ${a.titel}` : a.titel}</h3></Show>
            <For each={kasten()}>{(e) => (
              <div class="chip-kasten" classList={{ aktiv: an(e.id) }}>
                <button type="button" aria-pressed={an(e.id)} onClick={() => p.onWahl(e.id)}><span>{e.titel}</span><span class="seitenliste-anzahl">{e.anzahl}</span></button>
                {e.nach}
              </div>
            )}</For>
            <div class="chips">
              <For each={gezeigt()}>{(e) => (
                <button type="button" class="chip" aria-pressed={an(e.id) || !!p.nicht?.(e.id)} classList={{ aktiv: an(e.id), nicht: !!p.nicht?.(e.id) }} onClick={() => p.onWahl(e.id)}>
                  {e.titel}<Show when={e.anzahl !== undefined}> <span class="chip-anzahl">{e.anzahl}</span></Show>
                </button>
              )}</For>
              <Show when={lang()}><button type="button" class="chip still" onClick={() => setAlle(!alle())}>{alle() ? 'weniger' : `alle ${rest().length} …`}</button></Show>
            </div>
          </Show>
        );
      }}</For>
    </nav>
  );
  return (
    <nav class="ansichten-nav" aria-label={p.name} role="tablist" aria-orientation="vertical">
      <For each={p.abschnitte}>{(a) => {
        const [such, setSuch] = createSignal('');
        const sichtbar = () => { const t = such().trim().toLowerCase(); return t ? a.eintraege.filter((e) => e.titel.toLowerCase().includes(t)) : a.eintraege; };
        return (<>
          <Show when={a.titel}><h3>{a.titel}</h3></Show>
          <Show when={a.suche}><input class="seitenliste-suche" type="search" placeholder={`${a.titel} suchen (${a.eintraege.length})`} aria-label={`${a.titel} suchen`} value={such()} onInput={(e) => setSuch(e.currentTarget.value)} /></Show>
          <For each={sichtbar()}>{(e) => (<>
            <button type="button" role="tab" aria-selected={an(e.id)} classList={{ aktiv: an(e.id) }} onClick={(ev) => { ev.stopPropagation(); p.onWahl(e.id); }}>
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
