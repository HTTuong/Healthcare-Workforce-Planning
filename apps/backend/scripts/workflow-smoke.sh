#!/usr/bin/env bash
# Smoke test of the schedule approval workflow (BR-W01 to BR-W04) against a running API and a real database.
# Usage: npm run workflow-smoke   (the API must be running, the admin must exist and npm run rbac-smoke must have
# created the smoke users). Safe to run again: every run creates two new departments and plans two later weeks,
# so schedules of earlier runs never overlap the new ones.
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin-Password-123!}"
SMOKE_PASSWORD='Smoke-Password-123!'
BODY="$(mktemp)"
failures=0

# request METHOD PATH TOKEN [JSON]: prints the HTTP status, the response body goes to $BODY.
request() {
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$1" "$BASE_URL$2")
  if [ -n "$3" ]; then args+=(-H "Authorization: Bearer $3"); fi
  if [ -n "${4:-}" ]; then args+=(-H 'Content-Type: application/json' -d "$4"); fi
  curl "${args[@]}"
}

# field EXPRESSION: reads a value from the last response body, for example field '["id"]'.
field() {
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(eval('d'+sys.argv[2]))" "$BODY" "$1" 2>/dev/null
}

# check NAME EXPECTED ACTUAL
check() {
  if [ "$3" = "$2" ]; then
    echo "PASS  $1 ($3)"
  else
    echo "FAIL  $1 (expected $2, got $3)"
    failures=$((failures + 1))
  fi
}

login() {
  if [ "$(request POST /auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}")" = 200 ]; then field '["accessToken"]'; fi
}

