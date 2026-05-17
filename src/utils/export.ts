import type { PdfExportResult } from "../types";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

/* ===========================================================
   Public types
   =========================================================== */

export type QuotationLineItem = {
  partNumber: string;
  description?: string;
  materialNote?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
};

export type QuotationCompany = {
  name: string;
  addressLines: string[];
  phone: string;
  email: string;
  gstn: string;
  state: string;
  stateCode: string;
  tagline: string;
};

export type QuotationCustomer = {
  name: string;
  addressLines: string[];
  gstin?: string;
};

export type QuotationMeta = {
  srNo: string;
  date: string;
  refNo: string;
  validFor: string;
};

export type QuotationContact = {
  name: string;
  phone: string;
  email: string;
  delivery?: string;
};

export type QuotationData = {
  company: QuotationCompany;
  customer: QuotationCustomer;
  meta: QuotationMeta;
  items: QuotationLineItem[];
  grandTotal: number;
  currencyLabel: string;
  notes?: string;
  terms: string[];
  contact: QuotationContact;
  fileName?: string;
};

/* ===========================================================
   Layout constants
   =========================================================== */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 30;
const COL_RIGHT_X = PAGE_W - MARGIN_X;
const RIGHT_INNER = COL_RIGHT_X - 8;

const C = {
  ink: rgb(0.08, 0.09, 0.12),
  muted: rgb(0.36, 0.39, 0.45),
  rule: rgb(0.78, 0.81, 0.86),
  ruleSoft: rgb(0.88, 0.90, 0.93),
  accent: rgb(0.10, 0.44, 0.66),
  italicMuted: rgb(0.30, 0.34, 0.40),
};

/* ===========================================================
   Text helpers
   =========================================================== */

type DrawCtx = { page: PDFPage; font: PDFFont; bold: PDFFont; italic: PDFFont };

// pdf-lib's StandardFonts (Helvetica family) only encode WinAnsi/CP1252. Map
// the Unicode symbols our app emits to ASCII fallbacks so the exporter never
// throws on characters like ⌀ (diameter), bullets, smart quotes, etc.
const UNICODE_FALLBACKS: Array<[RegExp, string]> = [
  [/⌀|Ø/g, "Dia "],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/—/g, "-"],
  [/→/g, "->"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "!="],
  [/√/g, "sqrt"],
];

function sanitize(text: string): string {
  let out = text;
  for (const [re, sub] of UNICODE_FALLBACKS) out = out.replace(re, sub);
  // Strip anything still outside CP1252's printable range.
  // eslint-disable-next-line no-control-regex
  return out.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ•–˜™š›œžŸ]/g, "?");
}

function textWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(sanitize(text), size);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tentative = line ? `${line} ${word}` : word;
    if (textWidth(font, tentative, size) <= maxWidth) {
      line = tentative;
    } else {
      if (line) lines.push(line);
      // Word longer than maxWidth — hard-break it
      if (textWidth(font, word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (textWidth(font, chunk + ch, size) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
) {
  ctx.page.drawText(sanitize(text), {
    x,
    y,
    size: opts.size ?? 9,
    font: opts.font ?? ctx.font,
    color: opts.color ?? C.ink,
  });
}

function drawHorizontalLine(
  page: PDFPage,
  x1: number,
  x2: number,
  y: number,
  thickness = 0.75,
  color = C.rule,
) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function drawVerticalLine(
  page: PDFPage,
  x: number,
  y1: number,
  y2: number,
  thickness = 0.75,
  color = C.rule,
) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color });
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { stroke?: ReturnType<typeof rgb>; fill?: ReturnType<typeof rgb>; strokeWidth?: number } = {},
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: opts.stroke,
    borderWidth: opts.strokeWidth ?? (opts.stroke ? 0.75 : 0),
    color: opts.fill,
  });
}

/* ===========================================================
   Money + number-to-words
   =========================================================== */

function fmtMoney(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtMoneyInt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(twoDigits(r));
  return parts.join(" ");
}

