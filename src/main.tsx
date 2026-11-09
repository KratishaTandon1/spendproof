import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Beaker,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  LayoutDashboard,
  Link2,
  Loader2,
  LockKeyhole,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wallet,
  X,
  XCircle,
  AlertTriangle,
  History,
} from "lucide-react";
import {
  CATALOG,
  DEFAULT_POLICY,
  SCENARIOS,
  money,
  type AuditEvent,
  type Offer,
  type Policy,
  type ProposalVersion,
  type Purchase,
  type WebhookReceipt,
} from "./shared/domain";
import ProofJourney, { PrintProofButton } from "./ui/ProofJourney";
import { CostComparison, PolicyPlayground } from "./ui/ProductLab";
import ReliabilityLab from "./ui/ReliabilityLab";
import DecisionChecks from "./ui/DecisionChecks";
import WorkspaceFocus, { PurchaseProgress } from "./ui/WorkspaceFocus";
import "./styles.css";
import "./ui/refinement.css";

const Studio = lazy(() => import("./ui/Studio"));
const RecordedRun = lazy(() => import("./ui/RecordedRun"));
type View =
  | "overview"
  | "workspace"
  | "approvals"
  | "policies"
  | "audit"
  | "lab"
  | "replay"
  | "settings";
interface State {
  workspace: {
    id: string;
    allocated: number;
    available: number;
    reserved: number;
    spent: number;
    policy: Policy;
  };
  purchases: Purchase[];
  versions: ProposalVersion[];
  events: AuditEvent[];
  webhookReceipts: WebhookReceipt[];
  catalogue: Offer[];
  scenarios: typeof SCENARIOS;
  report: unknown;
  services: {
    ai: boolean;
    paypal: boolean;
    license: boolean;
    webhooks: boolean;
  };
}
interface Config {
  paypalClientId: string;
  agLicense: string;
  model: string;
  services: State["services"];
}
async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: any = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}
const statusNames: Record<string, string> = {
  DRAFT: "Draft",
  READY: "Ready for review",
  BLOCKED: "Blocked",
  REVIEW: "Needs information",
  APPROVED: "Approved",
  RESERVED: "Preparing checkout",
  ORDER_CREATED: "Awaiting buyer",
  CAPTURING: "Confirming payment",
  PAYMENT_UNKNOWN: "Needs reconciliation",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Payment verified",
  REFUNDING: "Refund in progress",
  REFUND_PENDING: "Refund pending",
  REFUND_UNKNOWN: "Refund needs review",
  REFUNDED: "Refund verified",
  CANCELLED: "Checkout closed",
  CREATE_FAILED: "Checkout failed",
  CREATE_UNKNOWN: "Order needs review",
};
const statusTone = (s: string) =>
  ["PAID", "READY", "APPROVED", "REFUNDED"].includes(s)
    ? "green"
    : ["BLOCKED", "CREATE_FAILED"].includes(s)
      ? "red"
      : ["DRAFT"].includes(s)
        ? "neutral"
        : "amber";
