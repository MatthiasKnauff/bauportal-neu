// Baustein „Seitenliste“: links in Abschnitten eine Liste mit farbigem Symbol, Name und Anzahl – wie im bisherigen
// Bauportal. Dieselbe Liste zeigt die Ansichten einer App und die Filter einer Ansicht (z. B. Kontakte nach Art, Gewerke).
// Abschnitte mit vielen Einträgen bekommen ein eigenes Suchfeld.
import { For, Show, createSignal, type JSX } from 'solid-js';
import { Zeichen, istZeichen } from './zeichen';
import { Auswahlliste } from './auswahlliste';

export interface SeitenEintrag { id: string; titel: string; zeichen?: string; anzahl?: number; nach?: JSX.Element }   // nach: steht unter dem Eintrag (z. B. eine Einstellung)
export interface SeitenAbschnitt { titel: string; eintraege: SeitenEintrag[]; suche?: boolean; abgesetzt?: boolean; schluessel?: string; zu?: boolean }   // zu: als Filter nur ein Knopf je Feld (Sammelfilter), sonst offen   // abgesetzt: farbig abgesetzt (z. B. „Für mich“); schluessel: zum Merken, wenn der Titel wechselt

const FARBEN = ['#e8f0fd', '#e6f4ea', '#f1ebfa', '#fdf0e2', '#fde8e8', '#e7f6f6', '#fbf3dc'];

// aktiv: die eine gewählte Kennung – oder bei Filtern eine Prüfung, denn dort können mehrere gewählt sein (nicht: ausgeschlossen)
// klappbar: wie im bisherigen Bauportal lässt sich jeder Abschnitt an der Überschrift einklappen – zu bleibt nur der gewählte Eintrag
// sichtbar; gemerkt je Browser.
const ZU = 'bp.navzu';
const [zu, setZu] = createSignal<Set<string>>((() => { try { return new Set<string>(JSON.parse(localStorage.getItem(ZU) ?? '[]')); } catch { return new Set<string>(); } })());
const zuSchalten = (k: string) => { const s = new Set(zu()); if (s.has(k)) s.delete(k); else s.add(k); setZu(s); try { localStorage.setItem(ZU, JSON.stringify([...s])); } catch { /* gilt bis zum Neuladen */ } };

