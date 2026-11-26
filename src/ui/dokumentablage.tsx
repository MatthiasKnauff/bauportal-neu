// Dokumente ablegen: eine PDF, ein Scan oder Foto irgendwo ins Fenster ziehen → der Dateidienst liest den Text (Scans mit
// Texterkennung) → die Erkennung (kern/dokumenterkennung) schlägt Art, Projekt, Firma, Nummer, Datum und Betrag vor →
// ein Dialog zeigt alles zum Prüfen → „Ablegen“ legt das Original in den Projektordner und den Eintrag an (Rechnung, Angebot …).
// Vorbelegt ist die Art der Seite, auf der man steht; erkennt der Text ausdrücklich etwas anderes (eine Rechnung, ein anderes
// Projekt), steht das Erkannte drin und das Feld blinkt rot. Was es gibt, sagen die Beipackzettel (dokumentarten).
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type JSX } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import { dokumentErkennen, type Erkennung } from '../kern/dokumenterkennung';
import type { Feld, ObjektModell, Wert, Werte } from '../kern/modell';
import type { Ansicht, Beipackzettel, Dokumentart } from '../kern/modul';
import { BUERO_ID } from '../module/verwaltung/beipackzettel';
import { base64 } from './baukasten/bilder';
import { reiterFuerAlle } from './baukasten/detailkarte';
import { Dialog } from './baukasten/dialog';
import { Auswahlliste } from './baukasten/auswahlliste';
import { FeldEingabe } from './baukasten/feld';
import { projektId } from './projekt';
import { ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, neueKennung, ruf } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';

interface Gelesen { seiten: string[]; ocr: boolean; vorschau: string }
interface Offen { datei: File; stand: () => { gelesen?: Gelesen; fehler?: string }; setStand: (s: { gelesen?: Gelesen; fehler?: string }) => void }
const ENDUNGEN = /\.(pdf|jpe?g|png|webp|tiff?)$/i;

const [warteschlange, setWarteschlange] = createSignal<Offen[]>([]);
const [modelle, setModelle] = createSignal<ObjektModell[]>([]);

/** Dateien zum Ablegen geben (Hineinziehen, Eingangsordner): eine nach der anderen. */
export function dokumenteAblegen(dateien: File[]): void {
  const passend = dateien.filter((d) => ENDUNGEN.test(d.name));
  if (passend.length < dateien.length) hinweis('Ablegen geht bei PDF und Bildern (Scan, Foto) – der Rest wurde übergangen.', { art: 'fehler' });
  if (!passend.length) return;
  const neu = passend.map((datei): Offen => { const [stand, setStand] = createSignal({}); return { datei, stand, setStand }; });
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
      <Show when={warteschlange()[0]} keyed>{(o) => <Ablegen o={o} arten={arten()} vor={vorbelegt()} rest={warteschlange().length - 1} />}</Show>
    </>
  );
}

const heute = () => new Date().toISOString().slice(0, 10);
const lvName = (lv: Zeile | undefined) => (lv ? [lv.werte.nummer, lv.werte.name].filter(Boolean).join(' ') : '');

