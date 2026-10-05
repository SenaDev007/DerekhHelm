"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useApi } from "./use-api";
import { useHelm } from "@/store/helm";
import { fcfa, fmtTime, fmtDate, relTime } from "@travelhelm/shared";
import { BOOKING_STATUS, PAYMENT_STATUS, TICKET_STATUS, DEPARTURE_STATUS, CHANNEL_LABEL, METHOD_LABEL, statusMeta, toneClasses } from "@travelhelm/shared";
import { StatusPill } from "@/components/helm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search, Download, ChevronRight, BookOpen, User, Loader2, Ban, RotateCcw, UserX, TicketCheck,
  StickyNote, QrCode, Scale, History, MessageSquareText,
} from "lucide-react";

interface BookingRow {
  reference: string; status: string; channel: string; createdAt: string; confirmedAt: string | null;
  passengerName: string; passengerPhone: string; seats: string | null; seatCount: number;
  totalAmount: number; paymentMethod: string; agentName: string | null; note: string | null;
  payment: { status: string; providerRef: string | null; failureReason: string | null } | null;
  ticket: { code: string; status: string; scannedAt: string | null } | null;
  departure: { id: string; route: string; departsAt: string; status: string };
}
interface BookingsData { bookings: BookingRow[] }
interface BookingDetail {
  booking: {
    reference: string; status: string; channel: string; createdAt: string; confirmedAt: string | null; canceledAt: string | null;
    passengerName: string; passengerPhone: string; passengerEmail: string | null; seats: string | null; seatCount: number;
    amount: number; serviceFee: number; totalAmount: number; paymentMethod: string; agentName: string | null; note: string | null;
    ticket: { code: string; status: string; scannedAt: string | null; scannedBy: string | null } | null;
    payment: { provider: string; providerRef: string; status: string; amount: number; failureReason: string | null; events: { type: string; outcome: string; ignoredReason: string | null; at: string }[] } | null;
    departure: { id: string; route: string; departsAt: string; status: string; vehicle: string | null };
  };
}

const STATUS_FILTERS = ["TOUS", "CONFIRMEE", "EMBARQUEE", "EN_ATTENTE_PAIEMENT", "A_RECONCILIER", "REMBOURSEMENT_EN_COURS", "ANNULEE", "EXPIREE", "TERMINEE"];
const CHANNEL_FILTERS = ["TOUS", "WEB", "GUICHET"];

type ActionKind = "cancel" | "refund" | "no_show" | "mark_presented" | "note" | "replace_ticket" | "reconcile" | "status_query";

const ACTION_META: Record<ActionKind, { title: string; icon: typeof Ban; tone: string; description: string }> = {
  cancel: { title: "Annuler la réservation", icon: Ban, tone: "red", description: "Les places sont libérées immédiatement dans l'inventaire central. Si le paiement était SUCCÈS, un remboursement est initié." },
  refund: { title: "Rembourser", icon: RotateCcw, tone: "violet", description: "Paiement → REMBOURSÉ, réservation → REMBOURSÉE, billet annulé, places libérées. Notifié au voyageur par SMS." },
  no_show: { title: "Marquer no-show", icon: UserX, tone: "red", description: "Le voyageur ne s'est pas présenté. Le scan de son billet sera refusé (statut NO_SHOW)." },
  mark_presented: { title: "Marquer présentée", icon: TicketCheck, tone: "teal", description: "Check-in au guichet : CONFIRMÉE → PRÉSENTÉE (embarquement imminent)." },
  note: { title: "Ajouter une note", icon: StickyNote, tone: "neutral", description: "Note interne visible par l'équipe (journalisée)." },
  replace_ticket: { title: "Remplacer le billet", icon: QrCode, tone: "amber", description: "L'ancien code passe à REMPLACÉ et un nouveau billet QR signé est émis (perte, litige)." },
  reconcile: { title: "Réconcilier le paiement", icon: Scale, tone: "amber", description: "Décision humaine sur un paiement INCONNU : confirmer le succès ou constater l'échec. Chaque décision est justifiée et journalisée." },
  status_query: { title: "Interroger le fournisseur", icon: History, tone: "emerald", description: "Consultation active du prestataire Mobile Money — aucune relance de charge à l'aveugle (§3.3)." },
};

