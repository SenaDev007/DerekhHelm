"use client";
import { motion } from "framer-motion";
import { useApi } from "./use-api";
import { relTime, fmtDate, fmtTime } from "@travelhelm/shared";
import { cn } from "@/lib/utils";
import { ScrollText, Radio, ShieldCheck, MessageSquare } from "lucide-react";

interface AuditData {
  logs: { id: string; actor: string; action: string; entity: string; entityId: string; detail: string | null; at: string }[];
  notifications: { channel: string; template: string; recipient: string; status: string; at: string }[];
}

const ACTION_LABEL: Record<string, string> = {
  HOLD_CREATED: "Rétention créée",
  HOLD_RELEASED: "Rétention libérée",
  HOLD_EXPIRED: "Rétention expirée",
  BOOKING_PENDING: "Réservation en attente",
  BOOKING_CONFIRMED: "Réservation confirmée",
  GUICHET_SALE: "Vente guichet encaissée",
  PAYMENT_FAILED: "Paiement échoué",
  PAYMENT_UNKNOWN: "Paiement inconnu",
  BOARDING_OK: "Embarquement validé",
  BOARDING_DUPLICATE: "Double scan ignoré",
  BOARDING_REFUSED: "Embarquement refusé",
  BOARDING_MANUAL: "Examen manuel",
  DEPARTURE_CREATED: "Départ créé",
  DEPARTURE_PUBLIE: "Départ publié",
  DEPARTURE_DELAYED: "Départ retardé",
  DEPARTURE_RETARDE: "Départ retardé",
  DEPARTURE_CANCELED: "Départ annulé",
  DEPARTURE_ANNULE: "Départ annulé",
  DEPARTURE_EMBARQUEMENT: "Embarquement ouvert",
  DEPARTURE_EN_COURS: "Départ parti",
  DEPARTURE_TERMINE: "Départ terminé",
  DEPARTURE_VEHICULE_REMPLACE: "Véhicule remplacé",
};

const TEMPLATE_LABEL: Record<string, string> = {
  CONFIRMATION_VENTE: "Confirmation de vente",
  RAPPEL_DEPART: "Rappel de départ",
  AVIS_RETARD: "Avis de retard",
  AVIS_ANNULATION: "Avis d'annulation",
  AVIS_VEHICULE: "Avis de changement de véhicule",
  OUVERTURE_EMBARQUEMENT: "Ouverture de l'embarquement",
};

function actionTone(action: string): string {
  if (/(CONFIRM|OK|PUBLIE|CREATED|SALE|CRE|EMBARQUEMENT$)/.test(action)) return "emerald";
  if (/(ECHEC|FAILED|REFUSED|ANNULE|CANCEL|UNKNOWN|EXPIRED)/.test(action)) return "red";
  if (/(RETARD|DELAY|PENDING|MANUAL|DUPLICATE|REPLACE)/.test(action)) return "amber";
  return "neutral";
}

export function Audit() {
  const { data, updatedAt } = useApi<AuditData>(`/api/helm/backoffice/audit`, { intervalMs: 20000 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-stone-300"><ScrollText className="h-4.5 w-4.5" /></span>
          Journal d&apos;audit & notifications
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Écritures immuables : chaque vente, rétention, changement d&apos;état et scan porte son auteur et son horodatage (TH-ADM-02 · §7.3).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Journal */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-[14px] font-semibold">Journal des opérations (60 dernières)</h2>
            <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <Radio className="h-3 w-3 sync-dot text-emerald-400" /> maj {relTime(updatedAt ? new Date(updatedAt) : new Date())}
            </span>
          </div>
          <div className="max-h-[560px] overflow-y-auto thin-scroll">
            {data?.logs.map((l, i) => {
              const tone = actionTone(l.action);
              return (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.25) }}
                  className="flex items-start gap-3 border-b border-border/40 px-4 py-2.5 text-[11.5px] transition-colors last:border-0 hover:bg-secondary/30 sm:px-5"
                >
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", tone === "emerald" ? "bg-emerald-400" : tone === "red" ? "bg-red-400" : tone === "amber" ? "bg-amber-400" : "bg-stone-500")} />
                  <span className="num w-24 shrink-0 text-muted-foreground" title={new Date(l.at).toLocaleString("fr-FR")}>
                    {fmtDate(l.at)} {fmtTime(l.at)}
                  </span>
                  <span className="w-36 shrink-0 truncate font-semibold" title={l.actor}>{l.actor}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("font-semibold", tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : "")}>
                      {ACTION_LABEL[l.action] ?? l.action}
                    </span>
                    {l.detail && <span className="ml-2 text-muted-foreground">{l.detail}</span>}
                  </span>
                  <span className="num hidden max-w-[120px] shrink-0 truncate text-[10px] text-muted-foreground sm:block" title={l.entityId}>{l.entityId}</span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <MessageSquare className="h-4 w-4 text-muted-foreground" /> Journal de livraison SMS
            </h2>
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto thin-scroll pr-1">
              {data?.notifications.map((n, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg bg-secondary/40 px-2.5 py-2 text-[11px]">
                  <span className="num w-11 shrink-0 text-muted-foreground">{fmtTime(n.at)}</span>
                  <span className="flex-1 truncate">
                    <span className="font-semibold">{TEMPLATE_LABEL[n.template] ?? n.template}</span>
                    <span className="ml-1.5 num text-muted-foreground">→ {n.recipient}</span>
                  </span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", n.status === "ENVOYE" ? "bg-emerald-500/12 text-emerald-300" : "bg-red-500/12 text-red-300")}>
                    {n.status === "ENVOYE" ? "envoyé" : "échec"}
                  </span>
                </div>
              ))}
              {data?.notifications.length === 0 && <p className="px-1 py-4 text-[11.5px] text-muted-foreground">Aucun envoi récent.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Séparation des consentements
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              Les SMS listés ici sont des messages nécessaires à l&apos;exécution du voyage (confirmation, retard, annulation).
              Les envois marketing et CRM sont des phases ultérieures, sur consentement séparé (TH-COM-03).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
