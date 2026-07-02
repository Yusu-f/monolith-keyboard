#!/usr/bin/env bash
# Slice each 4K clip into numbered scroll frames + a poster, then rebuild manifest.json.
# Usage: ./slice.sh <name> <input.mp4> [fps]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"
INPUT="$2"
FPS="${3:-24}"
OUT="$ROOT/public/frames/$NAME"

mkdir -p "$OUT"
rm -f "$OUT"/*.jpg 2>/dev/null || true

# 4K -> 1600px wide JPGs: keeps detail on a canvas, sane total payload.
ffmpeg -y -loglevel error -i "$INPUT" \
  -vf "fps=$FPS,scale=1600:-2:flags=lanczos" \
  -q:v 4 \
  "$OUT/%03d.jpg"

cp "$OUT/001.jpg" "$OUT/poster.jpg"

COUNT=$(ls "$OUT"/[0-9]*.jpg | wc -l | tr -d ' ')
echo "$NAME: $COUNT frames -> $OUT"
