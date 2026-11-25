// Übernahme – ein Fenster für alle Quellen: IFC-Datei, Assistent oder Katalog → Vorschau, was sich ändern
// würde → Übernehmen. Nichts ändert sich ohne Bestätigung; die Übernahme ist ein Vorgang (alles oder nichts).
import { For, Show, createSignal } from 'solid-js';
import { createStore, unwrap } from 'solid-js/store';
import { Eingabefehler, gilt, leerwert, pruefeWerte, type Werte } from '../kern/modell';
import { sicht } from './abgleich';
import { modell, ruf } from './api';
import { Auswahlliste } from './baukasten/auswahlliste';
import { gruppen } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { hinweis } from './baukasten/hinweise';

type Zahl = { neu: number; geaendert: number; entfernt: number; unveraendert: number; behalten: number };
export interface Vorschau { token: string; je: Record<string, Zahl>; hinweise: string[]; befehle: number }

interface Quelle { titel: string; wartetext: string; fertig: string; zurueck?: () => void; danach?: () => void }
type Lage = { art: 'liest' } | { art: 'vorschau'; v: Vorschau } | { art: 'uebernimmt' } | { art: 'fehler'; text: string };
const [stand, setStand] = createSignal<(Quelle & { lage: Lage }) | null>(null);

/** Holt die Vorschau einer Quelle und zeigt sie; „Übernehmen“ führt sie aus. */
export async function vorschauZeigen(q: Quelle, holen: () => Promise<Vorschau>): Promise<void> {
  setStand({ ...q, lage: { art: 'liest' } });
  try { setStand({ ...q, lage: { art: 'vorschau', v: await holen() } }); }
  catch (e) { setStand({ ...q, lage: { art: 'fehler', text: (e as Error).message } }); }
}

export function ifcEinlesen(projekt: string, version: string): void {
  const wahl = document.createElement('input');
  wahl.type = 'file'; wahl.accept = '.ifc';
  wahl.onchange = () => {
    const datei = wahl.files?.[0];
    if (datei) void vorschauZeigen({ titel: `IFC einlesen – ${datei.name}`, wartetext: 'Die Datei wird gelesen und mit dem Gebäudemodell verglichen. Bei großen Dateien dauert das einen Moment …', fertig: `„${datei.name}“ ist ins Gebäudemodell übernommen.` },
      () => ruf<Vorschau>(`/api/gebaeudemodell/ifc/vorschau?projekt=${projekt}&version=${version}`, datei));
  };
  wahl.click();
}

// ---------- Assistent: Fragen zum Gebäude, daraus ein erstes geschätztes Modell ----------
const FRAGEN = ['Gebäude', 'Größe', 'Bauweise', 'Technik und Ausbau', 'Bestand'];
const NEU = '';
const [fragen, setFragen] = createSignal<{ projekt: string; version: string } | null>(null);
const [antworten, setAntworten] = createStore<{ gebaeude: string; werte: Werte }>({ gebaeude: NEU, werte: {} });

const vorhandene = (version: string) => Object.values(sicht.gebaeude ?? {}).filter((z) => !z.geloescht && z.werte.version === version);
function laden(gebaeude: string): void {
  const m = modell('gebaeude');
  const z = gebaeude ? sicht.gebaeude?.[gebaeude] : undefined;
  setAntworten({ gebaeude, werte: Object.fromEntries(m.felder.filter((f) => FRAGEN.includes(f.gruppe ?? '')).map((f) => [f.name, z ? (unwrap(z).werte[f.name] ?? leerwert(f)) : leerwert(f)])) });
}

export function assistentStarten(projekt: string, version: string): void {
  laden(vorhandene(version)[0]?.id ?? NEU);
  setFragen({ projekt, version });
}

