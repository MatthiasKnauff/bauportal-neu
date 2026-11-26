// „Aus dem Kataster holen“ an der Projektkarte (Gruppe Grundstück): Gemarkung, Flur, Flurstück, Fläche und Geländehöhe von
// Geobasis NRW (ALKIS, DGM1) – wie das Wetter am Tagesbericht: ein Knopf, die Werte tragen danach „aus dem Kataster“.
import { Show, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { ausfuehren, rueckgaengig } from './unterbau/abgleich';
import { darf, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

export function KatasterHolen(p: { projekt: Zeile }) {
  const [laeuft, setLaeuft] = createSignal(false);
  const holen = async () => {
    setLaeuft(true);
    try {
      const r = await ruf<{ werte: Record<string, string | number>; flurstuecke: unknown[]; hinweise: string[] }>('/api/kataster', { projekt: p.projekt.id });
      if (Object.keys(r.werte).length) {
        ausfuehren({ objekt: 'projekt', art: 'aendern', objektId: p.projekt.id, werte: r.werte, herkunft: 'kataster' }, 'Grundstück aus dem Kataster');
        const w = r.werte;
        hinweis([w.gemarkung ? `Gemarkung ${w.gemarkung}, Flur ${w.flur}, Flurstück ${w.flurstueck}` : '', w.hoehe_nhn != null ? `Gelände ${String(w.hoehe_nhn).replace('.', ',')} m ü. NHN` : '', ...r.hinweise].filter(Boolean).join(' · '),
          { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
      } else hinweis(r.hinweise.join(' ') || 'Im Kataster wurde nichts gefunden.', { art: 'fehler' });
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  return (
    <Show when={darf('projekt', 'schreiben')}>
      <div class="reihe"><button type="button" class="knopf klein" title="Gemarkung, Flur, Flurstück, Fläche und Geländehöhe von Geobasis NRW (ALKIS, DGM1) – aus der Anschrift der Baustelle" disabled={laeuft()} onClick={holen}>
        {laeuft() ? 'Kataster wird abgefragt …' : '🗺 Aus dem Kataster holen'}</button></div>
    </Show>
  );
}
