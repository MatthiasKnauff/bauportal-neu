// Gewerke & Firmen im Bauzeitenplan (wie im bisherigen Bauportal, neu gebaut): je Gewerk aus dem Plan die Firma im Projekt,
// Kontakt, Vergabe, Einsatz im Plan (nur die tatsächlichen Arbeitszeiträume als Balken) und Notiz. Die Zuordnung Gewerk → Firma
// ist ein Eintrag der Projektbeteiligten (Aufgabe = Gewerk); die Firma steht danach bei den Leistungen des Gewerks.
// Aufklappen zeigt die Leistungen – mit eigener Firma, wo sie abweicht (z. B. Nachunternehmer).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type { Vorlage, Zeile } from '../kern/befehl';
import type { Werte } from '../kern/modell';
import { xlsxSchreiben } from '../kern/xlsx';
import { isoAus } from '../module/bauzeitenplan/kalender';
import { GEWERKFARBEN, gewerkFarbe, gewerkFarbenAus } from '../module/bauzeitenplan/plan';
import { firmaInDenPlan, gewerkeAus, passtZumGewerk, type Gewerkzeile } from '../module/bauzeitenplan/gewerke';
import type { Mitte } from './baukasten/anpassung';
import { Auswahlliste } from './baukasten/auswahlliste';
import { Dialog } from './baukasten/dialog';
import { herunterladen } from './baukasten/herunterladen';
import { ausfuehren, ausfuehrenMehrere, lebende, sicht } from './unterbau/abgleich';
import { darf, modell, neueKennung } from './unterbau/api';
import { hinweis } from './unterbau/meldungen';
import { aktuelleVersion, planDerVersion } from './plandaten';
import { projektId } from './projekt';
import { verzeichnisDrucken } from './druck';

/** Die Firma eines Gewerks im Projekt (Eintrag der Beteiligten mit Aufgabe = Gewerk) – auch für die Handyansicht des Plans. */
export const firmaDesGewerks = (projekt: string, gewerk: string): Zeile | undefined => {
  const b = lebende('projekt_kontakt').find((x) => x.werte.projekt === projekt && String(x.werte.aufgabe ?? '').trim().toLowerCase() === gewerk.toLowerCase());
  return b ? sicht.kontakt?.[String(b.werte.kontakt)] : undefined;
};
const datum = (tag: number) => { const i = isoAus(tag); return `${i.slice(8, 10)}.${i.slice(5, 7)}.${i.slice(2, 4)}`; };
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const [offen, setOffen] = createSignal<Set<string>>(new Set());   // aufgeklappte Gewerke

