#!/usr/bin/env bash
# Run this ON THE SERVER (via SSH) from the project directory to deploy the
# latest main branch. See DEPLOY.md for the one-time setup this assumes
# (Node, PM2, .env.production already in place).
set -euo pipefail

BRANCH="${1:-main}"

echo "==> Fetching $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies"
npm ci

echo "==> Building (uses .env.production for NEXT_PUBLIC_* values baked in now)"
npm run build

echo "==> Restarting via PM2"
if pm2 describe gamburg-crm >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "==> Done. Recent logs:"
pm2 logs gamburg-crm --lines 20 --nostream
