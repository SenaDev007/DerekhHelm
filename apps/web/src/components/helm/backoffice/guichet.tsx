"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useApi } from "./use-api";
import { SeatMap, type SeatView } from "@/components/helm/shared";
import { fcfa, fmtTime, fmtDate } from "@travelhelm/shared";
import { DEPARTURE_STATUS, statusMeta } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Store, Banknote, Armchair, Loader2, User, Phone, Radio, QrCode, TriangleAlert, CheckCircle2 } from "lucide-react";

interface DeparturesList {
  departures: {
    id: string; departsAt: string; status: string; delayMin: number | null;
    basePrice: number; vipSurcharge: number; seatSelection: boolean; confirmed: number; capacity: number;
    route: { originCity: string; destCity: string; code: string };
    vehicle: { label: string; plate: string; seatLayout: "2-2" | "2-3" } | null;
  }[];
}

interface DepartureDetail {
  id: string;
  company: { name: string; holdMinutes: number };
  route: { originCity: string; destCity: string };
  vehicle: { label: string; seatLayout: "2-2" | "2-3" } | null;
  departsAt: string;
  basePrice: number;
  vipSurcharge: number;
  seatSelection: boolean;
  seats: SeatView[];
  capacity: number;
  seatsLeft: number;
  serverTime: string;
}

