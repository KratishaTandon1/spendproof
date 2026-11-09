export type Decision = "ALLOW" | "REVIEW" | "BLOCK";
export interface Policy {
  version: number;
  name: string;
  maxTotal: number;
  allowedCurrency: string;
  maxQuantity: number;
  oneTimeOnly: boolean;
  approvedMerchant: string;
  approvalMinutes: number;
}
export interface Offer {
  id: string;
  name: string;
  description: string;
  unitPrice: number;
  currency: string;
  billing: "once" | "monthly" | "unknown";
  merchant: string;
  source: string;
  category: string;
  accent: string;
}
export interface Plan {
  offerId: string;
  quantity: number;
  currency: string;
  merchant: string;
  billing: string;
  explanation: string;
  evidence: string[];
  origin: "ai" | "manual" | "fixture";
}
export interface Check {
  code: string;
  label: string;
  outcome: "pass" | "fail" | "unknown";
  detail: string;
  evidence?: string;
}
export interface Evaluation {
  decision: Decision;
  checks: Check[];
  total: number;
  offerId: string;
  policyVersion: number;
}
export interface Purchase {
  id: string;
  workspace_id: string;
  title: string;
  intent: string;
  quantity: number;
  cap: number;
  status: string;
  plan: Plan | null;
  evaluation: Evaluation | null;
  total: number;
  version: number;
  policy_version: number;
  approval_hash: string | null;
  approval_expires: string | null;
  order_id: string | null;
  approval_url?: string | null;
  capture_id: string | null;
  refund_id: string | null;
  expected_payee: string | null;
  operation_key: string | null;
  refund_key: string | null;
  created_at: string;
  updated_at: string;
  source: string;
}
export interface AuditEvent {
  id: string;
  purchase_id: string | null;
  kind: string;
  title: string;
  detail: string;
  source: string;
  created_at: string;
}
export interface WebhookReceipt {
  id: string;
  purchase_id: string;
  event_type: string;
  processed: number;
  deliveries: number;
  received_at: string;
  last_received_at: string;
  signature_verified: true;
}
export interface ProposalVersion {
  purchase_id: string;
  workspace_id: string;
  version: number;
  plan: Plan;
  evaluation: Evaluation;
  total: number;
  policy_version: number;
  policy_snapshot: Policy | null;
  source: string;
  created_at: string;
}
export const DEFAULT_POLICY: Policy = {
  version: 1,
  name: "Thoughtful spending",
  maxTotal: 6000,
  allowedCurrency: "USD",
  maxQuantity: 3,
  oneTimeOnly: true,
  approvedMerchant: "spendproof-studio",
  approvalMinutes: 15,
};
export const CATALOG: Offer[] = [
  {
    id: "studio-kit",
    name: "Studio Kit",
    description: "A considered collection of design assets. Yours to keep.",
    unitPrice: 1800,
    currency: "USD",
    billing: "once",
    merchant: "spendproof-studio",
    source:
      "Studio Kit — $18 per licence. One-time purchase. No renewal. Tax: $0. Shipping: $0. Sold by SpendProof Studio.",
    category: "Design assets",
    accent: "peach",
  },
  {
    id: "studio-plus",
    name: "Studio Plus",
    description: "A fresh design library, delivered every month.",
    unitPrice: 1200,
    currency: "USD",
    billing: "monthly",
    merchant: "spendproof-studio",
    source:
      "Studio Plus — $12 per licence per month. Automatically renews monthly until cancelled. Sold by SpendProof Studio.",
    category: "Subscription",
    accent: "lavender",
  },
  {
    id: "studio-pro",
    name: "Studio Pro",
    description: "The complete archive, with an extended asset licence.",
    unitPrice: 2500,
    currency: "USD",
    billing: "once",
    merchant: "spendproof-studio",
    source:
      "Studio Pro — $25 per licence. One-time payment. No renewal. Tax: $0. Shipping: $0. Sold by SpendProof Studio.",
    category: "Extended licence",
    accent: "sage",
  },
  {
    id: "unverified-pack",
    name: "Mystery Pack",
    description: "An incomplete quote that needs a closer look.",
    unitPrice: 1500,
    currency: "USD",
    billing: "unknown",
    merchant: "spendproof-studio",
    source:
      "Mystery Pack — $15 per licence. Sold by SpendProof Studio. Final billing and renewal terms have not been supplied.",
    category: "Unverified offer",
    accent: "sand",
  },
];
export function money(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}
export function parseMoney(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Money must be a positive decimal with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Invalid amount.");
  return result;
}
export function totalFor(offer: Offer, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("Quantity must be a whole number between 1 and 100.");
  return offer.unitPrice * quantity;
}
export function makePlan(
  offerId = "studio-kit",
  quantity = 3,
  origin: Plan["origin"] = "manual",
): Plan {
  const offer = CATALOG.find((o) => o.id === offerId);
  if (!offer) throw new Error("Unknown catalogue offer.");
  return {
    offerId,
    quantity,
    currency: offer.currency,
    merchant: offer.merchant,
    billing: offer.billing,
    explanation:
      origin === "manual"
        ? "Selected in the manual proposal builder. This is not an AI-generated recommendation."
        : "Controlled scenario input. The proposal remains subject to every server check.",
    evidence: [offer.source],
    origin,
  };
}
export function evaluate(
  plan: Plan,
  request: { quantity: number; cap: number },
  policy: Policy,
  available: number,
): Evaluation {
  const checks: Check[] = [];
  const check = (
    code: string,
    label: string,
    pass: boolean,
    detail: string,
    evidence?: string,
  ) =>
    checks.push({
      code,
      label,
      outcome: pass ? "pass" : "fail",
      detail,
      evidence,
    });
  const offer = CATALOG.find((o) => o.id === plan.offerId);
  if (!offer)
    return {
      decision: "BLOCK",
      checks: [
        {
          code: "CATALOG",
          label: "Known catalogue item",
          outcome: "fail",
          detail: "This item is not in the server-controlled catalogue.",
        },
      ],
      total: 0,
      offerId: plan.offerId,
      policyVersion: policy.version,
    };
  const quantityValid =
    Number.isSafeInteger(plan.quantity) &&
    plan.quantity > 0 &&
    plan.quantity <= 100;
  const total = quantityValid ? totalFor(offer, plan.quantity) : 0;
  check(
    "QUANTITY",
    "Quantity matches your request",
    quantityValid &&
      plan.quantity === request.quantity &&
      plan.quantity <= policy.maxQuantity,
    `${plan.quantity} proposed · ${request.quantity} requested · policy permits ${policy.maxQuantity}`,
  );
  check(
    "CURRENCY",
    "Currency is permitted",
    plan.currency === policy.allowedCurrency &&
      offer.currency === policy.allowedCurrency,
    `${plan.currency} proposed · ${offer.currency} in catalogue · ${policy.allowedCurrency} permitted`,
  );
  check(
    "MERCHANT",
    "Merchant is approved",
    plan.merchant === offer.merchant &&
      offer.merchant === policy.approvedMerchant,
    `Catalogue seller: ${offer.merchant}`,
    offer.source,
  );
  check(
    "TERMS_MATCH",
    "Proposal matches source terms",
    plan.billing === offer.billing,
    `Proposed: ${plan.billing} · catalogue: ${offer.billing}`,
    offer.source,
  );
  check(
    "EVIDENCE",
    "Source evidence is supported",
    Array.isArray(plan.evidence) &&
      plan.evidence.length > 0 &&
      plan.evidence.every(
        (quote) => typeof quote === "string" && offer.source.includes(quote),
      ),
    "Proposal excerpts must match the current controlled catalogue source.",
    offer.source,
  );
  if (offer.billing === "unknown")
    checks.push({
      code: "BILLING",
      label: "Billing terms are known",
      outcome: "unknown",
      detail: "Complete, authoritative billing terms are required.",
      evidence: offer.source,
    });
  else
    check(
      "BILLING",
      "No unwanted recurring charge",
      !policy.oneTimeOnly || offer.billing === "once",
      offer.billing === "once"
        ? "One-time purchase. No renewal."
        : "This offer renews every month.",
      offer.source,
    );
  check(
    "REQUEST_CAP",
    "Within the purchase limit",
    quantityValid && total <= request.cap,
    `${money(total)} total · ${money(request.cap)} request limit`,
  );
  check(
    "POLICY_CAP",
    "Within the policy limit",
    quantityValid && total <= policy.maxTotal,
    `${money(total)} total · ${money(policy.maxTotal)} policy limit`,
  );
  check(
    "ALLOWANCE",
    "Allowance is available",
    quantityValid && total <= available,
    `${money(available)} currently available. This is an application allowance, not a PayPal balance.`,
  );
  return {
    decision: checks.some((c) => c.outcome === "fail")
      ? "BLOCK"
      : checks.some((c) => c.outcome === "unknown")
        ? "REVIEW"
        : "ALLOW",
    checks,
    total,
    offerId: offer.id,
    policyVersion: policy.version,
  };
}
export async function fingerprint(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function approvalSnapshot(p: Purchase, policy: Policy) {
  return {
    id: p.id,
    version: p.version,
    plan: p.plan,
    total: p.total,
    quantity: p.quantity,
    cap: p.cap,
    policy,
    quote: CATALOG.find((offer) => offer.id === p.plan?.offerId) ?? null,
  };
}
export function assertPaymentMatch(order: any, p: Purchase) {
  if (order.id !== p.order_id)
    throw new Error("Order identity does not match this purchase.");
  const units = order.purchase_units;
  if (!Array.isArray(units) || units.length !== 1)
    throw new Error("Exactly one purchase unit is required.");
  const unit = units[0];
  if (
    unit.amount?.currency_code !== "USD" ||
    parseMoney(unit.amount?.value ?? "") !== p.total
  )
    throw new Error("PayPal amount or currency changed. Capture stopped.");
  if (!p.expected_payee || unit.payee?.merchant_id !== p.expected_payee)
    throw new Error("PayPal merchant does not match the created order.");
  return unit;
}
export const SCENARIOS = [
  {
    id: "clean",
    name: "The right purchase",
    category: "Happy path",
    detail: "Three one-time licences, within your $60 limit.",
    offerId: "studio-kit",
    patch: {},
    expected: "ALLOW",
  },
  {
    id: "subscription",
    name: "The monthly catch",
    category: "Billing terms",
    detail: "A lower sticker price comes with an automatic renewal.",
    offerId: "studio-plus",
    patch: {},
    expected: "BLOCK",
  },
  {
    id: "over-budget",
    name: "A little too much",
    category: "Budget",
    detail: "Three premium licences cost $75 against a $60 limit.",
    offerId: "studio-pro",
    patch: {},
    expected: "BLOCK",
  },
  {
    id: "quantity",
    name: "One extra licence",
    category: "Quantity",
    detail: "The proposal quietly adds another item.",
    offerId: "studio-kit",
    patch: { quantity: 4 },
    expected: "BLOCK",
  },
  {
    id: "currency",
    name: "A different currency",
    category: "Currency",
    detail: "The amount looks familiar, but the currency changed.",
    offerId: "studio-kit",
    patch: { currency: "EUR" },
    expected: "BLOCK",
  },
  {
    id: "merchant",
    name: "An unexpected seller",
    category: "Merchant",
    detail: "A proposal tries to change the payment destination.",
    offerId: "studio-kit",
    patch: { merchant: "another-merchant" },
    expected: "BLOCK",
  },
  {
    id: "terms",
    name: "Terms rewritten",
    category: "Source mismatch",
    detail: "The proposal calls a monthly product a one-time purchase.",
    offerId: "studio-plus",
    patch: { billing: "once" },
    expected: "BLOCK",
  },
  {
    id: "missing-terms",
    name: "The missing terms",
    category: "Human review",
    detail: "The seller and price are known, but renewal terms are missing.",
    offerId: "unverified-pack",
    patch: {},
    expected: "REVIEW",
  },
  {
    id: "allowance",
    name: "The shared limit",
    category: "Allowance",
    detail: "A valid purchase still needs enough available allowance.",
    offerId: "studio-kit",
    patch: {},
    expected: "BLOCK",
    available: 3000,
  },
] as const;
