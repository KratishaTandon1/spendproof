export interface ControlState {
  available: number;
  reserved: number;
  spent: number;
  captures: number;
  refunds: number;
  deliveries: number;
  approvalValid: boolean;
  quoteMatches: boolean;
  status: string;
}
type Action =
  | "approve"
  | "expire"
  | "change-quote"
  | "checkout"
  | "capture"
  | "capture-lost"
  | "reconcile"
  | "capture-notice"
  | "refund"
  | "refund-notice";
const AMOUNT = 5400;
function apply(state: ControlState, action: Action): ControlState {
  const s = { ...state };
  if (action === "approve") {
    s.approvalValid = true;
    s.status = "APPROVED";
  }
  if (action === "expire") s.approvalValid = false;
  if (action === "change-quote") s.quoteMatches = false;
  if (action === "checkout") {
    if (!s.approvalValid || !s.quoteMatches) {
      s.status = "NEEDS_REVIEW";
      return s;
    }
    if (s.reserved === 0 && s.captures === 0) {
      s.available -= AMOUNT;
      s.reserved = AMOUNT;
      s.status = "RESERVED";
    }
  }
  if (
    (action === "capture" || action === "capture-lost") &&
    s.reserved === AMOUNT &&
    s.approvalValid &&
    s.quoteMatches
  ) {
    s.captures = 1;
    s.status = action === "capture-lost" ? "OUTCOME_UNKNOWN" : "PAID";
    if (action === "capture") {
      s.reserved = 0;
      s.spent = AMOUNT;
    }
  }
  if (
    (action === "reconcile" || action === "capture-notice") &&
    s.captures === 1 &&
    s.reserved === AMOUNT
  ) {
    s.reserved = 0;
    s.spent = AMOUNT;
    s.status = "PAID";
  }
  if (action === "refund" && s.spent === AMOUNT && s.refunds === 0) {
    s.refunds = 1;
    s.spent = 0;
    s.available += AMOUNT;
    s.status = "REFUNDED";
  }
  if (action === "capture-notice" || action === "refund-notice") s.deliveries++;
  return s;
}
export const RELIABILITY_CASES = [
  {
    id: "lost-capture",
    name: "The capture response is lost",
    detail:
      "Keep the allowance reserved until reconciliation confirms the existing capture.",
    actions: ["approve", "checkout", "capture-lost", "reconcile"] as Action[],
    expected: {
      status: "PAID",
      available: 9600,
      reserved: 0,
      spent: 5400,
      captures: 1,
      refunds: 0,
    },
  },
  {
    id: "repeat-capture",
    name: "A capture notification repeats",
    detail:
      "Repeated notifications must not create another charge or spend entry.",
    actions: [
      "approve",
      "checkout",
      "capture",
      "capture-notice",
      "capture-notice",
    ] as Action[],
    expected: {
      status: "PAID",
      available: 9600,
      reserved: 0,
      spent: 5400,
      captures: 1,
      refunds: 0,
    },
  },
  {
    id: "repeat-refund",
    name: "A refund notification repeats",
    detail: "A completed full refund restores the allowance once.",
    actions: [
      "approve",
      "checkout",
      "capture",
      "refund",
      "refund-notice",
      "refund-notice",
    ] as Action[],
    expected: {
      status: "REFUNDED",
      available: 15000,
      reserved: 0,
      spent: 0,
      captures: 1,
      refunds: 1,
    },
  },
  {
    id: "expired",
    name: "Approval expires before checkout",
    detail:
      "Stop before creating an order or reserving funds; request fresh approval.",
    actions: ["approve", "expire", "checkout"] as Action[],
    expected: {
      status: "NEEDS_REVIEW",
      available: 15000,
      reserved: 0,
      spent: 0,
      captures: 0,
      refunds: 0,
    },
  },
  {
    id: "changed-quote",
    name: "The quote changes after approval",
    detail:
      "An approval for the previous quote cannot authorize the changed proposal.",
    actions: ["approve", "change-quote", "checkout"] as Action[],
    expected: {
      status: "NEEDS_REVIEW",
      available: 15000,
      reserved: 0,
      spent: 0,
      captures: 0,
      refunds: 0,
    },
  },
];
export function simulateReliability(id: string) {
  const scenario = RELIABILITY_CASES.find((s) => s.id === id);
  if (!scenario) throw new Error("Unknown reliability scenario.");
  let state: ControlState = {
    available: 15000,
    reserved: 0,
    spent: 0,
    captures: 0,
    refunds: 0,
    deliveries: 0,
    approvalValid: false,
    quoteMatches: true,
    status: "DRAFT",
  };
  const steps = scenario.actions.map((action) => {
    state = apply(state, action);
    return { action, state: { ...state } };
  });
  const pass = Object.entries(scenario.expected).every(
    ([key, value]) => state[key as keyof ControlState] === value,
  );
  return {
    scenario,
    steps,
    state,
    pass,
    source: "LOCAL_SIMULATION" as const,
    providerCalls: 0,
  };
}
