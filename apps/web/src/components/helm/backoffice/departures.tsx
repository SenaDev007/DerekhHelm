"use client";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApi } from "./use-api";
import { fcfa, fmtTime, fmtDate, duration, fmtDateISO } from "@travelhelm/shared";
import { DEPARTURE_STATUS, statusMeta, toneClasses } from "@travelhelm/shared";
import { StatusPill } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, Rocket, Clock, Ban, Play, CheckCircle2,
  History, Bus, Loader2, Users, Pencil, Trash2, TriangleAlert,
} from "lucide-react";

interface DeparturesData {
  date: string;
  departures: {
    id: string; departsAt: string; durationMin: number; status: string; delayMin: number | null; reason: string | null;
    basePrice: number; vipSurcharge: number; seatSelection: boolean;
    route: { code: string; originCity: string; destCity: string; boardingPoint: string };
    vehicle: { id: string; label: string; model: string; plate: string; seatLayout: string } | null;
    capacity: number; confirmed: number; occupancy: number; revenue: number;
    stateLogs: { from: string | null; to: string; actor: string; reason: string | null; at: string }[];
  }[];
  routes: { id: string; code: string; originCity: string; destCity: string; durationMin: number }[];
  vehicles: { id: string; label: string; model: string; plate: string; capacity: number; seatSelectionEnabled: boolean }[];
}

const TRANSITIONS: Record<string, { target: string; label: string; icon: typeof Rocket; tone: string }[]> = {
  BROUILLON: [
    { target: "PUBLIE", label: "Publier", icon: Rocket, tone: "emerald" },
    { target: "ANNULE", label: "Annuler", icon: Ban, tone: "red" },
  ],
  PUBLIE: [
    { target: "EMBARQUEMENT", label: "Ouvrir l'embarquement", icon: Users, tone: "amber" },
    { target: "RETARDE", label: "Retarder", icon: Clock, tone: "amber" },
    { target: "ANNULE", label: "Annuler", icon: Ban, tone: "red" },
  ],
  RETARDE: [
    { target: "EMBARQUEMENT", label: "Embarquement", icon: Users, tone: "amber" },
    { target: "EN_COURS", label: "Parti", icon: Play, tone: "teal" },
  ],
  EMBARQUEMENT: [
    { target: "EN_COURS", label: "Départ parti", icon: Play, tone: "teal" },
  ],
  EN_COURS: [
    { target: "TERMINE", label: "Terminer", icon: CheckCircle2, tone: "neutral" },
  ],
};

