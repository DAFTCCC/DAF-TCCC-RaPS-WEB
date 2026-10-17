#!/usr/bin/env bash
# Run on NUC #1, using a reviewed checkout of this repository.
# Captures catalog metadata only. It does not restart or modify any service.
set -euo pipefail
umask 077
RAPS_AUDIT_SQL="$(cd "$(dirname "$0")" && pwd)/20261017_role_permission_audit.sql"
RAPS_AUDIT_DIR=$(mktemp -d "$HOME/raps-permissions-XXXXXXXX")
sudo docker exec -i -u postgres supabase-db \
  psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$RAPS_AUDIT_SQL" > "$RAPS_AUDIT_DIR/catalog.jsonl"
python3 - "$RAPS_AUDIT_DIR/catalog.jsonl" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
reports = [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
expected = {'database','roles','relations','policies','columns','functions','triggers','constraints'}
assert {row['section'] for row in reports} == expected, 'Incomplete catalog report'
for row in reports:
    print(row['section'] + ': ' + str(len(row['items']) if 'items' in row else row['version']))
print('Private report saved: ' + str(p))
PY
sha256sum "$RAPS_AUDIT_DIR/catalog.jsonl"
