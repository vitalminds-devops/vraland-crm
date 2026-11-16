#!/usr/bin/env bash
# Deploy the latest main on this server: ./deploy.sh [branch-or-tag]
# Database migrations are not run here; apply them yourself first.
set -euo pipefail

cd "$(dirname "$0")"
ref="${1:-main}"
container=vraland-crm

echo "==> Checking for local changes"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Tracked files were changed on this server. Commit or discard them first:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

echo "==> Fetching $ref"
git fetch --tags origin
if git rev-parse -q --verify "refs/remotes/origin/$ref" >/dev/null; then
  git checkout -q -B "$ref" "origin/$ref"
else
  git checkout -q --detach "$ref"
fi
git log --oneline -1

docker network inspect app-net >/dev/null 2>&1 || docker network create app-net

echo "==> Building image (takes a few minutes)"
docker compose build app

echo "==> Starting"
docker compose up -d --remove-orphans app

echo "==> Waiting for the health check"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)"
  case "$status" in
    healthy)
      echo "Deployed $(git log --oneline -1)"
      docker image prune -f >/dev/null
      exit 0
      ;;
    unhealthy) break ;;
  esac
  sleep 5
done

echo "The app did not become healthy (status: ${status:-unknown}). Last logs:" >&2
docker logs --tail 50 "$container" >&2
exit 1
