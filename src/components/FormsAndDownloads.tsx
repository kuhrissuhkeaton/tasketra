import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Project } from "../lib/api";

const FORM_DOCS = [
  { type: "charter", title: "Project Charter", blurb: "Purpose, budget, stakeholders, milestones and top risks from the project, with a sign-off block." },
  { type: "risk-register", title: "Risk Register", blurb: "Every logged risk with probability, impact, exposure, mitigation, owner and status." },
  { type: "raci", title: "RACI matrix (Word)", blurb: "Your live RACI: phases and milestones as rows, the team and stakeholders as columns. Fill it in on the project's RACI section first." },
] as const;

/** Forms the PM hands to other people, in one place. Pick a project; the
 *  documents are built from that project's live data. */
export function FormsAndDownloads() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listProjects().then(({ projects }) => {
      setProjects(projects);
      if (projects.length > 0) setProjectId(projects[0].id);
    }).catch(() => setProjects([]));
  }, []);

  const project = projects?.find((p) => p.id === projectId);

  async function download(type: (typeof FORM_DOCS)[number]["type"], title: string) {
    if (!project) return;
    setError("");
    setBusy(type);
    try {
      await api.downloadTemplate(project.id, type, `${project.name || "tasketra"}-${type}.docx`);
    } catch (e: any) {
      setError(e.message || `Couldn't generate the ${title}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="forms-block">
      {projects === null ? (
        <p className="muted">Loading your projects...</p>
      ) : projects.length === 0 ? (
        <p className="muted">Create a project first. These documents are built from a project's own data.</p>
      ) : (
        <>
          <label className="forms-pick">
            <span className="muted">Build them for</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="template-grid">
            {FORM_DOCS.map((d) => (
              <div className="template-card" key={d.type}>
                <h2 className="heading-sm">{d.title}</h2>
                <p className="muted">{d.blurb}</p>
                <button type="button" className="btn btn-primary" disabled={busy === d.type} onClick={() => download(d.type, d.title)}>
                  {busy === d.type ? "Generating..." : "Download .docx"}
                </button>
              </div>
            ))}
            {/* v174: the printable risk / RACI / stakeholder pages are no
                longer linked from here -- each print view keeps exactly
                two doors (its own section and the project's Export
                section). Learn keeps the downloadable forms above. */}
            <div className="template-card">
              <h2 className="heading-sm">Weekly report</h2>
              <p className="muted">The week's progress, risks and next steps, ready to print or save as PDF.</p>
              <Link className="btn btn-primary" to={`/app/projects/${projectId}?tab=report`}>Open report</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
