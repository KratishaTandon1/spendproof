ALTER TABLE webhook_events ADD COLUMN deliveries INTEGER NOT NULL DEFAULT 1 CHECK(deliveries >= 1);
ALTER TABLE webhook_events ADD COLUMN last_received_at TEXT;
UPDATE webhook_events SET last_received_at=received_at WHERE last_received_at IS NULL;
