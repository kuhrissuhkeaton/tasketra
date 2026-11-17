import { Fragment } from "react";
import { LEVEL_LABEL, riskExposure, riskScore, type RiskLevel, type RiskScoring } from "../lib/riskExposure";

type MatrixRisk = { title: string; probability: RiskLevel; impact: RiskLevel } & RiskScoring;

const LEVELS: RiskLevel[] = ["low", "medium", "high"];

/** Band labels with the 1-5 score range each band covers (v157's mapping,
 *  bandForScore), so the 3x3 grid visibly agrees with the numeric scores:
 *  a risk scored P2 x I5 sits in the Low column and the High row, and its
 *  chip says so. */
const BAND_AXIS_LABEL: Record<RiskLevel, string> = {
  low: "Low (1–2)",
  medium: "Medium (3)",
  high: "High (4–5)",
};

/** The chip's short label (v160, F-17): a scored risk carries its numbers
 *  in the register's own format ("P3 · I5 · Score 15"); an unscored one
 *  carries its bands. Either way the chip is short enough never to
 *  truncate mid-word -- the full title lives in the tooltip, and the
 *  cell's count says how many risks the cell holds. */
function chipLabel(r: MatrixRisk): string {
  const score = riskScore(r);
  if (score !== null) return `P${r.probability_score} · I${r.impact_score} · Score ${score}`;
  return `P ${LEVEL_LABEL[r.probability]} · I ${LEVEL_LABEL[r.impact]}`;
}

/** The 3x3 probability x impact grid. chipLimit caps the chips shown per cell
 *  (the rest become "+N more"); pass Infinity on printed pages. */
export function RiskMatrix({ risks, chipLimit = 4 }: { risks: MatrixRisk[]; chipLimit?: number }) {
  return (
    <>
      <div className="risk-matrix-wrap">
        <div className="risk-matrix-axis-y">Impact</div>
        <div className="risk-matrix">
          <div className="risk-matrix-corner" />
          {LEVELS.map((p) => (
            <div key={p} className="risk-matrix-col-label">{BAND_AXIS_LABEL[p]}</div>
          ))}
          {[...LEVELS].reverse().map((impact) => (
            <Fragment key={impact}>
              <div className="risk-matrix-row-label">{BAND_AXIS_LABEL[impact]}</div>
              {LEVELS.map((probability) => {
                const cell = risks.filter((r) => r.probability === probability && r.impact === impact);
                return (
                  <div key={probability} className={`risk-matrix-cell risk-matrix-cell-${riskExposure(probability, impact)}`}>
                    <div className="risk-matrix-cell-count">{cell.length}</div>
                    {cell.slice(0, chipLimit).map((r, i) => (
                      <div key={i} className="risk-matrix-chip" title={r.title}>{chipLabel(r)}</div>
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
