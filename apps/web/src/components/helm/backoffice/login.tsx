"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { HelmMark } from "@/components/helm/shared/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/store/helm";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck, UserCog } from "lucide-react";

interface DemoAccount {
  email: string;
  fullName: string;
  role: string;
  roleDescription: string;
  company: { name: string; brandColor: string } | null;
}

export function Login({ onLoggedIn, onBack }: { onLoggedIn: (u: SessionUser) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [hint, setHint] = useState("");

  useEffect(() => {
    fetch("/api/helm/auth/demo-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.accounts) {
          setAccounts(d.accounts);
          setHint(d.hint ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function login(mail: string, pass: string) {
    if (!mail.trim() || !pass) {
      toast.error("Renseignez votre e-mail et votre mot de passe.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/helm/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail.trim(), password: pass }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Connexion impossible");
      toast.success(`Bienvenue, ${d.user.fullName.split(" ")[0]}`, {
        description: `${d.user.company?.name ?? "Travel Helm (support)"} · rôle ${d.user.role}`,
      });
      onLoggedIn(d.user as SessionUser);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1.05fr_1fr]"
      >
        {/* Formulaire */}
        <div className="helm-hero-glow rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour aux voyageurs
            </button>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
              <LockKeyhole className="h-3 w-3" /> Session signée · 12 h
            </span>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <HelmMark size={34} className="text-emerald-400" />
            <div>
              <h1 className="text-[19px] font-semibold tracking-tight">Espace compagnie</h1>
              <p className="text-[12px] text-muted-foreground">Inventaire central Travel Helm — accès réservé au personnel.</p>
            </div>
          </div>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login(email, password);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">E-mail professionnel</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email" type="email" autoComplete="username" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="gerant@corridorexpress.bj"
                  className="h-11 border-border bg-secondary/50 pl-9 text-[13px]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Mot de passe</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="h-11 border-border bg-secondary/50 pl-9 text-[13px]"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full cursor-pointer text-[13px] font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Se connecter
            </Button>
          </form>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Les mots de passe sont hachés (scrypt) côté serveur et ne transitent jamais en clair dans les journaux.
            La multi-compagnie est cloisonnée : chaque session ne voit que les données de sa compagnie (TH-ADM-04).
          </p>
        </div>

        {/* Comptes de démonstration */}
        <div className="rounded-2xl border border-border bg-secondary/30 p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-amber-400" />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Comptes de démonstration</h2>
          </div>
          {hint && <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">{hint}</p>}
          <div className="mt-4 grid max-h-[430px] gap-2 overflow-y-auto pr-1 thin-scroll">
            {accounts.length === 0 && (
              <p className="text-[12px] text-muted-foreground">Chargement… (l&apos;API doit être démarrée)</p>
            )}
            {accounts.map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email);
                  setPassword("demo1234");
                  login(a.email, "demo1234");
                }}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-emerald-500/40"
              >
                <span
                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10.5px] font-bold text-white")}
                  style={{ background: a.company?.brandColor ?? "#57534e" }}
                >
                  {(a.company?.name ?? "TH").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold leading-tight">{a.fullName}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{a.email}</span>
                </span>
                <span className="shrink-0 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground group-hover:border-emerald-500/40 group-hover:text-emerald-300">
                  {a.role}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[10.5px] leading-relaxed text-muted-foreground">
            Un clic connecte directement avec le mot de passe commun de démo. En production, ces comptes
            n&apos;apparaissent pas (HELM_DEMO=0) et chaque compagnie gère ses accès.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
