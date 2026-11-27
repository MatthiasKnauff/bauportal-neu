// Druckwerk in der Oberfläche: die Vorschau ist die Seite selbst (kern/druck.ts – dieselben Bausteine macht der
// Server zum PDF). Wer die Druckeinstellungen des Büros ändern darf, klickt in der Vorschau an, was er ändern will.
// Die Vorschau entsteht auf dem Gerät aus den Daten, die schon da sind – sofort und auch ohne Netz.
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { DRUCKQUELLEN } from '../module/druckquellen';
import { CSS, RAND, SCHRIFT, druckInhalt, fusszeile, listenfolge, platzhalter, querformat, schriftgroesse, spaltenFeld, verweisSpalten, verzeichnisSpalten, type Ausdruck, type Druckdaten, type Einstellungen } from '../kern/druck';
import type { Feld, ObjektModell, Wert } from '../kern/modell';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { ausfuehren, lebende, sicht, verweisname } from './unterbau/abgleich';
import { darf, ladeDatei, druckeDatei, modell, neueKennung, ruf, zustand } from './unterbau/api';
import { Dialog } from './baukasten/dialog';
import { FeldEingabe } from './baukasten/feld';
import { hinweis } from './unterbau/meldungen';

/** Was ein Verzeichnis drucken kann: z. B. die Auswahl, die gefilterte Liste, alle – je mit Einträgen in ihrer Reihenfolge. */
/** Das Büro-Logo in der Vorschau – die Adresse ändert sich mit seinem Stand (dann lädt der Browser es neu). */
export const logoAdresse = (): string => { const v = String(sicht.buero?.[BUERO_ID]?.werte.logo ?? ''); return v ? `/api/logo?v=${encodeURIComponent(v)}` : ''; };
export interface Umfang { titel: string; ids: string[]; filter: string }
const [offen, setOffen] = createSignal<{ ausdruck: string; objekt: string; umfaenge?: Umfang[]; mehrere?: string[] } | null>(null);
/** Einen Eintrag drucken – oder mehrere (mehrere: alle Kennungen) nacheinander in einem PDF; die Vorschau zeigt den ersten. */
export const druckOeffnen = (ausdruck: string, objekt: string, mehrere?: string[]) => setOffen({ ausdruck, objekt, mehrere: mehrere && mehrere.length > 1 ? mehrere : undefined });
/** Verzeichnis drucken: gewählt ist der erste Umfang; im Fenster lässt sich ein anderer wählen. filter steht im Ausdruck. */
export const verzeichnisDrucken = (ausdruck: string, umfaenge: Umfang[]) => setOffen({ ausdruck, objekt: '', umfaenge });

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
    { name: 'fuss', titel: 'Fußzeile links', art: 'text', stelle: 'seite.fuss', vorgabe: a.fuss }, zeigen('seite.fuss'),
    ...(a.ordner ? [{ name: 'ordner', titel: 'Ablegen im Projektordner unter', art: 'text' as const, stelle: 'seite.ordner', vorgabe: a.ordner }] : [])] };
  const b = a.bloecke.find((x) => x.id === blockId)!;
  if (b.art === 'titel') return { titel: 'Überschrift', felder: [
    { name: 'text', titel: 'Überschrift', art: 'text', stelle: `${b.id}.text`, vorgabe: b.text },
    { name: 'unter', titel: 'Zeile darunter', art: 'text', stelle: `${b.id}.unter`, vorgabe: b.unter ?? '' }, zeigen(b.id)] };
  if (b.art === 'felder' && rest) { const f = m.felder.find((x) => x.name === rest)!; return { titel: f.titel, felder: [
    { name: 'titel', titel: 'Beschriftung', art: 'text', stelle: `${stelle}.titel`, vorgabe: f.titel }, zeigen(stelle)] }; }
  if (b.art === 'absatz') return { titel: 'Text', felder: [{ name: 'text', titel: 'Text (Felder in geschweiften Klammern, z. B. {gegenstand})', art: 'langtext', stelle: `${b.id}.text`, vorgabe: b.text }, zeigen(b.id)] };
  if (b.art === 'text') { const f = m.felder.find((x) => x.name === b.feld)!; return { titel: b.titel ?? f.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: b.titel ?? f.titel }, zeigen(b.id),
    { name: 'leer', titel: 'Auch zeigen, wenn nichts eingetragen ist', art: 'ja_nein', stelle: `${b.id}.leer` }] }; }
  if ((b.art === 'liste' || b.art === 'verzeichnis') && rest) { const f = spaltenFeld(b.art === 'liste' ? modell(b.objekt) : m, rest, modell)!; return { titel: `${b.titel} – Spalte ${f.titel}`, felder: [
    { name: 'titel', titel: 'Beschriftung der Spalte', art: 'text', stelle: `${stelle}.titel`, vorgabe: f.titel }, zeigen(stelle)] }; }
  if (b.art === 'bilder') return { titel: b.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: b.titel },
    { name: 'spalten', titel: 'Bilder je Zeile', art: 'auswahl', optionen: [{ wert: '2', titel: 'zwei nebeneinander' }, { wert: '1', titel: 'eins, groß' }], stelle: `${b.id}.spalten`, vorgabe: '2' }, zeigen(b.id)] };
  if (b.art === 'lv') return { titel: b.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: b.titel }, zeigen(b.id),
    { name: 'preise', titel: 'Mit den geschätzten Preisen (sonst leer zum Ausfüllen)', art: 'ja_nein', stelle: `${b.id}.preise` },
    { name: 'kurz', titel: 'Nur Kurztexte (ohne Langtexte)', art: 'ja_nein', stelle: `${b.id}.kurz` }] };
  if (b.art === 'berechnet') return { titel: b.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: b.titel }, zeigen(b.id)] };
  if (b.art === 'liste' || b.art === 'verzeichnis') return { titel: b.titel, felder: [
    { name: 'titel', titel: 'Überschrift des Abschnitts', art: 'text', stelle: `${b.id}.titel`, vorgabe: b.titel }, zeigen(b.id),
    { name: 'leer', titel: 'Auch zeigen, wenn nichts eingetragen ist', art: 'ja_nein', stelle: `${b.id}.leer` }] };
  return { titel: b.art === 'briefkopf' ? 'Briefkopf' : 'Angaben', felder: [zeigen(b.id)] };
}

