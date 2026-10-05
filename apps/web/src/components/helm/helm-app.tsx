"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useHelm } from "@/store/helm";
import { HelmLogo, HelmMark } from "@/components/helm/shared/brand";
import { cn } from "@/lib/utils";
import { Bus, ShieldCheck, RefreshCw, MapPin } from "lucide-react";
import { TravelView } from "@/components/helm/travel/travel-view";
import { AgencyView } from "@/components/helm/backoffice/agency-view";

export function HelmApp() {
  const mode = useHelm((s) => s.mode);
  const setMode = useHelm((s) => s.setMode);

  return (
    <div className={cn("min-h-screen flex flex-col", mode === "agency" && "cockpit")}>
      {mode === "travel" && (
        <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <button onClick={() => useHelm.getState().resetTravel()} className="cursor-pointer" aria-label="Travel Helm — accueil">
              <HelmLogo />
            </button>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground md:flex">
                <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                Bénin · FCFA · Démo pilote
              </div>
              <nav aria-label="Basculer l'espace" className="flex rounded-full border border-border bg-card p-1 shadow-sm">
                {(
                  [
                    { key: "travel", label: "Voyager", icon: Bus },
                    { key: "agency", label: "Espace compagnie", icon: ShieldCheck },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer",
                      mode === key ? "text-[#f4f8f2]" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode === key && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-[#0b6e47] shadow-[0_4px_14px_-4px_rgba(11,110,71,0.6)]"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Icon className="relative h-3.5 w-3.5" />
                    <span className="relative whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>
      )}

      <AnimatePresence mode="wait">
        <motion.main
          key={mode}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col"
        >
          {mode === "travel" ? <TravelView /> : <AgencyView />}
        </motion.main>
      </AnimatePresence>

      {mode === "travel" && (
        <footer className="mt-auto border-t border-border/70 bg-[#f4efe3]">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
              <div>
                <HelmMark size={28} className="text-[#0b6e47]" />
                <p className="mt-3 max-w-md text-[12px] leading-relaxed text-muted-foreground">
                  Travel Helm rapproche le guichet et le web sur un inventaire unique. Les disponibilités affichées
                  reflètent l&apos;état du stock central au moment de la requête — sans &laquo; temps réel &raquo; simulé.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 text-emerald-700" /> Stock central synchronisé</span>
                <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-700" /> Billets QR signés</span>
                <span>Paiements Mobile Money &amp; espèces</span>
                <span>Assistance en gare partenaire</span>
              </div>
            </div>
            <div className="helm-wax mt-7 h-3.5 w-full rounded-full opacity-60" aria-hidden />
            <p className="mt-4 text-[11px] text-muted-foreground/70">
              © 2026 Travel Helm — démonstration produit sur données fictives (compagnies, horaires et tarifs de pilote).
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