export function Seitenliste(p: { abschnitte: SeitenAbschnitt[]; aktiv: string | ((id: string) => boolean); nicht?: (id: string) => boolean; onWahl: (id: string) => void; name: string; art?: 'ansichten' | 'filter'; klappbar?: boolean }) {
  const an = (id: string) => (typeof p.aktiv === 'function' ? p.aktiv(id) : id === p.aktiv);
  let nr = 0;
  const farbe = new Map<string, string>();
  const farbeVon = (id: string) => farbe.get(id) ?? (farbe.set(id, FARBEN[nr++ % FARBEN.length]!), farbe.get(id)!);
  // Filter links (Entscheidung B, 26.11.2026): oben „Filter hinzufügen“ und die Kästen (in der Ansicht), hier die fest eingestellten
  // Filter offen (z. B. Kontakte nach Art) und darunter je weiteres Feld ein Knopf; der Knopf öffnet die Werte des Feldes als
  // Auswahlliste mit ihrer Anzahl. Einträge ohne Treffer fallen weg; ein Eintrag mit Zusatz (Beteiligte des Projekts) steht als Kasten.
  if (p.art === 'filter') {
    const gewaehlt = (e: SeitenEintrag) => an(e.id) || !!p.nicht?.(e.id);
    const rest = (a: SeitenAbschnitt) => a.eintraege.filter((e) => !e.nach && (e.anzahl !== 0 || gewaehlt(e)));
    const werte = (a: SeitenAbschnitt) => rest(a).filter((e) => !e.id.endsWith(':*'));
    const feste = () => p.abschnitte.filter((a) => !a.zu || a.eintraege.some((e) => e.nach));
    const knoepfe = () => p.abschnitte.filter((a) => a.zu && !a.eintraege.some((e) => e.nach) && werte(a).length);
    return (
      <nav class="ansichten-nav seitenliste-filter seitenliste-chips" aria-label={p.name}>
        <For each={feste()}>{(a) => {
          const [alle, setAlle] = createSignal(false);
          const HAEUFIG = 5;
          const lang = () => rest(a).length > HAEUFIG + 1;
          const gezeigt = () => {
            if (!lang() || alle()) return rest(a);
            const vorn = rest(a).filter((e) => e.id.endsWith(':*'));
            const oft = werte(a).sort((x, y) => (y.anzahl ?? 0) - (x.anzahl ?? 0)).slice(0, HAEUFIG);
            return [...vorn, ...oft, ...rest(a).filter((e) => gewaehlt(e) && !oft.includes(e) && !vorn.includes(e))];
          };
          return (
            <div class="filter-abschnitt offen">
              <Show when={a.titel}><h3>{a.titel}</h3></Show>
              <For each={a.eintraege.filter((e) => e.nach)}>{(e) => (
                <div class="chip-kasten" classList={{ aktiv: an(e.id) }}>
                  <button type="button" aria-pressed={an(e.id)} onClick={() => p.onWahl(e.id)}><span>{e.titel}</span><span class="seitenliste-anzahl">{e.anzahl}</span></button>
                  {e.nach}
                </div>
              )}</For>
              <Show when={gezeigt().length}>
                <div class="chips">
                  <For each={gezeigt()}>{(e) => (
                    <button type="button" class="chip" aria-pressed={gewaehlt(e)} classList={{ aktiv: an(e.id), nicht: !!p.nicht?.(e.id) }} onClick={() => p.onWahl(e.id)}>
                      {e.titel}<Show when={e.anzahl !== undefined}> <span class="chip-anzahl">{e.anzahl}</span></Show>
                    </button>
                  )}</For>
                  <Show when={lang()}><button type="button" class="chip still" onClick={() => setAlle(!alle())}>{alle() ? 'weniger' : `alle ${werte(a).length} zeigen …`}</button></Show>
                </div>
              </Show>
            </div>
          );
        }}</For>
        <Show when={knoepfe().length}>
          <div class="filter-felder">
            <Show when={feste().length}><span class="filter-felder-titel">nach Feld:</span></Show>
            <For each={knoepfe()}>{(a) => {
              const n = () => werte(a).filter(gewaehlt).length;
              return (
                <div class="filter-feld">
                  <Auswahlliste titel={a.titel} aussehen="chip" aktiv={n() > 0} wert={null} platzhalter={n() ? `${a.titel} · ${n()}` : a.titel} gewaehlt={(id) => gewaehlt({ id, titel: '' })}
                    optionen={werte(a).map((e) => ({ wert: e.id, titel: e.titel, anzahl: e.anzahl }))} onWert={p.onWahl} />
                </div>
              );
            }}</For>
          </div>
        </Show>
      </nav>
    );
  }
  return (
    <nav class="ansichten-nav" aria-label={p.name} role="tablist" aria-orientation="vertical">
      <For each={p.abschnitte}>{(a) => {
        const [such, setSuch] = createSignal('');
        const k = `${p.name}|${a.schluessel ?? a.titel}`;
        const klapp = () => !!p.klappbar && !!a.titel && p.abschnitte.length > 1;
        const istZu = () => klapp() && zu().has(k);
        const sichtbar = () => { const t = such().trim().toLowerCase(); const l = t ? a.eintraege.filter((e) => e.titel.toLowerCase().includes(t)) : a.eintraege; return istZu() ? l.filter((e) => an(e.id)) : l; };
        return (<div class="seitenliste-abschnitt" classList={{ abgesetzt: !!a.abgesetzt, zu: istZu() }}>
          <Show when={a.titel}>
            <Show when={klapp()} fallback={<h3>{a.titel}</h3>}>
              <h3><button type="button" class="abschnitt-kopf" aria-expanded={!istZu()} title={istZu() ? 'Aufklappen' : 'Einklappen – der gewählte Eintrag bleibt sichtbar'} onClick={() => zuSchalten(k)}>
                <span>{a.titel}</span><i aria-hidden="true">{istZu() ? '▸' : '▾'}</i></button></h3>
            </Show>
          </Show>
          <Show when={a.suche}><input class="seitenliste-suche" type="search" placeholder={`${a.titel} suchen (${a.eintraege.length})`} aria-label={`${a.titel} suchen`} value={such()} onInput={(e) => setSuch(e.currentTarget.value)} /></Show>
          <For each={sichtbar()}>{(e) => (<>
            <button type="button" role="tab" aria-selected={an(e.id)} classList={{ aktiv: an(e.id) }} onClick={(ev) => { ev.stopPropagation(); p.onWahl(e.id); }}>
              <span class="ansichten-zeichen" style={{ background: farbeVon(e.zeichen ?? e.id) }}>{e.zeichen && istZeichen(e.zeichen) ? <Zeichen name={e.zeichen} groesse={17} /> : e.titel.slice(0, 1)}</span>
              <span class="seitenliste-titel">{e.titel}</span>
              <Show when={e.anzahl !== undefined}><span class="seitenliste-anzahl">{e.anzahl}</span></Show>
            </button>
            <Show when={e.nach}><div class="seitenliste-nach">{e.nach}</div></Show>
          </>)}</For>
        </div>);
      }}</For>
    </nav>
  );
}
