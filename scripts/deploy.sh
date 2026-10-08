#!/usr/bin/env bash
# Run this ON THE SERVER (via SSH) from the project directory to deploy the
# latest main branch. See DEPLOY.md for the one-time setup this assumes
# (Node, PM2, .env.production already in place).
set -euo pipefail

BRANCH="${1:-main}"

# Node comes from nvm on this server, and an SSH shell that has not loaded
# nvm finds the system Node instead - an older one than Next accepts. When
# that happens the build fails, set -e stops the script before the PM2
# reload, and the previous build keeps serving: git shows the new commit,
# the running app is the old one, and nothing says so loudly. That cost a
# second mass-close of every open task, because the fix for the first one
# had "deployed" without ever running.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # nvm.sh reads unset variables, which set -u would abort on
  set +u
  . "$HOME/.nvm/nvm.sh"
  # no default alias set is not fatal - the version check below decides
  nvm use default >/dev/null || true
  set -u
fi

REQUIRED_NODE="20.9.0"
CURRENT_NODE="$(node -v | sed 's/^v//')"
if [ "$(printf '%s\n%s\n' "$REQUIRED_NODE" "$CURRENT_NODE" | sort -V | head -n1)" != "$REQUIRED_NODE" ]; then
  echo "!! Node $CURRENT_NODE is too old - Next needs $REQUIRED_NODE or newer."
  echo "!! Nothing was deployed; the app still runs the previous build."
  echo "!! Run: source ~/.nvm/nvm.sh && nvm ls  - then nvm use a newer one."
  exit 1
fi
echo "==> Node $CURRENT_NODE"

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

echo "==> Done. Now running $(git rev-parse --short HEAD). Recent logs:"
pm2 logs gamburg-crm --lines 20 --nostream
