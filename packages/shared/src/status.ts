// Travel Helm — métadonnées des états métier (§3.3 du cahier des charges)
// Pur et isomorphe : utilisable côté client et serveur.

export type Tone = "green" | "amber" | "red" | "neutral" | "violet" | "teal";

export type StatusMeta = { label: string; tone: Tone; hint?: string };

export const DEPARTURE_STATUS: Record<string, StatusMeta> = {
  BROUILLON: { label: "Brouillon", tone: "neutral", hint: "Départ créé, non encore publié à la vente" },
  PUBLIE: { label: "Publié", tone: "green", hint: "Vendable sur tous les canaux" },
  EMBARQUEMENT: { label: "Embarquement", tone: "amber", hint: "Contrôle des billets en cours au quai" },
  EN_COURS: { label: "En cours", tone: "teal", hint: "Véhicule parti" },
  TERMINE: { label: "Terminé", tone: "neutral", hint: "Arrivé à destination, archivé" },
  RETARDE: { label: "Retardé", tone: "amber", hint: "Retard enregistré, voyageurs notifiés" },
  VEHICULE_REMPLACE: { label: "Véhicule remplacé", tone: "violet", hint: "Réaffectation de véhicule" },
  ANNULE: { label: "Annulé", tone: "red", hint: "Remboursements en cours" },
};

export const BOOKING_STATUS: Record<string, StatusMeta> = {
  EN_ATTENTE_PAIEMENT: { label: "En attente de paiement", tone: "amber" },
  CONFIRMEE: { label: "Confirmée", tone: "green" },
  PRESENTEE: { label: "Présentée", tone: "teal" },
  EMBARQUEE: { label: "Embarquée", tone: "teal" },
  TERMINEE: { label: "Terminée", tone: "neutral" },
  EXPIREE: { label: "Expirée", tone: "neutral" },
  ANNULEE: { label: "Annulée", tone: "red" },
  REMBOURSEMENT_EN_COURS: { label: "Remboursement en cours", tone: "amber" },
  REMBOURSEE: { label: "Remboursée", tone: "violet" },
  NO_SHOW: { label: "No-show", tone: "red" },
  A_RECONCILIER: { label: "À réconcilier", tone: "red" },
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  INITIE: { label: "Initié", tone: "neutral" },
  EN_ATTENTE: { label: "En attente", tone: "amber" },
  SUCCES: { label: "Succès", tone: "green" },
  ECHEC: { label: "Échec", tone: "red" },
  EXPIRE: { label: "Expiré", tone: "neutral" },
  INCONNU: { label: "Inconnu", tone: "red", hint: "Interrogation fournisseur ou rapprochement requis" },
  REMBOURSE: { label: "Remboursé", tone: "violet" },
};

export const TICKET_STATUS: Record<string, StatusMeta> = {
  VALIDE: { label: "Valide", tone: "green" },
  UTILISE: { label: "Utilisé", tone: "teal" },
  ANNULE: { label: "Annulé", tone: "red" },
  REMPLACE: { label: "Remplacé", tone: "violet" },
  EXAMEN_MANUEL: { label: "Examen manuel", tone: "amber" },
};

export const CHANNEL_LABEL: Record<string, string> = {
  WEB: "Web",
  GUICHET: "Guichet",
  REVENDEUR: "Revendeur",
};

export const METHOD_LABEL: Record<string, string> = {
  MTN_MOMO: "MTN Mobile Money",
  MOOV_MONEY: "Moov Money",
  CASH: "Espèces (guichet)",
  AU_GUICHET: "À payer au guichet",
};

export const SEAT_KIND_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  VIP: "VIP",
  ACCESSIBLE: "PMR",
  SERVICE: "Service",
};

// ——— classes de couleur par ton ———
export function toneClasses(tone: Tone): { pill: string; dot: string; text: string; soft: string } {
  switch (tone) {
    case "green": return { pill: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60", dot: "bg-emerald-500", text: "text-emerald-400", soft: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
    case "amber": return { pill: "bg-amber-950/40 text-amber-300 border-amber-800/60", dot: "bg-amber-500", text: "text-amber-500", soft: "bg-amber-500/10 text-amber-700 border-amber-500/25" };
    case "red": return { pill: "bg-red-950/40 text-red-300 border-red-800/60", dot: "bg-red-500", text: "text-red-500", soft: "bg-red-500/10 text-red-600 border-red-500/20" };
    case "violet": return { pill: "bg-violet-950/40 text-violet-300 border-violet-800/60", dot: "bg-violet-500", text: "text-violet-400", soft: "bg-violet-500/10 text-violet-600 border-violet-500/20" };
    case "teal": return { pill: "bg-teal-950/40 text-teal-300 border-teal-800/60", dot: "bg-teal-500", text: "text-teal-500", soft: "bg-teal-500/10 text-teal-600 border-teal-500/20" };
    default: return { pill: "bg-stone-800/60 text-stone-300 border-stone-700/60", dot: "bg-stone-400", text: "text-stone-500", soft: "bg-stone-500/10 text-stone-600 border-stone-400/20" };
  }
}

export function statusMeta(map: Record<string, StatusMeta>, key: string): StatusMeta {
  return map[key] ?? { label: key, tone: "neutral" };
}
