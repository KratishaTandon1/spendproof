-- Existing local checkouts may have the first revision of this trigger.
-- AFTER INSERT prevents INSERT OR IGNORE from debiting an ignored duplicate.
DROP TRIGGER IF EXISTS reserve_allowance;
CREATE TRIGGER reserve_allowance AFTER INSERT ON reservations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM purchases p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=NEW.purchase_id AND p.workspace_id=NEW.workspace_id AND p.status='APPROVED' AND p.total=NEW.amount AND p.policy_version=json_extract(w.policy,'$.version')) THEN RAISE(ABORT,'INVALID_APPROVAL') END;
 UPDATE workspaces SET available=available-NEW.amount,reserved=reserved+NEW.amount WHERE id=NEW.workspace_id AND available>=NEW.amount;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'INSUFFICIENT_ALLOWANCE') END;
END;