# ensure_employee EMAIL FIRST_NAME ROLE: prints the id, creating the employee only if needed.
ensure_employee() {
  if [ "$(request POST /employees "$ADMIN_TOKEN" "{\"firstName\":\"$2\",\"lastName\":\"Workflow\",\"email\":\"$1\",\"role\":\"$3\"}")" = 201 ]; then
    field '["id"]'
    return
  fi
  request GET /employees "$ADMIN_TOKEN" >/dev/null
  python3 -c "import json,sys; print(next(e['id'] for e in json.load(open(sys.argv[1])) if e['email'] == sys.argv[2]))" "$BODY" "$1"
}

# helsinki DATE HOUR: the local time as a timestamp with the offset of that day (+02:00 in winter, +03:00 in summer).
helsinki() {
  python3 -c "import datetime as t, sys, zoneinfo; print(t.datetime.fromisoformat(sys.argv[1]).replace(hour=int(sys.argv[2]), tzinfo=zoneinfo.ZoneInfo('Europe/Helsinki')).isoformat())" "$1" "$2"
}

# shift DEPARTMENT DATE HEADCOUNT: creates a 06:00 to 14:00 morning shift and prints its id.
shift() {
  request POST /shifts "$PLANNER_TOKEN" "{\"departmentId\":$1,\"type\":\"MORNING\",\"startsAt\":\"$(helsinki "$2" 6)\",\"endsAt\":\"$(helsinki "$2" 14)\",\"requiredHeadcount\":$3}" >/dev/null
  field '["id"]'
}

# status_of SCHEDULE: prints the status as the planner sees it.
status_of() {
  request GET "/schedules/$1" "$PLANNER_TOKEN" >/dev/null
  field '["status"]'
}

echo "== Setup"
ADMIN_TOKEN="$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
PLANNER_TOKEN="$(login planner.smoke@example.com "$SMOKE_PASSWORD")"
MANAGER_TOKEN="$(login manager.smoke@example.com "$SMOKE_PASSWORD")"
EMPLOYEE_TOKEN="$(login employee.smoke@example.com "$SMOKE_PASSWORD")"
check "the smoke users can log in" 4 "$(for t in "$ADMIN_TOKEN" "$PLANNER_TOKEN" "$MANAGER_TOKEN" "$EMPLOYEE_TOKEN"; do [ -n "$t" ] && echo x; done | wc -l | tr -d ' ')"

request GET /departments "$ADMIN_TOKEN" >/dev/null
# The run number is one more than the highest WF-<run>-A department code so far.
RUN="$(python3 -c "import json,re,sys; print(max([int(m[1]) + 1 for d in json.load(open(sys.argv[1])) if (m := re.fullmatch(r'WF-(\d+)-A', d['code']))], default=0))" "$BODY")"
# Two weeks per run, starting on Monday 4 January 2027.
read -r W1 W1_TUE W1_END W2 W2_END < <(python3 -c "
import datetime as t, sys
m = t.date(2027, 1, 4) + t.timedelta(days=14 * int(sys.argv[1]))
d = lambda n: (m + t.timedelta(days=n)).isoformat()
print(d(0), d(1), d(6), d(7), d(13))" "$RUN")
echo "run $RUN plans the weeks of $W1 and $W2"

request POST /departments "$ADMIN_TOKEN" "{\"code\":\"WF-$RUN-A\",\"name\":\"Workflow ward A $RUN\"}" >/dev/null
WARD_A="$(field '["id"]')"
request POST /departments "$ADMIN_TOKEN" "{\"code\":\"WF-$RUN-B\",\"name\":\"Workflow ward B $RUN\"}" >/dev/null
WARD_B="$(field '["id"]')"
NURSE_1="$(ensure_employee wf.nurse1@example.com Noora EMPLOYEE)"
NURSE_2="$(ensure_employee wf.nurse2@example.com Niko EMPLOYEE)"
NURSE_3="$(ensure_employee wf.nurse3@example.com Nea EMPLOYEE)"
request PATCH "/employees/$NURSE_1" "$ADMIN_TOKEN" "{\"departmentId\":$WARD_A}" >/dev/null
request PATCH "/employees/$NURSE_2" "$ADMIN_TOKEN" "{\"departmentId\":$WARD_A}" >/dev/null
request PATCH "/employees/$NURSE_3" "$ADMIN_TOKEN" "{\"departmentId\":$WARD_B}" >/dev/null
request PUT "/auth/password/$NURSE_1" "$ADMIN_TOKEN" "{\"password\":\"$SMOKE_PASSWORD\"}" >/dev/null
NURSE_TOKEN="$(login wf.nurse1@example.com "$SMOKE_PASSWORD")"
SHIFT_A="$(shift "$WARD_A" "$W1" 1)"
SHIFT_B="$(shift "$WARD_A" "$W1_TUE" 3)"
echo "wards $WARD_A and $WARD_B, nurses $NURSE_1 $NURSE_2 $NURSE_3, shifts $SHIFT_A (1 person) and $SHIFT_B (3 people)"

echo "== Creating a schedule"
check "planner creates a schedule" 201 "$(request POST /schedules "$PLANNER_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"$W1\",\"periodEnd\":\"$W1_END\"}")"
MAIN="$(field '["id"]')"
check "a new schedule starts as DRAFT" DRAFT "$(field '["status"]')"
check "the period comes back as calendar dates" "$W1" "$(field '["periodStart"]')"
check "a second schedule over the same period is refused" 409 "$(request POST /schedules "$PLANNER_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"$W1_END\",\"periodEnd\":\"$W2\"}")"
check "an end before the start is a bad request" 400 "$(request POST /schedules "$PLANNER_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"$W1_END\",\"periodEnd\":\"$W1\"}")"
check "30 February is a bad request" 400 "$(request POST /schedules "$PLANNER_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"2027-02-30\",\"periodEnd\":\"2027-03-02\"}")"
check "a period of 43 days is a bad request" 400 "$(request POST /schedules "$PLANNER_TOKEN" '{"departmentId":1,"periodStart":"2031-01-01","periodEnd":"2031-02-12"}')"
check "an unknown department is not found" 404 "$(request POST /schedules "$PLANNER_TOKEN" '{"departmentId":2147483647,"periodStart":"2031-01-01","periodEnd":"2031-01-07"}')"
check "a manager cannot create a schedule" 403 "$(request POST /schedules "$MANAGER_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"$W2\",\"periodEnd\":\"$W2_END\"}")"
check "an employee cannot create a schedule" 403 "$(request POST /schedules "$EMPLOYEE_TOKEN" "{\"departmentId\":$WARD_A,\"periodStart\":\"$W2\",\"periodEnd\":\"$W2_END\"}")"

