"use client";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { useApi } from "./use-api";
import { fcfa, fcfaShort, fmtTime, relTime } from "@travelhelm/shared";
import { DEPARTURE_STATUS, PAYMENT_STATUS, statusMeta, toneClasses, CHANNEL_LABEL } from "@travelhelm/shared";
import { StatusPill, CompanyDot } from "@/components/helm/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, Wallet, Globe, Store, Hourglass, Bus, ScanLine,
  ArrowRight, ScrollText, TriangleAlert, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Overview {
  company: { name: string; brandColor: string };
  kpis: {
    salesToday: { count: number; amount: number };
    web: { count: number; amount: number };
    guichet: { count: number; amount: number };
    pending: { count: number };
    departuresToday: number;
    activeDepartures: number;
    boardingLoad: { departureId: string; boarded: number; capacity: number; route: string } | null;
  };
  series: { label: string; web: number; guichet: number; count: number }[];
  boards: {
    id: string; time: string; route: string; code: string; status: string; delayMin: number | null;
    vehicle: string; capacity: number; confirmed: number; boarded: number; occupancy: number; revenue: number;
  }[];
  pendingPayments: { providerRef: string; status: string; amount: number; booking: string; passenger: string; route: string; departsAt: string }[];
  audit: { id: string; actor: string; action: string; entity: string; entityId: string; detail: string | null; at: string }[];
}

const ACTION_LABEL: Record<string, string> = {
  HOLD_CREATED: "Rétention créée",
  HOLD_RELEASED: "Rétention libérée",
  HOLD_EXPIRED: "Rétention expirée",
  BOOKING_PENDING: "Résa. en attente",
  BOOKING_CONFIRMED: "Résa. confirmée",
  GUICHET_SALE: "Vente guichet",
  PAYMENT_FAILED: "Paiement échoué",
  PAYMENT_UNKNOWN: "Paiement inconnu",
  BOARDING_OK: "Embarquement validé",
  BOARDING_DUPLICATE: "Double scan ignoré",
  BOARDING_REFUSED: "Embarquement refusé",
  BOARDING_MANUAL: "Examen manuel",
  DEPARTURE_PUBLIE: "Départ publié",
  DEPARTURE_RETARDE: "Départ retardé",
  DEPARTURE_ANNULE: "Départ annulé",
  DEPARTURE_EMBARQUEMENT: "Embarquement ouvert",
  DEPARTURE_EN_COURS: "Départ parti",
  DEPARTURE_TERMINE: "Départ terminé",
  DEPARTURE_CREATED: "Départ créé",
  DEPARTURE_DELAYED: "Départ retardé",
  DEPARTURE_CANCELED: "Départ annulé",
};

