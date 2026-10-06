import { Link } from "react-router-dom";
import { ErrorPage } from "../components/ErrorPage";

export default function Forbidden() {
  return (
    <ErrorPage
      code="403"
      title="You're not on the RACI for this one."
      actions={<Link className="error-btn error-btn-primary" to="/app">Back to my projects</Link>}
    >
      This page is for a different role than yours. If you think that's a mistake, email info@tasketra.com.
    </ErrorPage>
  );
}
