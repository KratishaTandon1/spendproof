import React from "react";
import { CheckCircle2, ChevronDown, CircleHelp, XCircle } from "lucide-react";
import type { Check } from "../shared/domain";

function CheckRow({ check }: { check: Check }) {
  const failedLabels: Record<string, string> = {
    QUANTITY: "Quantity does not match your rules",
    CURRENCY: "Currency is not permitted",
    MERCHANT: "Merchant is not approved",
    TERMS_MATCH: "Proposal differs from the source terms",
    EVIDENCE: "Source evidence could not be supported",
    BILLING: "Recurring billing detected",
    REQUEST_CAP: "Purchase limit exceeded",
    POLICY_CAP: "Policy limit exceeded",
    ALLOWANCE: "Available allowance is too low",
  };
  return (
    <div className={"rule-check " + check.outcome}>
      {check.outcome === "pass" ? (
        <CheckCircle2 size={17} />
      ) : check.outcome === "fail" ? (
        <XCircle size={17} />
      ) : (
        <CircleHelp size={17} />
      )}
      <div>
        <strong>
          {check.outcome === "fail"
            ? failedLabels[check.code] || check.label
            : check.outcome === "unknown" && check.code === "BILLING"
              ? "Billing terms need review"
              : check.label}
        </strong>
        <p>{check.detail}</p>
        {check.evidence && (
          <details>
            <summary>View source evidence</summary>
            <blockquote>{check.evidence}</blockquote>
          </details>
        )}
      </div>
    </div>
  );
}

export default function DecisionChecks({ checks }: { checks: Check[] }) {
  const issues = checks.filter((check) => check.outcome !== "pass");
  const passed = checks.filter((check) => check.outcome === "pass");
  return (
    <div className="decision-checks">
      {issues.length > 0 && (
        <div
          className="decision-issues"
          aria-label="Checks that need attention"
        >
          {issues.map((check) => (
            <CheckRow key={check.code} check={check} />
          ))}
        </div>
      )}
      {passed.length > 0 && (
        <details className="passed-checks">
          <summary>
            <CheckCircle2 size={17} />
            <span>
              <strong>
                {passed.length} of {checks.length} checks passed
              </strong>
              <small>Inspect the rules and their source evidence</small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="passed-check-list">
            {passed.map((check) => (
              <CheckRow key={check.code} check={check} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
