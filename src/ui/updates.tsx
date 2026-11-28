// Verwaltung → Updates: welche Programmversion läuft und was die neueste Freigabe ist; darunter die Kataloge aus dem
// Katalog-Kanal – aktualisieren auf Knopfdruck, mit derselben Vorschau wie bei IFC und Assistent.
import { For, Show, createResource } from 'solid-js';
import { ruf } from './unterbau/api';
import { Rahmen } from './baukasten/rahmen';
import { vorschauZeigen, type Vorschau } from './uebernahme';

interface Stand { version: number; stand: string; eingespielt?: string }
interface Zustand {
  programm: { version: string; umgebung: string; neueste: { wert: { version: string; erschienen: string; text: string; adresse: string } | null } | { fehler: string } };
  kataloge: { id: string; titel: string; objekt: string; eingespielt: Stand | null; angebot: (Stand & { beschreibung: string; quelle: string }) | null }[];
  kanalFehler: string | null;
}
const tag = (t: string) => new Date(t).toLocaleDateString('de', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Katalog zurück auf den Stand ab Werk (auch, was das Büro geändert hat) – erst die Vorschau, dann übernehmen; eigene Einträge bleiben. */
export const katalogZuruecksetzen = (id: string, titel: string) => void vorschauZeigen(
  { titel: `„${titel}“ zurücksetzen`, wartetext: 'Der Katalog wird geholt und mit dem Bestand verglichen …', fertig: `„${titel}“ steht wieder auf dem Stand ab Werk.` },
  () => ruf<Vorschau>('/api/updates/katalog/vorschau', { katalog: id, zuruecksetzen: true }));

export function Updates() {
  const [z, { refetch }] = createResource(() => ruf<Zustand>('/api/updates/zustand'));
  const aktualisieren = (k: Zustand['kataloge'][number]) => void vorschauZeigen(
    { titel: `Katalog „${k.titel}“ aktualisieren`, wartetext: 'Der Katalog wird geholt, geprüft und mit dem Bestand verglichen …', fertig: `Katalog „${k.titel}“ ist eingespielt.`, danach: () => void refetch() },
    async () => { const v = await ruf<Vorschau>('/api/updates/katalog/vorschau', { katalog: k.id }); void refetch(); return v; });
  return (
    <Rahmen schluessel="verwaltung.updates" inhalt={<section class="blatt frei">
      <Show when={z()} fallback={<p class="still-text">{z.error ? (z.error as Error).message : 'Updates werden abgefragt …'}</p>}>{(s) => (<>
        <h2>Programm</h2>
        <div class="update-kasten">
          {(() => { const p = s().programm; const n = p.neueste;
            const test = p.umgebung === 'test';
            return (<>
              <h3>{test ? `Testserver – Stand für ${p.version}` : `Es läuft ${p.version}`}</h3>
              {'fehler' in n ? <p class="feld-fehler">{n.fehler}</p>
                : !n.wert ? <p class="still-text">Es gibt noch keine Freigabe.</p>
                : <>
                  <p class="still-text">{test ? `Zuletzt freigegeben: ${n.wert.version} am ${tag(n.wert.erschienen)}. Der Testserver zeigt, was als Nächstes kommt.`
                    : n.wert.version === p.version ? `Das ist die neueste Freigabe (vom ${tag(n.wert.erschienen)}).`
                    : `Neueste Freigabe: ${n.wert.version} vom ${tag(n.wert.erschienen)}. Sie wird eingespielt, sobald der Server sie abholt (Portainer).`}</p>
                  <Show when={n.wert.text}><p class="update-text">{n.wert.text}</p></Show>
                </>}
            </>); })()}
        </div>
        <h2>Kataloge</h2>
        <Show when={s().kanalFehler}><p class="feld-fehler" role="alert">{s().kanalFehler}</p></Show>
        <For each={s().kataloge}>{(k) => {
          const neu = () => !!k.angebot && (!k.eingespielt || k.angebot.version > k.eingespielt.version);
          return (
            <div class="update-kasten">
              <h3>{k.titel}</h3>
              <Show when={k.angebot}><p class="still-text">{k.angebot!.beschreibung}</p></Show>
              <p class="still-text">{k.eingespielt ? `Eingespielt: Fassung ${k.eingespielt.version}, Stand ${k.eingespielt.stand}.` : 'Noch nicht eingespielt.'}
                {k.angebot ? (neu() ? ` Im Kanal liegt Fassung ${k.angebot.version}, Stand ${k.angebot.stand}.` : ' Das ist der neueste Stand.') : s().kanalFehler ? '' : ' Der Kanal bietet diesen Katalog nicht an.'}</p>
              <Show when={k.angebot}><div class="reihe"><button class="knopf" classList={{ haupt: neu() }} onClick={() => aktualisieren(k)}>{neu() ? (k.eingespielt ? 'Aktualisieren' : 'Einspielen') : 'Noch einmal abgleichen'}</button></div></Show>
            </div>
          );
        }}</For>
        <p class="still-text klein-text">Kataloge kommen unabhängig von Programmversionen. Vor dem Einspielen siehst du, was sich ändern würde; eigene Einträge und vom Büro geänderte Werte bleiben.</p>
      </>)}</Show>
    </section>} />
  );
}
