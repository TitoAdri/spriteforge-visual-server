#!/bin/sh
set -eu

# The persistent directory may be a host bind mount created by an older
# root-running image. Repair its ownership once, then drop privileges before
# starting Node so a backend compromise cannot write as root in the container.
if ! su-exec node test -w /data; then
  chown -R node:node /data
fi

exec su-exec node node --experimental-sqlite /app/src/server.mjs
