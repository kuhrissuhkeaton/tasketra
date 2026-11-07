import { useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { Modal } from "./Modal";

/**
 * Replaces the old mailto: feedback link with an in-app form. Captures the
 * current page path automatically so a report doesn't rely on the person
 * describing where they were -- and lands in the feedback table (visible at
 * /admin/feedback) instead of only ever existing in an inbox.
 *
 * Built on the shared Modal (v153): focus trap, Escape and focus return come
 * from there, not from a private copy.
 */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.submitFeedback(message.trim(), pathname);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that. Try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Send feedback" onClose={onClose}>
      {sent ? (
        <>
          <p className="confirm-message">Thanks -- this goes straight to the person building Tasketra, and gets read.</p>
          <div className="confirm-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <p className="confirm-message" style={{ marginBottom: 12 }}>
            What's broken, missing, or could be better?
          </p>
          <textarea aria-label="Your feedback"
            data-autofocus
            required
            rows={5}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind..."
            style={{ width: "100%" }}
          />
          {error && <div className="form-error">{error}</div>}
          <div className="confirm-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !message.trim()}>
              {busy ? "Sending..." : "Send feedback"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
