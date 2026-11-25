// Planungsassistent im Balkenplan: Bauart und Bauweise kommen aus dem Gebäudemodell (hier änderbar), dazu Einheiten
// und Takt; die Leistungen stehen je Abschnitt zum An- und Abwählen da, mit Richtdauer und Rechenweg. Übernommen wird
// über die gemeinsame Vorschau – der Server rechnet mit denselben Bausteinen (module/bauzeitenplan/assistent.ts).
import { Auswahlliste } from './baukasten/auswahlliste';
import { For, Show, createMemo, createSignal } from 'solid-js';
import { angabenAusGebaeude, assistent, katalogAus, type Angaben } from '../module/bauzeitenplan/assistent';
import { lebende } from './unterbau/abgleich';
import { istAdmin, ruf } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { GebaeudeAssistent } from './gebaeudeschritte';
import { vorschauZeigen, type Vorschau } from './uebernahme';


export function PlanAssistent(p: { projekt: string; version: string; gespeichert: string; onZu: () => void }) {
  const katalog = createMemo(() => katalogAus(lebende('leistungsvorlage'), lebende('planregel')));
  // Gebäude aus der gültigen Version des Gebäudemodells
  const gebaeude = createMemo(() => {
    const v = lebende('version').find((x) => x.werte.projekt === p.projekt && x.werte.bereich === 'gebaeudemodell' && x.werte.gueltig);
    if (!v) return null;
    const g = lebende('gebaeude').find((x) => x.werte.version === v.id);
    return g ? { g, bauteile: lebende('bauteil').filter((x) => x.werte.version === v.id), geschosse: lebende('geschoss').filter((x) => x.werte.version === v.id && Number(x.werte.ebene) >= 0).length } : null;
  });
  const start = (): Angaben => {
    const aus = gebaeude() ? angabenAusGebaeude(gebaeude()!.g.werte, gebaeude()!.bauteile, gebaeude()!.geschosse) : { geb: 'ef', mass: ['nb'], ber: [], denkmal: false, flaeche: 0, einheiten: 0, geschosse: 0, dg: '', wahl: {}, mengen: {} };
    let alt: Partial<Angaben> = {};
    try { alt = p.gespeichert ? (JSON.parse(p.gespeichert) as Partial<Angaben>) : {}; } catch { /* neu anfangen */ }
    // Gespeichertes geht vor, die Mengen kommen immer frisch aus dem Gebäudemodell
    return { takt: 'versetzt', ...aus, ...alt, mengen: aus.mengen, wahl: { ...aus.wahl, ...(alt.wahl ?? {}) } } as Angaben;
  };
  // Gibt es ein Gebäude, kommen die Angaben immer frisch aus dem Gebäudemodell (geändert wird dort, über die Schritte);
  // hier bleibt nur, was den Plan betrifft: Takt, Auswahl der Leistungen, eigene Dauern.
  const [eigen, setEigen] = createSignal<Angaben>(start());
  const a = createMemo((): Angaben => {
    const g = gebaeude();
    if (!g) return eigen();
    const aus = angabenAusGebaeude(g.g.werte, g.bauteile, g.geschosse);
    return { ...eigen(), ...aus, wahl: aus.wahl } as Angaben;
  });
  const setze = (n: Partial<Angaben>) => setEigen({ ...eigen(), ...n });
  const as = createMemo(() => (katalog().leistungen.size ? assistent(katalog(), a()) : null));
  const gewaehlt = createMemo(() => as()?.auswahl() ?? new Set<string>());
  const umschalten = (id: string, an: boolean) => {
    const s = new Set(gewaehlt());
    if (an) for (let x: string | undefined = id; x && !s.has(x); x = katalog().leistungen.get(x)?.req || undefined) s.add(x);
    else { const weg = (x: string) => { s.delete(x); for (const l of katalog().leistungen.values()) if (l.req === x && s.has(l.id)) weg(l.id); }; weg(id); }
    setze({ auswahl: [...s] });
  };
  const abschnitte = createMemo(() => {
    const x = as();
    if (!x) return [];
    const angebot = new Set([...x.empfehlung(), ...x.angebot(), ...gewaehlt()]);
    return katalog().abschnitte.map((ab) => ({ ...ab, leistungen: [...angebot].map((id) => x.leistung(id)!).filter((l) => l && l.ph === ab.k).sort((l1, l2) => l1.reihe - l2.reihe) })).filter((ab) => ab.leistungen.length);
  });
  const [weitere, setWeitere] = createSignal(false);
  const kb = () => katalog().kombi;
  const uebernehmen = () => {
    const angaben = { ...a(), auswahl: [...gewaehlt()] };
    p.onZu();
    void vorschauZeigen({ titel: 'Planungsassistent', wartetext: 'Leistungen, Dauern und Abfolge werden gerechnet und mit dem Plan verglichen …', fertig: 'Der Plan ist erstellt.' },
      () => ruf<Vorschau>('/api/bauzeitenplan/assistent', { version: p.version, angaben }));
  };
  return (
    <Dialog titel="Planungsassistent" gross onAbbrechen={p.onZu}
      knoepfe={<>
        <button class="knopf" onClick={p.onZu}>Abbrechen</button>
        <Show when={as()}><button class="knopf" onClick={() => setze({ auswahl: undefined, dauern: undefined })}>Empfehlung wiederherstellen</button></Show>
        <button class="knopf haupt" disabled={!as() || !gewaehlt().size} onClick={uebernehmen}>In den Plan übernehmen ({gewaehlt().size})</button>
      </>}>
      <Show when={katalog().leistungen.size} fallback={<p class="still-text">Der Assistent braucht die Kataloge „Leistungen für den Bauzeitenplan“ und „Regeln des Planungsassistenten“. {istAdmin() ? 'Bitte unter Verwaltung → Updates einspielen.' : 'Bitte die Verwaltung bitten, sie unter Verwaltung → Updates einzuspielen.'}</p>}>
        <div class="planassistent">
          <div class="pa-angaben">
            <Show when={gebaeude()} fallback={<p class="still-text klein-text">Im Gebäudemodell gibt es noch kein Gebäude – die Angaben gelten nur für diesen Plan. Mit einem Gebäude im Modell füllt der Assistent dessen Karte aus und alle Apps lesen dort.</p>}>
              <p class="still-text klein-text">Das Gebäude steht im Gebäudemodell (gültige Version) – geändert wird es dort, hier Schritt für Schritt:</p>
              <GebaeudeAssistent gebaeude={gebaeude()!.g.id} knopf="Gebäude – Schritt für Schritt" />
              <p class="klein-text">{kb().geb.find((x) => x.k === a().geb)?.n} · {a().mass.map((m) => kb().mass.find((x) => x.k === m)?.n).filter(Boolean).join(', ')} · {a().flaeche || '–'} m² · {a().geschosse || '–'} Geschosse · {a().einheiten || 1} Einheit(en)</p>
            </Show>
            <Show when={!gebaeude()}>
            <div class="druck-feld">Gebäudeart <Auswahlliste titel="Gebäudeart" wert={a().geb} onWert={(w) => setze({ geb: w, auswahl: undefined })} optionen={kb().geb.map((g) => ({ wert: g.k, titel: g.n }))} /></div>
            <fieldset><legend>Maßnahmen</legend>
              <For each={kb().mass}>{(m) => <label class="druck-haken"><input type="checkbox" checked={a().mass.includes(m.k)} onChange={(e) => setze({ mass: e.currentTarget.checked ? [...a().mass, m.k] : a().mass.filter((x) => x !== m.k), auswahl: undefined })} /> {m.n}</label>}</For>
            </fieldset>
            <fieldset><legend>Nur diese Bereiche (leer: alles)</legend>
              <For each={kb().ber}>{(b) => <label class="druck-haken"><input type="checkbox" checked={a().ber.includes(b.k)} onChange={(e) => setze({ ber: e.currentTarget.checked ? [...a().ber, b.k] : a().ber.filter((x) => x !== b.k), auswahl: undefined })} /> {b.n}</label>}</For>
              <label class="druck-haken"><input type="checkbox" checked={a().denkmal} onChange={(e) => setze({ denkmal: e.currentTarget.checked, auswahl: undefined })} /> Denkmal</label>
            </fieldset>
            <fieldset><legend>Größe und Ablauf</legend>
              <label class="druck-feld">Fläche m² <input type="number" min={0} value={a().flaeche || ''} placeholder={String(as()?.flaeche ?? '')} onChange={(e) => setze({ flaeche: Number(e.currentTarget.value) || 0 })} /></label>
              <label class="druck-feld">Geschosse <input type="number" min={0} value={a().geschosse || ''} placeholder={String(as()?.geschosse ?? '')} onChange={(e) => setze({ geschosse: Number(e.currentTarget.value) || 0 })} /></label>
              <label class="druck-feld">Einheiten <input type="number" min={0} value={a().einheiten || ''} placeholder={String(as()?.einheiten ?? '')} onChange={(e) => setze({ einheiten: Number(e.currentTarget.value) || 0 })} /></label>
              <Show when={(as()?.einheiten ?? 1) > 1}>
                <label class="druck-haken"><input type="radio" checked={a().takt === 'versetzt'} onChange={() => setze({ takt: 'versetzt' })} /> im Takt (jedes Gewerk zieht von Einheit zu Einheit)</label>
                <label class="druck-haken"><input type="radio" checked={a().takt === 'parallel'} onChange={() => setze({ takt: 'parallel' })} /> alle Einheiten parallel</label>
              </Show>
            </fieldset>
            <Show when={as()?.fragen.length}>
              <fieldset><legend>Bauweise</legend>
                <For each={as()!.fragen}>{(f) => <div class="druck-feld">{f.n} <Auswahlliste titel={f.n} wert={f.wert} onWert={(w) => setze({ wahl: { ...a().wahl, [f.k]: w }, auswahl: undefined })} optionen={f.optionen.map((o) => ({ wert: o.k, titel: o.n }))} /></div>}</For>
              </fieldset>
            </Show>
            </Show>
            <Show when={gebaeude() && (as()?.einheiten ?? 1) > 1}>
              <fieldset><legend>Ablauf</legend>
                <label class="druck-haken"><input type="radio" checked={a().takt === 'versetzt'} onChange={() => setze({ takt: 'versetzt' })} /> im Takt (jedes Gewerk zieht von Einheit zu Einheit)</label>
                <label class="druck-haken"><input type="radio" checked={a().takt === 'parallel'} onChange={() => setze({ takt: 'parallel' })} /> alle Einheiten parallel</label>
              </fieldset>
            </Show>
          </div>
          <div class="pa-leistungen">
            <Show when={as()} fallback={<p class="still-text">Diese Gebäudeart kennt der Katalog nicht.</p>}>
              <p class="still-text"><strong>{as()!.bauart.n}</strong> · {gewaehlt().size} Leistungen gewählt <label class="druck-haken pa-weitere"><input type="checkbox" checked={weitere()} onChange={(e) => setWeitere(e.currentTarget.checked)} /> weitere Leistungen zeigen</label></p>
              <For each={abschnitte()}>{(ab) => (
                <Show when={weitere() || ab.leistungen.some((l) => gewaehlt().has(l.id))}>
                  <h3>{ab.n}</h3>
                  <ul class="pa-liste">
                    <For each={ab.leistungen.filter((l) => weitere() || gewaehlt().has(l.id))}>{(l) => (
                      <li classList={{ aus: !gewaehlt().has(l.id) }}>
                        <label class="druck-haken"><input type="checkbox" checked={gewaehlt().has(l.id)} onChange={(e) => umschalten(l.id, e.currentTarget.checked)} /> <span title={l.info}>{l.n}</span></label>
                        <span class="still-text klein-text">{l.gw}{l.din ? ` · DIN ${l.din}` : ''}{l.sc === 'we' && (as()!.einheiten > 1) ? ' · je Einheit' : ''}</span>
                        <Show when={!l.ms} fallback={<span class="still-text klein-text">Meilenstein</span>}>
                          <span class="pa-dauerzelle"><input class="pa-dauer" type="number" min={0} aria-label={`Dauer ${l.n}`} title={as()!.rechenweg(l).weg} value={a().dauern?.[l.id] ?? ''} placeholder={`${as()!.rechenweg(l).d}`}
                            onChange={(e) => { const d = { ...(a().dauern ?? {}) }; if (e.currentTarget.value === '') delete d[l.id]; else d[l.id] = Number(e.currentTarget.value); setze({ dauern: d }); }} /> AT</span>
                        </Show>
                      </li>
                    )}</For>
                  </ul>
                </Show>
              )}</For>
            </Show>
          </div>
        </div>
      </Show>
    </Dialog>
  );
}
