"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useHelm, type AgencyTab, type SessionUser } from "@/store/helm";
import { ROLE_TABS, ROLE_LABEL, type Role } from "@travelhelm/shared";
import { cn } from "@/lib/utils";
import { fmtTime } from "@travelhelm/shared";
import { Dashboard } from "./dashboard";
import { Departures } from "./departures";
import { BookingsTable } from "./bookings";
import { Guichet } from "./guichet";
import { Boarding } from "./boarding";
import { Reports } from "./reports";
import { Audit } from "./audit";
import { Catalogue } from "./catalogue";
import { Staff } from "./staff";
import { CompanySettings } from "./settings";
import { SupportConsole } from "./support";
import { Login } from "./login";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HelmMark } from "@/components/helm/shared/brand";
import {
  LayoutDashboard, CalendarClock, BookOpen, Store, ScanLine, BarChart3, ScrollText,
  ChevronDown, ArrowLeft, LogOut, Radio, UserCog, Map, Warehouse, Settings2, LifeBuoy,
} from "lucide-react";

const TABS: { key: AgencyTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "departures", label: "Départs", icon: CalendarClock },
  { key: "catalogue", label: "Catalogue", icon: Map },
  { key: "bookings", label: "Réservations", icon: BookOpen },
  { key: "guichet", label: "Guichet", icon: Store },
  { key: "boarding", label: "Embarquement", icon: ScanLine },
  { key: "reports", label: "Rapports", icon: BarChart3 },
  { key: "staff", label: "Personnel", icon: Warehouse },
  { key: "settings", label: "Paramètres", icon: Settings2 },
  { key: "support", label: "Support TH", icon: LifeBuoy },
  { key: "audit", label: "Journal", icon: ScrollText },
];

export function AgencyView() {
  const { session, setSession, agencyTab, setAgencyTab, setMode } = useHelm();
  const [clock, setClock] = useState(new Date());

  // Session persistée : rechargée au montage (cookie signé)
  useEffect(() => {
    if (session) return;
    fetch("/api/helm/auth/me")
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((d) => {
        if (d?.user) setSession(d.user as SessionUser);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function logout() {
    await fetch("/api/helm/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    toast.info("Session close", { description: "Toutes les vues compagnie sont protégées par connexion." });
  }

  if (!session) {
    return <Login onLoggedIn={(u) => setSession(u)} onBack={() => setMode("travel")} />;
  }

  const role = session.role as Role;
  const allowed = ROLE_TABS[role] ?? ["dashboard"];
  const visibleTabs = TABS.filter((t) => allowed.includes(t.key));
  const company = session.company;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-50 border-b border-border bg-[#18140e]/95 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-3 sm:h-16 sm:gap-4 sm:px-5">
          <button
            onClick={() => setMode("travel")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
            title="Retour à l'espace voyageurs"
            aria-label="Retour à l'espace voyageurs"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-3">
            {company && (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white shadow-lg"
                style={{ background: company.brandColor, boxShadow: `0 6px 18px -8px ${company.brandColor}` }}
              >
                {company.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[14px] font-semibold leading-tight">{company?.name ?? "Travel Helm · Support"}</p>
              <p className="truncate text-[10.5px] text-muted-foreground">{company?.tagline ?? "Console transverse (justification exigée)"}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300 md:flex">
              <Radio className="h-3 w-3 sync-dot" />
              Inventaire central
            </span>
            <span className="num rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold tabular-nums">
              {fmtTime(clock)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-emerald-500/40">
                <UserCog className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden max-w-[170px] truncate sm:inline">{session.fullName}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <p className="text-[12px] font-semibold">{session.fullName}</p>
                  <p className="text-[10.5px] text-muted-foreground">{session.email}</p>
                  <p className="mt-1.5 inline-flex rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-300">
                    {ROLE_LABEL[role] ?? session.role}
                  </p>
                  {session.mfaEnabled && (
                    <p className="mt-1.5 text-[10px] text-amber-400">MFA active sur ce compte</p>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-400 focus:text-red-300">
                  <LogOut className="h-4 w-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Navigation mobile */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5 thin-scroll lg:hidden" aria-label="Sections back-office">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAgencyTab(key)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                agencyTab === key ? "bg-emerald-500/15 text-emerald-300" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 flex-col border-r border-border bg-[#18140e] px-3 py-4 lg:flex">
          <div className="flex items-center gap-2 px-2 pb-3">
            <HelmMark size={26} className="text-emerald-400" />
            <span className="text-[12px] font-semibold tracking-tight text-foreground/90">
              Passerelle <span className="text-emerald-400">Helm</span>
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5" aria-label="Sections back-office">
            {visibleTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setAgencyTab(key)}
                className={cn(
                  "group relative flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                  agencyTab === key ? "text-emerald-300" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {agencyTab === key && (
                  <motion.span layoutId="side-active" className="absolute inset-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </nav>
          <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Environnement</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Démo pilote · données fictives · FCFA
            </p>
          </div>
        </aside>

        {/* Contenu */}
        <main className="helm-hero-glow min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={agencyTab + (session.company?.slug ?? session.email)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="px-3 py-5 sm:px-6 sm:py-7"
            >
              {agencyTab === "dashboard" && allowed.includes("dashboard") && <Dashboard />}
              {agencyTab === "departures" && <Departures />}
              {agencyTab === "catalogue" && <Catalogue />}
              {agencyTab === "bookings" && <BookingsTable />}
              {agencyTab === "guichet" && <Guichet />}
              {agencyTab === "boarding" && <Boarding />}
              {agencyTab === "reports" && <Reports />}
              {agencyTab === "staff" && <Staff />}
              {agencyTab === "settings" && <CompanySettings />}
              {agencyTab === "support" && <SupportConsole />}
              {agencyTab === "audit" && <Audit />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
