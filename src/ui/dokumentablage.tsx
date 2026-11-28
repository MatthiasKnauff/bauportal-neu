// Dokumente ablegen: eine PDF, ein Scan oder Foto irgendwo ins Fenster ziehen → der Dateidienst liest den Text (Scans mit
// Texterkennung) → die Erkennung (kern/dokumenterkennung) schlägt Art, Projekt, Firma, Nummer, Datum und Betrag vor →
// ein Dialog zeigt alles zum Prüfen → „Ablegen“ legt das Original in den Projektordner und den Eintrag an (Rechnung, Angebot …).
// Vorbelegt ist die Art der Seite, auf der man steht; erkennt der Text ausdrücklich etwas anderes (eine Rechnung, ein anderes
// Projekt), steht das Erkannte drin und das Feld blinkt rot. Was es gibt, sagen die Beipackzettel (dokumentarten).
import { dateiZeigen } from './baukasten/ansehen';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { HERKUNFT_TEXT, ablageordner, ordnerEinsetzen, wahlBezug, type Ablagerolle } from '../kern/ablageordner';
import { dokumentErkennen, type Erkennung } from '../kern/dokumenterkennung';
import type { Feld, ObjektModell, Wert, Werte } from '../kern/modell';
import type { Ansicht, Beipackzettel, Dokumentart } from '../kern/modul';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { base64 } from './baukasten/bilder';
import { reiterFuerAlle } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { Auswahlliste } from './baukasten/auswahlliste';
import { OrdnerFenster } from './dateien';
import { FeldEingabe } from './baukasten/feld';
import { projektId } from './projekt';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

interface Gelesen { seiten: string[]; ocr: boolean; vorschau: string }
/** Was nach dem Ablegen geschehen soll (Eingangsordner: Scan verschieben) und ob die Seite vorbelegt (sonst nur die Erkennung). */
export interface Woher {
  quelle?: string; ohneSeite?: boolean; nachher?: () => Promise<void>;
  /** an einen vorhandenen Eintrag hängen (z. B. Foto oder Skizze an eine Position): Art vorgegeben, Projekt des Eintrags, das Dokument gehört dazu */
  zu?: { objekt: string; id: string; titel: string; art: string };
}
interface Offen { datei: File; woher: Woher; stand: () => { gelesen?: Gelesen; fehler?: string }; setStand: (s: { gelesen?: Gelesen; fehler?: string }) => void }
const ENDUNGEN = /\.(pdf|jpe?g|png|webp|tiff?)$/i;

const [warteschlange, setWarteschlange] = createSignal<Offen[]>([]);
const [modelle, setModelle] = createSignal<ObjektModell[]>([]);

/** Dateien zum Ablegen geben (Hineinziehen, Eingangsordner): eine nach der anderen. */
export function dokumenteAblegen(dateien: File[], woher: Woher = {}): void {
  const passend = dateien.filter((d) => ENDUNGEN.test(d.name));
  if (passend.length < dateien.length) hinweis('Ablegen geht bei PDF und Bildern (Scan, Foto) – der Rest wurde übergangen.', { art: 'fehler' });
  if (!passend.length) return;
  const neu = passend.map((datei): Offen => { const [stand, setStand] = createSignal({}); return { datei, woher, stand, setStand }; });
  setWarteschlange([...warteschlange(), ...neu]);
  for (const o of neu) void lesen(o);
}
async function lesen(o: Offen) {
  try { o.setStand({ gelesen: await ruf<Gelesen>('/api/dokument/lesen', { name: o.datei.name, inhalt: await base64(o.datei) }) }); }
  catch (e) { o.setStand({ fehler: (e as Error).message }); }
}
const weiter = () => setWarteschlange(warteschlange().slice(1));

/** Alle Dokumentarten der Apps, mit der App, die sie mitbringt. */
const artenAus = (module: Beipackzettel[]) => module.flatMap((m) => (m.dokumentarten ?? []).map((d) => ({ ...d, modul: m.id })));
type Art = Dokumentart & { modul: string };