function Ablegen(p: { o: Offen; arten: Art[]; vor: Art; rest: number }) {
  const g = () => p.o.stand().gelesen;
  const kontakte = createMemo(() => lebende('kontakt').sort((a, b) => String(a.werte.name ?? '').localeCompare(String(b.werte.name ?? ''), 'de')));
  const projekte = createMemo(() => lebende('projekt'));
  const buero = String(sicht.buero?.[BUERO_ID]?.werte.name ?? '');
  const erkannt = createMemo((): Erkennung | undefined => g() && dokumentErkennen(g()!.seiten.join('\n'), { arten: p.arten, projekte: projekte().map((z) => ({ id: z.id, ...z.werte })), kontakte: kontakte().map((z) => ({ id: z.id, name: z.werte.name })), ausser: buero ? [buero] : [] }));
  // Erkanntes schlägt die Vorbelegung, wenn der Text es ausdrücklich sagt (mehr Merkmale) – dann blinkt das Feld
  const [art, setArt] = createSignal(p.vor.art), [projekt, setProjekt] = createSignal(projektId() ?? '');
  const [rot, setRot] = createSignal<Set<string>>(new Set());
  const [werte, setWerte] = createSignal<Record<string, Wert>>({});   // lv, firma, nummer, datum, betrag
  const [vonHand, setVonHand] = createSignal<Set<string>>(new Set());
  const [name, setName] = createSignal<string | null>(null);
  let vorbelegt = false;
  createEffect(() => { const e = erkannt(); if (e && !vorbelegt) untrack(() => vorbelegen(e)); });
  const vorbelegen = (e: Erkennung) => {
    vorbelegt = true;
    const r = new Set<string>();
    if (e.art && e.art !== p.vor.art && (e.punkte[e.art] ?? 0) > (e.punkte[p.vor.art] ?? 0)) { setArt(e.art); r.add('art'); }
    if (e.projekt && e.projekt !== projekt()) { if (projekt()) r.add('projekt'); setProjekt(e.projekt); }
    setRot(r);
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
  const vorschlagName = () => {
    const w = werte(), d = typeof w.datum === 'string' && w.datum ? w.datum : heute();
    return `${[d, a().titel, firmaName(), w.nummer ? `Nr. ${String(w.nummer)}` : ''].filter(Boolean).join(' ')}.${endung()}`.replace(/[\\/:*?"<>|]+/g, '-');
  };
  const ordner = () => a().ordner.replace('{lv}', lvName(lv()) || 'ohne LV').replace(/\/+$/, '');
  const fehlt = () => !projekt() ? 'Projekt wählen' : a().felder?.lv && !werte().lv ? 'LV wählen' : a().felder?.firma && feld('firma')?.pflicht && !werte().firma ? 'Firma wählen' : '';
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
      ausfuehrenMehrere(befehle, `${a().titel} abgelegt`);
    }
    setLaeuft(true);
    try {
      const r = await ruf<{ ort: string; name: string }>('/api/dokument/ablegen', { id: neueKennung(), projekt: projekt(), art: a().titel, name: name() ?? vorschlagName(), unterordner: ordner(),
        inhalt: await base64(p.o.datei), vorschau: g()!.vorschau, bezug_objekt: m?.name ?? '', bezug: bezug ?? '', eingang: heute() });
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
              <Show when={a().felder?.firma}><div class="feld"><label>{feld('firma')?.titel ?? 'Firma'}</label><Auswahlliste titel="Firma" wert={(werte().firma as string) ?? ''} optionen={[{ wert: '', titel: '– keine –' }, ...kontakte().map((k) => ({ wert: k.id, titel: String(k.werte.name ?? '') }))]}
                onWert={(w) => { setze('firma', w || null); if (!werte().lv) setWerte({ ...werte(), lv: lvVorschlag(w || null) }); }} /></div></Show>
              <Show when={a().felder?.lv || a().ordner.includes('{lv}')}><div class="feld"><label>Leistungsverzeichnis</label><Auswahlliste titel="Leistungsverzeichnis" wert={(werte().lv as string) ?? ''} optionen={[{ wert: '', titel: '– keins –' }, ...lvs().map((l) => ({ wert: l.id, titel: lvName(l) }))]} onWert={(w) => setze('lv', w || null)} /></div></Show>
              <For each={(['nummer', 'datum', 'betrag'] as const).filter((k) => feld(k))}>{(k) => (
                <FeldEingabe feld={feld(k)!} wert={werte()[k] ?? null} onWert={(w) => setze(k, w)} herkunft={vonHand().has(k) || werte()[k] == null ? undefined : 'dokument'} zusammenhang={zusammenhang()} />
              )}</For>
              <div class="feld"><label>Dateiname im Projektordner</label><input value={name() ?? vorschlagName()} onInput={(e) => setName(e.currentTarget.value)} aria-label="Dateiname im Projektordner" /></div>
              <p class="still-text klein-text">Ordner: {ordner()}{g()!.ocr ? ' · Text per Texterkennung gelesen' : ''}{a().objekt ? ` · daraus wird: ${modell()?.titel}` : ' · wird nur abgelegt'}</p>
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
        <a class="dok-kachel" href={`/api/dokument/original/${d.id}`} target="_blank" rel="noopener" title="Original öffnen">
          <img src={`/api/dokument/vorschau/${d.id}`} alt="" loading="lazy" /><span>{String(d.werte.name ?? '')}</span>
        </a>
      )}</For>
    </div>
  );
}
