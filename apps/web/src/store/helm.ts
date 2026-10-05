"use client";
import { create } from "zustand";

export type TravelStep = "search" | "results" | "seats" | "checkout" | "ticket" | "mytickets";
export type AgencyTab =
  | "dashboard" | "departures" | "catalogue" | "bookings" | "guichet"
  | "boarding" | "reports" | "staff" | "settings" | "support" | "audit";

export interface SearchParams {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  passengers: number;
}

export interface SessionCompany {
  slug: string;
  name: string;
  tagline: string | null;
  brandColor: string;
  brandAccent: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  holdMinutes: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  company: SessionCompany | null;
}

export interface HoldInfo {
  token: string;
  expiresAt: number; // epoch ms
  seats: { id: string; code: string; kind: string }[];
  departureId: string;
  count: number; // nombre de places (mode capacité)
  pricing: { base: number; vip: number };
}

export interface BookingDraft {
  reference: string;
  totalAmount: number;
  amount: number;
  serviceFee: number;
  seatCodes: string;
  seatCount: number;
  nextStep: string;
  payment: { providerRef: string; provider: string; status: string; amount: number };
  method: string;
}

interface HelmState {
  mode: "travel" | "agency";
  setMode: (m: "travel" | "agency") => void;

  // Session back-office (identité réelle, tenant verrouillé côté serveur)
  session: SessionUser | null;
  setSession: (u: SessionUser | null) => void;

  agencyTab: AgencyTab;
  setAgencyTab: (t: AgencyTab) => void;

  step: TravelStep;
  setStep: (s: TravelStep) => void;
  search: SearchParams;
  setSearch: (p: Partial<SearchParams>) => void;

  selectedDepartureId: string | null;
  selectDeparture: (id: string | null) => void;

  hold: HoldInfo | null;
  setHold: (h: HoldInfo | null) => void;

  bookingDraft: BookingDraft | null;
  setBookingDraft: (b: BookingDraft | null) => void;

  activeTicketCode: string | null;
  setActiveTicketCode: (c: string | null) => void;

  resetTravel: () => void;
}

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const initialSearch: SearchParams = { origin: "Cotonou", destination: "Parakou", date: todayISO(), passengers: 1 };

export const useHelm = create<HelmState>((set) => ({
  mode: "travel",
  setMode: (m) => set({ mode: m }),

  session: null,
  setSession: (u) => set({ session: u, agencyTab: "dashboard" }),

  agencyTab: "dashboard",
  setAgencyTab: (t) => set({ agencyTab: t }),

  step: "search",
  setStep: (s) => set({ step: s }),
  search: initialSearch,
  setSearch: (p) => set((st) => ({ search: { ...st.search, ...p } })),

  selectedDepartureId: null,
  selectDeparture: (id) => set({ selectedDepartureId: id }),

  hold: null,
  setHold: (h) => set({ hold: h }),

  bookingDraft: null,
  setBookingDraft: (b) => set({ bookingDraft: b }),

  activeTicketCode: null,
  setActiveTicketCode: (c) => set({ activeTicketCode: c }),

  resetTravel: () =>
    set({ step: "search", selectedDepartureId: null, hold: null, bookingDraft: null, activeTicketCode: null, search: { ...initialSearch, date: todayISO() } }),
}));
