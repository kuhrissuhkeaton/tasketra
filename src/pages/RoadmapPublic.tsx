import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type RoadmapItem } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { RoadmapTimeline } from "../components/RoadmapTimeline";

export default function RoadmapPublic() {
  const { token } = useParams<{ token: string }>();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .getPublicRoadmap(token)
      .then(({ project, items }) => {
        setProjectName(project.name);
        setItems(items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="public-roadmap">
        <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /><div className="skel skel-text" style={{ width: "60%", marginBottom: 0 }} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-roadmap">
        <Wordmark size="sm" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="public-roadmap">
      <Wordmark size="sm" />
      <p className="muted">Roadmap for: {projectName}</p>
      <h1>{projectName}</h1>
      <RoadmapTimeline items={items} />
      <p className="muted" style={{ marginTop: 24, fontSize: 12 }}>
        This is a read-only view shared by the project owner. Built with Tasketra.
      </p>
    </div>
  );
}
