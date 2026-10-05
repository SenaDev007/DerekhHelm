"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { fcfa, fmtDate } from "@travelhelm/shared";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, CalendarDays, ChevronDown, MapPin, Minus, Plus, Search, ShieldCheck, Users, Wifi } from "lucide-react";
import { toast } from "sonner";

interface CityOption { city: string; station: string }

const POPULAR: { from: string; to: string; price: number }[] = [
  { from: "Cotonou", to: "Parakou", price: 11000 },
  { from: "Cotonou", to: "Porto-Novo", price: 2500 },
  { from: "Cotonou", to: "Ouidah", price: 1800 },
  { from: "Cotonou", to: "Djougou", price: 12500 },
  { from: "Parakou", to: "Cotonou", price: 11500 },
];

function CitySelect({ value, onChange, label, exclude, icon: Icon }: { value: string; onChange: (c: string) => void; label: string; exclude?: string; icon: typeof MapPin }) {
  const [open, setOpen] = useState(false);
  const cities = useCities();
  const options = useMemo(() => (cities ?? []).filter((c) => c.city !== exclude), [cities, exclude]);
  const current = cities?.find((c) => c.city === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-secondary/60 sm:px-4"
          aria-label={`${label} — ville ${value}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
            <span className="block truncate text-[15px] font-semibold">{value || "Choisir…"}</span>
            {current && <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{current.station}</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher une ville…" />
          <CommandList className="thin-scroll">
            <CommandEmpty>Aucune ville desservie pour l&apos;instant.</CommandEmpty>
            <CommandGroup heading="Villes et gares partenaires">
              {options.map((c) => (
                <CommandItem
                  key={c.city}
                  value={`${c.city} ${c.station}`}
                  onSelect={() => {
                    onChange(c.city);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span className="font-semibold">{c.city}</span>
                    <span className="text-[11px] text-muted-foreground">{c.station}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

let citiesCache: CityOption[] | null = null;
function useCities() {
  const [cities, setCities] = useState<CityOption[] | null>(citiesCache);
  useEffect(() => {
    if (citiesCache) return;
    fetch("/api/helm/companies")
      .then((r) => r.json())
      .then((d) => {
        citiesCache = d.cities;
        setCities(d.cities);
      })
      .catch(() => toast.error("Impossible de charger les villes desservies"));
  }, []);
  return cities;
}

export function HeroSearch() {
  const { search, setSearch, setStep } = useHelm();
  const [loading, setLoading] = useState(false);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);
  const isToday = search.date === new Date().toISOString().slice(0, 10);

  const swap = () => {
    setSearch({ origin: search.destination, destination: search.origin });
  };

  const launch = () => {
    if (!search.origin || !search.destination || search.origin === search.destination) {
      toast.error("Choisissez deux villes différentes.");
      return;
    }
    setLoading(true);
    setStep("results");
    setTimeout(() => setLoading(false), 600);
  };

  return (
    <section className="helm-hero-glow helm-grain relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:pt-20">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700/25 bg-emerald-700/8 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Billetterie interurbaine · Bénin
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Le bon départ, la bonne place,
            <span className="relative mx-2 inline-block text-emerald-700">
              un billet qui passe au quai
              <svg className="absolute -bottom-1.5 left-0 w-full" viewBox="0 0 220 10" preserveAspectRatio="none" aria-hidden>
                <path d="M2 7 Q 60 1 110 5 T 218 4" fill="none" stroke="var(--helm-amber)" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            Départs publiés par les compagnies, places réellement synchronisées entre le guichet et le web,
            paiement Mobile Money et billet QR vérifiable. Sans compte obligatoire.
          </p>
        </motion.div>

        {/* ————— Carte de recherche ————— */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-9 max-w-3xl"
        >
          <div className="rounded-[26px] border border-border bg-card p-2 shadow-[0_24px_60px_-24px_rgba(70,55,25,0.35)]">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-stretch">
              <div className="flex flex-1 items-center gap-1">
                <CitySelect value={search.origin} onChange={(c) => setSearch({ origin: c })} label="Départ" exclude={search.destination} icon={MapPin} />
                <button
                  onClick={swap}
                  aria-label="Inverser départ et arrivée"
                  className="group flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-all hover:rotate-180 hover:border-primary/40 hover:text-primary"
                >
                  <ArrowLeftRight className="h-4 w-4 transition-transform" />
                </button>
                <CitySelect value={search.destination} onChange={(c) => setSearch({ destination: c })} label="Arrivée" exclude={search.origin} icon={MapPin} />
              </div>

              <div className="hidden w-px self-stretch bg-border lg:block" />

              <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 lg:w-auto lg:flex-col lg:items-start lg:gap-1 lg:py-3">
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> Date
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setSearch({ date: new Date().toISOString().slice(0, 10) })}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      isToday ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    Aujourd&apos;hui
                  </button>
                  <button
                    onClick={() => setSearch({ date: tomorrow })}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      search.date === tomorrow ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    Demain
                  </button>
                  <input
                    type="date"
                    value={search.date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setSearch({ date: e.target.value })}
                    aria-label="Choisir une date"
                    className="num w-[128px] cursor-pointer rounded-lg border border-input bg-background px-2 py-1 text-[12px] font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>

              <div className="hidden w-px self-stretch bg-border lg:block" />

              <div className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 lg:w-auto lg:flex-col lg:items-start lg:gap-1.5 lg:py-3">
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Voyageurs
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSearch({ passengers: Math.max(1, search.passengers - 1) })}
                    disabled={search.passengers <= 1}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 disabled:opacity-30"
                    aria-label="Réduire le nombre de voyageurs"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="num w-5 text-center text-[15px] font-bold">{search.passengers}</span>
                  <button
                    onClick={() => setSearch({ passengers: Math.min(4, search.passengers + 1) })}
                    disabled={search.passengers >= 4}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-primary/40 disabled:opacity-30"
                    aria-label="Augmenter le nombre de voyageurs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-1 lg:pl-0">
                <Button
                  onClick={launch}
                  disabled={loading}
                  size="lg"
                  className="h-full w-full cursor-pointer gap-2 rounded-[18px] px-7 text-[15px] font-semibold shadow-[0_10px_26px_-8px_rgba(11,110,71,0.55)] lg:w-auto"
                >
                  <Search className="h-4.5 w-4.5" />
                  {loading ? "Recherche…" : "Rechercher"}
                </Button>
              </div>
            </div>
          </div>

          {/* Routes populaires */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Populaires :</span>
            {POPULAR.map((p) => (
              <button
                key={`${p.from}-${p.to}`}
                onClick={() => {
                  setSearch({ origin: p.from, destination: p.to });
                  setStep("results");
                }}
                className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 text-[12px] font-medium text-foreground/90 transition-all hover:border-amber-400/60 hover:bg-amber-50 hover:shadow-[0_6px_16px_-8px_rgba(180,83,9,0.35)]"
              >
                {p.from} <ArrowLeftRight className="h-3 w-3 text-muted-foreground" /> {p.to}
                <span className="num text-[11px] font-bold text-amber-700">{fcfa(p.price)}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ————— Bandeau confiance ————— */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {[
            { icon: ShieldCheck, title: "Guichet & web, même stock", text: "Une place vendue au comptoir disparaît instantanément en ligne — et inversement." },
            { icon: MapPin, title: "Sièges réellement gérés", text: "Le plan affiché est celui du véhicule affecté, pas un plan générique." },
            { icon: Wifi, title: "Conçu pour réseau lent", text: "Parcours léger, fraîcheur d'inventaire affichée, billet consultable par référence." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border/80 bg-card/60 px-4 py-4 backdrop-blur-sm">
              <Icon className="h-5 w-5 text-emerald-700" />
              <p className="mt-2.5 text-[13px] font-semibold leading-snug">{title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </motion.div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground/80">
          Recherche du <strong className="font-semibold">{fmtDate(search.date, { long: true })}</strong> — les horaires affichés sont ceux publiés par les compagnies partenaires.
        </p>
      </div>
      <div className="helm-wax h-3.5 w-full opacity-70" aria-hidden />
    </section>
  );
}
