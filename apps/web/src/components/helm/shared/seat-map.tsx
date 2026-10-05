"use client";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CircleGauge, Check, X, Accessibility, Crown } from "lucide-react";
import { SEAT_KIND_LABEL } from "@travelhelm/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface SeatView {
  id: string;
  code: string;
  row: number;
  col: number;
  kind: string; // STANDARD | VIP | ACCESSIBLE | SERVICE
  window: boolean;
  state: string; // FREE | MINE | HOLD_OTHER | TAKEN | BOOKED | BOARDED
  holdExpireIn?: number | null;
  passenger?: string | null;
  bookingRef?: string | null;
  ticketStatus?: string | null;
}

interface SeatMapProps {
  seats: SeatView[];
  layout: "2-2" | "2-3";
  selectedIds?: string[];
  onToggle?: (seat: SeatView) => void;
  maxSelect?: number;
  mode?: "select" | "manifest";
  disabled?: boolean;
  vipSurcharge?: number;
  basePrice?: number;
}

function SeatButton({ seat, selected, disabled, onClick, vipFee }: { seat: SeatView; selected: boolean; disabled: boolean; onClick: () => void; vipFee: number }) {
  const isService = seat.kind === "SERVICE";
  const isVip = seat.kind === "VIP";
  const isPmr = seat.kind === "ACCESSIBLE";

  const stateCls = (() => {
    if (isService) return "bg-muted/40 border-dashed border-border text-muted-foreground/50 cursor-not-allowed";
    switch (seat.state) {
      case "MINE":
        return "bg-emerald-600 border-emerald-600 text-white shadow-[0_6px_16px_-6px_rgba(6,95,70,0.55)]";
      case "TAKEN":
        return "bg-stone-300/70 border-stone-300 text-stone-500 cursor-not-allowed dark:bg-stone-700/60 dark:border-stone-600 dark:text-stone-400";
      case "HOLD_OTHER":
        return "bg-amber-100/80 border-amber-400 border-dashed text-amber-700 cursor-not-allowed dark:bg-amber-900/30 dark:text-amber-300/80";
      case "BOARDED":
        return "bg-emerald-500/90 border-emerald-500 text-white";
      case "BOOKED":
        return "bg-amber-400/80 border-amber-500 text-amber-950 dark:text-amber-50";
      default:
        return isVip
          ? "bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-500 hover:shadow-[0_6px_14px_-6px_rgba(180,83,9,0.4)] dark:bg-amber-950/30 dark:text-amber-200"
          : "bg-card border-stone-300 text-foreground hover:border-emerald-600 hover:shadow-[0_6px_14px_-6px_rgba(6,95,70,0.35)] dark:border-stone-600";
    }
  })();

  const clickable = !isService && !disabled && !["TAKEN", "HOLD_OTHER"].includes(seat.state) && seat.state !== "MINE" ? true : seat.state === "MINE" && !disabled;

  const label = isService
    ? "Siège service (non vendable)"
    : `${seat.code} · ${SEAT_KIND_LABEL[seat.kind] ?? "Standard"}${seat.window ? " · fenêtre" : ""}${isVip && vipFee ? ` · +${vipFee.toLocaleString("fr-FR")} FCFA` : ""}${
        seat.state === "TAKEN" ? " · déjà vendu" : seat.state === "HOLD_OTHER" ? " · retenue temporaire en cours" : ""
      }${seat.passenger ? ` · ${seat.passenger}` : ""}`;

  return (
    <Tooltip delayDuration={80}>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          layout
          whileTap={clickable ? { scale: 0.92 } : undefined}
          onClick={clickable ? onClick : undefined}
          disabled={!clickable}
          aria-label={label}
          className={cn(
            "seat-btn relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-[10px] border font-mono text-[11px] font-semibold",
            stateCls,
            clickable && !selected && "cursor-pointer"
          )}
        >
          {selected ? (
            <AnimatePresence>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center justify-center">
                <Check className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            </AnimatePresence>
          ) : isService ? (
            <X className="h-3.5 w-3.5 opacity-60" />
          ) : (
            <span className="flex flex-col items-center leading-none">
              {isPmr && <Accessibility className="mb-0.5 h-3 w-3" />}
              {isVip && !isPmr && <Crown className="mb-0.5 h-3 w-3 opacity-80" />}
              <span>{seat.code}</span>
            </span>
          )}
          {seat.state === "TAKEN" && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-[1.5px] w-8 rotate-[-38deg] rounded bg-stone-400/70 dark:bg-stone-500/70" />
            </span>
          )}
          {seat.state === "HOLD_OTHER" && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="h-2.5 w-2.5 rounded-full border border-amber-500 bg-amber-300" />
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SeatMap({
  seats,
  layout,
  selectedIds = [],
  onToggle,
  maxSelect = 1,
  mode = "select",
  disabled = false,
  vipSurcharge = 0,
  basePrice = 0,
}: SeatMapProps) {
  const rows = Array.from(new Set(seats.map((s) => s.row))).sort((a, b) => a - b);
  const leftCols = layout === "2-3" ? [0, 1] : [0, 1];
  const rightCols = layout === "2-3" ? [2, 3, 4] : [2, 3];
  const selectedSet = new Set(selectedIds);

  const handleToggle = (seat: SeatView) => {
    if (mode === "manifest") return;
    onToggle?.(seat);
  };

  return (
    <div className="w-full">
      {/* Carrosserie */}
      <div className="relative mx-auto w-fit rounded-[28px] border-2 border-stone-200 bg-gradient-to-b from-stone-50 to-stone-100/50 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_30px_-14px_rgba(60,50,30,0.25)] dark:border-stone-700/70 dark:from-stone-800/60 dark:to-stone-900/40 sm:px-5 sm:py-4">
        {/* Avant du véhicule */}
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-stone-200 bg-white/70 px-4 py-2 dark:border-stone-700 dark:bg-stone-800/50">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <CircleGauge className="h-4 w-4" />
            Cabine
          </div>
          <div className="h-2 w-16 rounded-full bg-gradient-to-r from-stone-200 to-transparent dark:from-stone-600" aria-hidden />
        </div>

        <div className="flex gap-2 sm:gap-3">
          {/* Numéros de rangée */}
          <div className="flex flex-col gap-1.5 pt-[1px] sm:gap-2" aria-hidden>
            {rows.map((r) => (
              <div key={r} className="flex h-11 items-center justify-center sm:h-12">
                <span className="num text-[10px] text-muted-foreground/60">{r}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 sm:gap-2">
            {rows.map((r) => (
              <div key={r} className="flex items-center gap-2 sm:gap-3">
                <div className="flex gap-1.5 sm:gap-2">
                  {leftCols.map((c) => {
                    const seat = seats.find((s) => s.row === r && s.col === c);
                    if (!seat) return <div key={c} className="h-11 w-11 sm:h-12 sm:w-12" />;
                    return (
                      <SeatButton
                        key={seat.id}
                        seat={seat}
                        selected={selectedSet.has(seat.id)}
                        disabled={disabled || (mode === "select" && !selectedSet.has(seat.id) && selectedSet.size >= maxSelect)}
                        onClick={() => handleToggle(seat)}
                        vipFee={vipSurcharge}
                      />
                    );
                  })}
                </div>
                {/* Couloir */}
                <div className="w-4 sm:w-6" aria-label="couloir" />
                <div className="flex gap-1.5 sm:gap-2">
                  {rightCols.map((c) => {
                    const seat = seats.find((s) => s.row === r && s.col === c);
                    if (!seat) return <div key={c} className="h-11 w-11 sm:h-12 sm:w-12" />;
                    return (
                      <SeatButton
                        key={seat.id}
                        seat={seat}
                        selected={selectedSet.has(seat.id)}
                        disabled={disabled || (mode === "select" && !selectedSet.has(seat.id) && selectedSet.size >= maxSelect)}
                        onClick={() => handleToggle(seat)}
                        vipFee={vipSurcharge}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Arrière */}
        <div className="mt-3 h-2 rounded-full bg-stone-200/70 dark:bg-stone-700/50" aria-hidden />
      </div>

      {/* Légende */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md border border-stone-300 bg-card dark:border-stone-600" /> Libre</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md bg-emerald-600" /> Votre choix</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30" /> VIP +{vipSurcharge ? vipSurcharge.toLocaleString("fr-FR") : 0} FCFA</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md bg-stone-300/70 dark:bg-stone-700/60" /> Vendu</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md border border-dashed border-amber-400 bg-amber-100/60 dark:bg-amber-900/30" /> Retenue en cours</span>
        {mode === "manifest" && <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-md bg-emerald-500" /> Embarqué</span>}
      </div>
    </div>
  );
}
