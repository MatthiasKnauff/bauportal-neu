// Kostenrahmen in der Gebäudekarte: Brutto-Grundfläche × Gebäudekennwert, auf heute hochgerechnet (Rechnung in
// module/gebaeudemodell/kosten.ts, Kennwerte und Index aus den Baudaten). Zeigt die Spanne Standardstufe 3 bis 4.
import { Show, createMemo } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { kostenrahmen, type Indexwert, type Kennwert } from '../module/gebaeudemodell/kosten';
import { lebende } from './unterbau/abgleich';

const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;
const zahl = (w: unknown) => (w == null || w === '' ? null : Number(w));

export function Kostenrahmen(p: { gebaeude: Zeile }) {
  const bgf = () => zahl(p.gebaeude.werte.bgf) ?? lebende('geschoss').filter((g) => g.werte.gebaeude === p.gebaeude.id).reduce((s, g) => s + (zahl(g.werte.flaeche) ?? 0), 0);
  const ergebnis = createMemo(() => kostenrahmen(p.gebaeude.werte, bgf(),
    lebende('gebaeudekennwert').map((k): Kennwert => ({ nummer: String(k.werte.nummer ?? ''), gebaeudeart: String(k.werte.gebaeudeart ?? ''), ausfuehrung: String(k.werte.ausfuehrung ?? ''),
      stufen: [1, 2, 3, 4, 5].map((n) => zahl(k.werte[`stufe${n}`])), kostenstand: Number(k.werte.kostenstand ?? 2010), index: String(k.werte.index ?? 'wohn') })),
    lebende('baupreisindex').map((x): Indexwert => ({ jahr: Number(x.werte.jahr), quartal: String(x.werte.quartal ?? ''), wohn: Number(x.werte.wohn), buero: Number(x.werte.buero), gewerbe: Number(x.werte.gewerbe) }))));
  return (
    <section class="kostenrahmen" aria-label="Kostenrahmen">
      <h4>Kostenrahmen <span class="still-text klein-text">Bauwerk KG 300 + 400, brutto, mit Baunebenkosten</span></h4>
      <Show when={'von' in ergebnis() ? ergebnis() as Exclude<ReturnType<typeof ergebnis>, { fehlt: string }> : undefined}
        fallback={<p class="still-text klein-text">{(ergebnis() as { fehlt: string }).fehlt}</p>}>{(k) => (<>
        <p class="kostenrahmen-summe">{euro(k().summeVon)} – {euro(k().summeBis)}</p>
        <p class="klein-text">{euro(k().von)} – {euro(k().bis)} je m² · {k().bgf.toLocaleString('de-DE')} m² BGF</p>
        <p class="still-text klein-text">NHK 2010 Nr. {k().kennwert.nummer} {k().kennwert.gebaeudeart}{k().kennwert.ausfuehrung ? ` (${k().kennwert.ausfuehrung})` : ''}, Standardstufe 3 bis 4,
          × {k().faktor.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Baupreisindex {k().stand}.{k().annahmen.length ? ` Angenommen: ${k().annahmen.join('; ')}.` : ''}</p>
      </>)}</Show>
    </section>
  );
}
