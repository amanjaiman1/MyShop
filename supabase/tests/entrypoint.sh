#!/bin/sh
set -e

export PGDATA=/var/lib/pgdata

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  initdb -U postgres --auth=trust >/dev/null
fi

pg_ctl -D "$PGDATA" -o "-c listen_addresses='' -c unix_socket_directories=/var/run/postgresql -c timezone=UTC" -w start >/dev/null

createdb -U postgres aurelia 2>/dev/null || true

# Run the core logic suite and the demo-seed verification as separate
# processes (each migrates a fresh schema and has its own assertion state).
tsx /app/supabase/tests/db.test.ts && tsx /app/supabase/tests/seed.test.ts
