import { Link } from "react-router-dom";
import { Wordmark } from "../../components/Wordmark";

const DOCS = [
  {
    path: "/legal/terms",
    label: "Terms of Service",
    desc: "The agreement covering your use of Tasketra -- accounts, your project data, beta status, and how the Service works.",
  },
  {
    path: "/legal/privacy",
    label: "Privacy Policy",
    desc: "What information we collect, how we use it, who we share it with, and the rights you have over it.",
  },
  {
    path: "/legal/acceptable-use",
    label: "Acceptable Use Policy",
    desc: "What's not allowed on Tasketra, and how we handle reports of misuse.",
  },
  {
    path: "/legal/cookies",
    label: "Cookie Policy",
    desc: "The one cookie Tasketra sets, what it does, and what we don't use.",
  },
];

export default function LegalHub() {
  return (
    <div className="shell legal-page">
      <header className="topbar">
        <Link to="/" className="brand-lockup-link">
          <Wordmark size="sm" />
        </Link>
        <div className="topbar-right">
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
        </div>
      </header>

      <main className="legal-main">
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, margin: "0 0 6px", color: "var(--navy)" }}>
          Legal
        </h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Clear terms for Tasketra, The Working PM's project management tool. Last updated August 4, 2026.
        </p>

        <div className="legal-hub-grid">
          {DOCS.map((d) => (
            <Link key={d.path} to={d.path} className="legal-hub-card">
              <h2>{d.label}</h2>
              <p>{d.desc}</p>
            </Link>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 28, fontSize: 13.5 }}>
          Questions about any of this? Reach us at{" "}
          <a href="mailto:info@tasketra.com">info@tasketra.com</a>.
        </p>
      </main>
    </div>
  );
}
