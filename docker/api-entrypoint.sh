#!/bin/sh
set -eu

echo "Pocket API container starting."

if [ "${PRISMA_MIGRATE_ON_BOOT:-true}" = "true" ]; then
  echo "Applying Prisma migrations..."
  until npx prisma migrate deploy; do
    echo "Database not ready yet. Retrying in 3 seconds..."
    sleep 3
  done
fi

if [ "${SEED_DATABASE:-true}" = "true" ]; then
  echo "Running seed routine..."
  npm run prisma:seed
fi

exec node apps/api/dist/index.js
