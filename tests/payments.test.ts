import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import app from "../src/server/index";
import { CATALOG, DEFAULT_POLICY } from "../src/shared/domain";

// The actual SQLite migration and HTTP routes run here. External PayPal and AI
// responses are explicitly simulated; this suite does not verify live credentials.
class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private values: any[] = [],
  ) {}
  bind(...values: any[]) {
    return new Statement(this.db, this.sql, values);
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) || null;
  }
  async all() {
    return {
      results: this.db.prepare(this.sql).all(...this.values),
      success: true,
    };
  }
  async run() {
    return {
      success: true,
      meta: {
        changes: Number(this.db.prepare(this.sql).run(...this.values).changes),
      },
    };
  }
}
function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
  const DB = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env: any = {
    DB,
    ASSETS: { fetch: () => new Response("asset") },
    SESSION_SECRET: "test-only-secret",
    PAYPAL_CLIENT_ID: crypto.randomUUID(),
    PAYPAL_CLIENT_SECRET: "test-only",
    PAYPAL_WEBHOOK_ID: "webhook-test",
    GROQ_API_KEY: "test-only",
  };
  const orders = new Map<string, any>(),
    calls = { create: 0, capture: 0, refund: 0, verify: 0 };
  let cookie = "";
  let failRead = false;
  let uncertainCapture = false;
  let signatureValid = true;
  let aiContent = "not valid JSON";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (url.endsWith("/v1/oauth2/token"))
      return Response.json({
        access_token: "fake-test-token",
        expires_in: 3600,
      });
    if (url.includes("api.groq.com"))
      return Response.json({ choices: [{ message: { content: aiContent } }] });
    if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
      calls.verify++;
      return Response.json({
        verification_status: signatureValid ? "SUCCESS" : "FAILURE",
      });
    }
    if (url.endsWith("/v2/checkout/orders")) {
      calls.create++;
      const body = JSON.parse(init.body),
        id = "ORDER-" + calls.create;
      const order = {
        ...body,
        id,
        status: "CREATED",
        links: [
          {
            rel: "payer-action",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=" + id,
          },
        ],
      };
      order.purchase_units[0].payee = { merchant_id: "TEST-MERCHANT" };
      orders.set(id, order);
      return Response.json(order);
    }
    const orderId = url.match(/\/v2\/checkout\/orders\/([^/]+)/)?.[1];
    if (orderId) {
      const order = orders.get(orderId);
      if (!order) return Response.json({}, { status: 404 });
      if (url.endsWith("/capture")) {
        calls.capture++;
        order.status = "COMPLETED";
        order.purchase_units[0].payments = {
          captures: [
            {
              id: "CAPTURE-" + orderId,
              status: "COMPLETED",
              amount: order.purchase_units[0].amount,
            },
          ],
        };
        if (uncertainCapture)
          throw new Error("Simulated lost response after capture");
        return Response.json(order);
      }
      if (failRead) {
        failRead = false;
        throw new Error("Simulated transient read failure");
      }
      return Response.json(order);
    }
    if (url.includes("/v2/payments/captures/") && url.endsWith("/refund")) {
      calls.refund++;
      return Response.json({
        id: "REFUND-" + calls.refund,
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "54.00" },
      });
    }
    if (url.includes("/v2/payments/refunds/"))
      return Response.json({
        id: url.split("/").pop(),
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "54.00" },
      });
    throw new Error("Unexpected provider request in test");
  }) as typeof fetch;
  async function request(
    path: string,
    body?: unknown,
    session = cookie,
    headers: Record<string, string> = {},
  ) {
    const response = await app.fetch(
      new Request("http://localhost/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: session,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
    const setCookie = response.headers.get("set-cookie");
    if (setCookie && session === cookie) cookie = setCookie.split(";")[0];
    return {
      status: response.status,
      headers: response.headers,
      data: (await response.json()) as any,
    };
  }
  async function approved() {
    const p = await request("/requests", {
      title: "Test licences",
      intent: "Buy three one-time licences under $60.",
      quantity: 3,
      cap: 6000,
    });
    assert.equal(p.status, 201);
    await request("/requests/" + p.data.id + "/plan", {
      mode: "manual",
      offerId: "studio-kit",
    });
    assert.equal(
      (await request("/plans/" + p.data.id + "/approve", {})).status,
      200,
    );
    return p.data.id;
  }
  return {
    db,
    calls,
    orders,
    request,
    approved,
    get cookie() {
      return cookie;
    },
    set failRead(v: boolean) {
      failRead = v;
    },
    set uncertainCapture(v: boolean) {
      uncertainCapture = v;
    },
    set signatureValid(v: boolean) {
      signatureValid = v;
    },
    set aiContent(v: string) {
      aiContent = v;
    },
    close() {
      globalThis.fetch = originalFetch;
      db.close();
    },
  };
}
test("full capture, repeated capture and repeated refund preserve the allowance", async () => {
  const s = setup();
  try {
    const id = await s.approved();
    const checkout = await s.request("/plans/" + id + "/checkout", {});
    assert.equal(checkout.status, 200);
    const orderId = checkout.data.orderId;
    const held = (await s.request("/state")).data.workspace;
    assert.deepEqual(
      [held.available, held.reserved, held.spent],
      [9600, 5400, 0],
    );
    assert.equal(
      (await s.request("/plans/" + id + "/checkout", {})).data.orderId,
      orderId,
    );
    assert.equal(s.calls.create, 1);
    s.orders.get(orderId).status = "APPROVED";
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).data.status,
      "PAID",
    );
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).data.status,
      "PAID",
    );
    assert.equal(s.calls.capture, 1);
    let state = (await s.request("/state")).data;
    assert.deepEqual(
      [
        state.workspace.available,
        state.workspace.reserved,
        state.workspace.spent,
      ],
      [9600, 0, 5400],
    );
    assert.equal(
      state.events.filter((e: any) => e.kind === "PAYMENT").length,
      1,
    );
    assert.equal(
      (await s.request("/payments/" + id + "/refunds", { confirm: true })).data
        .status,
      "REFUNDED",
    );
    assert.equal(
      (await s.request("/payments/" + id + "/reconcile", {})).data.status,
      "REFUNDED",
    );
    assert.equal(
      (await s.request("/payments/" + id + "/refunds", { confirm: true }))
        .status,
      409,
    );
    assert.equal(s.calls.refund, 1);
    state = (await s.request("/state")).data;
    assert.deepEqual(
      [
        state.workspace.available,
        state.workspace.reserved,
        state.workspace.spent,
      ],
      [15000, 0, 0],
    );
  } finally {
    s.close();
  }
});
test("a lost capture response holds funds and reconciliation finds the completed capture", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {}),
      orderId = checkout.data.orderId;
    s.orders.get(orderId).status = "APPROVED";
    s.uncertainCapture = true;
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).status,
      502,
    );
    let state = (await s.request("/state")).data;
    assert.equal(state.purchases[0].status, "PAYMENT_UNKNOWN");
    assert.equal(state.workspace.reserved, 5400);
    assert.equal(
      (await s.request("/payments/" + id + "/reconcile", {})).data.status,
      "PAID",
    );
    assert.equal(s.calls.capture, 1);
  } finally {
    s.close();
  }
});
test("buyer approval, merchant proof, and current policy are independently required", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {}),
      orderId = checkout.data.orderId;
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).status,
      409,
    );
    s.orders.get(orderId).status = "APPROVED";
    assert.equal(
      (
        await s.request("/policy", {
          name: "New policy",
          maxTotal: 6000,
          maxQuantity: 3,
          approvalMinutes: 15,
          oneTimeOnly: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).status,
      409,
    );
    assert.equal(s.calls.capture, 0);
  } finally {
    s.close();
  }
});
test("checkout close releases only idle reservations and prevents later capture", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {}),
      orderId = checkout.data.orderId;
    assert.equal(
      (await s.request("/payments/" + id + "/close", {})).data.status,
      "CANCELLED",
    );
    s.orders.get(orderId).status = "APPROVED";
    assert.equal(
      (await s.request("/orders/" + orderId + "/capture", {})).data.status,
      "CANCELLED",
    );
    assert.equal(s.calls.capture, 0);
    const state = (await s.request("/state")).data;
    assert.equal(state.workspace.available, 15000);
    assert.equal(state.workspace.reserved, 0);
  } finally {
    s.close();
  }
});
test("two sessions cannot read, approve or capture each other’s purchases", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {});
    const outsider = await s.request("/state", undefined, "");
    assert.equal(outsider.status, 200);
    assert.equal(outsider.data.purchases.length, 0);
    assert.equal(
      (await s.request("/plans/" + id + "/approve", {}, "")).status,
      404,
    );
    assert.equal(
      (await s.request("/orders/" + checkout.data.orderId + "/capture", {}, ""))
        .status,
      404,
    );
    assert.equal(
      (await s.request("/audit/" + id + "/export", undefined, "")).status,
      404,
    );
  } finally {
    s.close();
  }
});
test("unverified webhooks cannot change payment state; a failed processing attempt can retry", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {}),
      orderId = checkout.data.orderId;
    const o = s.orders.get(orderId);
    o.status = "COMPLETED";
    o.purchase_units[0].payments = {
      captures: [
        {
          id: "webhook-capture",
          status: "COMPLETED",
          amount: o.purchase_units[0].amount,
        },
      ],
    };
    const event = {
        id: "event-1",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "webhook-capture",
          supplementary_data: { related_ids: { order_id: orderId } },
        },
      },
      headers = {
        "paypal-auth-algo": "test",
        "paypal-cert-url": "https://example.invalid/test",
        "paypal-transmission-id": "test",
        "paypal-transmission-sig": "test",
        "paypal-transmission-time": "test",
      };
    assert.equal((await s.request("/webhooks/paypal", event)).status, 401);
    s.signatureValid = false;
    assert.equal(
      (await s.request("/webhooks/paypal", event, s.cookie, headers)).status,
      401,
    );
    assert.equal(
      s.db.prepare("SELECT COUNT(*) AS n FROM webhook_events").get()!.n,
      0,
    );
    s.signatureValid = true;
    s.failRead = true;
    assert.equal(
      (await s.request("/webhooks/paypal", event, s.cookie, headers)).status,
      502,
    );
    assert.equal(
      (await s.request("/webhooks/paypal", event, s.cookie, headers)).status,
      200,
    );
    const duplicate = (
      await s.request("/webhooks/paypal", event, s.cookie, headers)
    ).data;
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.deliveries, 3);
    const receipt = s.db
      .prepare(
        "SELECT deliveries,processed,last_received_at FROM webhook_events WHERE id=?",
      )
      .get(event.id)!;
    assert.equal(receipt.deliveries, 3);
    assert.equal(receipt.processed, 1);
    assert.ok(Number.isFinite(Date.parse(String(receipt.last_received_at))));
    const state = (await s.request("/state")).data;
    assert.equal(state.purchases[0].status, "PAID");
    assert.equal(state.workspace.spent, 5400);
    assert.equal(state.webhookReceipts.length, 1);
    assert.equal(state.webhookReceipts[0].purchase_id, id);
    assert.equal(state.webhookReceipts[0].signature_verified, true);
    assert.equal(state.webhookReceipts[0].deliveries, 3);
    const otherState = (await s.request("/state", undefined, "")).data;
    assert.equal(otherState.webhookReceipts.length, 0);
    const exported = (await s.request("/audit/" + id + "/export")).data;
    assert.equal(exported.webhookReceipts[0].id, event.id);
    assert.equal(
      "paypal-transmission-sig" in exported.webhookReceipts[0],
      false,
    );
    assert.equal(
      state.events.filter((e: any) => e.kind === "PAYMENT").length,
      1,
    );
  } finally {
    s.close();
  }
});
test("invalid AI JSON does not create an AI proposal or reserve funds", async () => {
  const s = setup();
  try {
    const p = await s.request("/requests", {
      title: "AI test",
      intent: "Three design licences.",
      quantity: 3,
      cap: 6000,
    });
    assert.equal(
      (await s.request("/requests/" + p.data.id + "/plan", { mode: "ai" }))
        .status,
      502,
    );
    const state = (await s.request("/state")).data;
    assert.equal(state.purchases[0].status, "DRAFT");
    assert.equal(state.purchases[0].plan, null);
    assert.equal(state.workspace.available, 15000);
  } finally {
    s.close();
  }
});
test("database rejects overspending, duplicate reservation, and reservation mutation", () => {
  const s = setup();
  try {
    s.db
      .prepare("INSERT INTO workspaces(id,policy,created_at) VALUES(?,?,?)")
      .run("w", JSON.stringify(DEFAULT_POLICY), "now");
    for (const id of ["a", "b", "c"])
      s.db
        .prepare(
          "INSERT INTO purchases(id,workspace_id,title,intent,quantity,cap,total,status,created_at,updated_at) VALUES(?,'w','t','i',3,6000,5400,'APPROVED','now','now')",
        )
        .run(id);
    const reserve = s.db.prepare(
      "INSERT INTO reservations(id,purchase_id,workspace_id,amount,created_at) VALUES(?,?,'w',5400,'now')",
    );
    reserve.run("r-a", "a");
    s.db
      .prepare(
        "INSERT OR IGNORE INTO reservations(id,purchase_id,workspace_id,amount,created_at) VALUES('ignored','a','w',5400,'now')",
      )
      .run();
    assert.throws(() => reserve.run("r-again", "a"), /UNIQUE/);
    reserve.run("r-b", "b");
    assert.throws(() => reserve.run("r-c", "c"), /INSUFFICIENT_ALLOWANCE/);
    assert.throws(
      () =>
        s.db
          .prepare(
            "UPDATE reservations SET workspace_id='other' WHERE id='r-a'",
          )
          .run(),
      /INVALID_RESERVATION_TRANSITION/,
    );
    const w = s.db
      .prepare("SELECT * FROM workspaces WHERE id='w'")
      .get() as any;
    assert.deepEqual([w.available, w.reserved, w.spent], [4200, 10800, 0]);
  } finally {
    s.close();
  }
});

