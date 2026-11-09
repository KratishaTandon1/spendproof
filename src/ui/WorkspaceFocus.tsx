import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { money, type Policy, type Purchase } from "../shared/domain";
import { captureVerified } from "../shared/analytics";

export default function WorkspaceFocus({
  purchases,
  policy,
  onOpen,
  onNew,
  onReplay,
  onAnalytics,
}: {
  purchases: Purchase[];
  policy: Policy;
  onOpen: (purchase: Purchase, proof?: boolean) => void;
  onNew: () => void;
  onReplay: () => void;
  onAnalytics: () => void;
}) {
  const unresolved = purchases.find((p) =>
    [
      "PAYMENT_UNKNOWN",
      "PAYMENT_PENDING",
      "CAPTURING",
      "REFUND_UNKNOWN",
      "REFUND_PENDING",
      "REFUNDING",
    ].includes(p.status),
  );
  const ready = purchases.find((p) => p.status === "READY");
  const active = purchases.find((p) =>
    [
      "APPROVED",
      "ORDER_CREATED",
      "RESERVED",
      "DRAFT",
      "BLOCKED",
      "REVIEW",
    ].includes(p.status),
  );
  const next = unresolved || ready || active;
  const captures = purchases.filter(captureVerified).length;
  const title = unresolved
    ? "A payment needs a closer look."
    : ready
      ? "A proposal is ready for you."
      : next
        ? "Pick up where you left off."
        : purchases.length
          ? "Every decision. A clear trail."
          : "Let AI find the fit. You keep the final say.";
  const description = next
    ? next.title
    : "Set a budget, inspect the evidence, and approve an exact purchase. Follow the result all the way to its payment proof.";
  return (
    <section className="workspace-focus" aria-label="Workspace next action">
      <div className="focus-story">
        <div className="focus-kicker">
          <span className="focus-signal" />{" "}
          {next ? "YOUR NEXT ACTION" : "PURCHASE WITH CONFIDENCE"}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="focus-actions">
          <button
            className="button focus-primary"
            onClick={() => (next ? onOpen(next, !!unresolved) : onNew())}
          >
            {unresolved
              ? "Review payment proof"
              : ready
                ? "Review proposal"
                : next
                  ? "Continue purchase"
                  : "Create a purchase request"}
            <ArrowRight size={16} />
          </button>
          <button className="focus-secondary" onClick={onReplay}>
            <FileText size={16} /> See the recorded example{" "}
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="focus-footnote">
          <ShieldCheck size={14} /> Explicit approval before every sandbox
          purchase.
        </div>
      </div>
      <div className="focus-control-card">
        <div className="focus-card-top">
          <span>YOUR PURCHASE GUARDRAILS</span>
          <ShieldCheck size={18} />
        </div>
        <div className="focus-limit">
          <strong>{money(policy.maxTotal)}</strong>
          <span>maximum per purchase</span>
        </div>
        <div className="focus-rule">
          <Check size={15} />
          <span>One-time purchases only</span>
        </div>
        <div className="focus-rule">
          <Check size={15} />
          <span>Approved merchant · USD</span>
        </div>
        <button className="focus-report" onClick={onAnalytics}>
          <Sparkles size={16} />
          <span>
            <strong>Explore your decisions</strong>
            <small>
              {captures} verified capture{captures === 1 ? "" : "s"} ·{" "}
              {purchases.length} request{purchases.length === 1 ? "" : "s"}
            </small>
          </span>
          <ArrowUpRight size={17} />
        </button>
      </div>
    </section>
  );
}

export function PurchaseProgress({ purchase }: { purchase: Purchase }) {
  const verified = captureVerified(purchase);
  const stage = verified
    ? 3
    : [
          "APPROVED",
          "RESERVED",
          "ORDER_CREATED",
          "CAPTURING",
          "PAYMENT_UNKNOWN",
          "PAYMENT_PENDING",
        ].includes(purchase.status)
      ? 2
      : purchase.plan
        ? 1
        : 0;
  return (
    <ol className="purchase-progress" aria-label="Purchase progress">
      {[
        ["01", "Find a fit", "Request & quote"],
        ["02", "Your decision", "Rules & approval"],
        ["03", "PayPal checkout", "Buyer consent"],
        ["04", "Payment proof", "Verified outcome"],
      ].map(([number, title, detail], i) => (
        <li
          key={number}
          className={i < stage ? "complete" : i === stage ? "current" : ""}
          aria-current={i === stage ? "step" : undefined}
        >
          <span className="progress-number">
            {i < stage ? <Check size={15} /> : number}
          </span>
          <div>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}
