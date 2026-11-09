import test from "node:test";
import assert from "node:assert/strict";
import { createReportTools } from "../src/ui/reportTools";

function setup() {
  let state: any = {
    selectedPageId: "proof",
    pages: [
      {
        id: "proof",
        layout: { columns: 12 },
        widgets: { allowance: { type: "sp-allowance", dataMapping: {} } },
        widgetLayout: {
          allowance: { xTrack: 0, yTrack: 0, xSpan: 5, ySpan: 4 },
        },
      },
    ],
  };
  const rows = Array.from({ length: 30 }, (_, i) => ({
    id: "request-" + i,
    title: "Purchase " + i,
    status: i % 2 ? "READY" : "BLOCKED",
    totalUSD: 54,
    policyVersion: 1,
    detail: "x".repeat(500),
  }));
  const model = {
    sources: [{ id: "purchases", name: "Purchase decisions", data: rows }],
  };
  const api: any = {
    getState: () => state,
    setState: (value: any) => {
      state = value;
    },
    getProperty: () => model,
    getAiContext: () => ({
      schema: () => ({
        tables: [
          {
            id: "purchases",
            name: "Purchase decisions",
            fields: Object.keys(rows[0]).map((name) => ({
              fieldId: "test:" + name,
              name,
            })),
          },
        ],
      }),
    }),
    defineAiTool: (config: any) => ({
      name: config.name,
      execute: (call: any, ctx: any) => config.execute(call.args, ctx),
    }),
  };
  const tools = createReportTools(api),
    ctx: any = {
      success: (response: string) => ({ success: true, response }),
      error: (message: string) => ({ success: false, issues: [{ message }] }),
    };
  return {
    rows,
    model,
    get state() {
      return state;
    },
    call: (name: string, args: any) =>
      tools.find((t) => t.name === name)!.execute!(
        { name, toolCallId: "test", args },
        ctx,
      ),
  };
}
test("report inspection bounds rows and text while retaining an accurate total", async () => {
  const s = setup(),
    result = await s.call("inspect_workspace", {
      table: "purchases",
      status: "READY",
    });
  assert.equal(result.success, true);
  if (!result.success) return;
  const data = JSON.parse(result.response);
  assert.equal(data.totalRows, 15);
  assert.equal(data.rows.length, 12);
  assert.equal(data.truncated, true);
  assert.equal(data.rows[0].detail.length, 350);
  assert.ok(data.rows.every((row: any) => row.status === "READY"));
});
test("filtered charts and tables use native cross-filtering without changing purchase rows", async () => {
  const s = setup(),
    result = await s.call("add_report_visual", {
      table: "purchases",
      kind: "bar-chart",
      title: "Blocked decisions",
      columns: [],
      groupBy: "status",
      aggregation: "count",
      status: "BLOCKED",
    });
  assert.equal(result.success, true);
  const { widgetId } = JSON.parse(result.response),
    page = s.state.pages[0];
  assert.equal(page.widgets[widgetId].format.crossFilter, "highlight");
  assert.deepEqual(page.widgets[widgetId].dataMapping.valueKey, [
    { id: "test:id", aggregation: "count" },
  ]);
  assert.deepEqual(page.filter.widget[widgetId], [
    {
      field: { id: "test:status" },
      model: { operator: "equals", value: "BLOCKED" },
    },
  ]);
  assert.equal(s.rows.length, 30);
});
test("layout inspection and atomic arrangement preserve every widget and reject overlap", async () => {
  const s = setup(),
    added = await s.call("add_report_visual", {
      table: "purchases",
      kind: "table",
      title: "Proof report",
      columns: ["title"],
    }),
    id = JSON.parse(added.response).widgetId;
  const inspected = JSON.parse(
    (await s.call("inspect_report_layout", {})).response,
  );
  assert.equal(inspected.widgets.length, 2);
  assert.equal(inspected.columns, 12);
  const before = s.state;
  assert.equal(
    (
      await s.call("position_report_widget", {
        widgetId: "allowance",
        column: 0,
        row: 0,
        width: 5,
        height: 5,
      })
    ).success,
    false,
  );
  assert.equal(s.state, before);
  assert.equal(
    (
      await s.call("arrange_report_widgets", {
        moves: [
          { widgetId: "allowance", column: 0, row: 0, width: 5, height: 5 },
          { widgetId: id, column: 0, row: 5, width: 12, height: 5 },
        ],
      })
    ).success,
    true,
  );
  assert.equal(Object.keys(s.state.pages[0].widgets).length, 2);
  assert.equal(s.state.pages[0].widgetLayout[id].yTrack, 5);
});
test("workspace inspection returns whole-dataset money totals before truncating samples", async () => {
  const s = setup();
  s.model.sources.push({
    id: "payments",
    name: "Verified payment records",
    data: Array.from({ length: 20 }, (_, i) => ({
      id: "c" + i,
      title: "p",
      status: "REFUNDED",
      totalUSD: 0,
      policyVersion: 1,
      detail: "",
      grossUSD: 0.15,
      refundedUSD: 0.15,
      netUSD: 0,
    })),
  });
  const result = JSON.parse(
    (await s.call("inspect_workspace", { table: "payments" })).response,
  );
  assert.equal(result.rows.length, 12);
  assert.equal(result.totalRows, 20);
  assert.deepEqual(result.summary, {
    byStatus: { REFUNDED: 20 },
    grossUSD: 3,
    refundedUSD: 3,
    netUSD: 0,
  });
});
test("native report table uses validated schema fields and preserves existing widgets", async () => {
  const s = setup(),
    before = s.state,
    result = await s.call("add_report_visual", {
      table: "purchases",
      kind: "table",
      title: "Decision report",
      columns: ["title", "status", "totalUSD", "policyVersion"],
    });
  assert.equal(result.success, true);
  assert.notEqual(s.state, before);
  const page = s.state.pages[0],
    key = Object.keys(page.widgets).find((k) => k !== "allowance")!;
  assert.deepEqual(page.widgets[key].dataMapping.cols, [
    { id: "test:title" },
    { id: "test:status" },
    { id: "test:totalUSD" },
    { id: "test:policyVersion" },
  ]);
  assert.equal(page.widgets[key].type, "grid");
  assert.equal(page.widgetLayout[key].yTrack, 4);
  assert.deepEqual(page.widgets.allowance, before.pages[0].widgets.allowance);
  assert.equal(s.rows[0].status, "BLOCKED");
});
test("invented report columns cannot change the document or financial data", async () => {
  const s = setup(),
    before = s.state;
  await assert.rejects(
    async () =>
      s.call("add_report_visual", {
        table: "purchases",
        kind: "table",
        title: "Invalid column",
        columns: ["changeAllowance"],
      }),
    /Unknown column/,
  );
  assert.equal(s.state, before);
  assert.equal(s.rows.length, 30);
});
test("widget moves stay within the report grid", async () => {
  const s = setup(),
    before = s.state;
  assert.equal(
    (
      await s.call("position_report_widget", {
        widgetId: "allowance",
        column: 10,
        row: 0,
        width: 5,
        height: 4,
      })
    ).success,
    false,
  );
  assert.equal(s.state, before);
  assert.equal(
    (
      await s.call("position_report_widget", {
        widgetId: "allowance",
        column: 6,
        row: 2,
        width: 5,
        height: 4,
      })
    ).success,
    true,
  );
  assert.deepEqual(s.state.pages[0].widgetLayout.allowance, {
    xTrack: 6,
    yTrack: 2,
    xSpan: 5,
    ySpan: 4,
  });
});
