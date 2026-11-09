import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  CATALOG,
  SCENARIOS,
  makePlan,
  evaluate,
  parseMoney,
  assertPaymentMatch,
  approvalSnapshot,
  fingerprint,
  type Purchase,
} from "../src/shared/domain";

test("catalogue changes invalidate the exact approved quote", async () => {
  const p = {
    id: "quote-test",
    version: 2,
    plan: makePlan(),
    total: 5400,
    quantity: 3,
    cap: 6000,
  } as Purchase;
  const original = CATALOG[0].unitPrice,
    hash = await fingerprint(approvalSnapshot(p, DEFAULT_POLICY));
  try {
    CATALOG[0].unitPrice = original + 1;
    assert.notEqual(
      await fingerprint(approvalSnapshot(p, DEFAULT_POLICY)),
      hash,
    );
  } finally {
    CATALOG[0].unitPrice = original;
  }
  assert.equal(
    evaluate(
      { ...makePlan(), evidence: ["Invented source permission"] },
      { quantity: 3, cap: 6000 },
      DEFAULT_POLICY,
      15000,
    ).decision,
    "BLOCK",
  );
});

for (const scenario of SCENARIOS)
  test("policy: " + scenario.id, () => {
    const plan = {
      ...makePlan(scenario.offerId, 3, "fixture"),
      ...scenario.patch,
    };
    const result = evaluate(
      plan,
      { quantity: 3, cap: 6000 },
      DEFAULT_POLICY,
      "available" in scenario ? scenario.available : 15000,
    );
    assert.equal(result.decision, scenario.expected);
  });
test("money is parsed to exact integer cents", () => {
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("54.00"), 5400);
  for (const input of ["-1", "1.001", "1e3", "NaN", " 12", "12,00"])
    assert.throws(() => parseMoney(input));
});
test("client supplied terms cannot turn a subscription into a one-time offer", () => {
  const result = evaluate(
    { ...makePlan("studio-plus"), billing: "once" },
    { quantity: 3, cap: 6000 },
    DEFAULT_POLICY,
    15000,
  );
  assert.equal(result.decision, "BLOCK");
  assert.ok(
    result.checks.some((c) => c.code === "TERMS_MATCH" && c.outcome === "fail"),
  );
});
test("untrusted and fractional quantities cannot gain an allowance", () => {
  for (const quantity of [-1, 0, 0.5, NaN, 101])
    assert.equal(
      evaluate(
        { ...makePlan(), quantity },
        { quantity: 3, cap: 6000 },
        DEFAULT_POLICY,
        15000,
      ).decision,
      "BLOCK",
    );
  assert.equal(
    evaluate(
      { ...makePlan(), offerId: "invented" },
      { quantity: 3, cap: 6000 },
      DEFAULT_POLICY,
      15000,
    ).decision,
    "BLOCK",
  );
});
test("payment proof binds order, amount, currency, and merchant", () => {
  const purchase = {
    order_id: "order",
    expected_payee: "merchant",
    total: 5400,
  } as Purchase;
  const order = {
    id: "order",
    purchase_units: [
      {
        amount: { currency_code: "USD", value: "54.00" },
        payee: { merchant_id: "merchant" },
      },
    ],
  };
  assertPaymentMatch(order, purchase);
  for (const patched of [
    { ...order, id: "other" },
    { ...order, purchase_units: [] },
    {
      ...order,
      purchase_units: [
        {
          ...order.purchase_units[0],
          amount: { currency_code: "EUR", value: "54.00" },
        },
      ],
    },
    {
      ...order,
      purchase_units: [
        {
          ...order.purchase_units[0],
          amount: { currency_code: "USD", value: "53.99" },
        },
      ],
    },
    {
      ...order,
      purchase_units: [
        { ...order.purchase_units[0], payee: { merchant_id: "attacker" } },
      ],
    },
  ])
    assert.throws(() => assertPaymentMatch(patched, purchase));
});
test("approval fingerprints change with proposal and policy versions", async () => {
  const p = {
    id: "p",
    version: 1,
    plan: makePlan(),
    total: 5400,
    quantity: 3,
    cap: 6000,
  } as Purchase;
  const hash = await fingerprint(approvalSnapshot(p, DEFAULT_POLICY));
  assert.equal(hash, await fingerprint(approvalSnapshot(p, DEFAULT_POLICY)));
  assert.notEqual(
    hash,
    await fingerprint(approvalSnapshot({ ...p, version: 2 }, DEFAULT_POLICY)),
  );
  assert.notEqual(
    hash,
    await fingerprint(approvalSnapshot(p, { ...DEFAULT_POLICY, version: 2 })),
  );
});