test("proposal revisions are immutable, session-scoped and included in redacted proof exports", async () => {
  const s = setup();
  try {
    const p = await s.request("/requests", {
        title: "Version story",
        intent: "Three licences under $60.",
        quantity: 3,
        cap: 6000,
      }),
      id = p.data.id;
    assert.equal(
      (
        await s.request("/requests/" + id + "/plan", {
          mode: "manual",
          offerId: "studio-plus",
        })
      ).data.evaluation.decision,
      "BLOCK",
    );
    assert.equal(
      (
        await s.request("/requests/" + id + "/plan", {
          mode: "manual",
          offerId: "studio-kit",
        })
      ).data.evaluation.decision,
      "ALLOW",
    );
    const state = (await s.request("/state")).data;
    assert.equal(state.versions.length, 2);
    assert.equal(state.versions[0].version, 3);
    assert.equal(state.versions[1].plan.billing, "monthly");
    assert.equal(state.versions[0].policy_snapshot.version, 1);
    assert.throws(
      () =>
        s.db
          .prepare("UPDATE proposal_versions SET total=1 WHERE purchase_id=?")
          .run(id),
      /IMMUTABLE_PROPOSAL/,
    );
    const proof = (await s.request("/audit/" + id + "/export")).data;
    assert.equal(proof.versions.length, 2);
    assert.equal("operation_key" in proof.purchase, false);
    assert.equal("workspace_id" in proof.purchase, false);
    assert.equal("workspace_id" in proof.versions[0], false);
  } finally {
    s.close();
  }
});
test("expired approval and cross-origin mutations stop before provider access", async () => {
  const s = setup();
  try {
    const id = await s.approved();
    s.db
      .prepare(
        "UPDATE purchases SET approval_expires='2000-01-01T00:00:00.000Z' WHERE id=?",
      )
      .run(id);
    assert.equal(
      (await s.request("/plans/" + id + "/checkout", {})).status,
      409,
    );
    assert.equal(s.calls.create, 0);
    assert.equal(
      (
        await s.request(
          "/requests",
          {
            title: "bad origin",
            intent: "test intent",
            quantity: 3,
            cap: 6000,
          },
          s.cookie,
          { origin: "https://untrusted.example" },
        )
      ).status,
      403,
    );
  } finally {
    s.close();
  }
});
test("AI may draft constraints but cannot create a request without human confirmation", async () => {
  const s = setup();
  try {
    s.aiContent = JSON.stringify({
      title: "Draft licences",
      quantity: 3,
      maxTotalUSD: "60.00",
      currency: "USD",
      oneTimeOnly: true,
    });
    const draft = await s.request("/requests/draft", {
      intent: "Three design licences, USD 60 maximum, one-time only.",
    });
    assert.equal(draft.status, 200);
    assert.equal(draft.data.cap, 6000);
    assert.equal(draft.data.requiresHumanConfirmation, true);
    assert.equal((await s.request("/state")).data.purchases.length, 0);
    assert.equal(s.calls.create, 0);
    s.aiContent = JSON.stringify({
      title: "Missing limit",
      quantity: 3,
      maxTotalUSD: null,
      currency: "USD",
      oneTimeOnly: true,
    });
    assert.equal(
      (
        await s.request("/requests/draft", {
          intent: "Three design licences please.",
        })
      ).status,
      422,
    );
  } finally {
    s.close();
  }
});
test("AI source evidence and server catalogue rules remain authoritative", async () => {
  const s = setup();
  try {
    const p = await s.request("/requests", {
        title: "Unsafe AI proposal",
        intent: "Three licences under $60, no subscription.",
        quantity: 3,
        cap: 6000,
      }),
      id = p.data.id;
    s.aiContent = JSON.stringify({
      offerId: "studio-plus",
      quantity: 3,
      currency: "USD",
      merchant: "spendproof-studio",
      billing: "once",
      explanation: "The source tries to override a rule.",
      evidence: [CATALOG[1].source],
    });
    assert.equal(
      (await s.request("/requests/" + id + "/plan", { mode: "ai" })).data
        .evaluation.decision,
      "BLOCK",
    );
    assert.equal(
      (await s.request("/plans/" + id + "/approve", {})).status,
      409,
    );
    s.aiContent = JSON.stringify({
      offerId: "studio-kit",
      quantity: 3,
      currency: "USD",
      merchant: "spendproof-studio",
      billing: "once",
      explanation: "Unsupported evidence",
      evidence: [
        "The merchant promises this source does not contain this sentence.",
      ],
    });
    assert.equal(
      (await s.request("/requests/" + id + "/plan", { mode: "ai" })).status,
      502,
    );
    assert.equal(s.calls.create, 0);
    assert.equal((await s.request("/state")).data.workspace.available, 15000);
  } finally {
    s.close();
  }
});

