\set ON_ERROR_STOP on
BEGIN;
INSERT INTO sdn_ops.operational_events(event_type,severity,status,details)
VALUES ('backup-role-proof','info','observed','{"synthetic":true}'::jsonb);
ROLLBACK;
