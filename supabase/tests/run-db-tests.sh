#!/usr/bin/env bash
# Builds and runs the self-contained database test image.
# Usage:  bash supabase/tests/run-db-tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
cp -r supabase "$CTX/supabase"
cp supabase/tests/Dockerfile "$CTX/Dockerfile"
cp supabase/tests/entrypoint.sh "$CTX/entrypoint.sh"

docker build -q -t aurelia-dbtest "$CTX" >/dev/null
docker run --rm aurelia-dbtest
