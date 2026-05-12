#!/bin/bash
set -euo pipefail

echo "=== NEXUS Platform Deploy ==="
echo "Data: $(date)"

cd /opt/nexus

# 1. Pull
echo "Pulling latest..."
git pull origin main

# 2. Rebuild Docker image
echo "Building Docker image..."
docker compose -f deploy/docker-compose.yml build nexus-api

# 3. Restart
echo "Restarting..."
docker compose -f deploy/docker-compose.yml up -d --no-deps nexus-api

# 4. Health check
echo "Waiting for health..."
for i in $(seq 1 12); do
  if curl -sf http://localhost:4000/api/v1/health/liveness > /dev/null; then
    echo "API healthy after ${i}x5s"
    break
  fi
  if [ "$i" -eq 12 ]; then
    echo "ERRO: API nao ficou healthy em 60s"
    exit 1
  fi
  echo "  Waiting... (${i}/12)"
  sleep 5
done

# 5. Verify N8N
if curl -sf "https://n8n.shkgroups.com" > /dev/null 2>&1; then
  echo "N8N: OK"
else
  echo "N8N: VERIFICAR MANUALMENTE"
fi

echo "=== Deploy complete ==="
