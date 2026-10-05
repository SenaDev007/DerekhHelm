"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApi } from "./use-api";
import { SeatMap, type SeatView } from "@/components/helm/shared";
import { fcfa, fmtTime, fmtDate, duration, relTime } from "@travelhelm/shared";
import { BOOKING_STATUS, DEPARTURE_STATUS, statusMeta, toneClasses, CHANNEL_LABEL, METHOD_LABEL } from "@travelhelm/shared";
import { StatusPill } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ScanLine, ScanSearch, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronDown,
  QrCode, RefreshCw, Users, UserCheck, UserX, ListChecks,
} from "lucide-react";

interface ManifestData {
  departure: {
    id: string; route: string; code: string; departsAt: string; durationMin: number; status: string; delayMin: number | null;
    vehicle: { label: string; plate: string; model: string; seatLayout: "2-2" | "2-3" } | null;
    company: { name: string; brandColor: string };
    boardingPoint: string; dropOffPoint: string | null;
  };
  manifest: {
    reference: string; passenger: string; phone: string; seats: string | null;
    status: string; channel: string; amount: number; method: string;
    ticket: { code: string; status: string; scannedAt: string | null; scannedBy: string | null } | null;
    payment: { status: string; providerRef: string | null } | null;
  }[];
  seats: (SeatView & { passenger?: string | null; bookingRef?: string | null; ticketCode?: string | null })[];
  stats: { totalSeats: number; boarded: number; confirmed: number; pending: number };
}

interface ScanResult {
  result: string; code?: string; message?: string; passenger?: string; seats?: string;
  scannedAt?: string; scannedBy?: string; booking?: string;
}

const RESULT_STYLE: Record<string, { tone: string; icon: typeof CheckCircle2; title: string }> = {
  EMBARQUE: { tone: "emerald", icon: CheckCircle2, title: "Embarquement validé" },
  DEJA_EMBARQUE: { tone: "amber", icon: Clock, title: "Billet déjà utilisé" },
  REFUSE: { tone: "red", icon: XCircle, title: "Embarquement refusé" },
  EXAMEN_MANUEL: { tone: "amber", icon: AlertTriangle, title: "Examen manuel requis" },
  INCONNU: { tone: "red", icon: ScanSearch, title: "Billet inconnu" },
};

