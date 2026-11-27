-- The format of strategy.screeners (src/services/strategy-schema.ts). 1: rows saved before
-- screeners had ids; the app gives those ids when it reads them and stores them on the next save.
ALTER TABLE strategy
  ADD COLUMN screeners_version INT NOT NULL DEFAULT 1;
