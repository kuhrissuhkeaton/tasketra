import { Link } from "react-router-dom";
import { ErrorPage } from "../components/ErrorPage";

export default function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="This page slipped off the roadmap."
      actions={<Link className="error-btn error-btn-primary" to="/app">Back to my projects</Link>}
    >
      We checked the backlog, the archive and the stakeholder register. The link may be old or mistyped, or the project was deleted or isn't shared with you.
    </ErrorPage>
  );
}
