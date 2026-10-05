"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHelm, type SessionUser } from "@/store/helm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Building2, Palette, Clock3, Phone, Mail } from "lucide-react";

interface CompanyForm {
  name: string; tagline: string; brandColor: string; brandAccent: string;
  description: string; holdMinutes: number; contactPhone: string; contactEmail: string;
}

export function CompanySettings() {
  const session = useHelm((s) => s.session);
  const setSession = useHelm((s) => s.setSession);
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/helm/backoffice/settings/company")
      .then((r) => r.json())
      .then((d) => {
        if (d?.company) {
          const c = d.company;
          setForm({
            name: c.name ?? "", tagline: c.tagline ?? "", brandColor: c.brandColor ?? "#0b6e47",
            brandAccent: c.brandAccent ?? "", description: c.description ?? "",
            holdMinutes: c.holdMinutes ?? 7, contactPhone: c.contactPhone ?? "", contactEmail: c.contactEmail ?? "",
          });
        } else if (d?.error) {
          toast.error(d.error);
        }
      })
      .catch(() => toast.error("Impossible de charger les paramètres"));
  }, []);

  if (!session?.company) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <p className="text-[13.5px] font-semibold">Compte sans compagnie</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Les paramètres de tenant concernent les comptes rattachés à une compagnie.</p>
      </div>
    );
  }
  if (!form) {
    return <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des paramètres…</div>;
  }

  const set = (patch: Partial<CompanyForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/helm/backoffice/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tagline: form.tagline || undefined,
          brandAccent: form.brandAccent || undefined,
          description: form.description || undefined,
          contactPhone: form.contactPhone || undefined,
          contactEmail: form.contactEmail || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Paramètres enregistrés", { description: "Identité visuelle et rétention mises à jour (journalisé)." });
      // rafraîchir la session (couleurs du shell)
      const me = await fetch("/api/helm/auth/me").then((x) => x.json()).catch(() => null);
      if (me?.user) setSession(me.user as SessionUser);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fields: { key: keyof CompanyForm; label: string; icon: typeof Building2; type?: string; hint?: string; placeholder?: string }[] = [
    { key: "name", label: "Nom commercial", icon: Building2, placeholder: "Corridor Express" },
    { key: "tagline", label: "Slogan", icon: Building2, placeholder: "La fiabilité du corridor…" },
    { key: "contactPhone", label: "Téléphone gare", icon: Phone, placeholder: "+229 01 30 …" },
    { key: "contactEmail", label: "E-mail contact", icon: Mail, type: "email", placeholder: "gare@compagnie.bj" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Paramètres de la compagnie</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Identité du tenant, durée de rétention des places, contacts voyageurs. Slug verrouillé : <span className="num font-semibold text-foreground">{session.company.slug}</span></p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><Building2 className="h-4 w-4 text-emerald-400" /> Identité</h2>
          {fields.map(({ key, label, icon: Icon, type, placeholder }) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`cf-${key}`} className="flex items-center gap-1.5 text-[11px]"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}</Label>
              <Input id={`cf-${key}`} type={type ?? "text"} value={String(form[key])} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value } as Partial<CompanyForm>)} className="h-10" />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="cf-desc" className="text-[11px]">Description (annuaire public)</Label>
            <textarea id="cf-desc" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Autocars climatisés, sièges numérotés…"
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-[12.5px] focus:border-emerald-500/50 focus:outline-none" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><Palette className="h-4 w-4 text-amber-400" /> Identité visuelle</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cf-color" className="text-[11px]">Couleur principale</Label>
                <div className="flex items-center gap-2">
                  <input id="cf-color" type="color" value={form.brandColor} onChange={(e) => set({ brandColor: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1" aria-label="Couleur principale" />
                  <Input value={form.brandColor} onChange={(e) => set({ brandColor: e.target.value })} className="num h-10" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cf-accent" className="text-[11px]">Couleur d&apos;accent (optionnel)</Label>
                <div className="flex items-center gap-2">
                  <input id="cf-accent" type="color" value={form.brandAccent || "#e8a33d"} onChange={(e) => set({ brandAccent: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1" aria-label="Couleur d'accent" />
                  <Input value={form.brandAccent} placeholder="#E8A33D" onChange={(e) => set({ brandAccent: e.target.value })} className="num h-10" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: form.brandColor }}>
                {form.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="text-[13px] font-semibold">{form.name || "Nom de la compagnie"}</p>
                <p className="text-[11px] text-muted-foreground">{form.tagline || "Slogan de la compagnie"}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><Clock3 className="h-4 w-4 text-emerald-400" /> Rétention des places (TH-INV-02)</h2>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cf-hold" className="text-[11px]">Durée de rétention à la sélection (minutes)</Label>
                <span className="num rounded-lg border border-border bg-secondary/50 px-2.5 py-1 text-[12px] font-semibold">{form.holdMinutes} min</span>
              </div>
              <input id="cf-hold" type="range" min="1" max="30" value={form.holdMinutes} onChange={(e) => set({ holdMinutes: Number(e.target.value) })} className="cursor-pointer accent-emerald-500" />
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                Temps accordé au voyageur pour finaliser le paiement avant libération automatique de la place dans l&apos;inventaire central.
                Le guichet et le web partagent la même fenêtre.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="mr-auto text-[11px] text-muted-foreground">Toute modification est journalisée (COMPANY_UPDATED) avec votre identité de session.</p>
        <Button onClick={save} disabled={busy} className="cursor-pointer gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}
