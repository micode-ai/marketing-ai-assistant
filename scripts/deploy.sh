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
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate postgres redis

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

echo "=== Restarting nginx to pick up new container IPs ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart nginx
sleep 3

echo "=== Health checks ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Deployment complete ==="
