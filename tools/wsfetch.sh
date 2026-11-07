#!/bin/bash
# usage: wsfetch.sh <pageTitleWithSlashes> <outfile>
TITLE="$1"
OUT="$2"
ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$TITLE")
URL="https://zh.wikisource.org/wiki/${ENC}?action=raw"
for i in 1 2 3 4 5; do
  curl -sL --max-time 45 -A "chronicle-research/1.0 (contact: local)" -o "$OUT" "$URL"
  SZ=$(wc -c < "$OUT")
  if [ "$SZ" -gt 4000 ]; then
    if head -c 200 "$OUT" | grep -q '<!DOCTYPE html>'; then
      echo "ERRPAGE $TITLE $OUT $SZ"
      rm -f "$OUT"
      sleep 3
      continue
    fi
    echo "OK $TITLE $OUT $SZ"
    exit 0
  fi
  sleep 3
done
echo "FAIL $TITLE $OUT $(wc -c < "$OUT" 2>/dev/null)"
exit 1
