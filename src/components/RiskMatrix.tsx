import { Fragment } from "react";
import { LEVEL_LABEL, riskExposure, type RiskLevel } from "../lib/riskExposure";

type MatrixRisk = { title: string; probability: RiskLevel; impact: RiskLevel };

const LEVELS: RiskLevel[] = ["low", "medium", "high"];

/** The 3x3 probability x impact grid. chipLimit caps the titles shown per cell
 *  (the rest become "+N more"); pass Infinity on printed pages. */
export function RiskMatrix({ risks, chipLimit = 4 }: { risks: MatrixRisk[]; chipLimit?: number }) {
  return (
    <>
      <div className="risk-matrix-wrap">
        <div className="risk-matrix-axis-y">Impact</div>
        <div className="risk-matrix">
          <div className="risk-matrix-corner" />
          {LEVELS.map((p) => (
            <div key={p} className="risk-matrix-col-label">{LEVEL_LABEL[p]}</div>
          ))}
          {[...LEVELS].reverse().map((impact) => (
            <Fragment key={impact}>
              <div className="risk-matrix-row-label">{LEVEL_LABEL[impact]}</div>
              {LEVELS.map((probability) => {
                const cell = risks.filter((r) => r.probability === probability && r.impact === impact);
                return (
                  <div key={probability} className={`risk-matrix-cell risk-matrix-cell-${riskExposure(probability, impact)}`}>
                    <div className="risk-matrix-cell-count">{cell.length}</div>
                    {cell.slice(0, chipLimit).map((r, i) => (
                      <div key={i} className="risk-matrix-chip" title={r.title}>{r.title}</div>
                    ))}
                    {cell.length > chipLimit && <div className="risk-matrix-chip muted">+{cell.length - chipLimit} more</div>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="risk-matrix-axis-x">Probability</div>
    </>
  );
}