export function rupeesInWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise === 0) return "Zero Only";

  const segments: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;

  if (crore) segments.push(`${twoDigits(crore)} Crore`);
  if (lakh) segments.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) segments.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) segments.push(threeDigits(hundred));

  let words = segments.join(" ");
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `Rupees ${words} Only`;
}

/* ===========================================================
   Section: header
   =========================================================== */

function drawHeader(ctx: DrawCtx, company: QuotationCompany, top: number): number {
  const headerH = 82;
  const logoSize = 56;
  const logoX = MARGIN_X + 8;
  const logoY = top - (headerH + logoSize) / 2 + 4;

  const initials = company.name
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "Q";

  ctx.page.drawCircle({
    x: logoX + logoSize / 2,
    y: logoY + logoSize / 2,
    size: logoSize / 2,
    borderColor: C.accent,
    borderWidth: 2,
  });
  const initSize = 22;
  const initWidth = textWidth(ctx.bold, initials, initSize);
  drawText(ctx, initials, logoX + logoSize / 2 - initWidth / 2, logoY + logoSize / 2 - 7, {
    font: ctx.bold,
    size: initSize,
    color: C.accent,
  });

  let cy = top - 18;
  const nameSize = 17;
  const nameWidth = textWidth(ctx.bold, company.name, nameSize);
  drawText(ctx, company.name, RIGHT_INNER - nameWidth, cy, {
    font: ctx.bold,
    size: nameSize,
    color: C.ink,
  });
  cy -= 14;

  for (const line of company.addressLines) {
    const w = textWidth(ctx.font, line, 9);
    drawText(ctx, line, RIGHT_INNER - w, cy, { size: 9, color: C.ink });
    cy -= 11;
  }

  const phoneEmail = `Mo. ${company.phone}, Email ${company.email}`;
  const pew = textWidth(ctx.font, phoneEmail, 9);
  drawText(ctx, phoneEmail, RIGHT_INNER - pew, cy, { size: 9, color: C.ink });
  cy -= 11;

  const gst = `GSTN : ${company.gstn} | STATE : ${company.state} CODE:${company.stateCode}`;
  const gw = textWidth(ctx.font, gst, 8.5);
  drawText(ctx, gst, RIGHT_INNER - gw, cy, { size: 8.5, color: C.ink });

  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - headerH, 1.5, C.ink);
  return top - headerH;
}

/* ===========================================================
   Section: bill-to + meta
   =========================================================== */

function drawBillTo(ctx: DrawCtx, customer: QuotationCustomer, meta: QuotationMeta, top: number): number {
  const blockH = 90;
  const splitX = MARGIN_X + 310;

  // To label
  let ly = top - 16;
  drawText(ctx, "To", MARGIN_X + 6, ly, { font: ctx.bold, size: 10 });
  drawText(ctx, customer.name, MARGIN_X + 40, ly, { font: ctx.bold, size: 10.5 });
  ly -= 14;
  for (const line of customer.addressLines) {
    drawText(ctx, line, MARGIN_X + 40, ly, { size: 9.5 });
    ly -= 12;
  }
  if (customer.gstin) {
    drawText(ctx, `GSTIN/UIN : ${customer.gstin}`, MARGIN_X + 40, ly, { size: 9.5 });
  }

  // Meta panel
  const metaX = splitX + 12;
  const labelW = 70;
  const rows: Array<[string, string]> = [
    ["SR. NO.", `: ${meta.srNo || "—"}`],
    ["DATE", `: ${meta.date}`],
    ["REF NO.", `: ${meta.refNo || "____________"}`],
    ["VALID FOR", `: ${meta.validFor}`],
  ];
  let my = top - 16;
  for (const [k, v] of rows) {
    drawText(ctx, k, metaX, my, { font: ctx.bold, size: 9.5 });
    drawText(ctx, v, metaX + labelW, my, { font: k === "DATE" || k === "VALID FOR" ? ctx.bold : ctx.font, size: 9.5 });
    my -= 16;
  }

  // Vertical divider
  drawVerticalLine(ctx.page, splitX, top - blockH, top, 0.75, C.rule);
  // Bottom rule
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - blockH, 1.0, C.ink);

  return top - blockH;
}