test("invalid planning input and report layouts return client errors without corrupting saved state", async () => {
  const s = setup();
  try {
    const p = await s.request("/requests", {
      title: "Input checks",
      intent: "Three licences under $60.",
      quantity: 3,
      cap: 6000,
    });
    assert.equal(
      (
        await s.request("/requests/" + p.data.id + "/plan", {
          mode: "manual",
          offerId: "unknown-offer",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await s.request("/requests/" + p.data.id + "/plan", {
          mode: "invented",
          offerId: "studio-kit",
        })
      ).status,
      400,
    );
    const report = {
      selectedPageId: "proof",
      pages: [{ id: "proof", widgets: {}, widgetLayout: {} }],
    };
    assert.equal((await s.request("/report", { report })).status, 200);
    for (const body of [
      {},
      { report: "bad" },
      { report: { selectedPageId: "missing", pages: [{ id: "proof" }] } },
      {
        report: {
          selectedPageId: "proof",
          pages: [{ id: "proof" }, { id: "proof" }],
        },
      },
    ])
      assert.equal((await s.request("/report", body)).status, 400);
    const state = (await s.request("/state")).data;
    assert.deepEqual(state.report, report);
    assert.equal(state.purchases[0].status, "DRAFT");
    assert.equal(state.workspace.available, 15000);
  } finally {
    s.close();
  }
});

test("hosted checkout persists a sandbox-only approval URL and still requires buyer approval", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      created = await s.request("/plans/" + id + "/checkout", {
        flow: "redirect",
      });
    assert.equal(created.status, 200);
    assert.ok(
      created.data.approvalUrl.startsWith("https://www.sandbox.paypal.com/"),
    );
    const order = s.orders.get(created.data.orderId);
    assert.equal(
      order.payment_source.paypal.experience_context.user_action,
      "CONTINUE",
    );
    assert.ok(
      order.payment_source.paypal.experience_context.return_url.startsWith(
        "http://localhost/",
      ),
    );
    assert.equal(
      (await s.request("/orders/" + created.data.orderId + "/capture", {}))
        .status,
      409,
    );
    assert.equal(s.calls.capture, 0);
    assert.equal(
      (await s.request("/state")).data.purchases[0].approval_url,
      created.data.approvalUrl,
    );
    assert.equal(
      (await s.request("/plans/" + id + "/checkout", { flow: "redirect" })).data
        .orderId,
      created.data.orderId,
    );
    assert.equal(s.calls.create, 1);
  } finally {
    s.close();
  }
});

