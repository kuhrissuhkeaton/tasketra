import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { Wordmark } from "../components/Wordmark";
import { useDocumentTitle } from "../lib/documentTitle";

// Landing page for the link in the confirmation email. Works whether or not
// the person is signed in in this browser (they may open the email on a phone).

export default function VerifyEmail() {
  useDocumentTitle("Confirm your email");
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { user, refresh } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [message, setMessage] = useState(token ? "" : "This link is missing its token. Open the link from your email again, or ask for a new one from inside the app.");
  const [founding, setFounding] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api.verifyEmail(token)
      .then(async (r) => {
        setFounding(r.founding);
        setState("done");
        await refresh();
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Something went wrong.");
        setState("failed");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Wordmark beta />
        {state === "working" && (
          <>
            <h1 className="sr-only">Confirming your email</h1>
            <p className="muted" style={{ marginTop: 16 }}>Confirming your email...</p>
          </>
        )}
        {state === "done" && (
          <>
            <h1 className="auth-tagline">Your email is confirmed</h1>
            {founding && <p>You're a founding member: Pro, free, forever.</p>}
            <Link className="btn btn-primary btn-block" to={user ? "/app" : "/login"}>
              {user ? "Go to Tasketra" : "Sign in"}
            </Link>
          </>
        )}
        {state === "failed" && (
          <>
            <h1 className="auth-tagline">We couldn't confirm that link</h1>
            <div className="form-error">{message}</div>
            <p className="muted">
              Sign in and we'll show you how to get a new link.
            </p>
            <Link className="btn btn-primary btn-block" to={user ? "/app" : "/login"}>
              {user ? "Go to Tasketra" : "Sign in"}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
