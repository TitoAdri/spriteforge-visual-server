#!/bin/sh
set -eu

printf 'Administrator email: '
read email
printf 'Administrator password (not shown): '
stty -echo
read password
stty echo
printf '\n'
printf 'Confirm password: '
stty -echo
read confirmation
stty echo
printf '\n'

if [ "$password" != "$confirmation" ]; then
  echo 'Passwords do not match.' >&2
  exit 1
fi

printf '%s\n%s\n' "$email" "$password" | exec node --experimental-sqlite src/auth-admin.mjs
