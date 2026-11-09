ALTER TABLE purchases ADD COLUMN policy_snapshot TEXT;
CREATE TABLE proposal_versions (
 purchase_id TEXT NOT NULL REFERENCES purchases(id),workspace_id TEXT NOT NULL,
 version INTEGER NOT NULL,plan TEXT NOT NULL,evaluation TEXT NOT NULL,total INTEGER NOT NULL,
 policy_version INTEGER NOT NULL,policy_snapshot TEXT,source TEXT NOT NULL,created_at TEXT NOT NULL,
 PRIMARY KEY(purchase_id,version)
);
INSERT INTO proposal_versions SELECT id,workspace_id,version,plan,evaluation,total,policy_version,policy_snapshot,source,updated_at FROM purchases WHERE plan IS NOT NULL;
CREATE TRIGGER record_proposal AFTER UPDATE OF version ON purchases WHEN NEW.version!=OLD.version AND NEW.plan IS NOT NULL BEGIN
 INSERT INTO proposal_versions VALUES(NEW.id,NEW.workspace_id,NEW.version,NEW.plan,NEW.evaluation,NEW.total,NEW.policy_version,NEW.policy_snapshot,NEW.source,NEW.updated_at);
END;
CREATE TRIGGER immutable_proposal_update BEFORE UPDATE ON proposal_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PROPOSAL');END;
CREATE TRIGGER immutable_proposal_delete BEFORE DELETE ON proposal_versions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PROPOSAL');END;