export function GewerkeFirmen(p: Mitte) {
  const projekt = () => projektId();
  const version = createMemo(() => (projekt() ? aktuelleVersion(projekt()!) : undefined));
  const plan = createMemo(() => (version() ? planDerVersion(version()!.id) : undefined));
  const leistungen = createMemo(() => (version() ? lebende('vorgang').filter((v) => v.werte.version === version()!.id) : []));
  const beteiligte = () => p.alle();
  // Farben der Gewerke: am Kalender der Version („Gewerke & Farben“) – sonst fest aus dem Namen
  const kalender = createMemo(() => (version() ? lebende('zeitplan').find((z) => z.werte.version === version()!.id) : undefined));
  const farben = createMemo(() => gewerkFarbenAus(kalender()?.werte));
  const farbe = (g: string) => gewerkFarbe(g, farben());
  const eintrag = (g: string) => beteiligte().find((b) => String(b.werte.aufgabe ?? '').trim().toLowerCase() === g.toLowerCase());   // wie firmaDesGewerks, aber der Eintrag selbst
  // Gewerke aus dem Plan, dazu Beteiligte mit einer Aufgabe, die (noch) nicht im Plan steht – z. B. Statiker:in
  const zeilen = createMemo((): Gewerkzeile[] => {
    const imPlan = plan() ? gewerkeAus(plan()!, (id) => sicht.vorgang?.[id]?.werte) : [];
    const da = new Set(imPlan.map((r) => r.gewerk.toLowerCase()));
    const sonst = beteiligte().map((b) => String(b.werte.aufgabe ?? '').trim()).filter((g) => g && !da.has(g.toLowerCase()))
      .filter((g, i, l) => l.findIndex((x) => x.toLowerCase() === g.toLowerCase()) === i).sort((a, b) => a.localeCompare(b, 'de'))
      .map((g): Gewerkzeile => ({ gewerk: g, leistungen: [], anfang: null, ende: null, einsatz: [], vob: null, firmen: [] }));
    return [...imPlan, ...sonst];
  });
  // Leistungen eines Gewerks, wie sie die Tabelle zeigt – ohne Sammelzeilen (Gruppen bekommen keine Firma)
  const leistungenVon = (g: string) => { const ids = new Set(zeilen().find((r) => r.gewerk === g)?.leistungen.map((l) => l.id) ?? []); return leistungen().filter((v) => ids.has(v.id)); };
  const kontakt = (id: unknown) => (id ? sicht.kontakt?.[String(id)] : undefined);
  const name = (id: unknown) => String(kontakt(id)?.werte.name ?? '');
  const schreiben = () => darf('projekt_kontakt', 'schreiben');
  const firmenFuer = (g: string) => lebende('kontakt').filter((k) => k.werte.art !== 'person')
    .map((k) => ({ wert: k.id, titel: [k.werte.name, k.werte.gewerk].filter(Boolean).join(' – '), passt: passtZumGewerk(k.werte.gewerk, g) }))
    .sort((a, b) => Number(b.passt) - Number(a.passt) || a.titel.localeCompare(b.titel, 'de')).map(({ wert, titel, passt }) => ({ wert, titel: passt ? `★ ${titel}` : titel }));

  // Firma für ein Gewerk: Beteiligte anlegen oder ändern, bei den Leistungen des Gewerks eintragen (wo leer oder die bisherige) – ein Rückgängig
  const firmaSetzen = (g: string, kontaktId: string, neu?: Werte) => {
    const alt = eintrag(g), bisher = alt ? String(alt.werte.kontakt) : null;
    const befehle: Vorlage[] = [];
    if (neu) befehle.push({ objekt: 'kontakt', art: 'anlegen', objektId: kontaktId, werte: neu });
    else if (!String(kontakt(kontaktId)?.werte.gewerk ?? '').trim()) befehle.push({ objekt: 'kontakt', art: 'aendern', objektId: kontaktId, werte: { gewerk: g } });
    if (alt) befehle.push({ objekt: 'projekt_kontakt', art: 'aendern', objektId: alt.id, werte: { kontakt: kontaktId } });
    else befehle.push({ objekt: 'projekt_kontakt', art: 'anlegen', objektId: neueKennung(), werte: { projekt: projekt()!, kontakt: kontaktId, aufgabe: g, vergabe: 'offen' } });
    const plan_ = firmaInDenPlan(leistungenVon(g), g, kontaktId, bisher);
    befehle.push(...plan_.map((x): Vorlage => ({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte: x.werte })));
    ausfuehrenMehrere(befehle, `Firma für ${g}: ${neu ? String(neu.name) : name(kontaktId)}`);
    if (plan_.length) hinweis(`${neu ? String(neu.name) : name(kontaktId)} bei ${plan_.length} ${plan_.length === 1 ? 'Leistung' : 'Leistungen'} als Firma eingetragen.`);
  };
  const neueFirma = (g: string, text: string) => firmaSetzen(g, neueKennung(), { name: text, art: 'firma', gewerk: g });
  const aendern = (b: Zeile, werte: Werte, titel: string) => ausfuehren({ objekt: 'projekt_kontakt', art: 'aendern', objektId: b.id, werte }, titel);
  // Firma einer einzelnen Leistung (leer = wie das Gewerk)
  const leistungFirma = (id: string, firma: string | null) => ausfuehren({ objekt: 'vorgang', art: 'aendern', objektId: id, werte: { firma } }, `Firma bei „${String(sicht.vorgang?.[id]?.werte.name ?? '')}“`);
  const abweichend = (r: Gewerkzeile) => { const f = eintrag(r.gewerk)?.werte.kontakt; return f ? r.leistungen.filter((l) => { const x = sicht.vorgang?.[l.id]?.werte.firma; return !!x && x !== f; }).length : 0; };

  // „Firmen in den Plan“: die Firma jedes Gewerks bei allen seinen Leistungen – wo schon eine andere steht, nur nach Rückfrage
  const [frage, setFrage] = createSignal<{ leer: Vorlage[]; alle: Vorlage[]; beispiel: string } | null>(null);
  const firmenInDenPlan = () => {
    const leer: Vorlage[] = [], alle: Vorlage[] = [];
    for (const r of zeilen()) {
      const f = eintrag(r.gewerk)?.werte.kontakt; if (!f) continue;
      const bisher = String(f);
      for (const x of firmaInDenPlan(leistungenVon(r.gewerk), r.gewerk, bisher, bisher, false)) leer.push({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte: x.werte });
      for (const x of firmaInDenPlan(leistungenVon(r.gewerk), r.gewerk, bisher, bisher, true)) alle.push({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte: x.werte });
    }
    if (!alle.length) { hinweis('Alle Leistungen haben schon die Firma ihres Gewerks.'); return; }
    if (alle.length === leer.length) { ausfuehrenMehrere(leer, 'Firmen in den Plan'); hinweis(`Bei ${leer.length} ${leer.length === 1 ? 'Leistung' : 'Leistungen'} die Firma des Gewerks eingetragen.`); return; }
    const anders = alle.find((x) => !leer.some((y) => y.objektId === x.objektId))!;
    setFrage({ leer, alle, beispiel: `„${name(sicht.vorgang?.[anders.objektId]?.werte.firma)}“ bei „${String(sicht.vorgang?.[anders.objektId]?.werte.name ?? '')}“` });
  };
  const excel = () => {
    const vergabe = modell('projekt_kontakt').felder.find((f) => f.name === 'vergabe')!.optionen!;
    const z = [['Gewerk', 'Leistungsbereich nach VOB/C', 'Firma', 'Ansprechpartner:in', 'Telefon', 'E-Mail', 'Vergabe', 'Leistungen', 'Beginn', 'Ende', 'Notiz'],
      ...zeilen().map((r) => { const b = eintrag(r.gewerk), k = kontakt(b?.werte.kontakt)?.werte;
        return [r.gewerk, r.vob ? String(sicht.gewerk?.[r.vob]?.werte.name ?? '') : '', String(k?.name ?? ''), String(k?.ansprechpartner ?? ''), String(k?.telefon || k?.mobil || ''), String(k?.email ?? ''),
          vergabe.find((o) => o.wert === b?.werte.vergabe)?.titel ?? '', r.leistungen.length || null, r.anfang == null ? null : new Date(isoAus(r.anfang)), r.ende == null ? null : new Date(isoAus(r.ende)), String(b?.werte.notiz ?? '')]; })];
    herunterladen(new Blob([xlsxSchreiben(z, 'Gewerke und Firmen')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Gewerke und Firmen ${String(sicht.projekt?.[projekt() ?? '']?.werte.name ?? '')}.xlsx`);
  };
  // ---------- Gewerk ergänzen (ohne Leistung im Plan, z. B. Statiker:in): ein Eintrag der Beteiligten ----------
  const [neuGewerk, setNeuGewerk] = createSignal<{ gewerk: string; firma: string | null } | null>(null);
  const gewerkAnlegen = () => {
    const n = neuGewerk()!, g = n.gewerk.trim();
    if (!g || !n.firma) return;
    setNeuGewerk(null);
    firmaSetzen(g, n.firma);
  };

  // ---------- Gewerke erkennen: Leistungen ohne Gewerk – Vorschlag aus dem Leistungskatalog, der Firma oder einem Gewerk im Namen ----------
  const [vorschlaege, setVorschlaege] = createSignal<{ id: string; name: string; gewerk: string; an: boolean }[] | null>(null);
  const erkennen = () => {
    const katalog = new Map(lebende('leistungsvorlage').filter((l) => l.werte.gewerk).map((l) => [String(l.werte.name ?? '').trim().toLowerCase(), String(l.werte.gewerk)]));
    const bekannt = zeilen().map((r) => r.gewerk);
    const ohne = (plan()?.zeilen ?? []).filter((z) => !z.termin.gruppe && z.dauer > 0 && !String(sicht.vorgang?.[z.id]?.werte.gewerk ?? '').trim());
    const l = ohne.flatMap((z) => {
      const w = sicht.vorgang?.[z.id]?.werte ?? {}, n = z.name.trim().toLowerCase();
      const imNamen = bekannt.filter((g) => n.includes(g.toLowerCase()));
      const g = katalog.get(n) || String(kontakt(w.firma)?.werte.gewerk ?? '').trim() || (imNamen.length === 1 ? imNamen[0]! : '');
      return g ? [{ id: z.id, name: z.name, gewerk: g, an: true }] : [];
    });
    if (!l.length) { hinweis(ohne.length ? `Keine eindeutige Zuordnung gefunden – ${ohne.length} ${ohne.length === 1 ? 'Leistung' : 'Leistungen'} bitte von Hand eintragen.` : 'Alle Leistungen haben schon ein Gewerk.'); return; }
    setVorschlaege(l);
  };
  const erkanntUebernehmen = () => {
    const l = vorschlaege()!.filter((x) => x.an);
    setVorschlaege(null);
    if (l.length) ausfuehrenMehrere(l.map((x): Vorlage => ({ objekt: 'vorgang', art: 'aendern', objektId: x.id, werte: { gewerk: x.gewerk } })), `Gewerke erkannt (${l.length})`);
  };

  // ---------- Gewerke & Farben: Farbe je Gewerk (am Kalender der Version) und umbenennen (in Leistungen und Beteiligten) ----------
  const [farbwahl, setFarbwahl] = createSignal<{ gewerk: string; name: string; farbe: string }[] | null>(null);
  const farbenOeffnen = () => setFarbwahl(zeilen().filter((r) => r.leistungen.length).map((r) => ({ gewerk: r.gewerk, name: r.gewerk, farbe: farbe(r.gewerk) })));
  const farbenUebernehmen = () => {
    const l = farbwahl()!, befehle: Vorlage[] = [], neu: Record<string, string> = {};
    for (const x of l) {
      const name = x.name.trim() || x.gewerk;
      if (x.farbe !== gewerkFarbe(name)) neu[name] = x.farbe;   // nur was von der festen Farbe abweicht
      if (name !== x.gewerk) {
        for (const v of leistungen().filter((v) => String(v.werte.gewerk ?? '').trim() === x.gewerk)) befehle.push({ objekt: 'vorgang', art: 'aendern', objektId: v.id, werte: { gewerk: name } });
        const b = eintrag(x.gewerk); if (b) befehle.push({ objekt: 'projekt_kontakt', art: 'aendern', objektId: b.id, werte: { aufgabe: name } });
      }
    }
    const text = JSON.stringify(neu);
    if (kalender() && text !== String(kalender()!.werte.gewerkfarben || '{}')) befehle.push({ objekt: 'zeitplan', art: 'aendern', objektId: kalender()!.id, werte: { gewerkfarben: text } });
    setFarbwahl(null);
    if (befehle.length) ausfuehrenMehrere(befehle, 'Gewerke & Farben');
  };

  p.setNeu(() => setNeuGewerk({ gewerk: '', firma: null }));   // „＋ Gewerk“ im Menüband (Stellschraube neuTitel)
  p.setKnoepfe([
    ...(schreiben() ? [{ titel: 'Firmen in den Plan', zeichen: 'personen', gruppe: 'Plan', tun: firmenInDenPlan }] : []),
    ...(darf('vorgang', 'schreiben') && version() ? [{ titel: 'Farben', zeichen: 'farben', gruppe: 'Gewerke', tun: farbenOeffnen },
      { titel: 'Gewerke erkennen', zeichen: 'assistent', gruppe: 'Gewerke', tun: erkennen }] : []),
    { titel: 'Excel', zeichen: 'export', gruppe: 'Datei', rechts: true, tun: excel },
    // Firmenliste wie bisher: das Adressverzeichnis mit den Firmen der Gewerke (ein Ausdruck, keine eigene Liste)
    { titel: 'Drucken', zeichen: 'drucken', gruppe: 'Datei', rechts: true, tun: () => {
      const ids = [...new Set(zeilen().flatMap((r) => [firmaDesGewerks(projektId() ?? '', r.gewerk)?.id, ...r.firmen].filter((x): x is string => !!x && !!sicht.kontakt?.[x])))];
      if (!ids.length) { hinweis('Noch keine Firmen bei den Gewerken.'); return; }
      verzeichnisDrucken('adressen.verzeichnis', [{ titel: 'Die Firmen des Plans', ids, filter: `Firmen im Bauzeitenplan · ${String(sicht.projekt?.[projektId() ?? '']?.werte.name ?? '')}` }]);
    } },
  ]);

  // Zeitachse: Projektzeitraum mit Monatsraster, Einsatz in der Gewerkfarbe
  const achse = createMemo(() => {
    const t = zeilen().flatMap((r) => r.einsatz.flat());
    if (!t.length) return null;
    const a = Math.min(...t), e = Math.max(...t), spanne = Math.max(1, e - a + 1);
    const monate: { tag: number; text: string }[] = [];
    const d0 = new Date(isoAus(a)); let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
    while (Math.round(d.getTime() / 864e5) <= e && monate.length < 60) { monate.push({ tag: Math.round(d.getTime() / 864e5), text: MONATE[d.getUTCMonth()]! }); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
    const jedes = monate.length <= 12 ? 1 : Math.ceil(monate.length / 10);
    return { pos: (n: number) => ((n - a) / spanne) * 100, breite: (von: number, bis: number) => Math.max(0.8, ((bis - von + 1) / spanne) * 100), monate: monate.map((m, i) => ({ ...m, zeigen: i % jedes === 0 })) };
  });
  const Zeitleiste = (q: { r?: Gewerkzeile; kopf?: boolean }) => (
    <div class="gf-zeit" classList={{ kopf: !!q.kopf }}>
      <For each={achse()?.monate ?? []}>{(m) => <><i style={{ left: `${achse()!.pos(m.tag)}%` }} />{q.kopf && m.zeigen ? <span style={{ left: `${achse()!.pos(m.tag)}%` }}>{m.text}</span> : null}</>}</For>
      <For each={q.r?.einsatz ?? []}>{([a, b]) => <b style={{ left: `${achse()!.pos(a)}%`, width: `${achse()!.breite(a, b)}%`, background: farbe(q.r!.gewerk) }} title={a === b ? datum(a) : `${datum(a)} – ${datum(b)}`} />}</For>
    </div>
  );
  const mitFirma = () => zeilen().filter((r) => eintrag(r.gewerk)).length;
  const beauftragt = () => zeilen().filter((r) => ['beauftragt', 'abgeschlossen'].includes(String(eintrag(r.gewerk)?.werte.vergabe ?? ''))).length;
  const abw = () => zeilen().reduce((s, r) => s + abweichend(r), 0);
  const VERGABE = modell('projekt_kontakt').felder.find((f) => f.name === 'vergabe')!.optionen!;
  const klapp = (g: string) => { const s = new Set(offen()); if (s.has(g)) s.delete(g); else s.add(g); setOffen(s); };

  return (
    <div class="preisspiegel-flaeche gewerke-firmen">
      <Show when={version()} fallback={<p class="still-text">Noch kein Bauzeitenplan in diesem Projekt – Gewerke kommen aus der Spalte „Gewerk“ der Leistungen.</p>}>
        <div class="ps-kopf">
          <div><h2>Gewerke & Firmen</h2>
            <span class="still-text klein-text">{String(version()!.werte.name ?? '')} · {zeilen().length} Gewerke · {mitFirma()} mit Firma{abw() ? ` · ${abw()} ${abw() === 1 ? 'Leistung weicht' : 'Leistungen weichen'} ab` : ''} · {beauftragt()} beauftragt</span></div>
        </div>
        <Show when={zeilen().length} fallback={<p class="still-text">Noch keine Gewerke im Plan – in der Spalte „Gewerk“ der Leistungen eintragen.</p>}>
          <div class="ps-rollen">
            <table class="preisspiegel gf-tabelle">
              <thead><tr><th>Gewerk · Leistungsbereich (VOB/C)</th><th>Firma im Projekt</th><th>Kontakt</th><th>Vergabe</th><th class="gf-einsatz">Einsatz im Plan<Show when={achse()}><Zeitleiste kopf /></Show></th><th>Notiz</th></tr></thead>
              <tbody>
                <For each={zeilen()}>{(r) => {
                  const b = () => eintrag(r.gewerk), k = () => kontakt(b()?.werte.kontakt)?.werte;
                  return (<>
                    <tr classList={{ gewaehlt: !!b() && p.gewaehlt() === b()!.id, [`gf-${String(b()?.werte.vergabe ?? '')}`]: !!b() }} onClick={() => { if (b()) p.onWahl(b()!.id); }}>
                      <td class="gf-gewerk">
                        <Show when={r.leistungen.length} fallback={<span class="gf-auf" />}>
                          <button type="button" class="gf-auf" aria-expanded={offen().has(r.gewerk)} aria-label={`Leistungen ${r.gewerk}`} onClick={(e) => { e.stopPropagation(); klapp(r.gewerk); }}>{offen().has(r.gewerk) ? '▾' : '▸'}</button>
                        </Show>
                        <span class="gf-punkt" style={{ background: farbe(r.gewerk) }} /><b>{r.gewerk}</b>
                        <small class="still-text">{[r.leistungen.length ? `${r.leistungen.length} ${r.leistungen.length === 1 ? 'Leistung' : 'Leistungen'}` : 'nicht im Plan', r.vob ? String(sicht.gewerk?.[r.vob]?.werte.name ?? '') : ''].filter(Boolean).join(' · ')}</small>
                      </td>
                      <td class="gf-firma" onClick={(e) => e.stopPropagation()}>
                        <Show when={schreiben()} fallback={name(b()?.werte.kontakt)}>
                          <Auswahlliste titel={`Firma ${r.gewerk}`} platzhalter="Firma wählen …" wert={b() ? String(b()!.werte.kontakt) : null} optionen={firmenFuer(r.gewerk)}
                            onWert={(w) => firmaSetzen(r.gewerk, w)} neu={{ titel: 'als neue Firma anlegen', tun: (t) => neueFirma(r.gewerk, t) }} />
                        </Show>
                        <Show when={!b() && r.firmen.length}><small class="still-text">im Plan: {r.firmen.map(name).join(', ')}</small></Show>
                      </td>
                      <td class="gf-kontakt"><Show when={k()}>
                        <Show when={k()!.ansprechpartner}><span>{String(k()!.ansprechpartner)}</span></Show>
                        <Show when={k()!.telefon || k()!.mobil}><a href={`tel:${String(k()!.telefon || k()!.mobil).replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()}>☎ {String(k()!.telefon || k()!.mobil)}</a></Show>
                        <Show when={k()!.email}><a href={`mailto:${String(k()!.email)}`} onClick={(e) => e.stopPropagation()}>✉ {String(k()!.email)}</a></Show>
                      </Show></td>
                      <td onClick={(e) => e.stopPropagation()}><Show when={b()} fallback={<span class="still-text">–</span>}>
                        <Show when={schreiben()} fallback={VERGABE.find((o) => o.wert === b()!.werte.vergabe)?.titel}>
                          <Auswahlliste titel={`Vergabe ${r.gewerk}`} wert={String(b()!.werte.vergabe ?? '')} optionen={VERGABE} onWert={(w) => aendern(b()!, { vergabe: w }, `Vergabe ${r.gewerk}`)} />
                        </Show></Show></td>
                      <td class="gf-einsatz"><div class="gf-datum">{r.anfang == null ? '–' : r.anfang === r.ende ? datum(r.anfang) : `${datum(r.anfang)} – ${datum(r.ende!)}`}</div><Show when={achse() && r.einsatz.length}><Zeitleiste r={r} /></Show></td>
                      <td onClick={(e) => e.stopPropagation()}><Show when={b()}>
                        <input class="gf-notiz" aria-label={`Notiz ${r.gewerk}`} value={String(b()!.werte.notiz ?? '')} disabled={!schreiben()} onChange={(e) => aendern(b()!, { notiz: e.currentTarget.value.trim() || null }, `Notiz ${r.gewerk}`)} />
                      </Show></td>
                    </tr>
                    <Show when={offen().has(r.gewerk)}>
                      <For each={r.leistungen}>{(l) => {
                        const f = () => sicht.vorgang?.[l.id]?.werte.firma as string | null | undefined;
                        const weicht = () => !!f() && !!b() && f() !== b()!.werte.kontakt;
                        return (
                          <tr class="gf-leistung">
                            <td>{l.name}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <Show when={darf('vorgang', 'schreiben')} fallback={name(f())}>
                                <Auswahlliste titel={`Firma bei ${l.name}`} platzhalter={b() ? `${name(b()!.werte.kontakt)} (wie Gewerk)` : 'Firma wählen …'} wert={f() ?? null} optionen={firmenFuer(r.gewerk)} onWert={(w) => leistungFirma(l.id, w)} />
                              </Show>
                            </td>
                            <td colSpan={3}><Show when={weicht()}><span class="gf-abw">weicht ab</span>
                              <button type="button" class="knopf klein" title={`Wieder die Firma des Gewerks (${name(b()!.werte.kontakt)})`} onClick={() => leistungFirma(l.id, String(b()!.werte.kontakt))}>↺ wie Gewerk</button></Show></td>
                          </tr>
                        );
                      }}</For>
                    </Show>
                  </>);
                }}</For>
              </tbody>
            </table>
          </div>
          <p class="still-text klein-text">Firma wählen oder neu eintragen – sie wird bei den Leistungen des Gewerks eingetragen, wo noch keine oder die bisherige steht. Kontaktdaten stehen in den Adressen und gelten für alle Projekte.</p>
        </Show>
      </Show>
      <Show when={neuGewerk()}>{(n) => (
        <Dialog titel="Gewerk ergänzen" onAbbrechen={() => setNeuGewerk(null)} geaendert={() => !!n().gewerk || !!n().firma}
          knoepfe={<><button class="knopf" data-abbrechen onClick={() => setNeuGewerk(null)}>Abbrechen</button><button class="knopf haupt" disabled={!n().gewerk.trim() || !n().firma} onClick={gewerkAnlegen}>OK</button></>}>
          <p class="still-text">Ein Gewerk ohne Leistung im Plan – z. B. Statiker:in, Vermessung.</p>
          <div class="formular">
            <div class="feld"><label for="gf-neu-gewerk">Gewerk</label><input id="gf-neu-gewerk" value={n().gewerk} autocomplete="off" onInput={(e) => setNeuGewerk({ ...n(), gewerk: e.currentTarget.value })} /></div>
            <div class="feld"><label>Firma</label><Auswahlliste titel="Firma" platzhalter="Firma wählen …" wert={n().firma} optionen={firmenFuer(n().gewerk)} onWert={(w) => setNeuGewerk({ ...n(), firma: w })}
              neu={{ titel: 'als neue Firma anlegen', tun: (t) => { const id = neueKennung(); ausfuehren({ objekt: 'kontakt', art: 'anlegen', objektId: id, werte: { name: t, art: 'firma', gewerk: n().gewerk.trim() } }, `Firma „${t}“ anlegen`); setNeuGewerk({ ...n(), firma: id }); } }} /></div>
          </div>
        </Dialog>
      )}</Show>
      <Show when={vorschlaege()}>{(l) => (
        <Dialog titel="Gewerke erkennen" onAbbrechen={() => setVorschlaege(null)}
          knoepfe={<><button class="knopf" data-abbrechen onClick={() => setVorschlaege(null)}>Abbrechen</button><button class="knopf haupt" disabled={!l().some((x) => x.an)} onClick={erkanntUebernehmen}>Übernehmen ({l().filter((x) => x.an).length})</button></>}>
          <p class="still-text">Für {l().length} {l().length === 1 ? 'Leistung' : 'Leistungen'} ohne Gewerk gibt es eine eindeutige Zuordnung (Leistungskatalog, Firma oder ein Gewerk im Namen). Bereits eingetragene Gewerke bleiben.</p>
          <div class="gf-vorschlaege">
            <For each={l()}>{(x, i) => (
              <label class="gf-vorschlag"><input type="checkbox" checked={x.an} onChange={(e) => setVorschlaege(l().map((y, k) => (k === i() ? { ...y, an: e.currentTarget.checked } : y)))} />
                <span>{x.name}</span><span class="gf-punkt" style={{ background: farbe(x.gewerk) }} /><b>{x.gewerk}</b></label>
            )}</For>
          </div>
        </Dialog>
      )}</Show>
      <Show when={farbwahl()}>{(l) => (
        <Dialog titel="Gewerke & Farben" breit onAbbrechen={() => setFarbwahl(null)} geaendert={() => l().some((x) => x.name !== x.gewerk || x.farbe !== farbe(x.gewerk))}
          knoepfe={<><button class="knopf" data-abbrechen onClick={() => setFarbwahl(null)}>Abbrechen</button><button class="knopf haupt" onClick={farbenUebernehmen}>OK</button></>}>
          <Show when={l().length} fallback={<p class="still-text">Noch keine Gewerke im Plan – Spalte „Gewerk“ ausfüllen oder „Gewerke erkennen“ verwenden.</p>}>
            <div class="gf-farben">
              <For each={l()}>{(x, i) => (
                <div class="gf-farbzeile">
                  <input aria-label={`Name des Gewerks ${x.gewerk}`} value={x.name} onInput={(e) => setFarbwahl(l().map((y, k) => (k === i() ? { ...y, name: e.currentTarget.value } : y)))} />
                  <div class="gf-palette" role="radiogroup" aria-label={`Farbe ${x.gewerk}`}>
                    <For each={GEWERKFARBEN}>{(c) => <button type="button" role="radio" aria-checked={x.farbe === c} classList={{ aktiv: x.farbe === c }} style={{ background: c }} title={c}
                      onClick={() => setFarbwahl(l().map((y, k) => (k === i() ? { ...y, farbe: c } : y)))} />}</For>
                  </div>
                  <small class="still-text">{zeilen().find((r) => r.gewerk === x.gewerk)?.leistungen.length ?? 0} Leistungen</small>
                </div>
              )}</For>
            </div>
            <p class="still-text klein-text">Die Farbe gilt für alle Leistungen des Gewerks – im Balkenplan, hier und beim Drucken. Umbenennen ändert das Gewerk bei allen seinen Leistungen.</p>
          </Show>
        </Dialog>
      )}</Show>
      <Show when={frage()}>{(f) => (
        <Dialog titel="Firmen in den Plan" onAbbrechen={() => setFrage(null)}
          knoepfe={<><button class="knopf" onClick={() => setFrage(null)}>Abbrechen</button>
            <button class="knopf" disabled={!f().leer.length} onClick={() => { ausfuehrenMehrere(f().leer, 'Firmen in den Plan (nur leere)'); setFrage(null); }}>Nur leere ausfüllen ({f().leer.length})</button>
            <button class="knopf haupt" onClick={() => { ausfuehrenMehrere(f().alle, 'Firmen in den Plan (überall)'); setFrage(null); }}>Überall eintragen ({f().alle.length})</button></>}>
          <p>Bei {f().alle.length - f().leer.length} {f().alle.length - f().leer.length === 1 ? 'Leistung steht' : 'Leistungen steht'} schon eine andere Firma, z. B. {f().beispiel}. Auch dort die Firma des Gewerks eintragen?</p>
        </Dialog>
      )}</Show>
    </div>
  );
}
