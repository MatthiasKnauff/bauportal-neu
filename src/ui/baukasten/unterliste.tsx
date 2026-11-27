// Baustein „Unterliste“: Einträge, die an einem Objekt hängen, direkt in dessen Karte – z. B. die Mängel eines
// Tagesberichts. Jede Zeile ist ein eigenes Objekt; Anlegen, Ändern und Entfernen sind Befehle wie überall.
// Neue Einträge entstehen durch Tippen und Enter oder – bei „neuUeber“ – durch Auswahl aus einem Verweis (z. B. Firma).
import { For, Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { listenfolge } from '../../kern/druck';
import { gilt, leerwert, type Feld, type ObjektModell, type Werte } from '../../kern/modell';
import type { Zeile } from '../../kern/befehl';
import { ausfuehren, sicht, verweisname } from '../unterbau/abgleich';
import { darf, modell, neueKennung } from '../unterbau/api';
import { Auswahlliste } from './auswahlliste';
import { feldAendern } from './detailkarte';
import { FeldEingabe } from './feld';
import { kiAnbindungen, kiOeffnen } from './ki';

export function Unterliste(p: {
  titel: string;
  objekt: string;                 // Modell der Einträge
  fest: Werte;                    // woran sie hängen: diese Werte haben alle Einträge der Liste, neue bekommen sie
  haupt: string;                  // das Feld, das in der Zeile steht (Text)
  haken?: string;                 // Ja/Nein-Feld als Häkchen vorn (z. B. „erledigt“)
  neben?: string[];               // weitere Felder unter der Zeile (z. B. Firma, Frist)
  neuUeber?: string;              // statt Tippen: neuer Eintrag durch Auswahl in diesem Verweis-Feld
  angebot?: () => { wert: string; titel: string }[];   // was die Auswahl zuerst anbietet (z. B. die Beteiligten des Projekts)
  platzhalter: string;
  ohneTitel?: boolean;            // Überschrift steht schon außen (z. B. auf der Karte eines Abschnitts)
  gewaehlt?: string | null;       // hervorgehobener Eintrag
  onWahl?: (id: string) => void;  // Eintrag angeklickt (z. B. um ihn rechts im Detail zu zeigen)
  zusatz?: (z: Zeile) => JSX.Element;   // am Ende der Zeile (z. B. Fotos zum Eintrag)
  onDateien?: (z: Zeile, dateien: File[]) => void;   // Dateien auf die Zeile gezogen (z. B. Fotos an den Eintrag)
}) {
  const m = (): ObjektModell => modell(p.objekt);
  const feld = (n: string): Feld => m().felder.find((f) => f.name === n)!;
  const schreiben = () => darf(p.objekt, 'schreiben');
  const eintraege = createMemo(() => Object.values(sicht[p.objekt] ?? {}).filter((z) => !z.geloescht && Object.entries(p.fest).every(([k, w]) => z.werte[k] === w)).sort(listenfolge));
  const neu = (werte: Werte) => {
    const voll: Werte = {};
    for (const f of m().felder) voll[f.name] = leerwert(f);
    const reihe = Math.max(0, ...eintraege().map((z) => Number(z.werte.reihe) || 0)) + 1;
    ausfuehren({ objekt: p.objekt, art: 'anlegen', objektId: neueKennung(), werte: { ...voll, ...p.fest, ...(feld('reihe') ? { reihe } : {}), ...werte } }, `${p.titel}: Eintrag anlegen`);
  };
  const weg = (z: Zeile) => ausfuehren({ objekt: p.objekt, art: 'loeschen', objektId: z.id }, `${p.titel}: Eintrag entfernen`);
  const zeilentitel = (z: Zeile) => (p.neuUeber && z.werte[p.neuUeber] ? verweisname(feld(p.neuUeber).ziel!, String(z.werte[p.neuUeber])) : String(z.werte[p.haupt] ?? ''));
  const neben = (z: Zeile) => (p.neben ?? []).map(feld).filter((f) => gilt(f, z.werte, m()));
  return (
    <fieldset class="unterliste" aria-label={p.titel}>
      <Show when={!p.ohneTitel}><legend>{p.titel}<Show when={eintraege().length}><span class="anzahl">{eintraege().length}</span></Show></legend></Show>
      <ul>
        <For each={eintraege()}>{(z) => (
          <li classList={{ erledigt: !!p.haken && z.werte[p.haken] === true, gewaehlt: p.gewaehlt === z.id }} onFocusIn={() => p.onWahl?.(z.id)} onClick={() => p.onWahl?.(z.id)}
            onDragOver={(e) => { if (p.onDateien && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('ziel'); } }}
            onDragLeave={(e) => e.currentTarget.classList.remove('ziel')}
            onDrop={(e) => { if (!p.onDateien || !e.dataTransfer?.files.length) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('ziel'); p.onDateien(z, [...e.dataTransfer.files]); }}>
            <div class="unterliste-zeile">
              <Show when={p.haken}>
                <button type="button" role="checkbox" class="haken" classList={{ an: z.werte[p.haken!] === true }} aria-checked={z.werte[p.haken!] === true} aria-label={`${feld(p.haken!).titel}: ${zeilentitel(z)}`} disabled={!schreiben()}
                  onClick={() => feldAendern(m(), z, feld(p.haken!), z.werte[p.haken!] !== true)}>{z.werte[p.haken!] === true ? '✓' : ''}</button>
              </Show>
              <Show when={p.neuUeber}><strong class="unterliste-name">{zeilentitel(z)}</strong></Show>
              <input aria-label={`${feld(p.haupt).titel}: ${zeilentitel(z)}`} value={String(z.werte[p.haupt] ?? '')} placeholder={p.neuUeber ? feld(p.haupt).titel : ''} readOnly={!schreiben()}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onChange={(e) => feldAendern(m(), z, feld(p.haupt), e.currentTarget.value)} />
              <Show when={schreiben() && feld(p.haupt).art === 'langtext' && kiAnbindungen().length && String(z.werte[p.haupt] ?? '').trim()}>
                <button type="button" class="ki-knopf" title="Die KI macht einen Vorschlag – übernommen wird erst nach deiner Bestätigung" onClick={() => kiOeffnen({ titel: p.titel, text: String(z.werte[p.haupt] ?? ''), onUebernehmen: (t) => feldAendern(m(), z, feld(p.haupt), t, 'ki') })}>✦ KI</button>
              </Show>
              {p.zusatz?.(z)}
              <Show when={darf(p.objekt, 'loeschen')}><button class="knopf klein still" aria-label={`Entfernen: ${zeilentitel(z)}`} title="Entfernen" onClick={() => weg(z)}>×</button></Show>
            </div>
            <Show when={neben(z).length}>
              <div class="unterliste-neben">
                <For each={neben(z)}>{(f) => <FeldEingabe feld={f} wert={z.werte[f.name] ?? null} gesperrt={!schreiben()} zusammenhang={z.werte} onWert={(w) => feldAendern(m(), z, f, w)} />}</For>
              </div>
            </Show>
          </li>
        )}</For>
      </ul>
      <Show when={schreiben()}>
        <Show when={p.neuUeber} fallback={
          <input class="unterliste-neu" aria-label={`${p.titel}: neuer Eintrag`} placeholder={p.platzhalter}
            onKeyDown={(e) => { const t = e.currentTarget.value.trim(); if (e.key === 'Enter' && t) { e.preventDefault(); neu({ [p.haupt]: t }); e.currentTarget.value = ''; } }} />}>
          <Auswahlliste titel={p.platzhalter} platzhalter={p.platzhalter} wert={null} onWert={(w) => { if (w) neu({ [p.neuUeber!]: w }); }}
            optionen={(() => { const drin = new Set(eintraege().map((z) => z.werte[p.neuUeber!])); return (p.angebot?.() ?? []).filter((o) => !drin.has(o.wert)); })()} />
        </Show>
      </Show>
    </fieldset>
  );
}
