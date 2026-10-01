import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0, // error tracking only, no perf tracing overhead
    environment: import.meta.env.MODE,
  });
}

// After a deploy, a tab that was already open still points at page files with
// the old hashed names, which no longer exist, so opening a new page fails.
// Vite fires this event when that happens: reload once to pick up the new
// version. The sessionStorage stamp stops a reload loop if the failure is a
// real outage rather than a stale tab (storage errors just skip the guard).
window.addEventListener("vite:preloadError", (event) => {
  try {
    const last = Number(sessionStorage.getItem("tasketra:preload-reload") || 0);
    if (Date.now() - last < 30000) return;
    sessionStorage.setItem("tasketra:preload-reload", String(Date.now()));
  } catch {
    // no storage: reload once anyway
  }
  event.preventDefault();
  window.location.reload();
});

function ErrorFallback() {
  return (
    <div className="shell" style={{ padding: 24 }}>
      <h2>Something went wrong</h2>
      <p className="muted">
        This has been reported automatically. Try reloading the page.
      </p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
