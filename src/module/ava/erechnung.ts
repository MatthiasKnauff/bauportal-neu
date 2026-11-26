// E-Rechnung lesen (XRechnung, ZUGFeRD/Factur-X): statt Texterkennung die Daten, die die Firma selbst mitschickt.
// Seit 2025 müssen Bauunternehmen E-Rechnungen empfangen können; viele Programme hängen das XML an das PDF an (ZUGFeRD/Factur-X)
// oder schicken es allein (XRechnung). Gelesen werden CII (CrossIndustryInvoice) und UBL (Invoice/CreditNote).
// Läuft im Browser und in den Tests gleich; die Datei geht nirgends hin.
import { kind, kinder, xmlLesen, type XmlKnoten } from '../../kern/xml';

/** UN/ECE Rec. 20 → Einheiten wie im LV */
const EINHEIT: Record<string, string> = { MTK: 'm²', MTQ: 'm³', MTR: 'm', LM: 'm', H87: 'Stk', C62: 'Stk', EA: 'Stk', XPP: 'Stk', HUR: 'h', KGM: 'kg',
  TNE: 't', LS: 'psch', LTR: 'l', DAY: 'Tag', WEE: 'Wo', MON: 'Mon', SET: 'Satz', PR: 'Paar', MIN: 'min', KMT: 'km' };
/** OZ am Anfang der Bezeichnung: „03.2 Wandanschluss …“ */
const OZ_TEXT = /^\s*(\d{1,4}(?:\.\d{1,4}){1,4})\.?\s+([\s\S]+)$/;

export interface ERechnungZeile { oz: string; kurztext: string; menge: number | null; einheit: string; ep: number | null; gp: number | null }
export interface ERechnung {
  nummer: string; datum: string; firma: string;
  /** Leistungsstand netto: Summe der Positionen (ohne Abzüge der Firma) */ netto: number;
  ust: number | null; brutto: number | null; zahlbetrag: number | null;
  zeilen: ERechnungZeile[];
  /** Zeilen mit negativem Betrag: Abzüge der Firma (Einbehalt, frühere Abschläge) – keine Positionen */ abzuege: { text: string; betrag: number }[];
}

const text = (k: XmlKnoten | undefined, ...pfad: string[]) => (kind(k, ...pfad)?.text ?? '').trim();
const zahl = (t: string) => (t.trim() === '' || !Number.isFinite(Number(t)) ? null : Number(t));
const datum = (t: string) => (/^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '');

function zeile(name: string, menge: XmlKnoten | undefined, ep: string, gp: string): ERechnungZeile {
  const n = name.replace(/\s+/g, ' ').trim(), m = OZ_TEXT.exec(n);
  return { oz: m ? m[1]! : '', kurztext: m ? m[2]!.trim() : n, menge: zahl(menge?.text ?? ''), einheit: EINHEIT[(menge?.attr.unitCode ?? '').toUpperCase()] ?? menge?.attr.unitCode ?? '', ep: zahl(ep), gp: zahl(gp) };
}

/** Eine E-Rechnung aus ihrem XML; null, wenn es keine ist. */
export function eRechnungLesen(xml: string): ERechnung | null {
  const w = xmlLesen(xml);
  let kopf: Omit<ERechnung, 'netto' | 'zeilen' | 'abzuege'>, z: ERechnungZeile[];
  if (w.name === 'CrossIndustryInvoice') {
    const tr = kind(w, 'SupplyChainTradeTransaction'), s = kind(tr, 'ApplicableHeaderTradeSettlement', 'SpecifiedTradeSettlementHeaderMonetarySummation');
    z = kinder(tr, 'IncludedSupplyChainTradeLineItem').map((li) => zeile(text(li, 'SpecifiedTradeProduct', 'Name'), kind(li, 'SpecifiedLineTradeDelivery', 'BilledQuantity'),
      text(li, 'SpecifiedLineTradeAgreement', 'NetPriceProductTradePrice', 'ChargeAmount'), text(li, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount')));
    kopf = { nummer: text(w, 'ExchangedDocument', 'ID'), datum: datum(text(w, 'ExchangedDocument', 'IssueDateTime', 'DateTimeString')),
      firma: text(tr, 'ApplicableHeaderTradeAgreement', 'SellerTradeParty', 'Name'),
      ust: zahl(text(s, 'TaxTotalAmount')), brutto: zahl(text(s, 'GrandTotalAmount')), zahlbetrag: zahl(text(s, 'DuePayableAmount')) };
  } else if (w.name === 'Invoice' || w.name === 'CreditNote') {
    const s = kind(w, 'LegalMonetaryTotal');
    z = w.kinder.filter((k) => k.name === 'InvoiceLine' || k.name === 'CreditNoteLine').map((li) => zeile(text(li, 'Item', 'Name'), kind(li, 'InvoicedQuantity') ?? kind(li, 'CreditedQuantity'),
      text(li, 'Price', 'PriceAmount'), text(li, 'LineExtensionAmount')));
    kopf = { nummer: text(w, 'ID'), datum: datum(text(w, 'IssueDate')),
      firma: text(w, 'AccountingSupplierParty', 'Party', 'PartyLegalEntity', 'RegistrationName') || text(w, 'AccountingSupplierParty', 'Party', 'PartyName', 'Name'),
      ust: zahl(text(w, 'TaxTotal', 'TaxAmount')), brutto: zahl(text(s, 'TaxInclusiveAmount')), zahlbetrag: zahl(text(s, 'PayableAmount')) };
  } else return null;
  const zeilen = z.filter((x) => (x.gp ?? 0) >= 0);
  return { ...kopf, zeilen, abzuege: z.filter((x) => (x.gp ?? 0) < 0).map((x) => ({ text: x.kurztext, betrag: x.gp! })),
    netto: Math.round(zeilen.reduce((a, x) => a + (x.gp ?? 0), 0) * 100) / 100 };
}

const ist = (t: string) => /<(\w+:)?(CrossIndustryInvoice|Invoice|CreditNote)[\s>]/.test(t.slice(0, 4000));

/** XML der E-Rechnung aus einer Datei: reines XML oder ein PDF mit angehängtem XML (ZUGFeRD/Factur-X). Sonst null. */
export async function eRechnungXml(b: Uint8Array): Promise<string | null> {
  const anfang = new TextDecoder('latin1').decode(b.subarray(0, 8));
  if (!anfang.startsWith('%PDF')) { const t = new TextDecoder().decode(b); return ist(t.replace(/^﻿/, '').trimStart()) ? t : null; }
  // Angehängte Dateien stehen im PDF als Strom mit /Type /EmbeddedFile (Ströme liegen nie in Objektströmen)
  const roh = new TextDecoder('latin1').decode(b);
  for (const m of roh.matchAll(/\d+\s+\d+\s+obj((?:(?!endobj)[\s\S])*?)stream\r?\n/g)) {
    const dict = m[1]!, start = m.index! + m[0].length;
    if (!dict.includes('/EmbeddedFile')) continue;
    const laenge = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    const ende = laenge ? start + Number(laenge[1]) : roh.indexOf('endstream', start);
    let inhalt = b.subarray(start, ende);
    if (/\/FlateDecode/.test(dict)) {
      try { inhalt = new Uint8Array(await new Response(new Blob([inhalt as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
      catch { continue; }   // anderer Anhang, der sich nicht entpacken lässt – weiter mit dem nächsten
    }
    const t = new TextDecoder().decode(inhalt);
    if (ist(t.replace(/^﻿/, '').trimStart())) return t;
  }
  return null;
}
