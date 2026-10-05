"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { fcfa, fmtTime, fmtDate, duration } from "@travelhelm/shared";
import { DEPARTURE_STATUS, statusMeta } from "@travelhelm/shared";
import { CompanyDot, FreshnessTag } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowRight, ChevronLeft, Clock, MapPin, Armchair, Snowflake, Usb, Luggage,
  TriangleAlert, RefreshCw, Timer, SearchX, Info,
} from "lucide-react";

interface ResultItem {
  id: string;
  company: { name: string; slug: string; brandColor: string; brandAccent: string; tagline: string };
  route: { code: string; originCity: string; destCity: string; boardingPoint: string; dropOffPoint: string };
  departsAt: string;
  durationMin: number;
  status: string;
  delayMin: number | null;
  reason: string | null;
  basePrice: number;
  vipSurcharge: number;
  seatsLeft: number;
  capacity: number;
  seatSelection: boolean;
  vehicle: { label: string; model: string; amenities: string[] } | null;
  boardingCutoffMin: number;
}

type SortKey = "time" | "price" | "seats";

const AMENITY_ICON: Record<string, typeof Snowflake> = {
  Climatisation: Snowflake,
  "Prises USB": Usb,
  "Écrans individuels": Usb,
  "Bagage inclus": Luggage,
};

function SeatsBadge({ left, capacity }: { left: number; capacity: number }) {
  const tone = left <= 5 ? "red" : left <= 15 ? "amber" : "green";
  const cls = {
    red: "bg-red-500/10 text-red-700 border-red-500/25",
    amber: "bg-amber-500/12 text-amber-700 border-amber-500/30",
    green: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", cls)}>
      <Armchair className="h-3.5 w-3.5" />
      {left > 0 ? `${left} place${left > 1 ? "s" : ""}` : "Complet"} · {Math.round((left / capacity) * 100)}%
    </span>
  );
}

