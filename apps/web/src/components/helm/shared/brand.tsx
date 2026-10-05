"use client";
import { cn } from "@/lib/utils";

/** Marque Travel Helm : roue de timon (helm) stylisée */
export function HelmMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="currentColor" opacity="0.08" />
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
        <circle cx="24" cy="24" r="11.5" />
        <circle cx="24" cy="24" r="4.2" />
        <path d="M24 6.5v6M24 35.5v6M6.5 24h6M35.5 24h6M11.5 11.5l4.4 4.4M32.1 32.1l4.4 4.4M36.5 11.5l-4.4 4.4M15.9 32.1l-4.4 4.4" />
      </g>
      <circle cx="24" cy="24" r="3" fill="var(--helm-amber, #d9932f)" />
    </svg>
  );
}

export function HelmLogo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <HelmMark size={34} className={dark ? "text-[#2fbf7f]" : "text-[#0b6e47]"} />
      <span className="leading-none">
        <span className={cn("block text-[19px] font-semibold tracking-tight", dark ? "text-[#ece5d3]" : "text-[#221d16]")}>
          Travel<span className={dark ? "text-[#2fbf7f]" : "text-[#0b6e47]"}>Helm</span>
        </span>
        <span className={cn("block text-[10px] font-medium uppercase tracking-[0.22em] mt-1", dark ? "text-[#9d947c]" : "text-[#8a7d5f]")}>
          Timon du voyage
        </span>
      </span>
    </span>
  );
}

/** Pastille de marque compagnie */
export function CompanyDot({ color, size = 10, className }: { color: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full shrink-0", className)}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 0 3px ${color}22` }}
    />
  );
}
