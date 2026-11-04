#!/usr/bin/env bash
# End-to-end smoke test against a running server.
# Usage: BASE=http://127.0.0.1:3000 PASSWORD=... tools/smoke.sh
set -u
BASE="${BASE:-http://127.0.0.1:3000}"
# No default password is shipped on purpose. Pass the one the server is using.
if [ -z "${PASSWORD:-}" ]; then
  echo "Set PASSWORD to the same value as the server's TEACHER_PASSWORD." >&2
  echo "Example: BASE=http://127.0.0.1:3000 PASSWORD='your-local-password' tools/smoke.sh" >&2
  exit 2
fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TC=$(mktemp) ; PC=$(mktemp)
jq() { python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

echo "== 0. health =="
curl -fsS "$BASE/healthz" || { echo "server not reachable at $BASE"; exit 1; }
echo

echo "== 1. teacher login =="
curl -fsS -c "$TC" -X POST "$BASE/api/teacher/login" \
  -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}" | jq "print('login ok:', d['ok'])"

echo "== 2. create room + QR self-check =="
ROOM=$(curl -fsS -b "$TC" -X POST "$BASE/api/teacher/rooms" -H 'Content-Type: application/json' -d '{}')
CODE=$(printf '%s' "$ROOM" | jq "print(d['code'])")
printf '%s' "$ROOM" | jq "
q=d['qr']
print('  room code      :', d['code'])
print('  join url       :', q['url'])
print('  decoded == url :', q['decodedText'] == q['url'])
print('  verified flag  :', q['verified'])
print('  qr version     :', q['version'], 'level', q['ecLevel'], '/', str(q['modules'])+'x'+str(q['modules']), 'modules')
print('  quiet zone     :', q['quietZoneModules'], 'modules')
print('  uses localhost :', q['usesLocalhost'])
print('  svg size       :', len(q['svg']), 'bytes')"

echo "== 3. start lesson =="
curl -fsS -b "$TC" -X POST "$BASE/api/teacher/rooms/$CODE/start" \
  -H 'Content-Type: application/json' -d '{}' -o /dev/null -w "  http=%{http_code}\n"

echo "== 4. pupil joins with a Thai nickname =="
curl -fsS -c "$PC" -X POST "$BASE/api/pupil/join" -H 'Content-Type: application/json' \
  -d "{\"roomCode\":\"$CODE\",\"nickname\":\"\u0e21\u0e32\u0e25\u0e35\"}" | jq "
s=d['state']; q=s['question'] or {}
print('  display name   :', s['pupil']['displayName'])
print('  phase          :', s['phase'])
print('  question       :', q.get('prompt'))
print('  type/difficulty:', q.get('type'), q.get('difficulty'))
print('  leaks key?     :', any(k in q for k in ('answer','accepted','acceptedPatterns','explanation','example')))
print('  rejoin token   :', 'issued ('+str(len(d['rejoinToken']))+' chars)')"

