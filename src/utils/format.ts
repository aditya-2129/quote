const MATERIAL_PALETTE = ["#8d959c", "#bfc7d1", "#c69f5a", "#a8b0b8", "#dcd9d2", "#7d92aa", "#a89b7a", "#a3b5a8"];

function colorForMaterial(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return MATERIAL_PALETTE[Math.abs(h) % MATERIAL_PALETTE.length];
}

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMin(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export { MATERIAL_PALETTE, colorForMaterial, fmtINR, fmtMin };