export function Guichet() {
  const { data: list, reload: reloadList } = useApi<DeparturesList>(`/api/helm/backoffice/departures`, { intervalMs: 30000 });
  const [depId, setDepId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DepartureDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<{ reference: string; ticketCode: string; seatCodes: string; amount: number } | null>(null);

  useEffect(() => {
    if (list && list.departures.length > 0 && (!depId || !list.departures.find((d) => d.id === depId))) {
      const sellable = list.departures.find((d) => ["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(d.status) && new Date(d.departsAt).getTime() > Date.now() + 45 * 60000);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sélection d'un défaut dérivé des données reçues
      setDepId((sellable ?? list.departures[0]).id);
    }
  }, [list, depId]);

  useEffect(() => {
    if (!depId) return;
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/helm/departures/${depId}`);
      if (!r.ok || stop) return;
      const d = await r.json();
      if (!stop) setDetail(d);
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [depId]);

  const seats = detail?.seats ?? [];
  const vipCount = seats.filter((s) => selected.includes(s.id) && s.kind === "VIP").length;
  const total = (detail?.seatSelection ? selected.length : 0) * (detail?.basePrice ?? 0) + vipCount * (detail?.vipSurcharge ?? 0);

  const sell = async () => {
    if (!depId || !name.trim() || phone.replace(/\D/g, "").length < 8) {
      toast.error("Nom et téléphone (8 chiffres) du voyageur requis.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/helm/backoffice/guichet-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureId: depId, seatIds: detail?.seatSelection ? selected : [], count: 1,
          passengerName: name, passengerPhone: phone,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error, d.takenSeats ? { description: `Sièges ${d.takenSeats.join(", ")} — le web a vendu pendant que vous prépariez la vente.` } : undefined);
        setSelected([]);
        return;
      }
      setLastSale(d);
      toast.success(`Vente encaissée — réservation ${d.booking.reference}`, { description: `Billet ${d.ticketCode} émis · siège(s) ${d.booking.seatCodes}` });
      setName("");
      setPhone("");
      setSelected([]);
      reloadList(true);
    } finally {
      setBusy(false);
    }
  };

  const sellable = (list?.departures ?? []).filter((d) => ["PUBLIE", "EMBARQUEMENT", "RETARDE"].includes(d.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><Store className="h-4.5 w-4.5" /></span>
            Vente au guichet
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Même stock central que le web : les places prises ici disparaissent instantanément côté voyageurs — et réciproquement.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
          <Radio className="h-3 w-3 sync-dot" /> Inventaire partagé temps réel
        </span>
      </div>

      {lastSale && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-emerald-200">
              Réservation <span className="num">{lastSale.reference}</span> · siège(s) <span className="num">{lastSale.seatCodes}</span> · {fcfa(lastSale.amount)} encaissés
            </p>
            <p className="text-[11px] text-emerald-300/70">Billet imprimable <span className="num font-bold">{lastSale.ticketCode}</span> — remis au voyageur avec le QR.</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300">
            <QrCode className="h-3.5 w-3.5" /> {lastSale.ticketCode}
          </span>
        </motion.div>
      )}

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_320px]">
        {/* 1. Choix du départ */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">1 · Départ vendable</p>
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto thin-scroll pr-1">
            {sellable.map((d) => {
              const active = d.id === depId;
              const meta = statusMeta(DEPARTURE_STATUS, d.status);
              const left = d.capacity - d.confirmed;
              return (
                <button
                  key={d.id}
                  onClick={() => { setDepId(d.id); setSelected([]); setLastSale(null); }}
                  className={cn(
                    "w-full cursor-pointer rounded-xl border px-3.5 py-2.5 text-left transition-all",
                    active ? "border-emerald-500/50 bg-emerald-500/10" : "border-border bg-card hover:border-foreground/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="num text-[15px] font-semibold">{fmtTime(d.departsAt)}</span>
                    <span className={cn("num text-[10px] font-bold", left <= 5 ? "text-red-400" : "text-muted-foreground")}>{left} pl. restantes</span>
                  </div>
                  <p className="mt-0.5 text-[12px] font-medium">{d.route.originCity} → {d.route.destCity}</p>
                  <p className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="num">{d.vehicle?.label ?? "—"} · {fcfa(d.basePrice)}</span>
                    <span className={cn("rounded-full border border-border px-1.5 py-0.5", active ? "text-emerald-300" : "")}>{meta.label}</span>
                  </p>
                </button>
              );
            })}
            {sellable.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">
                Aucun départ vendable (heure limite de vente proche ou départs terminés).
              </p>
            )}
          </div>
        </div>

        {/* 2. Plan des sièges */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">2 · Places — stock central</p>
            {detail && (
              <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="sync-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                sync {fmtTime(detail.serverTime)} · {detail.seatsLeft} libres
              </span>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-5">
            {detail?.seatSelection && detail.vehicle ? (
              <SeatMap
                seats={seats}
                layout={detail.vehicle.seatLayout}
                selectedIds={selected}
                onToggle={(s) => {
                  if (["TAKEN", "HOLD_OTHER", "MINE"].includes(s.state)) return;
                  setSelected((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]));
                }}
                maxSelect={8}
                vipSurcharge={detail.vipSurcharge}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-5 py-12 text-center">
                <Armchair className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-[13px] font-semibold">Vente par capacité</p>
                <p className="mx-auto mt-1.5 max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">
                  Ce départ n&apos;active pas la sélection par siège : le guichet vend sur la capacité restante,
                  la place est attribuée à l&apos;embarquement (TH-INV-05).
                </p>
                {detail && <p className="num mt-3 text-[15px] font-bold text-amber-300">{detail.seatsLeft} / {detail.capacity} places</p>}
              </div>
            )}
          </div>
        </div>

        {/* 3. Encaissement */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">3 · Encaissement espèces</p>
          <div className="space-y-3.5 rounded-2xl border border-border bg-card p-4">
            {depId && detail && (
              <div className="rounded-xl bg-secondary/50 px-3.5 py-3">
                <p className="num text-[11px] font-bold text-amber-300">
                  {detail.route.originCity} → {detail.route.destCity} · {fmtDate(detail.departsAt)} {fmtTime(detail.departsAt)}
                </p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {seats.filter((s) => selected.includes(s.id)).map((s) => s.code).join(", ") || "aucun siège sélectionné"}
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="g-name" className="flex items-center gap-1.5 text-[11px]"><User className="h-3.5 w-3.5" /> Nom du voyageur</Label>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Gildas Tossou" className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="g-phone" className="flex items-center gap-1.5 text-[11px]"><Phone className="h-3.5 w-3.5" /> Téléphone (SMS billet)</Label>
              <Input id="g-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 01 97 …" className="num h-10" inputMode="tel" />
            </div>
            <div className="space-y-1.5 border-t border-border/60 pt-3 text-[12px]">
              <div className="flex justify-between text-muted-foreground">
                <span>{detail?.seatSelection ? selected.length : 0} × trajet</span>
                <span className="num">{fcfa((detail?.seatSelection ? selected.length : 0) * (detail?.basePrice ?? 0))}</span>
              </div>
              {vipCount > 0 && (
                <div className="flex justify-between text-amber-300">
                  <span>{vipCount} × VIP</span>
                  <span className="num">{fcfa(vipCount * (detail?.vipSurcharge ?? 0))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-2 text-[14px] font-bold">
                <span>À encaisser</span>
                <span className="num text-amber-300">{fcfa(total)}</span>
              </div>
            </div>
            <Button
              onClick={sell}
              disabled={busy || (detail?.seatSelection ? selected.length === 0 : false)}
              className="h-11 w-full cursor-pointer gap-2 bg-amber-600 font-semibold hover:bg-amber-500"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Encaisser &amp; émettre le billet
            </Button>
            <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
              Si un siège a été vendu ailleurs pendant la préparation, la transaction est refusée par la contrainte
              d&apos;unicité — aucune vente double possible, même hors ligne au rapprochement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
