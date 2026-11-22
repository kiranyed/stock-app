-- Table: positions
-- User-defined position rules for stop loss and profit targets
-- These are NOT the live brokerage positions, but rather trading rules that trigger automatic exits

CREATE TABLE IF NOT EXISTS positions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_type VARCHAR(20) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  `option` VARCHAR(50),
  stop_loss DECIMAL(10, 2),
  stop_loss_on_underlying DECIMAL(10, 2),
  target DECIMAL(10, 2),
  target_on_underlying DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY (account_type, symbol, `option`),
  KEY idx_account_active (account_type, is_active),
  KEY idx_symbol (symbol)
);
