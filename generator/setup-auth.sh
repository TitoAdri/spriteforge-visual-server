#!/bin/sh
set -eu

app_dir="${SPRITEFORGE_APP_DIR:-/srv/spriteforge}"
env_file="$app_dir/generator/.env"

mkdir -p "$app_dir/generator/data"
chmod 700 "$app_dir/generator/data"

ensure_secret() {
  key="$1"
  if ! grep -q "^${key}=.\{32\}" "$env_file"; then
    sed -i "/^${key}=/d" "$env_file"
    value="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

ensure_secret SPRITEFORGE_SESSION_SECRET
ensure_secret SPRITEFORGE_PASSWORD_PEPPER
if ! grep -q '^SPRITEFORGE_AUTH_REQUIRE_HTTPS=' "$env_file"; then printf 'SPRITEFORGE_AUTH_REQUIRE_HTTPS=true\n' >> "$env_file"; fi
if ! grep -q '^SPRITEFORGE_AUTH_DB_PATH=' "$env_file"; then printf 'SPRITEFORGE_AUTH_DB_PATH=/data/spriteforge-auth.db\n' >> "$env_file"; fi

cd "$app_dir"
docker compose -f docker-compose.yml -p spriteforge-visual up -d --build