function AssistentFenster(p: { projekt: string; version: string }) {
  const m = modell('gebaeude');
  const [fehler, setFehler] = createStore<Record<string, string | undefined>>({});
  const weiter = () => {
    try {
      // Nur was gerade gilt, geht mit (Fragen zum Bestand nicht beim reinen Neubau)
      const werte = pruefeWerte(m, Object.fromEntries(Object.entries(antworten.werte).filter(([k]) => gilt(m.felder.find((f) => f.name === k)!, antworten.werte))), false);
      const zu = fragen()!;   // vor dem Schließen merken: danach gibt es dieses Fenster nicht mehr
      setFragen(null);
      void vorschauZeigen({ titel: 'Assistent – Vorschau', wartetext: 'Das Gebäudemodell wird aus den Angaben geschätzt …', fertig: 'Die Angaben sind ins Gebäudemodell übernommen.', zurueck: () => setFragen(zu) },
        () => ruf<Vorschau>('/api/gebaeudemodell/assistent/vorschau', { ...zu, gebaeude: antworten.gebaeude || null, antworten: werte }));
    } catch (e) {
      if (!(e instanceof Eingabefehler)) throw e;
      for (const f of m.felder) setFehler(f.name, e.felder[f.name]);
    }
  };
  return (
    <Dialog titel="Assistent – Angaben zum Gebäude" breit onAbbrechen={() => setFragen(null)}
      knoepfe={<><button class="knopf" onClick={() => setFragen(null)}>Abbrechen</button><button class="knopf haupt" onClick={weiter}>Vorschau</button></>}>
      <p class="still-text">Wenige Angaben genügen: Aus Art, Größe und Bauweise entsteht ein erstes, geschätztes Gebäudemodell. Alles lässt sich später ändern; ein eingelesener Plan ersetzt die Schätzung.</p>
      <Show when={vorhandene(p.version).length}>
        <div class="feld"><label for="assistent-gebaeude">Für welches Gebäude?</label>
          <Auswahlliste id="assistent-gebaeude" titel="Für welches Gebäude?" wert={antworten.gebaeude} onWert={(w) => laden(String(w ?? NEU))}
            optionen={[...vorhandene(p.version).map((z) => ({ wert: z.id, titel: String(z.werte.name ?? '') })), { wert: NEU, titel: '+ neues Gebäude' }]} /></div>
      </Show>
      <For each={gruppen(m, antworten.werte).filter((g) => FRAGEN.includes(g.titel))}>{(g) => (
        <fieldset class="fragen"><legend>{g.titel}</legend>
          <div class="raster">
            <For each={g.felder.filter((f) => f.name in antworten.werte)}>{(f) => (
              <FeldEingabe feld={f.name === 'name' ? { ...f, pflicht: false } : f} wert={antworten.werte[f.name] ?? null} fehler={fehler[f.name]} sofort onWert={(w) => setAntworten('werte', f.name, w)} />
            )}</For>
          </div>
        </fieldset>
      )}</For>
    </Dialog>
  );
}

export function Uebernahmefenster() {
  const zu = () => setStand(null);
  const uebernehmen = async (q: Quelle, v: Vorschau) => {
    setStand({ ...q, lage: { art: 'uebernimmt' } });
    try { await ruf('/api/uebernehmen', { token: v.token }); zu(); hinweis(q.fertig); q.danach?.(); }
    catch (e) { setStand({ ...q, lage: { art: 'fehler', text: (e as Error).message } }); }
  };
  return (<>
    <Show when={fragen()}>{(f) => <AssistentFenster projekt={f().projekt} version={f().version} />}</Show>
    <Show when={stand()}>{(s) => (
      <Dialog titel={s().titel} breit onAbbrechen={s().lage.art === 'liest' || s().lage.art === 'uebernimmt' ? undefined : zu}
        knoepfe={(() => { const x = s(); const l = x.lage; return l.art === 'vorschau'
          ? <><button class="knopf" onClick={zu}>Abbrechen</button><Show when={x.zurueck}><button class="knopf" onClick={() => { zu(); x.zurueck!(); }}>Zurück zu den Angaben</button></Show><button class="knopf haupt" disabled={!l.v.befehle} onClick={() => uebernehmen(x, l.v)}>Übernehmen</button></>
          : <><Show when={l.art === 'fehler' && x.zurueck}><button class="knopf" onClick={() => { zu(); x.zurueck!(); }}>Zurück zu den Angaben</button></Show><button class="knopf" disabled={l.art !== 'fehler'} onClick={zu}>Schließen</button></>; })()}>
        {(() => { const x = s(); const l = x.lage;
          if (l.art === 'liest') return <p class="still-text">{x.wartetext}</p>;
          if (l.art === 'uebernimmt') return <p class="still-text">Die Änderungen werden übernommen …</p>;
          if (l.art === 'fehler') return <p class="feld-fehler" role="alert">{l.text}</p>;
          return (<>
            <p class="still-text">Das würde sich ändern. Noch ist nichts übernommen.</p>
            <table class="matrix vorschau-tabelle">
              <thead><tr><th>Bereich</th><th>neu</th><th>geändert</th><th>entfällt</th><th>unverändert</th></tr></thead>
              <tbody><For each={Object.entries(l.v.je)}>{([o, z]) => <tr><th scope="row">{modell(o)?.titelMehrzahl ?? o}</th><td>{z.neu}</td><td>{z.geaendert}</td><td>{z.entfernt}</td><td>{z.unveraendert}</td></tr>}</For></tbody>
            </table>
            <ul class="vorschau-hinweise"><For each={l.v.hinweise}>{(h) => <li>{h}</li>}</For></ul>
          </>);
        })()}
      </Dialog>
    )}</Show>
  </>);
}
