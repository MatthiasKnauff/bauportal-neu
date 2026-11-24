// Druckwerk in der Oberfläche: die Vorschau ist die Seite selbst (kern/druck.ts – dieselben Bausteine macht der
// Server zum PDF). Wer die Druckeinstellungen des Büros ändern darf, klickt in der Vorschau an, was er ändern will.
// Die Vorschau entsteht auf dem Gerät aus den Daten, die schon da sind – sofort und auch ohne Netz.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { CSS, RAND, SCHRIFT, druckInhalt, fusszeile, platzhalter, schriftgroesse, type Ausdruck, type Druckdaten, type Einstellungen } from '../kern/druck';
import type { Feld, ObjektModell, Wert } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { ausfuehren, sicht } from './abgleich';
import { darf, ladeDatei, modell, neueKennung, zustand } from './api';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe, verweisname } from './baukasten/feld';
import { hinweis } from './baukasten/hinweise';

const [offen, setOffen] = createSignal<{ ausdruck: string; objekt: string } | null>(null);
export const druckOeffnen = (ausdruck: string, objekt: string) => setOffen({ ausdruck, objekt });

/** Die Einträge „druckeinstellung“ eines Ausdrucks, je Stelle einer (bei doppelten gilt überall die kleinste Kennung). */
function eintraege(ausdruck: string) {
  const je: Record<string, { id: string; wert: string }> = {};
  for (const z of Object.values(sicht.druckeinstellung ?? {}).filter((x) => !x.geloescht && x.werte.ausdruck === ausdruck).sort((a, b) => b.id.localeCompare(a.id))) {
    je[String(z.werte.stelle)] = { id: z.id, wert: String(z.werte.wert ?? '') };
  }
  return je;
}

/** Was sich an einer angeklickten Stelle einstellen lässt – beschrieben als Felder, gezeigt mit dem Baustein „Feld“. */
function stellschrauben(a: Ausdruck, m: ObjektModell, stelle: string): { titel: string; felder: (Feld & { stelle: string; vorgabe?: string })[] } {
  const zeigen = (s: string): Feld & { stelle: string } => ({ name: 'zeigen', titel: 'Im Ausdruck zeigen', art: 'ja_nein', stelle: `${s}.aus` });
  const [blockId, rest] = stelle.split('.') as [string, string | undefined];
  if (blockId === 'seite') return { titel: 'Seite', felder: [
    { name: 'schrift', titel: 'Schriftgröße', art: 'auswahl', optionen: Object.entries(SCHRIFT).map(([wert, s]) => ({ wert, titel: s.titel })), stelle: 'seite.schrift', vorgabe: 'normal' },
    { name: 'fuss', titel: 'Fußzeile links', art: 'text', stelle: 'seite.fuss', vorgabe: a.fuss }, zeigen('seite.fuss')] };
  const b = a.bloecke.find((x) => x.id === blockId)!;
  if (b.art === 'titel') return { titel: 'Überschrift', felder: [
    { name: 'text', titel: 'Überschrift', art: 'text', stelle: `${b.id}.text`, vorgabe: b.text },
    { name: 'unter', titel: 'Zeile darunter', art: 'text', stelle: `${b.id}.unter`, vorgabe: b.unter ?? '' }, zeigen(b.id)] };
  if (b.art === 'felder' && rest) { const f = m.felder.find((x) => x.name === rest)!; return { titel: f.titel, felder: [
    { name: 'titel', titel: 'Beschriftung', art: 'text', stelle: `${stelle}.titel`, vorgabe: f.titel }, zeigen(stelle)] }; }
  if (b.art === 'text') { const f = m.felder.find((x) => x.name === b.feld)!; return { titel: f.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: f.titel }, zeigen(b.id),
    { name: 'leer', titel: 'Auch zeigen, wenn nichts eingetragen ist', art: 'ja_nein', stelle: `${b.id}.leer` }] }; }
  return { titel: b.art === 'briefkopf' ? 'Briefkopf' : 'Angaben', felder: [zeigen(b.id)] };
}

