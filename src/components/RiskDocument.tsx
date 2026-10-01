import { RiskMatrix } from "./RiskMatrix";
import { LEVEL_LABEL, riskExposure, type RiskLevel } from "../lib/riskExposure";

export type DocRisk = {
  title: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string | null;
  owner_name: string | null;
  status: "open" | "monitoring" | "resolved";
};

const STATUS_LABEL = { open: "Open", monitoring: "Monitoring", resolved: "Resolved" } as const;
const EXPOSURE_PILL = { low: "pill-green", medium: "pill-gold", high: "pill-red" } as const;
const RANK = { high: 0, medium: 1, low: 2 } as const;

/** The printable risk matrix + register. Used by the signed-in print page and the public share page. */
export function RiskDocument({ projectName, risks, dateLabel }: { projectName: string; risks: DocRisk[]; dateLabel: string }) {
  const sorted = [...risks].sort((a, b) => {
    const s = (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0);
    if (s) return s;
    return RANK[riskExposure(a.probability, a.impact)] - RANK[riskExposure(b.probability, b.impact)];
  });
  const live = risks.filter((r) => r.status !== "resolved");
  return (
    <article className="risk-doc">
      <header className="risk-doc-head">
        <p className="muted risk-doc-kicker">Risk matrix and register</p>
        <h1>{projectName}</h1>
        <p className="muted">{dateLabel} · {live.length} open or monitoring{risks.length > live.length ? `, ${risks.length - live.length} resolved` : ""}</p>
      </header>
      <section>
        <h2>Matrix</h2>
        <p className="muted risk-doc-note">Open and monitoring risks, placed by probability and impact.</p>
        <RiskMatrix risks={live} chipLimit={Infinity} />
      </section>
      <section>
        <h2>Register</h2>
        {sorted.length === 0 ? (
          <p className="muted">No risks recorded.</p>
        ) : (
          <table className="risk-doc-table">
            <thead>
              <tr><th>#</th><th>Risk</th><th>Probability</th><th>Impact</th><th>Exposure</th><th>Mitigation</th><th>Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const exposure = riskExposure(r.probability, r.impact);
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="risk-doc-title">{r.title}</td>
                    <td>{LEVEL_LABEL[r.probability]}</td>
                    <td>{LEVEL_LABEL[r.impact]}</td>
                    <td><span className={`pill ${EXPOSURE_PILL[exposure]}`}>{LEVEL_LABEL[exposure]}</span></td>
                    <td>{r.mitigation || "—"}</td>
                    <td>{r.owner_name || "—"}</td>
                    <td>{STATUS_LABEL[r.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </article>
  );
}