/* ===========================================================
   Section: tagline
   =========================================================== */

function drawTagline(ctx: DrawCtx, tagline: string, top: number): number {
  const h = 22;
  drawText(ctx, tagline, PAGE_W / 2 - textWidth(ctx.bold, tagline, 10) / 2, top - 15, {
    font: ctx.bold,
    size: 10,
  });
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - h, 1.0, C.ink);
  return top - h;
}

/* ===========================================================
   Section: title
   =========================================================== */

function drawTitle(ctx: DrawCtx, top: number): number {
  const h = 32;
  const label = "QUOTATION";
  const size = 20;
  const w = textWidth(ctx.bold, label, size);
  drawText(ctx, label, PAGE_W / 2 - w / 2, top - 24, { font: ctx.bold, size });
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - h, 0.75, C.rule);
  return top - h;
}

/* ===========================================================
   Section: items table
   =========================================================== */

function drawItemsTable(
  ctx: DrawCtx,
  items: QuotationLineItem[],
  currencyLabel: string,
  top: number,
): number {
  // Columns
  const colSr = MARGIN_X;
  const colPart = MARGIN_X + 40;
  const colQty = MARGIN_X + 340;
  const colUnit = MARGIN_X + 400;
  const colTotal = MARGIN_X + 470;

  // Header row
  const headerH = 20;
  drawText(ctx, "Sr. No.", colSr + 2, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawText(ctx, "Particular", colPart, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawText(ctx, "Qty.", colQty, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawText(ctx, "Unit Price", colUnit, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawText(ctx, `Total Price (${currencyLabel})`, colTotal, top - 14, {
    font: ctx.bold,
    size: 9.5,
    color: C.muted,
  });
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - headerH, 0.75, C.rule);

  let y = top - headerH - 4;
  const partColWidth = colQty - colPart - 8;

  items.forEach((item, idx) => {
    const rowTopY = y;
    drawText(ctx, `${idx + 1}.`, colSr + 2, y - 11, { size: 9.5 });
    drawText(ctx, item.partNumber, colPart, y - 11, { font: ctx.bold, size: 9.5 });
    let lineY = y - 11 - 12;

    if (item.description) {
      const descLines = wrapText(ctx.font, item.description, 9, partColWidth);
      for (const line of descLines) {
        drawText(ctx, line, colPart, lineY, { size: 9, color: C.italicMuted, font: ctx.italic });
        lineY -= 11;
      }
    }
    if (item.materialNote) {
      lineY -= 2;
      drawText(ctx, item.materialNote, colPart, lineY, { font: ctx.bold, size: 9 });
      lineY -= 11;
    }

    // Right-side numeric cells aligned to row top
    drawText(ctx, `${item.qty}`, colQty + 2, rowTopY - 11, { size: 9.5 });
    drawText(ctx, item.unit, colQty + 2, rowTopY - 23, { size: 9.5 });
    drawText(ctx, fmtMoney(item.unitPrice), colUnit, rowTopY - 11, { size: 9.5 });
    drawText(ctx, fmtMoney(item.totalPrice), colTotal, rowTopY - 11, {
      font: ctx.bold,
      size: 9.5,
    });

    y = Math.min(lineY, rowTopY - 28) - 6;
  });

  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, y, 0.5, C.ruleSoft);
  return y;
}

/* ===========================================================
   Section: grand total + words + note
   =========================================================== */

function drawGrandTotal(
  ctx: DrawCtx,
  total: number,
  currencyLabel: string,
  notes: string | undefined,
  top: number,
): number {
  let y = top - 18;
  drawText(
    ctx,
    `Grand Total (${currencyLabel}): ${fmtMoneyInt(total)}/-`,
    MARGIN_X + 4,
    y,
    { font: ctx.bold, size: 11 },
  );
  y -= 16;
  drawText(ctx, `(${rupeesInWords(total)})`, MARGIN_X + 4, y, {
    size: 9.5,
    color: C.italicMuted,
    font: ctx.italic,
  });
  y -= 18;
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, y, 0.5, C.ruleSoft);

  if (notes && notes.trim()) {
    y -= 14;
    drawText(ctx, "Note –", MARGIN_X + 4, y, { font: ctx.bold, size: 9.5 });
    const noteLines = wrapText(ctx.font, notes.trim(), 9, COL_RIGHT_X - MARGIN_X - 60);
    let ny = y - 12;
    for (const line of noteLines.slice(0, 3)) {
      drawText(ctx, line, MARGIN_X + 48, ny, { size: 9 });
      ny -= 11;
    }
    y = ny - 4;
  } else {
    y -= 14;
    drawText(ctx, "Note –", MARGIN_X + 4, y, { font: ctx.bold, size: 9.5 });
    y -= 10;
  }
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, y, 1.0, C.ink);
  return y;
}

