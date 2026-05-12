#!/bin/bash
# crontab: 0 3 * * * /opt/nexus/deploy/scripts/backup-redis.sh

BACKUP_DIR="/opt/nexus/deploy/backups/redis"
mkdir -p "$BACKUP_DIR"

# Trigger BGSAVE
docker exec nexus-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE

# Wait for save
sleep 5

# Copy dump
docker cp nexus-redis:/data/dump.rdb "$BACKUP_DIR/dump-$(date +%Y%m%d).rdb"

# Keep last 7 days
find "$BACKUP_DIR" -name "dump-*.rdb" -mtime +7 -delete

echo "$(date): Redis backup complete"