/** Das ganze Fenster nimmt Dateien an; solange gezogen wird, zeigt ein Rahmen, dass hier abgelegt wird. Dazu der Dialog. */
export function DokumentAblage(p: { module: Beipackzettel[]; modul?: Beipackzettel; ansicht?: Ansicht }) {
  setModelle(p.module.flatMap((m) => m.objekte));
  const [zieht, setZieht] = createSignal(false);
  let tiefe = 0;
  const mitDateien = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const rein = (e: DragEvent) => { if (!mitDateien(e)) return; e.preventDefault(); tiefe++; setZieht(true); };
  const ueber = (e: DragEvent) => { if (mitDateien(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; } };
  const raus = (e: DragEvent) => { if (!mitDateien(e)) return; tiefe = Math.max(0, tiefe - 1); if (!tiefe) setZieht(false); };
  const fallen = (e: DragEvent) => {
    if (!mitDateien(e)) return;
    e.preventDefault(); tiefe = 0; setZieht(false);
    if (!darf('dokument', 'schreiben')) { hinweis('Zum Ablegen fehlt dir das Recht.', { art: 'fehler' }); return; }
    dokumenteAblegen([...(e.dataTransfer?.files ?? [])]);
  };
  onMount(() => { addEventListener('dragenter', rein); addEventListener('dragover', ueber); addEventListener('dragleave', raus); addEventListener('drop', fallen); });
  onCleanup(() => { removeEventListener('dragenter', rein); removeEventListener('dragover', ueber); removeEventListener('dragleave', raus); removeEventListener('drop', fallen); });
  const arten = createMemo(() => artenAus(p.module));
  // vorbelegt: die Art der Seite, sonst die erste der App, sonst „Sonstiges Dokument“
  const vorbelegt = () => arten().find((a) => a.modul === p.modul?.id && a.ansichten?.includes(p.ansicht?.id ?? '')) ?? arten().find((a) => a.modul === p.modul?.id) ?? arten().find((a) => !a.objekt)!;
  return (
    <>
      <Show when={zieht()}><div class="ablage-ziel" aria-hidden="true"><div>Loslassen zum Ablegen<small>{vorbelegt()?.titel} · PDF, Scan oder Foto</small></div></div></Show>
      <Show when={warteschlange()[0]} keyed>{(o) => <Ablegen o={o} arten={arten()} rollen={p.module.flatMap((m) => m.ablagerollen ?? [])} vor={o.woher.zu ? arten().find((a) => a.art === o.woher.zu!.art)! : o.woher.ohneSeite ? arten().find((a) => !a.objekt)! : vorbelegt()} rest={warteschlange().length - 1} />}</Show>
    </>
  );
}

const heute = () => new Date().toISOString().slice(0, 10);
const lvName = (lv: Zeile | undefined) => (lv ? [lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ') : '');

function Ablegen(p: { o: Offen; arten: Art[]; rollen: Ablagerolle[]; vor: Art; rest: number }) {
  const g = () => p.o.stand().gelesen;
  const kontakte = createMemo(() => lebende('kontakt').sort((a, b) => String(a.werte.name ?? '').localeCompare(String(b.werte.name ?? ''), 'de')));
  const projekte = createMemo(() => lebende('projekt'));
  const buero = String(sicht.buero?.[BUERO_ID]?.werte.name ?? '');
  const erkannt = createMemo((): Erkennung | undefined => g() && dokumentErkennen(g()!.seiten.join('\n'), { arten: p.arten, projekte: projekte().map((z) => ({ id: z.id, ...z.werte })), kontakte: kontakte().map((z) => ({ id: z.id, name: z.werte.name })), ausser: buero ? [buero] : [] }));
  // Erkanntes schlägt die Vorbelegung, wenn der Text es ausdrücklich sagt (mehr Merkmale) – dann blinkt das Feld
  const zu = p.o.woher.zu;
  const [art, setArt] = createSignal(p.vor.art), [projekt, setProjekt] = createSignal(zu ? String(sicht[zu.objekt]?.[zu.id]?.werte.projekt ?? '') : projektId() ?? '');
  const [rot, setRot] = createSignal<Set<string>>(new Set());
  const [werte, setWerte] = createSignal<Record<string, Wert>>({});   // lv, firma, nummer, datum, betrag
  const [vonHand, setVonHand] = createSignal<Set<string>>(new Set());
  const [name, setName] = createSignal<string | null>(null);
  let vorbelegt = false;
  createEffect(() => { const e = erkannt(); if (e && !vorbelegt) untrack(() => vorbelegen(e)); });
  const vorbelegen = (e: Erkennung) => {
    vorbelegt = true;
    const r = new Set<string>();
    if (!zu && e.art && e.art !== p.vor.art && (e.punkte[e.art] ?? 0) > (e.punkte[p.vor.art] ?? 0)) { setArt(e.art); r.add('art'); }
    if (!zu && e.projekt && e.projekt !== projekt()) { if (projekt()) r.add('projekt'); setProjekt(e.projekt); }
    setRot(p.o.woher.ohneSeite ? new Set<string>() : r);
    setWerte({ firma: e.firma, nummer: e.nummer || null, datum: e.datum || null, betrag: e.betrag, lv: lvVorschlag(e.firma) });
  };
  const a = () => p.arten.find((x) => x.art === art())!;
  const lvs = createMemo(() => lebende('lv').filter((l) => l.werte.projekt === projekt()));
  // LV: bei Rechnungen der Auftrag der Firma, bei Angeboten das LV, zu dem die Firma angeschrieben wurde – nur wenn eindeutig
  const lvVorschlag = (firma: string | null): string | null => {
    if (!firma) return lvs().length === 1 ? lvs()[0]!.id : null;
    const ang = lebende('angebot').filter((x) => x.werte.bieter === firma && lvs().some((l) => l.id === x.werte.lv));
    const auftrag = ang.filter((x) => x.werte.beauftragt === true);
    const l = [...new Set((auftrag.length ? auftrag : ang).map((x) => String(x.werte.lv)))];
    return l.length === 1 ? l[0]! : null;
  };
  const modell = () => (a().objekt ? modelle().find((m) => m.name === a().objekt) : undefined);
  /** Das Feld des Zielobjekts zu einer erkannten Angabe – mit Titel und Art von dort. */
  const feld = (k: keyof NonNullable<Dokumentart['felder']>): Feld | undefined => { const n = a().felder?.[k]; return n ? modell()?.felder.find((f) => f.name === n) : undefined; };
  const setze = (k: string, w: Wert) => { setWerte({ ...werte(), [k]: w }); setVonHand(new Set([...vonHand(), k])); setRot(new Set([...rot()].filter((x) => x !== k))); };
  const firmaName = () => String(sicht.kontakt?.[String(werte().firma ?? '')]?.werte.name ?? '');
  const lv = () => sicht.lv?.[String(werte().lv ?? '')];
  const endung = () => p.o.datei.name.split('.').pop()!.toLowerCase();
  // an einen Eintrag gehängt (Unterlage, Foto zur Position …): der Name der Datei bleibt; sonst Datum, Art, Firma, Nummer
  const vorschlagName = () => {
    if (zu) return p.o.datei.name.replace(/[\\/:*?"<>|]+/g, '-');
    const w = werte(), d = typeof w.datum === 'string' && w.datum ? w.datum : heute();
    return `${[d, a().titel, firmaName(), w.nummer ? `Nr. ${String(w.nummer)}` : ''].filter(Boolean).join(' ')}.${endung()}`.replace(/[\\/:*?"<>|]+/g, '-');
  };
  // Ablageordner (kern/ablageordner): immer nur ein Vorschlag – fest in der Verwaltung, sonst wie zuletzt im Projekt, Büro, ab Werk
  const rolle = () => p.rollen.find((r) => r.id === a().rolle)!;
  const regel = () => { const r = lebende('ablageregel').find((x) => x.werte.rolle === a().rolle); return r ? { ordner: String(r.werte.ordner ?? ''), fest: r.werte.fest === true } : undefined; };
  const lvGewerk = () => { const g = lv()?.werte.gewerk; return g ? String(sicht.gewerk?.[String(g)]?.werte[modelle().find((m) => m.name === 'gewerk')?.anzeigeFeld ?? 'name'] ?? '') : ''; };
  const gewerk = () => lvGewerk() || String(sicht.kontakt?.[String(werte().firma ?? '')]?.werte.gewerk ?? '');
  const muster = () => (regel()?.ordner.trim() ? regel()!.ordner : rolle().ordner);
  const bezug = () => wahlBezug(muster(), { firma: (werte().firma as string | null) ?? null, gewerk: gewerk() || null });
  const gemerkt = () => lebende('ablagewahl').find((x) => x.werte.projekt === projekt() && x.werte.art === art() && String(x.werte.bezug ?? '') === bezug());
  const platz = () => ({ projekt: String(sicht.projekt?.[projekt()]?.werte.nummer ?? ''), lv: lvName(lv()), firma: firmaName(), gewerk: gewerk(), datum: heute() });
  const vorschlag = createMemo(() => ablageordner(rolle(), { regel: regel(), wahl: gemerkt() ? String(gemerkt()!.werte.ordner ?? '') : undefined }, platz()));
  const [eigenerOrdner, setEigenerOrdner] = createSignal<string | null>(null);
  const ordnerText = () => (vorschlag().herkunft === 'fest' ? vorschlag().ordner : eigenerOrdner() ?? vorschlag().ordner);
  const ordner = () => ordnerEinsetzen(ordnerText(), {});   // erst beim Ablegen bereinigt – beim Tippen springt nichts
  const projektordner = () => String(sicht.projekt?.[projekt()]?.werte.ordner ?? '').split(/[\\/]+/).filter(Boolean).join('/');
  const [ordnerWahl, setOrdnerWahl] = createSignal(false);
  const ordnerGewaehlt = (pfad: string) => {
    setOrdnerWahl(false);
    const wurzel = projektordner();
    if (pfad !== wurzel && !pfad.startsWith(`${wurzel}/`)) { hinweis(`Bitte einen Ordner innerhalb des Projektordners „${wurzel}“ wählen.`, { art: 'fehler' }); return; }
    setEigenerOrdner(pfad.slice(wurzel.length + 1));
  };
  /** Eine andere Wahl merkt sich das Projekt (je Dokumentart und Firma/Gewerk) – als Befehl, mit dem Ablegen rückgängig zu machen. */
  const wahlMerken = (): Vorlage[] => {
    if (vorschlag().herkunft === 'fest' || ordner() === vorschlag().ordner) return [];
    const g = gemerkt();
    return [g ? { objekt: 'ablagewahl', art: 'aendern', objektId: g.id, werte: { ordner: ordner() } }
      : { objekt: 'ablagewahl', art: 'anlegen', objektId: neueKennung(), werte: { projekt: projekt(), art: art(), bezug: bezug(), ordner: ordner() } }];
  };
  const fehlt = () => !projekt() ? 'Projekt wählen' : feld('lv')?.pflicht && !werte().lv ? 'LV wählen' : feld('firma')?.pflicht && !werte().firma ? 'Firma wählen' : '';
  const [laeuft, setLaeuft] = createSignal(false);
  const ablegen = async () => {
    const m = modell(), ziel = neueKennung();
    let bezug: string | undefined;
    if (m) {
      const f = a().felder ?? {}, w = werte();
      const basis: Werte = { projekt: projekt(), ...(a().vorgaben ?? {}) };
      if (f.lv) basis[f.lv] = w.lv ?? null;
      if (f.firma) basis[f.firma] = w.firma ?? null;
      if (f.eingang) basis[f.eingang] = heute();
      const erkannteFelder: Werte = {}, handFelder: Werte = {};
      for (const k of ['nummer', 'datum', 'betrag'] as const) if (f[k] && w[k] != null && w[k] !== '') (vonHand().has(k) ? handFelder : erkannteFelder)[f[k]!] = w[k]!;
      const vorhanden = a().vorhanden?.length ? lebende(m.name).find((z) => a().vorhanden!.every((n) => z.werte[n] === basis[n])) : undefined;
      bezug = vorhanden?.id ?? ziel;
      const befehle: Vorlage[] = vorhanden
        ? [{ objekt: m.name, art: 'aendern', objektId: vorhanden.id, werte: Object.fromEntries(Object.entries({ ...basis, ...handFelder }).filter(([k]) => !a().vorhanden!.includes(k) && k !== 'projekt')) }]
        : [{ objekt: m.name, art: 'anlegen', objektId: ziel, werte: { ...basis, ...handFelder } }];
      if (Object.keys(erkannteFelder).length) befehle.push({ objekt: m.name, art: 'aendern', objektId: bezug, werte: erkannteFelder, herkunft: 'dokument' });
      ausfuehrenMehrere([...befehle, ...wahlMerken()], `${a().titel} abgelegt`);
    } else if (wahlMerken().length) ausfuehrenMehrere(wahlMerken(), `Ablageordner für „${a().titel}“ gemerkt`);
    setLaeuft(true);
    try {
      const r = await ruf<{ ort: string; name: string }>('/api/dokument/ablegen', { id: neueKennung(), projekt: projekt(), art: a().titel, name: name() ?? vorschlagName(), unterordner: ordner(),
        inhalt: await base64(p.o.datei), vorschau: g()!.vorschau, bezug_objekt: m?.name ?? zu?.objekt ?? '', bezug: bezug ?? zu?.id ?? '', eingang: heute(), quelle: p.o.woher.quelle ?? '' });
      await p.o.woher.nachher?.();
      hinweis(`„${r.name}“ ${r.ort === 'ablage' ? `liegt im Projektordner unter ${ordner()}` : 'liegt im Bauportal (Testserver oder Projekt ohne Ordner)'}.`);
      weiter();
    } catch (e) { hinweis((e as Error).message, { art: 'fehler' }); }
    finally { setLaeuft(false); }
  };
  const blink = (k: string, inhalt: JSX.Element) => <div class="dok-feld" classList={{ 'dok-rot': rot().has(k) }}>{inhalt}</div>;
  const zusammenhang = () => ({ projekt: projekt() });
  return (
    <Dialog titel={`Ablegen – ${p.o.datei.name}${p.rest ? ` (noch ${p.rest})` : ''}`} gross onAbbrechen={weiter} geaendert={() => true}
      knoepfe={<><button class="knopf" onClick={weiter}>Abbrechen</button>
        <button class="knopf haupt" disabled={!g() || !!fehlt() || laeuft()} title={fehlt()} onClick={() => void ablegen()}>Ablegen</button></>}>
      <Show when={!p.o.stand().fehler} fallback={<p class="feld-fehler">Die Datei ließ sich nicht lesen: {p.o.stand().fehler}</p>}>
        <Show when={g()} fallback={<p class="still-text">Die Datei wird gelesen{/\.pdf$/i.test(p.o.datei.name) ? '' : ' (Texterkennung)'} …</p>}>
          <div class="dok-ablage">
            <img class="dok-bild" src={`data:image/jpeg;base64,${g()!.vorschau}`} alt="Erste Seite" />
            <div class="dok-felder">
              <Show when={rot().size}><p class="dok-hinweis">Rot: Das Dokument sagt etwas anderes als die Seite, auf der du bist – bitte prüfen.</p></Show>
              {blink('art', <div class="feld"><label>Art</label><Auswahlliste titel="Art" wert={art()} optionen={p.arten.map((x) => ({ wert: x.art, titel: x.titel }))} onWert={(w) => { setArt(w); setRot(new Set([...rot()].filter((x) => x !== 'art'))); }} /></div>)}
              {blink('projekt', <div class="feld"><label>Projekt</label><Auswahlliste titel="Projekt" wert={projekt()} optionen={projekte().map((z) => ({ wert: z.id, titel: [z.werte.nummer, z.werte.name].filter(Boolean).join(' · ') }))}
                onWert={(w) => { setProjekt(w); setRot(new Set([...rot()].filter((x) => x !== 'projekt'))); setWerte({ ...werte(), lv: null }); }} /></div>)}
              <Show when={a().felder?.firma || muster().includes('{firma}')}><div class="feld"><label>{feld('firma')?.titel ?? 'Firma'}</label><Auswahlliste titel="Firma" wert={(werte().firma as string) ?? ''} optionen={[{ wert: '', titel: '– keine –' }, ...kontakte().map((k) => ({ wert: k.id, titel: String(k.werte.name ?? '') }))]}
                onWert={(w) => { setze('firma', w || null); if (!werte().lv) setWerte({ ...werte(), lv: lvVorschlag(w || null) }); }} /></div></Show>
              <Show when={a().felder?.lv || /\{(lv|gewerk)\}/.test(muster())}><div class="feld"><label>Leistungsverzeichnis</label><Auswahlliste titel="Leistungsverzeichnis" wert={(werte().lv as string) ?? ''} optionen={[{ wert: '', titel: '– keins –' }, ...lvs().map((l) => ({ wert: l.id, titel: lvName(l) }))]} onWert={(w) => setze('lv', w || null)} /></div></Show>
              <For each={(['nummer', 'datum', 'betrag'] as const).filter((k) => feld(k))}>{(k) => (
                <FeldEingabe feld={feld(k)!} wert={werte()[k] ?? null} onWert={(w) => setze(k, w)} herkunft={vonHand().has(k) || werte()[k] == null ? undefined : 'dokument'} zusammenhang={zusammenhang()} />
              )}</For>
              <div class="feld"><label>Dateiname im Projektordner</label><input value={name() ?? vorschlagName()} onInput={(e) => setName(e.currentTarget.value)} aria-label="Dateiname im Projektordner" /></div>
              <div class="feld"><label>Ordner im Projektordner</label>
                <div class="reihe"><input value={ordnerText()} disabled={vorschlag().herkunft === 'fest'} onInput={(e) => setEigenerOrdner(e.currentTarget.value)} aria-label="Ordner im Projektordner" />
                  <Show when={projektordner() && vorschlag().herkunft !== 'fest'}><button type="button" class="knopf" onClick={() => setOrdnerWahl(true)}>Ordner wählen …</button></Show></div>
                <small class="still-text">{eigenerOrdner() != null && ordner() !== vorschlag().ordner ? 'eigene Wahl – das Projekt merkt sie sich' : HERKUNFT_TEXT[vorschlag().herkunft]}</small></div>
              <p class="still-text klein-text">{g()!.ocr ? 'Text per Texterkennung gelesen · ' : ''}{a().objekt ? `daraus wird: ${modell()?.titel}` : zu ? `gehört zu: ${zu.titel}` : 'wird nur abgelegt'}</p>
              <Show when={ordnerWahl()}><OrdnerFenster start={[projektordner(), ordner()].filter(Boolean).join('/')} onZu={() => setOrdnerWahl(false)} onWahl={ordnerGewaehlt} /></Show>
            </div>
          </div>
        </Show>
      </Show>
    </Dialog>
  );
}

// Jede Karte, zu deren Eintrag Dokumente abgelegt sind, bekommt den Reiter „Dokumente“
reiterFuerAlle.push((m, z) => {
  if (m.name === 'dokument') return undefined;
  const d = lebende('dokument').filter((x) => x.werte.bezug === z.id);
  return d.length ? { titel: `Dokumente (${d.length})`, inhalt: () => <DokumentListe dokumente={d} /> } : undefined;
});

export function DokumentListe(p: { dokumente: Zeile[] }) {
  return (
    <div class="dok-liste">
      <For each={p.dokumente}>{(d) => (
        <a class="dok-kachel" href={`/api/dokument/original/${d.id}`} title="Ansehen" onClick={(e) => { e.preventDefault();
          const l = p.dokumente.map((x) => ({ name: String(x.werte.name ?? 'Dokument'), url: `/api/dokument/original/${x.id}`, laden: `/api/dokument/original/${x.id}` }));
          dateiZeigen(l, String(d.werte.name ?? 'Dokument')); }}>
          <img src={`/api/dokument/vorschau/${d.id}`} alt="" loading="lazy" /><span>{String(d.werte.name ?? '')}</span>
        </a>
      )}</For>
    </div>
  );
}

// ---------- Eingangsordner: Scans vom Kopierer, je Datei „Ablegen“ (erkannt wie beim Hineinziehen), danach „verarbeitet“ ----------
interface EingangDatei { name: string; groesse: number; geaendert: string }
export function EingangAnsicht(): JSX.Element {
  const [stand, setStand] = createSignal<{ dateien: EingangDatei[]; nurLesen: boolean; fertig: string } | null>(null);
  const [fehler, setFehler] = createSignal('');
  const laden = async () => { try { setStand(await ruf('/api/eingang')); setFehler(''); } catch (e) { setFehler((e as Error).message); } };
  onMount(() => { void laden(); const uhr = setInterval(() => void laden(), 60000); onCleanup(() => clearInterval(uhr)); });   // überwacht, solange die Seite offen ist
  const quelle = (d: EingangDatei) => `eingang:${d.name}|${d.geaendert}`;
  const abgelegt = createMemo(() => new Set(lebende('dokument').map((x) => String(x.werte.quelle ?? ''))));
  const ablegen = async (liste: EingangDatei[]) => {
    for (const d of liste) {
      const r = await fetch(`/api/eingang/datei?name=${encodeURIComponent(d.name)}`);
      if (!r.ok) { hinweis(((await r.json().catch(() => ({}))) as { fehler?: string }).fehler ?? `„${d.name}“ ließ sich nicht holen`, { art: 'fehler' }); continue; }
      dokumenteAblegen([new File([await r.blob()], d.name)], { quelle: quelle(d), ohneSeite: true,
        nachher: async () => { await ruf('/api/eingang/fertig', { name: d.name }); await laden(); } });
    }
  };
  const neue = () => (stand()?.dateien ?? []).filter((d) => ENDUNGEN.test(d.name) && !abgelegt().has(quelle(d)));
  const groesse = (b: number) => (b > 1048576 ? `${(b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return (
    <div class="eingang">
      <div class="ps-kopf">
        <h2>Eingang (Scans)</h2>
        <div class="eingang-knoepfe">
          <button type="button" class="knopf" onClick={() => void laden()}>Neu laden</button>
          <button type="button" class="knopf haupt" disabled={!neue().length || !darf('dokument', 'schreiben')} onClick={() => void ablegen(neue())}>Alle neuen ablegen ({neue().length})</button>
        </div>
      </div>
      <Show when={!fehler()} fallback={<p class="feld-fehler">{fehler()}</p>}>
        <Show when={stand()} fallback={<p class="still-text">Der Eingangsordner wird gelesen …</p>}>{(s) => (
          <>
            <p class="still-text klein-text">{s().nurLesen ? 'Testserver: Die Scans bleiben im Eingangsordner liegen – er darf den Dateiserver nur lesen. Abgelegte sind markiert.' : `Nach dem Ablegen wandert der Scan nach „${s().fertig}“.`} Die Liste wird jede Minute neu gelesen.</p>
            <Show when={s().dateien.length} fallback={<p class="still-text">Der Eingangsordner ist leer.</p>}>
              <table class="einlesen-tabelle eingang-tabelle">
                <thead><tr><th>Datei</th><th>eingegangen</th><th class="zahl">Größe</th><th /></tr></thead>
                <tbody>
                  <For each={s().dateien}>{(d) => (
                    <tr classList={{ schon: abgelegt().has(quelle(d)) }}>
                      <td title={d.name}>{d.name}</td><td>{new Date(d.geaendert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="zahl">{groesse(d.groesse)}</td>
                      <td><Show when={ENDUNGEN.test(d.name)} fallback={<span class="still-text klein-text">keine PDF/Bild</span>}>
                        <Show when={!abgelegt().has(quelle(d))} fallback={<span class="still-text klein-text">abgelegt</span>}>
                          <button type="button" class="knopf klein" disabled={!darf('dokument', 'schreiben')} onClick={() => void ablegen([d])}>Ablegen</button>
                        </Show></Show></td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </Show>
          </>
        )}</Show>
      </Show>
    </div>
  );
}