# Eight identical requests at the same moment: the serializable transaction lets exactly one of them through.
# Without it, 5 of 10 rounds of this test created 2 to 4 overlapping schedules.
PARALLEL="$(mktemp -d)"
for n in 1 2 3 4 5 6 7 8; do
  curl -s -o "$PARALLEL/create-$n.json" -w '%{http_code}\n' -X POST "$BASE_URL/schedules" -H "Authorization: Bearer $PLANNER_TOKEN" \
    -H 'Content-Type: application/json' -d "{\"departmentId\":$WARD_A,\"periodStart\":\"$W2\",\"periodEnd\":\"$W2_END\"}" > "$PARALLEL/create-$n.status" &
done
wait
check "eight parallel creates for the same period: one 201, seven 409" "1x201 7x409" "$(cat "$PARALLEL"/create-*.status | sort | uniq -c | awk '{print $1 "x" $2}' | xargs)"
RACE_A="$(python3 -c "import json,sys
for f in sys.argv[1:]:
    d = json.load(open(f))
    if 'id' in d: print(d['id'])" "$PARALLEL"/create-*.json)"

echo "== Workflow order (BR-W02, BR-W03)"
check "a DRAFT cannot be submitted before the engine ran" 409 "$(request POST "/schedules/$MAIN/submit" "$PLANNER_TOKEN")"
check "a DRAFT cannot be approved" 409 "$(request POST "/schedules/$MAIN/approve" "$MANAGER_TOKEN")"
check "a manager cannot generate" 403 "$(request POST "/schedules/$MAIN/generate" "$MANAGER_TOKEN")"
check "planner generates" 200 "$(request POST "/schedules/$MAIN/generate" "$PLANNER_TOKEN")"
check "generation makes it OPTIMIZED" OPTIMIZED "$(field '["schedule"]["status"]')"
check "the engine added 3 assignments" 3 "$(field '["added"]')"
check "the shortage on the 3 person shift is reported" "BR-H06 $SHIFT_B" "$(field '["violations"][0]["ruleId"]') $(field '["violations"][0]["shiftId"]')"
check "a quality score is saved" True "$(field '["schedule"]["qualityScore"] is not None')"
check "a planner cannot generate twice without an edit" 409 "$(request POST "/schedules/$MAIN/generate" "$PLANNER_TOKEN")"
check "planner submits" 200 "$(request POST "/schedules/$MAIN/submit" "$PLANNER_TOKEN")"
check "submitting makes it REVIEW" REVIEW "$(field '["status"]')"
check "the manager sees approve and reject as the next actions" "['approve', 'reject']" "$(request GET "/schedules/$MAIN" "$MANAGER_TOKEN" >/dev/null; field '["actions"]')"
check "a planner cannot approve" 403 "$(request POST "/schedules/$MAIN/approve" "$PLANNER_TOKEN")"
check "an employee cannot approve" 403 "$(request POST "/schedules/$MAIN/approve" "$EMPLOYEE_TOKEN")"
check "a schedule with a hard violation cannot be approved (BR-W03)" 409 "$(request POST "/schedules/$MAIN/approve" "$MANAGER_TOKEN")"
check "the refusal lists the violation" BR-H06 "$(field '["violations"][0]["ruleId"]')"
check "it stays in REVIEW" REVIEW "$(status_of "$MAIN")"
check "a schedule in REVIEW cannot be published (BR-W02)" 409 "$(request POST "/schedules/$MAIN/publish" "$MANAGER_TOKEN")"
check "manager rejects" 200 "$(request POST "/schedules/$MAIN/reject" "$MANAGER_TOKEN")"
check "rejection sends it back to DRAFT" DRAFT "$(field '["status"]')"

