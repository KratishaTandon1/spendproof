ALTER TABLE webhook_events ADD COLUMN purchase_id TEXT REFERENCES purchases(id);
CREATE INDEX webhook_events_purchase ON webhook_events(purchase_id,received_at);
