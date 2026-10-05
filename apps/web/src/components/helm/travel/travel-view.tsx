"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useHelm, type TravelStep } from "@/store/helm";
import { HeroSearch } from "./hero-search";
import { ResultsView } from "./results";
import { SeatSelection } from "./seat-selection";
import { Checkout } from "./checkout";
import { TicketView } from "./ticket-view";
import { MyTickets } from "./my-tickets";
import { cn } from "@/lib/utils";
import { Search, ListOrdered, Armchair, CreditCard, Ticket, BookOpen } from "lucide-react";

const STEP_META: { key: TravelStep; label: string; icon: typeof Search }[] = [
  { key: "search", label: "Recherche", icon: Search },
  { key: "results", label: "Départs", icon: ListOrdered },
  { key: "seats", label: "Places", icon: Armchair },
  { key: "checkout", label: "Paiement", icon: CreditCard },
  { key: "ticket", label: "Billet", icon: Ticket },
];

export function StepBar() {
  const step = useHelm((s) => s.step);
  const activeIndex = STEP_META.findIndex((s) => s.key === step);
  return (
    <div className="mx-auto mb-6 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-card px-1.5 py-1 shadow-sm thin-scroll sm:mb-8">
      {STEP_META.map(({ key, label, icon: Icon }, i) => {
        const active = i <= activeIndex;
        const current = i === activeIndex;
        return (
          <div key={key} className="flex items-center">
            {i > 0 && <span className={cn("h-4 w-px", active ? "bg-emerald-600/40" : "bg-border")} />}
            <button
              onClick={() => useHelm.getState().setStep(key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors cursor-pointer",
                current ? "bg-emerald-600 text-white shadow-[0_3px_10px_-3px_rgba(6,95,70,0.5)]" : active ? "text-emerald-800" : "text-muted-foreground hover:text-foreground"
              )}
              disabled={i > activeIndex}
              style={i > activeIndex ? { cursor: "default" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function TravelView() {
  const step = useHelm((s) => s.step);

  return (
    <div className="flex-1 bg-background">
      {step !== "search" && step !== "mytickets" && <div className="pt-5"><StepBar /></div>}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === "search" && <HeroSearch />}
          {step === "results" && <ResultsView />}
          {step === "seats" && <SeatSelection />}
          {step === "checkout" && <Checkout />}
          {step === "ticket" && <TicketView />}
          {step === "mytickets" && <MyTickets />}
        </motion.div>
      </AnimatePresence>
      {step === "search" && (
        <div className="pb-6 pt-2 text-center">
          <button
            onClick={() => useHelm.getState().setStep("mytickets")}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-emerald-800 underline decoration-emerald-300 decoration-2 underline-offset-4 hover:text-emerald-700 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            Retrouver mes billets (référence ou téléphone)
          </button>
        </div>
      )}
    </div>
  );
}
