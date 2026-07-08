import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSweepScoutServiceWorker } from "@/lib/pwa";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    registerSweepScoutServiceWorker().catch((error: unknown) => {
      console.warn("SweepScout service worker registration failed.", error);
    });
  });
}
