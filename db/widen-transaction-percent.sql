-- net_percent_gain stores a percentage (12.5 means 12.5%). DECIMAL(3,2) tops out at 9.99,
-- so any trade gaining or losing 10% or more failed to insert.
ALTER TABLE transaction_sim
  MODIFY COLUMN net_percent_gain DECIMAL(9,4);
ALTER TABLE transaction_real
  MODIFY COLUMN net_percent_gain DECIMAL(9,4);
