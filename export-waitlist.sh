#!/usr/bin/env bash
# export-waitlist.sh — pulls all waitlist signups from Cloudflare KV into waitlist.csv
set -euo pipefail

NAMESPACE_ID="494f939337f447459500ede9600a8ac3"
OUTFILE="waitlist.csv"

echo "Pulling signups from KV (remote)…"
echo "email,joined" > "$OUTFILE"

wrangler kv key list --namespace-id "$NAMESPACE_ID" --remote \
  | grep '"name"' \
  | sed 's/.*"name": *"\([^"]*\)".*/\1/' \
  | while read -r key; do
      val=$(wrangler kv key get "$key" --namespace-id "$NAMESPACE_ID" --remote 2>/dev/null || true)
      joined=$(echo "$val" | sed 's/.*"joined":"\([^"]*\)".*/\1/')
      echo "$key,$joined" >> "$OUTFILE"
    done

COUNT=$(($(wc -l < "$OUTFILE") - 1))
echo "Done. Exported $COUNT signup(s) to $OUTFILE"
