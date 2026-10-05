"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { fcfa, fmtTime, fmtDate, duration } from "@travelhelm/shared";
import { BOOKING_STATUS, PAYMENT_STATUS, TICKET_STATUS, statusMeta, toneClasses } from "@travelhelm/shared";
import { StatusPill } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Armchair, Clock, MapPin, Printer, QrCode, ScanLine, Home, Phone, Bus, TriangleAlert, CheckCircle2, XCircle } from "lucide-react";

interface TicketData {
  code: string;
  status: string;
  scannedAt: string | null;
  scannedBy: string | null;
  booking: {
    reference: string; passengerName: string; seatCodes: string | null; seatCount: number;
    channel: string; totalAmount: number; status: string;
    payment: { provider: string; status: string; providerRef: string } | null;
  };
  departure: {
    company: string; brandColor: string; brandAccent: string; contactPhone: string | null;
    route: string; boardingPoint: string; dropOffPoint: string | null;
    departsAt: string; durationMin: number; status: string; delayMin: number | null;
    checkInNote: string | null; boardingCutoffMin: number; vehicle: string | null;
  };
  qrSvg: string;
}

export function TicketView() {
  const { activeTicketCode, setStep, resetTravel } = useHelm();
  const [data, setData] = useState<TicketData | null>(null);
  const [err, setErr] = useState<string | null>(
    activeTicketCode ? null : "Aucun billet actif — retrouvez-le par référence."
  );

  useEffect(() => {
    if (!activeTicketCode) return;
    fetch(`/api/helm/tickets/${activeTicketCode}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setErr((e as Error).message));
  }, [activeTicketCode]);

  if (err) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <XCircle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold">{err}</h2>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button onClick={() => setStep("mytickets")} className="cursor-pointer">Mes billets</Button>
          <Button variant="outline" onClick={resetTravel} className="cursor-pointer">Accueil</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-muted" />
        <p className="mt-4 text-sm text-muted-foreground">Chargement du billet…</p>
      </div>
    );
  }

  const ticketMeta = statusMeta(TICKET_STATUS, data.status);
  const departsAt = new Date(data.departure.departsAt);
  const arrivesAt = new Date(departsAt.getTime() + data.departure.durationMin * 60000);
  const seats = data.booking.seatCodes?.split(",").filter(Boolean) ?? [];

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 24, rotate: -0.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        {/* Bandeau statut */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {data.status === "VALIDE" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : data.status === "UTILISE" ? <ScanLine className="h-5 w-5 text-teal-600" /> : <TriangleAlert className="h-5 w-5 text-amber-600" />}
            <p className="text-[14px] font-semibold">
              {data.status === "VALIDE" ? "Billet émis et vérifiable" : data.status === "UTILISE" ? `Billet utilisé${data.scannedAt ? ` le ${fmtDate(data.scannedAt)} à ${fmtTime(data.scannedAt)}` : ""}` : `Billet ${ticketMeta.label.toLowerCase()}`}
            </p>
          </div>
          <div className="flex gap-1.5">
            <StatusPill map={TICKET_STATUS} status={data.status} />
            {data.booking.payment && <StatusPill map={PAYMENT_STATUS} status={data.booking.payment.status} />}
          </div>
        </div>

        {/* ————— Carte d'embarquement ————— */}
        <div className="print-ticket ticket-perf relative overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_30px_70px_-30px_rgba(70,55,25,0.45)]" style={{ "--perf-y": "58%" } as React.CSSProperties}>
          {/* Bande marque */}
          <div className="relative px-6 py-5 sm:px-8" style={{ background: `linear-gradient(120deg, ${data.departure.brandColor} 0%, ${data.departure.brandColor}dd 55%, ${data.departure.brandAccent ?? data.departure.brandColor} 130%)` }}>
            <div className="helm-wax absolute inset-x-0 bottom-0 h-2 opacity-40" aria-hidden />
            <div className="flex items-center justify-between">
              <div className="text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">Carte d&apos;embarquement · Boarding pass</p>
                <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{data.departure.company}</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-white backdrop-blur-sm">
                <Bus className="h-4 w-4" />
                <span className="num text-[12px] font-bold">{data.departure.vehicle ?? "Autocar"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_210px]">
            {/* Corps */}
            <div className="border-b border-dashed border-border sm:border-b-0 sm:border-r">
              <div className="px-6 py-5 sm:px-8">
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Départ</p>
                    <p className="num mt-1 text-3xl font-semibold leading-none tracking-tight">{fmtTime(departsAt)}</p>
                    <p className="mt-1.5 text-[12px] font-medium">{data.departure.route.split("→")[0]?.trim()}</p>
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      <span className="h-px flex-1 bg-border" />
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="h-px flex-1 bg-border" />
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    </div>
                    <p className="mt-1 text-center text-[10.5px] text-muted-foreground">{duration(data.departure.durationMin)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Arrivée</p>
                    <p className="num mt-1 text-3xl font-semibold leading-none tracking-tight">{fmtTime(arrivesAt)}</p>
                    <p className="mt-1.5 text-[12px] font-medium">{data.departure.route.split("→")[1]?.trim()}</p>
                  </div>
                </div>

                {data.departure.delayMin && data.departure.delayMin > 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-800">
                    <TriangleAlert className="h-3.5 w-3.5" /> Retard annoncé : +{data.departure.delayMin} min
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-[12px]">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Voyageur</p>
                    <p className="mt-1 text-[14px] font-semibold">{data.booking.passengerName}</p>
                    <p className="num mt-0.5 text-[11px] text-muted-foreground">Rés. {data.booking.reference}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Siège(s)</p>
                    {seats.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {seats.map((s) => (
                          <span key={s} className="num inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-2 py-0.5 text-[12.5px] font-bold text-primary">
                            <Armchair className="h-3.5 w-3.5" /> {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12.5px] font-medium text-muted-foreground">Attribué à l&apos;embarquement</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Embarquement</p>
                    <p className="mt-1 flex items-start gap-1.5 font-medium leading-snug">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {data.departure.boardingPoint}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Présentation</p>
                    <p className="mt-1 font-medium">
                      {fmtTime(new Date(departsAt.getTime() - data.departure.boardingCutoffMin * 60000))}
                      <span className="ml-1.5 text-muted-foreground">({data.departure.boardingCutoffMin} min avant)</span>
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl bg-secondary/50 px-3.5 py-2.5">
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(departsAt, { long: true })} · payé {fcfa(data.booking.totalAmount)}
                  </span>
                  {data.booking.payment && (
                    <span className="text-[11px] font-semibold text-muted-foreground">{data.booking.payment.provider === "CASH" ? "Espèces" : data.booking.payment.provider === "MTN_MOMO" ? "MTN MoMo" : "Moov Money"}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Souche QR */}
            <div className="relative flex flex-col items-center justify-center gap-3 px-5 py-6">
              <div className="rounded-2xl border border-border bg-white p-3 shadow-inner">
                <div className="h-[130px] w-[130px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: data.qrSvg }} aria-label={`QR code du billet ${data.code}`} />
              </div>
              <div className="text-center">
                <p className="num text-[13px] font-bold tracking-wide">{data.code}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Jeton signé — vérifié au quai</p>
              </div>
              <div className="h-1.5 w-24 rounded-full bg-gradient-to-r from-border via-muted-foreground/40 to-border" aria-hidden />
            </div>
          </div>

          <div className="border-t border-border bg-secondary/40 px-6 py-3 text-center sm:px-8">
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              {data.departure.checkInNote} {data.departure.contactPhone && <>· Assistance : <span className="num font-semibold">{data.departure.contactPhone}</span></>}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="no-print mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Button onClick={() => window.print()} variant="outline" className="cursor-pointer gap-2">
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
          <Button onClick={() => setStep("mytickets")} variant="outline" className="cursor-pointer gap-2">
            <QrCode className="h-4 w-4" /> Mes billets
          </Button>
          <Button onClick={resetTravel} className="cursor-pointer gap-2">
            <Home className="h-4 w-4" /> Nouvelle recherche
          </Button>
        </div>

        <div className="no-print mt-5 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[11.5px] leading-relaxed text-emerald-900">
          <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Le QR contient un jeton opaque signé : il ne révèle aucune donnée personnelle en clair et ne peut être réutilisé
          pour un second embarquement. En cas de changement de départ, la compagnie vous notifie par SMS sur le numéro fourni.
        </div>
      </motion.div>
    </section>
  );
}
