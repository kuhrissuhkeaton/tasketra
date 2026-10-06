import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

type ErrorPageProps = {
  code: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
};

/** Shared look for every error screen. Uses no router features, so it also
 * works as the crash fallback that renders outside the router. */
export function ErrorPage({ code, title, children, actions }: ErrorPageProps) {
  return (
    <main className="error-page">
      <Wordmark />
      <div className="error-code"><span>{code}</span></div>
      <h1 className="error-title">{title}</h1>
      {children && <p className="error-text">{children}</p>}
      {actions && <div className="error-actions">{actions}</div>}
    </main>
  );
}
