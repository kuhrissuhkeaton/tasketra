import { Link } from "react-router-dom";
import { Wordmark } from "./Wordmark";

const DOCS = [
  { path: "/legal/terms", label: "Terms of Service" },
  { path: "/legal/privacy", label: "Privacy Policy" },
  { path: "/legal/acceptable-use", label: "Acceptable Use Policy" },
  { path: "/legal/cookies", label: "Cookie Policy" },
];

type LegalLayoutProps = {
  title: string;
  updated: string;
  children: React.ReactNode;
};

/** Shared wrapper for the four public /legal/* pages -- a lightweight
 *  version of the Landing page's topbar, plus cross-nav between the docs
 *  so a reader (or a link from the footer/signup form) always lands
 *  somewhere they can get to the others. */
export function LegalLayout({ title, updated, children }: LegalLayoutProps) {
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
        <nav className="legal-crossnav" aria-label="Legal documents">
          <Link to="/legal">All legal documents</Link>
          {DOCS.map((d) => (
            <Link key={d.path} to={d.path} className="legal-crossnav-link">
              {d.label}
            </Link>
          ))}
        </nav>

        <article className="legal-article">
          <h1>{title}</h1>
          <p className="muted legal-updated">Last updated: {updated}</p>
          {children}
        </article>
      </main>
    </div>
  );
}