function Druckfenster(p: { ausdruck: Ausdruck; objekt: string }) {
  const a = p.ausdruck;
  const m = modell(a.objekt);
  const einstellen = () => darf('druckeinstellung', 'schreiben');
  const [stelle, setStelle] = createSignal('seite');
  const [laeuft, setLaeuft] = createSignal(false);
  const da = createMemo(() => eintraege(a.id));
  const e = createMemo((): Einstellungen => Object.fromEntries(Object.entries(da()).map(([k, v]) => [k, v.wert])));
  const daten = createMemo((): Druckdaten | null => {
    const z = sicht[a.objekt]?.[p.objekt];
    if (!z || z.geloescht) return null;
    const pid = m.projektFeld && m.projektFeld !== 'id' ? String(z.werte[m.projektFeld] ?? '') : '';
    return { werte: { ...z.werte }, buero: { ...(sicht.buero?.[BUERO_ID]?.werte ?? {}) }, projekt: pid ? verweisname('projekt', pid) : '', verweis: verweisname };
  });

  // Die Vorschau lebt in einem abgeschirmten Kasten: Die Schrift des Ausdrucks und die der Oberfläche stören sich nicht.
  let blatt!: HTMLDivElement;
  // Das Blatt passt sich der Breite an – nie ein waagerechter Rollbalken
  const [breite, setBreite] = createSignal(0);
  onMount(() => { const b = new ResizeObserver(() => setBreite(blatt.parentElement!.clientWidth)); b.observe(blatt.parentElement!); onCleanup(() => b.disconnect()); });
  createEffect(() => {
    const d = daten();
    const wurzel = blatt.shadowRoot ?? blatt.attachShadow({ mode: 'open' });
    if (!d) { wurzel.innerHTML = ''; return; }
    wurzel.innerHTML = `<style>${CSS(schriftgroesse(e()))}
      .bogen { zoom: ${breite() ? Math.min(1, (breite() - 28) / 794) : 1}; box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: ${RAND.oben}mm ${RAND.seite}mm ${RAND.unten}mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.18); display: flex; flex-direction: column; }
      .seite { flex: 1; }
      .aus { opacity: .3; text-decoration: line-through; }
      .leer { opacity: .45; }
      ${einstellen() ? '[data-stelle] { cursor: pointer; border-radius: 2px; } [data-stelle]:hover { outline: 1.5px dashed #2a5bd7; outline-offset: 2px; } [data-stelle].gewaehlt { outline: 2px solid #2a5bd7; outline-offset: 2px; }' : ''}
    </style><div class="bogen"><div class="seite">${druckInhalt(a, m, d, e(), einstellen())}</div><div class="fuss${e()['seite.fuss.aus'] === 'ja' ? ' aus' : ''}" data-stelle="seite">${fusszeile(a, m, d, { ...e(), 'seite.fuss.aus': '' }).replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!)}&nbsp;</div></div>`;
    wurzel.querySelector(`[data-stelle="${stelle()}"]`)?.classList.add('gewaehlt');
  });
  const klick = (ev: MouseEvent) => {
    if (!einstellen()) return;
    const ziel = (ev.composedPath()[0] as Element | undefined)?.closest?.('[data-stelle]');
    setStelle(ziel?.getAttribute('data-stelle') ?? 'seite');
  };

  const setzen = (s: string, wert: string) => {
    const alt = da()[s];
    if ((alt?.wert ?? '') === wert) return;
    if (alt) ausfuehren({ objekt: 'druckeinstellung', art: 'aendern', objektId: alt.id, werte: { wert } }, 'Druckeinstellung ändern');
    else ausfuehren({ objekt: 'druckeinstellung', art: 'anlegen', objektId: neueKennung(), werte: { ausdruck: a.id, stelle: s, wert } }, 'Druckeinstellung ändern');
  };
  // „Im Ausdruck zeigen“ ist an, solange nicht „aus“ gespeichert ist; Texte zeigen die Vorgabe, solange nichts Eigenes da ist.
  const wertVon = (f: Feld & { stelle: string; vorgabe?: string }): Wert =>
    f.art === 'ja_nein' ? (f.stelle.endsWith('.aus') ? e()[f.stelle] !== 'ja' : e()[f.stelle] === 'ja') : (e()[f.stelle] || f.vorgabe || '');
  const wertSetzen = (f: Feld & { stelle: string; vorgabe?: string }, w: Wert) =>
    setzen(f.stelle, f.art === 'ja_nein' ? ((f.stelle.endsWith('.aus') ? !w : !!w) ? 'ja' : '') : (String(w ?? '') === (f.vorgabe ?? '') ? '' : String(w ?? '')));

  const pdf = async () => {
    setLaeuft(true);
    try { await ladeDatei('/api/druck/pdf', { ausdruck: a.id, objekt: p.objekt }); }
    catch (err) { hinweis((err as Error).message); }
    finally { setLaeuft(false); }
  };
  const schrauben = createMemo(() => stellschrauben(a, m, stelle()));
  return (
    <Dialog titel={`${a.titel} – Druckvorschau`} gross onAbbrechen={() => setOffen(null)}
      knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Schließen</button><button class="knopf haupt" disabled={laeuft() || !daten()} onClick={pdf}>{laeuft() ? 'PDF wird erzeugt …' : 'PDF herunterladen'}</button></>}>
      <div class="druck">
        <div class="druck-blatt" onClick={klick}><div ref={blatt} /></div>
        <Show when={einstellen()}>
          <div class="druck-seite">
            <p class="still-text klein-text">Klick in der Vorschau an, was du ändern willst. Die Einstellungen gelten für alle {a.titel === m.titel ? m.titelMehrzahl : `Ausdrucke „${a.titel}“`} des Büros; Rückgängig wie überall.</p>
            <h3>{schrauben().titel}</h3>
            <For each={schrauben().felder}>{(f) => <FeldEingabe feld={f} wert={wertVon(f)} onWert={(w) => wertSetzen(f, w)} />}</For>
            <Show when={schrauben().felder.some((f) => f.art === 'text' && /\{/.test(f.vorgabe ?? ''))}>
              <p class="still-text klein-text">In geschweiften Klammern stehen Platzhalter, die beim Drucken ersetzt werden: {platzhalter(m).map((k) => `{${k}}`).join(' ')}</p>
            </Show>
            <Show when={stelle() !== 'seite'}><button class="knopf still" onClick={() => setStelle('seite')}>Einstellungen der Seite</button></Show>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}

export function Druck() {
  const ausdruck = () => { const o = offen(); return o ? zustand()!.module.flatMap((x) => x.ausdrucke ?? []).find((a) => a.id === o.ausdruck) : undefined; };
  return <Show when={ausdruck()}>{(a) => <Druckfenster ausdruck={a()} objekt={offen()!.objekt} />}</Show>;
}