/* ===========================================================
   Section: terms + signature
   =========================================================== */

const TERMS_BLOCK_H = 200;

function drawTermsAndSignature(
  ctx: DrawCtx,
  terms: string[],
  companyName: string,
  top: number,
): number {
  const blockH = TERMS_BLOCK_H;
  const bottom = top - blockH;
  const splitX = MARGIN_X + 340;

  drawText(ctx, "Terms & Conditions", MARGIN_X + 8, top - 16, { font: ctx.bold, size: 10 });
  let ty = top - 32;
  for (const term of terms) {
    drawText(ctx, "•", MARGIN_X + 10, ty, { font: ctx.bold, size: 9.5 });
    const lines = wrapText(ctx.font, term, 9, splitX - MARGIN_X - 32);
    for (const line of lines) {
      drawText(ctx, line, MARGIN_X + 22, ty, { size: 9 });
      ty -= 11;
    }
    ty -= 2;
  }

  ty -= 6;
  const thanks = "We look forward to your valuable order and assure you of our best quality and timely service.";
  const thanksLines = wrapText(ctx.italic, thanks, 8.5, splitX - MARGIN_X - 16);
  for (const line of thanksLines) {
    drawText(ctx, line, MARGIN_X + 8, ty, {
      font: ctx.italic,
      size: 8.5,
      color: C.italicMuted,
    });
    ty -= 10;
  }

  // Signature pinned to the bottom of the block so it never collides with the rule
  const sigBaseY = bottom + 10;
  drawText(ctx, "Authorized Signature", MARGIN_X + 8, sigBaseY, { font: ctx.bold, size: 9.5 });
  drawText(ctx, `for ${companyName}`, MARGIN_X + 8, sigBaseY + 42, { font: ctx.bold, size: 10 });

  // Drawing placeholder on right
  drawBox(ctx.page, splitX + 10, bottom + 10, COL_RIGHT_X - splitX - 18, blockH - 20, {
    stroke: C.ruleSoft,
  });
  const ph = "Reference drawing / model image";
  const phw = textWidth(ctx.italic, ph, 9);
  drawText(
    ctx,
    ph,
    splitX + 10 + (COL_RIGHT_X - splitX - 18) / 2 - phw / 2,
    bottom + blockH / 2,
    { font: ctx.italic, size: 9, color: C.muted },
  );

  drawVerticalLine(ctx.page, splitX, bottom, top, 0.75, C.rule);
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, bottom, 1.0, C.ink);
  return bottom;
}

/* ===========================================================
   Section: thank-you + contact + footer
   =========================================================== */

