// Projekt wählen – wie im bisherigen Bauportal: Suche, Meine · Alle · Archiv, ★ Favoriten und „Zuletzt benutzt“ zuerst,
// am Rechner rechts die Vorschau (Karte, Angaben, Bearbeiten). Tastatur: ↑↓ wählen, Enter öffnen, F2 bearbeiten.
// Bearbeiten öffnet die Projektkarte im Schwebefenster. Ordner auf dem Dateiserver, zu denen es noch kein Projekt gibt,
// lassen sich beim Suchen direkt als Projekt anlegen. Favoriten und Zuletzt merkt sich der Server je Benutzer (projekt_merker).
import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { Zeile } from '../kern/befehl';
import { ausfuehren, sicht, lebende } from './unterbau/abgleich';
import { darf, ich, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { Detailkarte, NeuFenster } from './baukasten/detailkarte';
import { Schwebefenster } from './baukasten/schwebefenster';
import { bauherrVon, projektId, setProjektId } from './projekt';

type Filter = 'meine' | 'alle' | 'archiv';
const adresse = (p: Zeile) => [p.werte.strasse, [p.werte.plz, p.werte.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const titel = (p: Zeile) => [p.werte.nummer, p.werte.name].filter(Boolean).join(' · ');
const natur = (a: Zeile, b: Zeile) => titel(a).localeCompare(titel(b), 'de', { numeric: true });

/** Merker (Favorit, zuletzt) des angemeldeten Benutzers zu einem Projekt. */
const merker = (pid: string) => lebende('projekt_merker').find((m) => m.werte.projekt === pid && m.werte.benutzer === ich().id);
function merken(pid: string, werte: { favorit?: boolean; zuletzt?: string }) {
  const m = merker(pid);
  if (m) ausfuehren({ objekt: 'projekt_merker', art: 'aendern', objektId: m.id, werte }, '', true);
  else ausfuehren({ objekt: 'projekt_merker', art: 'anlegen', objektId: neueKennung(), werte: { projekt: pid, benutzer: ich().id, favorit: false, zuletzt: '', ...werte } }, '', true);
}

/** Projekt wählen und als zuletzt benutzt merken – die eine Stelle, über die die Projektwahl ein Projekt setzt. */
export function projektWaehlen(pid: string) {
  setProjektId(pid);
  if (sicht.projekt?.[pid]) merken(pid, { zuletzt: new Date().toISOString() });
}

export function Projektwahl(p: { kartenZusatz: (z: Zeile) => JSX.Element }) {
  const [offen, setOffen] = createSignal(false);
  let knopf!: HTMLButtonElement;
  const [neu, setNeu] = createSignal<Record<string, string> | null>(null);
  const aktuell = () => (projektId() ? sicht.projekt?.[projektId()!] : undefined);
  return (
    <>
      <div class="projektwahl">
        <button type="button" ref={knopf} class="projektwahl-knopf" aria-haspopup="dialog" aria-label={`Projekt: ${aktuell() ? titel(aktuell()!) : 'keine Auswahl'}`} onClick={() => setOffen(!offen())}>
          <span class="pw-titel"><b>{aktuell() && !aktuell()!.geloescht ? titel(aktuell()!) : 'Projekt wählen …'}</b>
            <Show when={aktuell() && !aktuell()!.geloescht && adresse(aktuell()!)}><small>{adresse(aktuell()!)}</small></Show></span><span aria-hidden="true">▾</span>
        </button>
      </div>
      <Show when={offen()}>
        <WahlFenster unter={knopf} kartenZusatz={p.kartenZusatz} onZu={() => setOffen(false)} onNeu={(werte) => { setOffen(false); setNeu(werte); }} />
      </Show>
      <Show when={neu()}>{(start) => <NeuFenster modell={modell('projekt')} start={start()} onZu={(id) => { setNeu(null); if (id) projektWaehlen(id); }} />}</Show>
    </>
  );
}

// Projektwahl und Projekteinstellungen in EINEM verschiebbaren, in der Größe änderbaren Fenster: links die Projekte,
// rechts die Vorschau – oder, mit ✎ / F2, die Einstellungen des Projekts (Projektkarte mit Ordner, Beteiligten, Mitgliedern).
function WahlFenster(p: { unter?: HTMLElement; kartenZusatz: (z: Zeile) => JSX.Element; onZu: () => void; onNeu: (werte: Record<string, string>) => void }) {
  const [bearbeiten, setBearbeiten] = createSignal<string | null>(null);
  const bearbeitet = () => (bearbeiten() ? sicht.projekt?.[bearbeiten()!] : undefined);
  const projekte = () => lebende('projekt');
  const mein = (id: string) => lebende('projekt_mitglied').some((m) => m.werte.projekt === id && m.werte.benutzer === ich().id);
  const [q, setQ] = createSignal('');
  const [filter, setFilter] = createSignal<Filter>(projekte().some((x) => mein(x.id) && x.werte.status !== 'archiviert') ? 'meine' : 'alle');
  const [sel, setSel] = createSignal(0);
  const [ordner, setOrdner] = createSignal<string[]>([]);
  const [breit, setBreit] = createSignal(true);   // Platz für die rechte Seite (folgt der Fenstergröße)
  let rahmen!: HTMLDivElement;
  onMount(() => { const ro = new ResizeObserver(() => setBreit(rahmen.clientWidth > 640)); ro.observe(rahmen); onCleanup(() => ro.disconnect()); });
  // Neue Projekte: nur Rollen, die alle Projekte sehen (wie in der Datenbank)
  const anlegen = darf('projekt', 'schreiben') && !!zustand()!.rollen.find((r) => r.name === ich().rolle)?.alleProjekte;
  onMount(() => { if (anlegen) ruf<{ ordner: string[] }>('/api/ablage/ordner').then((r) => setOrdner(r.ordner)).catch(() => { /* Ablage nicht eingerichtet */ }); });

  const passt = (x: Zeile) => { const t = [x.werte.nummer, x.werte.name, x.werte.strasse, x.werte.plz, x.werte.ort, bauherrVon(x.werte, sicht.kontakt)].join(' ').toLowerCase(); return q().trim().toLowerCase().split(/\s+/).every((w) => t.includes(w)); };
  const fav = (id: string) => merker(id)?.werte.favorit === true;
  const zuletzt = (id: string) => String(merker(id)?.werte.zuletzt ?? '');
  // Gruppen wie im bisherigen Bauportal; REIHE ist die Reihenfolge für die Tastatur
  const gruppen = createMemo(() => {
    const basis = projekte().filter((x) => (filter() === 'archiv') === (x.werte.status === 'archiviert'));
    const g: { titel: string; zeilen: Zeile[] }[] = [];
    if (q().trim()) {
      g.push({ titel: 'Treffer', zeilen: basis.filter(passt).sort((a, b) => Number(fav(b.id)) - Number(fav(a.id)) || zuletzt(b.id).localeCompare(zuletzt(a.id)) || natur(a, b)) });
    } else {
      const schon = new Set<string>();
      const nimm = (t: string, l: Zeile[]) => { l.forEach((x) => schon.add(x.id)); g.push({ titel: t, zeilen: l }); };
      const sicht_ = filter() === 'meine' ? basis.filter((x) => mein(x.id) || fav(x.id)) : basis;
      nimm('★ Favoriten', sicht_.filter((x) => fav(x.id)).sort(natur));
      nimm('Zuletzt benutzt', basis.filter((x) => zuletzt(x.id) && !schon.has(x.id)).sort((a, b) => zuletzt(b.id).localeCompare(zuletzt(a.id))).slice(0, 5));
      nimm(filter() === 'archiv' ? 'Archiv' : filter() === 'meine' ? 'Meine Projekte' : 'Alle Projekte', sicht_.filter((x) => !schon.has(x.id)).sort(natur));
    }
    return g.filter((x) => x.zeilen.length);
  });
  const reihe = () => gruppen().flatMap((x) => x.zeilen);
  const gewaehlt = () => reihe()[Math.min(sel(), reihe().length - 1)];
  const freieOrdner = () => {
    const t = q().trim().toLowerCase(); if (t.length < 2) return [];
    const belegt = new Set(projekte().flatMap((x) => [String(x.werte.ordner ?? ''), String(x.werte.name ?? '')]));
    return ordner().filter((n) => n.toLowerCase().includes(t) && !belegt.has(n)).slice(0, 8);
  };
  const waehlen = (x: Zeile) => { p.onZu(); projektWaehlen(x.id); };
  const ausOrdner = (n: string) => {
    const id = neueKennung();
    ausfuehren({ objekt: 'projekt', art: 'anlegen', objektId: id, werte: { name: n, nummer: '', status: 'aktiv', bauherr: '', strasse: '', plz: '', ort: '', ordner: n, notiz: '', kennung: '' } }, `Projekt „${n}“ aus dem Ordner anlegen`);
    p.onZu(); projektWaehlen(id);
  };
  const taste = (e: KeyboardEvent) => {
    const n = reihe().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(n - 1, i + 1)); rollen(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); rollen(); }
    else if (e.key === 'Enter' && gewaehlt()) { e.preventDefault(); waehlen(gewaehlt()!); }
    else if (e.key === 'F2' && gewaehlt()) { e.preventDefault(); setBearbeiten(gewaehlt()!.id); }
  };
  let liste!: HTMLDivElement;
  const rollen = () => queueMicrotask(() => liste.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  const bauleitung = (id: string) => lebende('projekt_mitglied').filter((m) => m.werte.projekt === id).map((m) => sicht.benutzer?.[String(m.werte.benutzer)])
    .filter((b) => b && b.werte.rolle === 'bauleitung').map((b) => String(b!.werte.name)).join(', ');
  const karte = (x: Zeile) => `https://www.google.com/maps?q=${encodeURIComponent(adresse(x) || String(x.werte.name))}&hl=de&z=14&output=embed`;

  return (
    <Schwebefenster titel="Projekt wählen" schluessel="projektwahl" breite={960} hoehe={600} unter={p.unter} onZu={p.onZu}
      kopfZusatz={<Show when={anlegen}><button type="button" class="knopf klein haupt" onClick={() => p.onNeu({ name: q().trim() })}>＋ Neues Projekt</button></Show>}>
      <div class="pw" ref={rahmen} onKeyDown={taste}>
        <div class="pw-links" hidden={!breit() && !!bearbeitet()}>
          <input type="search" class="suche" placeholder="Projekt suchen – Nummer, Name oder Adresse" aria-label="Projekt suchen" value={q()} autocomplete="off"
            onInput={(e) => { setQ(e.currentTarget.value); setSel(0); }} />
          <div class="auswahl pw-filter" role="radiogroup" aria-label="Filter">
            <For each={[['meine', 'Meine'], ['alle', 'Alle'], ['archiv', 'Archiv']] as const}>{([k, t]) =>
              <button type="button" role="radio" aria-checked={filter() === k} classList={{ aktiv: filter() === k }} onClick={() => { setFilter(k); setSel(0); }}>{t}</button>}</For>
          </div>
          <div class="pw-liste" role="listbox" aria-label="Projekte" ref={liste}>
            <For each={gruppen()}>{(g) => <>
              <div class="pw-gruppe">{g.titel}</div>
              <For each={g.zeilen}>{(x) => (
                <div class="pw-zeile" role="option" aria-selected={gewaehlt()?.id === x.id} classList={{ aktiv: x.id === projektId() }}
                  onClick={() => waehlen(x)} onMouseMove={() => { if (!bearbeiten()) setSel(reihe().indexOf(x)); }}>
                  <button type="button" class="pw-stern" classList={{ an: fav(x.id) }} aria-label={fav(x.id) ? 'Favorit entfernen' : 'Als Favorit oben anheften'}
                    onClick={(e) => { e.stopPropagation(); merken(x.id, { favorit: !fav(x.id) }); }}>{fav(x.id) ? '★' : '☆'}</button>
                  <b>{String(x.werte.nummer ?? '')}</b>
                  <span class="pw-name">{String(x.werte.name ?? '')}<Show when={x.werte.ort}><small> · {String(x.werte.ort)}</small></Show>
                    <Show when={filter() !== 'meine' && !mein(x.id)}><small title="Projekt anderer Bauleiter:innen"> 👥</small></Show></span>
                  <button type="button" class="knopf still klein" aria-label="Bearbeiten" title="Bearbeiten (F2)" onClick={(e) => { e.stopPropagation(); setBearbeiten(x.id); }}>✎</button>
                </div>
              )}</For>
            </>}</For>
            <Show when={!reihe().length}><p class="still-text">{q().trim() ? `Kein Projekt passt zu „${q().trim()}“.` : filter() === 'meine' ? 'Du bist bei keinem Projekt eingetragen – „Alle“ zeigt alle.' : 'Keine Projekte.'}</p></Show>
            <Show when={freieOrdner().length}>
              <div class="pw-gruppe">Ordner auf dem Server – anklicken legt das Projekt an</div>
              <For each={freieOrdner()}>{(n) => <button type="button" class="pw-zeile pw-ordner" onClick={() => ausOrdner(n)}>＋ {n}</button>}</For>
            </Show>
          </div>
          <small class="still-text">↑↓ wählen · Enter öffnen · F2 bearbeiten</small>
        </div>
        <Show when={bearbeitet()}>{(z) => (
          <div class="pw-einstellungen">
            <button type="button" class="knopf klein still" onClick={() => setBearbeiten(null)}>‹ zurück zur Vorschau</button>
            <Detailkarte modell={modell('projekt')} zeile={z()} zusatz={p.kartenZusatz} />
          </div>
        )}</Show>
        <Show when={breit() && !bearbeitet() && gewaehlt()}>{(x) => (
          <aside class="pw-vorschau" aria-label="Vorschau">
            <iframe class="pw-karte" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Karte" src={karte(x())} />
            <b>{titel(x())}</b>
            <Show when={adresse(x())}><small class="still-text">{adresse(x())}</small></Show>
            <dl>
              <dt>Bauherr:in</dt><dd>{bauherrVon(x().werte, sicht.kontakt) || '–'}</dd>
              <dt>Bauleitung</dt><dd>{bauleitung(x().id) || '–'}</dd>
              <dt>Stand</dt><dd>{modell('projekt').felder.find((f) => f.name === 'status')!.optionen!.find((o) => o.wert === x().werte.status)?.titel ?? '–'}</dd>
            </dl>
            <div class="pw-knoepfe">
              <button type="button" class="knopf" onClick={() => setBearbeiten(x().id)}>✎ Bearbeiten</button>
              <button type="button" class="knopf" onClick={() => merken(x().id, { favorit: !fav(x().id) })}>{fav(x().id) ? '★ Favorit' : '☆ Favorit'}</button>
            </div>
          </aside>
        )}</Show>
      </div>
    </Schwebefenster>
  );
}

