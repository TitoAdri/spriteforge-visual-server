#!/usr/bin/env bash
set -Eeuo pipefail

# Host-side backup for the SQLite auth/library database. The database is
# snapshotted inside the API container with SQLite's online VACUUM INTO, so
# the live WAL is never copied directly. Backups stay outside the web volume.
APP_DIR="${SPRITEFORGE_APP_DIR:-/srv/spriteforge}"
CONTAINER="spriteforge-generator-api"
BACKUP_DIR="${SPRITEFORGE_BACKUP_DIR:-/srv/spriteforge-backups}"
CONTAINER_SNAPSHOT="/tmp/spriteforge-auth-backup.db"
CONTAINER_ARCHIVE="/tmp/spriteforge-data-backup.tar.gz"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Avoid overlapping snapshots if a previous run is still finishing.
exec 9>/run/lock/spriteforge-auth-backup.lock
flock -n 9 || exit 0

stamp="$(date -u +%Y%m%d-%H%M%S)"
host_snapshot="$BACKUP_DIR/spriteforge-auth-$stamp.db"
host_archive="$BACKUP_DIR/spriteforge-data-$stamp.tar.gz"

cleanup() {
  docker exec "$CONTAINER" rm -f "$CONTAINER_SNAPSHOT" >/dev/null 2>&1 || true
  docker exec "$CONTAINER" rm -f "$CONTAINER_ARCHIVE" >/dev/null 2>&1 || true
  rm -f "$host_snapshot.tmp"
  rm -f "$host_archive.tmp"
}
trap cleanup EXIT

docker exec "$CONTAINER" rm -f "$CONTAINER_SNAPSHOT"
docker exec "$CONTAINER" node --input-type=module -e \
  'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("/data/spriteforge-auth.db"); const target = String.fromCharCode(39) + "/tmp/spriteforge-auth-backup.db" + String.fromCharCode(39); db.exec("VACUUM INTO " + target); db.close();'

# Archive the consistent database snapshot together with the atomically
# written asset files. This keeps the library usable after a full restore.
docker exec "$CONTAINER" tar -czf "$CONTAINER_ARCHIVE" "$CONTAINER_SNAPSHOT" /data/assets
docker cp "$CONTAINER:$CONTAINER_ARCHIVE" "$host_archive.tmp"
chmod 600 "$host_archive.tmp"
mv -f "$host_archive.tmp" "$host_archive"
rm -f "$host_snapshot"

# Keep two weeks locally; production should additionally replicate these
# encrypted backups to a separate provider/storage account.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'spriteforge-data-*.tar.gz' -mtime +14 -delete
printf 'backup complete: %s\n' "$host_archive"
