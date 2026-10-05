// Travel Helm — rôles et permissions (TH-ADM-03).
// Pur et isomorphe : utilisé par le backend (garde d'accès) et le frontend (navigation).

export const ROLES = ["GERANT", "MANAGER", "GUICHETIER", "FINANCE", "REPARTITEUR", "CONTROLEUR", "SUPPORT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  GERANT: "Gérant · accès complet",
  MANAGER: "Manager · opérations",
  GUICHETIER: "Guichetier · ventes",
  FINANCE: "Finance · lecture & export",
  REPARTITEUR: "Répartiteur · départs & flotte",
  CONTROLEUR: "Contrôleur · embarquement",
  SUPPORT: "Support Travel Helm",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  GERANT: "Tous les droits sur la compagnie : catalogue, départs, ventes, personnel, paramètres.",
  MANAGER: "Opérations : catalogue, départs, réservations, embarquement, guichet. Pas de personnel ni paramètres.",
  GUICHETIER: "Ventes au guichet et consultation des départs/réservations du jour.",
  FINANCE: "Lecture et exports : rapports, rapprochement paiements, réconciliation. Aucune mutation du catalogue.",
  REPARTITEUR: "Planification : création et gestion des départs, flotte.",
  CONTROLEUR: "Embarquement uniquement : manifeste, scan des billets.",
  SUPPORT: "Travel Helm — accès transverse (provisioning de compagnies), sur justification journalisée.",
};

/** Onglets back-office accessibles par rôle. */
export const ROLE_TABS: Record<Role, string[]> = {
  GERANT: ["dashboard", "departures", "catalogue", "bookings", "guichet", "boarding", "reports", "staff", "settings", "audit"],
  MANAGER: ["dashboard", "departures", "catalogue", "bookings", "guichet", "boarding", "reports", "audit"],
  GUICHETIER: ["guichet", "departures", "bookings"],
  FINANCE: ["dashboard", "reports", "bookings", "audit"],
  REPARTITEUR: ["departures", "catalogue", "dashboard"],
  CONTROLEUR: ["boarding"],
  SUPPORT: ["support", "audit"],
};

/** Modules API autorisés par rôle (garde côté serveur). */
export const ROLE_MODULES: Record<Role, string[]> = {
  GERANT: ["overview", "departures", "catalogue", "bookings", "guichet", "boarding", "reports", "staff", "settings", "audit", "payments"],
  MANAGER: ["overview", "departures", "catalogue", "bookings", "guichet", "boarding", "reports", "audit", "payments"],
  GUICHETIER: ["guichet", "departures", "bookings", "overview"],
  FINANCE: ["overview", "reports", "bookings", "audit", "payments"],
  REPARTITEUR: ["departures", "catalogue", "overview"],
  CONTROLEUR: ["boarding"],
  SUPPORT: ["support", "audit"],
};

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
