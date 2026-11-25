// Adressen: Befehle für mehrere gewählte Kontakte (wie im bisherigen Bauportal, Mock „Adressen auswählen“):
// ＋ Projekt · Ändern (Art; Gewerk, Stichwort, Tag dazu oder entfernen; Projekt entfernen) · Ausgeben (Excel, Visitenkarten)
// · Zusammenführen (2–8). Jede Änderung ist ein Schritt – ein „Zurück“ nimmt sie für alle Gewählten zurück.
// „Mail an alle“ kommt mit der zentralen Versandstelle.
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Wert } from '../kern/modell';
import type { Vorlage } from '../kern/befehl';
import { ausfuehrenMehrere, lebende, rueckgaengig, sicht } from './unterbau/abgleich';
import { darf, ladeDatei, modell, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { Auswahlliste } from './baukasten/auswahlliste';
import type { AuswahlBefehl } from './baukasten/auswahl';
import { aufraeumenOeffnen } from './aufraeumen';

type Art = 'art' | 'gewerk' | 'stichworte' | 'tags' | 'projekt' | 'projekt_weg';
const [offen, setOffen] = createSignal<{ art: Art; ids: string[] } | null>(null);
const LISTE = /\s*[,;]\s*/;
const teile = (w: unknown) => String(w ?? '').split(LISTE).map((x) => x.trim()).filter(Boolean);
const werte = (id: string) => sicht.kontakt?.[id]?.werte ?? {};
const zahl = (n: number) => `${n} Kontakt${n === 1 ? '' : 'e'}`;

function schritt(vs: Vorlage[], titel: string) {
  if (!vs.length) { hinweis('Nichts zu ändern – alle gewählten hatten das schon.'); return; }
  ausfuehrenMehrere(vs, titel);
  hinweis(titel + '.', { aktion: { titel: 'Rückgängig', tun: rueckgaengig } });
}

/** Die Befehle der Adressen für die Auswahl; excel kommt vom Baustein (gezeigte Spalten). */
export function kontaktAuswahl(h: { excel: (ids: string[]) => void }): AuswahlBefehl[] {
  const schreiben = () => (darf('kontakt', 'schreiben') ? undefined : 'Dazu fehlt dir das Recht');
  return [
    { titel: '＋ Projekt', gesperrt: () => (darf('projekt_kontakt', 'schreiben') ? undefined : 'Dazu fehlt dir das Recht'), tun: (ids) => setOffen({ art: 'projekt', ids }) },
    { titel: 'Ändern', gesperrt: schreiben, menue: (ids) => [
      { titel: 'Art setzen …', tun: () => setOffen({ art: 'art', ids }) },
      { titel: 'Gewerk …', tun: () => setOffen({ art: 'gewerk', ids }) },
      { titel: 'Stichwort …', tun: () => setOffen({ art: 'stichworte', ids }) },
      { titel: 'Tag …', tun: () => setOffen({ art: 'tags', ids }) },
      { titel: 'Projekt entfernen …', gesperrt: !darf('projekt_kontakt', 'loeschen'), tun: () => setOffen({ art: 'projekt_weg', ids }) },
    ] },
    { titel: 'Ausgeben', menue: (ids) => [
      { titel: `Excel (${zahl(ids.length)})`, tun: () => h.excel(ids) },
      { titel: 'Visitenkarten (vCard)', tun: () => void ladeDatei('/api/kontakte.vcf', { ids }).catch((e) => hinweis((e as Error).message, { art: 'fehler' })) },
    ] },
    { titel: 'Zusammenführen', gesperrt: (ids) => (!darf('kontakt', 'loeschen') ? 'Dazu fehlt dir das Recht' : ids.length < 2 ? 'Ab zwei gewählten Kontakten' : ids.length > 8 ? 'Höchstens 8 auf einmal' : undefined),
      tun: (ids) => aufraeumenOeffnen(ids) },
  ];
}

const FELD: Record<'gewerk' | 'stichworte' | 'tags', string> = { gewerk: 'Gewerk', stichworte: 'Stichwort', tags: 'Tag' };

function Aendern(p: { art: Art; ids: string[] }) {
  const n = p.ids.length, zu = () => setOffen(null);
  // ---- Art setzen ----
  const [art, setArt] = createSignal<Wert>('');
  // ---- Gewerk / Stichwort / Tag: dazu oder entfernen ----
  const listenFeld = p.art === 'gewerk' || p.art === 'stichworte' || p.art === 'tags' ? p.art : null;
  const [weg, setWeg] = createSignal(false);
  const [wort, setWort] = createSignal<Wert>('');
  const vorhanden = createMemo(() => {   // Werte der Gewählten, mit Anzahl (zum Entfernen)
    const z = new Map<string, number>();
    if (listenFeld) for (const id of p.ids) for (const w of teile(werte(id)[listenFeld])) z.set(w, (z.get(w) ?? 0) + 1);
    return [...z].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  });
  // ---- Projekt dazu / entfernen ----
  const [projekt, setProjekt] = createSignal('');
  const projektname = (id: string) => String(sicht.projekt?.[id]?.werte.name ?? '');
  const beteiligt = () => lebende('projekt_kontakt').filter((b) => p.ids.includes(String(b.werte.kontakt)));
  const projekte = () => (p.art === 'projekt_weg' ? [...new Set(beteiligt().map((b) => String(b.werte.projekt)))] : lebende('projekt').map((x) => x.id))
    .map((id) => ({ wert: id, titel: projektname(id) })).filter((o) => o.titel).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));

  const ok = () => {
    if (p.art === 'art') {
      const w = String(art() ?? ''); if (!w) return;
      schritt(p.ids.filter((id) => werte(id).art !== w).map((id) => ({ objekt: 'kontakt', art: 'aendern', objektId: id, werte: { art: w } })), `Art „${modell('kontakt').felder.find((f) => f.name === 'art')!.optionen!.find((o) => o.wert === w)?.titel ?? w}“ für ${zahl(n)} gesetzt`);
    } else if (listenFeld) {
      const w = String(wort() ?? '').trim(); if (!w) return;
      const k = w.toLocaleLowerCase('de');
      const vs = p.ids.flatMap((id): Vorlage[] => {
        const l = teile(werte(id)[listenFeld]), hat = l.some((x) => x.toLocaleLowerCase('de') === k);
        if (weg() ? !hat : hat) return [];
        const neu = weg() ? l.filter((x) => x.toLocaleLowerCase('de') !== k) : [...l, w];
        return [{ objekt: 'kontakt', art: 'aendern', objektId: id, werte: { [listenFeld]: neu.join(', ') } }];
      });
      schritt(vs, `${FELD[listenFeld]} „${w}“ ${weg() ? 'entfernt' : 'dazu'} – ${zahl(vs.length)}`);
    } else if (p.art === 'projekt') {
      const pid = projekt(); if (!pid) return;
      const da = new Set(beteiligt().filter((b) => b.werte.projekt === pid).map((b) => String(b.werte.kontakt)));
      const vs = p.ids.filter((id) => !da.has(id)).map((id): Vorlage => {
        const alt = Object.values(sicht.projekt_kontakt ?? {}).find((e) => e.geloescht && e.werte.projekt === pid && e.werte.kontakt === id);
        return alt ? { objekt: 'projekt_kontakt', art: 'wiederherstellen', objektId: alt.id } : { objekt: 'projekt_kontakt', art: 'anlegen', objektId: neueKennung(), werte: { projekt: pid, kontakt: id, aufgabe: String(werte(id).gewerk ?? '') } };
      });
      schritt(vs, `${zahl(vs.length)} am Projekt „${projektname(pid)}“ beteiligt`);
    } else if (p.art === 'projekt_weg') {
      const pid = projekt(); if (!pid) return;
      const vs = beteiligt().filter((b) => b.werte.projekt === pid).map((b): Vorlage => ({ objekt: 'projekt_kontakt', art: 'loeschen', objektId: b.id }));
      schritt(vs, `${zahl(vs.length)} aus dem Projekt „${projektname(pid)}“ entfernt`);
    }
    zu();
  };
  const titel = { art: 'Art setzen', gewerk: 'Gewerk', stichworte: 'Stichwort', tags: 'Tag', projekt: 'Am Projekt beteiligen', projekt_weg: 'Aus einem Projekt entfernen' }[p.art];
  const bereit = () => (p.art === 'art' ? !!art() : listenFeld ? !!String(wort() ?? '').trim() : !!projekt());
  return (
    <Dialog titel={`${titel} – ${zahl(n)}`} onAbbrechen={zu} geaendert={bereit}
      knoepfe={<><button class="knopf" data-abbrechen onClick={zu}>Abbrechen</button><button class="knopf haupt" disabled={!bereit()} onClick={ok}>OK</button></>}>
      <Show when={p.art === 'art'}>
        <FeldEingabe feld={{ ...modell('kontakt').felder.find((f) => f.name === 'art')!, pflicht: false }} wert={art()} objekt="kontakt" sofort onWert={setArt} />
      </Show>
      <Show when={listenFeld}>{(f) => (<>
        <div class="auswahl" role="radiogroup" aria-label="dazu oder entfernen">
          <button type="button" role="radio" aria-checked={!weg()} classList={{ aktiv: !weg() }} onClick={() => { setWeg(false); setWort(''); }}>dazu</button>
          <button type="button" role="radio" aria-checked={weg()} classList={{ aktiv: weg() }} disabled={!vorhanden().length} onClick={() => { setWeg(true); setWort(''); }}>entfernen</button>
        </div>
        <Show when={!weg()} fallback={
          <div class="wahl-chips" role="radiogroup" aria-label={`${FELD[f()]} entfernen`}>
            <For each={vorhanden()}>{([w, k]) => <button type="button" role="radio" aria-checked={wort() === w} classList={{ aktiv: wort() === w }} onClick={() => setWort(w)}>{w} <span class="still-text">{k}</span></button>}</For>
          </div>}>
          <FeldEingabe feld={{ name: f() === 'gewerk' ? 'gewerk' : f(), titel: FELD[f()], art: 'text', vorschlagen: true }} wert={wort()} objekt="kontakt" sofort onWert={setWort} />
        </Show>
      </>)}</Show>
      <Show when={p.art === 'projekt' || p.art === 'projekt_weg'}>
        <Show when={projekte().length} fallback={<p class="still-text">{p.art === 'projekt_weg' ? 'Die gewählten Kontakte sind in keinem Projekt beteiligt.' : 'Es gibt noch kein Projekt.'}</p>}>
          <Auswahlliste titel="Projekt" platzhalter="Projekt wählen …" optionen={projekte()} wert={projekt() || null} onWert={setProjekt} />
        </Show>
      </Show>
    </Dialog>
  );
}

/** Die Fenster der Auswahl – einmal in der App eingehängt. */
export function KontaktAuswahlFenster() {
  return <Show when={offen()}>{(o) => <Aendern art={o().art} ids={o().ids} />}</Show>;
}
