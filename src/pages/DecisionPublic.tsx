import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Logomark } from "../components/Wordmark";
import { fmtDateTime, fmtLocalDate } from "../lib/format";
import { useDocumentTitle } from "../lib/documentTitle";
import { track } from "../lib/analytics";

// v175: the one invitation this page makes, held in a single constant so
// the wording can change in exactly one place. Variant A, picked from the
// decision-link spec. The destination is a free account (never a plan
// pitch); the src marker rides along so a signup that began on a decision
// page is attributable in the signup events (see Login.tsx).
const DECISION_LINK_CTA = {
  headline: "Decisions like this one are kept on record with Tasketra.",
  smallLine: "Free for up to 3 projects. No card to start.",
  button: "Start free",
  href: "/login?mode=register&src=decision-link",
} as const;

// The branded band every state of this page opens with: the Level mark and
// the wordmark on the brand's dark green. This page is the one place a
// person outside the app meets Tasketra, so it stops being anonymous.
function BrandBand() {
  return (
    <header className="public-decision-brand">
      <Logomark size={40} />
      <span className="public-decision-brand-name">tasketra</span>
    </header>
  );
}

export default function DecisionPublic() {
  const { token } = useParams<{ token: string }>();
  const [decision, setDecision] = useState<Awaited<ReturnType<typeof api.getPublicDecision>>["decision"] | null>(null);
  const [record, setRecord] = useState<Awaited<ReturnType<typeof api.getPublicDecision>>["record"] | null>(null);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // v151: a just-submitted RESPONSE is not the decision yet -- the project
  // owner confirms the outcome. The thanks state says so; only a record
  // loaded already-resolved shows the decided state.
  const [justSubmitted, setJustSubmitted] = useState(false);

  // v175: a neutral tab title. The decision's own title renders in the page
  // body, where the link-holder is meant to read it -- not in the browser
  // tab and history of everyone who opens the link.
  useDocumentTitle("Decision request");
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .getPublicDecision(token)
      .then(({ decision, record }) => {
        setDecision(decision);
        setRecord(record);
        // State only, never the record's content (see lib/analytics).
        track("decision_link_viewed", { state: decision.status === "resolved" ? "decided" : "open" });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !chosen || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { record } = await api.respondToDecision(token, chosen, name.trim());
      setRecord(record);
      setJustSubmitted(true);
      track("decision_link_responded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="public-decision"><BrandBand /><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div></main>;

  if (error && !decision) {
    return (
      <main className="public-decision">
        <BrandBand />
        <p className="form-error">{error}</p>
      </main>
    );
  }

  if (!decision) return null;

  return (
    <main className="public-decision">
      <BrandBand />
      <p className="public-decision-eyebrow">A decision on the record</p>
      <p className="muted">Regarding project: {decision.project_name}</p>
      <h1>{decision.title}</h1>
      {decision.context && <p className="decision-context">{decision.context}</p>}
      {decision.deadline && <p className="muted">Needed by: {fmtLocalDate(decision.deadline)}</p>}

      {record ? (
        justSubmitted ? (
          <div className="decision-record-card">
            <p>
              <strong>{record.chosen_option}</strong> · recorded for <strong>{record.responder_name}</strong>
            </p>
            <p className="muted">{fmtDateTime(record.responded_at)}</p>
            <p className="muted">Thanks, your response was recorded. The project owner will confirm the final decision.</p>
          </div>
        ) : (
          <div className="decision-record-card">
            <p><span className="decision-decided-marker">Decided</span></p>
            <p>
              <strong>{record.chosen_option}</strong> · response by <strong>{record.responder_name}</strong>
            </p>
            <p className="muted">{fmtDateTime(record.responded_at)}</p>
            <p className="muted">This decision has been decided. You can close this page.</p>
          </div>
        )
      ) : (
        <form className="stacked-form" onSubmit={submit}>
          <label>Your response</label>
          <p className="muted">Your response is recorded for the project team, and your name and choice will be visible to anyone with this link once the owner confirms the decision. The owner confirms the final outcome.</p>
          <div className="option-list">
            {decision.options.map((opt) => (
              <label key={opt} className="option-row">
                <input type="radio" name="option" value={opt} checked={chosen === opt} onChange={() => setChosen(opt)} />
                {opt}
              </label>
            ))}
          </div>
          <label htmlFor="f-decisionpublic-85">Your name</label>
          <input id="f-decisionpublic-85" value={name} onChange={(e) => setName(e.target.value)} required />
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={submitting || !chosen}>
            {submitting ? "Submitting..." : "Submit response"}
          </button>
        </form>
      )}

      <footer className="public-decision-footer">
        <p className="public-decision-cta-line">{DECISION_LINK_CTA.headline}</p>
        <p className="muted">{DECISION_LINK_CTA.smallLine}</p>
        <a className="btn btn-primary" href={DECISION_LINK_CTA.href} onClick={() => track("decision_link_cta_clicked")}>
          {DECISION_LINK_CTA.button}
        </a>
      </footer>
    </main>
  );
}
