-- Schema for the database: new_schema

-- Table: properties
CREATE TABLE properties (
  name VARCHAR(30) NOT NULL,
  value VARCHAR(3000),
  PRIMARY KEY (name)
);

-- Table: user
CREATE TABLE user (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(45),
  password VARCHAR(150)
);

-- Table: stock_group
CREATE TABLE stock_group (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(45),
  symbols JSON,
  date_added BIGINT,
  user_id INT,
  UNIQUE KEY (name, user_id),
  KEY user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

-- Table: stockinfo
CREATE TABLE stockinfo (
  symbol VARCHAR(6) NOT NULL PRIMARY KEY,
  marketCap BIGINT,
  earningsdate DATE,
  labels VARCHAR(45)
);

INSERT INTO stockinfo (symbol, labels) VALUES
('AAPL', 'tech'),
('AGQ', 'silver,etf,leveraged'),
('AMD', 'tech'),
('AMZN', 'tech'),
('AR', 'ng'),
('ARCH', 'coal'),
('BABA', 'china,tech'),
('BTU', 'coal'),
('CCJ', 'uranium'),
('CLF', 'steel');

-- Table: strategy
CREATE TABLE strategy (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  screeners JSON,
  description VARCHAR(200),
  date_added BIGINT,
  period INT,
  user_id INT,
  UNIQUE KEY (name, user_id),
  KEY user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES user (id)
);

-- Table: live_job
CREATE TABLE live_job (
  id INT AUTO_INCREMENT PRIMARY KEY,
  start_time BIGINT,
  end_time BIGINT,
  strategy_id INT,
  group_id INT,
  gain_percent DECIMAL(7,2),
  status VARCHAR(45),
  job_type VARCHAR(45),
  KEY strategy_id (strategy_id),
  KEY group_id (group_id),
  FOREIGN KEY (strategy_id) REFERENCES strategy (id),
  FOREIGN KEY (group_id) REFERENCES stock_group (id)
);

-- Table: transaction_real
CREATE TABLE transaction_real (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(6),
  datetime BIGINT NOT NULL,
  net_gain DECIMAL(7,2),
  net_percent_gain DECIMAL(3,2),
  `long` BOOLEAN,
  run_id INT,
  KEY run_id (run_id),
  FOREIGN KEY (run_id) REFERENCES live_job (id)
);

-- Table: transaction_sim
CREATE TABLE transaction_sim (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(6),
  datetime BIGINT,
  net_gain DECIMAL(7,2),
  net_percent_gain DECIMAL(3,2),
  `long` BOOLEAN,
  run_id INT,
  KEY sim_id_idx (run_id),
  FOREIGN KEY (run_id) REFERENCES live_job (id)
);

-- Table: stockinfotest (testing/scratch copy of stockinfo, no labels column)
CREATE TABLE IF NOT EXISTS stockinfotest (
  symbol VARCHAR(6) NOT NULL PRIMARY KEY,
  marketCap BIGINT,
  earningsdate DATE
);
