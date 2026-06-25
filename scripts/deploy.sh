#!/usr/bin/env bash
#
# Pocket deploy script — runs ON the target Lightsail box, streamed in over SSH by
# the GitHub Actions "Deploy" workflow:
#
#   ssh <user>@<host> 'bash -s -- <app> <workspace> <sha>' < scripts/deploy.sh
#
#   <app>        pocket-api | pocket-web   (PM2 process name, see ecosystem.config.js)
#   <workspace>  @pocket/api | @pocket/web (npm workspace to build)
#   <sha>        git commit SHA to deploy (the pushed commit on main)
#
# Behaviour: pin the repo to <sha>, install, (api) run migrations, build, zero-downtime
# reload via PM2, health-check, and roll the CODE back to the previous commit if the
# health check fails. NOTE: DB migrations are NOT auto-rolled-back (see warning below).
set -euo pipefail

APP="${1:?app name required}"
WORKSPACE="${2:?workspace required}"
SHA="${3:?git sha required}"
REPO_DIR="/home/ubuntu/pocket"

cd "$REPO_DIR"
PREV_SHA="$(git rev-parse HEAD)"
echo "==> Deploying $APP ($WORKSPACE) to $SHA   (previous: $PREV_SHA)"

reload_app() {
  if [ -f ecosystem.config.js ]; then
    pm2 startOrReload ecosystem.config.js --only "$APP" --update-env
  else
    # Rolled back to a commit predating ecosystem.config.js — reload by name.
    pm2 reload "$APP" --update-env 2>/dev/null || pm2 restart "$APP" --update-env
  fi
  pm2 save
}

build_and_reload() {
  npm ci --no-audit --no-fund
  if [ "$APP" = "pocket-api" ]; then
    npx prisma generate
    npx prisma migrate deploy
  fi
  npm run build --workspace "$WORKSPACE"
  reload_app
}

health_check() {
  local url; [ "$APP" = "pocket-api" ] && url="http://localhost:4000/health" || url="http://localhost:3000"
  for i in $(seq 1 5); do
    if curl -fsS --max-time 10 "$url" >/dev/null 2>&1; then echo "==> Health OK ($url)"; return 0; fi
    echo "    health attempt $i/5 failed, retrying..."; sleep 3
  done
  return 1
}

git fetch --all --prune --quiet
git reset --hard "$SHA"

if build_and_reload && health_check; then
  echo "==> $APP deployed successfully at $SHA"
  exit 0
fi

echo "!!! Health check FAILED — rolling CODE back to $PREV_SHA"
echo "!!! WARNING: any DB migration that already applied is NOT reverted; review manually."
git reset --hard "$PREV_SHA"
build_and_reload
health_check && echo "==> Rolled back to $PREV_SHA" || echo "!!! Rollback health check also failing — manual intervention needed"
exit 1
