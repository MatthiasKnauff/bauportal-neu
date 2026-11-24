// IFC einlesen: Datei wählen → Vorschau, was sich im Gebäudemodell ändern würde → Übernehmen.
// Nichts ändert sich ohne Bestätigung; die Übernahme ist ein Vorgang (alles oder nichts).
import { For, Show, createSignal } from 'solid-js';
import { ruf } from './api';
import { Dialog } from './baukasten/dialog';
import { hinweis } from './baukasten/hinweise';

type Zahl = { neu: number; geaendert: number; entfernt: number; unveraendert: number; behalten: number };
interface Vorschau { token: string; schema: string; je: Record<string, Zahl>; uebersprungen: Record<string, number>; flaechenAusGeometrie: number; lageAusGeometrie: number; teileInOeffnungen: number; ohneGeschoss: number; befehle: number }
const TITEL: Record<string, string> = { gebaeude: 'Gebäude', geschoss: 'Geschosse', raum: 'Räume', bauteil: 'Bauteile' };

const [lage, setLage] = createSignal<{ art: 'liest'; name: string } | { art: 'vorschau'; name: string; v: Vorschau } | { art: 'uebernimmt'; name: string } | { art: 'fehler'; name: string; text: string } | null>(null);

export function ifcEinlesen(projekt: string, version: string): void {
  const wahl = document.createElement('input');
  wahl.type = 'file'; wahl.accept = '.ifc';
  wahl.onchange = async () => {
    const datei = wahl.files?.[0];
    if (!datei) return;
    setLage({ art: 'liest', name: datei.name });
    try { setLage({ art: 'vorschau', name: datei.name, v: await ruf<Vorschau>(`/api/gebaeudemodell/ifc/vorschau?projekt=${projekt}&version=${version}`, datei) }); }
    catch (e) { setLage({ art: 'fehler', name: datei.name, text: (e as Error).message }); }
  };
  wahl.click();
}

export function IfcFenster() {
  const zu = () => setLage(null);
  const uebernehmen = async (name: string, v: Vorschau) => {
    setLage({ art: 'uebernimmt', name });
    try { await ruf('/api/gebaeudemodell/ifc/uebernehmen', { token: v.token }); zu(); hinweis(`„${name}“ ist ins Gebäudemodell übernommen.`); }
    catch (e) { setLage({ art: 'fehler', name, text: (e as Error).message }); }
  };
  return (
    <Show when={lage()}>{(l) => (
      <Dialog titel={`IFC einlesen – ${l().name}`} breit onAbbrechen={l().art === 'liest' || l().art === 'uebernimmt' ? undefined : zu}
        knoepfe={(() => { const x = l(); return x.art === 'vorschau'
          ? <><button class="knopf" onClick={zu}>Abbrechen</button><button class="knopf haupt" disabled={!x.v.befehle} onClick={() => uebernehmen(x.name, x.v)}>Übernehmen</button></>
          : <button class="knopf" disabled={x.art !== 'fehler'} onClick={zu}>Schließen</button>; })()}>
        {(() => { const x = l();
          if (x.art === 'liest') return <p class="still-text">Die Datei wird gelesen und mit dem Gebäudemodell verglichen. Bei großen Dateien dauert das einen Moment …</p>;
          if (x.art === 'uebernimmt') return <p class="still-text">Die Änderungen werden übernommen …</p>;
          if (x.art === 'fehler') return <p class="feld-fehler" role="alert">{x.text}</p>;
          const v = x.v;
          const behalten = Object.values(v.je).reduce((s, z) => s + z.behalten, 0);
          return (<>
            <p class="still-text">Das würde sich in dieser Version ändern. Noch ist nichts übernommen.</p>
            <table class="matrix vorschau-tabelle">
              <thead><tr><th>Bereich</th><th>neu</th><th>geändert</th><th>entfällt</th><th>unverändert</th></tr></thead>
              <tbody><For each={Object.entries(v.je)}>{([o, z]) => <tr><th scope="row">{TITEL[o] ?? o}</th><td>{z.neu}</td><td>{z.geaendert}</td><td>{z.entfernt}</td><td>{z.unveraendert}</td></tr>}</For></tbody>
            </table>
            <ul class="vorschau-hinweise">
              <Show when={!v.befehle}><li>Der Plan stimmt mit dem Gebäudemodell überein – es gibt nichts zu übernehmen.</li></Show>
              <Show when={behalten}><li>{behalten} {behalten === 1 ? 'Eintrag hat' : 'Einträge haben'} von Hand geänderte Werte, die vom Plan abweichen. Sie bleiben, wie du sie eingetragen hast.</li></Show>
              <Show when={v.flaechenAusGeometrie}><li>Bei {v.flaechenAusGeometrie} Bauteilen stand keine Menge in der Datei – die Fläche ist aus der Geometrie gerechnet.</li></Show>
              <Show when={v.lageAusGeometrie}><li>Bei {v.lageAusGeometrie} Wänden stand nicht in der Datei, ob sie außen oder innen liegen – das ist aus dem Grundriss ermittelt.</li></Show>
              <Show when={v.teileInOeffnungen}><li>Fenster und Türen sind aus den Wandöffnungen gelesen; ihre {v.teileInOeffnungen} Einzelteile (Rahmen, Flügel, Glas) zählen nicht als eigene Bauteile.</li></Show>
              <Show when={v.ohneGeschoss}><li>{v.ohneGeschoss} Räume ohne Geschoss im Plan wurden ausgelassen.</li></Show>
              <Show when={Object.keys(v.uebersprungen).length}><li>Nicht ins Modell übernommen: {Object.entries(v.uebersprungen).map(([k, n]) => `${n} × ${k.replace(/^Ifc/, '')}`).join(', ')}.</li></Show>
              <li>Alles, was übernommen wird, trägt die Marke „aus IFC“. Format der Datei: {v.schema}.</li>
            </ul>
          </>);
        })()}
      </Dialog>
    )}</Show>
  );
}
