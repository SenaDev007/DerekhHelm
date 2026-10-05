"use client";
import { cn } from "@/lib/utils";
import { statusMeta, toneClasses, type StatusMeta } from "@travelhelm/shared";

export function StatusPill({
  map,
  status,
  className,
  withDot = true,
}: {
  map: Record<string, StatusMeta>;
  status: string;
  className?: string;
  withDot?: boolean;
}) {
  const meta = statusMeta(map, status);
  const tones = toneClasses(meta.tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tones.soft,
        className
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full", tones.dot)} />}
      {meta.label}
      {/* hint accessible */}
      {meta.hint && <span className="sr-only">{meta.hint}</span>}
    </span>
  );
}

export function FreshnessTag({ syncedAt, className }: { syncedAt: string | number | null; className?: string }) {
  if (!syncedAt) return null;
  const t = typeof syncedAt === "number" ? syncedAt : new Date(syncedAt).getTime();
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <span className="sync-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Inventaire central · sync il y a {sec < 5 ? `${sec} s` : sec < 90 ? `${sec} s` : `${Math.round(sec / 60)} min`}
    </span>
  );
}
