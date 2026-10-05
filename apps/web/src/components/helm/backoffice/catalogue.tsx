"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useApi } from "./use-api";
import { duration } from "@travelhelm/shared";
import { SEAT_KIND_LABEL } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Loader2, MapPin, Route as RouteIcon, Bus, ChevronRight, TriangleAlert,
  Armchair, Eye, EyeOff, LayoutGrid,
} from "lucide-react";

// ————— types —————
interface Station { id: string; city: string; name: string; kind: string; isPrimary: boolean }
interface Stop { id: string; city: string; station: string; seq: number; offsetMin: number }
interface RouteRow { id: string; code: string; originCity: string; destCity: string; label: string; distanceKm: number; durationMin: number; boardingPoint: string; dropOffPoint: string | null; stops: Stop[]; _count: { departures: number } }
interface Seat { id: string; code: string; row: number; col: number; kind: string; window: boolean }
interface VehicleRow { id: string; label: string; model: string; plate: string; seatLayout: string; capacity: number; seatSelectionEnabled: boolean; amenities: string | null; seats: Seat[]; _count: { departures: number } }

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

type Section = "stations" | "routes" | "vehicles";

export function Catalogue() {
  const [section, setSection] = useState<Section>("stations");
  const [busy, setBusy] = useState(false);
  const [stationDlg, setStationDlg] = useState<{ mode: "create" } | { mode: "edit"; st: Station } | null>(null);
  const [routeDlg, setRouteDlg] = useState<{ mode: "create" } | { mode: "edit"; rt: RouteRow } | null>(null);
  const [vehicleDlg, setVehicleDlg] = useState<{ mode: "create" } | { mode: "edit"; v: VehicleRow } | null>(null);
  const [seatDlg, setSeatDlg] = useState<{ v: VehicleRow } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: Section; id: string; label: string; detail?: string } | null>(null);

  const stations = useApi<{ stations: Station[] }>("/api/helm/backoffice/catalogue/stations");
  const routes = useApi<{ routes: RouteRow[] }>("/api/helm/backoffice/catalogue/routes");
  const vehicles = useApi<{ vehicles: VehicleRow[] }>("/api/helm/backoffice/catalogue/vehicles");
  const reloadAll = () => { stations.reload(true); routes.reload(true); vehicles.reload(true); };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const SECTION_META: Record<Section, { title: string; sub: string; icon: typeof MapPin; create: () => void }> = {
    stations: {
      title: "Gares & arrêts",
      sub: "Points d'embarquement publiés dans l'annuaire voyageur (villes desservies).",
      icon: MapPin,
      create: () => setStationDlg({ mode: "create" }),
    },
    routes: {
      title: "Lignes & arrêts intermédiaires",
      sub: "Corridors commercialisés — code unique par compagnie, séquence d'arrêts horodatée.",
      icon: RouteIcon,
      create: () => setRouteDlg({ mode: "create" }),
    },
    vehicles: {
      title: "Flotte & plans de sièges",
      sub: "TH-INV-04 : la sélection par siège n'est activée qu'après vérification du plan réel.",
      icon: Bus,
      create: () => setVehicleDlg({ mode: "create" }),
    },
  };
  const meta = SECTION_META[section];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Catalogue</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Gares, lignes et véhicules de votre compagnie — CRUD complet, journalisé dans l&apos;audit.</p>
        </div>
        <Button onClick={meta.create} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" /> {section === "stations" ? "Nouvelle gare" : section === "routes" ? "Nouvelle ligne" : "Nouveau véhicule"}
        </Button>
      </div>

      {/* Onglets de section */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {(["stations", "routes", "vehicles"] as Section[]).map((key) => {
          const { title, icon: Icon } = SECTION_META[key];
          const count = key === "stations" ? stations.data?.stations.length : key === "routes" ? routes.data?.routes.length : vehicles.data?.vehicles.length;
          return (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors",
                section === key ? "bg-emerald-500/15 text-emerald-300" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {title}
              {count !== undefined && <span className="num rounded-full bg-white/8 px-1.5 py-0.5 text-[10px]">{count}</span>}
            </button>
          );
        })}
      </div>

      <p className="text-[11.5px] text-muted-foreground">{meta.sub}</p>

      {/* ————— GARES ————— */}
      {section === "stations" && (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {stations.data?.stations.map((st, i) => (
            <motion.div key={st.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className="group rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-foreground/15">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{st.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{st.city}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase", st.kind === "GARE" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                    {st.kind === "GARE" ? "Gare" : "Arrêt"}
                  </span>
                  {st.isPrimary && <span className="text-[9.5px] font-semibold text-muted-foreground">★ ville principale</span>}
                </div>
              </div>
              <div className="mt-3 flex gap-1.5 border-t border-border/60 pt-2.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px]" onClick={() => setStationDlg({ mode: "edit", st })}>
                  <Pencil className="h-3 w-3" /> Modifier
                </Button>
                <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px] text-red-400 hover:text-red-300" onClick={() => setConfirmDelete({ kind: "stations", id: st.id, label: st.name, detail: st.city })}>
                  <Trash2 className="h-3 w-3" /> Supprimer
                </Button>
              </div>
            </motion.div>
          ))}
          {stations.data?.stations.length === 0 && <EmptyRow label="Aucune gare enregistrée" />}
        </div>
      )}

      {/* ————— LIGNES ————— */}
      {section === "routes" && (
        <div className="space-y-2.5">
          {routes.data?.routes.map((rt, i) => (
            <motion.div key={rt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                    {rt.originCity} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> {rt.destCity}
                    <span className="num rounded bg-white/8 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{rt.code}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {duration(rt.durationMin)} · {rt.distanceKm} km · embarquement : {rt.boardingPoint}
                    {rt.dropOffPoint ? ` · dépose : ${rt.dropOffPoint}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="num rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10.5px] font-semibold text-muted-foreground">
                    {rt._count.departures} départ(s)
                  </span>
                  <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px]" onClick={() => setRouteDlg({ mode: "edit", rt })}>
                    <Pencil className="h-3 w-3" /> Modifier
                  </Button>
                  <Button size="sm" variant="outline" disabled={rt._count.departures > 0} title={rt._count.departures > 0 ? "Des départs utilisent cette ligne" : "Supprimer"} className="h-7 cursor-pointer gap-1 text-[10.5px] text-red-400 hover:text-red-300" onClick={() => setConfirmDelete({ kind: "routes", id: rt.id, label: `${rt.code} · ${rt.originCity} → ${rt.destCity}`, detail: rt._count.departures > 0 ? "utilisé par des départs" : undefined })}>
                    <Trash2 className="h-3 w-3" /> Supprimer
                  </Button>
                </div>
              </div>
              {rt.stops.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Arrêts ({rt.stops.length})</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rt.stops.map((s) => (
                      <span key={s.id} className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[10.5px]">
                        <MapPin className="h-3 w-3 text-emerald-400" />
                        {s.city} · {s.station}
                        <span className="num text-muted-foreground">+{s.offsetMin}&apos;</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
          {routes.data?.routes.length === 0 && <EmptyRow label="Aucune ligne créée" />}
        </div>
      )}

      {/* ————— VÉHICULES ————— */}
      {section === "vehicles" && (
        <div className="space-y-2.5">
          {vehicles.data?.vehicles.map((v, i) => {
            const serviceSeats = v.seats.filter((s) => s.kind === "SERVICE").length;
            const vip = v.seats.filter((s) => s.kind === "VIP").length;
            const pmr = v.seats.filter((s) => s.kind === "ACCESSIBLE").length;
            return (
              <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                      <Bus className="h-4 w-4 text-emerald-400" /> {v.label}
                      <span className="num text-[11px] text-muted-foreground">{v.model} · {v.plate}</span>
                      <span className={cn("num rounded px-1.5 py-0.5 text-[10px] font-bold", v.seatSelectionEnabled ? "bg-emerald-500/10 text-emerald-300" : "bg-white/8 text-stone-400")}>
                        {v.seatLayout} · {v.capacity} places
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="num">{v._count.departures} départ(s)</span>
                      {vip > 0 && <span className="num">{vip} VIP</span>}
                      {pmr > 0 && <span>{pmr} PMR</span>}
                      {serviceSeats > 0 && <span className="num">{serviceSeats} service</span>}
                      {v.amenities && <span>· {v.amenities}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold", v.seatSelectionEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                      {v.seatSelectionEnabled ? <><Eye className="h-3 w-3" /> Sièges vérifiés</> : <><EyeOff className="h-3 w-3" /> Vente par capacité</>}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px]" onClick={() => setSeatDlg({ v })}>
                      <LayoutGrid className="h-3 w-3" /> Plan ({v.seats.length})
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 cursor-pointer gap-1 text-[10.5px]" onClick={() => setVehicleDlg({ mode: "edit", v })}>
                      <Pencil className="h-3 w-3" /> Modifier
                    </Button>
                    <Button size="sm" variant="outline" disabled={v._count.departures > 0} className="h-7 cursor-pointer gap-1 text-[10.5px] text-red-400 hover:text-red-300" onClick={() => setConfirmDelete({ kind: "vehicles", id: v.id, label: `${v.label} · ${v.plate}` })}>
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </Button>
                  </div>
                </div>
                {v.seats.length > 0 && <SeatMiniMap seats={v.seats} />}
              </motion.div>
            );
          })}
          {vehicles.data?.vehicles.length === 0 && <EmptyRow label="Aucun véhicule dans la flotte" />}
        </div>
      )}

      {/* ═══════════ DIALOGS ═══════════ */}
      <StationDialog dlg={stationDlg} onClose={() => setStationDlg(null)} busy={busy}
        onSubmit={(payload) => run(async () => {
          if (stationDlg?.mode === "edit") {
            await api(`/api/helm/backoffice/catalogue/stations/${stationDlg.st.id}`, "PATCH", payload);
            toast.success("Gare modifiée");
          } else {
            await api("/api/helm/backoffice/catalogue/stations", "POST", payload);
            toast.success("Gare créée");
          }
          setStationDlg(null);
          stations.reload(true);
        })} />

      <RouteDialog dlg={routeDlg} onClose={() => setRouteDlg(null)} busy={busy}
        onSubmit={(payload) => run(async () => {
          if (routeDlg?.mode === "edit") {
            await api(`/api/helm/backoffice/catalogue/routes/${routeDlg.rt.id}`, "PATCH", payload);
            toast.success("Ligne modifiée");
          } else {
            await api("/api/helm/backoffice/catalogue/routes", "POST", payload);
            toast.success("Ligne créée");
          }
          setRouteDlg(null);
          routes.reload(true);
        })} />

      <VehicleDialog dlg={vehicleDlg} onClose={() => setVehicleDlg(null)} busy={busy}
        onSubmit={(payload) => run(async () => {
          if (vehicleDlg?.mode === "edit") {
            await api(`/api/helm/backoffice/catalogue/vehicles/${vehicleDlg.v.id}`, "PATCH", payload);
            toast.success("Véhicule modifié");
          } else {
            await api("/api/helm/backoffice/catalogue/vehicles", "POST", payload);
            toast.success("Véhicule créé", { description: `${payload.rows} rangées · plan ${payload.seatLayout} généré automatiquement.` });
          }
          setVehicleDlg(null);
          vehicles.reload(true);
        })} />

      <SeatPlanDialog dlg={seatDlg} onClose={() => setSeatDlg(null)} busy={busy}
        onRegenerate={(v, payload) => run(async () => {
          await api(`/api/helm/backoffice/catalogue/vehicles/${v.id}/seats`, "POST", payload);
          toast.success("Plan de sièges régénéré", { description: `${payload.rows} rangées · ${payload.seatLayout}` });
          setSeatDlg(null);
          vehicles.reload(true);
        })} />

      {/* Confirmation de suppression */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-red-400" /> Supprimer « {confirmDelete?.label} »</DialogTitle>
            <DialogDescription>Action définitive, journalisée dans l&apos;audit.{confirmDelete?.detail ? ` ⚠ ${confirmDelete.detail}.` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} className="cursor-pointer">Annuler</Button>
            <Button className="cursor-pointer gap-2 bg-red-600 hover:bg-red-700" disabled={busy}
              onClick={() => run(async () => {
                if (!confirmDelete) return;
                const base = `/api/helm/backoffice/catalogue/${confirmDelete.kind === "stations" ? "stations" : confirmDelete.kind === "routes" ? "routes" : "vehicles"}`;
                await api(`${base}/${confirmDelete.id}`, "DELETE");
                toast.success("Supprimé");
                setConfirmDelete(null);
                reloadAll();
              })}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ————— sous-composants —————
function EmptyRow({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
      <p className="text-[13px] font-semibold">{label}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Créez le premier élément avec le bouton en haut de page.</p>
    </div>
  );
}

function SeatMiniMap({ seats }: { seats: Seat[] }) {
  const rows = [...new Set(seats.map((s) => s.row))].sort((a, b) => a - b);
  return (
    <div className="mt-3 overflow-x-auto border-t border-border/60 pt-3 thin-scroll">
      <div className="inline-flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r} className="flex gap-1">
            {seats.filter((s) => s.row === r).sort((a, b) => a.col - b.col).map((s) => (
              <span key={s.id} title={`${s.code} · ${SEAT_KIND_LABEL[s.kind] ?? s.kind}`}
                className={cn(
                  "num flex h-5 w-8 items-center justify-center rounded text-[8.5px] font-bold",
                  s.kind === "SERVICE" && "bg-stone-700/60 text-stone-400",
                  s.kind === "VIP" && "bg-amber-500/20 text-amber-300 border border-amber-500/40",
                  s.kind === "ACCESSIBLE" && "bg-teal-500/20 text-teal-300 border border-teal-500/40",
                  s.kind === "STANDARD" && "bg-white/6 text-stone-300"
                )}>
                {s.code}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StationDialog({ dlg, onClose, onSubmit, busy }: {
  dlg: { mode: "create" } | { mode: "edit"; st: Station } | null;
  onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void; busy: boolean;
}) {
  return (
    <Dialog open={!!dlg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dlg?.mode === "edit" ? "Modifier la gare" : "Nouvelle gare / arrêt"}</DialogTitle>
          <DialogDescription>Les gares principales apparaissent dans l&apos;annuaire des villes recherchables côté voyageur.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({ city: f.get("city"), name: f.get("name"), kind: f.get("kind"), isPrimary: f.get("isPrimary") === "on" });
        }} className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="st-name">Nom</Label>
            <Input id="st-name" name="name" required defaultValue={dlg?.mode === "edit" ? dlg.st.name : ""} placeholder="Gare de Missèbo" className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="st-city">Ville</Label>
              <Input id="st-city" name="city" required defaultValue={dlg?.mode === "edit" ? dlg.st.city : ""} placeholder="Cotonou" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select name="kind" defaultValue={dlg?.mode === "edit" ? dlg.st.kind : "GARE"}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GARE" className="cursor-pointer">Gare (bâtiment)</SelectItem>
                  <SelectItem value="ARRET" className="cursor-pointer">Arrêt (point de route)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
            <input type="checkbox" name="isPrimary" defaultChecked={dlg?.mode === "edit" ? dlg.st.isPrimary : false} className="h-4 w-4 accent-emerald-500" />
            <span className="text-[12px]">Gare principale de la ville (indexée dans la recherche voyageur)</span>
          </label>
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">Annuler</Button>
            <Button type="submit" disabled={busy} className="cursor-pointer gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RouteDialog({ dlg, onClose, onSubmit, busy }: {
  dlg: { mode: "create" } | { mode: "edit"; rt: RouteRow } | null;
  onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void; busy: boolean;
}) {
  const stops = dlg?.mode === "edit" ? dlg.rt.stops : [];
  const initialStops = stops.map((s) => `${s.city}|${s.station}|${s.offsetMin}`).join("\n");
  return (
    <Dialog open={!!dlg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{dlg?.mode === "edit" ? `Modifier la ligne ${dlg.rt.code}` : "Nouvelle ligne"}</DialogTitle>
          <DialogDescription>Une ligne = un corridor commercial. Le code est unique par compagnie.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const stopsPayload = String(f.get("stops") || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
            const [city, station, offset] = l.split("|").map((x) => x?.trim());
            return { city, station, offsetMin: Number(offset || 0) };
          });
          onSubmit({
            code: f.get("code"), originCity: f.get("originCity"), destCity: f.get("destCity"),
            label: f.get("label") || undefined,
            distanceKm: Number(f.get("distanceKm")), durationMin: Number(f.get("durationMin")),
            boardingPoint: f.get("boardingPoint"), dropOffPoint: f.get("dropOffPoint") || null,
            ...(dlg?.mode === "create" || String(f.get("stops") || "") !== initialStops ? { stops: stopsPayload } : {}),
          });
        }} className="grid gap-4 py-1">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-1.5 sm:col-span-1">
              <Label htmlFor="rt-code">Code</Label>
              <Input id="rt-code" name="code" required defaultValue={dlg?.mode === "edit" ? dlg.rt.code : ""} placeholder="CTN-PKP" className="num h-10 uppercase" />
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="rt-label">Libellé commercial</Label>
              <Input id="rt-label" name="label" defaultValue={dlg?.mode === "edit" ? dlg.rt.label : ""} placeholder="Corridor Cotonou → Parakou" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rt-origin">Ville de départ</Label>
              <Input id="rt-origin" name="originCity" required defaultValue={dlg?.mode === "edit" ? dlg.rt.originCity : ""} placeholder="Cotonou" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rt-dest">Ville d&apos;arrivée</Label>
              <Input id="rt-dest" name="destCity" required defaultValue={dlg?.mode === "edit" ? dlg.rt.destCity : ""} placeholder="Parakou" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rt-km">Distance (km)</Label>
              <Input id="rt-km" name="distanceKm" type="number" min="1" required defaultValue={dlg?.mode === "edit" ? dlg.rt.distanceKm : 100} className="num h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rt-dur">Durée (min)</Label>
              <Input id="rt-dur" name="durationMin" type="number" min="5" step="5" required defaultValue={dlg?.mode === "edit" ? dlg.rt.durationMin : 360} className="num h-10" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="rt-board">Point d&apos;embarquement principal</Label>
              <Input id="rt-board" name="boardingPoint" required defaultValue={dlg?.mode === "edit" ? dlg.rt.boardingPoint : ""} placeholder="Gare de Missèbo" className="h-10" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="rt-drop">Point de dépose (optionnel)</Label>
              <Input id="rt-drop" name="dropOffPoint" defaultValue={dlg?.mode === "edit" ? dlg.rt.dropOffPoint ?? "" : ""} placeholder="Gare centrale de Parakou" className="h-10" />
            </div>
            <div className="grid gap-1.5 sm:col-span-4">
              <Label htmlFor="rt-stops">Arrêts intermédiaires — un par ligne : ville | gare | minutes après l&apos;origine</Label>
              <textarea
                id="rt-stops" name="stops" rows={3}
                defaultValue={dlg?.mode === "edit" ? initialStops : ""}
                placeholder={"Bohicon | Gare de Bohicon | 105\nDassa-Zoumè | Arrêt de Dassa | 165"}
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-[12px] focus:border-emerald-500/50 focus:outline-none"
              />
              <p className="text-[10.5px] text-muted-foreground">Exemple : la ligne gère la consommation de capacité aux arrêts intermédiaires (TH-INV-05).</p>
            </div>
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">Annuler</Button>
            <Button type="submit" disabled={busy} className="cursor-pointer gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VehicleDialog({ dlg, onClose, onSubmit, busy }: {
  dlg: { mode: "create" } | { mode: "edit"; v: VehicleRow } | null;
  onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void; busy: boolean;
}) {
  return (
    <Dialog open={!!dlg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dlg?.mode === "edit" ? `Modifier ${dlg.v.label}` : "Nouveau véhicule"}</DialogTitle>
          <DialogDescription>
            {dlg?.mode === "create"
              ? "Le plan de sièges est généré automatiquement (rangées, VIP, PMR, sièges service) selon la configuration choisie."
              : "La (re)génération du plan se fait depuis la fiche véhicule — impossible après la première vente."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const payload: Record<string, unknown> = {
            label: f.get("label"), model: f.get("model"), plate: f.get("plate"),
            amenities: f.get("amenities") || undefined,
            seatSelectionEnabled: dlg?.mode === "create" ? f.get("seatSelectionEnabled") === "on" : f.get("seatSelectionToggle") === "on",
          };
          if (dlg?.mode === "create") {
            payload.seatLayout = f.get("seatLayout");
            payload.rows = Number(f.get("rows"));
            payload.vipRows = String(f.get("vipRows") || "").split(",").map((x) => Number(x.trim())).filter((n) => !isNaN(n) && n > 0);
          }
          onSubmit(payload);
        }} className="grid gap-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vh-label">Désignation</Label>
              <Input id="vh-label" name="label" required defaultValue={dlg?.mode === "edit" ? dlg.v.label : ""} placeholder="Autocar Zéphyr" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vh-plate">Immatriculation</Label>
              <Input id="vh-plate" name="plate" required defaultValue={dlg?.mode === "edit" ? dlg.v.plate : ""} placeholder="AB-123-CD" className="num h-10 uppercase" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vh-model">Modèle</Label>
              <Input id="vh-model" name="model" required defaultValue={dlg?.mode === "edit" ? dlg.v.model : ""} placeholder="Yutong ZK6122" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vh-amen">Équipements (CSV)</Label>
              <Input id="vh-amen" name="amenities" defaultValue={dlg?.mode === "edit" ? dlg.v.amenities ?? "" : ""} placeholder="climatisation,prises USB,wifi" className="h-10" />
            </div>
            {dlg?.mode === "create" && (
              <>
                <div className="grid gap-1.5">
                  <Label>Plan cabine</Label>
                  <Select name="seatLayout" defaultValue="2-3">
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2-3" className="cursor-pointer">2-3 (grands autocars)</SelectItem>
                      <SelectItem value="2-2" className="cursor-pointer">2-2 (minibus/VIP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="vh-rows">Rangées (4 à 16)</Label>
                  <Input id="vh-rows" name="rows" type="number" min="4" max="16" defaultValue={10} className="num h-10" />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="vh-vip">Rangées VIP (séparées par des virgules, ex. 2,3)</Label>
                  <Input id="vh-vip" name="vipRows" placeholder="2,3" className="num h-10" />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 sm:col-span-2">
                  <input type="checkbox" name="seatSelectionEnabled" className="h-4 w-4 accent-emerald-500" />
                  <span className="text-[12px]">Activer la sélection par siège (TH-INV-04 : plan vérifié sur le véhicule réel)</span>
                </label>
              </>
            )}
            {dlg?.mode === "edit" && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 sm:col-span-2">
                <input type="checkbox" name="seatSelectionToggle" defaultChecked={dlg.v.seatSelectionEnabled} className="h-4 w-4 accent-emerald-500" />
                <span className="text-[12px]">Sélection par siège activée (TH-INV-04 — vente à la place vs vente par capacité)</span>
              </label>
            )}
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">Annuler</Button>
            <Button type="submit" disabled={busy} className="cursor-pointer gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SeatPlanDialog({ dlg, onClose, onRegenerate, busy }: {
  dlg: { v: VehicleRow } | null;
  onClose: () => void; onRegenerate: (v: VehicleRow, payload: Record<string, unknown>) => void; busy: boolean;
}) {
  if (!dlg) return null;
  const { v } = dlg;
  const kindCounts = v.seats.reduce<Record<string, number>>((acc, s) => { acc[s.kind] = (acc[s.kind] ?? 0) + 1; return acc; }, {});
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Armchair className="h-4 w-4 text-emerald-400" /> Plan de sièges — {v.label}</DialogTitle>
          <DialogDescription>
            {v.seats.length} sièges enregistrés · capacité vendable {v.capacity}.
            La régénération est bloquée dès qu&apos;une vente existe sur ce véhicule (inventaire protégé).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(kindCounts).map(([kind, n]) => (
              <span key={kind} className="num rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-semibold">
                {SEAT_KIND_LABEL[kind] ?? kind} : {n}
              </span>
            ))}
          </div>
          <SeatMiniMap seats={v.seats} />
          <form onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onRegenerate(v, {
              seatLayout: f.get("seatLayout"),
              rows: Number(f.get("rows")),
              vipRows: String(f.get("vipRows") || "").split(",").map((x) => Number(x.trim())).filter((n) => !isNaN(n) && n > 0),
            });
          }} className="grid gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
            <p className="text-[11.5px] font-semibold text-amber-300">Régénérer le plan (avant première vente uniquement)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Plan</Label>
                <Select name="seatLayout" defaultValue={v.seatLayout}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2-3" className="cursor-pointer">2-3</SelectItem>
                    <SelectItem value="2-2" className="cursor-pointer">2-2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sp-rows">Rangées</Label>
                <Input id="sp-rows" name="rows" type="number" min="4" max="16" defaultValue={Math.max(4, Math.ceil(v.seats.length / (v.seatLayout === "2-3" ? 5 : 4)))} className="num h-9" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sp-vip">Rangées VIP</Label>
                <Input id="sp-vip" name="vipRows" defaultValue={v.seats.filter((s) => s.kind === "VIP").map((s) => s.row).filter((r, i, a) => a.indexOf(r) === i).join(",") || ""} className="num h-9" />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={busy} className="cursor-pointer gap-2 self-start border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Régénérer le plan
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

