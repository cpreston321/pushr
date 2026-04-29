#!/usr/bin/env bash
#
# Sync the open-source backend artifacts into public/.
#
# public/ is the staged publishable tree — the curated bits (README.md,
# API.md, package.json, .env.example) live there permanently and this
# script overlays the things that come from the monorepo:
#
#   convex/           ← snapshotted from the root convex/ (sans _generated)
#   LICENSE           ← copied from the monorepo root
#   patches/          ← copied from the monorepo root (required by package.json)
#   tsconfig.json     ← stub for typechecking the convex/ tree standalone
#
# After the first run, point a public git repo at public/ (or a subtree of
# it) and push. Re-run any time to refresh.
#
# Usage:
#   scripts/publish-public.sh             # default — sync into ./public/
#   scripts/publish-public.sh /elsewhere  # sync into an alternate destination
#                                          (useful for direct publishing into
#                                           an external repo's working tree)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/public}"

note()  { printf '\033[36m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*" >&2; }
fail()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$ROOT/public" ] || fail "missing public/ — run from the pushr monorepo"
[ -d "$ROOT/convex" ] || fail "missing convex/ — run from the pushr monorepo"
[ -f "$ROOT/LICENSE" ] || fail "missing LICENSE — add one before publishing"

mkdir -p "$DEST"

note "→ syncing convex/ → $DEST/convex/"
# --delete cleans up files removed in the source. _generated/ is excluded so
# the consumer regenerates it locally via `bunx convex dev`.
rsync -a --delete \
  --exclude='_generated' \
  "$ROOT/convex/" "$DEST/convex/"

# Strip every `// region: tier-features` … `// endregion: tier-features`
# block from the synced files. Used to remove paid-tier schema + helpers
# from the public build so self-hosters get unlimited basic notifications
# with no billing surface.
note "→ stripping tier-features regions"
while IFS= read -r f; do
  python3 -c "
import re, sys
p = '$f'
with open(p) as fh: src = fh.read()
out = re.sub(r'\n?[ \t]*// region: tier-features.*?// endregion: tier-features\n?', '\n', src, flags=re.DOTALL)
with open(p, 'w') as fh: fh.write(out)
"
done < <(grep -rl "region: tier-features" "$DEST/convex" 2>/dev/null || true)

# Apply per-file overrides on top of the synced tree. public/overrides/convex/
# holds files that fully replace their canonical counterparts.
if [ -d "$ROOT/public/overrides/convex" ] && [ -n "$(ls -A "$ROOT/public/overrides/convex" 2>/dev/null)" ]; then
  note "→ applying public overrides"
  rsync -a "$ROOT/public/overrides/convex/" "$DEST/convex/"
fi

# Delete tier-only files. The region-strip removed every import of and call
# into tiers.ts, so the file itself is dead weight in the public build.
note "→ removing tier-only files"
rm -f "$DEST/convex/tiers.ts"

note "→ copying LICENSE"
cp "$ROOT/LICENSE" "$DEST/LICENSE"

if [ -d "$ROOT/patches" ]; then
  note "→ syncing patches/ → $DEST/patches/"
  rsync -a --delete "$ROOT/patches/" "$DEST/patches/"
fi

# Stub tsconfig for standalone typechecking of the convex/ tree.
if [ ! -f "$DEST/tsconfig.json" ]; then
  note "→ writing tsconfig.json"
  cat > "$DEST/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["convex/**/*"]
}
EOF
fi

# Sanity-scrub: refuse to publish if anything obviously private leaked in.
# Scope to the synced subtrees only — this script lives in the monorepo and
# we don't want to false-positive on its own grep patterns.
if grep -rqE 'cpreston|christian@thumbwar|00008150-000E20E63A88401C' \
     "$DEST/convex" "$DEST/LICENSE" 2>/dev/null; then
  warn "found private identifiers in synced output — review before pushing"
  grep -rnE 'cpreston|christian@thumbwar|00008150-000E20E63A88401C' \
    "$DEST/convex" "$DEST/LICENSE" || true
  exit 1
fi

note "✓ public/ is up to date"
note "  contents:"
ls "$DEST" | sed 's/^/    /'
note "  next: cd $DEST && git init && git remote add origin <your-public-repo> && git add -A && git commit && git push"
