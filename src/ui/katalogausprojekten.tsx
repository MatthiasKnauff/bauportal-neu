// Leistungskatalog „Aus Projekten …“ (wie bisher): Leistungen aus vorhandenen Bauzeitenplänen als eigene Leistungen in den
// Katalog übernehmen – je Name und Gewerk einmal, mit Abschnitt (die Gruppe darüber), Gewerk und Dauer. Was der Katalog schon
// hat (gleicher Name und gleiches Gewerk), steht nicht in der Liste. Angelegt wird alles Angehakte mit einem Rückgängig.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage } from '../kern/befehl';
import { Dialog } from './baukasten/dialog';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { neueKennung } from './unterbau/api';

const [offen, setOffen] = createSignal(false);
export const katalogAusProjekten = () => setOffen(true);
const schluessel = (n: unknown, g: unknown) => `${String(n ?? '').trim().toLowerCase()}|${String(g ?? '').trim().toLowerCase()}`;

export function KatalogAusProjekten() {
  return <Show when={offen()}><Fenster /></Show>;
}

function Fenster() {
  const zu = () => setOffen(false);
  // je Leistung (keine Gruppe, keine Meilensteine) aus allen Plänen: Name, Gewerk, Abschnitt (Gruppe darüber), Dauer, Projekt
  const vorschlaege = createMemo(() => {
    const da = new Set(lebende('leistungsvorlage').map((x) => schluessel(x.werte.name, x.werte.gewerk)));
    const jeVersion = new Map<string, ReturnType<typeof lebende>>();
    for (const v of lebende('vorgang')) { const k = String(v.werte.version); (jeVersion.get(k) ?? jeVersion.set(k, []).get(k)!).push(v); }
    const m = new Map<string, { name: string; gewerk: string; abschnitt: string; dauer: number; projekte: Set<string> }>();
    for (const liste of jeVersion.values()) {
      const l = [...liste].sort((a, b) => Number(a.werte.reihe ?? 0) - Number(b.werte.reihe ?? 0));
      l.forEach((v, i) => {
        const e = Number(v.werte.ebene ?? 0);
        if (Number(l[i + 1]?.werte.ebene ?? -1) > e || !Number(v.werte.dauer ?? 0)) return;   // Gruppe oder Meilenstein
        const k = schluessel(v.werte.name, v.werte.gewerk); if (!String(v.werte.name ?? '').trim() || da.has(k)) return;
        let g = i - 1; while (g >= 0 && Number(l[g]!.werte.ebene ?? 0) >= e) g--;
        const pr = sicht.projekt?.[String(v.werte.projekt)]?.werte;
        const x = m.get(k) ?? { name: String(v.werte.name).trim(), gewerk: String(v.werte.gewerk ?? ''), abschnitt: g >= 0 ? String(l[g]!.werte.name ?? '') : '', dauer: Number(v.werte.dauer ?? 0), projekte: new Set() };
        x.projekte.add([pr?.nummer, pr?.name].filter(Boolean).join(' '));
        m.set(k, x);
      });
    }
    return [...m.values()].sort((a, b) => a.abschnitt.localeCompare(b.abschnitt, 'de') || a.name.localeCompare(b.name, 'de'));
  });
  const [gewaehlt, setGewaehlt] = createSignal<Set<number>>(new Set());
  const umschalten = (i: number) => { const s = new Set(gewaehlt()); if (s.has(i)) s.delete(i); else s.add(i); setGewaehlt(s); };
  const los = () => {
    const b: Vorlage[] = [...gewaehlt()].map((i) => vorschlaege()[i]!).map((x) => ({ objekt: 'leistungsvorlage', art: 'anlegen', objektId: neueKennung(),
      werte: { name: x.name, gewerk: x.gewerk, abschnitt: x.abschnitt, dauer: x.dauer, bezug: 'bau', kennung: '' } }));
    if (b.length) ausfuehrenMehrere(b, `${b.length} ${b.length === 1 ? 'Leistung' : 'Leistungen'} aus Projekten in den Katalog`);
    zu();
  };
  return (
    <Dialog titel="Leistungen aus Projekten übernehmen" breite={820} onAbbrechen={zu} geaendert={() => gewaehlt().size > 0}
      knoepfe={<><button class="knopf" onClick={zu}>Abbrechen</button><button class="knopf haupt" disabled={!gewaehlt().size} onClick={los}>{gewaehlt().size ? `${gewaehlt().size} übernehmen` : 'Übernehmen'}</button></>}>
      <p class="still-text">Leistungen aus den Bauzeitenplänen, die der Katalog noch nicht hat (gleicher Name und Gewerk). Sie kommen als eigene Leistungen des Büros in den Katalog – mit Abschnitt, Gewerk und Dauer.</p>
      <Show when={vorschlaege().length} fallback={<p class="leer">Alle Leistungen der Pläne stehen schon im Katalog.</p>}>
        <p><button type="button" class="link-knopf" onClick={() => setGewaehlt(gewaehlt().size === vorschlaege().length ? new Set() : new Set(vorschlaege().map((_, i) => i)))}>{gewaehlt().size === vorschlaege().length ? 'keine' : 'alle'} wählen</button></p>
        <div class="einlesen-liste">
          <table class="einlesen-tabelle">
            <thead><tr><th style={{ width: '32px' }} /><th>Leistung</th><th>Abschnitt</th><th>Gewerk</th><th style={{ width: '70px' }}>Dauer</th><th>aus</th></tr></thead>
            <tbody><For each={vorschlaege()}>{(x, i) => (
              <tr><td><input type="checkbox" checked={gewaehlt().has(i())} aria-label={`${x.name} übernehmen`} onChange={() => umschalten(i())} /></td>
                <td>{x.name}</td><td>{x.abschnitt}</td><td>{x.gewerk}</td><td>{x.dauer} AT</td><td class="still-text klein-text">{[...x.projekte].join(', ')}</td></tr>
            )}</For></tbody>
          </table>
        </div>
      </Show>
    </Dialog>
  );
}