function Druckfenster(p: { ausdruck: Ausdruck; objekt: string; umfaenge?: Umfang[]; mehrere?: string[] }) {
  const a = p.ausdruck;
  const [umfangNr, setUmfangNr] = createSignal(0);
  const umfang = () => p.umfaenge?.[umfangNr()];
  const m = modell(a.objekt);
  const einstellen = () => darf('druckeinstellung', 'schreiben');
  const [stelle, setStelle] = createSignal('seite');
  const [laeuft, setLaeuft] = createSignal(false);
  const test = () => zustand()!.umgebung === 'test';   // der Testserver legt nichts im Projektordner ab
  const da = createMemo(() => eintraege(a.id));
  const e = createMemo((): Einstellungen => Object.fromEntries(Object.entries(da()).map(([k, v]) => [k, v.wert])));
  const daten = createMemo((): Druckdaten | null => {
    if (a.verzeichnis) {   // viele Einträge: die übergebenen, in ihrer Reihenfolge
      const zeilen = (umfang()?.ids ?? []).map((id) => sicht[a.objekt]?.[id]).filter((z) => z && !z.geloescht).map((z) => ({ id: z!.id, werte: { ...z!.werte } }));
      return { werte: {}, buero: { ...(sicht.buero?.[BUERO_ID]?.werte ?? {}) }, logo: logoAdresse(), projekt: '', verweis: verweisname, zielwerte: (o, id) => sicht[o]?.[id]?.werte, modell, bild: () => '',
        kinder: (blockId) => (a.bloecke.find((x) => x.id === blockId)?.art === 'verzeichnis' ? zeilen : []),
        extra: { anzahl: `${zeilen.length} ${zeilen.length === 1 ? m.titel : m.titelMehrzahl}`, filter: umfang()?.filter ?? '', datum: new Date().toLocaleDateString('de-DE') } };
    }
    const z = sicht[a.objekt]?.[p.objekt];
    if (!z || z.geloescht) return null;
    const pid = m.projektFeld && m.projektFeld !== 'id' ? String(z.werte[m.projektFeld] ?? '') : '';
    return { werte: { ...z.werte }, buero: { ...(sicht.buero?.[BUERO_ID]?.werte ?? {}) }, logo: logoAdresse(), projekt: pid ? verweisname('projekt', pid) : '', verweis: verweisname, modell,
      kinder: (blockId) => { const b = a.bloecke.find((x) => x.id === blockId); if (b?.art !== 'liste' && b?.art !== 'bilder' && b?.art !== 'lv') return [];
        return Object.values(sicht[b.objekt] ?? {}).filter((k) => !k.geloescht && k.werte[b.ueber] === p.objekt && (b.art !== 'lv' || !b.ohne || k.werte[b.ohne] == null || k.werte[b.ohne] === '') && Object.entries(b.art === 'liste' ? b.filter ?? {} : {}).every(([n, w]) => k.werte[n] === w)).sort(listenfolge).map((k) => ({ id: k.id, werte: { ...k.werte } })); },
      bild: (id) => `/api/foto/vorschau/${id}`,
      berechnet: (blockId) => { const b = a.bloecke.find((x) => x.id === blockId); const q = b?.art === 'berechnet' ? DRUCKQUELLEN[b.quelle] : undefined;
        return q ? q.tabellen((o, f, w) => lebende(o).filter((k) => (f === 'id' ? k.id : String(k.werte[f] ?? '')) === w), { id: z.id, werte: { ...z.werte } }) : []; } };
  });

  // Die Vorschau lebt in einem abgeschirmten Kasten: Die Schrift des Ausdrucks und die der Oberfläche stören sich nicht.
  let blatt!: HTMLDivElement;
  // Das Blatt passt sich der Breite an – nie ein waagerechter Rollbalken
  const [breite, setBreite] = createSignal(0);
  const quer = () => querformat(a, e());
  onMount(() => { const b = new ResizeObserver(() => setBreite(blatt.parentElement!.clientWidth)); b.observe(blatt.parentElement!); onCleanup(() => b.disconnect()); });
  createEffect(() => {
    const d = daten();
    const wurzel = blatt.shadowRoot ?? blatt.attachShadow({ mode: 'open' });
    if (!d) { wurzel.innerHTML = ''; return; }
    wurzel.innerHTML = `<style>${CSS(schriftgroesse(e()))}
      .bogen { zoom: ${breite() ? Math.min(1, (breite() - 28) / (quer() ? 1123 : 794)) : 1}; box-sizing: border-box; width: ${quer() ? '297mm' : '210mm'}; min-height: ${quer() ? '210mm' : '297mm'}; margin: 0 auto; padding: ${RAND.oben}mm ${RAND.seite}mm ${RAND.unten}mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.18); display: flex; flex-direction: column; }
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

  const anfrage = () => (a.verzeichnis ? { ausdruck: a.id, ids: umfang()?.ids ?? [], filter: umfang()?.filter ?? '' } : p.mehrere ? { ausdruck: a.id, ids: p.mehrere } : { ausdruck: a.id, objekt: p.objekt });
  const drucken = async () => {
    setLaeuft(true);
    try { await druckeDatei('/api/druck/pdf', anfrage()); }
    catch (err) { hinweis((err as Error).message); }
    finally { setLaeuft(false); }
  };
  const pdf = async () => {
    setLaeuft(true);
    try { await ladeDatei('/api/druck/pdf', anfrage()); }
    catch (err) { hinweis((err as Error).message); }
    finally { setLaeuft(false); }
  };
  const ablegen = async () => {
    setLaeuft(true);
    try { const r = await ruf<{ pfad: string }>('/api/druck/ablegen', { ausdruck: a.id, objekt: p.objekt }); hinweis(`Im Projektordner abgelegt: ${r.pfad}`); }
    catch (err) { hinweis((err as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  const schrauben = createMemo(() => stellschrauben(a, m, stelle()));
  // Angeklickt ist ein Verzeichnis (Überschrift oder Spalte): dann lassen sich die Spalten frei wählen und ordnen
  const verzeichnisBlock = () => { const b = a.bloecke.find((x) => x.id === stelle().split('.')[0]); return b?.art === 'verzeichnis' ? b : undefined; };
  return (
    <Dialog titel={`${a.titel}${p.mehrere ? ` – ${p.mehrere.length} in einem PDF, Vorschau des ersten` : ' – Druckvorschau'}`} gross onAbbrechen={() => setOffen(null)}
      knoepfe={<><button class="knopf" onClick={() => setOffen(null)}>Schließen</button><Show when={a.ordner && !p.mehrere}><button class="knopf" disabled={laeuft() || !daten() || test()} title={test() ? 'Der Testserver darf den Dateiserver nur lesen – ablegen geht auf dem Produktivserver' : ''} onClick={ablegen}>Im Projektordner ablegen</button></Show><button class="knopf" disabled={laeuft() || !daten()} onClick={pdf}>PDF herunterladen</button><button class="knopf haupt" disabled={laeuft() || !daten()} onClick={drucken}>{laeuft() ? 'PDF wird erzeugt …' : 'Drucken'}</button></>}>
      <div class="druck">
        <div class="druck-blatt" onClick={klick}><div ref={blatt} /></div>
        <Show when={einstellen() || (p.umfaenge?.length ?? 0) > 1}>
          <div class="druck-seite">
            <Show when={(p.umfaenge?.length ?? 0) > 1}>
              <h3>Was drucken?</h3>
              <div class="auswahl senkrecht" role="radiogroup" aria-label="Was drucken">
                <For each={p.umfaenge}>{(u, i) => <button type="button" role="radio" aria-checked={umfangNr() === i()} classList={{ aktiv: umfangNr() === i() }} onClick={() => setUmfangNr(i())}>{u.titel} <span class="still-text">({u.ids.length})</span></button>}</For>
              </div>
            </Show>
            <Show when={einstellen()}>
            <p class="still-text klein-text">Klick in der Vorschau an, was du ändern willst. Die Einstellungen gelten für alle {a.titel === m.titel ? m.titelMehrzahl : `Ausdrucke „${a.titel}“`} des Büros; Rückgängig wie überall.</p>
            <h3>{schrauben().titel}</h3>
            <For each={schrauben().felder}>{(f) => <FeldEingabe feld={f} wert={wertVon(f)} onWert={(w) => wertSetzen(f, w)} />}</For>
            <Show when={schrauben().felder.some((f) => f.art === 'text' && /\{/.test(f.vorgabe ?? ''))}>
              <p class="still-text klein-text">In geschweiften Klammern stehen Platzhalter, die beim Drucken ersetzt werden: {platzhalter(m).map((k) => `{${k}}`).join(' ')}</p>
            </Show>
            <Show when={verzeichnisBlock()}>{(b) => <SpaltenWahl block={b()} m={m} e={e()} onSetzen={(w) => setzen(`${b().id}.spalten`, w)} />}</Show>
            <Show when={stelle() !== 'seite'}><button class="knopf still" onClick={() => setStelle('seite')}>Einstellungen der Seite</button></Show>
            </Show>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}

/** Spalten eines Verzeichnisses wählen und ordnen: angehakte oben in ihrer Reihenfolge (↑↓), darunter die übrigen Felder. */
function SpaltenWahl(p: { block: { id: string; spalten: string[] }; m: ObjektModell; e: Einstellungen; onSetzen: (w: string) => void }) {
  const an = () => verzeichnisSpalten(p.block, p.m, p.e, modell);
  // wählbar: die eigenen Felder und die kurzen Felder der verwiesenen Einträge (z. B. Telefon der Bieter:in)
  const moeglich = (): { name: string; titel: string }[] => [
    ...p.m.felder.filter((f) => !f.verborgen && f.art !== 'langtext').map((f) => ({ name: f.name, titel: f.titel })),
    ...verweisSpalten(p.m, modell).flatMap((v) => v.felder.map((f) => ({ name: `${v.verweis.name}.${f.name}`, titel: `${v.verweis.titel} · ${f.titel}` }))),
  ];
  const titel = (n: string) => moeglich().find((x) => x.name === n)?.titel ?? spaltenFeld(p.m, n, modell)?.titel ?? n;
  const setzen = (namen: string[]) => p.onSetzen(namen.join(',') === p.block.spalten.join(',') ? '' : namen.join(','));
  const schieben = (n: string, d: -1 | 1) => { const l = [...an()]; const i = l.indexOf(n), k = i + d; if (k < 0 || k >= l.length) return; [l[i], l[k]] = [l[k]!, l[i]!]; setzen(l); };
  return (
    <div class="spaltenwahl-druck">
      <h3>Spalten</h3>
      <For each={an()}>{(n) => (
        <div class="spalte-zeile"><label><input type="checkbox" checked disabled={an().length === 1} onChange={() => setzen(an().filter((x) => x !== n))} /> {titel(n)}</label>
          <button class="knopf klein still" aria-label={`${titel(n)} nach oben`} onClick={() => schieben(n, -1)}>↑</button><button class="knopf klein still" aria-label={`${titel(n)} nach unten`} onClick={() => schieben(n, 1)}>↓</button></div>)}</For>
      <For each={moeglich().filter((f) => !an().includes(f.name))}>{(f) => (
        <div class="spalte-zeile"><label><input type="checkbox" onChange={() => setzen([...an(), f.name])} /> {f.titel}</label></div>
      )}</For>
      <Show when={an().join(',') !== p.block.spalten.join(',')}><button class="knopf still" onClick={() => p.onSetzen('')}>Spalten wie ab Werk</button></Show>
    </div>
  );
}

export function Druck() {
  const ausdruck = () => { const o = offen(); return o ? zustand()!.module.flatMap((x) => x.ausdrucke ?? []).find((a) => a.id === o.ausdruck) : undefined; };
  return <Show when={ausdruck()}>{(a) => <Druckfenster ausdruck={a()} objekt={offen()!.objekt} umfaenge={offen()!.umfaenge} mehrere={offen()!.mehrere} />}</Show>;
}
