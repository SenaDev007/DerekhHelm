"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useApi } from "./use-api";
import { ROLE_LABEL, ROLE_DESCRIPTION } from "@travelhelm/shared";
import { useHelm } from "@/store/helm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { relTime, initials } from "@travelhelm/shared";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, KeyRound, TriangleAlert, UserCheck, UserX } from "lucide-react";

interface StaffRow {
  id: string; email: string; fullName: string; phone: string | null;
  role: string; roleLabel: string; mfaEnabled: boolean; active: boolean;
  lastLoginAt: string | null; createdAt: string;
}

const ASSIGNABLE_ROLES = ["GERANT", "MANAGER", "GUICHETIER", "FINANCE", "REPARTITEUR", "CONTROLEUR"] as const;

async function api(url: string, method: string, body?: Record<string, unknown>) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
  return d;
}

export function Staff() {
  const { data, reload } = useApi<{ staff: StaffRow[] }>("/api/helm/backoffice/staff");
  const session = useHelm((s) => s.session);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState<{ mode: "create" } | { mode: "edit"; u: StaffRow } | null>(null);
  const [deleteId, setDeleteId] = useState<StaffRow | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Personnel & rôles</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Comptes nominatifs, scrypt pour les mots de passe, rôles cloisonnés (TH-ADM-02/03).</p>
        </div>
        <Button onClick={() => setDlg({ mode: "create" })} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" /> Nouveau compte
        </Button>
      </div>

      <div className="space-y-2.5">
        {data?.staff.map((u, i) => {
          const me = u.id === session?.id;
          return (
            <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className={cn("flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors", u.active ? "border-border hover:border-foreground/15" : "border-red-500/25 opacity-70")}>
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white", u.active ? "bg-emerald-700" : "bg-stone-600")}>
                {initials(u.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[13px] font-semibold">
                  {u.fullName}
                  {me && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">vous</span>}
                  {u.mfaEnabled && <ShieldCheck className="h-3.5 w-3.5 text-amber-400" title="MFA activée" />}
                  {!u.active && <UserX className="h-3.5 w-3.5 text-red-400" />}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
              </div>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-emerald-300">
                {u.roleLabel}
              </span>
              <span className="num hidden w-28 text-right text-[10.5px] text-muted-foreground sm:block">
                {u.lastLoginAt ? `vu ${relTime(u.lastLoginAt)}` : "jamais connecté"}
              </span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px]" onClick={() => setDlg({ mode: "edit", u })}>
                  <Pencil className="h-3 w-3" /> Gérer
                </Button>
                <Button size="sm" variant="outline" disabled={me} title={me ? "Impossible de supprimer votre propre compte" : "Supprimer"} className="h-7 cursor-pointer gap-1 text-[10.5px] text-red-400 hover:text-red-300" onClick={() => setDeleteId(u)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </motion.div>
          );
        })}
        {data?.staff.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
            <p className="text-[13px] font-semibold">Aucun compte</p>
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Rôles disponibles : {ASSIGNABLE_ROLES.map((r) => ROLE_LABEL[r]).join(" · ")}. Le compte SUPPORT (Travel Helm) est
        provisionné séparément par la plateforme. La MFA est appliquée aux comptes privilégiés en production.
      </p>

      {/* ————— Dialog : création / édition ————— */}
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dlg?.mode === "edit" ? <><UserCheck className="h-4 w-4 text-emerald-400" /> Gérer {dlg.u.fullName}</> : <><Plus className="h-4 w-4 text-emerald-400" /> Nouveau compte staff</>}
            </DialogTitle>
            <DialogDescription>
              {dlg?.mode === "edit" ? "Rôle, état, MFA, réinitialisation du mot de passe." : "Le mot de passe est haché (scrypt) — minimum 8 caractères."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const isEdit = dlg?.mode === "edit";
            const payload: Record<string, unknown> = {
              fullName: f.get("fullName"),
              phone: f.get("phone") || undefined,
              role: f.get("role"),
              mfaEnabled: f.get("mfaEnabled") === "on",
            };
            if (isEdit) {
              payload.active = f.get("active") === "on";
              const pw = String(f.get("password") || "");
              if (pw) payload.password = pw;
            } else {
              payload.email = f.get("email");
              payload.password = f.get("password");
            }
            run(async () => {
              if (isEdit) {
                await api(`/api/helm/backoffice/staff/${dlg.u.id}`, "PATCH", payload);
                toast.success("Compte mis à jour");
              } else {
                await api("/api/helm/backoffice/staff", "POST", payload);
                toast.success("Compte créé", { description: `${payload.fullName} · ${ROLE_LABEL[payload.role as keyof typeof ROLE_LABEL]}` });
              }
              setDlg(null);
              reload(true);
            });
          }} className="grid gap-4 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="uf-name">Nom complet</Label>
                <Input id="uf-name" name="fullName" required defaultValue={dlg?.mode === "edit" ? dlg.u.fullName : ""} placeholder="Anicet Sossou" className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="uf-phone">Téléphone</Label>
                <Input id="uf-phone" name="phone" defaultValue={dlg?.mode === "edit" ? dlg.u.phone ?? "" : ""} placeholder="+229 01 95 …" className="num h-10" />
              </div>
              {dlg?.mode === "create" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="uf-email">E-mail (identifiant)</Label>
                  <Input id="uf-email" name="email" type="email" required placeholder="agent@compagnie.bj" className="h-10" />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Rôle</Label>
                <Select name="role" defaultValue={dlg?.mode === "edit" ? dlg.u.role : "GUICHETIER"}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="cursor-pointer" disabled={dlg?.mode === "edit" && dlg.u.id === session?.id && r !== dlg.u.role}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] leading-snug text-muted-foreground">{dlg && ROLE_DESCRIPTION[dlg.mode === "edit" ? dlg.u.role as keyof typeof ROLE_DESCRIPTION : "GUICHETIER"]}</p>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="uf-password">{dlg?.mode === "edit" ? "Nouveau mot de passe (laisser vide pour conserver)" : "Mot de passe initial"}</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="uf-password" name="password" type="text" minLength={dlg?.mode === "edit" ? undefined : 8} required={dlg?.mode !== "edit"} defaultValue="" placeholder="••••••••" className="num h-10 pl-9" />
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                <input type="checkbox" name="mfaEnabled" defaultChecked={dlg?.mode === "edit" ? dlg.u.mfaEnabled : false} className="h-4 w-4 accent-emerald-500" />
                <span className="text-[12px]">MFA exigée (compte privilégié)</span>
              </label>
              {dlg?.mode === "edit" && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                  <input type="checkbox" name="active" defaultChecked={dlg.u.active} disabled={dlg.u.id === session?.id} className="h-4 w-4 accent-emerald-500" />
                  <span className="text-[12px]">Compte actif {dlg.u.id === session?.id && "(verrouillé : votre session)"}</span>
                </label>
              )}
            </div>
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" onClick={() => setDlg(null)} className="cursor-pointer">Annuler</Button>
              <Button type="submit" disabled={busy} className="cursor-pointer gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ————— Dialog : suppression ————— */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-red-400" /> Supprimer le compte de {deleteId?.fullName} ?</DialogTitle>
            <DialogDescription>Préférez la désactivation pour conserver la traçabilité des ventes passées. La suppression est définitive.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="cursor-pointer">Annuler</Button>
            <Button className="cursor-pointer gap-2 bg-red-600 hover:bg-red-700" disabled={busy}
              onClick={() => run(async () => {
                if (!deleteId) return;
                await api(`/api/helm/backoffice/staff/${deleteId.id}`, "DELETE");
                toast.success("Compte supprimé");
                setDeleteId(null);
                reload(true);
              })}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
