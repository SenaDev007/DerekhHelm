"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useHelm } from "@/store/helm";
import { fcfa, fmtTime, fmtDate, relCountdown } from "@travelhelm/shared";
import { METHOD_LABEL } from "@travelhelm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Armchair, ChevronLeft, CreditCard, Loader2, Lock, Smartphone, Banknote,
  RadioTower, ShieldCheck, CircleAlert, CircleCheck, Hourglass, Printer, Home, RefreshCw,
} from "lucide-react";

type Method = "MTN_MOMO" | "MOOV_MONEY" | "AU_GUICHET";

const METHODS: { key: Method; label: string; sub: string; icon: typeof Smartphone; tint: string }[] = [
  { key: "MTN_MOMO", label: "MTN Mobile Money", sub: "Confirmation USSD sur votre téléphone", icon: Smartphone, tint: "border-amber-400/60 bg-amber-50/70 data-[on=true]:border-amber-500 data-[on=true]:bg-amber-100/70" },
  { key: "MOOV_MONEY", label: "Moov Money", sub: "Confirmation USSD sur votre téléphone", icon: Smartphone, tint: "border-sky-400/60 bg-sky-50/70 data-[on=true]:border-sky-500 data-[on=true]:bg-sky-100/70" },
  { key: "AU_GUICHET", label: "Payer au guichet", sub: "Réglez en espèces à la gare avant l'heure limite", icon: Banknote, tint: "border-emerald-500/50 bg-emerald-50/70 data-[on=true]:border-emerald-600 data-[on=true]:bg-emerald-100/60" },
];

