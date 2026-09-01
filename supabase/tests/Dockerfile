# Self-contained database test image.
#
# Bundles PostgreSQL 15 (matching Supabase), the migrations, the Supabase shim
# and the assertion suite, so `docker run` alone proves the schema, the FIFO
# transaction, the reporting periods and the RLS policies all behave.
FROM postgres:15-alpine

RUN apk add --no-cache nodejs npm \
  && npm install -g --silent tsx@4 pg@8 \
  && npm cache clean --force

ENV NODE_PATH=/usr/local/lib/node_modules
ENV AURELIA_ROOT=/app
ENV PGHOST=/var/run/postgresql
ENV PGPORT=5432
ENV PGUSER=postgres
ENV PGDATABASE=aurelia

WORKDIR /app
COPY supabase /app/supabase
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /var/lib/pgdata /var/run/postgresql \
  && chown -R postgres:postgres /var/lib/pgdata /var/run/postgresql /app

USER postgres
ENTRYPOINT ["/entrypoint.sh"]
