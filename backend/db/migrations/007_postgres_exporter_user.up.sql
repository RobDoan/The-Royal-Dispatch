-- Create a dedicated, low-privilege user for prometheus-postgres-exporter.
-- Password is set from Vault at runtime by a one-shot Job (see Phase 3 Part B).

CREATE USER postgres_exporter WITH LOGIN PASSWORD 'replaced_after_bootstrap';
GRANT pg_monitor TO postgres_exporter;
GRANT CONNECT ON DATABASE royal_dispatch TO postgres_exporter;