echo "== Hand edits (BR-W01)"
request PATCH "/employees/$NURSE_3" "$ADMIN_TOKEN" "{\"departmentId\":$WARD_A}" >/dev/null
check "after a third nurse joins the ward, generation fills the gap" 200 "$(request POST "/schedules/$MAIN/generate" "$PLANNER_TOKEN")"
check "the engine kept the 3 earlier assignments and added 1" 1 "$(field '["added"]')"
check "no hard violations are left" 0 "$(field '["violations"].__len__()')"
request GET "/schedules/$MAIN" "$PLANNER_TOKEN" >/dev/null
FIRST="$(field '["assignments"][0]["id"]')"
FIRST_SHIFT="$(field '["assignments"][0]["shiftId"]')"
FIRST_EMPLOYEE="$(field '["assignments"][0]["employeeId"]')"
check "planner removes an assignment by hand" 204 "$(request DELETE "/schedules/$MAIN/assignments/$FIRST" "$PLANNER_TOKEN")"
check "a hand edit moves an OPTIMIZED schedule back to DRAFT" DRAFT "$(status_of "$MAIN")"
check "and clears the quality score, which no longer matches" None "$(field '["qualityScore"]')"
check "the check endpoint now reports the gap" BR-H06 "$(request GET "/schedules/$MAIN/check" "$PLANNER_TOKEN" >/dev/null; field '["violations"][0]["ruleId"]')"
check "an employee cannot use the check endpoint" 403 "$(request GET "/schedules/$MAIN/check" "$EMPLOYEE_TOKEN")"
check "planner puts the assignment back by hand" 201 "$(request POST "/schedules/$MAIN/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$FIRST_SHIFT,\"employeeId\":$FIRST_EMPLOYEE}")"
check "the same assignment twice is a conflict" 409 "$(request POST "/schedules/$MAIN/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$FIRST_SHIFT,\"employeeId\":$FIRST_EMPLOYEE}")"
check "removing an assignment of another schedule is not found" 404 "$(request DELETE "/schedules/$RACE_A/assignments/$FIRST" "$PLANNER_TOKEN")"
check "a shift of another department is a bad request" 400 "$(request POST "/schedules/$MAIN/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$(shift "$WARD_B" "$W1" 1),\"employeeId\":$NURSE_1}")"
check "an unknown employee is not found" 404 "$(request POST "/schedules/$MAIN/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$SHIFT_A,\"employeeId\":2147483647}")"
check "a manager cannot edit assignments" 403 "$(request POST "/schedules/$MAIN/assignments" "$MANAGER_TOKEN" "{\"shiftId\":$SHIFT_A,\"employeeId\":$NURSE_1}")"
check "generation with a full schedule adds nothing" 0 "$(request POST "/schedules/$MAIN/generate" "$PLANNER_TOKEN" >/dev/null; field '["added"]')"
check "planner submits again" 200 "$(request POST "/schedules/$MAIN/submit" "$PLANNER_TOKEN")"
check "a schedule in REVIEW cannot be edited" 409 "$(request DELETE "/schedules/$MAIN/assignments/$FIRST" "$PLANNER_TOKEN")"
check "manager approves the complete schedule" 200 "$(request POST "/schedules/$MAIN/approve" "$MANAGER_TOKEN")"
check "it is APPROVED" APPROVED "$(field '["status"]')"
check "an APPROVED schedule cannot be edited" 409 "$(request POST "/schedules/$MAIN/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$SHIFT_A,\"employeeId\":$NURSE_3}")"
check "an APPROVED schedule cannot be deleted" 409 "$(request DELETE "/schedules/$MAIN" "$PLANNER_TOKEN")"
check "an APPROVED schedule cannot be generated again" 409 "$(request POST "/schedules/$MAIN/generate" "$PLANNER_TOKEN")"

echo "== What employees see (BR-W04, BR-A03)"
check "a nurse cannot see the schedule before it is published" 404 "$(request GET "/schedules/$MAIN" "$NURSE_TOKEN")"
check "a planner cannot publish" 403 "$(request POST "/schedules/$MAIN/publish" "$PLANNER_TOKEN")"
check "manager publishes" 200 "$(request POST "/schedules/$MAIN/publish" "$MANAGER_TOKEN")"
check "it is PUBLISHED" PUBLISHED "$(field '["status"]')"
check "nobody can take an action on a PUBLISHED schedule" "[]" "$(request GET "/schedules/$MAIN" "$ADMIN_TOKEN" >/dev/null; field '["actions"]')"
check "publishing twice is refused" 409 "$(request POST "/schedules/$MAIN/publish" "$MANAGER_TOKEN")"
check "a PUBLISHED schedule cannot be rejected" 409 "$(request POST "/schedules/$MAIN/reject" "$MANAGER_TOKEN")"
check "the nurse now sees the schedule" 200 "$(request GET "/schedules/$MAIN" "$NURSE_TOKEN")"
check "with only her own assignments" "$NURSE_1" "$(field '["assignments"].__iter__().__class__ and ",".join(sorted({str(a["employeeId"]) for a in d["assignments"]}))')"
check "the nurse's list contains it" True "$(request GET /schedules "$NURSE_TOKEN" >/dev/null; field ".__iter__() and $MAIN in [s['id'] for s in d]")"
check "the nurse's list holds only published schedules" True "$(field ".__iter__() and all(s['status'] == 'PUBLISHED' for s in d)")"
check "an employee of another ward cannot see it" 404 "$(request GET "/schedules/$MAIN" "$EMPLOYEE_TOKEN")"