const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + statusTone(status)}>
      <i />
      {statusNames[status] || status}
    </span>
  );
}
function Empty({
  icon: Icon = ShoppingBag,
  title,
  children,
  action,
}: {
  icon?: any;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,button,textarea")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input,textarea,select,a[href]",
          ),
        );
        if (!items.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          className="icon-btn modal-close"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
        <div className="eyebrow">SPENDPROOF WORKSPACE</div>
        <h2 id="modal-title">{title}</h2>
        {description && <p className="muted">{description}</p>}
        {children}
      </div>
    </div>
  );
}
function App() {
  const checkoutReturn = useRef(
    new URLSearchParams(window.location.search),
  ).current;
  const [data, setData] = useState<State | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [view, setView] = useState<View>(
      checkoutReturn.get("view") === "replay"
        ? "replay"
        : checkoutReturn.has("purchase")
          ? "workspace"
          : "overview",
    ),
    [selected, setSelected] = useState<string>(
      checkoutReturn.get("purchase") || "",
    ),
    [newRequest, setNewRequest] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [showStudio, setShowStudio] = useState(false),
    [confirmRefund, setConfirmRefund] = useState(false);
  const refresh = useCallback(async () => {
    const [state, conf] = await Promise.all([
      api<State>("/state"),
      api<Config>("/config"),
    ]);
    setData(state);
    setConfig(conf);
    return state;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (showStudio)
      document.getElementById("analytics")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [showStudio]);
  useEffect(() => {
    if (!mobile) return;
    const drawer = document.querySelector<HTMLElement>(".sidebar");
    const controls = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ||
          [],
      );
    controls()[0]?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobile(false);
        document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
      }
      if (event.key === "Tab") {
        const buttons = controls(),
          first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const viewport = window.matchMedia("(max-width: 700px)");
    const resize = () => {
      if (!viewport.matches) setMobile(false);
    };
    viewport.addEventListener("change", resize);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      viewport.removeEventListener("change", resize);
      window.removeEventListener("keydown", close);
    };
  }, [mobile]);
  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError("");
    try {
      const value = await fn();
      await refresh();
      return value;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };
  const navigate = (next: View) => {
    setView(next);
    setMobile(false);
    setShowStudio(false);
    window.scrollTo(0, 0);
  };
  const open = (p: Purchase, next: View = "workspace") => {
    setSelected(p.id);
    navigate(next);
  };
  const current =
    data?.purchases.find((p) => p.id === selected) ||
    data?.purchases[0] ||
    null;
  const pending =
    data?.purchases.filter((p) => ["READY", "APPROVED"].includes(p.status)) ||
    [];
  const filtered = (data?.purchases || []).filter((p) =>
    (p.title + " " + p.intent + " " + p.status)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const captions: Record<View, string> = {
    overview: "Overview",
    workspace: "Purchase workspace",
    approvals: "Approvals",
    policies: "Policies",
    audit: "Proof ledger",
    lab: "Scenario lab",
    replay: "Recorded example",
    settings: "Connections",
  };
  const createRequest = async (form: any) => {
    await run("Creating request", async () => {
      const result = await api("/requests", form);
      setSelected(result.id);
      setNewRequest(false);
      navigate("workspace");
      setToast(
        "Your request is ready. Compare a quote or ask AI to make a proposal.",
      );
    });
  };
  const navItems: { id: View; label: string; icon: any; count?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "workspace", label: "Purchases", icon: ShoppingBag },
    {
      id: "approvals",
      label: "Approvals",
      icon: BadgeCheck,
      count: pending.length,
    },
    { id: "policies", label: "Policies", icon: SlidersHorizontal },
    { id: "audit", label: "Proof ledger", icon: FileText },
    { id: "lab", label: "Scenario lab", icon: Beaker },
    { id: "replay", label: "Recorded example", icon: History },
  ];
  const headings: Record<View, [string, string]> = {
    overview: [
      "Your spending, under control.",
      "A clear view of your requests, decisions, and payment proof.",
    ],
    workspace: [
      "A thoughtful purchase starts here.",
      "Compare the quote, review the checks, and choose your next step.",
    ],
    approvals: [
      "Ready for your decision.",
      "Inspect each proposal before it moves to checkout.",
    ],
    policies: [
      "Your budget. Your boundaries.",
      "Set the rules your purchasing agent must follow.",
    ],
    audit: [
      "The proof behind every purchase.",
      "Follow the evidence from the first request to the verified result.",
    ],
    lab: [
      "See your safeguards in action.",
      "Explore policy decisions and recovery controls with labelled test cases.",
    ],
    replay: [
      "One purchase. The whole story.",
      "Explore an earlier sandbox run, from proposal to verified refund.",
    ],
    settings: [
      "Connected to the right tools.",
      "Review the services behind your purchasing workspace.",
    ],
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        className={"sidebar " + (mobile ? "open" : "")}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
        aria-label="Workspace navigation"
      >
        <button className="brand" onClick={() => navigate("overview")}>
          <span className="brand-mark">
            <ShieldCheck size={25} strokeWidth={1.6} />
          </span>
          <span>
            spendproof<span className="brand-period">.</span>
          </span>
        </button>
        <div className="workspace-selector">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>Personal workspace</strong>
            <small>Private browser session</small>
          </div>
          <LockKeyhole size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {navItems.map((n) => (
            <React.Fragment key={n.id}>
              {n.id === "lab" && (
                <div className="nav-caption nav-explore">EXPLORE</div>
              )}
              <button
                className={"nav-item " + (view === n.id ? "active" : "")}
                aria-current={view === n.id ? "page" : undefined}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} strokeWidth={1.7} />
                <span>{n.label}</span>
                {!!n.count && <b>{n.count}</b>}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-shield">
              <LockKeyhole size={16} />
            </span>
            <strong>You stay in control.</strong>
            <p>
              AI proposes. Your rules and approval decide what happens next.
            </p>
          </div>
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>Connections</span>
            <span
              className={
                "connection-dot " +
                (data?.services.ai && data?.services.paypal ? "connected" : "")
              }
            />
          </button>
          <div className="profile">
            <span className="profile-avatar">YOU</span>
            <div>
              <strong>Sandbox workspace</strong>
              <small>Simulated funds · USD</small>
            </div>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
              aria-expanded={mobile}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{captions[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="sandbox-pill">
              <span /> PayPal sandbox
            </span>
            <button
              className="icon-btn"
              title="Refresh workspace"
              aria-label="Refresh workspace"
              onClick={() => run("Refreshing", refresh)}
            >
              <RefreshCw
                size={17}
                className={busy === "Refreshing" ? "spin" : ""}
              />
            </button>
            <button
              className="avatar"
              onClick={() => navigate("settings")}
              aria-label="Connection settings"
            >
              S
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{captions[view]}</div>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            {!["settings", "policies"].includes(view) && (
              <button
                className="button primary"
                onClick={() => setNewRequest(true)}
              >
                <Plus size={17} />
                New purchase
              </button>
            )}
          </div>
          {error && view !== "replay" && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={19} />
              <div>
                <strong>Something needs a closer look</strong>
                <p>{error}</p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={18} />
              </button>
            </div>
          )}
          {view === "replay" ? (
            <Suspense
              fallback={
                <div className="initial-loading">Opening recorded example…</div>
              }
            >
              <RecordedRun
                onStart={() => {
                  navigate("overview");
                  setNewRequest(true);
                }}
              />
            </Suspense>
          ) : !data ? (
            <div className="initial-loading">
              {error ? (
                <>
                  <CircleHelp size={28} />
                  <h3>Your workspace could not be loaded.</h3>
                  <p>Retry the connection to load your requests and records.</p>
                  <button
                    className="button"
                    onClick={() => run("Connecting", refresh)}
                  >
                    Try again
                  </button>
                  <details className="connection-help">
                    <summary>Local development help</summary>
                    <p>Start the local API, then retry the connection.</p>
                    <code>npm run db:local</code>
                    <code>npm run dev:api</code>
                  </details>
                </>
              ) : (
                <>
                  <Loader2 className="spin" size={28} />
                  <p>Opening your workspace…</p>
                </>
              )}
            </div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <WorkspaceFocus
                    purchases={data.purchases}
                    policy={data.workspace.policy}
                    onOpen={(purchase, proof) =>
                      open(purchase, proof ? "audit" : "workspace")
                    }
                    onNew={() => setNewRequest(true)}
                    onReplay={() => navigate("replay")}
                    onAnalytics={() => setShowStudio(true)}
                  />
                  <div className="summary-grid">
                    <Metric
                      title="Available allowance"
                      value={money(data.workspace.available)}
                      detail={`of ${money(data.workspace.allocated)} allocated`}
                      icon={Wallet}
                      accent="green"
                    />
                    <Metric
                      title="Verified spend"
                      value={money(data.workspace.spent)}
                      detail="Gross captures, less verified refunds"
                      icon={ShoppingBag}
                    />
                    <Metric
                      title="Reserved for checkout"
                      value={money(data.workspace.reserved)}
                      detail="Held until the payment is resolved"
                      icon={LockKeyhole}
                    />
                    <Metric
                      title="Awaiting your review"
                      value={String(pending.length).padStart(2, "0")}
                      detail="Allowed proposals and approvals"
                      icon={BadgeCheck}
                      accent="peach"
                    />
                  </div>
                  {!data.purchases.length ? (
                    <section
                      className="first-purchase-guide"
                      aria-label="How the demo works"
                    >
                      <div className="guide-intro">
                        <span className="eyebrow">A SIMPLE FIRST REQUEST</span>
                        <h2>Three licences. A $60 limit. No subscription.</h2>
                        <p>
                          Explore four fictional offers and see why the cheapest
                          sticker price may not fit your rules.
                        </p>
                      </div>
                      <div className="guide-step">
                        <span>01</span>
                        <strong>Compare the quote</strong>
                        <p>AI proposes an offer with source evidence.</p>
                      </div>
                      <div className="guide-step">
                        <span>02</span>
                        <strong>Make the decision</strong>
                        <p>Independent checks explain every result.</p>
                      </div>
                      <div className="guide-step">
                        <span>03</span>
                        <strong>Follow the proof</strong>
                        <p>PayPal confirms the sandbox payment.</p>
                      </div>
                    </section>
                  ) : (
                    <div className="overview-middle">
                      <section className="panel allowance-panel">
                        <div className="panel-heading">
                          <h2>Allowance at a glance</h2>
                          <span className="subtle-label">
                            USD · application policy
                          </span>
                        </div>
                        <div className="allowance-content">
                          <div
                            className="allowance-ring"
                            style={{
                              background: `conic-gradient(#204d3d 0 ${(data.workspace.spent / data.workspace.allocated) * 100}%,#d8ad64 ${(data.workspace.spent / data.workspace.allocated) * 100}% ${((data.workspace.spent + data.workspace.reserved) / data.workspace.allocated) * 100}%,#e9eee7 0)`,
                            }}
                          >
                            <div>
                              <small>AVAILABLE</small>
                              <strong>{money(data.workspace.available)}</strong>
                              <span>
                                {Math.round(
                                  (data.workspace.available /
                                    data.workspace.allocated) *
                                    100,
                                )}
                                % of allowance
                              </span>
                            </div>
                          </div>
                          <div className="allowance-legend">
                            <Legend
                              color="#e9eee7"
                              label="Available"
                              value={money(data.workspace.available)}
                            />
                            <Legend
                              color="#d8ad64"
                              label="Reserved"
                              value={money(data.workspace.reserved)}
                            />
                            <Legend
                              color="#204d3d"
                              label="Net spend"
                              value={money(data.workspace.spent)}
                            />
                            <p>
                              Tracks the rules for this workspace.
                              <br />
                              This is not your PayPal balance.
                            </p>
                          </div>
                        </div>
                      </section>
                      <section className="panel activity-panel">
                        <div className="panel-heading">
                          <h2>Latest activity</h2>
                          <span className="tag subtle">LIVE WORKSPACE</span>
                        </div>
                        <ActivityList events={data.events.slice(0, 4)} />
                      </section>
                    </div>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Purchase activity{" "}
                          <span className="count-bubble">
                            {data.purchases.length}
                          </span>
                        </h2>
                        <p>
                          Open a request to continue, or explore the evidence in
                          Studio.
                        </p>
                      </div>
                      <div className="table-actions">
                        <label className="search-box">
                          <Search size={16} />
                          <input
                            aria-label="Search purchases"
                            placeholder="Find a purchase…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                        <button
                          className="button small"
                          onClick={() => setShowStudio((v) => !v)}
                        >
                          <SlidersHorizontal size={15} />
                          {showStudio ? "Hide analytics" : "Explore in Studio"}
                        </button>
                      </div>
                    </div>
                    {query.trim() && !filtered.length ? (
                      <Empty
                        icon={Search}
                        title="No matching purchases."
                        action={
                          <button
                            className="button small"
                            onClick={() => setQuery("")}
                          >
                            Clear search
                          </button>
                        }
                      >
                        Try another name, brief, or status.
                      </Empty>
                    ) : (
                      <PurchaseTable purchases={filtered} open={open} />
                    )}
                  </section>
                  {showStudio && (
                    <section
                      className="panel studio-panel"
                      id="analytics"
                      aria-label="Interactive analytics"
                    >
                      <div className="panel-heading">
                        <div>
                          <h2>Your decisions, in perspective.</h2>
                          <p>
                            Build a report, follow a pattern, or open the proof
                            behind a number.
                          </p>
                        </div>
                        <span className="tag soft">
                          <Sparkles size={13} /> AG STUDIO
                        </span>
                      </div>
                      <Suspense
                        fallback={
                          <div className="studio-loading">
                            <Loader2 className="spin" />
                            Opening Studio…
                          </div>
                        }
                      >
                        <Studio
                          data={data}
                          config={config}
                          onOpen={(p) => open(p, "audit")}
                          onError={setError}
                          onSaved={(report) =>
                            setData((d) => (d ? { ...d, report } : d))
                          }
                        />
                      </Suspense>
                    </section>
                  )}
                  <div className="bottom-note">
                    <ShieldCheck size={16} />
                    <span>
                      Payments require an allowed plan, current approval, and
                      buyer consent in PayPal.
                    </span>
                    <button
                      className="text-button"
                      onClick={() => navigate("policies")}
                    >
                      View your policy
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {view === "workspace" &&
                (current ? (
                  <PurchaseWorkspace
                    purchase={current}
                    data={data}
                    config={config}
                    busy={busy}
                    onRun={run}
                    onToast={setToast}
                    onOpenAudit={() => navigate("audit")}
                    onConnect={() => navigate("settings")}
                    onNew={() => setNewRequest(true)}
                  />
                ) : (
                  <div className="panel">
                    <Empty
                      title="A good purchase starts with a clear request."
                      action={
                        <button
                          className="button primary"
                          onClick={() => setNewRequest(true)}
                        >
                          Create your first request
                          <ArrowRight size={16} />
                        </button>
                      }
                    >
                      Tell us what you need, how many, and the maximum you're
                      willing to spend.
                    </Empty>
                  </div>
                ))}
              {view === "approvals" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Review queue</h2>
                    <span className="tag soft">{pending.length} waiting</span>
                  </div>
                  {pending.length ? (
                    <PurchaseTable purchases={pending} open={open} />
                  ) : (
                    <Empty icon={BadgeCheck} title="You're all caught up.">
                      Allowed proposals will appear here when they're ready for
                      your review.
                    </Empty>
                  )}
                </section>
              )}
              {view === "policies" && (
                <>
                  <PolicyEditor
                    policy={data.workspace.policy}
                    busy={busy}
                    onSave={(p) =>
                      run("Saving policy", async () => {
                        await api("/policy", p);
                        setToast(
                          "Policy saved. Earlier approvals need a fresh evaluation.",
                        );
                      })
                    }
                  />
                  <PolicyPlayground
                    policy={data.workspace.policy}
                    available={data.workspace.available}
                    purchases={data.purchases}
                    versions={data.versions}
                  />
                </>
              )}
              {view === "audit" && (
                <div className="audit-layout">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Purchase records</h2>
                      <span className="subtle-label">Session scoped</span>
                    </div>
                    {data.purchases.length ? (
                      <div className="record-list">
                        {data.purchases.map((p) => (
                          <button
                            key={p.id}
                            className={
                              "record-item " +
                              (current?.id === p.id ? "selected" : "")
                            }
                            onClick={() => setSelected(p.id)}
                          >
                            <span className="item-icon">
                              <FileText size={19} />
                            </span>
                            <div>
                              <strong>{p.title}</strong>
                              <small>{date(p.created_at)}</small>
                              <Badge status={p.status} />
                            </div>
                            <ChevronRight size={17} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={FileText}
                        title="The story starts with a request."
                      >
                        Your audit records appear here as you make decisions.
                      </Empty>
                    )}
                  </section>
                  <section className="panel audit-detail">
                    {current ? (
                      <>
                        <div className="panel-heading">
                          <div>
                            <div className="eyebrow">PURCHASE RECORD</div>
                            <h2>{current.title}</h2>
                          </div>
                          <div className="proof-export-actions">
                            <PrintProofButton />
                            <a
                              className="button small"
                              href={
                                "/api/audit/" +
                                current.id +
                                "/export?download=1"
                              }
                              download={
                                "spendproof-" + current.id.slice(0, 8) + ".json"
                              }
                            >
                              <Download size={15} />
                              Export proof
                            </a>
                          </div>
                        </div>
                        <div className="audit-summary">
                          <Badge status={current.status} />
                          <strong>{money(current.total)}</strong>
                          <span>
                            {current.source === "ai"
                              ? "AI proposal"
                              : current.source === "fixture"
                                ? "Fixture input"
                                : "Manual proposal"}
                          </span>
                        </div>
                        <div className="proof-links">
                          {[
                            { label: "Request", value: current.id },
                            {
                              label: "Approval fingerprint",
                              value: current.approval_hash,
                            },
                            { label: "PayPal order", value: current.order_id },
                            {
                              label: "Capture reference",
                              value: current.capture_id,
                            },
                            {
                              label: "Refund reference",
                              value: current.refund_id,
                            },
                          ].map((x) => (
                            <div key={x.label}>
                              <span>{x.label}</span>
                              <code>{x.value || "Not recorded yet"}</code>
                              {x.value && <Link2 size={14} />}
                            </div>
                          ))}
                        </div>
                        <ProofJourney
                          purchase={current}
                          events={data.events.filter(
                            (e) => e.purchase_id === current.id,
                          )}
                          receipts={(data.webhookReceipts || []).filter(
                            (r) => r.purchase_id === current.id,
                          )}
                        />
                        <h3 className="section-label">
                          The complete decision trail
                        </h3>
                        <ActivityList
                          events={data.events
                            .filter((e) => e.purchase_id === current.id)
                            .slice()
                            .reverse()}
                          expanded
                        />
                        <div className="audit-bottom-actions">
                          <button
                            className="button"
                            onClick={() => navigate("workspace")}
                          >
                            Open purchase
                            <ArrowRight size={16} />
                          </button>
                          {current.order_id &&
                            current.status !== "REFUNDED" && (
                              <button
                                className="button"
                                disabled={!!busy}
                                onClick={() =>
                                  run("Reconciling", async () => {
                                    const r = await api(
                                      "/payments/" + current.id + "/reconcile",
                                      {},
                                    );
                                    setToast(
                                      "PayPal state checked: " +
                                        (statusNames[r.status] || r.status),
                                    );
                                  })
                                }
                              >
                                <RefreshCw size={15} />
                                Check PayPal state
                              </button>
                            )}
                          {current.status === "PAID" && (
                            <button
                              className="button refund-button"
                              disabled={!!busy}
                              onClick={() => setConfirmRefund(true)}
                            >
                              <Undo2 size={15} />
                              Request full refund
                            </button>
                          )}
                        </div>
                        <p className="fine-print">
                          An application audit record linking saved decisions to
                          PayPal sandbox responses. This is not external
                          certification.
                        </p>
                      </>
                    ) : (
                      <Empty icon={FileText} title="Select a purchase record.">
                        Inspect the evidence and its payment references here.
                      </Empty>
                    )}
                  </section>
                </div>
              )}
              {view === "lab" && <ScenarioLab busy={busy} onRun={run} />}
              {view === "settings" && (
                <ConnectionSettings
                  config={config}
                  refresh={() => run("Refreshing connections", refresh)}
                />
              )}
            </>
          )}
          <footer>
            <span className="footer-brand">
              <ShieldCheck size={15} />
              spendproof.
            </span>
            <span>AI plans. You decide. Proof stays connected.</span>
            <span className="footer-sandbox">
              PayPal sandbox · simulated funds
            </span>
          </footer>
        </main>
      </div>
      {newRequest && (
        <NewRequestModal
          close={() => setNewRequest(false)}
          submit={createRequest}
          busy={!!busy}
        />
      )}
      {confirmRefund && current && (
        <Modal
          title="Return this sandbox payment?"
          description={`This requests a full ${money(current.total)} refund through PayPal. The original payment record stays in your proof ledger.`}
          close={() => setConfirmRefund(false)}
        >
          <div className="callout">
            <InfoIcon />
            <p>
              The allowance is restored only after PayPal confirms refund
              completion.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setConfirmRefund(false)}>
              Keep payment
            </button>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() =>
                run("Requesting refund", async () => {
                  const r = await api("/payments/" + current.id + "/refunds", {
                    confirm: true,
                  });
                  setConfirmRefund(false);
                  setToast(statusNames[r.status] || r.status);
                })
              }
            >
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Undo2 size={16} />
              )}
              Confirm sandbox refund
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function InfoIcon() {
  return <CircleHelp size={18} />;
}
function Metric({
  title,
  value,
  detail,
  icon: Icon,
  accent = "",
}: {
  title: string;
  value: string;
  detail: string;
  icon: any;
  accent?: string;
}) {
  return (
    <div className={"metric " + accent}>
      <div className="metric-top">
        <span>{title}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="legend-row">
      <i style={{ background: color }} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function PurchaseTable({
  purchases,
  open,
}: {
  purchases: Purchase[];
  open: (p: Purchase) => void;
}) {
  return purchases.length ? (
    <div className="table-scroll">
      <table className="purchase-table">
        <thead>
          <tr>
            <th>Purchase</th>
            <th>Proposal total</th>
            <th>Status</th>
            <th>Source</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="purchase-name" onClick={() => open(p)}>
                  <span className="item-icon">
                    <ShoppingBag size={18} />
                  </span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {p.quantity} licences · {p.id.slice(0, 8)}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <strong className="amount">
                  {money(p.plan ? p.total : p.cap)}
                </strong>
                {!p.plan && (
                  <small className="table-small">request limit</small>
                )}
              </td>
              <td>
                <Badge status={p.status} />
              </td>
              <td>
                <span className="source-label">
                  {p.source === "ai" ? (
                    <Sparkles size={13} />
                  ) : (
                    <FileText size={13} />
                  )}{" "}
                  {p.source === "ai" ? "Live AI" : "Manual"}
                </span>
              </td>
              <td className="table-date">{date(p.created_at)}</td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={"Open " + p.title}
                  onClick={() => open(p)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No purchases to show yet.">
      Your requests and their decisions will appear here.
    </Empty>
  );
}
function ActivityList({
  events,
  expanded = false,
}: {
  events: AuditEvent[];
  expanded?: boolean;
}) {
  return (
    <div className={"activity-list " + (expanded ? "expanded" : "")}>
      {events.length ? (
        events.map((e) => (
          <div className="activity-event" key={e.id}>
            <span
              className={
                "activity-node " +
                (["PAYMENT", "REFUND"].includes(e.kind) ? "verified" : "")
              }
            >
              {e.kind === "PAYMENT" ? (
                <Check size={14} />
              ) : e.kind === "PLAN" ? (
                <Sparkles size={13} />
              ) : (
                <span />
              )}
            </span>
            <div>
              <strong>{e.title}</strong>
              <p>{e.detail}</p>
              <small>
                {date(e.created_at)}
                <span>·</span>
                {e.source === "PAYPAL"
                  ? "PayPal response"
                  : e.source === "AI"
                    ? "AI-assisted"
                    : "Application record"}
              </small>
            </div>
          </div>
        ))
      ) : (
        <div className="quiet-empty">No events for this request yet.</div>
      )}
    </div>
  );
}
function NewRequestModal({
  close,
  submit,
  busy,
}: {
  close: () => void;
  submit: (x: any) => void;
  busy: boolean;
}) {
  const [drafting, setDrafting] = useState(false),
    [draftNote, setDraftNote] = useState(""),
    [draftError, setDraftError] = useState(""),
    [title, setTitle] = useState("Design assets for the studio"),
    [intent, setIntent] = useState(
      "Buy three design asset licences for no more than $60 total. One-time purchases only, from the approved demo merchant.",
    ),
    [quantity, setQuantity] = useState(3),
    [cap, setCap] = useState("60.00");
  return (
    <Modal
      title="What would you like to purchase?"
      description="Set a clear task and a firm limit. You'll review the proposal before checkout."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Math.round(Number(cap) * 100);
          if (Number.isFinite(amount) && amount > 0)
            submit({ title, intent, quantity, cap: amount });
        }}
      >
        <label className="field">
          Purchase name
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Your purchasing brief
          <textarea
            required
            rows={4}
            maxLength={2000}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
        </label>
        <div className="draft-constraints">
          <button
            type="button"
            className="button small ai-button"
            disabled={drafting || busy}
            onClick={async () => {
              setDrafting(true);
              setDraftError("");
              try {
                const d = await api("/requests/draft", { intent });
                setTitle(d.title);
                setQuantity(d.quantity);
                setCap((d.cap / 100).toFixed(2));
                setDraftNote(
                  "AI drafted these values. Check and correct them before creating your request.",
                );
              } catch (e) {
                setDraftError((e as Error).message);
              } finally {
                setDrafting(false);
              }
            }}
          >
            {drafting ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            Draft values from my brief
          </button>
          {draftNote && <p role="status">{draftNote}</p>}
          {draftError && <p role="alert">{draftError}</p>}
        </div>
        <div className="form-row">
          <label className="field">
            Number of licences
            <input
              type="number"
              min={1}
              max={100}
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label className="field">
            Maximum total · USD
            <input
              type="number"
              min="0.01"
              step="0.01"
              max="100000"
              required
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </label>
        </div>
        <div className="callout">
          <ShieldCheck size={19} />
          <p>
            These explicit values are authoritative. AI can propose a purchase;
            it cannot raise your limit.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || drafting}>
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
            Create request
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PurchaseWorkspace({
  purchase: p,
  data,
  config,
  busy,
  onRun,
  onToast,
  onOpenAudit,
  onConnect,
  onNew,
}: {
  purchase: Purchase;
  data: State;
  config: Config | null;
  busy: string;
  onRun: (s: string, f: () => Promise<any>) => Promise<any>;
  onToast: (s: string) => void;
  onOpenAudit: () => void;
  onConnect: () => void;
  onNew: () => void;
}) {
  const [offerId, setOfferId] = useState(p.plan?.offerId || "studio-kit");
  useEffect(
    () => setOfferId(p.plan?.offerId || "studio-kit"),
    [p.id, p.plan?.offerId],
  );
  const offer = CATALOG.find((o) => o.id === offerId)!;
  const canPlan = ["DRAFT", "READY", "BLOCKED", "REVIEW", "APPROVED"].includes(
    p.status,
  );
  const stale = p.plan && p.policy_version !== data.workspace.policy.version;
  const plan = (mode: string) =>
    onRun(
      mode === "ai" ? "Planning with AI" : "Checking proposal",
      async () => {
        const result = await api("/requests/" + p.id + "/plan", {
          mode,
          offerId,
        });
        onToast(
          result.evaluation.decision === "ALLOW"
            ? "The proposal passes all current rules. Review it before approving."
            : "The proposal needs attention. Inspect the decision reasons.",
        );
      },
    );
  return (
    <div className="purchase-workspace">
      <div className="purchase-toolbar">
        <button className="text-button" onClick={onNew}>
          <Plus size={15} />
          New request
        </button>
        <div>
          <span className="subtle-label">
            REQUEST {p.id.slice(0, 8).toUpperCase()}
          </span>
          <Badge status={p.status} />
        </div>
        <button className="text-button" onClick={onOpenAudit}>
          Open proof record
          <ArrowUpRight size={15} />
        </button>
      </div>
      <PurchaseProgress purchase={p} />
      <div className="workspace-columns">
        <div className="workspace-left">
          <section className="panel request-panel">
            <div className="panel-heading">
              <span className="step-label">01</span>
              <h2>The request</h2>
              <span className="tag subtle">YOUR INPUT</span>
            </div>
            <h3>{p.title}</h3>
            <p className="request-intent">{p.intent}</p>
            <div className="request-facts">
              <div>
                <small>QUANTITY</small>
                <strong>{p.quantity} licences</strong>
              </div>
              <div>
                <small>MAXIMUM TOTAL</small>
                <strong>{money(p.cap)}</strong>
              </div>
              <div>
                <small>BILLING</small>
                <strong>One-time only</strong>
              </div>
            </div>
          </section>
          <section className="panel quote-panel">
            <div className="panel-heading">
              <span className="step-label">02</span>
              <h2>Compare the offers</h2>
              <span className="tag subtle">DEMO CATALOGUE</span>
            </div>
            <div className="offer-grid">
              {CATALOG.map((o) => (
                <button
                  key={o.id}
                  disabled={!canPlan}
                  className={
                    "offer-card " +
                    o.accent +
                    " " +
                    (o.id === offerId ? "selected" : "")
                  }
                  onClick={() => setOfferId(o.id)}
                >
                  <span className="offer-art">
                    <span>
                      {o.id === "studio-kit"
                        ? "Aa"
                        : o.id === "studio-plus"
                          ? "✳"
                          : o.id === "studio-pro"
                            ? "↗"
                            : "?"}
                    </span>
                  </span>
                  <span className="offer-meta">
                    <small>{o.category}</small>
                    <strong>{o.name}</strong>
                    <span>
                      {money(o.unitPrice)}
                      <small>
                        {o.billing === "monthly" ? " / month" : " / licence"}
                      </small>
                    </span>
                  </span>
                  <span className="radio-circle">
                    {o.id === offerId && <Check size={12} />}
                  </span>
                </button>
              ))}
            </div>
            <div className="source-document">
              <div>
                <FileText size={16} />
                <strong>Source quote</strong>
                <span>Fictional catalogue · authoritative demo terms</span>
              </div>
              <blockquote>{offer.source}</blockquote>
            </div>
            <div className="planner-actions">
              <button
                className="button"
                disabled={!!busy || !canPlan}
                onClick={() => plan("manual")}
              >
                {busy === "Checking proposal" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Check selected offer
              </button>
              <button
                className="button ai-button"
                disabled={!!busy || !canPlan || !data.services.ai}
                title={
                  data.services.ai
                    ? "Generate a live AI proposal"
                    : "Connect a Groq Free key in Connections"
                }
                onClick={() => plan("ai")}
              >
                {busy === "Planning with AI" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                Find a fit with AI
              </button>
            </div>
            <p className="fine-print">
              Manual checks are labelled manual. “Find a fit with AI” calls the
              configured model and validates its source evidence.
            </p>
          </section>
          <ProposalHistory
            versions={data.versions.filter((v) => v.purchase_id === p.id)}
          />
        </div>
        <div className="workspace-right">
          <section className="panel decision-panel">
            <div className="panel-heading">
              <span className="step-label">03</span>
              <h2>The decision</h2>
            </div>
            {p.evaluation ? (
              <>
                <div
                  className={
                    "decision-hero " + p.evaluation.decision.toLowerCase()
                  }
                >
                  {p.evaluation.decision === "ALLOW" ? (
                    <ShieldCheck size={29} />
                  ) : p.evaluation.decision === "BLOCK" ? (
                    <XCircle size={29} />
                  ) : (
                    <CircleHelp size={29} />
                  )}
                  <div>
                    <span>
                      {stale
                        ? "Policy changed"
                        : p.evaluation.decision === "ALLOW"
                          ? "A good fit."
                          : p.evaluation.decision === "BLOCK"
                            ? "Outside your rules."
                            : "A few details are missing."}
                    </span>
                    <p>
                      {stale
                        ? "Reevaluate against the latest policy before approval."
                        : p.evaluation.decision === "ALLOW"
                          ? "The current proposal passes every check."
                          : p.evaluation.decision === "BLOCK"
                            ? "Revise the proposal before continuing."
                            : "Supply the missing authoritative information."}
                    </p>
                  </div>
                </div>
                <div className="decision-total">
                  <span>Proposal total</span>
                  <strong>{money(p.total)}</strong>
                </div>
                <DecisionChecks
                  key={`${p.version}:${p.policy_version}`}
                  checks={p.evaluation.checks}
                />
                {p.plan && (
                  <div className="proposal-summary">
                    <span className="tag subtle">
                      {p.plan.origin === "ai"
                        ? "LIVE AI SUMMARY"
                        : "MANUAL PROPOSAL"}
                    </span>
                    <p>{p.plan.explanation}</p>
                  </div>
                )}
                <div className="decision-actions">
                  {p.status === "READY" && !stale && (
                    <button
                      className="button primary full"
                      disabled={!!busy}
                      onClick={() =>
                        onRun("Approving", async () => {
                          await api("/plans/" + p.id + "/approve", {});
                          onToast(
                            "This exact proposal is approved. PayPal buyer approval is still required.",
                          );
                        })
                      }
                    >
                      {busy === "Approving" ? (
                        <Loader2 className="spin" size={16} />
                      ) : (
                        <BadgeCheck size={16} />
                      )}
                      Approve {money(p.total)} proposal
                    </button>
                  )}
                  {stale && canPlan && (
                    <button
                      className="button primary full"
                      disabled={!!busy}
                      onClick={() =>
                        plan(p.plan?.origin === "ai" ? "ai" : "manual")
                      }
                    >
                      <RefreshCw size={16} />
                      Reevaluate proposal
                    </button>
                  )}
                  {["APPROVED", "ORDER_CREATED"].includes(p.status) && (
                    <PayPalButton
                      p={p}
                      config={config}
                      onRun={onRun}
                      onToast={onToast}
                      onConnect={onConnect}
                    />
                  )}{" "}
                  {["PAID", "REFUNDED"].includes(p.status) && (
                    <button
                      className="button primary full"
                      onClick={onOpenAudit}
                    >
                      <FileText size={16} />
                      View verified payment record
                    </button>
                  )}
                  {[
                    "PAYMENT_UNKNOWN",
                    "PAYMENT_PENDING",
                    "CAPTURING",
                    "CREATE_UNKNOWN",
                    "REFUND_UNKNOWN",
                    "REFUND_PENDING",
                  ].includes(p.status) && (
                    <button
                      className="button full"
                      disabled={!!busy}
                      onClick={() =>
                        onRun("Reconciling", async () => {
                          const result = await api(
                            "/payments/" + p.id + "/reconcile",
                            {},
                          );
                          onToast(statusNames[result.status] || result.status);
                        })
                      }
                    >
                      <RefreshCw size={16} />
                      Reconcile with PayPal
                    </button>
                  )}
                </div>
                <p className="fine-print">
                  Proposal v{p.version} · policy v{p.policy_version}
                  {p.approval_expires
                    ? " · approval expires " + date(p.approval_expires)
                    : ""}
                </p>
              </>
            ) : (
              <Empty icon={ShieldCheck} title="The evidence comes first.">
                Select an offer and check it, or ask AI to propose a fit. Every
                decision will appear here.
              </Empty>
            )}
          </section>
          <div className="quiet-callout">
            <LockKeyhole size={18} />
            <p>
              Approval binds the exact proposal. If the plan or policy changes,
              it needs a fresh review.
            </p>
          </div>
        </div>
      </div>
      <CostComparison quantity={p.quantity} />
    </div>
  );
}

function ProposalHistory({ versions }: { versions: ProposalVersion[] }) {
  const [record, setRecord] = useState<ProposalVersion | null>(null),
    ordered = [...versions].sort((a, b) => b.version - a.version),
    latest = ordered[0],
    previous = ordered[1];
  if (!latest) return null;
  const changes = previous
    ? [
        {
          label: "Offer",
          before:
            CATALOG.find((o) => o.id === previous.plan.offerId)?.name ||
            previous.plan.offerId,
          after:
            CATALOG.find((o) => o.id === latest.plan.offerId)?.name ||
            latest.plan.offerId,
        },
        {
          label: "Quantity",
          before: String(previous.plan.quantity),
          after: String(latest.plan.quantity),
        },
        {
          label: "Billing",
          before: previous.plan.billing,
          after: latest.plan.billing,
        },
        {
          label: "Total",
          before: money(previous.total),
          after: money(latest.total),
        },
        {
          label: "Decision",
          before: previous.evaluation.decision,
          after: latest.evaluation.decision,
        },
        {
          label: "Policy",
          before: "v" + previous.policy_version,
          after: "v" + latest.policy_version,
        },
      ]
    : [];
  return (
    <section className="panel proposal-history">
      <div className="panel-heading">
        <div>
          <h2>The proposal story</h2>
          <p>Saved versions keep the evidence behind each change.</p>
        </div>
        <span className="tag subtle">{versions.length} VERSIONS</span>
      </div>
      {previous ? (
        <div className="version-comparison">
          <div className="version-comparison-heading">
            <span>Latest revision</span>
            <strong>
              v{previous.version} → v{latest.version}
            </strong>
          </div>
          {changes.map((c) => (
            <div
              key={c.label}
              className={c.before !== c.after ? "changed" : ""}
            >
              <span>{c.label}</span>
              <span>{c.before}</span>
              <ArrowRight size={13} />
              <strong>{c.after}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="history-intro">
          Compare a different offer or ask AI for a revised plan. Every
          evaluated version stays in this record.
        </p>
      )}
      <div className="version-list">
        {ordered.map((v) => (
          <button key={v.version} onClick={() => setRecord(v)}>
            <span className="version-number">v{v.version}</span>
            <div>
              <strong>
                {CATALOG.find((o) => o.id === v.plan.offerId)?.name ||
                  v.plan.offerId}{" "}
                · {money(v.total)}
              </strong>
              <small>
                {date(v.created_at)} ·{" "}
                {v.source === "ai" ? "AI proposal" : "Manual proposal"}
              </small>
            </div>
            <span
              className={
                "badge " +
                (v.evaluation.decision === "ALLOW"
                  ? "green"
                  : v.evaluation.decision === "BLOCK"
                    ? "red"
                    : "amber")
              }
            >
              {v.evaluation.decision}
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
      {record && (
        <Modal
          title={"Recorded proposal v" + record.version}
          description={
            "Saved " + date(record.created_at) + " · inspection only"
          }
          close={() => setRecord(null)}
        >
          <span className="tag soft">
            RECORDED · {record.source === "ai" ? "AI OUTPUT" : "MANUAL INPUT"}
          </span>
          <h3 className="recorded-total">
            {money(record.total)} · {record.plan.quantity} licences
          </h3>
          <p className="recorded-summary">{record.plan.explanation}</p>
          <div className="recorded-evidence">
            {record.plan.evidence.map((e, i) => (
              <blockquote key={i}>{e}</blockquote>
            ))}
          </div>
          <div className="check-list">
            {record.evaluation.checks.map((c) => (
              <div key={c.code} className={"rule-check " + c.outcome}>
                {c.outcome === "pass" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                <div>
                  <strong>{c.label}</strong>
                  <p>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Policy v{record.policy_version}. This recorded evaluation does not
            authorize a current payment.
          </p>
        </Modal>
      )}
    </section>
  );
}

let sdkPromise: Promise<any> | null = null;
async function checkoutStep<T>(work: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                stage +
                  " timed out. Refresh the page and retry; no payment was started.",
              ),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function loadPayPal(clientId: string) {
  if (!sdkPromise)
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
      script.onload = () => resolve((window as any).paypal);
      script.onerror = () => {
        sdkPromise = null;
        reject(
          new Error("PayPal checkout could not load. Check your connection."),
        );
      };
      document.head.appendChild(script);
    });
  const paypal = await sdkPromise;
  return paypal.createInstance({
    clientId,
    components: ["paypal-payments"],
    pageType: "checkout",
  });
}
function PayPalButton({
  p,
  config,
  onRun,
  onToast,
  onConnect,
}: {
  p: Purchase;
  config: Config | null;
  onRun: (s: string, f: () => Promise<any>) => Promise<any>;
  onToast: (s: string) => void;
  onConnect: () => void;
}) {
  const session = useRef<any>(null),
    [ready, setReady] = useState(false),
    [preparing, setPreparing] = useState(false),
    [creatingHosted, setCreatingHosted] = useState(false),
    [message, setMessage] = useState("");
  const approvalExpired =
    !!p.approval_expires && Date.parse(p.approval_expires) < Date.now();
  useEffect(() => {
    session.current = null;
    setReady(false);
    setMessage("");
  }, [p.id, config?.paypalClientId]);
  async function prepare() {
    setPreparing(true);
    setMessage("");
    try {
      setMessage("Loading PayPal sandbox checkout…");
      const sdk = await checkoutStep(
        loadPayPal(config!.paypalClientId),
        "PayPal SDK initialization",
      );
      setMessage("Checking PayPal availability for USD…");
      const eligibility = await checkoutStep<{
        isEligible: (method: string) => boolean;
      }>(
        sdk.findEligibleMethods({ currencyCode: "USD" }),
        "PayPal eligibility check",
      );
      if (!eligibility.isEligible("paypal"))
        throw new Error("PayPal checkout is not eligible in this browser.");
      setMessage("Preparing the buyer approval session…");
      session.current = await checkoutStep(
        sdk.createPayPalOneTimePaymentSession({
          onApprove: async (event: any) => {
            await onRun("Verifying payment", async () => {
              const result = await api(
                "/orders/" + event.orderId + "/capture",
                {},
              );
              onToast(
                result.status === "PAID"
                  ? "Payment verified. Your proof record is ready."
                  : "PayPal state: " +
                      (statusNames[result.status] || result.status),
              );
            });
          },
          onCancel: async () => {
            await onRun("Closing checkout", async () => {
              const r = await api("/payments/" + p.id + "/close", {});
              onToast(
                r.status === "CANCELLED"
                  ? "Checkout closed and the application reservation was released."
                  : "PayPal state: " + (statusNames[r.status] || r.status),
              );
            });
          },
          onError: () =>
            setMessage(
              "PayPal checkout encountered an error. Your request and operation record remain available.",
            ),
        }),
        "PayPal checkout session",
      );
      setReady(true);
      setMessage(
        "Checkout is ready. Continue when you want to open PayPal buyer approval.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }
  if (!config?.paypalClientId)
    return (
      <button className="button primary full" onClick={onConnect}>
        <Link2 size={16} />
        Connect PayPal sandbox
      </button>
    );
  return (
    <div>
      <button
        className="button paypal-button full"
        disabled={preparing}
        onClick={() => {
          if (!ready) {
            prepare();
            return;
          }
          setMessage("");
          const orderPromise = api("/plans/" + p.id + "/checkout", {}).then(
            (r) => {
              onRun("Refreshing checkout", async () => {});
              return { orderId: r.orderId };
            },
          );
          session.current
            .start({ presentationMode: "auto" }, orderPromise)
            .catch((e: any) =>
              setMessage(e.message || "Checkout did not open."),
            );
        }}
      >
        {preparing ? (
          <Loader2 className="spin" size={16} />
        ) : (
          <LockKeyhole size={16} />
        )}
        {preparing
          ? "Preparing checkout…"
          : ready
            ? "Continue with PayPal"
            : "Prepare sandbox checkout"}
        <span className="sandbox-mini">SANDBOX</span>
      </button>
      {!p.order_id && (
        <button
          className="button full hosted-checkout-button"
          disabled={preparing || creatingHosted}
          onClick={async () => {
            setCreatingHosted(true);
            try {
              await onRun("Creating hosted checkout", async () => {
                await api("/plans/" + p.id + "/checkout", { flow: "redirect" });
                onToast(
                  "Hosted checkout is ready. Open PayPal to approve the sandbox purchase.",
                );
              });
            } finally {
              setCreatingHosted(false);
            }
          }}
        >
          {creatingHosted ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <ArrowUpRight size={16} />
          )}
          Use hosted sandbox checkout
        </button>
      )}
      {p.approval_url && p.status === "ORDER_CREATED" && (
        <a
          className="button primary full hosted-checkout-button"
          href={p.approval_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open PayPal sandbox approval
          <ArrowUpRight size={16} />
        </a>
      )}
      {p.status === "ORDER_CREATED" && (
        <>
          <p className="checkout-message">
            After approving in PayPal, return here and verify completion. Buyer
            approval is checked again by the server.
          </p>
          <button
            className="button full hosted-checkout-button"
            onClick={() =>
              onRun("Verifying buyer approval", async () => {
                if (approvalExpired) {
                  await api("/plans/" + p.id + "/renew", { confirm: true });
                  onToast(
                    "The same exact proposal is approved again. Verify buyer approval to complete it.",
                  );
                } else {
                  const result = await api(
                    "/orders/" + p.order_id + "/capture",
                    {},
                  );
                  onToast(statusNames[result.status] || result.status);
                }
              })
            }
          >
            <ShieldCheck size={16} />
            {approvalExpired
              ? "Renew exact approval for "
              : "Verify approval and complete "}
            {money(p.total)}
          </button>
        </>
      )}
      {p.status === "ORDER_CREATED" && (
        <button
          className="text-button"
          onClick={() =>
            onRun("Closing checkout", async () => {
              await api("/payments/" + p.id + "/close", {});
              onToast(
                "Checkout closed and the application reservation was released.",
              );
            })
          }
        >
          Close this checkout
        </button>
      )}
      {message && (
        <p className="checkout-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
function PolicyEditor({
  policy,
  busy,
  onSave,
}: {
  policy: Policy;
  busy: string;
  onSave: (p: any) => void;
}) {
  const [name, setName] = useState(policy.name),
    [cap, setCap] = useState(String(policy.maxTotal / 100)),
    [quantity, setQuantity] = useState(policy.maxQuantity),
    [minutes, setMinutes] = useState(policy.approvalMinutes);
  useEffect(() => {
    setName(policy.name);
    setCap(String(policy.maxTotal / 100));
    setQuantity(policy.maxQuantity);
    setMinutes(policy.approvalMinutes);
  }, [policy.version]);
  return (
    <div className="policy-layout">
      <section className="panel policy-form">
        <div className="panel-heading">
          <div>
            <h2>Purchasing policy</h2>
            <p>Version {policy.version} · applies to this workspace</p>
          </div>
          <span className="tag soft">
            <ShieldCheck size={13} />
            ACTIVE
          </span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              name,
              maxTotal: Math.round(Number(cap) * 100),
              maxQuantity: quantity,
              approvalMinutes: minutes,
              oneTimeOnly: true,
            });
          }}
        >
          <label className="field">
            Policy name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="field">
              Maximum purchase total · USD
              <input
                type="number"
                required
                min="0.01"
                max="10000"
                step="0.01"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </label>
            <label className="field">
              Maximum quantity
              <input
                type="number"
                required
                min={1}
                max={100}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            Approval validity · minutes
            <input
              type="number"
              required
              min={1}
              max={60}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <div className="policy-fixed">
            <div>
              <span>Approved merchant</span>
              <strong>SpendProof Studio</strong>
              <LockKeyhole size={15} />
            </div>
            <div>
              <span>Currency</span>
              <strong>USD</strong>
              <LockKeyhole size={15} />
            </div>
            <div>
              <span>Billing type</span>
              <strong>One-time purchases</strong>
              <LockKeyhole size={15} />
            </div>
            <div>
              <span>Buyer approval</span>
              <strong>Required in PayPal</strong>
              <LockKeyhole size={15} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="button primary" disabled={!!busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Save a new policy version
            </button>
          </div>
        </form>
      </section>
      <aside>
        <div className="panel policy-explainer">
          <span className="large-icon">
            <ShieldCheck size={28} />
          </span>
          <h2>
            Explicit rules.
            <br />
            Independent checks.
          </h2>
          <p>
            The purchasing agent can suggest an offer. It cannot raise your
            limit, change a payment destination, or approve its own work.
          </p>
          <ul>
            <li>
              <CheckCircle2 size={16} />
              Every total is calculated by the server.
            </li>
            <li>
              <CheckCircle2 size={16} />
              Changes invalidate older approvals.
            </li>
            <li>
              <CheckCircle2 size={16} />
              Unknown essential terms need review.
            </li>
            <li>
              <CheckCircle2 size={16} />
              Simultaneous requests share one allowance.
            </li>
          </ul>
          <p className="fine-print">
            This edition supports one controlled sandbox merchant, USD, and
            one-time payments.
          </p>
        </div>
      </aside>
    </div>
  );
}
function ScenarioLab({
  busy,
  onRun,
}: {
  busy: string;
  onRun: (s: string, f: () => Promise<any>) => Promise<any>;
}) {
  const [results, setResults] = useState<Record<string, any>>({}),
    [detail, setDetail] = useState<any>(null);
  const test = async (s: (typeof SCENARIOS)[number]) => {
    const result = await api("/scenarios/" + s.id + "/run", {});
    setResults((r) => ({ ...r, [s.id]: result }));
    return result;
  };
  return (
    <>
      <div className="lab-banner">
        <div>
          <span className="tag soft">
            <Beaker size={13} />
            CONTROLLED TESTS
          </span>
          <h2>Understand what your rules actually do.</h2>
          <p>
            Each case sends a labelled fixture to the same server policy
            evaluator. No AI performance or payment completion is implied.
          </p>
        </div>
        <div className="lab-score">
          <strong>
            {Object.values(results).filter((r) => r.pass).length}
            <span> / {SCENARIOS.length}</span>
          </strong>
          <small>cases passed in this run</small>
          <button
            className="button primary"
            disabled={!!busy}
            onClick={() =>
              onRun("Running scenarios", async () => {
                for (const s of SCENARIOS) await test(s);
              })
            }
          >
            {busy === "Running scenarios" ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Beaker size={16} />
            )}
            Run all scenarios
          </button>
        </div>
      </div>
      <div className="scenario-grid">
        {SCENARIOS.map((s, i) => (
          <section className="panel scenario-card" key={s.id}>
            <div className="scenario-top">
              <span className="scenario-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="tag subtle">{s.category}</span>
              {results[s.id] && (
                <span
                  className={
                    "test-result " + (results[s.id].pass ? "passed" : "failed")
                  }
                >
                  {results[s.id].pass ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <XCircle size={17} />
                  )}
                </span>
              )}
            </div>
            <h3>{s.name}</h3>
            <p>{s.detail}</p>
            <div className="scenario-footer">
              <span>
                Expected <strong>{s.expected}</strong>
              </span>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  onRun("Testing " + s.id, async () => setDetail(await test(s)))
                }
              >
                Run case
                <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
        ))}
      </div>
      <ReliabilityLab />
      {detail && (
        <Modal
          title={detail.scenario.name}
          description="Fixture input · server evaluation · no payment created"
          close={() => setDetail(null)}
        >
          <div className={"lab-outcome " + (detail.pass ? "passed" : "failed")}>
            <CheckCircle2 size={22} />
            <strong>
              {detail.pass
                ? "Expected behavior confirmed"
                : "Unexpected result"}
            </strong>
            <span>{detail.evaluation.decision}</span>
          </div>
          <div className="check-list">
            {detail.evaluation.checks.map((c: any) => (
              <div key={c.code} className={"rule-check " + c.outcome}>
                {c.outcome === "pass" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <XCircle size={17} />
                )}
                <div>
                  <strong>{c.label}</strong>
                  <p>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function ConnectionSettings({
  config,
  refresh,
}: {
  config: Config | null;
  refresh: () => void;
}) {
  const services = config?.services;
  return (
    <div className="connections-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your connections</h2>
            <p>
              Configuration status for this workspace. Availability is checked
              when a service is used.
            </p>
          </div>
          <button className="button small" onClick={refresh}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
        {[
          {
            name: "PayPal sandbox",
            description: "Orders, buyer approval, captures, and refunds.",
            ready: services?.paypal,
            icon: Wallet,
          },
          {
            name: "Groq Free",
            description: "Live purchasing proposals and dashboard assistance.",
            ready: services?.ai,
            icon: Sparkles,
          },
          {
            name: "AG Studio trial",
            description:
              "AG Studio Pro with AI is required. Open analytics to check the saved key's coverage and expiry.",
            ready: services?.license,
            icon: LayoutDashboard,
          },
          {
            name: "PayPal webhooks",
            description:
              "Signature-verified capture and refund notifications from PayPal.",
            ready: services?.webhooks,
            icon: Link2,
          },
        ].map((s) => (
          <div className="connection-row" key={s.name}>
            <span className="item-icon">
              <s.icon size={20} />
            </span>
            <div>
              <strong>{s.name}</strong>
              <p>{s.description}</p>
            </div>
            <span className={"badge " + (s.ready ? "green" : "amber")}>
              <i />
              {s.ready ? "Configured" : "Not configured"}
            </span>
          </div>
        ))}
      </section>
      <section className="panel setup-panel">
        <span className="large-icon">
          <LockKeyhole size={27} />
        </span>
        <h2>Private configuration</h2>
        <p>
          Credentials stay on the server. Use the local setup assistant to
          update a connection.
        </p>
        <details className="setup-instructions">
          <summary>Local setup instructions</summary>
          <p>
            From the project folder, run this command in your Terminal. Input
            stays hidden and is saved to an ignored, owner-readable local file.
          </p>
          <code>npm run setup:private</code>
          <p>
            Press Enter to keep an existing value or skip an optional field.
            Restart the local API server after changing configuration.
          </p>
          <a
            className="text-button"
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get a Groq Free API key
            <ArrowUpRight size={15} />
          </a>
          <a
            className="text-button"
            href="https://www.ag-grid.com/studio/react/enterprise-licence/#request-a-45-day-trial-licence"
            target="_blank"
            rel="noreferrer"
          >
            Request the AG Studio trial
            <ArrowUpRight size={15} />
          </a>
          <div className="callout">
            <ShieldCheck size={18} />
            <p>
              Keep every provider on its free plan. This build does not require
              a paid model or a real-money payment.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
