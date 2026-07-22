import { ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "play-pack-pilot:safety-warning-ack:v1";

export function TermsWarningModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpen(window.localStorage.getItem(STORAGE_KEY) !== "acknowledged");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function acknowledge() {
    window.localStorage.setItem(STORAGE_KEY, "acknowledged");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-panel p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
            <ShieldAlert size={21} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-foreground">Review official terms before every entry</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Play Pack Pilot helps you research and organize opportunities. The sponsor's official rules and your own review control every entry.
                </p>
              </div>
              <button
                aria-label="Close safety warning"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-muted hover:text-foreground"
                type="button"
                onClick={acknowledge}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm leading-6 text-muted">
              <p>No automatic submissions, CAPTCHA solving, bot-protection bypass, proxy rotation, or hidden entry automation.</p>
              <p>Play Pack Pilot is not the sponsor and does not guarantee eligibility, listing accuracy, or winnings.</p>
              <p>Only mark an opportunity entered after you personally review the official rules and complete the sponsor's live form.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button className="h-10 rounded-full bg-reward px-4 text-sm font-bold text-[#111827]" type="button" onClick={acknowledge}>
                I Understand
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
