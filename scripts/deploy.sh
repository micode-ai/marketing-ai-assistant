#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/marketing-ai"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# Detect docker compose command (v2 plugin vs v1 standalone)
if docker compose version &>/dev/null; then
  DC="docker compose"
else
  DC="docker-compose"
fi

cd "$APP_DIR"

# Pre-flight: ensure env file exists and has required vars
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $APP_DIR" >&2
  exit 1
fi
if ! grep -q "POSTGRES_PASSWORD=" "$ENV_FILE" || grep -q "POSTGRES_PASSWORD=$" "$ENV_FILE"; then
  echo "ERROR: POSTGRES_PASSWORD is not set in $ENV_FILE" >&2
  exit 1
fi

echo "=== Pulling latest code ==="
git fetch origin
git reset --hard origin/development

echo "=== Building containers ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate build api web ai-agent migrator

echo "=== Starting infrastructure ==="
# Clear any zombie containers left over from a previously interrupted --force-recreate
# (docker renames the old one to <hash>_<name> before creating the new one; if create
# fails the rename sticks and blocks the next deploy).
for svc in marketing-ai-db-prod marketing-ai-redis-prod; do
  zombies=$(docker ps -a --filter "name=_${svc}$" --format '{{.ID}}')
  if [[ -n "$zombies" ]]; then
    echo "Removing zombie containers for $svc: $zombies"
    docker rm -f $zombies || true
  fi
done
# Data lives in named volumes (postgres_data_prod, redis_data_prod), so no need to
# force-recreate these on every deploy — just ensure they're up.
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis

echo "Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  status=$($DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q postgres | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [[ "$status" == "healthy" ]]; then
    echo "Postgres is healthy."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Postgres did not become healthy in time" >&2
    $DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs postgres
    exit 1
  fi
  echo "  ($i/30) postgres status: $status — waiting 3s..."
  sleep 3
done

echo "=== Running database migrations ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate run --rm migrator

echo "=== Starting application services ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "=== Waiting for services to start ==="
sleep 15

echo "=== Reconnecting shared nginx to marketing network ==="
# accounting-nginx is the shared reverse proxy for both domains.
# After container recreation, it may lose the marketing-network connection.
if docker ps -q -f name=accounting-nginx | grep -q .; then
  docker network connect marketing-ai_marketing-network accounting-nginx 2>/dev/null || true
  docker exec accounting-nginx nginx -s reload 2>/dev/null || true
  echo "accounting-nginx reconnected and reloaded."
else
  echo "WARNING: accounting-nginx not found. emarketingai.pl will not be routed."
fi

echo "=== Health checks ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Deployment complete ==="
