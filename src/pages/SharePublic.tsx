import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type SharedDocument } from "../lib/api";
import { Wordmark } from "../components/Wordmark";
import { RiskDocument } from "../components/RiskDocument";
import { RaciDocument } from "../components/RaciDocument";

// Public, read-only view of a shared document. Works for any signed-out
// visitor; the server only returns it while the owner's link is active.
export default function SharePublic() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    if (!token) return;
    api.getSharedDocument(token).then(setData).catch((e) => setError(e.message));
  }, [token]);

  const dateLabel = `As of ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;

  return (
    <div className="public-roadmap share-public">
      <div className="no-print share-public-bar">
        <Wordmark size="sm" />
        {data && <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>}
      </div>
      {error ? (
        <p className="form-error">{error}</p>
      ) : !data ? (
        <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /></div>
      ) : (
        <>
          {data.kind === "raci" ? (
            <RaciDocument projectName={data.project.name} rows={data.rows} people={data.people} assignments={data.assignments} dateLabel={dateLabel} />
          ) : (
            <RiskDocument projectName={data.project.name} risks={data.risks} dateLabel={dateLabel} />
          )}
          <p className="muted no-print" style={{ marginTop: 24, fontSize: 12 }}>
            This is a read-only view shared by the project owner. Built with Tasketra.
          </p>
        </>
      )}
    </div>
  );
}
