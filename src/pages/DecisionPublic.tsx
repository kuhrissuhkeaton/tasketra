import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Wordmark } from "../components/Wordmark";

export default function DecisionPublic() {
  const { token } = useParams<{ token: string }>();
  const [decision, setDecision] = useState<Awaited<ReturnType<typeof api.getPublicDecision>>["decision"] | null>(null);
  const [record, setRecord] = useState<Awaited<ReturnType<typeof api.getPublicDecision>>["record"] | null>(null);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getPublicDecision(token)
      .then(({ decision, record }) => {
        setDecision(decision);
        setRecord(record);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="public-decision"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div></div>;

  if (error && !decision) {
    return (
      <div className="public-decision">
        <Wordmark size="sm" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!decision) return null;

  return (
    <div className="public-decision">
      <Wordmark size="sm" />
      <p className="muted">Regarding project: {decision.project_name}</p>
      <h1>{decision.title}</h1>
      {decision.context && <p className="decision-context">{decision.context}</p>}
      {decision.deadline && <p className="muted">Requested by: {decision.deadline}</p>}

      {record ? (
        <div className="decision-record-card">
          <p>
            <strong>{record.chosen_option}</strong> -- recorded for <strong>{record.responder_name}</strong>
          </p>
          <p className="muted">{new Date(record.responded_at).toLocaleString()}</p>
          <p className="muted">This decision has been recorded. You can close this page.</p>
        </div>
      ) : (
        <form className="stacked-form" onSubmit={submit}>
          <label>Your response</label>
          <div className="option-list">
            {decision.options.map((opt) => (
              <label key={opt} className="option-row">
                <input type="radio" name="option" value={opt} checked={chosen === opt} onChange={() => setChosen(opt)} />
                {opt}
              </label>
            ))}
          </div>
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={submitting || !chosen}>
            {submitting ? "Submitting..." : "Submit response"}
          </button>
        </form>
      )}
    </div>
  );
}
