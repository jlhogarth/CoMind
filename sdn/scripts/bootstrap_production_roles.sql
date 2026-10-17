\set ON_ERROR_STOP on
\set ingest_password `cat /run/secrets/ingest_password`
\set lifecycle_password `cat /run/secrets/lifecycle_password`
\set purge_password `cat /run/secrets/purge_password`
\set observer_password `cat /run/secrets/observer_password`
\set backup_password `cat /run/secrets/backup_password`

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_ingest_user') THEN CREATE ROLE sdn_ingest_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_lifecycle_user') THEN CREATE ROLE sdn_lifecycle_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_purge_user') THEN CREATE ROLE sdn_purge_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_observer_user') THEN CREATE ROLE sdn_observer_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_backup_user') THEN CREATE ROLE sdn_backup_user LOGIN; END IF;
END $$;

ALTER ROLE sdn_ingest_user PASSWORD :'ingest_password';
ALTER ROLE sdn_lifecycle_user PASSWORD :'lifecycle_password';
ALTER ROLE sdn_purge_user PASSWORD :'purge_password';
ALTER ROLE sdn_observer_user PASSWORD :'observer_password';
ALTER ROLE sdn_backup_user PASSWORD :'backup_password';

GRANT sdn_ingest_role TO sdn_ingest_user;
GRANT sdn_lifecycle_role TO sdn_lifecycle_user;
GRANT sdn_purge_role TO sdn_purge_user;
GRANT sdn_observer_role TO sdn_observer_user;
GRANT sdn_backup_role TO sdn_backup_user;