export function ResultsView() {
  const { search, selectDeparture, setStep } = useHelm();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [syncAt, setSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("time");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/helm/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: search.origin, destination: search.destination, date: search.date, passengers: search.passengers }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResults(d.results);
      setSyncAt(d.inventorySyncAt);
    } catch (e) {
      toast.error((e as Error).message || "Erreur de recherche");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement réseau déclenché par changement de clé
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const arr = [...results];
    if (sort === "price") arr.sort((a, b) => a.basePrice - b.basePrice);
    if (sort === "seats") arr.sort((a, b) => b.seatsLeft - a.seatsLeft);
    if (sort === "time") arr.sort((a, b) => new Date(a.departsAt).getTime() - new Date(b.departsAt).getTime());
    return arr;
  }, [results, sort]);

  const arrival = (r: ResultItem) => {
    const d = new Date(r.departsAt);
    d.setMinutes(d.getMinutes() + r.durationMin + (r.delayMin ?? 0));
    return d;
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
      {/* En-tête recherche */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setStep("search")} className="gap-1.5 cursor-pointer -ml-2">
          <ChevronLeft className="h-4 w-4" /> Modifier
        </Button>
        <h2 className="text-lg font-semibold tracking-tight">
          {search.origin} <ArrowRight className="inline h-4 w-4 text-primary" /> {search.destination}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{fmtDate(search.date, { long: true })} · {search.passengers} voyageur{search.passengers > 1 ? "s" : ""}</span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <FreshnessTag syncedAt={syncAt} />
          <Button variant="outline" size="sm" onClick={() => load(true)} className="gap-1.5 cursor-pointer">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualiser
          </Button>
        </div>
      </div>

      {/* Tri */}
      <div className="mb-4 flex items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Trier</span>
        {([["time", "Heure"], ["price", "Prix"], ["seats", "Disponibilité"]] as [SortKey, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors",
              sort === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Résultats */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
          <SearchX className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-lg font-semibold">Aucun départ publié pour cette liaison</h3>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Aucune compagnie n&apos;a publié de départ vendable de {search.origin} vers {search.destination} le {fmtDate(search.date, { long: true })}.
            Essayez une autre date ou consultez la gare partenaire.
          </p>
          <Button variant="outline" onClick={() => setStep("search")} className="mt-5 cursor-pointer">Nouvelle recherche</Button>
        </motion.div>
      ) : (
        <div className="space-y-3.5">
          {sorted.map((r, i) => {
            const meta = statusMeta(DEPARTURE_STATUS, r.status);
            const late = (r.delayMin ?? 0) > 0;
            return (
              <motion.article
                key={r.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_10px_-6px_rgba(70,55,25,0.18)] transition-all hover:border-primary/35 hover:shadow-[0_18px_40px_-20px_rgba(11,110,71,0.35)]"
              >
                {(late || r.status === "EMBARQUEMENT") && (
                  <div className={cn(
                    "flex items-center gap-2 border-b px-4 py-1.5 text-[11.5px] font-semibold",
                    late ? "border-amber-500/25 bg-amber-500/10 text-amber-800" : "border-emerald-500/25 bg-emerald-500/8 text-emerald-800"
                  )}>
                    {late ? <TriangleAlert className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
                    {late ? `Retard estimé : +${r.delayMin} min — ${r.reason ?? "voyageurs notifiés par SMS"}` : "Embarquement en cours — présentation au quai immédiate"}
                  </div>
                )}
                <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
                  {/* Compagnie */}
                  <div className="flex items-center gap-3 lg:w-52 lg:shrink-0 lg:flex-col lg:items-start lg:gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[13px] font-bold text-white shadow-inner" style={{ background: r.company.brandColor }}>
                        {r.company.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="lg:hidden">
                        <p className="text-[14px] font-semibold leading-tight">{r.company.name}</p>
                        <p className="num text-[10.5px] text-muted-foreground">{r.route.code}</p>
                      </div>
                    </div>
                    <div className="hidden lg:block">
                      <p className="text-[14px] font-semibold leading-tight">{r.company.name}</p>
                      <p className="num text-[10.5px] text-muted-foreground">{r.route.code} · {r.vehicle?.label ?? "véhicule à affecter"}</p>
                    </div>
                  </div>

                  {/* Horaires */}
                  <div className="flex flex-1 items-center gap-3 sm:gap-5">
                    <div>
                      <p className={cn("num text-[22px] font-semibold leading-none tracking-tight", late && "text-amber-700")}>{fmtTime(r.departsAt)}</p>
                      <p className="mt-1.5 max-w-[110px] truncate text-[10.5px] text-muted-foreground" title={r.route.boardingPoint}>{r.route.boardingPoint}</p>
                    </div>
                    <div className="flex flex-1 flex-col items-center gap-1 px-1">
                      <div className="flex w-full items-center gap-1.5" aria-hidden>
                        <span className={cn("h-2 w-2 rounded-full", late ? "bg-amber-500" : "bg-emerald-600")} />
                        <span className="h-px flex-1 bg-gradient-to-r from-emerald-600/40 via-amber-500/30 to-amber-500/10" />
                        <Clock className="h-3 w-3 text-muted-foreground/70" />
                      </div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-secondary-foreground">{duration(r.durationMin)}</span>
                    </div>
                    <div className="text-right">
                      <p className="num text-[22px] font-semibold leading-none tracking-tight">{fmtTime(arrival(r))}</p>
                      <p className="mt-1.5 max-w-[110px] truncate text-[10.5px] text-muted-foreground" title={r.route.dropOffPoint ?? ""}>{r.route.dropOffPoint ?? r.route.destCity}</p>
                    </div>
                  </div>

                  {/* Prix + dispo */}
                  <div className="flex items-end justify-between gap-3 border-t border-border/70 pt-3.5 lg:w-64 lg:shrink-0 lg:flex-col lg:items-end lg:gap-2 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="text-left lg:text-right">
                      <p className="num text-[24px] font-semibold leading-none tracking-tight text-foreground">
                        {fcfa(r.basePrice)}
                        <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">/ pers.</span>
                      </p>
                      {r.vipSurcharge > 0 && <p className="mt-1 text-[10.5px] text-amber-700">Sièges VIP +{fcfa(r.vipSurcharge)}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5 lg:justify-end">
                        <SeatsBadge left={r.seatsLeft} capacity={r.capacity} />
                        {r.seatSelection ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                            <Armchair className="h-3 w-3" /> siège au choix
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground" title="Vente par capacité — place attribuée à l'embarquement (TH-INV-05)">
                            <Info className="h-3 w-3" /> place attribuée au quai
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        if (r.seatsLeft < search.passengers) {
                          toast.error(`Seulement ${r.seatsLeft} place(s) restante(s) pour ${search.passengers} voyageur(s).`);
                          return;
                        }
                        selectDeparture(r.id);
                        setStep("seats");
                      }}
                      className="h-11 cursor-pointer gap-2 rounded-xl px-6 font-semibold shadow-[0_8px_20px_-8px_rgba(11,110,71,0.55)] transition-transform group-hover:scale-[1.02]"
                    >
                      Choisir <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Équipements */}
                {r.vehicle && r.vehicle.amenities.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-secondary/40 px-4 py-2 text-[11px] text-muted-foreground sm:px-5">
                    {r.vehicle.amenities.map((a) => {
                      const Icon = AMENITY_ICON[a] ?? Snowflake;
                      return (
                        <span key={a} className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-primary/70" /> {a}
                        </span>
                      );
                    })}
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary/70" />
                      Présentation {r.boardingCutoffMin} min avant le départ
                    </span>
                    <CompanyDot color={r.company.brandAccent ?? r.company.brandColor} size={7} />
                    <span className="sr-only">{meta.label}</span>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Les places restantes sont calculées sur l&apos;inventaire central Travel Helm (ventes web + guichet, rétentions actives incluses)
        au moment de la requête. Aucune disponibilité n&apos;est inventée ni extrapolée.
      </p>
    </section>
  );
}
