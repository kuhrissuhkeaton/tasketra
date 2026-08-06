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
