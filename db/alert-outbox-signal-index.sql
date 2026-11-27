-- For the digest wait: when the last entry or exit alert went to a user on a channel
-- (AlertRepository.lastSignalSent), without reading the user's whole alert history.
CREATE INDEX user_channel_sent ON alert_outbox (user_id, channel, status, sent_at);
