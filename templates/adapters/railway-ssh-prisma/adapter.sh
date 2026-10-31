#!/usr/bin/env bash
# Session adapter (worked example, sanitised from a production app): Railway SSH into the TEST tenant's app container + Prisma.
# Usage: adapter.sh guard | seed <personas.json> <out.json> | link <handle>     see reference/session-adapters.md
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="${UXQA_BASE_URL:?set UXQA_BASE_URL}"           # e.g. https://web-test-tenant.up.railway.app
GUARD_PATH="${UXQA_GUARD_PATH:-/api/platform}"
GUARD_FIELD="${UXQA_GUARD_FIELD:-deploymentKey}"
GUARD_VALUE="${UXQA_GUARD_VALUE:?set UXQA_GUARD_VALUE}"   # e.g. test-tenant
RAILWAY_PROJECT="${UXQA_RAILWAY_PROJECT:?set UXQA_RAILWAY_PROJECT}"
RAILWAY_SERVICE="${UXQA_RAILWAY_SERVICE:?set UXQA_RAILWAY_SERVICE}"
RAILWAY_ENVIRONMENT="${UXQA_RAILWAY_ENVIRONMENT:?set UXQA_RAILWAY_ENVIRONMENT}"

guard() {
  local value
  value=$(curl -s -m 20 "$BASE_URL$GUARD_PATH" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(process.argv[1].split(".").reduce((v,k)=>v==null?v:v[k],JSON.parse(d))??"")}catch{console.log("")}})' "$GUARD_FIELD")
  [[ "$value" == "$GUARD_VALUE" ]] || { echo "REFUSED $BASE_URL reports $GUARD_FIELD='$value'"; exit 2; }
}
SSH=(railway ssh -p "$RAILWAY_PROJECT" -s "$RAILWAY_SERVICE" -e "$RAILWAY_ENVIRONMENT" --)
# Files travel over stdin: nothing sensitive ever appears on a command line.
push() { "${SSH[@]}" sh -c "cat > /app/qa-$1" < "$2" 2>/dev/null; }
# Drop the remote CLI's chatter so only payload lines (or a short status) come back.
quiet() { grep -v -i "config as code\|railway config migrate\|keep working\|Using SSH key" || true; }

case "${1:-}" in
  guard)
    guard; echo "OK $GUARD_FIELD=$GUARD_VALUE" ;;
  seed)
    personas="${2:?personas.json}"; out="${3:?out.json}"
    guard
    push in-target-guard.mjs "$HERE/in-target-guard.mjs"
    push seed.mjs "$HERE/seed.mjs"
    push personas.json "$personas"
    mkdir -p "$(dirname "$out")"
    "${SSH[@]}" sh -c "cd /app && node qa-seed.mjs" 2>&1 | quiet | sed -n 's/^SESSIONS //p' > "$out"
    node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(j)||!j.length)process.exit(1);console.log("SEEDED",j.length)' "$out" \
      || { echo "SEED FAILED (no sessions line; run the seed script by hand in the container to see why)"; exit 1; } ;;
  link)
    handle="${2:?handle}"
    guard
    push in-target-guard.mjs "$HERE/in-target-guard.mjs"
    push link.mjs "$HERE/link.mjs"
    "${SSH[@]}" sh -c "cd /app && node qa-link.mjs '$handle'" 2>&1 | quiet | sed -n 's/^LINK /LINK /p' ;;
  *)
    echo "usage: $0 guard | seed <personas.json> <out.json> | link <handle>"; exit 1 ;;
esac
