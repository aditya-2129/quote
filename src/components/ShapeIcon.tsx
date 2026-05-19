function ShapeIcon({ shape, size = 14 }: { shape: string; size?: number }) {
  const s = size, sw = 1.25, stroke = "currentColor";
  switch (shape) {
    case "rect":
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="10" height="8" rx="0.5" stroke={stroke} strokeWidth={sw}/><line x1="3" y1="6" x2="13" y2="6" stroke={stroke} strokeWidth={sw} opacity="0.5"/></svg>;
    case "round":
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="6" rx="3" stroke={stroke} strokeWidth={sw}/></svg>;
    case "hex":
      return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><polygon points="4,4 12,4 14.5,8 12,12 4,12 1.5,8" stroke={stroke} strokeWidth={sw} strokeLinejoin="round"/></svg>;
    default:
      return null;
  }
}

export { ShapeIcon };
