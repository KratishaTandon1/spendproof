import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  evaluate,
  makePlan,
  type Purchase,
  type ProposalVersion,
} from "../src/shared/domain";
import {
  captureVerified,
  previewPolicy,
  projectCost,
  reportSources,
} from "../src/shared/analytics";
import {
  RELIABILITY_CASES,
  simulateReliability,
} from "../src/shared/reliability";

const purchase = {
  id: "p",
  title: "Design licences",
  quantity: 3,
  cap: 6000,
  total: 5400,
  status: "REFUNDED",
  capture_id: "CAPTURE",
  refund_id: "REFUND",
  version: 2,
  policy_version: 1,
  source: "ai",
  created_at: "2026-11-01T00:00:00Z",
} as Purchase;
const plan = makePlan(),
  version = {
    purchase_id: "p",
    version: 2,
    plan,
    evaluation: evaluate(plan, purchase, DEFAULT_POLICY, 15000),
    total: 5400,
    policy_version: 1,
    policy_snapshot: DEFAULT_POLICY,
    source: "ai",
    created_at: purchase.created_at,
  } as ProposalVersion;

test("recurring cost projections use exact minor units and explicitly reject unknown terms", () => {
  assert.equal(projectCost("studio-kit", 3, 12), 5400);
  assert.equal(projectCost("studio-plus", 3, 12), 43200);
  assert.equal(projectCost("unverified-pack", 3, 12), null);
  for (const q of [0, -1, 0.5, 101, NaN])
    assert.throws(() => projectCost("studio-kit", q, 12));
  assert.throws(() => projectCost("studio-plus", 3, 25));
});
test("policy previews retain the request cap and cannot mutate recorded decisions or active policy", () => {
  const policy = { ...DEFAULT_POLICY, maxTotal: 5000 },
    before = JSON.stringify({ version, purchase, policy });
  const result = previewPolicy([version], [purchase], policy, 15000);
  assert.equal(result[0].recorded, "ALLOW");
  assert.equal(result[0].preview.decision, "BLOCK");
  assert.equal(JSON.stringify({ version, purchase, policy }), before);
  const relaxed = previewPolicy(
    [version],
    [{ ...purchase, cap: 5000 }],
    { ...policy, maxTotal: 10000 },
    15000,
  );
  assert.equal(relaxed[0].preview.decision, "BLOCK");
});
test("analytics excludes pending captures and keeps refunds and notification deliveries distinct", () => {
  const data = {
    purchases: [
      purchase,
      {
        ...purchase,
        id: "pending",
        status: "PAYMENT_PENDING",
        refund_id: null,
      },
    ],
    versions: [version],
    events: [],
    webhookReceipts: [
      {
        id: "EVENT",
        purchase_id: "p",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        deliveries: 3,
        processed: 1,
        received_at: purchase.created_at,
        last_received_at: purchase.created_at,
        signature_verified: true as const,
      },
    ],
  };
  assert.equal(captureVerified(data.purchases[1]), false);
  const tables = reportSources(data),
    payments = tables.find((t) => t.id === "payments")!.data as any[],
    receipts = tables.find((t) => t.id === "receipts")!.data as any[];
  assert.equal(payments.length, 1);
  assert.equal(payments[0].grossUSD, 54);
  assert.equal(payments[0].refundedUSD, 54);
  assert.equal(payments[0].netUSD, 0);
  assert.equal(receipts[0].repeatDeliveries, 2);
  assert.equal(receipts[0].proof, "p");
  assert.equal(
    tables.find((t) => t.id === "checks")!.data.length,
    version.evaluation.checks.length,
  );
});
for (const scenario of RELIABILITY_CASES)
  test("control model conserves the allowance: " + scenario.id, () => {
    const run = simulateReliability(scenario.id);
    assert.equal(run.pass, true);
    assert.equal(run.providerCalls, 0);
    for (const { state: s } of run.steps) {
      assert.equal(s.available + s.reserved + s.spent, 15000);
      assert.ok(
        [s.available, s.reserved, s.spent].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ),
      );
      assert.ok(s.captures <= 1 && s.refunds <= 1);
    }
  });
test("unknown capture outcomes stay reserved until the model reconciles existing proof", () => {
  const run = simulateReliability("lost-capture"),
    lost = run.steps.find((s) => s.action === "capture-lost")!.state;
  assert.deepEqual(
    [lost.available, lost.reserved, lost.spent, lost.captures],
    [9600, 5400, 0, 1],
  );
  assert.deepEqual(
    [
      run.state.available,
      run.state.reserved,
      run.state.spent,
      run.state.captures,
    ],
    [9600, 0, 5400, 1],
  );
});
