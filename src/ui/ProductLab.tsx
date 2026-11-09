import React, { useState } from "react";
import { FlaskConical, TrendingUp } from "lucide-react";
import {
  CATALOG,
  money,
  parseMoney,
  type Policy,
  type ProposalVersion,
  type Purchase,
} from "../shared/domain";
import { previewPolicy, projectCost } from "../shared/analytics";

export function CostComparison({ quantity }: { quantity: number }) {
  const [months, setMonths] = useState(12);
  return (
    <section className="panel product-lab cost-comparison">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">THE COMMITMENT BEHIND THE PRICE</span>
          <h2>Compare the cost over time.</h2>
        </div>
        <TrendingUp size={22} />
      </div>
      <div className="lab-controls">
        <label className="field">
          Projection period
          <select
            aria-label="Projection period"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            {[1, 3, 6, 12, 24].map((n) => (
              <option key={n} value={n}>
                {n} month{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <p>
          Base-price projection for {quantity} licences. Assumes continuous use
          and unchanged prices; excludes unquoted charges.
        </p>
      </div>
      <div className="cost-cards">
        {CATALOG.map((o) => {
          const projected = projectCost(o.id, quantity, months);
          return (
            <article key={o.id}>
              <span className="eyebrow">
                {o.billing === "monthly"
                  ? "RECURRING"
                  : o.billing === "once"
                    ? "ONE-TIME"
                    : "TERMS MISSING"}
              </span>
              <h3>{o.name}</h3>
              <strong>
                {projected === null ? "Needs review" : money(projected)}
              </strong>
              <p>
                {o.billing === "monthly"
                  ? `${money(o.unitPrice * quantity)} each month × ${months}`
                  : o.billing === "once"
                    ? "One base charge over this period"
                    : "Renewal terms are not known"}
              </p>
            </article>
          );
        })}
      </div>
      <p className="fine-print">
        A projection is not a quote, a payment, or realized savings. The server
        still checks the actual proposal and your one-time purchase policy.
      </p>
    </section>
  );
}

export function PolicyPlayground({
  policy,
  available,
  purchases,
  versions,
}: {
  policy: Policy;
  available: number;
  purchases: Purchase[];
  versions: ProposalVersion[];
}) {
  const [cap, setCap] = useState(String(policy.maxTotal / 100)),
    [quantity, setQuantity] = useState(policy.maxQuantity),
    [once, setOnce] = useState(policy.oneTimeOnly);
  let rows: ReturnType<typeof previewPolicy> = [],
    error = "";
  try {
    const maxTotal = parseMoney(cap);
    if (
      maxTotal < 1 ||
      maxTotal > 1000000 ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    )
      throw new Error(
        "Enter a cap from $0.01 to $10,000 and a quantity from 1 to 100.",
      );
    rows = previewPolicy(
      versions,
      purchases,
      { ...policy, maxTotal, maxQuantity: quantity, oneTimeOnly: once },
      available,
    );
  } catch (e) {
    error = (e as Error).message;
  }
  const changed = rows.filter((r) => r.recorded !== r.preview.decision).length;
  return (
    <section className="panel product-lab policy-playground">
      <div className="panel-heading">
        <div>
          <span className="tag soft">
            <FlaskConical size={14} />
            PREVIEW ONLY
          </span>
          <h2>What would a different policy change?</h2>
          <p>
            Recheck recorded proposals using the current catalogue and{" "}
            {money(available)} currently available.
          </p>
        </div>
        <span className="preview-count">
          {changed}
          <small>different outcomes</small>
        </span>
      </div>
      <div className="lab-controls">
        <label className="field">
          Preview purchase cap · USD
          <input
            type="number"
            value={cap}
            min="0.01"
            max="10000"
            step="0.01"
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <label className="field">
          Preview maximum quantity
          <input
            type="number"
            min="1"
            max="100"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={once}
            onChange={(e) => setOnce(e.target.checked)}
          />
          Require one-time billing
        </label>
      </div>
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : rows.length ? (
        <div className="table-scroll">
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Purchase / version</th>
                <th>Recorded</th>
                <th>Preview</th>
                <th>Reason to inspect</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.purchaseId}:${r.version}`}>
                  <td>
                    {purchases.find((p) => p.id === r.purchaseId)?.title}
                    <small>Version {r.version}</small>
                  </td>
                  <td>{r.recorded}</td>
                  <td>
                    <span
                      className={
                        "outcome-pill " + r.preview.decision.toLowerCase()
                      }
                    >
                      {r.preview.decision}
                    </span>
                  </td>
                  <td>
                    {r.preview.checks
                      .filter((c) => c.outcome !== "pass")
                      .map((c) => c.detail)
                      .join(" · ") || "Every preview check passed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="quiet-state">
          Evaluate a proposal first to explore its policy impact.
        </p>
      )}
      <div className="callout">
        <FlaskConical size={18} />
        <p>
          This preview changes no active policy, approval, allowance, or
          payment. Historical decisions stay intact. Hypothetical billing
          permission does not revise the original purchase brief.
        </p>
      </div>
    </section>
  );
}
