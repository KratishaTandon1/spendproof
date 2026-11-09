import React, { useState } from "react";
import { ArrowLeft, ArrowRight, History, RotateCcw } from "lucide-react";
import recording from "../data/recorded-run.json";
import { money } from "../shared/domain";

export default function RecordedRun({ onStart }: { onStart: () => void }) {
  const steps = [
    ...recording.events.map((e) => ({
      at: e.created_at,
      title: e.title,
      detail: e.detail,
      kind: e.kind,
      source: e.source,
    })),
    ...recording.webhookReceipts.flatMap((r) => [
      {
        at: r.received_at,
        title: "PayPal signature verified",
        detail: `${r.event_type} · ${r.id}`,
        kind: "RECEIPT",
        source: "PAYPAL",
      },
      ...(r.deliveries > 1
        ? [
            {
              at: r.last_received_at,
              title: "Repeat delivery handled",
              detail: `${r.event_type}: ${r.deliveries} verified deliveries recorded; the ledger still contains one payment and one refund.`,
              kind: "RETRY",
              source: "PAYPAL",
            },
          ]
        : []),
    ]),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const [index, setIndex] = useState(0),
    current = steps[index],
    reached = steps.slice(0, index + 1),
    gross = reached.some((e) => e.kind === "PAYMENT")
      ? recording.purchase.total
      : 0,
    refunded = reached.some((e) => e.kind === "REFUND")
      ? recording.purchase.total
      : 0;
  return (
    <div className="recorded-run">
      <section className="recorded-banner">
        <div>
          <span className="tag soft">
            <History size={14} />
            RECORDED SANDBOX RUN ·{" "}
            {new Date(recording.recordedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <h2>A $54 purchase. Fully traced.</h2>
          <p>
            Actual AI output, capture, refund, and signed notifications from an
            earlier run. Explore the evidence without making a new payment.
          </p>
        </div>
        <button className="button" onClick={onStart}>
          Try your own request
          <ArrowRight size={16} />
        </button>
      </section>
      <div className="replay-progress">
        <span>THE PURCHASE JOURNEY</span>
        <progress
          value={index + 1}
          max={steps.length}
          aria-label="Recorded journey progress"
        />
        <strong>
          {index + 1} / {steps.length}
        </strong>
        <small>Playback only · no provider calls</small>
      </div>
      <div className="replay-layout">
        <section className="panel replay-steps" aria-label="Recorded steps">
          {steps.map((s, i) => (
            <button
              key={s.at + s.kind}
              className={i === index ? "active" : i < index ? "visited" : ""}
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{s.title}</strong>
                <small>
                  {new Date(s.at).toLocaleTimeString()} · {s.source}
                </small>
              </div>
            </button>
          ))}
        </section>
        <section className="panel replay-detail">
          <span className="eyebrow">
            RECORDED STEP {index + 1} OF {steps.length}
          </span>
          <h2>{current.title}</h2>
          <p className="replay-evidence">{current.detail}</p>
          <time>{new Date(current.at).toLocaleString()}</time>
          <div className="recorded-money">
            <div>
              <small>Recorded gross captured</small>
              <strong>{money(gross)}</strong>
            </div>
            <div>
              <small>Recorded completed refunds</small>
              <strong>{money(refunded)}</strong>
            </div>
            <div>
              <small>Recorded net</small>
              <strong>{money(gross - refunded)}</strong>
            </div>
          </div>
          <div className="replay-controls">
            <button
              className="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft size={15} />
              Previous step
            </button>
            <button
              className="button primary"
              disabled={index === steps.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next step
              <ArrowRight size={15} />
            </button>
            <button className="text-button" onClick={() => setIndex(0)}>
              <RotateCcw size={15} />
              Restart
            </button>
          </div>
          <details className="recorded-references">
            <summary>Inspect the recorded payment references</summary>
            <dl>
              <dt>Order</dt>
              <dd>{recording.purchase.order_id}</dd>
              <dt>Capture</dt>
              <dd>{recording.purchase.capture_id}</dd>
              <dt>Refund</dt>
              <dd>{recording.purchase.refund_id}</dd>
              <dt>Final application allowance</dt>
              <dd>
                {money(recording.finalAllowance.available)} available ·{" "}
                {money(recording.finalAllowance.reserved)} reserved ·{" "}
                {money(recording.finalAllowance.spent)} net spent
              </dd>
            </dl>
          </details>
          <p className="fine-print">
            Recorded gross and refund figures follow the events reached in this
            replay. This is a readable application record, not independent
            certification or a new live payment.
          </p>
        </section>
      </div>
    </div>
  );
}
