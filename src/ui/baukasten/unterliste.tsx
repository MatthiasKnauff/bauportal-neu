// Baustein „Unterliste“: Einträge, die an einem Objekt hängen, direkt in dessen Karte – z. B. die Mängel eines
// Tagesberichts. Jede Zeile ist ein eigenes Objekt; Anlegen, Ändern und Entfernen sind Befehle wie überall.
// Neue Einträge entstehen durch Tippen und Enter oder – bei „neuUeber“ – durch Auswahl aus einem Verweis (z. B. Firma).
import { For, Show, createMemo, createSignal } from 'solid-js';
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
import { Zeichen } from './zeichen';
import { hinweis } from '../unterbau/meldungen';

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
  /** Fotos gleich beim Anlegen (wie bisher „Foto aufnehmen · Aus Mediathek“): gewählt wird vorher, mit dem neuen Eintrag gehen sie hoch */
  neuFotos?: (id: string, dateien: File[]) => void;
}) {
  const m = (): ObjektModell => modell(p.objekt);
  const feld = (n: string): Feld => m().felder.find((f) => f.name === n)!;
  const schreiben = () => darf(p.objekt, 'schreiben');
  const eintraege = createMemo(() => Object.values(sicht[p.objekt] ?? {}).filter((z) => !z.geloescht && Object.entries(p.fest).every(([k, w]) => z.werte[k] === w)).sort(listenfolge));
  const [fotos, setFotos] = createSignal<File[]>([]);
  const neu = (werte: Werte) => {
    const voll: Werte = {};
    for (const f of m().felder) voll[f.name] = leerwert(f);
    const reihe = Math.max(0, ...eintraege().map((z) => Number(z.werte.reihe) || 0)) + 1, id = neueKennung();
    ausfuehren({ objekt: p.objekt, art: 'anlegen', objektId: id, werte: { ...voll, ...p.fest, ...(feld('reihe') ? { reihe } : {}), ...werte } }, `${p.titel}: Eintrag anlegen`);
    if (fotos().length && p.neuFotos) { p.neuFotos(id, fotos()); setFotos([]); }
  };
  // langer Text (wie bisher): mehrzeilig, wächst mit; Enter = neue Zeile, Strg+Enter (oder ＋) legt an
  const lang = () => feld(p.haupt).art === 'langtext';
  const wachse = (el: HTMLTextAreaElement) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };
  let neuFeld: HTMLInputElement | HTMLTextAreaElement | undefined, fotoWahl!: HTMLInputElement;
  const anlegen = () => { const t = neuFeld?.value.trim(); if (!t) return; neu({ [p.haupt]: t }); neuFeld!.value = ''; setGetippt(false); if (neuFeld instanceof HTMLTextAreaElement) wachse(neuFeld); };
  // Eingabe verwerfen (wie bisher): Text und schon gewählte Fotos weg – mit Rückgängig kommen beide zurück
  const [getippt, setGetippt] = createSignal(false);
  const verwerfen = () => {
    const t = neuFeld?.value ?? '', f = fotos();
    if (neuFeld) { neuFeld.value = ''; if (neuFeld instanceof HTMLTextAreaElement) wachse(neuFeld); }
    setFotos([]); setGetippt(false);
    if (t.trim() || f.length) hinweis('Eingabe verworfen.', { aktion: { titel: 'Rückgängig', tun: () => { if (neuFeld) { neuFeld.value = t; if (neuFeld instanceof HTMLTextAreaElement) wachse(neuFeld); neuFeld.focus(); } setFotos(f); setGetippt(!!t.trim()); } } });
  };
  const weg = (z: Zeile) => ausfuehren({ objekt: p.objekt, art: 'loeschen', objektId: z.id }, `${p.titel}: Eintrag entfernen`);
  const zeilentitel = (z: Zeile) => (p.neuUeber && z.werte[p.neuUeber] ? verweisname(feld(p.neuUeber).ziel!, String(z.werte[p.neuUeber])) : String(z.werte[p.haupt] ?? ''));
  const neben = (z: Zeile) => (p.neben ?? []).map(feld).filter((f) => gilt(f, z.werte, m()));
  return (
    <fieldset class="unterliste" aria-label={p.titel}
      // Fotos auf die Liste gezogen (nicht auf einen Eintrag): neuer Eintrag hier, die Fotos sind schon dabei – Text eingeben (wie bisher)
      onDragOver={(e) => { if (p.neuFotos && schreiben() && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }}
      onDrop={(e) => { if (!p.neuFotos || !schreiben() || !e.dataTransfer?.files.length) return; e.preventDefault(); e.stopPropagation();
        const f = [...e.dataTransfer.files].filter((x) => /^image\//.test(x.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(x.name)); if (!f.length) return;
        setFotos([...fotos(), ...f]); neuFeld?.focus(); }}>
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
              <Show when={lang()} fallback={
                <input aria-label={`${feld(p.haupt).titel}: ${zeilentitel(z)}`} value={String(z.werte[p.haupt] ?? '')} placeholder={p.neuUeber ? feld(p.haupt).titel : ''} readOnly={!schreiben()}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onChange={(e) => feldAendern(m(), z, feld(p.haupt), e.currentTarget.value)} />}>
                <textarea class="unterliste-text" rows={1} aria-label={`${feld(p.haupt).titel}: ${zeilentitel(z)}`} value={String(z.werte[p.haupt] ?? '')} readOnly={!schreiben()}
                  ref={(el) => queueMicrotask(() => wachse(el))} onInput={(e) => wachse(e.currentTarget)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur(); }} onChange={(e) => feldAendern(m(), z, feld(p.haupt), e.currentTarget.value)} />
              </Show>
              <Show when={schreiben() && feld(p.haupt).art === 'langtext' && kiAnbindungen().length && String(z.werte[p.haupt] ?? '').trim()}>
                <button type="button" class="ki-knopf" title="Die KI macht einen Vorschlag – übernommen wird erst nach deiner Bestätigung" onClick={() => kiOeffnen({ titel: p.titel, text: String(z.werte[p.haupt] ?? ''), onUebernehmen: (t) => feldAendern(m(), z, feld(p.haupt), t, 'ki') })}>✦ KI</button>
              </Show>
              {p.zusatz?.(z)}
              <Show when={darf(p.objekt, 'loeschen')}><button class="knopf klein still" aria-label={`Entfernen: ${zeilentitel(z)}`} title="Entfernen" onClick={() => weg(z)}>×</button></Show>
            </div>
            <Show when={neben(z).length}>
              <div class="unterliste-neben">
                <For each={neben(z)}>{(f) => <FeldEingabe klein feld={f} objekt={m().name} wert={z.werte[f.name] ?? null} gesperrt={!schreiben()} zusammenhang={z.werte} onWert={(w) => feldAendern(m(), z, f, w)} />}</For>
              </div>
            </Show>
          </li>
        )}</For>
      </ul>
      <Show when={schreiben()}>
        <Show when={p.neuUeber} fallback={<>
          <Show when={lang()} fallback={
            <input class="unterliste-neu" ref={(el) => (neuFeld = el)} aria-label={`${p.titel}: neuer Eintrag`} placeholder={p.platzhalter}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anlegen(); } }} />}>
            <div class="unterliste-neu-zeile">
              <textarea class="unterliste-neu" ref={(el) => (neuFeld = el)} rows={2} aria-label={`${p.titel}: neuer Eintrag`} placeholder={p.platzhalter}
                onInput={(e) => { wachse(e.currentTarget); setGetippt(!!e.currentTarget.value.trim()); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); anlegen(); } else if (e.key === 'Escape' && (getippt() || fotos().length)) { e.preventDefault(); verwerfen(); } }} />
              <Show when={p.neuFotos}>
                <button type="button" class="knopf klein still" title="Foto dazu – geht mit dem neuen Eintrag hoch" aria-label={`${p.titel}: Foto zum neuen Eintrag`} onClick={() => fotoWahl.click()}><Zeichen name="foto" groesse={16} />{fotos().length ? ` ${fotos().length}` : ''}</button>
                <input ref={fotoWahl} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { setFotos([...fotos(), ...(e.currentTarget.files ?? [])]); e.currentTarget.value = ''; }} />
              </Show>
              <Show when={getippt() || fotos().length}><button type="button" class="knopf klein still" aria-label={`${p.titel}: Eingabe verwerfen`} title="Eingabe verwerfen (Esc) – mit Rückgängig" onClick={verwerfen}>×</button></Show>
              <button type="button" class="knopf klein" aria-label={`${p.titel}: hinzufügen`} title="Hinzufügen (Strg+Enter)" onClick={anlegen}>＋</button>
            </div>
            <small class="still-text klein-text">Enter = neue Zeile · Strg+Enter = hinzufügen · Esc = verwerfen{fotos().length ? ` · ${fotos().length} ${fotos().length === 1 ? 'Foto' : 'Fotos'} dabei` : ''}</small>
          </Show></>}>
          <Auswahlliste titel={p.platzhalter} platzhalter={p.platzhalter} wert={null} onWert={(w) => { if (w) neu({ [p.neuUeber!]: w }); }}
            optionen={(() => { const drin = new Set(eintraege().map((z) => z.werte[p.neuUeber!])); return (p.angebot?.() ?? []).filter((o) => !drin.has(o.wert)); })()} />
        </Show>
      </Show>
    </fieldset>
  );
}
