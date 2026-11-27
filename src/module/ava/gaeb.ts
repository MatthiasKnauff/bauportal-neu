// GAEB DA XML (3.x) lesen und schreiben – Austausch von Leistungsverzeichnissen mit Firmen und anderen AVA-Programmen,
// wie im bisherigen Bauportal: X83 Angebotsaufforderung (LV ohne Preise), X84 Angebot (mit Preisen der Bieter:in), X86 Auftrag.
// Unterstützt der übliche Umfang: Titel in beliebiger Tiefe, Positionen mit Kurz- und Langtext, Menge, Einheit, Einheitspreis,
// Bedarfs-, Wahl- und Pauschalpositionen, Hinweistexte. Ältere Formate (GAEB 90/2000) bitte im anderen Programm als DA XML ausgeben.
import { alleText, kind, xmlLesen, xmlText, type XmlKnoten } from '../../kern/xml';
import { gaebFeld, gaebText, gaebZusammen } from '../../kern/textergaenzung';
import { istHinweis, istZuschlag, zuschlagAuf } from '../../kern/lvarten';
import type { Werte } from '../../kern/modell';
import { nachOz } from '../../kern/oz';

export interface GaebPosten {
  kennung: string;                 // ID aus der Datei oder die OZ – bleibt beim nächsten Einlesen derselbe Eintrag
  oz: string; art: 'titel' | 'normal' | 'bedarf' | 'alternativ' | 'pauschal' | 'hinweis' | 'vorbemerkung' | 'zuschlag';
  kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null;
  angaben?: string;                // Antworten der Bieter:in auf die Textergänzungen (X84), „Frage: Antwort; …“
  zuschlagAuf?: string[];          // Zuschlagsposition (MarkupItem): Kennungen der Positionen, auf die der Satz (ep, %) gerechnet wird
}
export interface GaebLv { dp: string; projekt: string; name: string; bieter: string; posten: GaebPosten[] }

const zahl = (s: string) => { const t = s.trim().replace(',', '.'); return t && !Number.isNaN(Number(t)) ? Number(t) : null; };
/** Text eines GAEB-Textelements: je Absatz (<p>) eine Zeile. */
function text(k: XmlKnoten | undefined): string {
  if (!k) return '';
  const absaetze: string[] = [];
  // Textergänzungen (TextComplement) werden Felder im Langtext – [[Bieter: …]] bzw. [[Büro: … = …]]
  // (Leerzeichen am Rand eines <span> gehören zum Text – daher hier roh, nicht alleText)
  const roh = (x: XmlKnoten): string => x.text + x.kinder.map(roh).join('');
  const absatz = (x: XmlKnoten): string => (x.text + x.kinder.map((c) => (c.name === 'TextComplement'
    ? gaebFeld(c.attr.Kind ?? '', alleText(kind(c, 'ComplCaption')), alleText(kind(c, 'ComplBody'))).marke : roh(c))).join('')).replace(/[ \t\r\n]+/g, ' ').trim();
  const geh = (x: XmlKnoten) => { if (x.name === 'p') absaetze.push(absatz(x).replace(/\u00a0/g, ' ')); else x.kinder.forEach(geh); };
  geh(k);
  return gaebZusammen(absaetze.length ? absaetze.join('\n').replace(/\n+$/, '').trim() : alleText(k));
}

/** Bieterangaben (wie bisher im Preisspiegel): die Antworten in den Bieter-Ergänzungen eines Textes – „Angeboten“ gehört zur Frage davor. */
function bieterangaben(k: XmlKnoten | undefined): string {
  const aus: string[] = []; let frage = '';
  const geh = (x: XmlKnoten) => {
    if (x.name !== 'TextComplement') { x.kinder.forEach(geh); return; }
    const f = alleText(kind(x, 'ComplCaption')).trim().replace(/:$/, '').trim(), a = alleText(kind(x, 'ComplBody')).trim();
    if ((x.attr.Kind ?? '').toLowerCase() !== 'bidder') { frage = f; return; }
    if (a) aus.push(`${f.toLowerCase() === 'angeboten' ? frage || 'Angeboten' : f}: ${a}`);
  };
  if (k) geh(k);
  return aus.join('; ');
}

