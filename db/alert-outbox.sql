-- Alerts waiting to be sent, and a record of what was sent (PRODUCTION-READINESS.md §2.4).
-- One row per alert per channel, so a retry of a failed SMS never sends the email again.
-- No foreign keys: an alert's history shouldn't stop a run, strategy or user from being deleted.
CREATE TABLE alert_outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  run_id INT NULL,
  kind VARCHAR(20) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  dedup_key VARCHAR(191) NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL,
  last_error VARCHAR(1000) NULL,
  created_at BIGINT NOT NULL,
  sent_at BIGINT NULL,
  UNIQUE KEY channel_dedup (channel, dedup_key),
  KEY status_next (status, next_attempt_at),
  KEY user_created (user_id, created_at)
);
