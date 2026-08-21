#!/bin/sh
set -eu

case "${1:-}" in
  on) state=true ;;
  off) state=false ;;
  *)
    echo "Usage: ./generator-control.sh on|off"
    exit 64
    ;;
esac

env_file="$(dirname "$0")/generator/.env"
tmp_file="${env_file}.tmp"
grep -v '^SPRITEFORGE_GENERATOR_ENABLED=' "$env_file" > "$tmp_file"
printf '\nSPRITEFORGE_GENERATOR_ENABLED=%s\n' "$state" >> "$tmp_file"
mv "$tmp_file" "$env_file"
docker compose -f "$(dirname "$0")/docker-compose.yml" -p spriteforge-visual up -d --force-recreate generator-api
echo "SpriteForge generator is now ${state}."
