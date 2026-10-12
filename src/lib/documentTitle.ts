import { useEffect } from "react";

/**
 * Gives the browser tab, history and screen-reader page announcement a name
 * that says where you are ("Billing | Tasketra") instead of the same title
 * on every page. Restores the previous title when the page unmounts, so a
 * page that does not set one falls back to the default from index.html.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} | Tasketra`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
