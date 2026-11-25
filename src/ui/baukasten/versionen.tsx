// Baustein „Versionen“: die benannten Versionen eines Bereichs (z. B. Bauzeitenplan) – für jedes Modul gleich.
// Wie im bisherigen Bauportal oben in der Gliederung links: „Version: Startversion ★ ▾“ – aufklappen zum Wechseln und Verwalten.
// Zwischen Versionen wechselt man wie zwischen Dateien; genau eine ist die gültige (★).
// Die Dialoge hängen nicht an der Auswahl: „Neue Version“ geht auch, wenn die Gliederung ausgeblendet ist (leere Seite).
// Neue Version auf den Wegen, die das Modul erlaubt: aus der aktuellen, leer, aus einem anderen Projekt.
import { For, Show, createSignal, onCleanup, type JSX } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import type { Versionsweg } from '../../kern/modul';
import { Auswahlliste, type Option } from './auswahlliste';
import { Dialog } from './dialog';
import { zeigeMenue } from './kontextmenue';

const WEGE: Record<Versionsweg, string> = { kopie: 'Aus der aktuellen Version', leer: 'Leer', projekt: 'Aus einem anderen Projekt' };

export interface VersionenEinstellung {
  titel: string;
  versionen: Zeile[]; aktiv: string | null; onWahl: (id: string) => void;
  wege: Versionsweg[]; darfAendern: boolean;
  vorlagen: () => Option[];                                    // Versionen anderer Projekte
  onNeu: (weg: Versionsweg, name: string, vorlage?: string) => void;
  onGueltig: (id: string) => void; onUmbenennen: (id: string, name: string) => void; onLoeschen: (id: string) => void;
}

