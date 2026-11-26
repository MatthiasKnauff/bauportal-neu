// Projekt löschen wie im bisherigen Bauportal: „Was soll gelöscht werden?“ – je App, die in diesem Projekt Daten hat, ein
// Häkchen mit Anzahl, dazu „Das ganze Projekt“. Angekreuztes kommt in einem Schritt in den Papierkorb (gelöscht markiert,
// „Zurück“ holt alles wieder), alles andere bleibt. Versionen (Bauzeitenplan, Gebäudemodell …) gehen mit ihrer App.
// Erreichbar über „Projekt löschen“ an der Projektkarte (Verwaltung → Projekte).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage } from '../kern/befehl';
import { ausfuehrenMehrere, lebende, rueckgaengig, sicht } from './unterbau/abgleich';
import { zustand } from './unterbau/api';
import { projektId, setProjektId } from './projekt';
import { hinweis } from './unterbau/meldungen';
import { Dialog } from './baukasten/dialog';
import { eigenesLoeschen } from './baukasten/detailkarte';

const [offen, setOffen] = createSignal<string | null>(null);
export const projektLoeschenOeffnen = (projekt: string) => setOffen(projekt);
eigenesLoeschen.projekt = (z) => projektLoeschenOeffnen(z.id);

interface Teil { id: string; titel: string; befehle: Vorlage[]; text: string }

/** Was eine App in einem Projekt hat: ihre Einträge mit Projektfeld und ihre Versionen (die gültige zuletzt – sie darf als letzte gehen). */
function teileVon(pid: string): Teil[] {
  const module = zustand()?.module ?? [];
  return module.flatMap((z): Teil[] => {
    const bereiche = new Set((z.versionen ?? []).map((v) => v.bereich));
    const befehle: Vorlage[] = [], zahl: string[] = [];
    for (const m of z.objekte) {
      if (!m.projektFeld || m.projektFeld === 'id' || m.name === 'version') continue;
      const l = lebende(m.name).filter((x) => x.werte[m.projektFeld!] === pid);
      if (!l.length) continue;
      befehle.push(...l.map((x): Vorlage => ({ objekt: m.name, art: 'loeschen', objektId: x.id })));
      zahl.push(`${l.length} ${l.length === 1 ? m.titel : m.titelMehrzahl}`);
    }
    const v = lebende('version').filter((x) => x.werte.projekt === pid && bereiche.has(String(x.werte.bereich)))
      .sort((a, b) => Number(a.werte.gueltig === true) - Number(b.werte.gueltig === true));
    if (v.length) { befehle.push(...v.map((x): Vorlage => ({ objekt: 'version', art: 'loeschen', objektId: x.id }))); zahl.unshift(`${v.length} ${v.length === 1 ? 'Version' : 'Versionen'}`); }
    return befehle.length ? [{ id: z.id, titel: z.name, befehle, text: zahl.slice(0, 4).join(', ') + (zahl.length > 4 ? ' …' : '') }] : [];
  });
}

function Fenster(p: { projekt: string }) {
  const name = String(sicht.projekt?.[p.projekt]?.werte.name ?? 'Projekt');
  const teile = createMemo(() => teileVon(p.projekt));
  const [gewaehlt, setGewaehlt] = createSignal<Set<string>>(new Set());
  const [ganz, setGanz] = createSignal(false);
  const an = (id: string) => ganz() || gewaehlt().has(id);
  const schalten = (id: string) => { const s = new Set(gewaehlt()); if (s.has(id)) s.delete(id); else s.add(id); setGewaehlt(s); };
  const zu = () => setOffen(null);
  const loeschen = () => {
    const befehle = teile().filter((t) => an(t.id)).flatMap((t) => t.befehle);
    if (ganz()) befehle.push({ objekt: 'projekt', art: 'loeschen', objektId: p.projekt });
    zu();
    if (!befehle.length) return;
    const was = ganz() ? `Projekt „${name}“` : `${teile().filter((t) => an(t.id)).map((t) => t.titel).join(', ')} aus „${name}“`;
    ausfuehrenMehrere(befehle, `${was} gelöscht`);
    if (ganz() && projektId() === p.projekt) setProjektId(null);
    hinweis(`${was} im Papierkorb.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <Dialog titel="Was soll gelöscht werden?" onAbbrechen={zu} geaendert={() => ganz() || gewaehlt().size > 0}
      knoepfe={<><button class="knopf" data-abbrechen onClick={zu}>Abbrechen</button>
        <button class="knopf gefahr" disabled={!ganz() && !gewaehlt().size} onClick={loeschen}>In den Papierkorb</button></>}>
      <p class="still-text">„{name}“ – angekreuzte Teile kommen in den Papierkorb, alles andere bleibt. „Zurück“ holt sie wieder.</p>
      <div class="loesch-teile">
        <label class="loesch-teil ganz" classList={{ an: ganz() }}>
          <input type="checkbox" checked={ganz()} onChange={(e) => setGanz(e.currentTarget.checked)} />
          <span><b>Das ganze Projekt</b><small>{teile().length ? 'mit allen Daten unten' : 'es hat noch keine Daten in den Apps'}</small></span>
        </label>
        <For each={teile()}>{(t) => (
          <label class="loesch-teil" classList={{ an: an(t.id) }}>
            <input type="checkbox" checked={an(t.id)} disabled={ganz()} onChange={() => schalten(t.id)} />
            <span><b>{t.titel}</b><small>{t.text}</small></span>
          </label>
        )}</For>
      </div>
      <Show when={!teile().length && !ganz()}><p class="still-text klein-text">In den Apps steht für dieses Projekt noch nichts.</p></Show>
    </Dialog>
  );
}

/** Einmal in der App eingehängt. */
export function ProjektLoeschen() {
  return <Show when={offen()} keyed>{(pid) => <Fenster projekt={pid} />}</Show>;
}
