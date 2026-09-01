#!/usr/bin/env bash
# Local-only helper: starts a throwaway PostgreSQL for migration/logic tests.
set -euo pipefail
NAME=aurelia-pg
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=aurelia \
  -e TZ=UTC \
  -p 55432:5432 \
  postgres:15-alpine >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d aurelia >/dev/null 2>&1; then
    echo "postgres ready"
    exit 0
  fi
  sleep 1
done
echo "postgres failed to start" >&2
exit 1
