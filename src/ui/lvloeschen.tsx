// LV löschen wie im bisherigen Bauportal: erst die Kette zeigen – was daran hängt (Positionen, Angebote mit Preisen, Auftrag,
// Nachträge, Aufmaß, Rechnungen, Besprechungen …) –, mit Auftrag oder Rechnungen eine zweite, ausdrückliche Bestätigung. Alles
// kommt in einem Schritt in den Papierkorb, „Rückgängig“ holt alles wieder. Was dazugehört, ergibt sich aus den Verweisen der
// Modelle der AVA (jedes Objekt, das auf etwas aus der Kette verweist, gehört dazu) – kein eigenes Verzeichnis.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage } from '../kern/befehl';
import { eigenesLoeschen } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere, lebende, rueckgaengig, sicht } from './unterbau/abgleich';
import { zustand } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

const [offen, setOffen] = createSignal<string | null>(null);
eigenesLoeschen.lv = (z) => setOffen(z.id);

/** Die Kette eines LV: je Objekt der AVA die Einträge, die (über Verweise, auch mehrstufig) an ihm hängen. */
function kette(lv: string): { objekt: string; titel: string; ids: string[] }[] {
  const ava = zustand()?.module.find((m) => m.id === 'ava');
  const modelle = (ava?.objekte ?? []).filter((m) => m.name !== 'lv');
  const drin = new Set([lv]), je = new Map<string, Set<string>>();
  for (let neu = true; neu;) {
    neu = false;
    for (const m of modelle) {
      const vf = m.felder.filter((f) => f.art === 'verweis').map((f) => f.name);
      for (const z of lebende(m.name)) {
        if (drin.has(z.id) || !vf.some((n) => drin.has(String(z.werte[n] ?? '')))) continue;
        drin.add(z.id); neu = true;
        (je.get(m.name) ?? je.set(m.name, new Set()).get(m.name)!).add(z.id);
      }
    }
  }
  return modelle.filter((m) => je.get(m.name)?.size).map((m) => ({ objekt: m.name, titel: je.get(m.name)!.size === 1 ? m.titel : m.titelMehrzahl, ids: [...je.get(m.name)!] }));
}

function Fenster(p: { lv: string }) {
  const lv = () => sicht.lv?.[p.lv];
  const name = () => [lv()?.werte.nummer, lv()?.werte.name].filter(Boolean).join(' ') || 'LV';
  const k = createMemo(() => kette(p.lv));
  const ernst = () => k().some((x) => x.objekt === 'rechnung' || x.objekt === 'nachtrag' || x.objekt === 'aufmass') || lebende('angebot').some((a) => a.werte.lv === p.lv && a.werte.beauftragt === true);
  const [sicher, setSicher] = createSignal(false);
  const zu = () => setOffen(null);
  const loeschen = () => {
    const befehle: Vorlage[] = [...k().flatMap((x) => x.ids.map((id): Vorlage => ({ objekt: x.objekt, art: 'loeschen', objektId: id }))), { objekt: 'lv', art: 'loeschen', objektId: p.lv }];
    zu();
    ausfuehrenMehrere(befehle, `LV „${name()}“ gelöscht`);
    hinweis(`LV „${name()}“ mit allem, was daran hängt, im Papierkorb.`, { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
  };
  return (
    <Dialog titel="Leistungsverzeichnis löschen" onAbbrechen={zu}
      knoepfe={<><button type="button" class="knopf" onClick={zu}>Abbrechen</button><button type="button" class="knopf gefahr" disabled={ernst() && !sicher()} onClick={loeschen}>In den Papierkorb</button></>}>
      <p>„{name()}“ kommt in den Papierkorb – <Show when={k().length} fallback="es hängt nichts daran.">mit allem, was daran hängt:</Show></p>
      <Show when={k().length}><ul class="lv-kette"><For each={k()}>{(x) => <li><b>{x.ids.length}</b> {x.titel}</li>}</For></ul></Show>
      <Show when={ernst()}>
        <p class="hinweis-kasten">Das LV ist vergeben bzw. abgerechnet: Auftrag, Nachträge, Aufmaß und Rechnungen gehen mit – auch aus der Kostenkontrolle.</p>
        <label class="lv-sicher"><input type="checkbox" checked={sicher()} onChange={(e) => setSicher(e.currentTarget.checked)} /> Ja, auch Auftrag und Abrechnung löschen</label>
      </Show>
      <p class="still-text klein-text">„Rückgängig“ holt alles in einem Schritt zurück.</p>
    </Dialog>
  );
}

/** Einmal in der App eingehängt. */
export function LvLoeschen() {
  return <Show when={offen()} keyed>{(id) => <Fenster lv={id} />}</Show>;
}