export function Boarding() {
  const [depList, setDepList] = useState<{ id: string; route: string; time: string; status: string; confirmed: number; capacity: number }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [scans, setScans] = useState<(ScanResult & { at: number })[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Liste des départs embarquables
  useEffect(() => {
    fetch(`/api/helm/backoffice/departures`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.departures ?? [])
          .filter((x: { status: string }) => ["EMBARQUEMENT", "PUBLIE", "RETARDE", "EN_COURS"].includes(x.status))
          .map((x: { id: string; route: { originCity: string; destCity: string }; departsAt: string; status: string; confirmed: number; capacity: number }) => ({
            id: x.id, route: `${x.route.originCity} → ${x.route.destCity}`, time: x.departsAt, status: x.status, confirmed: x.confirmed, capacity: x.capacity,
          }));
        setDepList(list);
        if (list.length > 0 && !selected) {
          const live = list.find((x: { status: string }) => x.status === "EMBARQUEMENT");
          setSelected((live ?? list[0]).id);
        }
      })
      .catch(() => toast.error("Impossible de charger les départs"));
  }, [selected]);

  const { data, reload, updatedAt } = useApi<ManifestData>(selected ? `/api/helm/backoffice/manifest/${selected}` : null, { intervalMs: 6000 });
  const busy = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selected]);

  const scan = async (code?: string) => {
    const value = (code ?? scanInput).trim();
    if (!value || busy.current) return;
    busy.current = true;
    try {
      const r = await fetch("/api/helm/boarding/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: value }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error);
        return;
      }
      setLastScan(d);
      setScans((s) => [{ ...d, at: Date.now() }, ...s].slice(0, 12));
      const style = RESULT_STYLE[d.result];
      if (style?.tone === "emerald") toast.success(`${d.passenger} embarqué${d.seats ? ` — sièges ${d.seats}` : ""}`);
      else if (style?.tone === "red") toast.error(d.message);
      else toast.warning(d.message);
      reload(true);
      setScanInput("");
      inputRef.current?.focus();
    } finally {
      busy.current = false;
    }
  };

  if (!selected && depList.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <ScanLine className="mx-auto h-9 w-9 text-muted-foreground/50" />
        <h2 className="mt-4 text-lg font-semibold">Aucun départ embarquable aujourd&apos;hui</h2>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] text-muted-foreground">
          Ouvrez l&apos;embarquement depuis l&apos;onglet Départs (transition PUBLIÉ → EMBARQUEMENT) pour activer le poste de contrôle.
        </p>
      </div>
    );
  }

  const dep = data?.departure;
  const stats = data?.stats;
  const manifestSeats = (data?.seats ?? []).map((s) => ({ ...s, state: s.state === "BOOKED" ? "BOOKED" : s.state === "BOARDED" ? "BOARDED" : "FREE" }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Poste d&apos;embarquement</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Contrôleur : scan QR signé, manifeste filtrable, double scan impossible (TH-TKT-04/06).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reload(true)} className="cursor-pointer gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> Manifeste {relTime(updatedAt ? new Date(updatedAt) : new Date())}
          </Button>
        </div>
      </div>

      {/* Sélecteur de départ */}
      <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
        {depList.map((d) => {
          const active = d.id === selected;
          const meta = statusMeta(DEPARTURE_STATUS, d.status);
          const tones = toneClasses(meta.tone);
          return (
            <button
              key={d.id}
              onClick={() => { setSelected(d.id); setLastScan(null); setScans([]); }}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                active ? "border-emerald-500/50 bg-emerald-500/10" : "border-border bg-card hover:border-foreground/20"
              )}
            >
              <span className="num text-[16px] font-semibold">{fmtTime(d.time)}</span>
              <span>
                <span className="block text-[12px] font-semibold">{d.route}</span>
                <span className="num text-[10px] text-muted-foreground">{d.confirmed}/{d.capacity} vendus</span>
              </span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[9.5px] font-bold", tones.pill)}>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {dep && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          {/* Colonne gauche : plan + manifeste */}
          <div className="space-y-4">
            {/* En-tête départ */}
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">
                    {dep.route}
                    <span className="num ml-2 text-[11px] text-muted-foreground">{dep.code} · {dep.vehicle?.label} · {dep.vehicle?.plate}</span>
                  </p>
                  <p className="num mt-0.5 text-[12px] text-muted-foreground">
                    {fmtDate(dep.departsAt)} · départ {fmtTime(dep.departsAt)} {dep.delayMin ? <span className="text-amber-300">(+{dep.delayMin} min)</span> : ""} · {duration(dep.durationMin)}
                  </p>
                </div>
                {stats && (
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="num text-[20px] font-semibold leading-none text-emerald-400">{stats.boarded}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">à bord</p>
                    </div>
                    <div className="text-center">
                      <p className="num text-[20px] font-semibold leading-none text-amber-400">{stats.confirmed}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">attendus</p>
                    </div>
                    <div className="text-center">
                      <p className="num text-[20px] font-semibold leading-none text-stone-400">{stats.pending}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">à régler</p>
                    </div>
                  </div>
                )}
              </div>
              {stats && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                    <span>progression de l&apos;embarquement</span>
                    <span className="num font-semibold text-foreground">{Math.round((stats.boarded / Math.max(1, stats.boarded + stats.confirmed)) * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                      animate={{ width: `${(stats.boarded / Math.max(1, stats.boarded + stats.confirmed)) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Plan des sièges */}
            {manifestSeats.length > 0 && dep.vehicle && (
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                    <Users className="h-4 w-4 text-muted-foreground" /> Plan cabine — vue manifeste
                  </h2>
                  <p className="text-[10.5px] text-muted-foreground">Cliquer un siège vendu pour pré-remplir le scan</p>
                </div>
                <SeatMap
                  seats={manifestSeats}
                  layout={dep.vehicle.seatLayout}
                  mode="manifest"
                  selectedIds={[]}
                  maxSelect={0}
                  onToggle={(s) => {
                    const seat = manifestSeats.find((x) => x.code === s.code);
                    if (seat?.ticketCode) {
                      setScanInput(seat.ticketCode);
                      inputRef.current?.focus();
                    }
                  }}
                />
              </div>
            )}

            {/* Manifeste détaillé */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                  <ListChecks className="h-4 w-4 text-muted-foreground" /> Manifeste ({data?.manifest.length ?? 0})
                </h2>
              </div>
              <div className="max-h-80 overflow-y-auto thin-scroll">
                <table className="w-full text-left text-[11.5px]">
                  <thead className="sticky top-0 bg-secondary/50 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-4 py-2 font-bold">Passager</th>
                      <th className="px-2 py-2 font-bold">Sièges</th>
                      <th className="px-2 py-2 font-bold">Billet</th>
                      <th className="px-2 py-2 font-bold">Canal</th>
                      <th className="px-2 py-2 font-bold">Statut</th>
                      <th className="px-3 py-2 text-right font-bold">Scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.manifest.map((m) => (
                      <tr key={m.reference} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                        <td className="px-4 py-2">
                          <p className="font-semibold">{m.passenger}</p>
                          <p className="num text-[10px] text-muted-foreground">{m.phone} · {m.reference}</p>
                        </td>
                        <td className="num px-2 py-2 font-semibold">{m.seats ?? "—"}</td>
                        <td className="num px-2 py-2 text-[10.5px] text-muted-foreground">{m.ticket?.code ?? "—"}</td>
                        <td className="px-2 py-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[9.5px] font-bold", m.channel === "WEB" ? "bg-emerald-500/12 text-emerald-300" : "bg-amber-500/12 text-amber-300")}>
                            {CHANNEL_LABEL[m.channel]}
                          </span>
                        </td>
                        <td className="px-2 py-2"><StatusPill map={BOOKING_STATUS} status={m.status} /></td>
                        <td className="px-3 py-2 text-right">
                          {m.status === "EMBARQUEE" ? (
                            <span className="num inline-flex items-center gap-1 text-[10px] text-emerald-400">
                              <UserCheck className="h-3.5 w-3.5" /> {m.ticket?.scannedAt ? fmtTime(m.ticket.scannedAt) : ""}
                            </span>
                          ) : m.ticket?.status === "VALIDE" ? (
                            <button
                              onClick={() => m.ticket && scan(m.ticket.code)}
                              className="cursor-pointer rounded-lg border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300 transition-colors hover:bg-emerald-500/15"
                            >
                              Simuler scan
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><UserX className="h-3.5 w-3.5" />{m.ticket?.status === "ANNULE" ? "annulé" : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Colonne droite : console de scan */}
          <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <ScanLine className="h-4 w-4 text-amber-400" /> Console de scan
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  scan();
                }}
                className="mt-3 flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                  placeholder="THQ-XXXX-XXXX ou jeton QR"
                  className="num h-11 flex-1 uppercase"
                  autoComplete="off"
                />
                <Button type="submit" className="h-11 cursor-pointer gap-2 px-4 bg-amber-600 hover:bg-amber-500">
                  <QrCode className="h-4.5 w-4.5" /> Balayer
                </Button>
              </form>

              {/* Résultat du dernier scan */}
              <AnimatePresence mode="wait">
                {lastScan && (
                  <motion.div
                    key={JSON.stringify(lastScan) + String(scans[0]?.at)}
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className={cn(
                      "mt-4 rounded-xl border px-4 py-3.5",
                      RESULT_STYLE[lastScan.result]?.tone === "emerald" && "border-emerald-500/40 bg-emerald-500/10",
                      RESULT_STYLE[lastScan.result]?.tone === "amber" && "border-amber-500/40 bg-amber-500/10",
                      RESULT_STYLE[lastScan.result]?.tone === "red" && "border-red-500/40 bg-red-500/10"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      {(() => {
                        const S = RESULT_STYLE[lastScan.result]?.icon ?? ScanSearch;
                        return <S className={cn("h-5 w-5", RESULT_STYLE[lastScan.result]?.tone === "emerald" ? "text-emerald-400" : RESULT_STYLE[lastScan.result]?.tone === "red" ? "text-red-400" : "text-amber-400")} />;
                      })()}
                      <p className="text-[13.5px] font-bold">{RESULT_STYLE[lastScan.result]?.title ?? lastScan.result}</p>
                    </div>
                    <p className="mt-1 text-[12px] text-foreground/80">{lastScan.message}</p>
                    {lastScan.passenger && (
                      <p className="mt-2 text-[11.5px] text-muted-foreground">
                        <strong className="text-foreground">{lastScan.passenger}</strong>
                        {lastScan.seats && <> · sièges <span className="num font-semibold">{lastScan.seats}</span></>}
                        {lastScan.code && <> · <span className="num">{lastScan.code}</span></>}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Historique des scans */}
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Derniers scans ({scans.length})</p>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto thin-scroll pr-1">
                  {scans.length === 0 && <p className="px-1 py-3 text-[11px] text-muted-foreground">Aucun scan sur ce poste pour l&apos;instant.</p>}
                  {scans.map((s, i) => (
                    <motion.div key={s.at + (s.code ?? "") + i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 rounded-lg bg-secondary/40 px-2.5 py-1.5 text-[11px]">
                      <span className="num w-11 shrink-0 text-muted-foreground">{fmtTime(new Date(s.at))}</span>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", RESULT_STYLE[s.result]?.tone === "emerald" ? "bg-emerald-400" : RESULT_STYLE[s.result]?.tone === "red" ? "bg-red-400" : "bg-amber-400")} />
                      <span className="truncate">{s.passenger ?? s.code ?? "—"}</span>
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">{RESULT_STYLE[s.result]?.title}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3.5 text-[10.5px] leading-relaxed text-muted-foreground">
              Le scan vérifie le jeton signé du billet côté serveur : une capture d&apos;écran ne permet pas un second
              embarquement, et un billet annulé après la dernière synchronisation du poste est signalé à l&apos;examen
              manuel (limite documentée §3.2).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