echo "== 5. answer both questions correctly =="
for i in 1 2; do
  QID=$(curl -fsS -b "$PC" "$BASE/api/pupil/state" | jq "s=d['state'];print(s['question']['id'] if s['question'] else '')")
  [ -z "$QID" ] && break
  PAYLOAD=$(cd "$DIR" && node -e "
    const {QUESTIONS}=require('./server/questions');
    const q=QUESTIONS.find(x=>x.id==='$QID');
    const answer = q.type==='order' ? q.tokens.join(' ') : q.answer;
    process.stdout.write(JSON.stringify({questionId:q.id, answer}));")
  curl -fsS -b "$PC" -X POST "$BASE/api/pupil/answer" -H 'Content-Type: application/json' \
    -d "$PAYLOAD" | jq "f=d['feedback'];print('  $QID -> correct:', f['correct'], '| first try:', f['firstAttempt'])"
done

echo "== 6. merge round =="
curl -fsS -b "$PC" -X POST "$BASE/api/pupil/start-round" -H 'Content-Type: application/json' -d '{}' | jq "
s=d['state']; g=s['game']
print('  phase          :', s['phase'])
print('  round remaining:', s['round']['remainingMs'], 'ms of', s['round']['lengthMs'])
print('  supply taps    :', g['charges'], '/', g['chargeCap'])
print('  board          :', g['columns'], 'cols x', g['rows'], 'rows =', len(g['board']), 'cells,', len(g['locked']), 'locked')
print('  sources open   :', [x['label'] for x in g['sources']])
print('  requests       :', [(m['name'], m['kind'], str(m['coins'])+'c') for m in g['missions']])"

for n in 1 2; do
  curl -fsS -b "$PC" -X POST "$BASE/api/pupil/action" -H 'Content-Type: application/json' \
    -d "{\"action\":{\"type\":\"generate\",\"family\":\"paper\",\"nonce\":\"smoke-g$n\"}}" -o /dev/null
done
echo "  made two Paper Shapes"

MERGE='{"action":{"type":"merge","nonce":"smoke-m1","from":{"zone":"board","index":0},"to":{"zone":"board","index":1}}}'
curl -fsS -b "$PC" -X POST "$BASE/api/pupil/action" -H 'Content-Type: application/json' -d "$MERGE" | jq "
print('  merge ok       :', d['ok'], '|', d['message'])
print('  cell 1 holds   :', d['state']['game']['board'][1])"

echo "== 7. replay the same merge (idempotency) =="
curl -fsS -b "$PC" -X POST "$BASE/api/pupil/action" -H 'Content-Type: application/json' -d "$MERGE" | jq "
print('  duplicate flag :', d['duplicate'])
print('  level still    :', d['state']['game']['board'][1]['level'])"

echo "== 8. invalid merge is refused gently =="
curl -sS -b "$PC" -X POST "$BASE/api/pupil/action" -H 'Content-Type: application/json' \
  -d '{"action":{"type":"merge","nonce":"smoke-bad","from":{"zone":"board","index":1},"to":{"zone":"board","index":5}}}' | jq "
print('  ok             :', d['ok'], '| reason:', d['reason'])
print('  message        :', d['message'])"

echo "== 9. CSV exports =="
for k in english-summary english-answers game-results; do
  echo "  -- $k.csv"
  curl -fsS -b "$TC" "$BASE/api/teacher/rooms/$CODE/export/$k.csv" | head -2 | sed 's/^/     /'
done

echo "== 10. pupil blocked from teacher API =="
curl -sS -b "$PC" -o /dev/null -w "  dashboard as pupil: http=%{http_code} (expect 401)\n" \
  "$BASE/api/teacher/rooms/$CODE/dashboard"
curl -sS -o /dev/null -w "  dashboard anonymous: http=%{http_code} (expect 401)\n" \
  "$BASE/api/teacher/rooms/$CODE/dashboard"

echo "== 11. pause / resume =="
curl -fsS -b "$TC" -X POST "$BASE/api/teacher/rooms/$CODE/pause" -H 'Content-Type: application/json' -d '{}' -o /dev/null
curl -fsS -b "$PC" "$BASE/api/pupil/state" | jq "s=d['state'];print('  paused phase   :', s['phase'], '| frozen at', s['round']['remainingMs'], 'ms')"
curl -fsS -b "$TC" -X POST "$BASE/api/teacher/rooms/$CODE/start" -H 'Content-Type: application/json' -d '{}' -o /dev/null
curl -fsS -b "$PC" "$BASE/api/pupil/state" | jq "s=d['state'];print('  resumed phase  :', s['phase'], '| remaining', s['round']['remainingMs'], 'ms')"

echo "== 12. static assets =="
for p in / /teacher /css/common.css /css/pupil.css /js/pupil.js /js/art.js /js/teacher.js; do
  curl -sS -o /dev/null -w "  %{http_code} %{size_download}B  $p\n" "$BASE$p"
done
printf '  join link page: '
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/j/$CODE"

rm -f "$TC" "$PC"
echo "== smoke test finished =="
