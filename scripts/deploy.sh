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

echo "=== Pulling latest code ==="
git fetch origin
git reset --hard origin/development

echo "=== Building containers ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build api web ai-agent

echo "=== Starting infrastructure ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis
echo "Waiting for database to be ready..."
sleep 10

echo "=== Running database migrations ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
  -e DATABASE_URL \
  api npx prisma migrate deploy --schema /app/packages/database/prisma/schema.prisma

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
