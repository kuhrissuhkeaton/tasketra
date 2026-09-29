import { useEffect, useState } from "react";
import { api, type BaselineData } from "../lib/api";
import { fmtDate, fmtLocalDate } from "../lib/format";
import { useConfirm } from "./ConfirmDialog";

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "--";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function signedMoney(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${money(Math.abs(n))}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Lock the baseline once the plan is agreed: a snapshot of every task's dates
 * and the budget. Locking never blocks edits. From then on the card shows what
 * has moved. Only the owner can lock or re-lock; locking again keeps history.
 */
export function BaselineCard({ projectId, isOwner, showBudget }: { projectId: string; isOwner: boolean; showBudget: boolean }) {
  const confirmDialog = useConfirm();
  const [data, setData] = useState<BaselineData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMoved, setShowMoved] = useState(false);

  useEffect(() => {
    api.getBaseline(projectId).then(setData).catch(() => {});
  }, [projectId]);

  async function lock() {
    if (data?.baseline) {
      const ok = await confirmDialog("Re-lock the baseline? Today's plan becomes the new baseline. Earlier baselines are kept as history.");
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      setData(await api.lockBaseline(projectId));
    } catch (err: any) {
      setError(err.message || "Couldn't lock the baseline.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const { baseline, variance, current } = data;
  const drift = variance
    ? variance.movedTasks.length + variance.addedTasks + variance.removedTasks + (variance.budget.delta ?? 0) + (variance.reserve.delta ?? 0)
    : 0;
  const hasBudget = current.budget !== null || current.reserve !== null;

  return (
    <div className="settings-card baseline-card">
      <div className="baseline-head">
        <p className="settings-card-label">Baseline</p>
        <span className={baseline ? "pill pill-green" : "pill pill-gold"}>{baseline ? "Locked" : "Not locked"}</span>
      </div>

      {!baseline ? (
        <>
          <p className="muted">
            Lock the plan once scope, schedule and budget are agreed. Tasketra keeps a snapshot of task dates{showBudget ? " and the budget" : ""}, so you can see what moves after that. Nothing is blocked either way.
          </p>
          <p className="baseline-capture">
            Would capture {plural(current.taskCount, "task")} ({current.datedTaskCount} dated)
            {showBudget && hasBudget && <>, budget {money(current.budget)}{current.reserve !== null ? ` plus ${money(current.reserve)} reserve` : ""}</>}
          </p>
        </>
      ) : (
        <>
          <p className="baseline-capture">
            Locked {fmtDate(baseline.lockedAt)}{baseline.lockedByEmail ? ` by ${baseline.lockedByEmail}` : ""}. It holds {plural(baseline.taskCount, "task")} ({baseline.datedTaskCount} dated)
            {showBudget && baseline.budget !== null && <>, budget {money(baseline.budget)}</>}
            {data.history.length > 1 && <>. {data.history.length} baselines in history.</>}
          </p>
          {variance && drift === 0 && <p className="baseline-drift baseline-ok">Nothing has moved since the baseline.</p>}
          {variance && drift !== 0 && (
            <ul className="baseline-drift-list">
              {variance.movedTasks.length > 0 && (
                <li>
                  {plural(variance.movedTasks.length, "task")} moved since baseline{" "}
                  <button type="button" className="view-banner-link" onClick={() => setShowMoved((v) => !v)} aria-expanded={showMoved}>
                    {showMoved ? "Hide" : "Show"}
                  </button>
                </li>
              )}
              {variance.addedTasks > 0 && <li>{plural(variance.addedTasks, "task")} added since baseline</li>}
              {variance.removedTasks > 0 && <li>{plural(variance.removedTasks, "task")} removed since baseline</li>}
              {showBudget && variance.budget.delta !== null && variance.budget.delta !== 0 && (
                <li>Budget {signedMoney(variance.budget.delta)} ({money(variance.budget.baseline)} to {money(variance.budget.current)})</li>
              )}
              {showBudget && variance.reserve.delta !== null && variance.reserve.delta !== 0 && (
                <li>Reserve {signedMoney(variance.reserve.delta)}</li>
              )}
            </ul>
          )}
          {showMoved && variance && variance.movedTasks.length > 0 && (
            <table className="baseline-moved">
              <thead><tr><th>Task</th><th>Baseline</th><th>Now</th></tr></thead>
              <tbody>
                {variance.movedTasks.slice(0, 15).map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.baselineDue ? fmtLocalDate(t.baselineDue) : "No date"}</td>
                    <td>{t.due ? fmtLocalDate(t.due) : "No date"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {variance && variance.movedTasks.length > 15 && <p className="muted">Showing 15 of {variance.movedTasks.length}.</p>}
        </>
      )}

      {isOwner && (
        <div>
          <button type="button" className={baseline ? "btn btn-ghost" : "btn btn-primary"} disabled={busy} onClick={lock}>
            {busy ? "Locking..." : baseline ? "Re-lock baseline" : "Lock baseline"}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
