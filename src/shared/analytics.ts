import {
  CATALOG,
  evaluate,
  type AuditEvent,
  type Policy,
  type ProposalVersion,
  type Purchase,
  type WebhookReceipt,
} from "./domain";

export interface AnalysisData {
  purchases: Purchase[];
  versions: ProposalVersion[];
  events: AuditEvent[];
  webhookReceipts: WebhookReceipt[];
}
export const captureVerified = (p: Purchase) =>
  !!p.capture_id &&
  [
    "PAID",
    "REFUNDING",
    "REFUND_PENDING",
    "REFUND_UNKNOWN",
    "REFUNDED",
  ].includes(p.status);
export function reportSources(data: AnalysisData) {
  const titles = new Map(data.purchases.map((p) => [p.id, p.title]));
  return [
    {
      id: "purchases",
      name: "Purchase decisions",
      data: data.purchases.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        totalUSD: p.total / 100,
        quantity: p.quantity,
        source: p.source,
        policyVersion: p.policy_version,
        createdAt: p.created_at,
      })),
    },
    {
      id: "versions",
      name: "Recorded proposal versions",
      data: data.versions.map((v) => ({
        id: `${v.purchase_id}:${v.version}`,
        purchaseId: v.purchase_id,
        title: titles.get(v.purchase_id) || "Purchase",
        version: v.version,
        totalUSD: v.total / 100,
        offer:
          CATALOG.find((o) => o.id === v.plan.offerId)?.name || v.plan.offerId,
        billing: v.plan.billing,
        status: v.evaluation.decision,
        decision: v.evaluation.decision,
        policyVersion: v.policy_version,
        source: v.source,
        createdAt: v.created_at,
      })),
    },
    {
      id: "payments",
      name: "Verified payment records",
      data: data.purchases.filter(captureVerified).map((p) => ({
        id: p.capture_id!,
        purchaseId: p.id,
        title: p.title,
        captureId: p.capture_id!,
        grossUSD: p.total / 100,
        refundedUSD: p.status === "REFUNDED" ? p.total / 100 : 0,
        netUSD: p.status === "REFUNDED" ? 0 : p.total / 100,
        status: p.status,
      })),
    },
    {
      id: "events",
      name: "Audit events",
      data: data.events.map((e) => ({
        id: e.id,
        purchaseId: e.purchase_id || "",
        kind: e.kind,
        status: e.kind,
        title: e.title,
        detail: e.detail,
        source: e.source,
        createdAt: e.created_at,
      })),
    },
    {
      id: "checks",
      name: "Recorded rule checks",
      data: data.versions.flatMap((v) =>
        v.evaluation.checks.map((c) => ({
          id: `${v.purchase_id}:${v.version}:${c.code}`,
          purchaseId: v.purchase_id,
          title: titles.get(v.purchase_id) || "Purchase",
          version: v.version,
          rule: c.code,
          ruleName: c.label,
          status: c.outcome.toUpperCase(),
          decision: v.evaluation.decision,
          detail: c.detail,
          evidence: c.evidence || "",
          policyVersion: v.policy_version,
        })),
      ),
    },
    {
      id: "receipts",
      name: "Signature-verified PayPal deliveries",
      data: data.webhookReceipts.map((r) => ({
        id: r.id,
        purchaseId: r.purchase_id,
        title: titles.get(r.purchase_id) || "Purchase",
        eventType: r.event_type,
        status: r.processed ? "PROCESSED" : "PROCESSING_REQUIRED",
        deliveries: r.deliveries,
        repeatDeliveries: Math.max(0, r.deliveries - 1),
        signatureVerified: r.signature_verified,
        receivedAt: r.received_at,
        lastReceivedAt: r.last_received_at,
      })),
    },
  ].map((source) => ({
    ...source,
    data: source.data.map((row) => ({
      ...row,
      proof:
        "purchaseId" in row
          ? row.purchaseId
          : source.id === "purchases"
            ? row.id
            : "",
    })),
  }));
}

export function projectCost(offerId: string, quantity: number, months: number) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 100 ||
    !Number.isSafeInteger(months) ||
    months < 1 ||
    months > 24
  )
    throw new Error("Choose 1–100 licences and 1–24 months.");
  const offer = CATALOG.find((o) => o.id === offerId);
  if (!offer || offer.billing === "unknown") return null;
  return (
    offer.unitPrice * quantity * (offer.billing === "monthly" ? months : 1)
  );
}

export function previewPolicy(
  versions: ProposalVersion[],
  purchases: Purchase[],
  policy: Policy,
  available: number,
) {
  return versions
    .filter((v) => purchases.some((p) => p.id === v.purchase_id))
    .map((v) => ({
      purchaseId: v.purchase_id,
      version: v.version,
      recorded: v.evaluation.decision,
      preview: evaluate(
        v.plan,
        purchases.find((p) => p.id === v.purchase_id)!,
        { ...policy },
        available,
      ),
    }));
}
