// Baustein „Nachschlagen“: große Kataloge (Positionsdatenbank …) durchsuchen, ohne sie auf das Gerät zu laden.
// Dieselben Bausteine wie jede Liste – Rahmen, Baum links, Tabelle, Detailkarte rechts –, nur kommen die Zeilen
// seitenweise vom Server: Suche und Ast links fragen neu, beim Rollen ans Ende kommt die nächste Seite. Nur lesen.
import { Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import type { Zeile } from '../../kern/befehl';
import type { ObjektModell } from '../../kern/modell';
import type { Nachschlag } from '../../kern/modul';
import { Rahmen } from './rahmen';
import { Baum, type Knoten } from './baum';
import { Tabelle } from './tabelle';
import { Detailkarte } from './detailkarte';

const TRENNER = '\u001f';
const holen = async <T,>(adresse: string): Promise<T> => {
  const r = await fetch(adresse, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`Fehler ${r.status}`);
  return r.json() as Promise<T>;
};

export function Nachschlagen(p: { schluessel: string; nachschlag: Nachschlag }) {
  const n = p.nachschlag;
  // Für Tabelle und Karte wie ein Objekt beschrieben – ohne Rechte zum Schreiben
  const m: ObjektModell = { name: n.name, titel: n.titel, titelMehrzahl: n.titelMehrzahl, anzeigeFeld: n.anzeigeFeld, felder: n.felder, rechte: { lesen: [], schreiben: [], loeschen: [] } };
  const [suche, setSuche] = createSignal('');
  const [ast, setAst] = createSignal('');
  const [zeilen, setZeilen] = createSignal<Zeile[]>([]);
  const [gesamt, setGesamt] = createSignal<number | null>(null);
  const [gewaehlt, setGewaehlt] = createSignal<string | null>(null);
  const [fehler, setFehler] = createSignal('');
  const [aeste, setAeste] = createSignal<{ pfad: string[]; anzahl: number }[]>([]);
  let abfrage = 0, laedt = false;

  holen<{ aeste: { pfad: string[]; anzahl: number }[] }>(`/api/nachschlagen/${n.name}/gliederung`).then((r) => setAeste(r.aeste), () => setFehler('Die Gliederung ließ sich nicht laden.'));
  const knoten = createMemo((): Knoten[] => {
    const wurzel: Knoten = { id: '', titel: '', kinder: [] };
    for (const a of aeste()) {
      let k = wurzel;
      a.pfad.forEach((teil, i) => {
        if (!teil) return;
        const id = a.pfad.slice(0, i + 1).join(TRENNER);
        let kind = k.kinder!.find((x) => x.id === id);
        if (!kind) { kind = { id, titel: teil, anzahl: 0, kinder: [] }; k.kinder!.push(kind); }
        kind.anzahl! += a.anzahl; k = kind;
      });
    }
    const ohneLeere = (l: Knoten[]): Knoten[] => l.map((x) => ({ ...x, kinder: x.kinder?.length ? ohneLeere(x.kinder) : undefined }));
    return [{ id: '', titel: `Alle ${n.titelMehrzahl}`, anzahl: aeste().reduce((s, a) => s + a.anzahl, 0), kinder: ohneLeere(wurzel.kinder!) }];
  });

  const seite = async (von: number) => {
    const nr = ++abfrage; laedt = true;
    const q = new URLSearchParams({ suche: suche(), von: String(von) });
    if (ast()) q.set('pfad', JSON.stringify(ast().split(TRENNER)));
    try {
      const r = await holen<{ gesamt: number; zeilen: { id: string; werte: Zeile['werte'] }[] }>(`/api/nachschlagen/${n.name}?${q}`);
      if (nr !== abfrage) return;   // inzwischen neu gefragt
      const neu = r.zeilen.map((z) => ({ id: z.id, werte: z.werte }) as Zeile);
      setZeilen(von ? [...zeilen(), ...neu] : neu); setGesamt(r.gesamt); setFehler('');
    } catch { if (nr === abfrage) setFehler('Die Einträge ließen sich nicht laden – keine Verbindung zum Server?'); }
    finally { if (nr === abfrage) laedt = false; }
  };
  // Suche (kurz verzögert, damit nicht jeder Buchstabe fragt) und Ast links fragen neu
  let warte: ReturnType<typeof setTimeout> | undefined;
  createEffect(on([suche, ast], () => { clearTimeout(warte); warte = setTimeout(() => void seite(0), 200); }));
  const weiter = () => { if (!laedt && gesamt() !== null && zeilen().length < gesamt()!) void seite(zeilen().length); };

  const zeile = () => zeilen().find((z) => z.id === gewaehlt());
  const zaehler = () => (gesamt() === null ? 'lädt …' : `${gesamt()!.toLocaleString('de-DE')} ${gesamt() === 1 ? n.titel : n.titelMehrzahl}`);
  return (
    <Rahmen schluessel={p.schluessel}
      menueMitte={<>
        <input class="suche" type="search" placeholder={`${n.titelMehrzahl} durchsuchen (Nummer oder Text)`} aria-label="Suchen" value={suche()} onInput={(e) => setSuche(e.currentTarget.value)} />
        <span class="zaehler">{zaehler()}</span>
      </>}
      baum={<Baum titel={`Gliederung ${n.titelMehrzahl}`} knoten={knoten()} gewaehlt={ast()} onWahl={setAst} />}
      inhalt={<>
        <Show when={fehler()}><p class="still-text" role="alert">{fehler()}</p></Show>
        <Tabelle modell={m} zeilen={zeilen()} gewaehlt={gewaehlt()} onWahl={setGewaehlt} reihenfolgeFest onEnde={weiter}
          leer={gesamt() === 0 ? (aeste().length ? 'Kein Treffer.' : `Noch keine ${n.titelMehrzahl} – sie kommen über Verwaltung → Updates.`) : 'lädt …'} />
      </>}
      details={<Show when={zeile()}>{(z) => <Detailkarte modell={m} zeile={z()} onZu={() => setGewaehlt(null)} />}</Show>}
      detailsHinweis={`Eine ${n.titel} anklicken, um sie hier zu sehen.`} />
  );
}
