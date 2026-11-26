// Gebäudemodell → 3D: das Modell der Version aus dem eingelesenen Plan (IFC), in der Mitte als 3D-Ansicht.
// Ein Bauteil anklicken zeigt rechts seine Karte; Färbungen nach Bauteilart, Lage und ob ein Aufbau zugeordnet ist.
import { Show, createMemo, createResource, createSignal, onCleanup } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { BAUTEILARTEN } from '../module/gebaeudemodell/beipackzettel';
import type { Mitte } from './baukasten/anpassung';
import { Ansicht3d, type Faerbung, type Netz } from './baukasten/ansicht3d';
import { sicht } from './unterbau/abgleich';

const ARTFARBE: Record<string, string> = {
  aussenwand: '#d9c7a7', innenwand: '#ece8df', decke: '#b9b6ad', dach: '#8a5a44', bodenplatte: '#8f8b82', fundament: '#6f6b63',
  fenster: '#7fb3dc', tuer: '#a7805a', stuetze: '#c27c4e', treppe: '#9b8fc0', sonstiges: '#c9c6bd',
};

/** Das Netz einer Version vom Server – fehlt es noch (wird gerechnet oder nie eingelesen), null. */
async function laden(version: string): Promise<Netz | null> {
  const r = await fetch(`/api/netz/${version}`, { credentials: 'same-origin' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Die 3D-Ansicht lässt sich nicht laden (${r.status})`);
  return (await r.json()) as Netz;
}

export function Gebaeude3d(p: Mitte) {
  const version = () => String(p.fest().version ?? '');
  const [netz, { refetch }] = createResource(version, laden);
  // Noch nicht da? Der IFC-Dienst rechnet nach dem Einlesen nebenher – solange nachsehen
  const t = setInterval(() => { if (netz.state === 'ready' && netz() === null) void refetch(); }, 15000);
  onCleanup(() => clearInterval(t));
  const nachKennung = createMemo(() => new Map(p.alle().filter((z) => z.werte.kennung).map((z) => [String(z.werte.kennung), z])));
  const bt = (k: string): Zeile | undefined => nachKennung().get(k);
  const [dazu, setDazu] = createSignal<Set<string>>(new Set());   // mit Strg dazugewählte (Anzeige)
  const gewaehlt = () => { const s = new Set(dazu()); const g = p.gewaehlt(); const z = g ? sicht.bauteil?.[g] : undefined; if (z?.werte.kennung) s.add(String(z.werte.kennung)); return s; };
  const wahl = (k: string | null, mehr: boolean) => {
    const z = k ? bt(k) : undefined;
    if (mehr && k) { const s = new Set(gewaehlt()); if (s.has(k)) s.delete(k); else s.add(k); setDazu(s); } else setDazu(new Set<string>());
    p.onWahl(z?.id ?? null);
  };
  // Sammelfilter links (UND, ODER, NICHT): das Modell zeigt nur, was er durchlässt – Teile ohne eigenes Bauteil nur ungefiltert
  const gefiltert = createMemo(() => (p.zeilen().length === p.alle().length ? null : new Set(p.zeilen().map((z) => String(z.werte.kennung ?? '')))));
  const zeigen = (k: string) => { const g = gefiltert(); return !g || g.has(k); };
  const artTitel = (a: unknown) => BAUTEILARTEN.find((x) => x.wert === a)?.titel ?? '';
  const faerbungen: Faerbung[] = [
    { key: 'art', titel: 'Bauteilart', farbe: (k) => ARTFARBE[String(bt(k)?.werte.art ?? '')] ?? null,
      legende: BAUTEILARTEN.filter((a) => p.alle().some((z) => z.werte.art === a.wert)).map((a) => [ARTFARBE[a.wert] ?? '#ccc', a.titel]) },
    { key: 'lage', titel: 'außen / innen', farbe: (k) => ({ aussen: '#5b8def', innen: '#e8a33d' } as Record<string, string>)[String(bt(k)?.werte.lage ?? '')] ?? null,
      legende: [['#5b8def', 'außen'], ['#e8a33d', 'innen'], ['#e4e2dc', 'ohne Angabe / nicht im Modell']] },
    { key: 'aufbau', titel: 'Aufbau', farbe: (k) => { const z = bt(k); return !z ? null : z.werte.aufbau ? '#4caf7a' : '#d9645b'; },
      legende: [['#4caf7a', 'Aufbau zugeordnet'], ['#d9645b', 'ohne Aufbau'], ['#e4e2dc', 'nicht im Modell']] },
  ];
  const info = (k: string) => { const z = bt(k); if (!z) return 'nicht im Modell (z. B. Einzelteil eines Fensters)'; const g = z.werte.geschoss ? String(sicht.geschoss?.[String(z.werte.geschoss)]?.werte.name ?? '') : ''; return [String(z.werte.name ?? ''), artTitel(z.werte.art), g].filter(Boolean).join(' · '); };
  return (
    <div class="mitte-3d">
      <Show when={netz.state !== 'errored'} fallback={<p class="still-text">{String((netz.error as Error)?.message ?? 'Die 3D-Ansicht lässt sich nicht laden.')}</p>}>
        <Show when={netz()} fallback={
          <Show when={netz.state === 'ready'} fallback={<p class="still-text">3D-Ansicht wird geladen …</p>}>
            <div class="leer-seite">
              <h2>Noch keine 3D-Ansicht</h2>
              <p class="still-text">Die 3D-Ansicht entsteht aus dem Plan: „IFC einlesen“ im Menüband. Nach dem Einlesen rechnet der IFC-Dienst sie nebenher – sie erscheint dann hier von selbst.</p>
            </div>
          </Show>}>
          {(n) => <Ansicht3d netz={n()} faerbungen={faerbungen} gewaehlt={gewaehlt} onWahl={wahl} info={info} zeigen={zeigen} />}
        </Show>
      </Show>
    </div>
  );
}
