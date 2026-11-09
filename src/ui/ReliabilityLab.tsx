import React, { useState } from "react";
import { FlaskConical, CheckCircle2 } from "lucide-react";
import { RELIABILITY_CASES, simulateReliability } from "../shared/reliability";
import { money } from "../shared/domain";
export default function ReliabilityLab() {
  const [result, setResult] = useState<ReturnType<
    typeof simulateReliability
  > | null>(null);
  return (
    <section className="panel product-lab reliability-lab">
      <div className="panel-heading">
        <div>
          <span className="tag soft">
            <FlaskConical size={14} />
            LOCAL SIMULATION
          </span>
          <h2>What happens when a payment gets interrupted?</h2>
          <p>
            Explore the control model. These cases make no AI or PayPal calls
            and change no actual allowance.
          </p>
        </div>
      </div>
      <div className="reliability-cases">
        {RELIABILITY_CASES.map((s) => (
          <button
            key={s.id}
            className={result?.scenario.id === s.id ? "selected" : ""}
            onClick={() => setResult(simulateReliability(s.id))}
          >
            <strong>{s.name}</strong>
            <span>{s.detail}</span>
          </button>
        ))}
      </div>
      {result && (
        <div
          className="simulation-result"
          role="region"
          aria-label="Simulation result"
        >
          <div className="proof-section-heading">
            <h3>{result.scenario.name}</h3>
            <span className="tag soft">
              <CheckCircle2 size={15} />
              {result.pass
                ? "Expected model outcome"
                : "Unexpected model outcome"}
            </span>
          </div>
          <div className="table-scroll">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Simulated step</th>
                  <th>State</th>
                  <th>Available</th>
                  <th>Reserved</th>
                  <th>Spent</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((step, i) => (
                  <tr key={i}>
                    <td>{step.action.replaceAll("-", " ")}</td>
                    <td>{step.state.status}</td>
                    <td>{money(step.state.available)}</td>
                    <td>{money(step.state.reserved)}</td>
                    <td>{money(step.state.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine-print">
            Model outcome: {result.state.captures} simulated capture,{" "}
            {result.state.refunds} simulated refund, {result.state.deliveries}{" "}
            notification deliveries. This model illustrates control behaviour;
            actual HTTP-handler tests and the recorded sandbox run provide
            separate implementation evidence.
          </p>
        </div>
      )}
    </section>
  );
}