echo "== Shifts of a published schedule are locked (R-WF-02, BR-W01)"
# Until 07/11/2026 these checks were pinned to the wrong behavior: 200, 204 and an assignment that left the schedule.
check "a planner cannot change a shift of the published schedule" 409 "$(request PATCH "/shifts/$SHIFT_A" "$PLANNER_TOKEN" '{"requiredHeadcount":2}')"
check "a planner cannot delete it" 409 "$(request DELETE "/shifts/$SHIFT_A" "$PLANNER_TOKEN")"
check "a planner cannot add a shift inside the published period" 409 "$(request POST /shifts "$PLANNER_TOKEN" "{\"departmentId\":$WARD_A,\"type\":\"EVENING\",\"startsAt\":\"$(helsinki "$W1" 15)\",\"endsAt\":\"$(helsinki "$W1" 22)\",\"requiredHeadcount\":1}")"
check "its assignment stays in the published schedule" 1 "$(request GET "/schedules/$MAIN" "$PLANNER_TOKEN" >/dev/null; field ".__iter__ and sum(1 for a in d['assignments'] if a['shiftId'] == $SHIFT_A)")"
check "the schedule still says PUBLISHED" PUBLISHED "$(field '["status"]')"

echo "== Parallel approval of two schedules that share a nurse (R-WF-01)"
request POST /schedules "$PLANNER_TOKEN" "{\"departmentId\":$WARD_B,\"periodStart\":\"$W2\",\"periodEnd\":\"$W2_END\"}" >/dev/null
RACE_B="$(field '["id"]')"
SHIFT_C="$(shift "$WARD_A" "$W2" 1)"
SHIFT_D="$(shift "$WARD_B" "$W2" 1)"
check "nurse 3 is put on ward A's shift by hand" 201 "$(request POST "/schedules/$RACE_A/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$SHIFT_C,\"employeeId\":$NURSE_3}")"
check "and on ward B's shift at the same time, as a float nurse" 201 "$(request POST "/schedules/$RACE_B/assignments" "$PLANNER_TOKEN" "{\"shiftId\":$SHIFT_D,\"employeeId\":$NURSE_3}")"
for id in "$RACE_A" "$RACE_B"; do
  request POST "/schedules/$id/generate" "$PLANNER_TOKEN" >/dev/null
  check "schedule $id alone has no violation" 0 "$(field '["violations"].__len__()')"
  check "schedule $id is submitted" 200 "$(request POST "/schedules/$id/submit" "$PLANNER_TOKEN")"
done
# Each approval alone sees no conflict. Without the serializable transaction, 3 of 4 runs approved both.
for id in "$RACE_A" "$RACE_B"; do
  curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/schedules/$id/approve" -H "Authorization: Bearer $MANAGER_TOKEN" > "$PARALLEL/approve-$id" &
done
wait
check "two parallel approvals: one 200, one 409" "200 409" "$(for id in "$RACE_A" "$RACE_B"; do cat "$PARALLEL/approve-$id"; echo; done | sort | xargs)"
LOSER="$(for id in "$RACE_A" "$RACE_B"; do [ "$(cat "$PARALLEL/approve-$id")" = 409 ] && echo "$id"; done)"
check "approving the other one again shows the double booking" "409 BR-H03" "$(request POST "/schedules/${LOSER:-0}/approve" "$MANAGER_TOKEN") $(field '["violations"][0]["ruleId"]')"
check "an editable schedule can be deleted" 204 "$(request POST "/schedules/${LOSER:-0}/reject" "$MANAGER_TOKEN" >/dev/null; request DELETE "/schedules/${LOSER:-0}" "$PLANNER_TOKEN")"
check "a deleted schedule is not found" 404 "$(request GET "/schedules/${LOSER:-0}" "$PLANNER_TOKEN")"

rm -rf "$BODY" "$PARALLEL"
echo "== Result: $failures failed"
[ "$failures" -eq 0 ]
