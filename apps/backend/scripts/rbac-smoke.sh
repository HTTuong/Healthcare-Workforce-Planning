#!/usr/bin/env bash
# Smoke test of login and role checks against a running API (BR-A01, BR-A02, known gap BR-A03).
# Usage: npm run rbac-smoke   (the API must be running and the admin must exist, see npm run create-admin)
# Safe to run again: it reuses the smoke users and removes the department and availability it creates.
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin-Password-123!}"
SMOKE_PASSWORD='Smoke-Password-123!'
BODY="$(mktemp)"
failures=0
gaps=0

# request METHOD PATH TOKEN [JSON]: prints the HTTP status, the response body goes to $BODY.
request() {
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$1" "$BASE_URL$2")
  if [ -n "$3" ]; then args+=(-H "Authorization: Bearer $3"); fi
  if [ -n "${4:-}" ]; then args+=(-H 'Content-Type: application/json' -d "$4"); fi
  curl "${args[@]}"
}

# field EXPRESSION: reads a value from the last response body, for example field '["id"]'.
field() {
  python3 -c "import json,sys; print(json.load(open(sys.argv[1]))$1)" "$BODY" 2>/dev/null
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

# login EMAIL PASSWORD: prints the access token, or nothing when login fails.
login() {
  if [ "$(request POST /auth/login "" "{\"email\":\"$1\",\"password\":\"$2\"}")" = 200 ]; then field '["accessToken"]'; fi
}

# ensure_employee EMAIL FIRST_NAME ROLE: prints the id, creating the employee only if needed.
ensure_employee() {
  if [ "$(request POST /employees "$ADMIN_TOKEN" "{\"firstName\":\"$2\",\"lastName\":\"Smoke\",\"email\":\"$1\",\"role\":\"$3\"}")" = 201 ]; then
    field '["id"]'
    return
  fi
  request GET /employees "$ADMIN_TOKEN" >/dev/null
  python3 -c "import json,sys; print(next(e['id'] for e in json.load(open(sys.argv[1])) if e['email'] == sys.argv[2]))" "$BODY" "$1"
}

echo "== Authentication (BR-A01)"
check "no token is refused" 401 "$(request GET /departments "")"
check "the public root needs no token" 200 "$(request GET / "")"
check "wrong password is refused" 401 "$(request POST /auth/login "" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"wrong-password-xx\"}")"
wrong_password_message="$(field '["message"]')"
check "unknown email is refused" 401 "$(request POST /auth/login "" '{"email":"nobody@example.com","password":"wrong-password-xx"}')"
check "both failures give the same message" "$wrong_password_message" "$(field '["message"]')"
check "login without a password is a bad request" 400 "$(request POST /auth/login "" "{\"email\":\"$ADMIN_EMAIL\"}")"

ADMIN_TOKEN="$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
if [ -z "$ADMIN_TOKEN" ]; then
  echo "FAIL  admin login. Create the admin first: npm run create-admin"
  exit 1
fi
check "admin reads its own identity" 200 "$(request GET /auth/me "$ADMIN_TOKEN")"
check "the identity carries the ADMIN role" ADMIN "$(field '["role"]')"
check "a tampered token is refused" 401 "$(request GET /departments "${ADMIN_TOKEN}x")"
check "admin lists employees" 200 "$(request GET /employees "$ADMIN_TOKEN")"
check "no password hash in the employee list" 0 "$(grep -c passwordHash "$BODY")"

echo "== Users for the role checks"
PLANNER_ID="$(ensure_employee planner.smoke@example.com Pia PLANNER)"
MANAGER_ID="$(ensure_employee manager.smoke@example.com Maija MANAGER)"
EMPLOYEE_ID="$(ensure_employee employee.smoke@example.com Eero EMPLOYEE)"
echo "      planner $PLANNER_ID, manager $MANAGER_ID, employee $EMPLOYEE_ID"
check "a too short password is refused" 400 "$(request PUT "/auth/password/$EMPLOYEE_ID" "$ADMIN_TOKEN" '{"password":"short"}')"
for id in "$PLANNER_ID" "$MANAGER_ID" "$EMPLOYEE_ID"; do
  check "admin sets the password of employee $id" 204 "$(request PUT "/auth/password/$id" "$ADMIN_TOKEN" "{\"password\":\"$SMOKE_PASSWORD\"}")"
done
PLANNER_TOKEN="$(login planner.smoke@example.com "$SMOKE_PASSWORD")"
MANAGER_TOKEN="$(login manager.smoke@example.com "$SMOKE_PASSWORD")"
EMPLOYEE_TOKEN="$(login employee.smoke@example.com "$SMOKE_PASSWORD")"

echo "== Employee role (BR-A02)"
check "employee reads its identity" 200 "$(request GET /auth/me "$EMPLOYEE_TOKEN")"
check "the identity carries the EMPLOYEE role" EMPLOYEE "$(field '["role"]')"
check "employee reads departments" 200 "$(request GET /departments "$EMPLOYEE_TOKEN")"
check "employee cannot list employees" 403 "$(request GET /employees "$EMPLOYEE_TOKEN")"
check "employee cannot create a shift" 403 "$(request POST /shifts "$EMPLOYEE_TOKEN" '{}')"
check "employee cannot set a password" 403 "$(request PUT /auth/password/1 "$EMPLOYEE_TOKEN" '{"password":"Hijack-Password-123!"}')"

echo "== Manager role"
check "manager lists employees" 200 "$(request GET /employees "$MANAGER_TOKEN")"
check "manager lists shifts" 200 "$(request GET /shifts "$MANAGER_TOKEN")"
check "manager cannot create a shift" 403 "$(request POST /shifts "$MANAGER_TOKEN" '{}')"
check "manager cannot create a department" 403 "$(request POST /departments "$MANAGER_TOKEN" '{"code":"X","name":"X"}')"

echo "== Planner role"
check "planner cannot create a department" 403 "$(request POST /departments "$PLANNER_TOKEN" '{"code":"X","name":"X"}')"
check "planner lists shifts" 200 "$(request GET /shifts "$PLANNER_TOKEN")"
check "admin creates a temporary department" 201 "$(request POST /departments "$ADMIN_TOKEN" "{\"code\":\"SMOKE$(date +%s)\",\"name\":\"Smoke test\"}")"
DEPARTMENT_ID="$(field '["id"]')"
check "planner sets a staffing requirement" 200 "$(request PUT "/departments/$DEPARTMENT_ID/staffing-requirements/MORNING" "$PLANNER_TOKEN" '{"minHeadcount":2}')"
check "planner removes the staffing requirement" 204 "$(request DELETE "/departments/$DEPARTMENT_ID/staffing-requirements/MORNING" "$PLANNER_TOKEN")"
check "admin removes the temporary department" 204 "$(request DELETE "/departments/$DEPARTMENT_ID" "$ADMIN_TOKEN")"

echo "== Known gap BR-A03: ownership of availability is not checked yet"
check "admin records leave for the planner" 201 "$(request POST /availabilities "$ADMIN_TOKEN" "{\"employeeId\":$PLANNER_ID,\"startsAt\":\"2027-01-05T08:00:00+02:00\",\"endsAt\":\"2027-01-05T16:00:00+02:00\",\"type\":\"LEAVE\"}")"
AVAILABILITY_ID="$(field '["id"]')"
status="$(request DELETE "/availabilities/$AVAILABILITY_ID" "$EMPLOYEE_TOKEN")"
if [ "$status" = 403 ]; then
  echo "PASS  employee cannot delete someone else's availability (403), the gap is fixed"
  request DELETE "/availabilities/$AVAILABILITY_ID" "$ADMIN_TOKEN" >/dev/null
else
  echo "GAP   employee deleted someone else's availability ($status), should be 403 once BR-A03 is enforced"
  gaps=$((gaps + 1))
  if [ "$status" != 204 ]; then request DELETE "/availabilities/$AVAILABILITY_ID" "$ADMIN_TOKEN" >/dev/null; fi
fi

rm -f "$BODY"
echo "== Result: $failures failed, $gaps known gap(s)"
[ "$failures" -eq 0 ]
