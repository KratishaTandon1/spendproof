import type { AgStudioApi, AgDefaultWidget } from "ag-studio";

const tableIds = [
  "purchases",
  "versions",
  "payments",
  "events",
  "checks",
  "receipts",
] as const;
const normalized = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Bounded native Studio tools keep free-model requests small and expose no financial mutations. */
export function createReportTools(api: AgStudioApi) {
  function tableData(id: string) {
    const model = api.getProperty("data");
    if (!model || !("sources" in model))
      throw new Error("The report data is not available.");
    const source = model.sources.find((source) => source.id === id);
    if (!source || !("data" in source))
      throw new Error("That report table is not available.");
    return source;
  }
  const inspect = api.defineAiTool({
    name: "inspect_workspace",
    description:
      "Read a workspace table and its column names. Always supply table: purchases, versions, payments, events, checks, or receipts. At most 12 rows; long text is shortened. A result with totalRows 0 means that table is empty; do not repeat the same inspection. Filter purchases or payments by status if needed.",
    params: (s) =>
      s.object({
        table: s.enum(tableIds),
        status: s.string().maxLength(40).optional(),
        purchaseId: s.string().maxLength(80).optional(),
        rule: s.string().maxLength(50).optional(),
      }),
    execute: ({ table, status, purchaseId, rule }, ctx) => {
      const source = tableData(table),
        rows = source.data.filter(
          (row) =>
            (!status || row.status === status) &&
            (!purchaseId ||
              row.purchaseId === purchaseId ||
              row.id === purchaseId) &&
            (!rule || row.rule === rule),
        );
      const byStatus: Record<string, number> = {};
      rows.forEach((row) => {
        const key = String(row.status || "UNSPECIFIED");
        byStatus[key] = (byStatus[key] || 0) + 1;
      });
      const sum = (key: string) =>
        rows.reduce(
          (n, row) => n + Math.round(Number(row[key] || 0) * 100),
          0,
        ) / 100;
      const sample = rows
        .slice(0, 12)
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              typeof value === "string" ? value.slice(0, 350) : value,
            ]),
          ),
        );
      return ctx.success(
        JSON.stringify({
          table,
          columns: Object.keys(source.data[0] || {}),
          totalRows: rows.length,
          rows: sample,
          truncated: rows.length > sample.length,
          textLimit: 350,
          summary: {
            byStatus,
            ...(table === "payments"
              ? {
                  grossUSD: sum("grossUSD"),
                  refundedUSD: sum("refundedUSD"),
                  netUSD: sum("netUSD"),
                }
              : {}),
            ...(table === "receipts"
              ? {
                  verifiedDeliveries: sum("deliveries"),
                  repeatDeliveries: sum("repeatDeliveries"),
                }
              : {}),
          },
        }),
      );
    },
  });
  const visual = api.defineAiTool({
    name: "add_report_visual",
    description:
      "Add a real AG Studio table or a count-by-status column chart below existing widgets. Inspect the table first for exact column names. This only edits the report.",
    params: (s) =>
      s.object({
        table: s.enum(tableIds),
        kind: s.enum(["table", "status-chart", "bar-chart"] as const),
        title: s.string().minLength(1).maxLength(90),
        columns: s.array(s.string().maxLength(60)).maxSize(8),
        groupBy: s.string().maxLength(60).optional(),
        value: s.string().maxLength(60).optional(),
        aggregation: s.enum(["count", "sum"] as const).optional(),
        status: s.string().maxLength(40).optional(),
      }),
    execute: (
      { table, kind, title, columns, groupBy, value, aggregation, status },
      ctx,
    ) => {
      const source = tableData(table),
        meta = api
          .getAiContext()
          .schema()
          .tables.find((t) => t.id === table || t.name === source.name);
      if (!meta || !source.data.length)
        return ctx.error("This table has no reportable rows yet.");
      const allowed = Object.keys(source.data[0]);
      function field(key: string) {
        if (!allowed.includes(key)) throw new Error("Unknown column: " + key);
        const result = meta!.fields.find(
          (f) => f.fieldId === key || normalized(f.name) === normalized(key),
        );
        if (!result) throw new Error("No AG Studio field mapping for " + key);
        return { id: result.fieldId };
      }
      let widget: AgDefaultWidget;
      if (kind !== "table") {
        const valueField = aggregation === "sum" ? value : "id";
        if (!valueField)
          return ctx.error("Choose a numeric value column for a sum chart.");
        if (
          aggregation === "sum" &&
          !source.data.every(
            (row) =>
              typeof row[valueField] === "number" &&
              Number.isFinite(row[valueField]),
          )
        )
          return ctx.error("A sum chart requires a finite numeric column.");
        widget = {
          type: "column-chart-grouped",
          format: {
            title: { text: title, enabled: true },
            crossFilter: "highlight",
          },
          dataMapping: {
            categoryKey: [field(groupBy || "status")],
            valueKey: [
              {
                ...field(valueField),
                aggregation: aggregation || "count",
              },
            ],
          },
        };
      } else {
        if (!columns.length)
          return ctx.error(
            "Choose one to eight columns from inspect_workspace.",
          );
        widget = {
          type: "grid",
          format: {
            title: { text: title, enabled: true },
            style: { columnAutoSize: true },
            crossFilter: "filter",
          },
          dataMapping: { cols: [...new Set(columns)].map(field) },
        };
      }
      const state = api.getState(),
        page = state.pages.find((p) => p.id === state.selectedPageId);
      if (!page) return ctx.error("Select a report page first.");
      const widgetId = "report-" + crypto.randomUUID().slice(0, 8),
        y = Math.max(
          0,
          ...Object.values(page.widgetLayout || {}).map((p) =>
            p ? p.yTrack + p.ySpan : 0,
          ),
        );
      api.setState({
        ...state,
        pages: state.pages.map((p) =>
          p.id === page.id
            ? {
                ...p,
                widgets: { ...p.widgets, [widgetId]: widget },
                ...(status
                  ? {
                      filter: {
                        ...p.filter,
                        widget: {
                          ...p.filter?.widget,
                          [widgetId]: [
                            {
                              field: field("status"),
                              model: {
                                operator: "equals" as const,
                                value: status,
                              },
                            },
                          ],
                        },
                      },
                    }
                  : {}),
                widgetLayout: {
                  ...p.widgetLayout,
                  [widgetId]: {
                    xTrack: 0,
                    yTrack: y,
                    xSpan: page.layout?.columns || 12,
                    ySpan: 5,
                  },
                },
              }
            : p,
        ),
      });
      return ctx.success(
        JSON.stringify({
          added: true,
          widgetId,
          kind,
          table,
          title,
          statusFilter: status || null,
          crossFiltering: true,
        }),
      );
    },
  });
  const layout = api.defineAiTool({
    name: "inspect_report_layout",
    description:
      "Read the selected page's widget IDs, labels and exact grid positions before arranging it. No financial mutations.",
    params: (s) => s.object({}),
    execute: (_, ctx) => {
      const state = api.getState(),
        page = state.pages.find((p) => p.id === state.selectedPageId);
      if (!page) return ctx.error("Select a report page first.");
      return ctx.success(
        JSON.stringify({
          pageId: page.id,
          columns: page.layout?.columns || 12,
          widgets: Object.entries(page.widgets || {})
            .slice(0, 25)
            .map(([id, w]) => ({
              id,
              type: w?.type,
              title: (w as any)?.format?.title?.text || id,
              position: page.widgetLayout?.[id],
            })),
        }),
      );
    },
  });
  function arrange(
    moves: {
      widgetId: string;
      column: number;
      row: number;
      width: number;
      height: number;
    }[],
  ) {
    const state = api.getState(),
      page = state.pages.find((p) => p.id === state.selectedPageId),
      columns = page?.layout?.columns || 12;
    if (!page) throw new Error("Select a report page first.");
    const next = { ...page.widgetLayout };
    if (new Set(moves.map((m) => m.widgetId)).size !== moves.length)
      throw new Error("Choose each widget once.");
    for (const m of moves) {
      const widget = page.widgets?.[m.widgetId];
      if (
        !widget ||
        ![m.column, m.row, m.width, m.height].every(Number.isSafeInteger) ||
        m.column < 0 ||
        m.row < 0 ||
        m.row > 100 ||
        m.width < 1 ||
        m.height < 2 ||
        m.height > 12 ||
        m.column + m.width > columns
      )
        throw new Error("The widget or requested grid position is invalid.");
      next[m.widgetId] = {
        xTrack: m.column,
        yTrack: m.row,
        xSpan: m.width,
        ySpan: m.height,
      };
    }
    const entries = Object.entries(next).filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] => !!entry[1],
    );
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const [aId, a] = entries[i],
          [bId, b] = entries[j];
        if (
          a.xTrack < b.xTrack + b.xSpan &&
          a.xTrack + a.xSpan > b.xTrack &&
          a.yTrack < b.yTrack + b.ySpan &&
          a.yTrack + a.ySpan > b.yTrack
        )
          throw new Error(
            `Widgets ${aId} and ${bId} would overlap. Move affected widgets together.`,
          );
      }
    api.setState({
      ...state,
      pages: state.pages.map((p) =>
        p.id === page.id ? { ...p, widgetLayout: next } : p,
      ),
    });
  }
  const position = api.defineAiTool({
    name: "position_report_widget",
    description:
      "Move or resize one existing AG Studio widget in grid units. This changes report layout only.",
    params: (s) =>
      s.object({
        widgetId: s.widgetId(),
        column: s.number().gte(0).multipleOf(1),
        row: s.number().gte(0).lte(100).multipleOf(1),
        width: s.number().gte(1).multipleOf(1),
        height: s.number().gte(2).lte(12).multipleOf(1),
      }),
    execute: ({ widgetId, column, row, width, height }, ctx) => {
      try {
        arrange([{ widgetId, column, row, width, height }]);
      } catch (e) {
        return ctx.error((e as Error).message);
      }
      return ctx.success(JSON.stringify({ moved: true, widgetId }));
    },
  });
  const batch = api.defineAiTool({
    name: "arrange_report_widgets",
    description:
      "Move or resize multiple widgets atomically after inspecting layout. Keep all widgets inside the grid without overlaps. Changes report layout only.",
    params: (s) =>
      s.object({
        moves: s
          .array(
            s.object({
              widgetId: s.widgetId(),
              column: s.number().gte(0).multipleOf(1),
              row: s.number().gte(0).lte(100).multipleOf(1),
              width: s.number().gte(1).multipleOf(1),
              height: s.number().gte(2).lte(12).multipleOf(1),
            }),
          )
          .minSize(1)
          .maxSize(12),
      }),
    execute: ({ moves }, ctx) => {
      try {
        arrange(moves);
        return ctx.success(
          JSON.stringify({
            arranged: true,
            widgets: moves.map((m) => m.widgetId),
          }),
        );
      } catch (e) {
        return ctx.error((e as Error).message);
      }
    },
  });
  return [inspect, layout, visual, position, batch];
}
