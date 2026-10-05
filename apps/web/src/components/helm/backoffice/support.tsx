"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useApi } from "./use-api";
import { useHelm, type SessionUser } from "@/store/helm";
import { relTime } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, LifeBuoy, Loader2, Building2, Route as RouteIcon, Bus, Users, CalendarClock, ShieldAlert } from "lucide-react";

interface SupportCompany {
  id: string; name: string; slug: string; tagline: string | null; brandColor: string;
  holdMinutes: number; contactPhone: string | null; contactEmail: string | null; createdAt: string;
  counts: { routes: number; vehicles: number; staff: number; bookings: number; departuresToday: number; activeDepartures: number };
}

interface SupportAudit {
  logs: { id: string; actor: string; action: string; entity: string; entityId: string; detail: string | null; at: string; company: { name: string; slug: string } | null }[];
}

export function SupportConsole() {
  const { data, reload } = useApi<{ companies: SupportCompany[] }>("/api/helm/backoffice/settings/support/companies", { intervalMs: 30000 });
  const audit = useApi<SupportAudit>("/api/helm/backoffice/settings/support/audit", { intervalMs: 30000 });
  const setSession = useHelm((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);

  async function provision(form: FormData) {
    setBusy(true);
    try {
      const r = await fetch("/api/helm/backoffice/settings/support/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug") || undefined,
          tagline: form.get("tagline") || undefined,
          brandColor: form.get("brandColor") || undefined,
          holdMinutes: Number(form.get("holdMinutes") || 7),
          contactPhone: form.get("contactPhone") || undefined,
          contactEmail: form.get("contactEmail") || undefined,
          gerantEmail: form.get("gerantEmail"),
          gerantName: form.get("gerantName"),
          gerantPassword: form.get("gerantPassword"),
          justification: form.get("justification"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`Compagnie « ${d.company.name} » provisionnée`, { description: `Gérant : ${d.gerant.email} — connexion immédiate possible.` });
      setProvisionOpen(false);
      reload(true);
      audit.reload(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <LifeBuoy className="h-5 w-5 text-amber-400" /> Support Travel Helm
          </h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Console transverse — chaque accès et action est journalisé avec justification (TH-ADM-01/05).</p>
        </div>
        <Button onClick={() => setProvisionOpen(true)} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" /> Provisionner une compagnie
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.companies.map((co, i) => (
          <motion.div key={co.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white" style={{ background: co.brandColor }}>
                {co.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{co.name}</p>
                <p className="num truncate text-[10.5px] text-muted-foreground">{co.slug} · rétention {co.holdMinutes} min</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
              <Stat icon={RouteIcon} label="lignes" value={co.counts.routes} />
              <Stat icon={Bus} label="véhicules" value={co.counts.vehicles} />
              <Stat icon={Users} label="staff" value={co.counts.staff} />
              <Stat icon={CalendarClock} label="ventes" value={co.counts.bookings} />
              <Stat icon={CalendarClock} label="départs du jour" value={co.counts.departuresToday} />
              <Stat icon={ShieldAlert} label="actifs" value={co.counts.activeDepartures} tone={co.counts.activeDepartures > 0 ? "emerald" : "neutral"} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-amber-400" /> Journal global (toutes compagnies)
        </h2>
        <div className="mt-3 space-y-1.5">
          {audit.data?.logs.slice(0, 40).map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[11.5px]">
              <span className="num w-28 shrink-0 text-muted-foreground">{relTime(l.at)}</span>
              {l.company ? (
                <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{l.company.name}</span>
              ) : (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">plateforme</span>
              )}
              <span className="font-semibold text-emerald-300">{l.action}</span>
              <span className="text-muted-foreground">{l.actor} · {l.entity}</span>
              {l.detail && <span className="min-w-0 flex-1 truncate text-muted-foreground/80">· {l.detail}</span>}
            </div>
          ))}
          {audit.data?.logs.length === 0 && <p className="text-[12px] text-muted-foreground">Journal vide.</p>}
        </div>
      </div>

      {/* ————— Dialog : provisioning ————— */}
      <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-400" /> Provisionner une nouvelle compagnie</DialogTitle>
            <DialogDescription>Crée le tenant, son gérant initial et son inventaire vide. Action journalisée avec justification.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); provision(new FormData(e.currentTarget)); }} className="grid gap-4 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pv-name">Nom de la compagnie</Label>
                <Input id="pv-name" name="name" required placeholder="Derekh Trans" className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-slug">Slug (optionnel)</Label>
                <Input id="pv-slug" name="slug" placeholder="derekh-trans" className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-tagline">Slogan</Label>
                <Input id="pv-tagline" name="tagline" placeholder="Le Nord en confiance" className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-hold">Rétention (min)</Label>
                <Input id="pv-hold" name="holdMinutes" type="number" min="1" max="60" defaultValue={7} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-mail">E-mail du gérant</Label>
                <Input id="pv-mail" name="gerantEmail" type="email" required placeholder="gerant@derekhtrans.bj" className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pv-gerant">Nom du gérant</Label>
                <Input id="pv-gerant" name="gerantName" required placeholder="Sètondji Aholou" className="h-10" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pv-pw">Mot de passe initial du gérant (≥ 8 caractères)</Label>
                <Input id="pv-pw" name="gerantPassword" required minLength={8} placeholder="••••••••" className="num h-10" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pv-just">Justification (audit — obligatoire)</Label>
                <Input id="pv-just" name="justification" required placeholder="Contrat signé le … / dossier commercial #…" className="h-10" />
              </div>
            </div>
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" onClick={() => setProvisionOpen(false)} className="cursor-pointer">Annuler</Button>
              <Button type="submit" disabled={busy} className="cursor-pointer gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Provisionner</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Bus; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-2 py-1.5">
      <p className={cn("num text-[15px] font-semibold leading-none", tone === "emerald" ? "text-emerald-300" : "text-foreground")}>{value}</p>
      <p className="mt-1 flex items-center justify-center gap-1 text-[9.5px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</p>
    </div>
  );
}