function KpiCard({ icon: Icon, label, value, sub, tone = "green", delay }: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" | "neutral"; delay: number;
}) {
  const tones = {
    green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    neutral: "text-stone-300 bg-stone-500/10 border-stone-500/20",
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/15"
    >
      <div className="flex items-center justify-between">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", tones)}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-[22px] font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

export function Dashboard() {
  const setAgencyTab = useHelm((s) => s.setAgencyTab);
  const { data, loading, reload, updatedAt } = useApi<Overview>(`/api/helm/backoffice/overview`, { intervalMs: 20000 });

  if (loading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />)}
      </div>
    );
  }
  if (!data) return <p className="text-sm text-red-400">Erreur de chargement — réessayez.</p>;

  const { kpis, series, boards, pendingPayments, audit } = data;

  return (
    <div className="space-y-6">
      {/* Titre + sync */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Tableau de bord</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {data.company.name} · aujourd&apos;hui · rafraîchi {relTime(updatedAt ? new Date(updatedAt) : new Date())}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => reload(true)} className="cursor-pointer gap-1.5">
          <Radio className="h-3.5 w-3.5 text-emerald-400" /> Actualiser
        </Button>
      </div>

      {/* Embarquement live */}
      {kpis.boardingLoad && (
        <motion.button
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setAgencyTab("boarding")}
          className="flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-4 py-3.5 text-left transition-all hover:border-amber-400/50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
            <ScanLine className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-amber-200">
              Embarquement en cours · {kpis.boardingLoad.route}
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-2 w-48 max-w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(kpis.boardingLoad.boarded / kpis.boardingLoad.capacity) * 100}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400"
                />
              </div>
              <span className="num text-[12px] font-bold text-amber-200">
                {kpis.boardingLoad.boarded}/{kpis.boardingLoad.capacity} embarqués
              </span>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-amber-300" />
        </motion.button>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Wallet} label="Recettes du jour" value={fcfa(kpis.salesToday.amount)} sub={`${kpis.salesToday.count} billets confirmés`} delay={0} />
        <KpiCard icon={Globe} label="Ventes web" value={fcfa(kpis.web.amount)} sub={`${kpis.web.count} réservations · Mobile Money`} delay={0.05} />
        <KpiCard icon={Store} label="Ventes guichet" value={fcfa(kpis.guichet.amount)} sub={`${kpis.guichet.count} ventes espèces`} delay={0.1} />
        <KpiCard
          icon={kpis.pending.count > 0 ? Hourglass : Bus}
          label="Paiements à suivre"
          value={String(kpis.pending.count)}
          sub={kpis.pending.count > 0 ? "en attente / inconnus / échecs" : "rien à réconcilier"}
          tone={kpis.pending.count > 0 ? "amber" : "neutral"}
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* Graphique 14 jours */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Recettes confirmées — 14 jours</h2>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><CompanyDot color="#2fbf7f" size={7} /> Web</span>
              <span className="flex items-center gap-1.5"><CompanyDot color="#e8a33d" size={7} /> Guichet</span>
            </div>
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gWeb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2fbf7f" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#2fbf7f" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gGui" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8a33d" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#e8a33d" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9d947c", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#9d947c", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fcfaShort(v)} width={44} />
                <ReTooltip
                  cursor={{ stroke: "#ffffff15" }}
                  contentStyle={{ background: "#241f16", border: "1px solid #ffffff18", borderRadius: 12, fontSize: 12, color: "#ece5d3" }}
                  formatter={(v: number, name: string) => [fcfa(v), name === "web" ? "Web" : "Guichet"]}
                />
                <Area type="monotone" dataKey="guichet" stackId="1" stroke="#e8a33d" strokeWidth={2} fill="url(#gGui)" />
                <Area type="monotone" dataKey="web" stackId="1" stroke="#2fbf7f" strokeWidth={2} fill="url(#gWeb)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Paiements à suivre */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Rapprochement paiement</h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-300">
              {pendingPayments.length} dossiers
            </span>
          </div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto thin-scroll pr-1">
            {pendingPayments.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">
                Aucun paiement en attente, inconnu ou échoué. Intégrité propre.
              </p>
            )}
            {pendingPayments.map((p) => (
              <div key={p.providerRef} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <TriangleAlert className={cn("h-4 w-4 shrink-0", p.status === "INCONNU" ? "text-red-400" : "text-amber-400")} />
                <div className="min-w-0 flex-1">
                  <p className="num truncate text-[12px] font-semibold">{p.providerRef}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">
                    {p.passenger} · {p.route} · {fmtTime(p.departsAt)}
                  </p>
                </div>
                <StatusPill map={PAYMENT_STATUS} status={p.status} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            Aucune nouvelle charge automatique sur état inconnu : interrogation fournisseur puis décision humaine (§3.3).
          </p>
        </div>
      </div>

      {/* Tableau des départs */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-[14px] font-semibold">Tableau des départs — aujourd&apos;hui</h2>
          <Button variant="ghost" size="sm" onClick={() => setAgencyTab("departures")} className="cursor-pointer gap-1 text-emerald-300 hover:text-emerald-200">
            Gérer les départs <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="board-row w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-bold sm:px-5">Heure</th>
                <th className="px-3 py-2.5 font-bold">Ligne</th>
                <th className="px-3 py-2.5 font-bold">Véhicule</th>
                <th className="px-3 py-2.5 font-bold">État</th>
                <th className="px-3 py-2.5 font-bold">Remplissage</th>
                <th className="px-3 py-2.5 text-right font-bold sm:px-5">Recette</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b, i) => {
                const meta = statusMeta(DEPARTURE_STATUS, b.status);
                const tones = toneClasses(meta.tone);
                return (
                  <motion.tr
                    key={b.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="group border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-4 py-2.5 font-semibold sm:px-5">
                      <span className={cn(b.delayMin ? "text-amber-300" : "")}>{fmtTime(b.time)}</span>
                      {b.delayMin && <span className="ml-1.5 text-[10px] text-amber-400/80">+{b.delayMin}&apos;</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-foreground">{b.route}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{b.code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{b.vehicle}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", tones.pill)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", tones.dot)} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/8">
                          <div
                            className={cn("h-full rounded-full", b.occupancy >= 85 ? "bg-emerald-400" : b.occupancy >= 50 ? "bg-amber-400" : "bg-stone-500")}
                            style={{ width: `${b.occupancy}%` }}
                          />
                        </div>
                        <span className="text-[10.5px] text-muted-foreground">
                          {b.confirmed}/{b.capacity}{b.boarded > 0 && <span className="text-emerald-400"> · {b.boarded} à bord</span>}
                        </span>
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold sm:px-5">{fcfa(b.revenue)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal d'audit */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <ScrollText className="h-4 w-4 text-muted-foreground" /> Journal d&apos;audit (extrait)
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setAgencyTab("audit")} className="cursor-pointer gap-1 text-emerald-300 hover:text-emerald-200">
            Tout voir <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-3 space-y-1">
          {audit.slice(0, 8).map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[11.5px] transition-colors hover:bg-secondary/40">
              <span className="num w-16 shrink-0 text-muted-foreground">{relTime(a.at)}</span>
              <span className="w-40 shrink-0 truncate font-semibold" title={a.actor}>{a.actor}</span>
              <span className="flex-1 truncate text-muted-foreground" title={a.detail ?? ""}>
                {ACTION_LABEL[a.action] ?? a.action} <span className="text-foreground/70">· {a.entityId?.slice(0, 14)}</span>
              </span>
              <span className={cn(
                "hidden shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide sm:inline",
                a.action.includes("CONFIRM") || a.action.includes("OK") || a.action.includes("PUBLIE")
                  ? "bg-emerald-500/10 text-emerald-300" : a.action.includes("ECHEC") || a.action.includes("REFUSED") || a.action.includes("ANNULE")
                    ? "bg-red-500/10 text-red-300" : "bg-white/5 text-stone-400"
              )}>
                {a.entity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
