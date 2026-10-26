#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-$ROOT/.env.local}

read_env() {
  var_name="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return 0
  fi
  line=$(grep -E "^${var_name}=" "$ENV_FILE" 2>/dev/null | head -n 1 || true)
  if [ -z "$line" ]; then
    return 0
  fi
  value=${line#*=}
  value=$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  value=${value#\"}
  value=${value%\"}
  value=${value#\'}
  value=${value%\'}
  printf '%s' "$value"
}

ask() {
  prompt="$1"
  printf '%s' "$prompt" >/dev/tty
  IFS= read -r reply </dev/tty || reply=""
  printf '%s' "$reply" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

is_email() {
  printf '%s' "$1" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
}

api_key=$(read_env YOUTUBE_API_KEY)
saved_email=$(read_env YOUTUBE_API_KEY_EMAIL)

if [ -z "$api_key" ]; then
  api_key=$(ask "YouTube API key: ")
  if [ -z "$api_key" ]; then
    echo "A YouTube API key is required." >&2
    exit 1
  fi
else
  echo "Using the saved YouTube API key." >&2
fi

if [ -n "$saved_email" ]; then
  email=$(ask "Email associated with this API key [$saved_email]: ")
  if [ -z "$email" ]; then
    email=$saved_email
  fi
else
  email=$(ask "Email associated with this API key: ")
fi

if ! is_email "$email"; then
  echo "Enter the email address for the Google account that owns this API key." >&2
  exit 1
fi

umask 077
tmp=$(mktemp "${ENV_FILE}.tmp.XXXXXX")
printf 'YOUTUBE_API_KEY=%s\nYOUTUBE_API_KEY_EMAIL=%s\n' "$api_key" "$email" > "$tmp"
mv "$tmp" "$ENV_FILE"
echo "Saved the API key for $email." >&2
