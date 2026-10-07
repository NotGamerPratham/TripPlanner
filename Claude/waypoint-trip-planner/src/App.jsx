import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { decodeTrip, readSharedFromHash } from "./lib/share.js";
import { useTrip } from "./store/useTrip.js";
import Hero from "./components/Hero.jsx";
import PlannerForm from "./components/PlannerForm.jsx";
import LiveDashboard from "./components/LiveDashboard.jsx";
import ChatAssistant from "./components/ChatAssistant.jsx";
import { Footer, Nav, ScrollProgress, Toasts, TripsDrawer } from "./components/Chrome.jsx";

// Map (Leaflet) and drag-and-drop code only load once a trip exists.
const NearbyExplorer = lazy(() => import("./components/NearbyExplorer.jsx"));
const PlanSection = lazy(() => import("./components/PlanSection.jsx"));
const TripDetails = lazy(() => import("./components/TripDetails.jsx"));
const BudgetPanel = lazy(() => import("./components/BudgetPanel.jsx"));
const Essentials = lazy(() => import("./components/Essentials.jsx"));

export default function App() {
  const loadHealth = useTrip((s) => s.loadHealth);
  const loadTrip = useTrip((s) => s.loadTrip);
  const toast = useTrip((s) => s.toast);
  const hasTrip = useTrip((s) => Boolean(s.request));
  const [tripsOpen, setTripsOpen] = useState(false);
  const closeTrips = useCallback(() => setTripsOpen(false), []);

  useEffect(() => {
    loadHealth();
    const encoded = readSharedFromHash();
    if (!encoded) return;
    decodeTrip(encoded)
      .then((trip) => {
        loadTrip(trip);
        toast("Shared trip opened — save it to keep a copy.", "good");
        history.replaceState(null, "", window.location.pathname + window.location.search);
        setTimeout(() => document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth" }), 400);
      })
      .catch((err) => toast(err.message, "bad"));
  }, [loadHealth, loadTrip, toast]);

  return (
    <>
      <a
        href="#plan"
        className="sr-only z-[80] rounded-full bg-sun px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to the planner
      </a>
      <ScrollProgress />
      <Nav onOpenTrips={() => setTripsOpen(true)} />
      <main id="top">
        <Hero />
        <PlannerForm />
        <LiveDashboard />
        {hasTrip && (
          <Suspense fallback={<div className="mx-auto h-96 max-w-6xl" aria-busy="true" />}>
            <NearbyExplorer />
            <PlanSection />
            <TripDetails />
            <BudgetPanel />
            <Essentials />
          </Suspense>
        )}
      </main>
      <Footer />
      <ChatAssistant />
      <TripsDrawer open={tripsOpen} onClose={closeTrips} />
      <Toasts />
    </>
  );
}
