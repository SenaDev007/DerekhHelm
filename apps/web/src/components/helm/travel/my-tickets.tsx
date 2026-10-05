"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useHelm } from "@/store/helm";
import { fcfa, fmtTime, fmtDate } from "@travelhelm/shared";
import { BOOKING_STATUS, statusMeta, toneClasses } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, Search, Armchair, QrCode, Inbox } from "lucide-react";

interface Found {
  reference: string; status: string; channel: string; totalAmount: number;
  passengerName: string; seats: string | null; createdAt: string;
  payment: { status: string | null; method: string };
  ticket: { code: string; status: string } | null;
  departure: { route: string; departsAt: string; status: string; delayMin: number | null; company: string; brandColor: string };
}

export function MyTickets() {
  const { setStep, setActiveTicketCode } = useHelm();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"ref" | "phone">("ref");
  const [rows, setRows] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const v = q.trim();
    if (v.length < 4) {
      toast.error(mode === "ref" ? "Saisissez une référence complète (ex. TH-XXXXXX)." : "Saisissez le numéro de téléphone utilisé lors de l'achat.");
      return;
    }
    setLoading(true);
    try {
      const url = mode === "ref" ? `/api/helm/find?ref=${encodeURIComponent(v)}` : `/api/helm/find?phone=${encodeURIComponent(v)}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRows(d.bookings);
      if (d.found === 0) toast.info("Aucune réservation trouvée pour cette recherche.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-6">
      <Button variant="ghost" size="sm" onClick={() => setStep("search")} className="mb-4 gap-1.5 cursor-pointer -ml-2">
        <ChevronLeft className="h-4 w-4" /> Accueil
      </Button>

      <div className="rounded-[24px] border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Retrouver mes billets</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Aucun compte nécessaire : recherchez par référence (reçue lors de l&apos;achat) ou par numéro de téléphone.
        </p>

        <div className="mt-6 flex rounded-xl border border-border bg-background p-1">
          {(["ref", "phone"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setRows(null); }}
              className={cn(
                "flex-1 cursor-pointer rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors",
                mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "ref" ? "Par référence" : "Par téléphone"}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "ref" ? "TH-XXXXXX" : "+229 01 97 …"}
            className={cn("h-11 flex-1", mode === "ref" && "num uppercase")}
            inputMode={mode === "phone" ? "tel" : "text"}
          />
          <Button type="submit" disabled={loading} className="h-11 cursor-pointer gap-2 px-5">
            <Search className="h-4 w-4" /> {loading ? "…" : "Chercher"}
          </Button>
        </form>

        <div className="mt-6 space-y-2.5">
          {rows === null && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-[13px] text-muted-foreground">Vos réservations apparaîtront ici.</p>
            </div>
          )}

          {rows?.map((b, i) => {
            const meta = statusMeta(BOOKING_STATUS, b.status);
            const tones = toneClasses(meta.tone);
            const departsAt = new Date(b.departure.departsAt);
            return (
              <motion.button
                key={b.reference}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (b.ticket) {
                    setActiveTicketCode(b.ticket.code);
                    setStep("ticket");
                  } else {
                    toast.info("Billet pas encore émis — paiement en attente de confirmation.");
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-primary/40 hover:shadow-[0_10px_24px_-14px_rgba(11,110,71,0.4)]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white" style={{ background: b.departure.brandColor }}>
                  {b.departure.company.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{b.departure.route}</span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    <span className="num">{fmtDate(departsAt)} {fmtTime(departsAt)}</span> · {b.seats ? `sièges ${b.seats}` : "place attribuée"} · {fcfa(b.totalAmount)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold", tones.soft)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", tones.dot)} />
                    {meta.label}
                  </span>
                  {b.ticket && (
                    <span className="flex items-center gap-1 text-[10.5px] font-bold text-primary">
                      <QrCode className="h-3.5 w-3.5" /> {b.ticket.code}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
        <Armchair className="h-3.5 w-3.5" />
        Une capture d&apos;écran du QR ne permet pas deux embarquements : le jeton est invalidé au premier scan.
      </p>
    </section>
  );
}
