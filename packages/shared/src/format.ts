// Travel Helm — formatage (FCFA, heures, durées) — fr/Bénin

export function fcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(n).replace(/\u202f|\u00a0/g, " ")} FCFA`;
}

export function fcfaShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 10_000) return `${Math.round(n / 1000)} k`;
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(d: Date | string, opts: { long?: boolean } = {}): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", opts.long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
}

export function fmtDateISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function relTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function relCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function initials(name: string): string {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function isToday(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}
