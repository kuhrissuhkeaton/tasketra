import { Link } from "react-router-dom";
import { ErrorPage } from "../components/ErrorPage";
import { useDocumentTitle } from "../lib/documentTitle";

export default function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <ErrorPage
      code="404"
      title="This page slipped off the roadmap."
      actions={<Link className="error-btn error-btn-primary" to="/app/projects">Back to my projects</Link>}
    >
      We checked the backlog, the archive and the stakeholder register. The link may be old or mistyped, or the project was deleted or isn't shared with you.
    </ErrorPage>
  );
}
