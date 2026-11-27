-- Open positions of live strategy runs (signal strategies), so a run reloaded after a restart
-- still knows what it holds and can send exit alerts. A position is deleted when it closes; the
-- closed trade is recorded in transaction_sim. Ending a run deletes its positions.
-- No foreign keys: a run with positions always has a live_job row, which already keeps the
-- strategy and group from being deleted.
CREATE TABLE paper_position (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  is_long BOOLEAN NOT NULL,
  entry_price DOUBLE NOT NULL,
  entry_time BIGINT NOT NULL,
  quantity INT NOT NULL,
  -- the id of the screener that entered it (its exit filters decide the exit); ids are kept
  -- across edits, so a reordered strategy doesn't hand the position to a different screener
  screener_key VARCHAR(64) NOT NULL,
  UNIQUE KEY run_symbol (run_id, symbol)
);
