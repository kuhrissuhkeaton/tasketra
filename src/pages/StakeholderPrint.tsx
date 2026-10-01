import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type Stakeholder } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { StakeholderGrid } from "../components/StakeholderGrid";

// Signed-in printable Power / Interest grid. There is deliberately no public
// share link: it lists people by name, and a stakeholder register is often
// the most sensitive page in a project.
export default function StakeholderPrint() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [people, setPeople] = useState<Stakeholder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProject(id), api.listStakeholders(id)])
      .then(([p, s]) => { setProject(p.project); setPeople(s.stakeholders); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="public-roadmap"><Wordmark size="sm" /><p className="form-error">{error}</p></div>;
  if (!project || !people) return <div className="public-roadmap"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /></div></div>;

  return (
    <div className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Link to={`/app/projects/${id}?tab=stakeholders`} className="muted">← Back to Stakeholders</Link>
        <div className="share-public-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
      <article className="risk-doc">
        <header className="risk-doc-head">
          <p className="muted risk-doc-kicker">Stakeholder power / interest grid</p>
          <h1>{project.name}</h1>
          <p className="muted">{new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
        </header>
        <StakeholderGrid stakeholders={people} />
      </article>
    </div>
  );
}