test("expired checkout approval can be explicitly renewed without another reservation or order", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      checkout = await s.request("/plans/" + id + "/checkout", {});
    s.db
      .prepare(
        "UPDATE purchases SET approval_expires='2000-01-01T00:00:00.000Z' WHERE id=?",
      )
      .run(id);
    assert.equal(
      (await s.request("/orders/" + checkout.data.orderId + "/capture", {}))
        .status,
      409,
    );
    assert.equal((await s.request("/plans/" + id + "/renew", {})).status, 400);
    const renewed = await s.request("/plans/" + id + "/renew", {
      confirm: true,
    });
    assert.equal(renewed.status, 200);
    assert.equal(renewed.data.orderId, checkout.data.orderId);
    assert.ok(Date.parse(renewed.data.expires) > Date.now());
    assert.equal(s.calls.create, 1);
    const state = (await s.request("/state")).data;
    assert.equal(state.workspace.reserved, 5400);
    assert.equal(state.workspace.available, 9600);
    await s.request("/policy", {
      name: "Changed policy",
      maxTotal: 6000,
      maxQuantity: 3,
      approvalMinutes: 15,
      oneTimeOnly: true,
    });
    assert.equal(
      (await s.request("/plans/" + id + "/renew", { confirm: true })).status,
      409,
    );
    assert.equal(s.calls.capture, 0);
  } finally {
    s.close();
  }
});

test("proof downloads use a private attachment response with internal keys removed", async () => {
  const s = setup();
  try {
    const id = await s.approved(),
      proof = await s.request("/audit/" + id + "/export?download=1");
    assert.equal(proof.status, 200);
    assert.equal(
      proof.headers.get("content-disposition"),
      'attachment; filename="spendproof-' + id.slice(0, 8) + '.json"',
    );
    assert.equal(proof.headers.get("cache-control"), "no-store");
    for (const field of ["workspace_id", "operation_key", "refund_key"])
      assert.equal(field in proof.data.purchase, false);
    assert.equal(
      (await s.request("/audit/" + id + "/export?download=1", undefined, ""))
        .status,
      404,
    );
  } finally {
    s.close();
  }
});
