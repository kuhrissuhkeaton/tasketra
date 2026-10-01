import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type Risk } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { RiskDocument } from "../components/RiskDocument";
import { ShareBox } from "../components/ShareBox";

// Signed-in printable risk page. Anyone with project access can print it;
// only the owner sees the share-link controls.
export default function RiskPrint() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProject(id), api.listRisks(id)])
      .then(([p, r]) => { setProject(p.project); setRisks(r.risks); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="public-roadmap"><Wordmark size="sm" /><p className="form-error">{error}</p></div>;
  if (!project) return <div className="public-roadmap"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /></div></div>;

  const shown = risks.filter((r) => includeResolved || r.status !== "resolved");

  return (
    <div className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Link to={`/app/projects/${id}`} className="muted">← Back to {project.name}</Link>
        <div className="share-public-actions">
          <label className="share-check">
            <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} /> Include resolved
          </label>
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      {project.is_owner === true && (
        <ShareBox
          projectId={project.id}
          kind="risk-matrix"
          recipientsSee="They see open and monitoring risks with title, probability, impact, mitigation and owner. Risk descriptions and resolved items are never included."
        />
      )}

      <RiskDocument
        projectName={project.name}
        risks={shown}
        dateLabel={new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      />
    </div>
  );
}
