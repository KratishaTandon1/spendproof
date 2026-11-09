import React, { useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Printer,
  Radio,
  ShieldCheck,
} from "lucide-react";
import {
  money,
  type AuditEvent,
  type Purchase,
  type WebhookReceipt,
} from "../shared/domain";
import { captureVerified } from "../shared/analytics";

export const receiptName = (type: string) =>
  ({
    "PAYMENT.CAPTURE.COMPLETED": "Capture notification",
    "PAYMENT.CAPTURE.PENDING": "Pending capture notification",
    "PAYMENT.CAPTURE.REFUNDED": "Refund notification",
  })[type] || "PayPal notification";

export function PrintProofButton() {
  useEffect(() => {
    let closed: HTMLDetailsElement[] = [];
    const expand = () => {
      closed = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          ".audit-detail details:not([open])",
        ),
      );
      closed.forEach((element) => (element.open = true));
    };
    const restore = () => {
      closed.forEach((element) => (element.open = false));
      closed = [];
    };
    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
      restore();
    };
  }, []);
  return (
    <button
      className="button small print-proof-button"
      onClick={() => window.print()}
    >
      <Printer size={15} />
      Print proof
    </button>
  );
}

export default function ProofJourney({
  purchase: p,
  events,
  receipts,
}: {
  purchase: Purchase;
  events: AuditEvent[];
  receipts: WebhookReceipt[];
}) {
  const captured = captureVerified(p),
    approval = events.find((e) => e.kind === "APPROVAL"),
    deliveries = receipts.reduce((n, r) => n + r.deliveries, 0),
    repeats = deliveries - receipts.length;
  const stages = [
    {
      title: "Source evidence",
      done: !!p.plan?.evidence.length,
      detail: p.plan?.evidence[0] || "No evaluated source quote yet.",
    },
    {
      title: "Independent checks",
      done: !!p.evaluation,
      detail: p.evaluation
        ? `${p.evaluation.decision} · ${p.evaluation.checks.filter((c) => c.outcome === "pass").length}/${p.evaluation.checks.length} checks passed · policy v${p.policy_version}`
        : "Evaluate a proposal to see the checks.",
    },
    {
      title: "Exact approval",
      done: !!approval,
      detail: approval?.detail || "A person must approve an allowed proposal.",
    },
    {
      title: "Verified payment",
      done: captured,
      detail: captured
        ? `${money(p.total)} gross capture · ${p.capture_id}`
        : p.capture_id
          ? "A capture reference exists; completion is not yet verified."
          : "No completed capture recorded.",
    },
    {
      title: "Signed notifications",
      done: receipts.length > 0,
      detail: receipts.length
        ? `${receipts.length} verified event${receipts.length === 1 ? "" : "s"} · ${deliveries} deliveries · ${repeats} repeats`
        : "No linked signature-verified notifications received yet. This does not invalidate a canonical API verification.",
    },
    {
      title: "Refund outcome",
      done: p.status === "REFUNDED",
      detail:
        p.status === "REFUNDED"
          ? `${money(p.total)} returned · ${p.refund_id}`
          : p.refund_id
            ? "Refund requested; final completion is not confirmed."
            : "No refund requested.",
    },
  ];
  return (
    <section className="proof-journey">
      <div className="proof-section-heading">
        <div>
          <span className="eyebrow">CONNECTED EVIDENCE</span>
          <h3>The reason behind the result.</h3>
        </div>
        <ShieldCheck size={22} />
      </div>
      <div className="proof-stage-grid">
        {stages.map((s, i) => (
          <details
            key={s.title}
            className={s.done ? "proof-stage complete" : "proof-stage"}
            open={i === 0}
          >
            <summary>
              {s.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              <span>
                {String(i + 1).padStart(2, "0")} · {s.title}
              </span>
            </summary>
            <p>{s.detail}</p>
          </details>
        ))}
      </div>
      <div className="proof-section-heading">
        <div>
          <h3>Verified PayPal notifications</h3>
          <p>
            Signature verification and payment accounting are separate checks.
          </p>
        </div>
        <Radio size={20} />
      </div>
      {receipts.length ? (
        <div className="receipt-list">
          {receipts.map((r) => (
            <article className="receipt-card" key={r.id}>
              <div>
                <strong>{receiptName(r.event_type)}</strong>
                <span className="tag soft">Signature verified</span>
              </div>
              <code>{r.id}</code>
              <dl>
                <div>
                  <dt>Verified deliveries</dt>
                  <dd>{r.deliveries}</dd>
                </div>
                <div>
                  <dt>Repeat deliveries</dt>
                  <dd>{Math.max(0, r.deliveries - 1)}</dd>
                </div>
                <div>
                  <dt>Processing</dt>
                  <dd>{r.processed ? "Complete" : "Retry required"}</dd>
                </div>
              </dl>
              <p>
                First received {new Date(r.received_at).toLocaleString()} · Last
                received {new Date(r.last_received_at).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="quiet-state">
          Signed receipts appear here when the registered listener receives an
          event linked to this purchase.
        </p>
      )}
      {repeats > 0 && (
        <div className="callout">
          <ShieldCheck size={18} />
          <p>
            {repeats} repeat notification{repeats === 1 ? " was" : "s were"}{" "}
            received. Delivery counts are not payment counts; the verified
            financial entries remain in the decision trail below.
          </p>
        </div>
      )}
    </section>
  );
}