export function Checkout() {
  const { hold, bookingDraft, setBookingDraft, setStep, setActiveTicketCode, selectDeparture, resetTravel } = useHelm();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<Method>("MTN_MOMO");
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busyOutcome, setBusyOutcome] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const holdMsLeft = hold ? Math.max(0, hold.expiresAt - now) : 0;
  const holdExpired = !!hold && holdMsLeft <= 0;

  const seatCount = hold?.seats.length ?? hold?.count ?? 0;
  const vipCount = hold?.seats.filter((s) => s.kind === "VIP").length ?? 0;
  const base = hold?.pricing.base ?? 0;
  const vipFee = hold?.pricing.vip ?? 0;
  const tripTotal = seatCount * base + vipCount * vipFee;
  const total = bookingDraft?.totalAmount ?? tripTotal;

  const submit = async () => {
    if (!hold || !hold.departureId) return;
    if (!name.trim() || phone.replace(/\D/g, "").length < 8) {
      toast.error("Nom complet et numéro de téléphone (8 chiffres min.) requis.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/helm/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureId: hold.departureId, holdToken: hold.token,
          passengerName: name, passengerPhone: phone, passengerEmail: email || undefined,
          paymentMethod: method, channel: "WEB",
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error);
        if (String(d.error).includes("expir")) setStep("seats");
        return;
      }
      setBookingDraft({
        reference: d.booking.reference,
        totalAmount: d.booking.totalAmount, amount: d.booking.amount, serviceFee: d.booking.serviceFee,
        seatCodes: d.booking.seatCodes, seatCount: d.booking.seatCount,
        nextStep: d.nextStep,
        payment: d.payment,
        method,
      });
      toast.success(`Réservation ${d.booking.reference} enregistrée — en attente de paiement.`);
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Console fournisseur (démo) : simule le callback serveur-à-serveur signé */
  const simulate = async (outcome: "SUCCES" | "ECHEC" | "INCONNU") => {
    if (!bookingDraft) return;
    setBusyOutcome(outcome);
    try {
      const r = await fetch("/api/helm/payments/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerRef: bookingDraft.payment.providerRef, outcome }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error);
        return;
      }
      if (d.ignored) {
        toast.info(d.ignoredReason, { description: "Idempotence : aucun second billet émis." });
        return;
      }
      if (outcome === "SUCCES" && d.ticketCode) {
        setActiveTicketCode(d.ticketCode);
        toast.success("Paiement confirmé — billet émis.", { description: `Réf. ${d.bookingReference} · billet ${d.ticketCode}` });
        setStep("ticket");
      } else if (outcome === "ECHEC") {
        toast.warning("Paiement refusé par le fournisseur.", { description: "Vos places restent tenues jusqu'à l'expiration de la rétention." });
      } else {
        toast.warning("État INCONNU — dossier à réconcilier.", { description: "Aucune nouvelle charge automatique : l'équipe interroge le fournisseur." });
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setBusyOutcome(null);
    }
  };

  // ——— Écran : réservation créée, paiement en attente ———
  if (bookingDraft && bookingDraft.payment.status === "INITIE" && bookingDraft.method !== "AU_GUICHET") {
    return (
      <section className="mx-auto w-full max-w-2xl px-4 pb-14 sm:px-6">
        <div className="rounded-[24px] border border-border bg-card p-6 shadow-[0_20px_50px_-30px_rgba(70,55,25,0.4)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                <Hourglass className="h-4 w-4" /> Paiement en attente
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Réservation {bookingDraft.reference}</h2>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {bookingDraft.seatCount} place(s) {bookingDraft.seatCodes ? `· sièges ${bookingDraft.seatCodes}` : ""} · {fcfa(bookingDraft.totalAmount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Rétention</p>
              <p className={cn("num mt-1 text-2xl font-bold", holdMsLeft < 60000 ? "text-red-600" : "text-emerald-700")}>
                {holdExpired ? "expirée" : relCountdown(holdMsLeft)}
              </p>
            </div>
          </div>

          {/* Console fournisseur — clairement marquée démo */}
          <div className="mt-6 rounded-2xl border border-dashed border-amber-500/50 bg-amber-50/60 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
              <RadioTower className="h-4 w-4" />
              Console fournisseur — simulation du callback
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-800/90">
              En production, cette étape est une notification signée serveur-à-serveur du prestataire Mobile Money
              (réf. <span className="num font-semibold">{bookingDraft.payment.providerRef}</span> — {METHOD_LABEL[bookingDraft.method]}).
              La réservation n&apos;est jamais confirmée parce qu&apos;un navigateur revient sur une page : uniquement sur preuve vérifiée.
              Cette console démo rejoue ce callback pour tester le pipeline et son idempotence.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button onClick={() => simulate("SUCCES")} disabled={!!busyOutcome || holdExpired}
                className="h-11 cursor-pointer gap-2 bg-emerald-700 hover:bg-emerald-800">
                {busyOutcome === "SUCCES" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
                Confirmer
              </Button>
              <Button onClick={() => simulate("ECHEC")} disabled={!!busyOutcome || holdExpired} variant="outline"
                className="h-11 cursor-pointer gap-2 border-red-300 text-red-700 hover:bg-red-50">
                {busyOutcome === "ECHEC" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleAlert className="h-4 w-4" />}
                Refuser
              </Button>
              <Button onClick={() => simulate("INCONNU")} disabled={!!busyOutcome || holdExpired} variant="outline"
                className="h-11 cursor-pointer gap-2 border-amber-400 text-amber-700 hover:bg-amber-50">
                {busyOutcome === "INCONNU" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hourglass className="h-4 w-4" />}
                Timeout
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] text-amber-800/70">
              Astuce : cliquez deux fois sur « Confirmer » — le second événement est ignoré (idempotence TH-PAY-03).
            </p>
          </div>

          {holdExpired && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3.5 text-[12.5px] text-red-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              La rétention a expiré : les places ont été libérées au stock central. Relancez une sélection pour réserver.
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={() => { setStep("seats"); }} className="cursor-pointer gap-2">
              <ChevronLeft className="h-4 w-4" /> Revenir aux places
            </Button>
            <Button variant="ghost" onClick={() => { resetTravel(); }} className="cursor-pointer gap-2 ml-auto">
              <Home className="h-4 w-4" /> Nouvelle recherche
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // ——— Écran : paiement au guichet ———
  if (bookingDraft && bookingDraft.method === "AU_GUICHET") {
    return (
      <section className="mx-auto w-full max-w-2xl px-4 pb-14 sm:px-6">
        <div className="rounded-[24px] border border-border bg-card p-6 sm:p-8">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            <Banknote className="h-4 w-4" /> À régler au guichet
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Réservation {bookingDraft.reference} enregistrée</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {bookingDraft.seatCount} place(s) {bookingDraft.seatCodes ? `· sièges ${bookingDraft.seatCodes}` : ""} · {fcfa(bookingDraft.totalAmount)} à régler en espèces.
          </p>

          <ol className="mt-6 space-y-3.5">
            {[
              "Présentez la référence de réservation au guichet de la gare indiquée.",
              "Le guichetier encaisse et confirme la vente sur le même inventaire central.",
              "Votre billet QR est émis immédiatement après l'encaissement.",
              "Présentez-vous à l'heure limite de présentation indiquée sur le billet.",
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                <span className="text-[13px] leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button onClick={() => setStep("mytickets")} className="cursor-pointer gap-2">
              <Armchair className="h-4 w-4" /> Voir mes billets
            </Button>
            <Button variant="outline" onClick={resetTravel} className="cursor-pointer gap-2 ml-auto">
              <RefreshCw className="h-4 w-4" /> Nouvelle recherche
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // ——— Écran : formulaire ———
  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-14 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setStep("seats")} className="gap-1.5 cursor-pointer -ml-2">
          <ChevronLeft className="h-4 w-4" /> Places
        </Button>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-3.5 py-1.5">
          <Lock className="h-3.5 w-3.5 text-amber-700" />
          <span className={cn("num text-[13px] font-bold", holdMsLeft < 60000 ? "text-red-600" : "text-amber-800")}>
            {holdExpired ? "Rétention expirée" : relCountdown(holdMsLeft)}
          </span>
        </div>
      </div>

      <div className="rounded-[24px] border border-border bg-card p-6 shadow-[0_20px_50px_-30px_rgba(70,55,25,0.4)] sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight">Vos informations</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Uniquement les données nécessaires au voyage et au billet — pas de compte obligatoire.
        </p>

        <div className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="passenger-name">Nom du voyageur *</Label>
            <Input id="passenger-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Sylvie Adjovi" autoComplete="name" className="h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="passenger-phone">Téléphone (Mobile Money / SMS) *</Label>
              <Input id="passenger-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 01 97 …" inputMode="tel" autoComplete="tel" className="num h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="passenger-email">Courriel (facultatif)</Label>
              <Input id="passenger-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.bj" type="email" className="h-11" />
            </div>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Moyen de paiement</p>
          <div className="mt-3 grid gap-2.5">
            {METHODS.map(({ key, label, sub, icon: Icon, tint }) => (
              <button
                key={key}
                data-on={method === key}
                onClick={() => setMethod(key)}
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-all",
                  method === key ? tint : "border-border bg-background hover:border-primary/35"
                )}
              >
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", method === key ? "bg-white/70 text-primary" : "bg-secondary text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-semibold">{label}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
                </span>
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", method === key ? "border-primary bg-primary" : "border-border")}>
                  {method === key && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Récap */}
        <div className="mt-7 rounded-2xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Récapitulatif</p>
            {hold && <span className="num text-[11px] font-semibold text-emerald-700">Sièges {hold.seats.map((s) => s.code).join(", ") || "capacité"}</span>}
          </div>
          <div className="mt-3 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between text-muted-foreground"><span>{seatCount} × trajet</span><span className="num">{fcfa(seatCount * base)}</span></div>
            {vipCount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>{vipCount} × supplément VIP</span>
                <span className="num">{fcfa(vipCount * vipFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground"><span>Frais de dossier</span><span className="num font-semibold text-emerald-700">0 FCFA</span></div>
            <div className="flex justify-between border-t border-border pt-2 text-[15px] font-bold">
              <span>Total à payer</span>
              <span className="num">{fcfa(bookingDraft?.totalAmount ?? total)}</span>
            </div>
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={submitting || holdExpired}
          className="mt-6 h-13 w-full cursor-pointer gap-2.5 py-3.5 text-[15px] font-semibold shadow-[0_12px_28px_-10px_rgba(11,110,71,0.55)]"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : method === "AU_GUICHET" ? <Banknote className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
          {method === "AU_GUICHET" ? "Enregistrer la réservation" : `Payer ${fcfa(bookingDraft?.totalAmount ?? total)}`}
        </Button>

        {holdExpired && (
          <p className="mt-3 text-center text-[12px] font-semibold text-red-600">
            Rétention expirée — retournez à la sélection des places.
          </p>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
          Le montant est calculé et vérifié côté serveur. Aucun PIN ni OTP n&apos;est collecté par Travel Helm.
        </p>
      </div>
    </section>
  );
}
