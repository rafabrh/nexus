#!/bin/bash
# crontab: */5 * * * * /opt/nexus/deploy/scripts/health-check.sh >> /var/log/nexus-health.log 2>&1

API_HEALTH="http://localhost:4000/api/v1/health"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

send_alert() {
  local msg="$1"
  echo "ALERT: $msg"
  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}&text=NEXUS: ${msg}" > /dev/null
  fi
}

# Check API
if ! curl -sf "$API_HEALTH" | grep -q '"status":"ok"'; then
  send_alert "API fora do ar!"
  exit 1
fi

# Check Redis
if ! docker exec nexus-redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
  send_alert "Redis nao respondendo!"
  exit 1
fi

echo "$(date): OK"
