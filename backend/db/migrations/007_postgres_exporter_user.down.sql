REVOKE CONNECT ON DATABASE royal_dispatch FROM postgres_exporter;
REVOKE pg_monitor FROM postgres_exporter;
DROP USER IF EXISTS postgres_exporter;
