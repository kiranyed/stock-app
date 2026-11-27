-- Simulations can email when a position is entered. Stored so a run reloaded after a restart keeps the setting.
ALTER TABLE live_job
  ADD COLUMN notify_on_entry BOOLEAN NOT NULL DEFAULT FALSE;