export function BookingsTable() {
  const session = useHelm((s) => s.session);
  const [status, setStatus] = useState("TOUS");
  const [channel, setChannel] = useState("TOUS");
  const [q, setQ] = useState("");
  const [expand, setExpand] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<{ kind: ActionKind; ref: string; extra?: string } | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"SUCCES" | "ECHEC">("SUCCES");
  const [busy, setBusy] = useState(false);

  const { data, reload } = useApi<BookingsData>(
    `/api/helm/backoffice/bookings?status=${status}&channel=${channel}&q=${encodeURIComponent(q)}`,
    { intervalMs: 30000 }
  );

  const role = session?.role ?? "";
  const canActions = ["GERANT", "MANAGER", "FINANCE"].includes(role);
  const canTickets = ["GERANT", "MANAGER", "GUICHETIER"].includes(role);
  const canFinance = ["GERANT", "FINANCE"].includes(role);

  const exportCsv = () => {
    if (!data) return;
    const header = ["Reference", "Passager", "Telephone", "Ligne", "Depart", "Sieges", "Canal", "Methode", "Montant", "StatutReservation", "StatutPaiement", "Billet", "CreeeLe"];
    const rows = data.bookings.map((b) => [
      b.reference, b.passengerName, b.passengerPhone, b.departure.route, new Date(b.departure.departsAt).toLocaleString("fr-FR"),
      b.seats ?? "", b.channel, b.paymentMethod, String(b.totalAmount), b.status, b.payment?.status ?? "—", b.ticket?.code ?? "—", new Date(b.createdAt).toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `travelhelm-reservations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function openDetail(ref: string) {
    setDetailLoading(true);
    setExpand(expand === ref ? null : ref);
    if (expand === ref) { setDetail(null); setDetailLoading(false); return; }
    try {
      const r = await fetch(`/api/helm/backoffice/bookings/${ref}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d as BookingDetail);
    } catch (e) {
      toast.error((e as Error).message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    try {
      let r: Response;
      if (action.kind === "replace_ticket") {
        r = await fetch(`/api/helm/backoffice/payments/tickets/${action.extra}/replace`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        });
      } else if (action.kind === "reconcile") {
        r = await fetch(`/api/helm/backoffice/payments/${action.extra}/reconcile`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reason: reason.trim() }),
        });
      } else if (action.kind === "status_query") {
        r = await fetch(`/api/helm/backoffice/payments/${action.extra}/status-query`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } else {
        r = await fetch(`/api/helm/backoffice/bookings/${action.ref}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: action.kind, reason: reason.trim() || undefined, note: note.trim() || undefined }),
        });
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(ACTION_META[action.kind].title + " — effectué", {
        description: d.ticketCode ? `Nouveau billet : ${d.ticketCode}` : d.bookingStatus ? `Statut : ${statusMeta(BOOKING_STATUS, d.bookingStatus).label}` : d.providerAnswer ? `Réponse fournisseur : ${d.providerAnswer}` : undefined,
      });
      setAction(null); setReason(""); setNote("");
      reload(true);
      if (expand) openDetail(expand);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsReason = action && ["cancel", "refund", "no_show", "replace_ticket", "reconcile"].includes(action.kind);
  const current = data?.bookings.find((b) => b.reference === expand);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Réservations</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Tous canaux confondus — même inventaire, mêmes règles (TH-OPS-05).</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="cursor-pointer gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence, passager, téléphone…" className="h-10 pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.slice(0, 6).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors",
                status === s ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-border text-muted-foreground hover:text-foreground")}>
              {s === "TOUS" ? "Tous statuts" : statusMeta(BOOKING_STATUS, s).label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {CHANNEL_FILTERS.map((c) => (
            <button key={c} onClick={() => setChannel(c)}
              className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors",
                channel === c ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-border text-muted-foreground hover:text-foreground")}>
              {c === "TOUS" ? "Tous canaux" : CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-2.5 font-bold">Référence</th>
                <th className="px-3 py-2.5 font-bold">Passager</th>
                <th className="px-3 py-2.5 font-bold">Départ</th>
                <th className="px-3 py-2.5 font-bold">Sièges</th>
                <th className="px-3 py-2.5 font-bold">Canal · Paiement</th>
                <th className="px-3 py-2.5 font-bold">Statuts</th>
                <th className="px-3 py-2.5 text-right font-bold">Montant</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data?.bookings.map((b, i) => {
                const actions = availableActions(b, { canActions, canFinance, canTickets });
                return (
                  <motion.tr key={b.reference} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <span className="num font-semibold">{b.reference}</span>
                      <p className="num text-[10px] text-muted-foreground">{relTime(b.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="flex items-center gap-1.5 font-medium"><User className="h-3 w-3 text-muted-foreground" />{b.passengerName}</p>
                      <p className="num mt-0.5 text-[10px] text-muted-foreground">{b.passengerPhone}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{b.departure.route}</p>
                      <p className="num text-[10px] text-muted-foreground">
                        {fmtDate(b.departure.departsAt)} {fmtTime(b.departure.departsAt)} · {statusMeta(DEPARTURE_STATUS, b.departure.status).label}
                      </p>
                    </td>
                    <td className="num px-3 py-2.5 font-medium">{b.seats ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", b.channel === "WEB" ? "bg-emerald-500/12 text-emerald-300" : "bg-amber-500/12 text-amber-300")}>
                        {CHANNEL_LABEL[b.channel]}
                      </span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {METHOD_LABEL[b.paymentMethod] ?? b.paymentMethod}
                        {b.agentName && <span className="block max-w-[140px] truncate" title={b.agentName}>· {b.agentName}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <StatusPill map={BOOKING_STATUS} status={b.status} />
                        {b.payment && b.payment.status !== "SUCCES" && <StatusPill map={PAYMENT_STATUS} status={b.payment.status} />}
                        {b.ticket && b.ticket.status !== "VALIDE" && <StatusPill map={TICKET_STATUS} status={b.ticket.status} />}
                      </div>
                      {b.payment?.failureReason && <p className="mt-1 text-[10px] text-red-300">{b.payment.failureReason}</p>}
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold">{fcfa(b.totalAmount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {actions.slice(0, 2).map((kind) => {
                          const meta = ACTION_META[kind];
                          const Icon = meta.icon;
                          return (
                            <button key={kind} title={meta.title} aria-label={meta.title}
                              onClick={() => { setAction({ kind, ref: b.reference, extra: kind === "replace_ticket" ? b.ticket?.code : b.payment?.providerRef ?? undefined }); setReason(""); setNote(""); setDecision("SUCCES"); }}
                              className={cn("flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition-colors",
                                meta.tone === "red" ? "border-red-500/30 text-red-400 hover:bg-red-500/10" :
                                meta.tone === "amber" ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" :
                                meta.tone === "violet" ? "border-violet-500/30 text-violet-400 hover:bg-violet-500/10" :
                                meta.tone === "teal" ? "border-teal-500/30 text-teal-400 hover:bg-teal-500/10" :
                                "border-border text-muted-foreground hover:text-foreground")}>
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                        <button
                          onClick={() => openDetail(b.reference)}
                          className={cn("ml-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition-colors", expand === b.reference ? "border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground hover:text-foreground")}
                          aria-label="Ouvrir la fiche"
                          title="Fiche complète + historique"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expand === b.reference && "rotate-90")} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data?.bookings.length === 0 && (
          <div className="px-6 py-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-[13px] font-semibold">Aucune réservation pour ces filtres</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {data?.bookings.length ?? 0} entrées affichées (max 120) · canal, terminal et agent journalisés sur chaque action.
      </p>

      {/* ————— Fiche détaillée ————— */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setExpand(null); } }}>
        <DialogContent className="sm:max-w-xl">
          {detailLoading && <div className="flex items-center gap-2 py-6 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la fiche…</div>}
          {detail && (() => {
            const b = detail.booking;
            const actions = availableActions(current ?? {
              reference: b.reference, status: b.status, payment: b.payment ? { status: b.payment.status, providerRef: b.payment.providerRef, failureReason: null } : null,
              ticket: b.ticket ? { code: b.ticket.code, status: b.ticket.status, scannedAt: null } : null,
            } as BookingRow, { canActions, canFinance, canTickets });
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <span className="num">{b.reference}</span>
                    <StatusPill map={BOOKING_STATUS} status={b.status} />
                    <span className="num ml-auto text-[11px] text-muted-foreground">{fcfa(b.totalAmount)}</span>
                  </DialogTitle>
                  <DialogDescription>
                    {b.passengerName} · {b.passengerPhone} · {b.seats ? `sièges ${b.seats}` : `${b.seatCount} place(s)`} · {CHANNEL_LABEL[b.channel]}
                    {b.agentName ? ` · ${b.agentName}` : ""}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 text-[12px]">
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/30 p-3">
                    <Field label="Départ" value={`${new Date(b.departure.departsAt).toLocaleString("fr-FR")} · ${b.departure.route}`} />
                    <Field label="Véhicule" value={b.departure.vehicle ?? "—"} />
                    <Field label="Billet" value={b.ticket ? `${b.ticket.code} · ${statusMeta(TICKET_STATUS, b.ticket.status).label}` : "—"} />
                    <Field label="Paiement" value={b.payment ? `${b.payment.provider} · ${statusMeta(PAYMENT_STATUS, b.payment.status).label}` : "—"} />
                    {b.note && <Field label="Note" value={b.note} full />}
                  </div>
                  {b.payment && b.payment.events.length > 0 && (
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Événements paiement (idempotents)</p>
                      <div className="mt-2 space-y-1">
                        {b.payment.events.map((e, i) => (
                          <p key={i} className="num flex flex-wrap items-baseline gap-2 text-[10.5px]">
                            <span className="text-muted-foreground">{new Date(e.at).toLocaleString("fr-FR")}</span>
                            <span className="font-semibold text-emerald-300">{e.type}</span>
                            <span className={cn(e.outcome === "SUCCES" ? "text-emerald-300" : e.outcome === "ECHEC" || e.outcome === "INCONNU" ? "text-red-300" : "text-amber-300")}>{e.outcome}</span>
                            {e.ignoredReason && <span className="text-muted-foreground/70">· {e.ignoredReason}</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((kind) => {
                        const meta = ACTION_META[kind];
                        const Icon = meta.icon;
                        return (
                          <Button key={kind} size="sm" variant="outline" className="h-8 cursor-pointer gap-1.5 text-[11px]"
                            onClick={() => { setAction({ kind, ref: b.reference, extra: kind === "replace_ticket" ? b.ticket?.code : b.payment?.providerRef ?? undefined }); setReason(""); setNote(""); setDecision("SUCCES"); }}>
                            <Icon className="h-3.5 w-3.5" /> {meta.title}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ————— Dialog : action + raison ————— */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          {action && (() => {
            const meta = ACTION_META[action.kind];
            const Icon = meta.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Icon className="h-4 w-4 text-amber-400" /> {meta.title}</DialogTitle>
                  <DialogDescription>{meta.description}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-1">
                  {action.kind === "reconcile" && (
                    <div className="grid grid-cols-2 gap-2">
                      {(["SUCCES", "ECHEC"] as const).map((d) => (
                        <button key={d} onClick={() => setDecision(d)}
                          className={cn("cursor-pointer rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition-colors",
                            decision === d
                              ? d === "SUCCES" ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-red-500/50 bg-red-500/15 text-red-300"
                              : "border-border text-muted-foreground hover:text-foreground")}>
                          {d === "SUCCES" ? "Fonds reçus — confirmer" : "Fonds non reçus — échec"}
                        </button>
                      ))}
                    </div>
                  )}
                  {action.kind === "note" && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="act-note">Note interne</Label>
                      <textarea id="act-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. voyageur rappellera pour changement de date…"
                        className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-[12px] focus:border-emerald-500/50 focus:outline-none" />
                    </div>
                  )}
                  {needsReason && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="act-reason">Justification {action.kind === "reconcile" ? "(obligatoire — rapprochement auditable)" : "(obligatoire — audit)"}</Label>
                      <Input id="act-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder={action.kind === "replace_ticket" ? "Billet perdu, litige, réémission…" : action.kind === "no_show" ? "Voyageur absent au quai…" : "Motif…"} className="h-10" />
                    </div>
                  )}
                  <p className="flex items-start gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />
                    Action journalisée avec votre identité de session ({session?.fullName}) — horodatée, non modifiable.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAction(null)} className="cursor-pointer">Annuler</Button>
                  <Button onClick={runAction} disabled={busy || (needsReason && !reason.trim()) || (action.kind === "note" && !note.trim())}
                    className="cursor-pointer gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmer
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={cn("min-w-0", full && "col-span-2")}>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="num mt-0.5 truncate text-[11.5px]" title={value}>{value}</p>
    </div>
  );
}

function availableActions(b: BookingRow, perms: { canActions: boolean; canFinance: boolean; canTickets: boolean }): ActionKind[] {
  const out: ActionKind[] = [];
  const alive = ["EN_ATTENTE_PAIEMENT", "CONFIRMEE", "PRESENTEE", "A_RECONCILIER"].includes(b.status);
  if (perms.canActions) {
    if (alive) out.push("cancel");
    if (["CONFIRMEE", "PRESENTEE", "REMBOURSEMENT_EN_COURS", "A_RECONCILIER"].includes(b.status) && b.payment?.status !== "EXPIRE") out.push("refund");
    if (["CONFIRMEE", "PRESENTEE"].includes(b.status)) out.push("no_show");
    if (b.status === "CONFIRMEE") out.push("mark_presented");
    out.push("note");
    if (b.payment?.status === "INCONNU") {
      if (perms.canFinance) out.push("reconcile");
      out.push("status_query");
    }
  }
  if (perms.canTickets && b.ticket && b.ticket.status === "VALIDE" && ["CONFIRMEE", "PRESENTEE", "A_RECONCILIER"].includes(b.status)) {
    out.push("replace_ticket");
  }
  return out;
}
