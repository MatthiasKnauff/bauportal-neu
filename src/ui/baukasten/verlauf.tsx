// Baustein „Verlauf“: wer hat wann was an einem Eintrag geändert – aus dem Befehlsprotokoll des Servers. Ein Knopf
// „Verlauf (n)“, dahinter ein Fenster mit der Liste. Auf Wunsch mit den Einträgen, die an ihm hängen – und mit „Auf diesen Stand“:
// alles (bis auf die Objektarten in „ohne“, z. B. Fotos) wird so, wie es nach dieser Änderung war; ein Rückgängig nimmt es zurück.
import { For, Show, createResource, createSignal, type JSX } from 'solid-js';
import { HERKUNFT } from '../../kern/befehl';
import { ausfuehrenMehrere, geaendert } from '../unterbau/abgleich';
import { hinweis } from '../unterbau/meldungen';
import { modell, ruf } from '../unterbau/api';
import { Dialog } from './dialog';
import { anzeige } from './feld';

export interface Eintrag { seq: number; zeit: string; wer: string; objekt: string; art: string; objektId: string; werte: Record<string, unknown> | null; herkunft: string | null }
const ART: Record<string, string> = { anlegen: 'angelegt', aendern: 'geändert', loeschen: 'gelöscht', wiederherstellen: 'wiederhergestellt' };

export function Verlauf(p: { objekt: string; id: string; unter?: { objekt: string; feld: string }[]; zurueck?: { ohne?: string[]; hinweis?: string };
  vorne?: (liste: Eintrag[] | undefined) => JSX.Element }) {   // vorne: steht vor dem Knopf und sieht die Liste (neueste zuerst), z. B. „Seit dem Export geändert“
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
  const [laeuft, setLaeuft] = createSignal(false);
  const aufStand = async (e: Eintrag) => {
    setLaeuft(true);
    try {
      const befehle = await ruf<{ objekt: string; art: 'aendern' | 'loeschen' | 'wiederherstellen'; objektId: string; werte?: Record<string, never> }[]>('/api/verlauf/stand', { objekt: p.objekt, id: p.id, unter: p.unter ?? [], bis: e.seq, ohne: p.zurueck?.ohne ?? [] });
      if (!befehle.length) { hinweis('Das ist schon der Stand von damals.'); return; }
      ausfuehrenMehrere(befehle, `Auf den Stand vom ${zeit(e.zeit)}`);
      setOffen(false);
    } catch (err) { hinweis((err as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  const zeit = (z: string) => new Date(z).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      {p.vorne?.(liste())}
      <button class="knopf still klein verlauf-knopf" onClick={() => setOffen(true)}>🕘 Verlauf{liste() ? ` (${liste()!.length})` : ''}</button>
      <Show when={offen()}>
        <Dialog titel="Verlauf" breit onAbbrechen={() => setOffen(false)} knoepfe={<button class="knopf haupt" onClick={() => setOffen(false)}>Schließen</button>}>
          <Show when={liste()?.length} fallback={<p class="still-text">{liste.loading ? 'Wird geladen …' : 'Noch nichts geändert.'}</p>}>
            <Show when={p.zurueck}><p class="still-text klein-text">„Auf diesen Stand“ bringt alles dahin zurück, wie es nach dieser Änderung war{p.zurueck!.hinweis ? ` – ${p.zurueck!.hinweis}` : ''}. Rückgängig wie jede Änderung.</p></Show>
            <ul class="verlauf-liste"><For each={liste()}>{(e, i) => <li><span class="still-text">{zeit(e.zeit)} · {e.wer}</span><span>{was(e)}</span>
              <Show when={p.zurueck && i() > 0}><button type="button" class="knopf klein still" disabled={laeuft()} title="Alles so, wie es nach dieser Änderung war" onClick={() => void aufStand(e)}>Auf diesen Stand</button></Show></li>}</For></ul>
          </Show>
        </Dialog>
      </Show>
    </>
  );
}
