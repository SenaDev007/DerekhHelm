"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useApi } from "./use-api";
import { fcfa, fcfaShort, relTime } from "@travelhelm/shared";
import { PAYMENT_STATUS, BOOKING_STATUS, statusMeta, toneClasses } from "@travelhelm/shared";
import { StatusPill } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { BarChart3, Download, Wallet, Globe, Store, Hourglass, RotateCcw, PiggyBank, FileSpreadsheet } from "lucide-react";

interface ReportsData {
  company: { name: string; brandColor: string };
  kpis: { earnedAmount: number; earnedCount: number; webAmount: number; guichetAmount: number; pendingCount: number; refundCount: number; momoFees: number };
  daily: { date: string; label: string; web: number; guichet: number; count: number }[];
  byRoute: { route: string; count: number; amount: number; seats: number; capacity: number }[];
  pending: { reference: string; passenger: string; amount: number; status: string; providerRef: string; method: string; route: string }[];
  refunds: { reference: string; passenger: string; amount: number; status: string; route: string }[];
  rows: { reference: string; createdAt: string; passenger: string; route: string; seats: number; channel: string; method: string; amount: number; paymentStatus: string }[];
  generatedAt: string;
}

export function Reports() {
  const { data } = useApi<ReportsData>(`/api/helm/backoffice/reports`, { intervalMs: 60000 });

  const exportCsv = () => {
    if (!data) return;
    const header = ["Reference", "Date", "Passager", "Ligne", "Places", "Canal", "Methode", "MontantFCFA", "StatutPaiement"];
    const rows = data.rows.map((r) => [
      r.reference, new Date(r.createdAt).toLocaleString("fr-FR"), r.passenger, r.route, String(r.seats), r.channel, r.method, String(r.amount), r.paymentStatus,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travelhelm-rapprochement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV généré", { description: "Recettes acquises uniquement — les en-cours sont exclus (TH-FIN-02)." });
  };

  if (!data) {
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>;
  }

  const { kpis, daily, byRoute, pending, refunds } = data;
  const channelPie = [
    { name: "Web (Mobile Money)", value: kpis.webAmount },
    { name: "Guichet (espèces)", value: kpis.guichetAmount },
  ];
  const PIE_COLORS = ["#2fbf7f", "#e8a33d"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300"><BarChart3 className="h-4.5 w-4.5" /></span>
            Rapports & rapprochement
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            7 jours glissants · recettes acquises séparées des en-cours · généré {relTime(data.generatedAt)}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="cursor-pointer gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Exporter le rapprochement
        </Button>
      </div>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Wallet, label: "Recettes acquises (7 j)", value: fcfa(kpis.earnedAmount), sub: `${kpis.earnedCount} billets confirmés`, tone: "emerald" },
          { icon: Globe, label: "Encaissé web", value: fcfa(kpis.webAmount), sub: "Mobile Money vérifié serveur-à-serveur", tone: "emerald" },
          { icon: Store, label: "Encaissé guichet", value: fcfa(kpis.guichetAmount), sub: "espèces avec agent responsable", tone: "amber" },
          { icon: Hourglass, label: "À réconcilier", value: String(kpis.pendingCount), sub: "en attente / inconnu / échec", tone: kpis.pendingCount ? "amber" : "neutral" },
        ].map(({ icon: Icon, label, value, sub, tone }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-border bg-card p-4">
            <span className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border",
              tone === "emerald" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : tone === "amber" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-white/5 text-stone-300 border-white/10"
            )}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="num mt-1 text-[21px] font-semibold leading-none">{value}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* Histogramme quotidien */}
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-[14px] font-semibold">Ventes confirmées par canal — 7 jours</h2>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#9d947c", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9d947c", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fcfaShort(v)} width={44} />
                <ReTooltip
                  cursor={{ fill: "#ffffff06" }}
                  contentStyle={{ background: "#241f16", border: "1px solid #ffffff18", borderRadius: 12, fontSize: 12, color: "#ece5d3" }}
                  formatter={(v: number, name: string) => [fcfa(v), name === "web" ? "Web" : "Guichet"]}
                />
                <Bar dataKey="web" stackId="a" fill="#2fbf7f" radius={[0, 0, 0, 0]} maxBarSize={38} />
                <Bar dataKey="guichet" stackId="a" fill="#e8a33d" radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Répartition canal + frais */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-[14px] font-semibold">Répartition des encaissements</h2>
            <div className="mt-2 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={channelPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={3} strokeWidth={0}>
                    {channelPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <ReTooltip
                    contentStyle={{ background: "#241f16", border: "1px solid #ffffff18", borderRadius: 12, fontSize: 12, color: "#ece5d3" }}
                    formatter={(v: number) => fcfa(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#9d947c" }} iconType="circle" iconSize={7} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-300">
              <PiggyBank className="h-4 w-4" /> Frais Mobile Money (hypothèse pilote)
            </p>
            <p className="num mt-1.5 text-[20px] font-bold text-amber-200">{fcfa(kpis.momoFees)}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-amber-200/70">
              Estimation 1,5 % à confirmer par proposition écrite du prestataire — à ne jamais annoncer comme un tarif acquis (§9.2).
            </p>
          </div>
        </div>
      </div>

      {/* Par ligne */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-[14px] font-semibold">Performance par ligne — 7 jours</h2>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-bold sm:px-5">Ligne</th>
                <th className="px-3 py-2.5 font-bold">Billets</th>
                <th className="px-3 py-2.5 font-bold">Sièges vendus</th>
                <th className="px-3 py-2.5 font-bold text-right">Recette</th>
              </tr>
            </thead>
            <tbody>
              {byRoute.map((r) => (
                <tr key={r.route} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-2.5 font-semibold sm:px-5">{r.route}</td>
                  <td className="num px-3 py-2.5">{r.count}</td>
                  <td className="num px-3 py-2.5">{r.seats}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold">{fcfa(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* En-cours + remboursements */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <Hourglass className="h-4 w-4 text-amber-400" /> Paiements à réconcilier
          </h2>
          <div className="mt-3 space-y-2">
            {pending.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">Aucun écart — registre propre.</p>}
            {pending.map((p) => (
              <div key={p.reference} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <StatusPill map={PAYMENT_STATUS} status={p.status} />
                <div className="min-w-0 flex-1">
                  <p className="num truncate text-[12px] font-semibold">{p.reference} · {p.providerRef}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{p.passenger} · {p.route} · {p.method}</p>
                </div>
                <span className="num text-[12.5px] font-bold text-amber-300">{fcfa(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <RotateCcw className="h-4 w-4 text-violet-400" /> Remboursements en cours
          </h2>
          <div className="mt-3 space-y-2">
            {refunds.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">Aucun remboursement actif.</p>}
            {refunds.map((r) => (
              <div key={r.reference} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <StatusPill map={BOOKING_STATUS} status={r.status} />
                <div className="min-w-0 flex-1">
                  <p className="num truncate text-[12px] font-semibold">{r.reference}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{r.passenger} · {r.route}</p>
                </div>
                <span className="num text-[12.5px] font-bold text-violet-300">{fcfa(r.amount)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            Les remboursements restent traçables et ne sont jamais annoncés « instantanés » : ils suivent les capacités du prestataire (TH-PAY-06).
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Download className="h-3.5 w-3.5" />
        Rapports d&apos;aide opérationnelle à la décision — ne remplacent pas la comptabilité générale ni les obligations fiscales (TH-FIN-04).
      </p>
    </div>
  );
}
