// Planungsassistent fürs Gebäude: eine geführte Art, die Gebäudekarte des Gebäudemodells auszufüllen – Schritt für
// Schritt statt alle Felder auf einmal. Es gibt keinen eigenen Speicher: jede Eingabe ist ein Befehl auf das Gebäude,
// alle Apps lesen dort. Dieselben Schritte im Gebäudemodell und im Bauzeitenplan (dort kommt „Leistungen“ dazu).
import { For, Show, createSignal } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { gilt, type Feld } from '../kern/modell';
import { modell } from './unterbau/api';
import { darf } from './unterbau/api';
import { Detailkarte, feldAendern } from './baukasten/detailkarte';
import { Schwebefenster } from './baukasten/schwebefenster';
import { Unterliste } from './baukasten/unterliste';
import { FeldEingabe } from './baukasten/feld';
import { Schrittweise, type Schritt } from './baukasten/schrittweise';
import { sicht } from './unterbau/abgleich';

// Abschnitt der Gebäudekarte → Frage des Assistenten (wie im bisherigen Bauportal)
const FRAGEN: Record<string, string> = { Gebäude: 'Was wird gebaut?', Bestand: 'Am Bestand', Größe: 'Größe des Gebäudes', Bauweise: 'Bauweise und Dach', 'Technik und Ausbau': 'Technik und Ausbau' };

/** Die Schritte für ein Gebäude – aus den Abschnitten seines Datenmodells (Felder mit Bedingung nur, wenn sie gelten). */
export function gebaeudeSchritte(id: string): Schritt[] {
  const m = modell('gebaeude');
  const z = (): Zeile | undefined => sicht.gebaeude?.[id];
  const abschnitte = [...new Set(m.felder.filter((f) => f.gruppe && FRAGEN[f.gruppe]).map((f) => f.gruppe!))];
  return abschnitte.map((g) => ({
    titel: FRAGEN[g]!,
    inhalt: () => {
      const felder = (): Feld[] => m.felder.filter((f) => f.gruppe === g && !f.verborgen && z() && gilt(f, z()!.werte, m));
      return (
        <div class="raster">
          <For each={felder()}>{(f) => <FeldEingabe feld={f} wert={z()!.werte[f.name] ?? null} objekt="gebaeude" zusammenhang={z()!.werte} herkunft={z()!.herkunft?.[f.name]}
            gesperrt={!darf('gebaeude', 'schreiben')} onWert={(w, h) => feldAendern(m, z()!, f, w, h)} />}</For>
          {/* wie bisher bei „Was wird gebaut?“: die Gebäudeteile (Bestand, Anbau, Aufstockung …) gleich dazu */}
          <Show when={g === 'Gebäude' && z()}><div class="ganz"><GebaeudeTeile gebaeude={z()!} /></div></Show>
        </div>
      );
    },
  }));
}

export function GebaeudeAssistent(p: { gebaeude: string; knopf?: string }) {
  return <Schrittweise knopf={p.knopf ?? 'Planungsassistent – Schritt für Schritt'} titel="Planungsassistent" schritte={gebaeudeSchritte(p.gebaeude)} />;
}

/** Gebäudeteile in der Gebäudekarte: Bestand und Anbau, Aufstockung … – das Gebäude selbst ist der erste Teil.
 *  Ein Teil nennt nur, was bei ihm anders ist; Klick öffnet ihn im Schwebefenster. */
export function GebaeudeTeile(p: { gebaeude: Zeile }) {
  const [offen, setOffen] = createSignal<string | null>(null);
  const teil = () => (offen() ? sicht.gebaeudeteil?.[offen()!] : undefined);
  const w = () => p.gebaeude.werte;
  return (
    <>
      <Unterliste titel="Weitere Gebäudeteile" objekt="gebaeudeteil" fest={{ gebaeude: p.gebaeude.id, projekt: w().projekt ?? null, version: w().version ?? null }}
        haupt="name" neben={['lage']} platzhalter="Gebäudeteil, z. B. Anbau – eingeben und Enter" gewaehlt={offen()} onWahl={(id) => setOffen(id)} />
      <p class="still-text klein-text">Nur, wenn das Gebäude aus mehreren Teilen besteht (z. B. Bestand und Anbau). Ein Teil nennt nur, was bei ihm anders ist – sonst gilt das Hauptgebäude.</p>
      <Show when={teil()}>{(z) => (
        <Schwebefenster titel={`Gebäudeteil ${String(z().werte.name ?? '')}`} schluessel="gebaeudeteil" onZu={() => setOffen(null)}>
          <Detailkarte modell={modell('gebaeudeteil')} zeile={z()} onZu={() => setOffen(null)} verborgen={['projekt', 'version']} />
        </Schwebefenster>
      )}</Show>
    </>
  );
}