/** Liefert die Auswahl (für links oben) und die Dialoge (einmal einhängen) – beide teilen denselben Zustand. */
export function versionenBauen(p: VersionenEinstellung): { Wahl: () => JSX.Element; Dialoge: () => JSX.Element; oeffneNeu: () => void } {
  const [neu, setNeu] = createSignal(false);
  const [umbenennen, setUmbenennen] = createSignal<Zeile | null>(null);
  const [name, setName] = createSignal('');
  const [weg, setWeg] = createSignal<Versionsweg>('leer');
  const [vorlage, setVorlage] = createSignal<string | null>(null);
  const [fehler, setFehler] = createSignal('');
  // „Aus der aktuellen“ geht nur, wenn es eine gibt; „aus anderem Projekt“ nur, wenn es Vorlagen gibt.
  const moeglich = () => p.wege.filter((w) => (w === 'kopie' ? !!p.aktiv : w === 'projekt' ? p.vorlagen().length > 0 : true));
  const oeffneNeu = () => { setName(''); setFehler(''); setVorlage(null); setWeg(moeglich()[0] ?? 'leer'); setNeu(true); };
  const anlegen = () => {
    if (!name().trim()) { setFehler('Bitte einen Namen eintragen, z. B. „Startversion“ oder „nach Bauherrengespräch“'); return; }
    if (weg() === 'projekt' && !vorlage()) { setFehler('Bitte die Vorlage wählen'); return; }
    p.onNeu(weg(), name().trim(), vorlage() ?? undefined);
    setNeu(false);
  };
  const menue = (e: MouseEvent, v: Zeile) => {
    if (!p.darfAendern) return;
    zeigeMenue(e, [
      { titel: 'Als gültig markieren', gesperrt: v.werte.gueltig === true, tun: () => p.onGueltig(v.id) },
      { titel: 'Umbenennen …', tun: () => { setName(String(v.werte.name)); setFehler(''); setUmbenennen(v); } },
      { titel: 'Löschen', gefahr: true, gesperrt: v.werte.gueltig === true, tun: () => p.onLoeschen(v.id) },
    ]);
  };
  const aktiv = () => p.versionen.find((v) => v.id === p.aktiv);
  const Wahl = () => {
    const [offen, setOffen] = createSignal(false);
    let wurzel!: HTMLDivElement;
    const draussen = (e: MouseEvent) => { if (!wurzel.contains(e.target as Node)) zu(); };
    const auf = () => { setOffen(true); document.addEventListener('mousedown', draussen); };
    const zu = () => { setOffen(false); document.removeEventListener('mousedown', draussen); };
    onCleanup(() => document.removeEventListener('mousedown', draussen));
    const tun = (f: () => void) => () => { zu(); f(); };
    return (
      <div class="versionswahl" ref={wurzel} onKeyDown={(e) => { if (e.key === 'Escape' && offen()) { e.stopPropagation(); zu(); } }}>
        <button type="button" class="versionswahl-knopf" aria-haspopup="menu" aria-expanded={offen()} aria-label={`Versionen ${p.titel}: ${aktiv() ? String(aktiv()!.werte.name) : 'keine'}`}
          onClick={() => (offen() ? zu() : auf())} onContextMenu={(e) => { const v = aktiv(); if (v) { e.preventDefault(); menue(e, v); } }}>
          <span class="versions-zahl" title={`${p.versionen.length} ${p.versionen.length === 1 ? 'Version' : 'Versionen'}`}>{p.versionen.length}</span>
          <span class="versions-name">Version: <b>{aktiv() ? String(aktiv()!.werte.name) : '–'}</b></span>
          <Show when={aktiv()?.werte.gueltig}><span class="stern" aria-label="gültig">★</span></Show>
          <i>▾</i>
        </button>
        <Show when={offen()}>
          <div class="auswahlliste-fenster versionswahl-fenster" role="menu" aria-label={`Versionen ${p.titel}`}>
            <For each={p.versionen}>{(v) => (
              <button type="button" role="menuitemradio" aria-checked={p.aktiv === v.id} classList={{ gewaehlt: p.aktiv === v.id }}
                title={p.darfAendern ? 'Rechtsklick: gültig markieren, umbenennen, löschen' : undefined}
                onClick={tun(() => p.onWahl(v.id))} onContextMenu={(e) => { e.preventDefault(); menue(e, v); }}>
                <span>{String(v.werte.name)}</span><Show when={v.werte.gueltig}><span class="stern" aria-label="gültig">★</span></Show>
              </button>
            )}</For>
            <Show when={p.darfAendern}>
              <hr />
              <button type="button" role="menuitem" onClick={tun(oeffneNeu)}>＋ Neue Version …</button>
              <Show when={aktiv()}>{(v) => <>
                <button type="button" role="menuitem" onClick={tun(() => { setName(String(v().werte.name)); setFehler(''); setUmbenennen(v()); })}>Umbenennen …</button>
                <button type="button" role="menuitem" disabled={v().werte.gueltig === true} onClick={tun(() => p.onGueltig(v().id))}>Als gültig markieren</button>
                <button type="button" role="menuitem" class="gefahr-text" disabled={v().werte.gueltig === true} onClick={tun(() => p.onLoeschen(v().id))}>Löschen</button>
              </>}</Show>
            </Show>
          </div>
        </Show>
      </div>
    );
  };
  const Dialoge = () => (
    <>
      <Show when={neu()}>
        <Dialog titel={`Neue Version – ${p.titel}`} onAbbrechen={() => setNeu(false)}
          knoepfe={<><button class="knopf" onClick={() => setNeu(false)}>Abbrechen</button><button class="knopf haupt" onClick={anlegen}>Anlegen</button></>}>
          <form class="formular" onSubmit={(e) => { e.preventDefault(); anlegen(); }}>
            <div class="feld"><label for="v-name">Name der Version</label><input id="v-name" value={name()} onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" /></div>
            <div class="feld">
              <label>Inhalt</label>
              <div class="auswahl senkrecht" role="radiogroup" aria-label="Inhalt der neuen Version">
                <For each={moeglich()}>{(w) => <button type="button" role="radio" aria-checked={weg() === w} classList={{ aktiv: weg() === w }} onClick={() => setWeg(w)}>{WEGE[w]}</button>}</For>
              </div>
            </div>
            <Show when={weg() === 'projekt'}>
              <div class="feld"><label>Vorlage</label><Auswahlliste titel="Vorlage" platzhalter="Projekt und Version wählen …" optionen={p.vorlagen()} wert={vorlage()} onWert={setVorlage} />
                <div class="still-text klein-text">Die Inhalte kommen mit. Verknüpfungen zum Gebäudemodell des anderen Projekts kommen nicht mit.</div></div>
            </Show>
            <Show when={fehler()}><div class="feld-fehler" role="alert">{fehler()}</div></Show>
            <button type="submit" hidden />
          </form>
        </Dialog>
      </Show>
      <Show when={umbenennen()}>{(v) => {
        const ok = () => { if (!name().trim()) { setFehler('Bitte einen Namen eintragen'); return; } p.onUmbenennen(v().id, name().trim()); setUmbenennen(null); };
        return (
          <Dialog titel="Version umbenennen" onAbbrechen={() => setUmbenennen(null)}
            knoepfe={<><button class="knopf" onClick={() => setUmbenennen(null)}>Abbrechen</button><button class="knopf haupt" onClick={ok}>OK</button></>}>
            <form class="formular" onSubmit={(e) => { e.preventDefault(); ok(); }}>
              <div class="feld"><label for="v-um">Name der Version</label><input id="v-um" value={name()} onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" /></div>
              <Show when={fehler()}><div class="feld-fehler" role="alert">{fehler()}</div></Show>
              <button type="submit" hidden />
            </form>
          </Dialog>
        );
      }}</Show>
    </>
  );
  return { Wahl, Dialoge, oeffneNeu };
}
