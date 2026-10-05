"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { SeatMap, type SeatView } from "@/components/helm/shared";
import { fcfa, fmtTime, fmtDate, duration, relCountdown } from "@travelhelm/shared";
import { SEAT_KIND_LABEL } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Armchair, ChevronLeft, Loader2, Lock, Radio, TriangleAlert, Users, Minus, Plus, Info } from "lucide-react";

interface DepartureDetail {
  id: string;
  company: { name: string; brandColor: string; brandAccent: string; holdMinutes: number };
  route: { code: string; originCity: string; destCity: string; boardingPoint: string; dropOffPoint: string; stops: { city: string; station: string; offsetMin: number }[] };
  vehicle: { label: string; model: string; seatLayout: "2-2" | "2-3"; amenities: string[] } | null;
  departsAt: string;
  durationMin: number;
  status: string;
  basePrice: number;
  vipSurcharge: number;
  seatSelection: boolean;
  seats: SeatView[];
  capacity: number;
  seatsLeft: number;
  serverTime: string;
}

export function SeatSelection() {
  const { search, selectedDepartureId, setStep, hold, setHold, resetTravel } = useHelm();
  const [detail, setDetail] = useState<DepartureDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [holding, setHolding] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [count, setCount] = useState(1);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Horloge pour compte à rebours
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!selectedDepartureId) return;
    const r = await fetch(`/api/helm/departures/${selectedDepartureId}`);
    if (!r.ok) {
      toast.error("Départ introuvable");
      setStep("results");
      return;
    }
    setDetail(await r.json());
  }, [selectedDepartureId, setStep]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling du plan de sièges (rafraîchissement réseau)
    load();
    pollRef.current = setInterval(load, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const seats = detail?.seats ?? [];
  const vipSelected = seats.filter((s) => selected.includes(s.id) && s.kind === "VIP").length;
  const base = detail?.basePrice ?? 0;
  const total = base * selected.length + vipSelected * (detail?.vipSurcharge ?? 0);
  const maxSelect = search.passengers;

  const toggleSeat = (seat: SeatView) => {
    setSelected((cur) => {
      if (cur.includes(seat.id)) return cur.filter((id) => id !== seat.id);
      if (cur.length >= maxSelect) {
        toast.info(`Vous pouvez réserver ${maxSelect} place(s) pour cette recherche.`);
        return cur;
      }
      return [...cur, seat.id];
    });
  };

  const retain = async () => {
    if (!detail || !selectedDepartureId) return;
    setHolding(true);
    try {
      const r = await fetch("/api/helm/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departureId: selectedDepartureId, seatIds: selected, channel: "WEB", holder: "Portail web" }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.takenSeats?.length) {
          toast.error(`${d.error} : sièges ${d.takenSeats.join(", ")}. La carte vient d'être actualisée.`);
          setSelected([]);
          load();
        } else {
          toast.error(d.error);
        }
        return;
      }
      setHold({
        token: d.holdToken, expiresAt: new Date(d.expiresAt).getTime(), seats: d.seats,
        departureId: selectedDepartureId,
        count: detail.seatSelection ? selected.length : count,
        pricing: { base: detail.basePrice, vip: detail.vipSurcharge },
      });
      toast.success(`Places retenues pendant ${detail.company.holdMinutes} minutes. Passez au paiement.`);
      setStep("checkout");
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setHolding(false);
    }
  };

  const freeCount = seats.filter((s) => s.state === "FREE" && s.kind !== "SERVICE").length;

  const SummaryCard = (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_10px_30px_-18px_rgba(70,55,25,0.3)]">
      <h3 className="text-[15px] font-semibold">Votre sélection</h3>
      {detail?.seatSelection ? (
        selected.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Touchez jusqu&apos;à <strong>{maxSelect}</strong> place{maxSelect > 1 ? "s" : ""} sur le plan. Les sièges grisés sont déjà vendus,
            les ambres pointillés sont provisoirement retenus par un autre achat en cours.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {seats.filter((s) => selected.includes(s.id)).map((s) => (
              <span key={s.id} className={cn(
                "num inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-bold",
                s.kind === "VIP" ? "border-amber-400/60 bg-amber-50 text-amber-800" : "border-emerald-600/40 bg-emerald-50 text-emerald-800"
              )}>
                <Armchair className="h-3.5 w-3.5" />
                {s.code}
                <span className="font-medium opacity-70">{SEAT_KIND_LABEL[s.kind]}</span>
              </span>
            ))}
          </div>
        )
      ) : (
        <div className="mt-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Cette liaison vend par capacité : la place est attribuée à l&apos;embarquement, pas simulée à l&apos;écran.
          </p>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="flex items-center gap-2 text-[13px] font-medium"><Users className="h-4 w-4 text-primary" /> Places</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} className="flex h-7 w-7 items-center justify-center rounded-full border border-border cursor-pointer disabled:opacity-30" aria-label="moins"><Minus className="h-3.5 w-3.5" /></button>
              <span className="num w-6 text-center font-bold">{count}</span>
              <button onClick={() => setCount((c) => Math.min(Math.min(4, detail?.seatsLeft ?? 4), c + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border cursor-pointer" aria-label="plus"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-1.5 border-t border-border/70 pt-3 text-[12.5px]">
        <div className="flex justify-between text-muted-foreground">
          <span>{(detail?.seatSelection ? selected.length : count) || 0} × trajet</span>
          <span className="num">{fcfa(base * (detail?.seatSelection ? selected.length : count))}</span>
        </div>
        {vipSelected > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>{vipSelected} × supplément VIP</span>
            <span className="num">{fcfa(vipSelected * (detail?.vipSurcharge ?? 0))}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Frais de dossier</span>
          <span className="num text-emerald-700 font-semibold">0 FCFA — offerts au pilote</span>
        </div>
        <div className="flex justify-between border-t border-border/70 pt-2 text-[15px] font-bold">
          <span>Total</span>
          <span className="num">{fcfa(detail?.seatSelection ? total : base * count)}</span>
        </div>
      </div>

      <Button
        onClick={retain}
        disabled={holding || (detail?.seatSelection ? selected.length === 0 : false)}
        className="mt-4 h-12 w-full cursor-pointer gap-2 text-[14px] font-semibold shadow-[0_10px_24px_-10px_rgba(11,110,71,0.55)]"
      >
        {holding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {holding ? "Rétention…" : `Retenir ${detail?.seatSelection ? selected.length || "…" : count} place(s)`}
      </Button>
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Radio className="h-3 w-3 text-emerald-600" />
        Rétention atomique — une seule vente possible par siège
      </p>
    </div>
  );

  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Chargement du plan du véhicule…</p>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
      {/* Bandeau départ */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => setStep("results")} className="gap-1.5 cursor-pointer -ml-1">
          <ChevronLeft className="h-4 w-4" /> Départs
        </Button>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: detail.company.brandColor }}>
            {detail.company.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight">
              {detail.route.originCity} → {detail.route.destCity}
              <span className="num ml-2 text-muted-foreground">{detail.route.code}</span>
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {fmtDate(detail.departsAt)} · <strong className="num">{fmtTime(detail.departsAt)}</strong> · {duration(detail.durationMin)} · {detail.vehicle?.label}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="sync-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live · actualisé il y a {Math.max(0, Math.round((now - new Date(detail.serverTime).getTime()) / 1000))} s
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Plan */}
        <div>
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold">
                {detail.seatSelection ? "Choisissez vos places" : "Places restantes sur ce départ"}
              </h2>
              {detail.seatSelection && (
                <span className="text-[12px] text-muted-foreground">
                  <strong className={cn("num font-bold", freeCount <= 10 ? "text-amber-700" : "text-emerald-700")}>{freeCount}</strong> libres · {detail.capacity} sièges · {detail.vehicle?.model}
                </span>
              )}
            </div>

            {detail.seatSelection ? (
              <SeatMap
                seats={seats}
                layout={detail.vehicle?.seatLayout ?? "2-3"}
                selectedIds={selected}
                onToggle={toggleSeat}
                maxSelect={maxSelect}
                vipSurcharge={detail.vipSurcharge}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
                <Users className="mx-auto h-9 w-9 text-muted-foreground/60" />
                <p className="mt-3 text-[14px] font-semibold">
                  {detail.seatsLeft} place{detail.seatsLeft > 1 ? "s" : ""} disponible{detail.seatsLeft > 1 ? "s" : ""} sur {detail.capacity}
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                  L&apos;attribution précise est faite au guichet / à l&apos;embarquement. L&apos;interface ne simule pas
                  un choix de siège non géré par la compagnie (TH-INV-05).
                </p>
                <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-border">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${((detail.capacity - detail.seatsLeft) / detail.capacity) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500"
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{detail.capacity - detail.seatsLeft} déjà vendues</p>
              </div>
            )}

            {detail.route.stops.length > 2 && (
              <div className="mt-5 border-t border-border/60 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Arrêts desservis</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {detail.route.stops.map((s, i) => (
                    <span key={s.city} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11.5px]">
                      <span className="num text-[10px] text-muted-foreground">{fmtTime(new Date(new Date(detail.departsAt).getTime() + s.offsetMin * 60000))}</span>
                      {s.city}
                      {i === 0 && <Info className="h-3 w-3 text-primary/70" />}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-700/20 bg-emerald-50/60 px-4 py-3 text-[11.5px] leading-relaxed text-emerald-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            Une fois retenues, vos places sont verrouillées {detail.company.holdMinutes} minutes au stock central :
            ni le web ni le guichet ne peuvent les vendre. Passé ce délai, elles sont libérées automatiquement.
          </div>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">{SummaryCard}</div>
      </div>

      {hold && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-emerald-600/40 bg-emerald-950 px-5 py-2.5 text-white shadow-2xl">
            <Lock className="h-4 w-4 text-emerald-300" />
            <span className="text-[12.5px] font-medium">Rétention active</span>
            <span className="num rounded-full bg-white/15 px-2.5 py-0.5 text-[13px] font-bold">{relCountdown(hold.expiresAt - now)}</span>
          </div>
        </div>
      )}

      <button onClick={resetTravel} className="mt-6 block text-center text-[12px] text-muted-underline text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground cursor-pointer mx-auto">
        Abandonner et recommencer
      </button>
    </section>
  );
}
