// Baustein „Verlauf“: wer hat wann was an einem Eintrag geändert – aus dem Befehlsprotokoll des Servers. Ein Knopf
// „Verlauf (n)“, dahinter ein Fenster mit der Liste. Auf Wunsch mit den Einträgen, die an ihm hängen.
import { For, Show, createResource, createSignal } from 'solid-js';
import { HERKUNFT } from '../../kern/befehl';
import { geaendert } from '../unterbau/abgleich';
import { modell, ruf } from '../unterbau/api';
import { Dialog } from './dialog';
import { anzeige } from './feld';

interface Eintrag { zeit: string; wer: string; objekt: string; art: string; objektId: string; werte: Record<string, unknown> | null; herkunft: string | null }
const ART: Record<string, string> = { anlegen: 'angelegt', aendern: 'geändert', loeschen: 'gelöscht', wiederherstellen: 'wiederhergestellt' };

export function Verlauf(p: { objekt: string; id: string; unter?: { objekt: string; feld: string }[] }) {
  const [offen, setOffen] = createSignal(false);
  // neu laden, wenn sich an diesen Objektarten etwas ändert
  const [liste] = createResource(() => ({ id: p.id, n: [p.objekt, ...(p.unter ?? []).map((u) => u.objekt)].map((o) => geaendert(o)).join() }),
    ({ id }) => ruf<Eintrag[]>('/api/verlauf', { objekt: p.objekt, id, unter: p.unter ?? [] }));
  const was = (e: Eintrag) => {
    const m = modell(e.objekt);
    const felder = Object.entries(e.werte ?? {}).map(([k, w]) => ({ f: m?.felder.find((f) => f.name === k), w })).filter((x) => x.f && !x.f.verborgen && x.f.art !== 'verweis');
    const kurz = e.art === 'aendern' ? felder.map((x) => `${x.f!.titel}: ${anzeige(x.f!, x.w as never) || '–'}`).join(' · ') : String(e.werte?.[m?.anzeigeFeld ?? ''] ?? e.werte?.text ?? '');
    return `${m?.titel ?? e.objekt} ${ART[e.art] ?? e.art}${kurz ? ` – ${kurz}` : ''}${e.herkunft ? ` (${HERKUNFT[e.herkunft] ?? e.herkunft})` : ''}`;
  };
  const zeit = (z: string) => new Date(z).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <button class="knopf still klein verlauf-knopf" onClick={() => setOffen(true)}>🕘 Verlauf{liste() ? ` (${liste()!.length})` : ''}</button>
      <Show when={offen()}>
        <Dialog titel="Verlauf" breit onAbbrechen={() => setOffen(false)} knoepfe={<button class="knopf haupt" onClick={() => setOffen(false)}>Schließen</button>}>
          <Show when={liste()?.length} fallback={<p class="still-text">{liste.loading ? 'Wird geladen …' : 'Noch nichts geändert.'}</p>}>
            <ul class="verlauf-liste"><For each={liste()}>{(e) => <li><span class="still-text">{zeit(e.zeit)} · {e.wer}</span><span>{was(e)}</span></li>}</For></ul>
          </Show>
        </Dialog>
      </Show>
    </>
  );
}
