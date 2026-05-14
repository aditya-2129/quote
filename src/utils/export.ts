import type { PdfExportResult, QuoteCalculation } from "../types";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function exportQuotationPdf(
  quote: QuoteCalculation,
): Promise<PdfExportResult> {
  try {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const dark = rgb(0.09, 0.1, 0.13);
    const muted = rgb(0.36, 0.39, 0.45);
    const accent = rgb(0.04, 0.53, 0.68);

    page.drawRectangle({
      x: 0,
      y: 782,
      width: 595,
      height: 60,
      color: dark,
    });
    page.drawText("STEP QUOTE", {
      x: 42,
      y: 805,
      size: 18,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Industrial Manufacturing Quotation", {
      x: 42,
      y: 790,
      size: 9,
      font,
      color: rgb(0.74, 0.78, 0.84),
    });
    page.drawText(quote.quoteNumber, {
      x: 424,
      y: 802,
      size: 13,
      font: bold,
      color: rgb(1, 1, 1),
    });

    const drawLabelValue = (
      label: string,
      value: string,
      x: number,
      y: number,
    ) => {
      page.drawText(label.toUpperCase(), {
        x,
        y,
        size: 7,
        font: bold,
        color: muted,
      });
      page.drawText(value, {
        x,
        y: y - 15,
        size: 11,
        font,
        color: dark,
      });
    };

    drawLabelValue(
      "Customer",
      quote.customerName || "Walk-in customer",
      42,
      735,
    );
    drawLabelValue("Project", quote.projectName, 218, 735);
    drawLabelValue(
      "Date",
      new Date(quote.createdAt).toLocaleDateString(),
      424,
      735,
    );
    drawLabelValue("Part", quote.partName, 42, 680);
    drawLabelValue("Material", quote.material.name, 218, 680);
    drawLabelValue("Quantity", quote.quantity.toString(), 424, 680);

    page.drawLine({
      start: { x: 42, y: 636 },
      end: { x: 553, y: 636 },
      thickness: 1,
      color: rgb(0.86, 0.88, 0.91),
    });

    page.drawText("Geometry", {
      x: 42,
      y: 608,
      size: 13,
      font: bold,
      color: dark,
    });
    const geometryRows = [
      [
        "Bounding box",
        `${quote.geometry.boundingBoxMm.x.toFixed(1)} x ${quote.geometry.boundingBoxMm.y.toFixed(1)} x ${quote.geometry.boundingBoxMm.z.toFixed(1)} mm`,
      ],
      ["Volume", `${quote.geometry.volumeCm3.toFixed(2)} cm3`],
      ["Surface area", `${quote.geometry.surfaceAreaCm2.toFixed(2)} cm2`],
      [
        "Faces / edges",
        `${quote.geometry.faceCount} / ${quote.geometry.edgeCount}`,
      ],
      ["Estimated mass", `${quote.massKg.toFixed(3)} kg`],
    ];

    geometryRows.forEach(([label, value], index) => {
      const y = 582 - index * 22;
      page.drawText(label, { x: 42, y, size: 9, font, color: muted });
      page.drawText(value, { x: 182, y, size: 9, font: bold, color: dark });
    });

    page.drawText("Pricing Breakdown", {
      x: 318,
      y: 608,
      size: 13,
      font: bold,
      color: dark,
    });
    const money = (value: number) =>
      `${quote.currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
    const costRows = [
      ["Material", quote.costs.materialCost],
      ["Setup", quote.costs.setupCost],
      ["Machining", quote.costs.machineCost],
      ["Labor", quote.costs.laborCost],
      ["Finishing", quote.costs.finishingCost],
      ["Inspection", quote.costs.inspectionCost],
      ["Tooling", quote.costs.toolingCost],
      ["Margin", quote.costs.margin],
      ["Tax", quote.costs.tax],
    ];

    costRows.forEach(([label, value], index) => {
      const y = 582 - index * 20;
      page.drawText(label as string, {
        x: 318,
        y,
        size: 9,
        font,
        color: muted,
      });
      page.drawText(money(value as number), {
        x: 464,
        y,
        size: 9,
        font,
        color: dark,
      });
    });

    page.drawRectangle({
      x: 318,
      y: 338,
      width: 235,
      height: 58,
      color: rgb(0.94, 0.98, 0.99),
      borderColor: accent,
      borderWidth: 1,
    });
    page.drawText("Total", {
      x: 334,
      y: 373,
      size: 10,
      font: bold,
      color: accent,
    });
    page.drawText(money(quote.costs.total), {
      x: 410,
      y: 368,
      size: 18,
      font: bold,
      color: dark,
    });
    page.drawText(`Unit price: ${money(quote.costs.unitPrice)}`, {
      x: 334,
      y: 350,
      size: 9,
      font,
      color: muted,
    });

    page.drawText("Notes", {
      x: 42,
      y: 294,
      size: 12,
      font: bold,
      color: dark,
    });
    page.drawText(
      quote.notes ||
        "Quotation generated locally from uploaded CAD geometry and configured manufacturing rates.",
      {
        x: 42,
        y: 274,
        size: 9,
        font,
        color: muted,
        maxWidth: 500,
        lineHeight: 13,
      },
    );

    page.drawText(
      "Generated by STEP Quote. Validate tolerances, finishes, and process assumptions before release.",
      {
        x: 42,
        y: 44,
        size: 8,
        font,
        color: muted,
      },
    );

    const bytes = await pdf.save();

    return {
      ok: true,
      fileName: `${quote.quoteNumber}.pdf`,
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

