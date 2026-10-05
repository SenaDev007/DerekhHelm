/**
 * Travel Helm — Seed de démonstration
 * Données plausibles, clairement fictives : 3 compagnies, corridor Cotonou–Parakou, etc.
 * Exécution : bun /home/z/my-project/scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID, scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

const QR_SECRET = process.env.HELM_QR_SECRET || "travelhelm-demo-secret";

// ---------- utilitaires ----------
let seedState = 42;
function rnd() {
  // pseudo-aléatoire déterministe (mulberry32)
  seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function ref(n: number) { let s = ""; for (let i = 0; i < n; i++) s += REF_CHARS[Math.floor(rnd() * REF_CHARS.length)]; return s; }
function ticketCode() { return `THQ-${ref(4)}-${ref(4)}`; }
function qrPayload(code: string) { return `THV1|${code}|${createHmac("sha256", QR_SECRET).update(code).digest("hex").slice(0, 16)}`; }
function at(base: Date, h: number, m = 0) { const d = new Date(base); d.setHours(h, m, 0, 0); return d; }
function plusMin(base: Date, min: number) { return new Date(base.getTime() + min * 60000); }

const NOW = new Date();
const TODAY = new Date(NOW); TODAY.setHours(0, 0, 0, 0);
const TOMORROW = new Date(TODAY); TOMORROW.setDate(TODAY.getDate() + 1);
const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(TODAY.getDate() - 1);

// ---------- personnes de démonstration ----------
const NAMES = [
  "Sylvie Adjovi", "Marc Agbodjan", "Fatou Bio", "Rachidath Adam", "Kelly Amoussou",
  "Gildas Tossou", "Bernadette Dossou", "Ibrahim Zakari", "Océane Houngbo", "Prudence Ahouandjinou",
  "Ulrich Kpondéhou", "Sarah Lokossou", "Nadège Tchakpo", "Sètondji Aholou", "Chantal Vodounon",
  "Espoir Danvi", "Grâce Agboka", "Rufin Sintondji", "Muriel Laly", "Olivier Bodjrenou",
  "Ange Alahassa", "Josué Houèno", "Carine Zinsou", "Rodrigue Akplogan", "Bénédicte Gbaguidi",
  "Farid Soulé", "Adjoa Mensah", "Théophile Sagbo", "Clarisse Agossou", "Wendam Nikièma",
  "Paulin Hounkpatin", "Estère Kora", "Marius Aïnama", "Delphine Tovihoudji", "Guy Ogoussanou",
];
const AGENTS = ["A. Sossou (Guichet Missèbo)", "F. Kpossou (Guichet Missèbo)", "L. Badirou (Guichet Bohicon)"];
function phone() { return `+229 01 9${Math.floor(10 + rnd() * 80)} ${Math.floor(10 + rnd() * 89)} ${Math.floor(10 + rnd() * 89)} ${Math.floor(10 + rnd() * 89)}`; }

// ---------- plans de sièges ----------
type SeatDef = { code: string; row: number; col: number; kind: string; window: boolean };
function buildSeatPlan(layout: "2-2" | "2-3", rows: number, serviceRow1: number, vipRows: number[]): SeatDef[] {
  const cols = layout === "2-3" ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "D"];
  const out: SeatDef[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 0; c < cols.length; c++) {
      const code = `${r}${cols[c]}`;
      let kind = "STANDARD";
      if (r === 1 && c < serviceRow1) kind = "SERVICE";
      else if (vipRows.includes(r)) kind = "VIP";
      if (r === 1 && c === cols.length - 1 && kind === "STANDARD") kind = "ACCESSIBLE";
      out.push({ code, row: r, col: c, kind, window: c === 0 || c === cols.length - 1 });
    }
  }
  return out;
}

async function main() {
  console.log("→ Nettoyage…");
  await db.notificationLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.ticket.deleteMany();
  await db.paymentEvent.deleteMany();
  await db.payment.deleteMany();
  await db.seatOccupancy.deleteMany();
  await db.booking.deleteMany();
  await db.departureStateLog.deleteMany();
  await db.departure.deleteMany();
  await db.stop.deleteMany();
  await db.seat.deleteMany();
  await db.vehicle.deleteMany();
  await db.route.deleteMany();
  await db.station.deleteMany();
  await db.staffUser.deleteMany();
  await db.company.deleteMany();

  console.log("→ Compagnies…");
  const corx = await db.company.create({
    data: {
      name: "Corridor Express", slug: "corridor-express",
      tagline: "La fiabilité du corridor Cotonou – Parakou",
      brandColor: "#0E7A4E", brandAccent: "#E8A33D",
      description: "Autocars climatisés, sièges numérotés et embarquement balayé QR sur les grands corridors du Bénin.",
      holdMinutes: 7, contactPhone: "+229 01 30 45 12 00", contactEmail: "gare@corridorexpress.bj",
    },
  });
  const sika = await db.company.create({
    data: {
      name: "Sika Voyages", slug: "sika-voyages",
      tagline: "Voyager confortablement, arriver sereinement",
      brandColor: "#B45309", brandAccent: "#F5C242",
      description: "Liaisons interurbaines régulières entre le Sud et le Nord du Bénin.",
      holdMinutes: 8, contactPhone: "+229 01 30 44 88 21", contactEmail: "info@sikavoyages.bj",
    },
  });
  const baobab = await db.company.create({
    data: {
      name: "Baobab Lines", slug: "baobab-lines",
      tagline: "Les racines du voyage béninois",
      brandColor: "#9A3412", brandAccent: "#E8A33D",
      description: "Transports côtière et Nord-Bénin avec service bagage inclus.",
      holdMinutes: 6, contactPhone: "+229 01 30 46 77 13", contactEmail: "contact@baobablines.bj",
    },
  });

  console.log("→ Comptes du personnel (TH-ADM-02/03)…");
  function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  }
  const DEMO_PASSWORD = "demo1234";
  const staffPlan: { co: typeof corx; email: string; fullName: string; role: string; phone: string; mfa?: boolean }[] = [
    { co: corx, email: "gerant@corridorexpress.bj", fullName: " Firmin Ahouansou", role: "GERANT", phone: "+229 01 97 41 22 08", mfa: true },
    { co: corx, email: "manager@corridorexpress.bj", fullName: "Rachelle Bodjrenou", role: "MANAGER", phone: "+229 01 96 12 54 77" },
    { co: corx, email: "guichet@corridorexpress.bj", fullName: "Anicet Sossou", role: "GUICHETIER", phone: "+229 01 95 88 31 46" },
    { co: corx, email: "controleur@corridorexpress.bj", fullName: "Barthélemy Kpossou", role: "CONTROLEUR", phone: "+229 01 94 55 62 19" },
    { co: corx, email: "finance@corridorexpress.bj", fullName: "Nadège Tchakpo", role: "FINANCE", phone: "+229 01 93 74 18 52" },
    { co: corx, email: "repartiteur@corridorexpress.bj", fullName: "Léon Badirou", role: "REPARTITEUR", phone: "+229 01 92 63 47 90" },
    { co: sika, email: "gerant@sikavoyages.bj", fullName: "Colombe Ikpè", role: "GERANT", phone: "+229 01 97 33 26 15", mfa: true },
    { co: sika, email: "guichet@sikavoyages.bj", fullName: "Sylvain Quenum", role: "GUICHETIER", phone: "+229 01 96 44 17 83" },
    { co: sika, email: "controleur@sikavoyages.bj", fullName: "Mariam Bio", role: "CONTROLEUR", phone: "+229 01 95 22 96 40" },
    { co: baobab, email: "gerant@baobablines.bj", fullName: "Théophile Sagbo", role: "GERANT", phone: "+229 01 97 58 44 02", mfa: true },
    { co: baobab, email: "manager@baobablines.bj", fullName: "Espérance Danvi", role: "MANAGER", phone: "+229 01 96 71 85 23" },
    { co: baobab, email: "finance@baobablines.bj", fullName: "Guy Ogoussanou", role: "FINANCE", phone: "+229 01 95 39 62 71" },
  ];
  await db.staffUser.createMany({
    data: [
      ...staffPlan.map((u) => ({
        companyId: u.co.id, email: u.email, fullName: u.fullName.trim(), phone: u.phone,
        role: u.role, passwordHash: hashPassword(DEMO_PASSWORD), mfaEnabled: u.mfa ?? false,
      })),
      // Compte Support Travel Helm (transverse, justification exigée à l'usage)
      {
        companyId: null, email: "support@travelhelm.bj", fullName: "Support Travel Helm",
        phone: "+229 01 30 00 00 00", role: "SUPPORT",
        passwordHash: hashPassword(DEMO_PASSWORD), mfaEnabled: true,
      },
    ],
  });

  console.log("→ Gares & arrêts…");
  const stations = [
    { city: "Cotonou", name: "Gare de Missèbo", kind: "GARE", primary: true },
    { city: "Porto-Novo", name: "Gare centrale de Porto-Novo", kind: "GARE", primary: true },
    { city: "Abomey", name: "Gare d'Abomey", kind: "GARE", primary: false },
    { city: "Bohicon", name: "Gare de Bohicon", kind: "GARE", primary: true },
    { city: "Dassa-Zoumè", name: "Arrêt de Dassa-Zoumè", kind: "ARRET", primary: false },
    { city: "Parakou", name: "Gare centrale de Parakou", kind: "GARE", primary: true },
    { city: "Ouidah", name: "Arrêt d'Ouidah – Place du Fort", kind: "ARRET", primary: false },
    { city: "Djougou", name: "Gare centrale de Djougou", kind: "GARE", primary: true },
    { city: "Natitingou", name: "Gare de Natitingou", kind: "GARE", primary: true },
  ];
  for (const c of [corx, sika, baobab]) {
    for (const s of stations.filter((x) => x.primary || c === corx)) {
      await db.station.create({ data: { companyId: c.id, city: s.city, name: s.name, kind: s.kind, isPrimary: s.primary } });
    }
  }

  console.log("→ Lignes…");
  async function route(co: typeof corx, o: { code: string; origin: string; dest: string; km: number; dur: number; price: number; boarding: string; drop?: string; stops?: [string, string, number][] }) {
    return db.route.create({
      data: {
        companyId: co.id, code: o.code, originCity: o.origin, destCity: o.dest,
        label: `Corridor ${o.origin} → ${o.dest}`, distanceKm: o.km, durationMin: o.dur,
        boardingPoint: o.boarding, dropOffPoint: o.drop,
        stops: { create: (o.stops ?? [[o.origin, o.boarding, 0], [o.dest, o.drop ?? `Gare de ${o.dest}`, o.dur]]).map((s, i) => ({ city: s[0], station: s[1], seq: i + 1, offsetMin: s[2] })) },
      },
    });
  }
  const R = {
    pkp: await route(corx, { code: "CTN-PKP", origin: "Cotonou", dest: "Parakou", km: 425, dur: 420, price: 12000, boarding: "Gare de Missèbo", drop: "Gare centrale de Parakou",
      stops: [["Cotonou", "Gare de Missèbo", 0], ["Bohicon", "Gare de Bohicon", 120], ["Dassa-Zoumè", "Arrêt de Dassa-Zoumè", 185], ["Parakou", "Gare centrale de Parakou", 420]] }),
    pkn: await route(corx, { code: "PKP-CTN", origin: "Parakou", dest: "Cotonou", km: 425, dur: 420, price: 11500, boarding: "Gare centrale de Parakou", drop: "Gare de Missèbo",
      stops: [["Parakou", "Gare centrale de Parakou", 0], ["Dassa-Zoumè", "Arrêt de Dassa-Zoumè", 235], ["Bohicon", "Gare de Bohicon", 300], ["Cotonou", "Gare de Missèbo", 420]] }),
    pno: await route(corx, { code: "CTN-PNO", origin: "Cotonou", dest: "Porto-Novo", km: 60, dur: 100, price: 3000, boarding: "Gare de Missèbo", drop: "Gare centrale de Porto-Novo" }),
    oua: await route(corx, { code: "CTN-OUA", origin: "Cotonou", dest: "Ouidah", km: 42, dur: 65, price: 2000, boarding: "Gare de Missèbo", drop: "Arrêt d'Ouidah – Place du Fort" }),
    djg: await route(corx, { code: "CTN-DJG", origin: "Cotonou", dest: "Djougou", km: 460, dur: 480, price: 13500, boarding: "Gare de Missèbo", drop: "Gare centrale de Djougou",
      stops: [["Cotonou", "Gare de Missèbo", 0], ["Bohicon", "Gare de Bohicon", 120], ["Parakou", "Gare centrale de Parakou", 420], ["Djougou", "Gare centrale de Djougou", 480]] }),
    sPkp: await route(sika, { code: "SK-PKP", origin: "Cotonou", dest: "Parakou", km: 425, dur: 435, price: 11000, boarding: "Gare de Missèbo", drop: "Gare centrale de Parakou" }),
    sPno: await route(sika, { code: "SK-PNO", origin: "Cotonou", dest: "Porto-Novo", km: 60, dur: 105, price: 2800, boarding: "Gare de Missèbo", drop: "Gare centrale de Porto-Novo" }),
    bDjg: await route(baobab, { code: "BB-DJG", origin: "Cotonou", dest: "Djougou", km: 460, dur: 495, price: 12500, boarding: "Gare de Missèbo", drop: "Gare centrale de Djougou" }),
    bOua: await route(baobab, { code: "BB-OUA", origin: "Cotonou", dest: "Ouidah", km: 42, dur: 70, price: 1800, boarding: "Gare de Missèbo", drop: "Arrêt d'Ouidah – Place du Fort" }),
  };

  console.log("→ Flotte & plans de sièges…");
  async function vehicle(co: typeof corx, v: { label: string; model: string; plate: string; layout: "2-2" | "2-3"; rows: number; serviceRow1: number; vipRows: number[]; amenities: string; seatSelection: boolean }) {
    const plan = buildSeatPlan(v.layout, v.rows, v.serviceRow1, v.vipRows);
    const sellable = plan.filter((s) => s.kind !== "SERVICE").length;
    return db.vehicle.create({
      data: {
        companyId: co.id, label: v.label, model: v.model, plate: v.plate, seatLayout: v.layout,
        capacity: sellable, seatSelectionEnabled: v.seatSelection, amenities: v.amenities,
        seats: { create: plan.map((s) => ({ code: s.code, row: s.row, col: s.col, kind: s.kind, window: s.window })) },
      },
    });
  }
  const V1 = await vehicle(corx, { label: "Zéphyr 01", model: "Yutong ZK6122H", plate: "AB-4821-CD", layout: "2-3", rows: 12, serviceRow1: 2, vipRows: [2, 3], amenities: "Climatisation,Prises USB,Écrans individuels", seatSelection: true });
  const V2 = await vehicle(corx, { label: "Zéphyr 02", model: "Yutong ZK6122H", plate: "AB-4822-CD", layout: "2-3", rows: 12, serviceRow1: 2, vipRows: [2, 3], amenities: "Climatisation,Prises USB", seatSelection: true });
  const V3 = await vehicle(corx, { label: "Colibri 03", model: "Toyota Coaster", plate: "CD-1170-EF", layout: "2-2", rows: 8, serviceRow1: 1, vipRows: [], amenities: "Climatisation", seatSelection: true });
  const V4 = await vehicle(corx, { label: "Hirondelle 04", model: "Ford Transit", plate: "EF-2345-GH", layout: "2-2", rows: 5, serviceRow1: 0, vipRows: [], amenities: "Climatisation", seatSelection: false });
  const VS1 = await vehicle(sika, { label: "Woy 01", model: "Golden Dragon XML6957", plate: "AB-7701-KL", layout: "2-3", rows: 10, serviceRow1: 2, vipRows: [2], amenities: "Climatisation,Prises USB", seatSelection: true });
  const VB1 = await vehicle(baobab, { label: "Iroko 01", model: "Higer KLQ6119", plate: "AB-9903-MN", layout: "2-2", rows: 9, serviceRow1: 1, vipRows: [], amenities: "Climatisation,Bagage inclus", seatSelection: true });

  console.log("→ Départs…");
  type DepIn = { routeId: string; vehicleId?: string | null; departsAt: Date; status: string; basePrice: number; vip?: number; seatSel: boolean; capacity?: number; reason?: string; delayMin?: number; publishedAt?: Date };
  async function dep(co: typeof corx, o: DepIn) {
    const veh = o.vehicleId ? await db.vehicle.findUnique({ where: { id: o.vehicleId }, include: { seats: true } }) : null;
    const r = await db.route.findUnique({ where: { id: o.routeId } });
    return db.departure.create({
      data: {
        companyId: co.id, routeId: o.routeId, vehicleId: o.vehicleId ?? null,
        departsAt: o.departsAt, durationMin: r!.durationMin,
        status: o.status, basePrice: o.basePrice, vipSurcharge: o.vip ?? 0,
        seatSelectionEnabled: o.seatSel && (veh?.seatSelectionEnabled ?? false),
        capacity: o.capacity ?? veh?.capacity ?? 30,
        reason: o.reason, delayMin: o.delayMin,
        publishedAt: o.publishedAt ?? (o.status === "BROUILLON" ? null : plusMin(o.departsAt, -24 * 60 * 3)),
        checkInNote: "Présentez-vous 30 min avant le départ au point d'embarquement indiqué sur le billet.",
      },
    });
  }
  // Corridor Express — CTN→PKP
  const D = {
    done1: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: at(YESTERDAY, 6, 0), status: "TERMINE", basePrice: 12000, seatSel: true }),
    done2: await dep(corx, { routeId: R.pkp.id, vehicleId: V2.id, departsAt: at(TODAY, 6, 0), status: "TERMINE", basePrice: 12000, seatSel: true }),
    done3: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: at(TODAY, 8, 30), status: "TERMINE", basePrice: 12000, seatSel: true }),
    live: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: plusMin(NOW, 105), status: "EMBARQUEMENT", basePrice: 12000, seatSel: true, publishedAt: plusMin(NOW, -2600) }),
    after: await dep(corx, { routeId: R.pkp.id, vehicleId: V2.id, departsAt: at(TODAY, 20, 0), status: "PUBLIE", basePrice: 12000, seatSel: true }),
    night: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: at(TODAY, 22, 30), status: "PUBLIE", basePrice: 11000, seatSel: true }),
    t1: await dep(corx, { routeId: R.pkp.id, vehicleId: V2.id, departsAt: at(TOMORROW, 6, 0), status: "PUBLIE", basePrice: 12000, seatSel: true }),
    t2: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: at(TOMORROW, 9, 0), status: "PUBLIE", basePrice: 12000, seatSel: true }),
    t3: await dep(corx, { routeId: R.pkp.id, vehicleId: V2.id, departsAt: at(TOMORROW, 14, 0), status: "BROUILLON", basePrice: 12500, seatSel: true }),
    t4: await dep(corx, { routeId: R.pkp.id, vehicleId: V1.id, departsAt: at(TOMORROW, 17, 0), status: "PUBLIE", basePrice: 12000, seatSel: true }),
    pno1: await dep(corx, { routeId: R.pno.id, vehicleId: V3.id, departsAt: at(TODAY, 9, 30), status: "PUBLIE", basePrice: 3000, seatSel: true }),
    pno2: await dep(corx, { routeId: R.pno.id, vehicleId: V3.id, departsAt: at(TODAY, 11, 0), status: "PUBLIE", basePrice: 3000, seatSel: true }),
    pno3: await dep(corx, { routeId: R.pno.id, vehicleId: V3.id, departsAt: at(TODAY, 15, 30), status: "PUBLIE", basePrice: 3000, seatSel: true }),
    pnoCap: await dep(corx, { routeId: R.pno.id, vehicleId: V4.id, departsAt: at(TODAY, 13, 0), status: "PUBLIE", basePrice: 2500, seatSel: false, capacity: 20 }),
    oua1: await dep(corx, { routeId: R.oua.id, vehicleId: V4.id, departsAt: at(TODAY, 16, 0), status: "PUBLIE", basePrice: 2000, seatSel: false, capacity: 20 }),
    djg1: await dep(corx, { routeId: R.djg.id, vehicleId: V2.id, departsAt: at(TODAY, 19, 0), status: "RETARDE", basePrice: 13500, seatSel: true, delayMin: 60, reason: "Embarquement prolongé à Bohicon" }),
    djg2: await dep(corx, { routeId: R.djg.id, vehicleId: V1.id, departsAt: at(TOMORROW, 7, 0), status: "PUBLIE", basePrice: 13500, seatSel: true }),
    djg3: await dep(corx, { routeId: R.djg.id, vehicleId: V2.id, departsAt: at(TOMORROW, 13, 0), status: "ANNULE", basePrice: 13500, seatSel: true, reason: "Véhicule en maintenance programmée" }),
    ret1: await dep(corx, { routeId: R.pkn.id, vehicleId: V1.id, departsAt: at(TOMORROW, 7, 0), status: "PUBLIE", basePrice: 11500, seatSel: true }),
    ret2: await dep(corx, { routeId: R.pkn.id, vehicleId: V2.id, departsAt: at(TOMORROW, 19, 0), status: "PUBLIE", basePrice: 11500, seatSel: true }),
  };
  // Sika & Baobab
  const O = {
    s1: await dep(sika, { routeId: R.sPkp.id, vehicleId: VS1.id, departsAt: at(TODAY, 13, 30), status: "PUBLIE", basePrice: 11000, seatSel: true }),
    s2: await dep(sika, { routeId: R.sPkp.id, vehicleId: VS1.id, departsAt: at(TOMORROW, 7, 30), status: "PUBLIE", basePrice: 11000, seatSel: true }),
    s3: await dep(sika, { routeId: R.sPno.id, vehicleId: VS1.id, departsAt: at(TODAY, 12, 0), status: "PUBLIE", basePrice: 2800, seatSel: false, capacity: 30 }),
    b1: await dep(baobab, { routeId: R.bDjg.id, vehicleId: VB1.id, departsAt: at(TODAY, 18, 0), status: "PUBLIE", basePrice: 12500, seatSel: true }),
    b2: await dep(baobab, { routeId: R.bOua.id, vehicleId: VB1.id, departsAt: at(TODAY, 11, 0), status: "PUBLIE", basePrice: 1800, seatSel: false, capacity: 24 }),
  };

  console.log("→ Réservations, paiements, billets…");
  async function createSale(o: {
    depId: string; co: typeof corx; seats: { id: string; code: string; kind: string }[];
    channel: string; method: string; payStatus: string; bookingStatus: string; ticketStatus?: string;
    agent?: string; when?: Date; scannedBy?: string;
  }) {
    const d0 = await db.departure.findUnique({ where: { id: o.depId }, include: { route: true } });
    if (!d0) return;
    const vipCount = o.seats.filter((s) => s.kind === "VIP").length;
    const amount = o.seats.length * d0.basePrice + vipCount * d0.vipSurcharge;
    const fee = 0;
    const name = pick(NAMES);
    const booking = await db.booking.create({
      data: {
        reference: `TH-${ref(6)}`, companyId: o.co.id, departureId: o.depId, channel: o.channel,
        passengerName: name, passengerPhone: phone(), seatCount: o.seats.length,
        seatCodes: o.seats.length ? o.seats.map((s) => s.code).join(",") : null,
        amount, serviceFee: fee, totalAmount: amount + fee, status: o.bookingStatus,
        paymentMethod: o.method, agentName: o.agent, holdToken: `SEED-${ref(8)}`,
        createdAt: o.when ?? plusMin(NOW, -Math.floor(60 + rnd() * 2000)),
        confirmedAt: o.bookingStatus !== "EN_ATTENTE_PAIEMENT" ? (o.when ?? plusMin(NOW, -Math.floor(30 + rnd() * 1500))) : null,
      },
    });
    await db.payment.create({
      data: {
        bookingId: booking.id, provider: o.method === "CASH" ? "CASH" : o.method,
        providerRef: `PAY-${ref(8)}`, amount: amount + fee, status: o.payStatus,
        completedAt: ["SUCCES", "REMBOURSE"].includes(o.payStatus) ? booking.confirmedAt : null,
        failureReason: o.payStatus === "ECHEC" ? "Solde Mobile Money insuffisant" : null,
      },
    });
    if (o.ticketStatus) {
      const code = ticketCode();
      await db.ticket.create({
        data: {
          bookingId: booking.id, code, qrPayload: qrPayload(code),
          status: o.ticketStatus,
          scannedAt: o.ticketStatus === "UTILISE" ? plusMin(NOW, -Math.floor(5 + rnd() * 30)) : null,
          scannedBy: o.ticketStatus === "UTILISE" ? (o.scannedBy ?? "K. Mahugnon (Contrôleur)") : null,
        },
      });
    }
    for (const s of o.seats) {
      await db.seatOccupancy.create({
        data: {
          departureId: o.depId, seatId: s.id, holdToken: booking.holdToken,
          status: o.bookingStatus === "EN_ATTENTE_PAIEMENT" ? "HOLD" : "CONFIRMED",
          bookingId: booking.id, channel: o.channel,
          expiresAt: o.bookingStatus === "EN_ATTENTE_PAIEMENT" ? plusMin(NOW, 6 * 60) : null,
        },
      });
    }
    await db.notificationLog.create({
      data: {
        companyId: o.co.id, departureId: o.depId, bookingId: booking.id, channel: "SMS",
        template: o.ticketStatus === "UTILISE" ? "RAPPEL_DEPART" : "CONFIRMATION_VENTE",
        recipient: booking.passengerPhone, status: "ENVOYE",
      },
    });
    await db.auditLog.create({
      data: {
        companyId: o.co.id, actor: o.channel === "GUICHET" ? (o.agent ?? "A. Sossou") : "Portail web",
        action: o.bookingStatus === "EN_ATTENTE_PAIEMENT" ? "BOOKING_PENDING" : "BOOKING_CONFIRMED",
        entity: "Booking", entityId: booking.reference, detail: `${o.seats.length} place(s) · ${o.channel} · ${o.method}`,
      },
    });
    return booking;
  }

  async function seatsOf(depId: string, n: number, from = 2, to = 12) {
    const d = await db.departure.findUnique({ where: { id: depId }, include: { vehicle: { include: { seats: true } } } });
    const pool = (d?.vehicle?.seats ?? []).filter((s) => s.kind !== "SERVICE" && s.row >= from && s.row <= to);
    const taken = await db.seatOccupancy.findMany({ where: { departureId: depId } });
    const takenIds = new Set(taken.map((t) => t.seatId));
    const free = pool.filter((s) => !takenIds.has(s.id));
    return free.sort(() => rnd() - 0.5).slice(0, n);
  }

  // Départ "live" en embarquement — vivant et rempli
  for (let i = 0; i < 14; i++) await createSale({ depId: D.live.id, co: corx, seats: await seatsOf(D.live.id, 1 + Math.floor(rnd() * 2)), channel: "GUICHET", method: "CASH", payStatus: "SUCCES", bookingStatus: "EMBARQUEE", ticketStatus: "UTILISE", agent: pick(AGENTS) });
  for (let i = 0; i < 22; i++) await createSale({ depId: D.live.id, co: corx, seats: await seatsOf(D.live.id, 1 + Math.floor(rnd() * 2)), channel: "WEB", method: rnd() > 0.5 ? "MTN_MOMO" : "MOOV_MONEY", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });
  for (let i = 0; i < 3; i++) await createSale({ depId: D.live.id, co: corx, seats: await seatsOf(D.live.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "EN_ATTENTE", bookingStatus: "EN_ATTENTE_PAIEMENT" });
  for (let i = 0; i < 2; i++) await createSale({ depId: D.live.id, co: corx, seats: await seatsOf(D.live.id, 1), channel: "GUICHET", method: "AU_GUICHET", payStatus: "INITIE", bookingStatus: "EN_ATTENTE_PAIEMENT", agent: pick(AGENTS) });

  // Départs terminés (historique riche pour rapports)
  for (let i = 0; i < 26; i++) await createSale({ depId: D.done1.id, co: corx, seats: await seatsOf(D.done1.id, 1 + Math.floor(rnd() * 2)), channel: rnd() > 0.4 ? "GUICHET" : "WEB", method: rnd() > 0.4 ? "CASH" : "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "TERMINEE", ticketStatus: "UTILISE", agent: pick(AGENTS), when: plusMin(at(YESTERDAY, 6, 0), -Math.floor(60 + rnd() * 600)) });
  for (let i = 0; i < 20; i++) await createSale({ depId: D.done2.id, co: corx, seats: await seatsOf(D.done2.id, 1 + Math.floor(rnd() * 2)), channel: rnd() > 0.4 ? "GUICHET" : "WEB", method: rnd() > 0.4 ? "CASH" : "MOOV_MONEY", payStatus: "SUCCES", bookingStatus: "TERMINEE", ticketStatus: "UTILISE", agent: pick(AGENTS), when: plusMin(at(TODAY, 6, 0), -Math.floor(60 + rnd() * 600)) });
  for (let i = 0; i < 18; i++) await createSale({ depId: D.done3.id, co: corx, seats: await seatsOf(D.done3.id, 1 + Math.floor(rnd() * 2)), channel: rnd() > 0.4 ? "GUICHET" : "WEB", method: rnd() > 0.4 ? "CASH" : "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "TERMINEE", ticketStatus: "UTILISE", agent: pick(AGENTS), when: plusMin(at(TODAY, 8, 30), -Math.floor(60 + rnd() * 600)) });

  // Départs du jour / demain
  for (let i = 0; i < 9; i++) await createSale({ depId: D.after.id, co: corx, seats: await seatsOf(D.after.id, 1 + Math.floor(rnd() * 2)), channel: rnd() > 0.5 ? "GUICHET" : "WEB", method: rnd() > 0.5 ? "CASH" : "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE", agent: pick(AGENTS) });
  for (let i = 0; i < 4; i++) await createSale({ depId: D.night.id, co: corx, seats: await seatsOf(D.night.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });
  for (let i = 0; i < 6; i++) await createSale({ depId: D.t1.id, co: corx, seats: await seatsOf(D.t1.id, 1 + Math.floor(rnd() * 2)), channel: rnd() > 0.5 ? "GUICHET" : "WEB", method: rnd() > 0.5 ? "CASH" : "MOOV_MONEY", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE", agent: pick(AGENTS) });
  for (let i = 0; i < 4; i++) await createSale({ depId: D.t2.id, co: corx, seats: await seatsOf(D.t2.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });
  for (let i = 0; i < 3; i++) await createSale({ depId: D.t4.id, co: corx, seats: await seatsOf(D.t4.id, 1), channel: "WEB", method: "MOOV_MONEY", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });
  // Un paiement en échec + un état INCONNU à rapprocher
  await createSale({ depId: D.t2.id, co: corx, seats: await seatsOf(D.t2.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "ECHEC", bookingStatus: "EN_ATTENTE_PAIEMENT" });
  const unk = await createSale({ depId: D.after.id, co: corx, seats: await seatsOf(D.after.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "INCONNU", bookingStatus: "A_RECONCILIER" });
  if (unk) {
    const pay = await db.payment.findUnique({ where: { bookingId: unk.id } });
    if (pay) {
      await db.payment.update({ where: { id: pay.id }, data: { providerRef: "PAY-INCONNU01" } });
      await db.paymentEvent.create({ data: { paymentId: pay.id, eventToken: randomUUID(), type: "CALLBACK", outcome: "INCONNU", payload: JSON.stringify({ note: "Timeout fournisseur — rapprochement manuel requis" }), processed: true } });
    }
  }
  // Annulation avec remboursement en cours
  const cancelled = await createSale({ depId: D.djg3.id, co: corx, seats: await seatsOf(D.djg3.id, 2), channel: "WEB", method: "MTN_MOMO", payStatus: "REMBOURSE", bookingStatus: "REMBOURSEMENT_EN_COURS", ticketStatus: "ANNULE" });
  if (cancelled) {
    await db.auditLog.create({ data: { companyId: corx.id, actor: "Système", action: "DEPARTURE_CANCELED", entity: "Departure", entityId: D.djg3.id, detail: "Annulation départ — avis envoyé aux passagers, remboursements initiés" } });
    await db.notificationLog.create({ data: { companyId: corx.id, departureId: D.djg3.id, channel: "SMS", template: "AVIS_ANNULATION", recipient: "+229 01 97 …", status: "ENVOYE" } });
  }
  // Retard notifié
  await db.notificationLog.create({ data: { companyId: corx.id, departureId: D.djg1.id, channel: "SMS", template: "AVIS_RETARD", recipient: "+229 01 96 …", status: "ENVOYE" } });
  await db.auditLog.create({ data: { companyId: corx.id, actor: "L. Badirou (Répartiteur)", action: "DEPARTURE_DELAYED", entity: "Departure", entityId: D.djg1.id, detail: "Retard 60 min — embarquement prolongé à Bohicon" } });
  // Vente par capacité (sans plan de sièges) TH-INV-05
  for (let i = 0; i < 8; i++) {
    const d = D.pnoCap;
    const chan = rnd() > 0.5 ? "GUICHET" : "WEB";
    const meth = chan === "GUICHET" ? "CASH" : "MTN_MOMO";
    const b = await db.booking.create({
      data: {
        reference: `TH-${ref(6)}`, companyId: corx.id, departureId: d.id, channel: chan,
        passengerName: pick(NAMES), passengerPhone: phone(), seatCount: 1, seatCodes: null,
        amount: 2500, totalAmount: 2500, status: "CONFIRMEE", paymentMethod: meth,
        agentName: chan === "GUICHET" ? pick(AGENTS) : null,
      },
    });
    await db.payment.create({ data: { bookingId: b.id, provider: meth, providerRef: `PAY-${ref(8)}`, amount: 2500, status: "SUCCES", completedAt: NOW } });
    const code = ticketCode();
    await db.ticket.create({ data: { bookingId: b.id, code, qrPayload: qrPayload(code), status: "VALIDE" } });
    await db.seatOccupancy.create({ data: { departureId: d.id, seatId: null, holdToken: null, status: "CONFIRMED", bookingId: b.id, channel: chan } });
  }
  // Quelques ventes autres compagnies
  for (let i = 0; i < 5; i++) await createSale({ depId: O.s1.id, co: sika, seats: await seatsOf(O.s1.id, 1), channel: "WEB", method: "MTN_MOMO", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });
  for (let i = 0; i < 3; i++) await createSale({ depId: O.b1.id, co: baobab, seats: await seatsOf(O.b1.id, 1), channel: "WEB", method: "MOOV_MONEY", payStatus: "SUCCES", bookingStatus: "CONFIRMEE", ticketStatus: "VALIDE" });

  console.log("→ Journal d'états & audits…");
  for (const d of [D.live, D.after, D.djg1, D.djg3, D.t3]) {
    await db.departureStateLog.create({ data: { departureId: d.id, fromStatus: "BROUILLON", toStatus: "PUBLIE", actor: "L. Badirou (Répartiteur)", reason: null } });
    if (["RETARDE", "ANNULE", "EMBARQUEMENT"].includes(d.status)) {
      await db.departureStateLog.create({ data: { departureId: d.id, fromStatus: "PUBLIE", toStatus: d.status, actor: "L. Badirou (Répartiteur)", reason: d.reason } });
    }
  }
  const counts = {
    companies: await db.company.count(), staffUsers: await db.staffUser.count(), routes: await db.route.count(), vehicles: await db.vehicle.count(),
    departures: await db.departure.count(), seats: await db.seat.count(),
    bookings: await db.booking.count(), tickets: await db.ticket.count(),
    payments: await db.payment.count(), occupancies: await db.seatOccupancy.count(),
    audit: await db.auditLog.count(),
  };
  console.log("✔ Seed terminé :", counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
