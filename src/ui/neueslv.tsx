// Neues LV (wie im bisherigen Bauportal: „Womit anfangen?“): leer, aus einer GAEB-Datei, als Kopie eines LV (auch aus anderen
// Projekten, ohne Preise) oder aus dem Gebäudemodell. Bezeichnung, Gewerk und Nummer gleich dabei.
import { For, Show, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Wert } from '../kern/modell';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { gaebEinlesen } from './uebernahme';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { modell, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

type Weg = 'leer' | 'gaeb' | 'kopie' | 'modell';
const WEGE: { wert: Weg; titel: string; text: string }[] = [
  { wert: 'leer', titel: 'Leer anfangen', text: 'Positionen selbst schreiben oder aus einem anderen LV kopieren' },
  { wert: 'gaeb', titel: 'Aus einer GAEB-Datei', text: 'X83, X86 oder X81 – Titel, Positionen und Texte' },
  { wert: 'kopie', titel: 'Kopie eines LV', text: 'auch aus anderen Projekten – ohne Preise' },
  { wert: 'modell', titel: 'Aus dem Gebäudemodell', text: 'Schichten der Aufbauten wählen – Mengen aus den Bauteilen' },
];
const lvTitel = (l: Zeile) => [l.werte.nummer, l.werte.name].filter(Boolean).join(' · ');
/** Nächste freie LV-Nummer im Projekt (zweistellig, wie bisher). */
const naechsteNr = (projekt: string) => String(Math.max(0, ...lebende('lv').filter((l) => l.werte.projekt === projekt).map((l) => Number.parseInt(String(l.werte.nummer ?? ''), 10) || 0)) + 1).padStart(2, '0');

export function NeuesLv(p: { projekt: string; onZu: () => void; onFertig: (lv: string, weg: Weg) => void }) {
  const m = modell('lv'), feld = (n: string) => m.felder.find((f) => f.name === n)!;
  const [name, setName] = createSignal(''), [gewerk, setGewerk] = createSignal<Wert>(null), [nr, setNr] = createSignal(naechsteNr(p.projekt));
  const [weg, setWeg] = createSignal<Weg>('leer');
  const projekte = () => lebende('projekt').filter((x) => lebende('lv').some((l) => l.werte.projekt === x.id)).sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }));
  const [quellProjekt, setQuellProjekt] = createSignal(projekte().some((x) => x.id === p.projekt) ? p.projekt : projekte()[0]?.id ?? '');
  const lvs = () => lebende('lv').filter((l) => l.werte.projekt === quellProjekt()).sort((a, b) => String(a.werte.nummer ?? '').localeCompare(String(b.werte.nummer ?? ''), 'de', { numeric: true }));
  const [quelle, setQuelle] = createSignal(lvs()[0]?.id ?? '');
  const [mengen, setMengen] = createSignal(true);
  const ok = () => {
    if (weg() === 'gaeb') { p.onZu(); gaebEinlesen(p.projekt); return; }
    const vorlage = weg() === 'kopie' ? sicht.lv?.[quelle()] : undefined;
    if (weg() === 'kopie' && !vorlage) { hinweis('Bitte das LV wählen, das kopiert wird.', { art: 'fehler' }); return; }
    const bez = name().trim() || String(vorlage?.werte.name ?? '') || String(sicht.gewerk?.[String(gewerk() ?? '')]?.werte.name ?? '');
    if (!bez) { hinweis('Bitte eine Bezeichnung oder ein Gewerk eingeben.', { art: 'fehler' }); return; }
    const id = neueKennung();
    const befehle: Vorlage[] = [{ objekt: 'lv', art: 'anlegen', objektId: id, werte: {
      projekt: p.projekt, nummer: nr().trim(), name: bez, gewerk: gewerk() ?? vorlage?.werte.gewerk ?? null, status: 'bearbeitung',
      ...(vorlage ? { vorbemerkungen: vorlage.werte.vorbemerkungen ?? null, oz_maske: vorlage.werte.oz_maske ?? null, kostengruppe: vorlage.werte.kostengruppe ?? null } : {}) } }];
    if (vorlage) for (const x of lebende('lv_position').filter((z) => z.werte.lv === vorlage.id && !z.werte.nachtrag))
      befehle.push({ objekt: 'lv_position', art: 'anlegen', objektId: neueKennung(), werte: { projekt: p.projekt, lv: id, oz: x.werte.oz ?? '', art: x.werte.art ?? 'normal', kurztext: x.werte.kurztext ?? '', langtext: x.werte.langtext ?? null, einheit: x.werte.einheit ?? null, menge: mengen() ? x.werte.menge ?? null : null } });
    ausfuehrenMehrere(befehle, vorlage ? `LV als Kopie von ${lvTitel(vorlage)}` : 'Neues LV');
    p.onZu(); p.onFertig(id, weg());
    if (vorlage) hinweis(`${befehle.length - 1} Zeilen aus ${lvTitel(vorlage)} kopiert${mengen() ? '' : ' (ohne Mengen)'} – ohne Preise.`);
  };
  return (
    <Dialog titel="Neues Leistungsverzeichnis" breit onAbbrechen={p.onZu}
      knoepfe={<><button class="knopf" onClick={p.onZu}>Abbrechen</button><button class="knopf haupt" onClick={ok}>{weg() === 'gaeb' ? 'Datei wählen …' : 'Anlegen'}</button></>}>
      <div class="formular">
        <Show when={weg() !== 'gaeb'}>
          <div class="reihe neues-lv-kopf">
            <label class="feld"><span>Bezeichnung</span><input value={name()} placeholder="z. B. Rohbauarbeiten, Trockenbau, Fliesen" onInput={(e) => setName(e.currentTarget.value)} /></label>
            <FeldEingabe feld={feld('gewerk')} wert={gewerk()} onWert={setGewerk} />
            <label class="feld neues-lv-nr"><span>Nr.</span><input value={nr()} onInput={(e) => setNr(e.currentTarget.value)} /></label>
          </div>
        </Show>
        <div class="neues-lv-wege" role="radiogroup" aria-label="Womit anfangen?">
          <span class="still-text">Womit anfangen?</span>
          <For each={WEGE}>{(w) => (
            <label class="neues-lv-weg" classList={{ an: weg() === w.wert }}><input type="radio" name="neues-lv" checked={weg() === w.wert} onChange={() => setWeg(w.wert)} />
              <b>{w.titel}</b><small>{w.text}</small></label>)}</For>
        </div>
        <Show when={weg() === 'kopie'}>
          <div class="reihe">
            <Auswahlliste titel="Projekt" wert={quellProjekt()} optionen={projekte().map((x) => ({ wert: x.id, titel: [x.werte.nummer, x.werte.name].filter(Boolean).join(' · ') }))} onWert={(w) => { setQuellProjekt(w); setQuelle(lvs()[0]?.id ?? ''); }} />
            <Auswahlliste titel="LV" wert={quelle()} optionen={lvs().map((l) => ({ wert: l.id, titel: lvTitel(l) }))} onWert={setQuelle} />
            <label class="druck-haken"><input type="checkbox" checked={mengen()} onChange={(e) => setMengen(e.currentTarget.checked)} /> Mengen übernehmen</label>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}
