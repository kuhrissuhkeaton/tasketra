import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Project, type RaciData } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { RaciDocument } from "../components/RaciDocument";
import { ShareBox } from "../components/ShareBox";

// Signed-in printable RACI page. Anyone with project access can print it;
// only the owner sees the share-link controls.
export default function RaciPrint() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [data, setData] = useState<RaciData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProject(id), api.getRaci(id)])
      .then(([p, r]) => { setProject(p.project); setData(r); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="public-roadmap"><Wordmark size="sm" /><p className="form-error">{error}</p></div>;
  if (!project || !data) return <div className="public-roadmap"><div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /></div></div>;

  return (
    <div className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Link to={`/app/projects/${id}?tab=raci`} className="muted">← Back to the RACI tab</Link>
        <div className="share-public-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      {project.is_owner === true && (
        <ShareBox
          projectId={project.id}
          kind="raci"
          recipientsSee="They see the phases and milestones, each person's name and job role, and the R, A, C and I letters. Email addresses are never included."
        />
      )}

      <RaciDocument
        projectName={project.name}
        rows={data.rows}
        people={data.people}
        assignments={data.assignments}
        dateLabel={new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      />
    </div>
  );
}
