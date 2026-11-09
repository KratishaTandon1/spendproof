CREATE TABLE workspaces (
 id TEXT PRIMARY KEY, allocated INTEGER NOT NULL DEFAULT 15000,
 available INTEGER NOT NULL DEFAULT 15000 CHECK(available >= 0),
 reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
 spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0),
 policy TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(allocated = available + reserved + spent)
);
CREATE TABLE purchases (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 title TEXT NOT NULL, intent TEXT NOT NULL, quantity INTEGER NOT NULL,
 cap INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
 plan TEXT, evaluation TEXT, total INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, policy_version INTEGER NOT NULL DEFAULT 1,
 approval_hash TEXT, approval_expires TEXT, order_id TEXT UNIQUE,
 capture_id TEXT UNIQUE, refund_id TEXT UNIQUE, expected_payee TEXT,
 operation_key TEXT, refund_key TEXT, source TEXT NOT NULL DEFAULT 'manual',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX purchases_workspace ON purchases(workspace_id);
CREATE TABLE reservations (
 id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), amount INTEGER NOT NULL CHECK(amount > 0),
 status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','SPENT','RELEASED')),
 created_at TEXT NOT NULL
);
CREATE TRIGGER reserve_allowance AFTER INSERT ON reservations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchases p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=NEW.purchase_id AND p.workspace_id=NEW.workspace_id AND p.status='APPROVED' AND p.total=NEW.amount AND p.policy_version=json_extract(w.policy,'$.version')) THEN RAISE(ABORT,'INVALID_APPROVAL') END;
 UPDATE workspaces SET available=available-NEW.amount, reserved=reserved+NEW.amount WHERE id=NEW.workspace_id AND available>=NEW.amount;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'INSUFFICIENT_ALLOWANCE') END;
END;
CREATE TRIGGER release_allowance AFTER UPDATE OF status ON reservations WHEN OLD.status='HELD' AND NEW.status='RELEASED' BEGIN
 UPDATE workspaces SET available=available+NEW.amount, reserved=reserved-NEW.amount WHERE id=NEW.workspace_id;
END;
CREATE TRIGGER finalize_allowance AFTER UPDATE OF status ON reservations WHEN OLD.status='HELD' AND NEW.status='SPENT' BEGIN
 UPDATE workspaces SET reserved=reserved-NEW.amount, spent=spent+NEW.amount WHERE id=NEW.workspace_id;
END;
CREATE TRIGGER immutable_reservation BEFORE UPDATE ON reservations WHEN OLD.status != 'HELD' OR NEW.amount != OLD.amount OR NEW.purchase_id != OLD.purchase_id OR NEW.workspace_id != OLD.workspace_id OR NEW.id != OLD.id BEGIN
 SELECT RAISE(ABORT,'INVALID_RESERVATION_TRANSITION');
END;
CREATE TABLE refunds (
 id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), amount INTEGER NOT NULL CHECK(amount > 0), created_at TEXT NOT NULL
);
CREATE TRIGGER credit_refund AFTER INSERT ON refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchases WHERE id=NEW.purchase_id AND workspace_id=NEW.workspace_id AND capture_id IS NOT NULL AND total=NEW.amount AND status IN ('PAID','REFUNDING','REFUND_PENDING','REFUND_UNKNOWN')) THEN RAISE(ABORT,'INVALID_REFUND') END;
 UPDATE workspaces SET available=available+NEW.amount, spent=spent-NEW.amount WHERE id=NEW.workspace_id AND spent>=NEW.amount;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'INVALID_REFUND_BALANCE') END;
END;
CREATE TABLE audit_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, purchase_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX audit_workspace ON audit_events(workspace_id,created_at);
CREATE TABLE webhook_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0, received_at TEXT NOT NULL);
CREATE TABLE rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE report_layouts (workspace_id TEXT PRIMARY KEY, report TEXT NOT NULL, updated_at TEXT NOT NULL);