export function gaebLesen(quelle: string): GaebLv {
  let w: XmlKnoten;
  try { w = xmlLesen(quelle); } catch (e) { throw new Error(`Keine gültige GAEB-XML-Datei (${(e as Error).message}). Bitte im anderen Programm als GAEB DA XML (X83/X84/X86) ausgeben.`); }
  if (w.name !== 'GAEB') throw new Error('Keine GAEB-DA-XML-Datei (das Element „GAEB“ fehlt).');
  const award = kind(w, 'Award');
  const dp = alleText(kind(award, 'DP')) || (/DA(8\d)/.exec(JSON.stringify(w.attr))?.[1] ?? '');
  const prj = kind(w, 'PrjInfo');
  const projekt = [alleText(kind(prj, 'LblPrj')), alleText(kind(prj, 'NamePrj'))].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(' ');
  const boq = kind(award, 'BoQ');
  if (!boq) throw new Error('In der Datei steht kein Leistungsverzeichnis (BoQ).');
  const name = alleText(kind(boq, 'BoQInfo', 'LblBoQ')) || alleText(kind(boq, 'BoQInfo', 'Name'));
  const adr = kind(award, 'CTR', 'Address') ?? kind(award, 'Contractor', 'Address');
  const bieter = [alleText(kind(adr, 'Name1')), alleText(kind(adr, 'Name2'))].filter(Boolean).join(' ');
  const posten: GaebPosten[] = [];
  let hinweise = 0;
  // Zuschläge (MarkupItem): aufgezählte Positionen (ListInSubQty), alle im Gliederungspunkt (AllInCtgy) oder die gekennzeichneten (IdentAsMark)
  const markiert: string[] = [], imTitel = new Map<string, string[]>(), offen: { p: GaebPosten; typ: string; titel: string }[] = [];
  const geh = (body: XmlKnoten | undefined, vorne: string, titel = '') => {
    for (const k of body?.kinder ?? []) {
      if (k.name === 'BoQCtgy') {
        const oz = vorne + (k.attr.RNoPart ?? '').trim();
        posten.push({ kennung: k.attr.ID || `oz:${oz}`, oz, art: 'titel', kurztext: alleText(kind(k, 'LblTx')) || 'Titel', langtext: '', menge: null, einheit: '', ep: null });
        geh(kind(k, 'BoQBody'), `${oz}.`, k.attr.ID || `oz:${oz}`);
      } else if (k.name === 'Itemlist') {
        for (const it of k.kinder) {
          if (it.name === 'Item') {
            const oz = vorne + (it.attr.RNoPart ?? '').trim();
            const d = kind(it, 'Description'), ct = kind(d, 'CompleteText');
            const lang = text(kind(ct, 'DetailTxt')) || text(kind(d, 'DetailTxt'));
            const kurz = text(kind(ct, 'OutlineText')) || text(kind(d, 'OutlineText')) || lang.split('\n')[0]!.slice(0, 200);
            let art: GaebPosten['art'] = 'normal';
            if (alleText(kind(it, 'Provis'))) art = 'bedarf';
            if (kind(it, 'ALNGroupNo') || kind(it, 'ALNSerNo')) art = 'alternativ';
            if (/^(yes|true|1)$/i.test(alleText(kind(it, 'LumpSumItem')))) art = 'pauschal';
            const menge = zahl(alleText(kind(it, 'Qty')) || alleText(kind(it, 'QtySplit', 'Qty')));
            const kennung = it.attr.ID || `oz:${oz}`;
            posten.push({ kennung, oz, art, kurztext: kurz || 'Position', langtext: lang !== kurz ? lang : '', menge, einheit: alleText(kind(it, 'QU')), ep: zahl(alleText(kind(it, 'UP'))), angaben: bieterangaben(d) });
            imTitel.set(titel, [...(imTitel.get(titel) ?? []), kennung]);
            if (/^(yes|true|1)$/i.test(alleText(kind(it, 'MarkupIt')))) markiert.push(kennung);
          } else if (it.name === 'MarkupItem') {
            const oz = vorne + (it.attr.RNoPart ?? '').trim(), d = kind(it, 'Description');
            const lang = text(kind(d, 'CompleteText', 'DetailTxt')) || text(kind(d, 'DetailTxt'));
            const kurz = text(kind(d, 'CompleteText', 'OutlineText')) || text(kind(d, 'OutlineText')) || 'Zuschlag';
            const p: GaebPosten = { kennung: it.attr.ID || `oz:${oz}`, oz, art: 'zuschlag', kurztext: kurz, langtext: lang !== kurz ? lang : '', menge: null, einheit: '%', ep: zahl(alleText(kind(it, 'Markup'))),
              zuschlagAuf: it.kinder.filter((x) => x.name === 'MarkupSubQty').flatMap((q) => q.kinder.filter((r) => r.name === 'RefItem').map((r) => r.attr.IDRef ?? '')).filter(Boolean) };
            posten.push(p); offen.push({ p, typ: alleText(kind(it, 'MarkupType')) || 'IdentAsMark', titel });
          } else if (it.name === 'Remark') {
            const lang = text(kind(it, 'Description', 'CompleteText', 'DetailTxt')) || text(kind(it, 'Description'));
            const kurz = text(kind(it, 'Description', 'CompleteText', 'OutlineText')) || lang.split('\n')[0]!.slice(0, 120) || 'Hinweis';
            hinweise++;
            posten.push({ kennung: it.attr.ID || `hinweis:${vorne}${hinweise}`, oz: '', art: 'hinweis', kurztext: kurz, langtext: lang !== kurz ? lang : '', menge: null, einheit: '', ep: null });
          }
        }
      }
    }
  };
  geh(kind(boq, 'BoQBody'), '');
  for (const o of offen) if (o.typ === 'AllInCtgy') o.p.zuschlagAuf = imTitel.get(o.titel) ?? []; else if (o.typ !== 'ListInSubQty') o.p.zuschlagAuf = markiert;
  if (!posten.length) throw new Error('Das Leistungsverzeichnis in der Datei ist leer.');
  return { dp, projekt, name, bieter, posten };
}

