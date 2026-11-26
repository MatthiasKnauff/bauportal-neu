// GAEB DA XML (3.x) lesen und schreiben – Austausch von Leistungsverzeichnissen mit Firmen und anderen AVA-Programmen,
// wie im bisherigen Bauportal: X83 Angebotsaufforderung (LV ohne Preise), X84 Angebot (mit Preisen der Bieter:in), X86 Auftrag.
// Unterstützt der übliche Umfang: Titel in beliebiger Tiefe, Positionen mit Kurz- und Langtext, Menge, Einheit, Einheitspreis,
// Bedarfs-, Wahl- und Pauschalpositionen, Hinweistexte. Ältere Formate (GAEB 90/2000) bitte im anderen Programm als DA XML ausgeben.
import { alleText, kind, kinder, xmlLesen, xmlText, type XmlKnoten } from '../../kern/xml';
import { gaebFeld, gaebText, gaebZusammen } from '../../kern/textergaenzung';

export interface GaebPosten {
  kennung: string;                 // ID aus der Datei oder die OZ – bleibt beim nächsten Einlesen derselbe Eintrag
  oz: string; art: 'titel' | 'normal' | 'bedarf' | 'alternativ' | 'pauschal' | 'hinweis';
  kurztext: string; langtext: string; menge: number | null; einheit: string; ep: number | null;
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
  const geh = (body: XmlKnoten | undefined, vorne: string) => {
    for (const k of body?.kinder ?? []) {
      if (k.name === 'BoQCtgy') {
        const oz = vorne + (k.attr.RNoPart ?? '').trim();
        posten.push({ kennung: k.attr.ID || `oz:${oz}`, oz, art: 'titel', kurztext: alleText(kind(k, 'LblTx')) || 'Titel', langtext: '', menge: null, einheit: '', ep: null });
        geh(kind(k, 'BoQBody'), `${oz}.`);
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
            posten.push({ kennung: it.attr.ID || `oz:${oz}`, oz, art, kurztext: kurz || 'Position', langtext: lang !== kurz ? lang : '', menge, einheit: alleText(kind(it, 'QU')), ep: zahl(alleText(kind(it, 'UP'))) });
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
  // Gliederung aus den OZ: Titel enthalten, was mit ihrer OZ + „.“ beginnt
  const titel = posten.filter((x) => x.art === 'titel');
  const unter = (oz: string) => posten.filter((x) => (oz ? x.oz.startsWith(`${oz}.`) : true) && x.oz.slice(oz ? oz.length + 1 : 0).split('.').length === 1 && x.oz !== oz);
  const teil = (oz: string, vorne: string) => (vorne ? oz.slice(vorne.length + 1) : oz);
  let n = 0;
  const id = () => `ID_${++n}`;
  const item = (x: Omit<GaebPosten, 'kennung'>, vorne: string) => {
    if (x.art === 'hinweis') return `<Remark ID="${id()}"><Description><CompleteText><DetailTxt><Text>${p(x.langtext || x.kurztext)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${p(x.kurztext)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Remark>`;
    const ep = dp === '83' ? null : preis?.(x.oz) ?? null;
    return `<Item ID="${id()}" RNoPart="${xmlText(teil(x.oz, vorne))}">${x.art === 'bedarf' ? '<Provis>WithoutTotal</Provis>' : ''}${x.art === 'pauschal' ? '<LumpSumItem>Yes</LumpSumItem>' : ''}${x.art === 'alternativ' ? '<ALNGroupNo>1</ALNGroupNo><ALNSerNo>1</ALNSerNo>' : ''}`
      + `<Qty>${x.menge ?? 0}</Qty><QU>${xmlText(gaebEinheit(x.einheit))}</QU>${ep != null ? `<UP>${ep.toFixed(2)}</UP>` : ''}`
      + `<Description><CompleteText><DetailTxt><Text>${x.langtext ? gaebText(x.langtext) : p(x.kurztext)}</Text></DetailTxt><OutlineText><OutlTxt><TextOutlTxt>${p(x.kurztext)}</TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description></Item>`;
  };
  const body = (vorne: string): string => {
    const hier = vorne ? unter(vorne) : posten.filter((x) => (x.oz && !x.oz.includes('.')) || (!x.oz && !titel.length));
    const ctg = hier.filter((x) => x.art === 'titel').map((t) => `<BoQCtgy ID="${id()}" RNoPart="${xmlText(teil(t.oz, vorne))}"><LblTx>${p(t.kurztext)}</LblTx><BoQBody>${body(t.oz)}</BoQBody></BoQCtgy>`).join('');
    const items = hier.filter((x) => x.art !== 'titel');
    return ctg + (items.length ? `<Itemlist>${items.map((x) => item(x, vorne)).join('')}</Itemlist>` : '');
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA${dp}/3.2"><GAEBInfo><Version>3.2</Version><ProgSystem>Bauportal</ProgSystem><Date>${new Date().toISOString().slice(0, 10)}</Date></GAEBInfo>`
    + `<PrjInfo><NamePrj>${xmlText(lv.projekt)}</NamePrj></PrjInfo><Award><DP>${dp}</DP><BoQ ID="${id()}"><BoQInfo><Name>${xmlText(lv.nummer)}</Name><LblBoQ>${xmlText(lv.name)}</LblBoQ></BoQInfo><BoQBody>${body('')}</BoQBody></BoQ></Award></GAEB>\n`;
}
