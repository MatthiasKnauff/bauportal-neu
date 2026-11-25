// Modul „Pläne und Dateien“: der Ordner des gewählten Projekts auf dem Dateiserver.
// Setzt nur fertige Bausteine in den Rahmen: Baum (Ordner) | Tabelle (Inhalt) | Details (Datei).
// Die Dateien bleiben auf dem Dateiserver und werden nicht ins Gerät geholt – diese Ansicht braucht Verbindung.
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Zeile } from '../kern/befehl';
import type { ObjektModell } from '../kern/modell';
import { sicht } from './unterbau/abgleich';
import { ruf } from './unterbau/api';
import { Baum, type Knoten } from './baukasten/baum';
import { Dialog } from './baukasten/dialog';
import { Rahmen, type RahmenSteuer } from './baukasten/rahmen';
import { Tabelle } from './baukasten/tabelle';
import { projektId } from './projekt';

interface Eintrag { name: string; ordner: boolean; groesse: number; geaendert: string; kennung: string }

// So sieht eine Datei für den Tabellen-Baustein aus (nur Anzeige, kein Objekt der Datenbank).
const DATEI: ObjektModell = {
  name: 'datei', titel: 'Datei', titelMehrzahl: 'Dateien', anzeigeFeld: 'name', rechte: { lesen: [], schreiben: [], loeschen: [] },
  felder: [
    { name: 'name', titel: 'Name', art: 'text', inListe: true, breite: 380 },
    { name: 'art', titel: 'Art', art: 'text', inListe: true, breite: 110 },
    { name: 'groesse', titel: 'Größe', art: 'zahl', inListe: true, breite: 110 },
    { name: 'geaendert', titel: 'Geändert', art: 'text', inListe: true, breite: 160 },
  ],
};
const groesse = (b: number) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('de', { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const zeit = (iso: string) => new Date(iso).toLocaleString('de', { dateStyle: 'medium', timeStyle: 'short' });
const endung = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
const BILD = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export function DateienAnsicht() {
  const projekt = () => { const id = projektId(); const z = id ? sicht.projekt?.[id] : undefined; return z && !z.geloescht ? z : undefined; };
  const [ordner, setOrdner] = createStore<Record<string, Eintrag[]>>({});   // geladene Ordner: Pfad -> Inhalt
  const [pfad, setPfad] = createSignal('');
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [stoerung, setStoerung] = createSignal('');
  let rahmen!: RahmenSteuer;

  const hole = async (p: string, neu = false) => {
    if (ordner[p] && !neu) return;
    try { setOrdner(p, (await ruf<{ eintraege: Eintrag[] }>(`/api/ablage/liste?projekt=${projekt()!.id}&pfad=${encodeURIComponent(p)}`)).eintraege); setStoerung(''); }
    catch (e) { if (p === pfad()) setStoerung((e as Error).message); }
  };
  // Projekt gewechselt (oder sein Ordner geändert): von vorn
  createEffect(on(() => [projekt()?.id, projekt()?.werte.ordner], () => { for (const k of Object.keys(ordner)) setOrdner(k, undefined!); setPfad(''); setGewaehlt(null); setStoerung(''); if (projekt()) void hole('', true); }));
  const gehe = (p: string) => { setPfad(p); setGewaehlt(null); void hole(p); };

  const knoten = createMemo((): Knoten[] => {
    const unter = (p: string): Knoten[] => (ordner[p] ?? []).filter((e) => e.ordner).map((e) => { const kind = p ? `${p}/${e.name}` : e.name; return { id: kind, titel: e.name, kinder: unter(kind), hatKinder: !ordner[kind] || ordner[kind]!.some((x) => x.ordner) }; });
    return [{ id: '', titel: String(projekt()?.werte.name ?? 'Projekt'), kinder: unter('') }];
  });
  const zeilen = createMemo((): Zeile[] => (ordner[pfad()] ?? []).map((e) => ({ id: e.name, geloescht: false,
    werte: { name: e.name, art: e.ordner ? 'Ordner' : (endung(e.name).toUpperCase() || 'Datei'), groesse: e.ordner ? null : e.groesse, geaendert: e.geaendert } })));
  const eintrag = (name: string | null) => (ordner[pfad()] ?? []).find((e) => e.name === name);
  const datei = createMemo(() => { const e = eintrag(gewaehlt()); return e && !e.ordner ? e : undefined; });
  const adresse = (name: string, laden = false) => `/api/ablage/datei?projekt=${projekt()!.id}&pfad=${encodeURIComponent(pfad() ? `${pfad()}/${name}` : name)}${laden ? '&laden=1' : ''}`;
  const oeffne = (z: Zeile) => { const e = eintrag(z.id); if (!e) return; if (e.ordner) gehe(pfad() ? `${pfad()}/${e.name}` : e.name); else window.open(adresse(e.name), '_blank', 'noopener'); };
  const krumen = () => pfad().split('/').filter(Boolean);
  const leer = (text: string) => <div class="mitte"><p class="still-text">{text}</p></div>;

  return (
    <Show when={projekt()} fallback={<Rahmen schluessel="dateien" inhalt={leer('Bitte oben ein Projekt wählen.')} />}>
      <Rahmen schluessel="dateien" steuer={(s) => (rahmen = s)}
        knoepfe={[{ titel: 'Aktualisieren', zeichen: 'aktualisieren', gruppe: 'Ansicht', tun: () => void hole(pfad(), true) }]}
        menueMitte={
          <nav class="krumen" aria-label="Pfad">
            <button onClick={() => gehe('')}>{String(projekt()!.werte.name)}</button>
            <For each={krumen()}>{(t, i) => <><span aria-hidden="true">›</span><button onClick={() => gehe(krumen().slice(0, i() + 1).join('/'))}>{t}</button></>}</For>
          </nav>
        }
        baumTitel="Ordner"
        baum={<Baum titel="Ordner" knoten={knoten()} gewaehlt={pfad()} onWahl={gehe} anfangsZu onAuf={(id) => void hole(id)} symbol={() => '▤'} />}
        inhalt={
          <Show when={!stoerung()} fallback={leer(stoerung())}>
            <Tabelle modell={DATEI} zeilen={zeilen()} gewaehlt={gewaehlt()} onWahl={(id) => { setGewaehlt(id); if (id && eintrag(id) && !eintrag(id)!.ordner) rahmen.detailsZeigen(); }} onOeffnen={oeffne}
              leer={ordner[pfad()] ? 'Dieser Ordner ist leer.' : 'Ordner wird gelesen …'}
              zelle={(f, z) => (f.name === 'groesse' ? (z.werte.groesse === null ? '' : groesse(Number(z.werte.groesse))) : f.name === 'geaendert' ? zeit(String(z.werte.geaendert)) : f.name === 'name' && z.werte.art === 'Ordner' ? <span class="ordnername">▤ {String(z.werte.name)}</span> : undefined)}
              zeilenMenue={(z) => (z.werte.art === 'Ordner' ? [{ titel: 'Öffnen', tun: () => oeffne(z) }] : [
                { titel: 'Öffnen', tun: () => oeffne(z) },
                { titel: 'Herunterladen', tun: () => { location.href = adresse(z.id, true); } },
              ])} />
          </Show>
        }
        detailsTitel={datei()?.name}
        details={datei() ? <Show when={datei()}>{(d) => (
          <aside class="karte" aria-label={`Datei ${d().name}`}>
            <div class="karte-kopf">
              <button class="knopf still nur-schmal" onClick={() => setGewaehlt(null)}>‹ Liste</button>
              <h2>{d().name}</h2>
              <button class="knopf still nur-breit" aria-label="Details zuklappen" title="Zuklappen" onClick={() => rahmen.detailsZuklappen()}>⇥</button>
              <button class="knopf still nur-breit" aria-label="Details schließen" onClick={() => setGewaehlt(null)}>×</button>
            </div>
            <div class="karte-inhalt">
              <Show when={BILD.includes(endung(d().name))}><img class="vorschau" src={adresse(d().name)} alt={`Vorschau ${d().name}`} loading="lazy" /></Show>
              <dl class="angaben">
                <dt>Art</dt><dd>{endung(d().name).toUpperCase() || 'Datei'}</dd>
                <dt>Größe</dt><dd>{groesse(d().groesse)}</dd>
                <dt>Geändert</dt><dd>{zeit(d().geaendert)}</dd>
                <dt>Ordner</dt><dd>{pfad() || '(oberste Ebene)'}</dd>
              </dl>
              <div class="reihe">
                <a class="knopf haupt" href={adresse(d().name)} target="_blank" rel="noopener">Öffnen</a>
                <a class="knopf" href={adresse(d().name, true)}>Herunterladen</a>
              </div>
              <p class="still-text klein-text">Das Original liegt auf dem Dateiserver und bleibt dort.</p>
            </div>
          </aside>
        )}</Show> : undefined} />
    </Show>
  );
}

/** Fenster zum Zuordnen: einen Ordner der Freigabe wählen (für alle, die Projekte ändern dürfen). */
export function OrdnerFenster(p: { start: string; onWahl: (pfad: string) => void; onZu: () => void }) {
  const [pfad, setPfad] = createSignal(p.start.split(/[\\/]+/).filter(Boolean).join('/'));
  const [liste, setListe] = createSignal<string[] | null>(null);
  const [stoerung, setStoerung] = createSignal('');
  createEffect(() => {
    const hier = pfad(); setListe(null); setStoerung('');
    ruf<{ ordner: string[] }>(`/api/ablage/ordner?pfad=${encodeURIComponent(hier)}`)
      .then((r) => { if (hier === pfad()) setListe(r.ordner); }, (e: Error) => { if (hier === pfad()) setStoerung(e.message); });
  });
  const teile = () => pfad().split('/').filter(Boolean);
  return (
    <Dialog titel="Ordner auf dem Dateiserver wählen" onAbbrechen={p.onZu}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" disabled={!pfad()} onClick={() => p.onWahl(pfad())}>Diesen Ordner nehmen</button></>}>
      <nav class="krumen" aria-label="Pfad">
        <button onClick={() => setPfad('')}>Freigabe</button>
        <For each={teile()}>{(t, i) => <><span aria-hidden="true">›</span><button onClick={() => setPfad(teile().slice(0, i() + 1).join('/'))}>{t}</button></>}</For>
      </nav>
      <Show when={!stoerung()} fallback={<p class="feld-fehler" role="alert">{stoerung()}</p>}>
        <Show when={liste()} fallback={<p class="still-text">Ordner wird gelesen …</p>}>
          <ul class="ordnerliste">
            <For each={liste()}>{(n) => <li><button onClick={() => setPfad(pfad() ? `${pfad()}/${n}` : n)}>▤ {n}</button></li>}</For>
            <Show when={!liste()!.length}><li class="still-text">Keine Unterordner.</li></Show>
          </ul>
        </Show>
      </Show>
    </Dialog>
  );
}