// ---------- schreiben ----------
/** GAEB-Mengeneinheiten (höchstens 4 Zeichen). */
const EINHEIT: Record<string, string> = { 'm²': 'm2', qm: 'm2', 'm³': 'm3', cbm: 'm3', lfm: 'm', st: 'St', stk: 'St', stück: 'St', psch: 'psch', pauschal: 'psch', std: 'h', h: 'h', tag: 'd', t: 't', kg: 'kg' };
const gaebEinheit = (e: string) => (EINHEIT[e.trim().toLowerCase()] ?? e.trim()).slice(0, 4);
const p = (t: string) => t.split('\n').map((z) => `<p><span>${xmlText(z)}</span></p>`).join('');

/** Ein LV als GAEB DA XML: dp „83“ (Angebotsaufforderung, ohne Preise) oder „84“/„86“ mit Einheitspreisen (preis je Position). */
export function gaebSchreiben(lv: { projekt: string; name: string; nummer: string }, posten: Omit<GaebPosten, 'kennung'>[], dp: '83' | '84' | '86', preis?: (oz: string) => number | null): string {
  // Gliederung aus den OZ: jede Zeile gehört zum längsten Titel, mit dessen OZ + „.“ sie beginnt – ohne passenden Titel zur obersten Ebene
  const titel = posten.filter((x) => x.art === 'titel');
  const oben = (x: Omit<GaebPosten, 'kennung'>) => titel.filter((t) => t !== x && t.oz && x.oz.startsWith(`${t.oz}.`)).reduce((a, t) => (t.oz.length > a.length ? t.oz : a), '');
  const unter = (oz: string) => posten.filter((x) => oben(x) === oz);
  const teil = (oz: string, vorne: string) => (vorne ? oz.slice(vorne.length + 1) : oz);
  let n = 0;
  const id = () => `ID_${++n}`;
  // Positionen bekommen feste IDs nach ihrer OZ – darauf verweisen Zuschläge (zuschlagAuf: OZ der Positionen)
  const pid = new Map(posten.filter((x) => x.art !== 'titel' && x.oz).map((x, i) => [x.oz, `P_${i + 1}`]));
  const item = (x: Omit<GaebPosten, 'kennung'>, vorne: string) => {
    if (x.art === 'zuschlag') {
      const satz = dp === '83' ? null : preis?.(x.oz) ?? null;
      return `<MarkupItem ID="${pid.get(x.oz) ?? id()}" RNoPart="${xmlText(teil(x.oz, vorne))}"><MarkupType>ListInSubQty</MarkupType>`
        + (x.zuschlagAuf ?? []).filter((oz) => pid.has(oz)).map((oz) => `<MarkupSubQty><RefItem IDRef="${pid.get(oz)}"/></MarkupSubQty>`).join('')
        + `${satz != null ? `<Markup>${satz.toFixed(3)}</Markup>` : ''}<Description><CompleteText>${x.langtext ? `<DetailTxt><Text>${gaebText(x.langtext)}</Text></DetailTxt>` : ''}<OutlineText><OutlTxt><TextOutlTxt>${p(x.kurztext)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></MarkupItem>`;
    }
    if (istHinweis(x.art)) return `<Remark ID="${id()}"><Description><CompleteText><DetailTxt><Text>${p(x.langtext || x.kurztext)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${p(x.kurztext)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Remark>`;
    const ep = dp === '83' ? null : preis?.(x.oz) ?? null;
    return `<Item ID="${pid.get(x.oz) ?? id()}" RNoPart="${xmlText(teil(x.oz, vorne))}">${x.art === 'bedarf' ? '<Provis>WithoutTotal</Provis>' : ''}${x.art === 'pauschal' ? '<LumpSumItem>Yes</LumpSumItem>' : ''}${x.art === 'alternativ' ? '<ALNGroupNo>1</ALNGroupNo><ALNSerNo>1</ALNSerNo>' : ''}`
      + `<Qty>${x.menge ?? 0}</Qty><QU>${xmlText(gaebEinheit(x.einheit))}</QU>${ep != null ? `<UP>${ep.toFixed(2)}</UP>` : ''}`
      + `<Description><CompleteText><DetailTxt><Text>${x.langtext ? gaebText(x.langtext) : p(x.kurztext)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${p(x.kurztext)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item>`;
  };
  const body = (vorne: string): string => {
    const hier = unter(vorne);
    const ctg = hier.filter((x) => x.art === 'titel').map((t) => `<BoQCtgy ID="${id()}" RNoPart="${xmlText(teil(t.oz, vorne))}"><LblTx>${p(t.kurztext)}</LblTx><BoQBody>${body(t.oz)}</BoQBody></BoQCtgy>`).join('');
    const items = hier.filter((x) => x.art !== 'titel');
    return ctg + (items.length ? `<Itemlist>${items.map((x) => item(x, vorne)).join('')}</Itemlist>` : '');
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA${dp}/3.2"><GAEBInfo><Version>3.2</Version><ProgSystem>Bauportal</ProgSystem><Date>${new Date().toISOString().slice(0, 10)}</Date></GAEBInfo>`
    + `<PrjInfo><NamePrj>${xmlText(lv.projekt)}</NamePrj></PrjInfo><Award><DP>${dp}</DP><BoQ ID="${id()}"><BoQInfo><Name>${xmlText(lv.nummer)}</Name><LblBoQ>${xmlText(lv.name)}</LblBoQ></BoQInfo><BoQBody>${body('')}</BoQBody></BoQ></Award></GAEB>\n`;
}

/** Das LV als GAEB X83 für die Bieter:innen (ohne Preise, ohne Nachträge) – derselbe Weg für „Herunterladen“ und den Anhang beim Versand. */
export function lvAlsX83(lv: Werte, positionen: { id: string; werte: Werte }[], projekt: string): { xml: string; name: string } {
  const pos = nachOz(positionen.filter((x) => !x.werte.nachtrag));
  const oz = new Map(pos.map((x) => [x.id, String(x.werte.oz ?? '')]));
  const posten = pos.map((x): Omit<GaebPosten, 'kennung'> => ({ oz: String(x.werte.oz ?? ''), art: (x.werte.art || 'normal') as GaebPosten['art'], kurztext: String(x.werte.kurztext ?? ''),
    langtext: String(x.werte.langtext ?? ''), menge: x.werte.menge == null ? null : Number(x.werte.menge), einheit: String(x.werte.einheit ?? ''), ep: null,
    ...(istZuschlag(x.werte.art) ? { zuschlagAuf: zuschlagAuf(x.werte).map((id) => oz.get(id) ?? '').filter(Boolean) } : {}) }));
  return { xml: gaebSchreiben({ projekt, name: String(lv.name ?? ''), nummer: String(lv.nummer ?? '') }, posten, '83'),
    name: `${[lv.nummer, lv.name].filter(Boolean).join(' ') || 'LV'}.X83` };
}