export function Departures() {
  const [date, setDate] = useState(fmtDateISO(new Date()));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<{ depId: string; target: string; label: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [delayMin, setDelayMin] = useState("30");
  const [busy, setBusy] = useState(false);

  const { data, reload } = useApi<DeparturesData>(`/api/helm/backoffice/departures?date=${date}`, { intervalMs: 25000 });

  const dayShift = (n: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + n);
    setDate(fmtDateISO(d));
  };

  const patch = async (depId: string, target: string, payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/helm/backoffice/departures/${depId}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, ...payload }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error);
        return;
      }
      toast.success(
        target === "PUBLIE" ? "Départ publié — vendable sur tous les canaux." : `Départ → ${statusMeta(DEPARTURE_STATUS, target).label}.`,
        d.notified ? { description: `${d.notified} passager(s) notifié(s) par SMS (journal de livraison à jour).` } : undefined
      );
      setAction(null);
      setReason("");
      reload(true);
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setBusy(false);
    }
  };

  const create = async (form: FormData) => {
    setBusy(true);
    try {
      const r = await fetch("/api/helm/backoffice/departures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: form.get("routeId"),
          vehicleId: form.get("vehicleId") === "none" ? null : form.get("vehicleId"),
          date: form.get("date"),
          time: String(form.get("time")).padStart(5, "0"),
          basePrice: Number(form.get("basePrice")),
          vipSurcharge: Number(form.get("vipSurcharge") || 0),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error);
        return;
      }
      toast.success("Départ créé en brouillon. Publiez-le quand l'affectation est prête.");
      setCreateOpen(false);
      if (form.get("date") === date) reload(true);
    } finally {
      setBusy(false);
    }
  };

  const editDep = async (form: FormData) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/helm/backoffice/departures/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.get("date"),
          time: String(form.get("time")).padStart(5, "0"),
          basePrice: Number(form.get("basePrice")),
          vipSurcharge: Number(form.get("vipSurcharge") || 0),
          boardingCutoffMin: Number(form.get("boardingCutoffMin") || 30),
          checkInNote: String(form.get("checkInNote") || ""),
          reason: String(form.get("reason") || "").trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success("Départ modifié", { description: (d.changes ?? []).join(" · ") });
      setEditId(null);
      reload(true);
    } catch { toast.error("Erreur réseau"); } finally { setBusy(false); }
  };

  const deleteDep = async () => {
    if (!deleteId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/helm/backoffice/departures/${deleteId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success("Brouillon supprimé");
      setDeleteId(null);
      reload(true);
    } catch { toast.error("Erreur réseau"); } finally { setBusy(false); }
  };

  const detail = data?.departures.find((d) => d.id === detailId);
  const editTarget = data?.departures.find((d) => d.id === editId);
  const delTarget = data?.departures.find((d) => d.id === deleteId);
  const isToday = date === fmtDateISO(new Date());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Départs & exploitation</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Cycle BROUILLON → PUBLIÉ → EMBARQUEMENT → EN COURS → TERMINÉ, avec branches d&apos;exception journalisées.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" /> Nouveau départ
        </Button>
      </div>

      {/* Navigation date */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button onClick={() => dayShift(-1)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground" aria-label="Jour précédent"><ChevronLeft className="h-4 w-4" /></button>
          <span className="flex items-center gap-2 px-2 text-[13px] font-semibold capitalize">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
            {fmtDate(date + "T12:00:00", { long: true })}
            {isToday && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">aujourd&apos;hui</span>}
          </span>
          <button onClick={() => dayShift(1)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground" aria-label="Jour suivant"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="num cursor-pointer rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] font-medium focus:border-emerald-500/50 focus:outline-none"
          aria-label="Aller à une date"
        />
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => setDate(fmtDateISO(new Date()))} className="cursor-pointer">Aujourd&apos;hui</Button>
        )}
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {data?.departures.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <Bus className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-[13.5px] font-semibold">Aucun départ planifié ce jour</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Créez-en un en brouillon, affectez un véhicule puis publiez-le.</p>
          </div>
        )}
        {data?.departures.map((d, i) => {
          const meta = statusMeta(DEPARTURE_STATUS, d.status);
          const tones = toneClasses(meta.tone);
          const transitions = TRANSITIONS[d.status] ?? [];
          const expand = detailId === d.id;
          return (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn("rounded-2xl border bg-card transition-colors", expand ? "border-emerald-500/30" : "border-border hover:border-foreground/15")}
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="text-center">
                    <p className={cn("num text-[20px] font-semibold leading-none", d.delayMin ? "text-amber-300" : "")}>{fmtTime(d.departsAt)}</p>
                    <p className="num mt-1 text-[10px] text-muted-foreground">{duration(d.durationMin)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">
                      {d.route.originCity} <ChevronRight className="inline h-3 w-3 text-muted-foreground" /> {d.route.destCity}
                      <span className="num ml-2 text-[10.5px] text-muted-foreground">{d.route.code}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Bus className="h-3.5 w-3.5" />
                      {d.vehicle ? `${d.vehicle.label} · ${d.vehicle.plate}` : "véhicule à affecter"}
                      <span className={cn("num ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold", d.seatSelection ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-stone-400")}>
                        {d.seatSelection ? `${d.capacity} sièges` : `cap. ${d.capacity}`}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:ml-auto">
                  <div className="w-28">
                    <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                      <span>remplissage</span>
                      <span className="num font-semibold text-foreground">{d.confirmed}/{d.capacity}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div className={cn("h-full rounded-full", d.occupancy >= 85 ? "bg-emerald-400" : d.occupancy >= 50 ? "bg-amber-400" : "bg-stone-500")} style={{ width: `${d.occupancy}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="num text-[14px] font-semibold">{fcfa(d.basePrice)}</p>
                    <p className="num text-[10px] text-muted-foreground">recette {fcfa(d.revenue)}</p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold whitespace-nowrap", tones.pill)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", tones.dot)} />
                    {meta.label}
                    {d.delayMin && <span className="num">+{d.delayMin}&apos;</span>}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 sm:border-l sm:pl-4 sm:pt-0">
                  {transitions.map(({ target, label, icon: Icon, tone }) => (
                    <Button
                      key={target}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (["RETARDE", "ANNULE"].includes(target)) {
                          setAction({ depId: d.id, target, label });
                          setDelayMin("30");
                          setReason("");
                        } else {
                          patch(d.id, target, {});
                        }
                      }}
                      disabled={busy}
                      className={cn(
                        "h-8 cursor-pointer gap-1.5 text-[11px] font-semibold",
                        tone === "emerald" && "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10",
                        tone === "amber" && "border-amber-500/40 text-amber-300 hover:bg-amber-500/10",
                        tone === "red" && "border-red-500/40 text-red-300 hover:bg-red-500/10",
                        tone === "teal" && "border-teal-500/40 text-teal-300 hover:bg-teal-500/10"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </Button>
                  ))}
                  <button
                    onClick={() => { setEditId(d.id); }}
                    disabled={busy || !["BROUILLON", "PUBLIE", "RETARDE"].includes(d.status)}
                    title={["BROUILLON", "PUBLIE", "RETARDE"].includes(d.status) ? "Modifier (prix, heure, véhicule…)" : `Non modifiable en état ${d.status}`}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Modifier le départ"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    disabled={busy || d.status !== "BROUILLON"}
                    title={d.status === "BROUILLON" ? "Supprimer le brouillon" : "Seul un brouillon peut être supprimé (un départ publié s'annule)"}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Supprimer le départ"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDetailId(expand ? null : d.id)}
                    className={cn("ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-colors sm:ml-1", expand ? "border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground hover:text-foreground")}
                    aria-label={expand ? "Masquer l'historique" : "Voir l'historique des états"}
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Détails / journal d'états */}
              <AnimatePresence>
                {expand && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/60">
                    <div className="px-4 py-3.5 sm:px-5">
                      {d.reason && (
                        <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[11.5px] text-amber-300">
                          Motif enregistré : {d.reason}
                        </p>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Historique des états (immuable)</p>
                      <div className="mt-2 space-y-1.5">
                        {d.stateLogs.map((l, idx) => (
                          <div key={idx} className="flex items-center gap-3 text-[11.5px]">
                            <span className="num w-24 shrink-0 text-muted-foreground">{fmtDate(l.at)} {fmtTime(l.at)}</span>
                            <span className="flex items-center gap-1.5 font-medium">
                              {l.from ? statusMeta(DEPARTURE_STATUS, l.from).label : "∅"} <ChevronRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-emerald-300">{statusMeta(DEPARTURE_STATUS, l.to).label}</span>
                            </span>
                            <span className="truncate text-muted-foreground">· {l.actor}{l.reason ? ` · « ${l.reason} »` : ""}</span>
                          </div>
                        ))}
                        {d.stateLogs.length === 0 && <p className="text-[11.5px] text-muted-foreground">Aucun changement enregistré.</p>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* ————— Dialog : raison obligatoire ————— */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action?.label} — raison obligatoire</DialogTitle>
            <DialogDescription>
              Ce changement est journalisé et déclenche l&apos;information des passagers concernés. Une raison explicite est exigée par le cahier des charges (§3.4).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            {action?.target === "RETARDE" && (
              <div className="grid gap-1.5">
                <Label htmlFor="delay">Retard estimé (minutes)</Label>
                <Input id="delay" type="number" min="5" step="5" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} className="num h-10" />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="reason">Motif (visible dans l&apos;audit)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. panne moteur, embarquement prolongé…" className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} className="cursor-pointer">Annuler</Button>
            <Button
              onClick={() => action && patch(action.depId, action.target, { reason: reason.trim(), delayMin: action.target === "RETARDE" ? Number(delayMin) : undefined })}
              disabled={busy || !reason.trim()}
              className={cn("cursor-pointer gap-2", action?.target === "ANNULE" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer {action?.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ————— Dialog : création ————— */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" /> Créer un départ</DialogTitle>
            <DialogDescription>Le départ naît en BROUILLON — invisible à la vente jusqu&apos;à publication.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create(new FormData(e.currentTarget));
            }}
            className="grid gap-4 py-1"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Ligne</Label>
                <Select name="routeId" required defaultValue={data?.routes[0]?.id}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Choisir une ligne" /></SelectTrigger>
                  <SelectContent>
                    {data?.routes.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="cursor-pointer">
                        {r.originCity} → {r.destCity} · {r.code} · {duration(r.durationMin)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Véhicule (plan de sièges vérifié requis pour la sélection)</Label>
                <Select name="vehicleId" defaultValue={data?.vehicles[0]?.id ?? "none"}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data?.vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                        {v.label} · {v.plate} · {v.capacity} places {v.seatSelectionEnabled ? "· sièges" : "· capacité"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dep-date">Date</Label>
                <Input id="dep-date" name="date" type="date" defaultValue={date} required className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dep-time">Heure de départ</Label>
                <Input id="dep-time" name="time" type="time" defaultValue="08:00" required className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dep-price">Prix de base (FCFA)</Label>
                <Input id="dep-price" name="basePrice" type="number" min="500" step="500" defaultValue="12000" required className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dep-vip">Supplément VIP (FCFA)</Label>
                <Input id="dep-vip" name="vipSurcharge" type="number" min="0" step="500" defaultValue="2000" className="num h-10" />
              </div>
            </div>
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="cursor-pointer">Annuler</Button>
              <Button type="submit" disabled={busy} className="cursor-pointer gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer en brouillon
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ————— Dialog : modification ————— */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-emerald-400" /> Modifier le départ</DialogTitle>
            <DialogDescription>
              {editTarget && ["PUBLIE", "RETARDE"].includes(editTarget.status)
                ? "Départ déjà publié : une raison est obligatoire et les passagers sont notifiés si l'heure ou le véhicule changent."
                : "Ajustez prix, horaire, consigne ou heure limite de vente."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); editDep(new FormData(e.currentTarget)); }} className="grid gap-4 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ed-date">Date</Label>
                <Input id="ed-date" name="date" type="date" defaultValue={editTarget ? fmtDateISO(new Date(editTarget.departsAt)) : date} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ed-time">Heure</Label>
                <Input id="ed-time" name="time" type="time" defaultValue={editTarget ? fmtTime(editTarget.departsAt) : "08:00"} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ed-price">Prix de base (FCFA)</Label>
                <Input id="ed-price" name="basePrice" type="number" min="500" step="500" defaultValue={editTarget?.basePrice ?? 12000} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ed-vip">Supplément VIP (FCFA)</Label>
                <Input id="ed-vip" name="vipSurcharge" type="number" min="0" step="500" defaultValue={editTarget?.vipSurcharge ?? 0} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ed-cutoff">Heure limite de vente (min avant départ)</Label>
                <Input id="ed-cutoff" name="boardingCutoffMin" type="number" min="0" max="240" step="5" defaultValue={30} className="num h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ed-note">Consigne d&apos;embarquement</Label>
                <Input id="ed-note" name="checkInNote" defaultValue={editTarget ? "" : ""} placeholder="Quai, contrôle bagage…" className="h-10" />
              </div>
              {editTarget && ["PUBLIE", "RETARDE"].includes(editTarget.status) && (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="ed-reason">Motif de modification (obligatoire — audit)</Label>
                  <Input id="ed-reason" name="reason" placeholder="Ex. ajustement tarifaire validé, changement de quai…" className="h-10" />
                </div>
              )}
            </div>
            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" onClick={() => setEditId(null)} className="cursor-pointer">Annuler</Button>
              <Button type="submit" disabled={busy} className="cursor-pointer gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ————— Dialog : suppression ————— */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-red-400" /> Supprimer le brouillon</DialogTitle>
            <DialogDescription>
              Suppression définitive du départ {delTarget ? `${fmtTime(delTarget.departsAt)} · ${delTarget.route.originCity} → ${delTarget.route.destCity}` : ""}.
              Seul un brouillon sans réservation peut être supprimé ; un départ publié doit être annulé (traçabilité passagers).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="cursor-pointer">Conserver</Button>
            <Button onClick={deleteDep} disabled={busy} className="cursor-pointer gap-2 bg-red-600 hover:bg-red-700">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}