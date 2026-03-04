-- Add penalty parameters to buildings for Ley 21.442 compliance
ALTER TABLE buildings
  ADD COLUMN interest_rate_percent DECIMAL(5, 2) DEFAULT 0.0,
  ADD COLUMN grace_period_days INTEGER DEFAULT 10;