function drawFooterBlock(ctx: DrawCtx, contact: QuotationContact, top: number) {
  // Top thanks block
  const thanksBlockH = 36;
  const thanks =
    "We thank you for your valuable enquiry and trust this quotation subject to the Terms and conditions given above will find your approval. Your order will receive our prompt and careful attention.";
  const thanksLines = wrapText(ctx.italic, thanks, 9, COL_RIGHT_X - MARGIN_X - 16);
  let ty = top - 14;
  for (const line of thanksLines) {
    const w = textWidth(ctx.italic, line, 9);
    drawText(ctx, line, PAGE_W / 2 - w / 2, ty, {
      font: ctx.italic,
      size: 9,
      color: C.italicMuted,
    });
    ty -= 11;
  }
  const contactTop = top - thanksBlockH;
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, contactTop, 0.75, C.rule);

  // Contact table
  const tableH = 44;
  const colW = (COL_RIGHT_X - MARGIN_X) / 4;
  const headers = ["CONTACT PERSON NAME", "CALL", "EMAIL", "DELEVERY"];
  const values = [contact.name, contact.phone, contact.email, contact.delivery ?? ""];

  // Headers (bold, centered)
  const headerRowY = contactTop - 16;
  headers.forEach((h, i) => {
    const cx = MARGIN_X + colW * i + colW / 2;
    const w = textWidth(ctx.bold, h, 9);
    drawText(ctx, h, cx - w / 2, headerRowY, { font: ctx.bold, size: 9 });
  });
  const headerBottomY = contactTop - 22;
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, headerBottomY, 0.5, C.rule);

  // Values
  const valueRowY = headerBottomY - 16;
  values.forEach((v, i) => {
    const cx = MARGIN_X + colW * i + colW / 2;
    const w = textWidth(ctx.font, v, 9);
    drawText(ctx, v, cx - w / 2, valueRowY, { size: 9 });
  });

  // Vertical dividers
  for (let i = 1; i < 4; i++) {
    drawVerticalLine(ctx.page, MARGIN_X + colW * i, contactTop - tableH, contactTop, 0.5, C.rule);
  }
  const tableBottom = contactTop - tableH;
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, tableBottom, 0.75, C.rule);

  // Closing line
  const closing = "For any queries regarding the quotation, feel free to contact the concerned person.";
  const cw = textWidth(ctx.italic, closing, 9.5);
  drawText(ctx, closing, PAGE_W / 2 - cw / 2, tableBottom - 16, {
    font: ctx.italic,
    size: 9.5,
    color: C.accent,
  });
}

/* ===========================================================
   Public API
   =========================================================== */

export async function exportQuotationPdf(data: QuotationData): Promise<PdfExportResult> {
  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const ctx: DrawCtx = { page, font, bold, italic };

    // Top outer border
    drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, PAGE_H - MARGIN_X, 1.5, C.ink);

    let cursor = PAGE_H - MARGIN_X;
    cursor = drawHeader(ctx, data.company, cursor);
    cursor = drawBillTo(ctx, data.customer, data.meta, cursor);
    cursor = drawTagline(ctx, data.company.tagline, cursor);
    cursor = drawTitle(ctx, cursor);
    cursor = drawItemsTable(ctx, data.items, data.currencyLabel, cursor);
    cursor = drawGrandTotal(ctx, data.grandTotal, data.currencyLabel, data.notes, cursor);

    // Footer + terms are pinned to the bottom of the page so the layout never
    // shifts based on item count.
    const FOOTER_H = 100;
    const footerTop = MARGIN_X + FOOTER_H;
    const termsTop = footerTop + TERMS_BLOCK_H;
    drawTermsAndSignature(ctx, data.terms, data.company.name, termsTop);
    drawFooterBlock(ctx, data.contact, footerTop);
    // cursor (the bottom of the grand total block) is the available items
    // ceiling; if it lands below termsTop the items overflow into the fixed
    // terms section. Acceptable for v1.
    void cursor;

    // Left + right outer borders
    drawVerticalLine(page, MARGIN_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
    drawVerticalLine(page, COL_RIGHT_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
    drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, MARGIN_X, 1.0, C.ink);

    const bytes = await pdf.save();
    return {
      ok: true,
      fileName: data.fileName ?? `${data.meta.srNo || "quotation"}.pdf`,
      bytes,
      mimeType: "application/pdf",
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Unable to export PDF.",
    };
  }
}
