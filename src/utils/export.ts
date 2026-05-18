import type { PdfExportResult } from "../types";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";

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

export type QuotationPartMaterial = {
  partName: string;
  material: string;
  dimensions: string;
  ratePerKg: number;
  cost: number;
};

export type QuotationPartOperation = {
  partName: string;
  operation: string;
  ratePerHour: number;
  cost: number;
};

export type QuotationPartOperationGroup = {
  partName: string;
  operations: Array<{
    operation: string;
    ratePerHour: number;
    cost: number;
  }>;
};

export type QuotationBopBreakdown = {
  name: string;
  qtyPerAssembly: number;
  unitCost: number;
  totalCost: number;
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
  /** Optional company logo as JPG/PNG bytes. When provided, replaces the initials circle on page 1. */
  logoBytes?: Uint8Array | null;
  /** Mime hint for logoBytes — "image/jpeg" or "image/png" (defaults to jpg if omitted). */
  logoMime?: "image/jpeg" | "image/png";
  /** Optional CAD snapshot PNG bytes for the page-1 reference image box. When omitted, the box is hidden. */
  cadSnapshotPng?: Uint8Array | null;
  /** Page-2 rows: per-part material breakdown. Page is skipped if empty. */
  partMaterials?: QuotationPartMaterial[];
  /** Page-3 rows: per-part operations. Page is skipped if empty. */
  partOperationGroups?: QuotationPartOperationGroup[];
  /** Page-4 rows: BOP breakdown. Page is skipped if empty. */
  bopBreakdown?: QuotationBopBreakdown[];
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

type DrawCtx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  logo: PDFImage | null;
};

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
  const headerH = 68;
  const logoSize = 56;
  const logoX = MARGIN_X + 8;
  const logoY = top - (headerH + logoSize) / 2 + 2;

  if (ctx.logo) {
    // Embedded logo image (e.g. company brand mark). Drawn square in the slot
    // that the initials circle would otherwise occupy.
    ctx.page.drawImage(ctx.logo, {
      x: logoX,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  } else {
    // Fallback for tenants without a logo asset: circle-with-initials.
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
  }

  let cy = top - 16;
  const nameSize = 17;
  const nameWidth = textWidth(ctx.bold, company.name, nameSize);
  drawText(ctx, company.name, RIGHT_INNER - nameWidth, cy, {
    font: ctx.bold,
    size: nameSize,
    color: C.ink,
  });
  cy -= 13;

  for (const line of company.addressLines) {
    const w = textWidth(ctx.font, line, 9);
    drawText(ctx, line, RIGHT_INNER - w, cy, { size: 9, color: C.ink });
    cy -= 10;
  }

  const phoneEmail = `Mo. ${company.phone}, Email ${company.email}`;
  const pew = textWidth(ctx.font, phoneEmail, 9);
  drawText(ctx, phoneEmail, RIGHT_INNER - pew, cy, { size: 9, color: C.ink });
  cy -= 10;

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
  const splitX = MARGIN_X + 310;
  const leftX = MARGIN_X + 40;
  const leftMaxWidth = splitX - leftX - 14;
  const lineStep = 12;

  const leftLines: Array<{ text: string; size: number; font?: PDFFont }> = [];
  leftLines.push({ text: customer.name, size: 10.5, font: ctx.bold });
  for (const line of customer.addressLines) {
    for (const wrapped of wrapText(ctx.font, line, 9.5, leftMaxWidth)) {
      leftLines.push({ text: wrapped, size: 9.5 });
    }
  }
  if (customer.gstin) {
    for (const wrapped of wrapText(ctx.font, `GSTIN/UIN : ${customer.gstin}`, 9.5, leftMaxWidth)) {
      leftLines.push({ text: wrapped, size: 9.5 });
    }
  }

  // To label
  let ly = top - 16;
  drawText(ctx, "To", MARGIN_X + 6, ly, { font: ctx.bold, size: 10 });
  for (const line of leftLines) {
    drawText(ctx, line.text, leftX, ly, { font: line.font, size: line.size });
    ly -= lineStep;
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
  const renderedLines = Math.max(leftLines.length, rows.length);
  const blockH = 16 + (renderedLines - 1) * lineStep + 8;
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
  const label = "QUOTATION - JOB WORK";
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
  // Left-anchored columns
  const colSr = MARGIN_X;
  const colPart = MARGIN_X + 40;
  // Numeric columns are right-anchored (we right-align headers + values to
  // these X coords) so the longest label — "Total Price (INR)" — stays inside
  // the page border. The previous left-anchored layout overflowed by ~15 px.
  // Anchors leave room for the widest header in each column:
  //   "Unit Price" (~52 px) + gutter must fit between qty and unit anchors;
  //   "Total Price (INR)" (~85 px) + gutter must fit between unit and total
  // anchors. The previous unitRightX=MARGIN_X+460 put the two headers' boxes
  // into overlap with no visible gap between them.
  const qtyRightX = MARGIN_X + 350;
  const unitRightX = MARGIN_X + 435;
  const totalRightX = COL_RIGHT_X - 4;

  const drawRight = (
    text: string,
    rightX: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const font = opts.font ?? ctx.font;
    const size = opts.size ?? 9.5;
    const w = textWidth(font, text, size);
    drawText(ctx, text, rightX - w, y, opts);
  };

  // Header row
  const headerH = 20;
  drawText(ctx, "Sr. No.", colSr + 2, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawText(ctx, "Particular", colPart, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawRight("Qty.", qtyRightX, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawRight("Unit Price", unitRightX, top - 14, { font: ctx.bold, size: 9.5, color: C.muted });
  drawRight(`Total Price (${currencyLabel})`, totalRightX, top - 14, {
    font: ctx.bold,
    size: 9.5,
    color: C.muted,
  });
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - headerH, 0.75, C.rule);

  let y = top - headerH - 4;
  // Particular column ends where the Qty column starts. Qty's left edge is
  // roughly its right edge minus its widest expected value (~20 px); keep an
  // 8 px gutter before it for the description wrap-width budget.
  const partColWidth = qtyRightX - 30 - colPart - 8;

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
    drawRight(`${item.qty}`, qtyRightX, rowTopY - 11, { size: 9.5 });
    drawRight(item.unit, qtyRightX, rowTopY - 23, { size: 9.5 });
    drawRight(fmtMoney(item.unitPrice), unitRightX, rowTopY - 11, { size: 9.5 });
    drawRight(fmtMoney(item.totalPrice), totalRightX, rowTopY - 11, {
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

// Mirrors the layout in drawGrandTotal so the caller can pin the block to a
// specific bottom Y (e.g. just above the terms block). Returns the total
// vertical space the block consumes from `top` down to its closing rule.
function grandTotalBlockHeight(ctx: DrawCtx, notes: string | undefined): number {
  if (notes && notes.trim()) {
    const noteLines = wrapText(ctx.font, notes.trim(), 9, COL_RIGHT_X - MARGIN_X - 60);
    const k = Math.min(3, noteLines.length);
    return 82 + k * 11;
  }
  return 76;
}

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
  cadSnapshot: PDFImage | null,
  top: number,
): number {
  const blockH = TERMS_BLOCK_H;
  const bottom = top - blockH;
  // When there's no CAD snapshot to render, terms + signature take the full
  // page width — otherwise they're confined to the left column with the
  // snapshot on the right.
  const splitX = cadSnapshot ? MARGIN_X + 340 : COL_RIGHT_X;
  const textRight = cadSnapshot ? splitX : COL_RIGHT_X;

  drawText(ctx, "Terms & Conditions", MARGIN_X + 8, top - 16, { font: ctx.bold, size: 10 });
  let ty = top - 32;
  for (const term of terms) {
    drawText(ctx, "•", MARGIN_X + 10, ty, { font: ctx.bold, size: 9.5 });
    const lines = wrapText(ctx.font, term, 9, textRight - MARGIN_X - 32);
    for (const line of lines) {
      drawText(ctx, line, MARGIN_X + 22, ty, { size: 9 });
      ty -= 11;
    }
    ty -= 2;
  }

  ty -= 6;
  const thanks = "We look forward to your valuable order and assure you of our best quality and timely service.";
  const thanksLines = wrapText(ctx.italic, thanks, 8.5, textRight - MARGIN_X - 16);
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

  if (cadSnapshot) {
    const boxX = splitX + 10;
    const boxY = bottom + 10;
    const boxW = COL_RIGHT_X - splitX - 18;
    const boxH = blockH - 20;
    // Fit the snapshot inside the box preserving aspect ratio.
    const imgAspect = cadSnapshot.width / Math.max(1, cadSnapshot.height);
    const boxAspect = boxW / boxH;
    let drawW = boxW;
    let drawH = boxH;
    if (imgAspect > boxAspect) {
      drawH = boxW / imgAspect;
    } else {
      drawW = boxH * imgAspect;
    }
    ctx.page.drawImage(cadSnapshot, {
      x: boxX + (boxW - drawW) / 2,
      y: boxY + (boxH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
    drawVerticalLine(ctx.page, splitX, bottom, top, 0.75, C.rule);
  }

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
  // Asymmetric column widths: EMAIL holds ~155 px of address text, so even
  // splits (~134 px each) push it into the DELIVERY column. Widen EMAIL,
  // narrow DELIVERY (usually blank) and CALL (short phone numbers).
  const colWidths = [115, 90, 210, 120]; // sums to 535 = COL_RIGHT_X - MARGIN_X
  const colStarts: number[] = [];
  {
    let cursorX = MARGIN_X;
    for (const w of colWidths) {
      colStarts.push(cursorX);
      cursorX += w;
    }
  }
  const headers = ["CONTACT PERSON NAME", "CALL", "EMAIL", "DELIVERY"];
  const values = [contact.name, contact.phone, contact.email, contact.delivery ?? ""];

  // Headers (bold, centered within their column). Auto-shrink any header
  // that overflows — "CONTACT PERSON NAME" at size 9 bold is ~120 px and
  // would touch the column divider in a 115 px column.
  const headerRowY = contactTop - 16;
  headers.forEach((h, i) => {
    const colW = colWidths[i]!;
    const cellPad = 4;
    let size = 9;
    while (size > 7 && textWidth(ctx.bold, h, size) > colW - cellPad * 2) size -= 0.5;
    const cx = colStarts[i]! + colW / 2;
    const w = textWidth(ctx.bold, h, size);
    drawText(ctx, h, cx - w / 2, headerRowY, { font: ctx.bold, size });
  });
  const headerBottomY = contactTop - 22;
  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, headerBottomY, 0.5, C.rule);

  // Values — auto-shrink any cell that still overflows its column (e.g. a
  // very long email). Drops from 9 → 8 → 7 until it fits or 7 is reached.
  const valueRowY = headerBottomY - 16;
  values.forEach((v, i) => {
    const colW = colWidths[i]!;
    const cellPad = 4;
    let size = 9;
    while (size > 7 && textWidth(ctx.font, v, size) > colW - cellPad * 2) size -= 0.5;
    const w = textWidth(ctx.font, v, size);
    const cx = colStarts[i]! + colW / 2;
    drawText(ctx, v, cx - w / 2, valueRowY, { size });
  });

  // Vertical dividers — drawn at each interior column boundary.
  for (let i = 1; i < 4; i++) {
    drawVerticalLine(ctx.page, colStarts[i]!, contactTop - tableH, contactTop, 0.5, C.rule);
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
   Continuation pages (page 2+)
   =========================================================== */

// Compact header used on pages 2..N. Smaller than the cover-page header but
// still carries the brand mark + company name so each page is self-identifying.
function drawCompactHeader(
  ctx: DrawCtx,
  company: QuotationCompany,
  pageTitle: string,
  meta: QuotationMeta,
  top: number,
): number {
  const headerH = 56;
  const logoSize = 40;
  const logoX = MARGIN_X + 6;
  const logoY = top - headerH + 8;

  if (ctx.logo) {
    ctx.page.drawImage(ctx.logo, { x: logoX, y: logoY, width: logoSize, height: logoSize });
  }

  // Company name + GST line, centered between logo and the meta block.
  const nameX = logoX + logoSize + 12;
  drawText(ctx, company.name, nameX, top - 18, { font: ctx.bold, size: 12 });
  drawText(ctx, `GSTN : ${company.gstn}`, nameX, top - 31, { size: 8.5, color: C.muted });
  drawText(ctx, pageTitle, nameX, top - 45, { font: ctx.bold, size: 10, color: C.accent });

  // Right-aligned meta (SR. NO. + DATE) for cross-referencing the cover page.
  const metaLines = [`SR. NO. : ${meta.srNo || "—"}`, `DATE : ${meta.date}`];
  let my = top - 18;
  for (const line of metaLines) {
    const w = textWidth(ctx.font, line, 9);
    drawText(ctx, line, RIGHT_INNER - w, my, { size: 9 });
    my -= 12;
  }

  drawHorizontalLine(ctx.page, MARGIN_X, COL_RIGHT_X, top - headerH, 1.0, C.ink);
  return top - headerH;
}

// Generic table renderer used by all continuation pages.
type TableColumn = {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
  bold?: boolean;
};

function drawTable(
  ctx: DrawCtx,
  columns: TableColumn[],
  rows: string[][],
  top: number,
): number {
  const headerH = 22;
  const rowH = 20;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  // Page is 535 px wide between margins — centre the table if it's narrower.
  const xStart = MARGIN_X + Math.max(0, ((COL_RIGHT_X - MARGIN_X) - totalW) / 2);

  // Top edge of the table — without this the header row appears to have no
  // roof, since the vertical column dividers start at `top` but nothing
  // connects them across.
  drawHorizontalLine(ctx.page, xStart, xStart + totalW, top, 0.75, C.rule);

  // Header row
  let cx = xStart;
  for (const col of columns) {
    const labelW = textWidth(ctx.bold, col.label, 9);
    let lx = cx + 4;
    if (col.align === "right") lx = cx + col.width - labelW - 4;
    else if (col.align === "center") lx = cx + (col.width - labelW) / 2;
    drawText(ctx, col.label, lx, top - 14, { font: ctx.bold, size: 9, color: C.muted });
    cx += col.width;
  }
  drawHorizontalLine(ctx.page, xStart, xStart + totalW, top - headerH, 0.75, C.rule);

  // Body rows
  let y = top - headerH;
  for (const row of rows) {
    cx = xStart;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!;
      const cell = row[i] ?? "";
      const cellW = textWidth(col.bold ? ctx.bold : ctx.font, cell, 9.5);
      let tx = cx + 4;
      if (col.align === "right") tx = cx + col.width - cellW - 4;
      else if (col.align === "center") tx = cx + (col.width - cellW) / 2;
      drawText(ctx, cell, tx, y - 13, { size: 9.5, font: col.bold ? ctx.bold : ctx.font });
      cx += col.width;
    }
    drawHorizontalLine(ctx.page, xStart, xStart + totalW, y - rowH, 0.25, C.ruleSoft);
    y -= rowH;
  }

  // Vertical column dividers
  let dx = xStart;
  for (let i = 0; i <= columns.length; i++) {
    drawVerticalLine(ctx.page, dx, y, top, 0.5, C.rule);
    if (i < columns.length) dx += columns[i]!.width;
  }

  return y;
}

function drawPartMaterialsPage(
  pdf: PDFDocument,
  data: QuotationData,
  logo: PDFImage | null,
  font: PDFFont,
  bold: PDFFont,
  italic: PDFFont,
): void {
  if (!data.partMaterials || data.partMaterials.length === 0) return;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, font, bold, italic, logo };

  let cursor = PAGE_H - MARGIN_X;
  cursor = drawCompactHeader(ctx, data.company, "MATERIAL DETAILS", data.meta, cursor);

  const columns: TableColumn[] = [
    { label: "Sr.", width: 30, align: "center" },
    { label: "Part Name", width: 130, bold: true },
    { label: "Material", width: 110 },
    { label: "Dimensions", width: 110 },
    { label: `Rate (${data.currencyLabel}/kg)`, width: 70, align: "right" },
    { label: `Cost (${data.currencyLabel})`, width: 85, align: "right" },
  ];
  const rows = data.partMaterials.map((m, i) => [
    `${i + 1}`,
    m.partName,
    m.material,
    m.dimensions,
    fmtMoney(m.ratePerKg),
    fmtMoney(m.cost),
  ]);
  drawTable(ctx, columns, rows, cursor - 8);

  // Draw all four outer borders last so nothing overdraws them. Using the
  // same 1.0 thickness on every side keeps the frame visually consistent —
  // earlier versions drew a 1.5 top before content and the rest at 1.0,
  // which made the top look weirdly faint in some PDF viewers.
  drawVerticalLine(page, MARGIN_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawVerticalLine(page, COL_RIGHT_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, MARGIN_X, 1.0, C.ink);
}

function drawPartOperationsPage(
  pdf: PDFDocument,
  data: QuotationData,
  logo: PDFImage | null,
  font: PDFFont,
  bold: PDFFont,
  italic: PDFFont,
): void {
  if (!data.partOperationGroups || data.partOperationGroups.length === 0) return;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, font, bold, italic, logo };

  let cursor = PAGE_H - MARGIN_X;
  cursor = drawCompactHeader(ctx, data.company, "OPERATIONS & PROCESS DETAILS", data.meta, cursor);

  const columns: TableColumn[] = [
    { label: "Sr.", width: 30, align: "center" },
    { label: "Part Name", width: 150, bold: true },
    { label: "Operation", width: 180 },
    { label: `Rate (${data.currencyLabel}/h)`, width: 80, align: "right" },
    { label: `Cost (${data.currencyLabel})`, width: 95, align: "right" },
  ];
  const rows: string[][] = [];
  let sr = 1;
  for (const group of data.partOperationGroups) {
    if (group.operations.length === 0) {
      rows.push([`${sr++}`, group.partName, "—", "—", "—"]);
      continue;
    }
    group.operations.forEach((op, idx) => {
      rows.push([
        idx === 0 ? `${sr}` : "",
        idx === 0 ? group.partName : "",
        op.operation,
        fmtMoney(op.ratePerHour),
        fmtMoney(op.cost),
      ]);
    });
    sr += 1;
  }
  drawTable(ctx, columns, rows, cursor - 8);

  // Draw all four outer borders last so nothing overdraws them. Using the
  // same 1.0 thickness on every side keeps the frame visually consistent —
  // earlier versions drew a 1.5 top before content and the rest at 1.0,
  // which made the top look weirdly faint in some PDF viewers.
  drawVerticalLine(page, MARGIN_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawVerticalLine(page, COL_RIGHT_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, MARGIN_X, 1.0, C.ink);
}

function drawBopBreakdownPage(
  pdf: PDFDocument,
  data: QuotationData,
  logo: PDFImage | null,
  font: PDFFont,
  bold: PDFFont,
  italic: PDFFont,
): void {
  if (!data.bopBreakdown || data.bopBreakdown.length === 0) return;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, font, bold, italic, logo };

  let cursor = PAGE_H - MARGIN_X;
  cursor = drawCompactHeader(ctx, data.company, "BROUGHT-OUT PARTS (BOP)", data.meta, cursor);

  const columns: TableColumn[] = [
    { label: "Sr.", width: 30, align: "center" },
    { label: "Name", width: 220, bold: true },
    { label: "Qty / Asm", width: 85, align: "right" },
    { label: `Unit Cost (${data.currencyLabel})`, width: 100, align: "right" },
    { label: `Total Cost (${data.currencyLabel})`, width: 100, align: "right" },
  ];
  const rows = data.bopBreakdown.map((b, i) => [
    `${i + 1}`,
    b.name,
    `${b.qtyPerAssembly}`,
    fmtMoney(b.unitCost),
    fmtMoney(b.totalCost),
  ]);
  drawTable(ctx, columns, rows, cursor - 8);

  // Draw all four outer borders last so nothing overdraws them. Using the
  // same 1.0 thickness on every side keeps the frame visually consistent —
  // earlier versions drew a 1.5 top before content and the rest at 1.0,
  // which made the top look weirdly faint in some PDF viewers.
  drawVerticalLine(page, MARGIN_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawVerticalLine(page, COL_RIGHT_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, PAGE_H - MARGIN_X, 1.0, C.ink);
  drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, MARGIN_X, 1.0, C.ink);
}

/* ===========================================================
   Public API
   =========================================================== */

export async function exportQuotationPdf(data: QuotationData): Promise<PdfExportResult> {
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    let logo: PDFImage | null = null;
    if (data.logoBytes && data.logoBytes.byteLength > 0) {
      logo = data.logoMime === "image/png"
        ? await pdf.embedPng(data.logoBytes)
        : await pdf.embedJpg(data.logoBytes);
    }

    let cadSnapshot: PDFImage | null = null;
    if (data.cadSnapshotPng && data.cadSnapshotPng.byteLength > 0) {
      cadSnapshot = await pdf.embedPng(data.cadSnapshotPng);
    }

    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const ctx: DrawCtx = { page, font, bold, italic, logo };

    // Top outer border
    drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, PAGE_H - MARGIN_X, 1.5, C.ink);

    let cursor = PAGE_H - MARGIN_X;
    cursor = drawHeader(ctx, data.company, cursor);
    cursor = drawBillTo(ctx, data.customer, data.meta, cursor);
    cursor = drawTagline(ctx, data.company.tagline, cursor);
    cursor = drawTitle(ctx, cursor);
    cursor = drawItemsTable(ctx, data.items, data.currencyLabel, cursor);

    // Footer + terms are pinned to the bottom of the page so the layout never
    // shifts based on item count.
    const FOOTER_H = 100;
    const footerTop = MARGIN_X + FOOTER_H;
    const termsTop = footerTop + TERMS_BLOCK_H;

    // Grand total is pinned to sit directly above the terms block — any
    // whitespace between items and grand total stays above (not below) it so
    // the page bottom reads cleanly: items … gap … grand total | terms.
    const grandTotalH = grandTotalBlockHeight(ctx, data.notes);
    const grandTotalTop = Math.min(cursor, termsTop + grandTotalH);
    drawGrandTotal(ctx, data.grandTotal, data.currencyLabel, data.notes, grandTotalTop);

    drawTermsAndSignature(ctx, data.terms, data.company.name, cadSnapshot, termsTop);
    drawFooterBlock(ctx, data.contact, footerTop);

    // Left + right outer borders
    drawVerticalLine(page, MARGIN_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
    drawVerticalLine(page, COL_RIGHT_X, MARGIN_X, PAGE_H - MARGIN_X, 1.0, C.ink);
    drawHorizontalLine(page, MARGIN_X, COL_RIGHT_X, MARGIN_X, 1.0, C.ink);

    // Continuation pages — each renderer no-ops when its payload is empty.
    drawPartMaterialsPage(pdf, data, logo, font, bold, italic);
    drawPartOperationsPage(pdf, data, logo, font, bold, italic);
    drawBopBreakdownPage(pdf, data, logo, font, bold, italic);

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
