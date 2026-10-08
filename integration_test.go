package dashboard

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/togo-framework/togo"
)

// These tests boot the real togo kernel with the real auth plugin (the version pinned in
// go.mod) and the dashboard routes, and check the responses the web client depends on
// (web/lib/admin-errors.ts): status codes, body fields and error strings. They are the
// contract check between the dashboard UI and auth.

const wantAuthVersion = "v0.10.0"

// TestAuthModuleIsPinnedRelease fails if go.mod does not require auth at the tagged release
// the UI was written against: no replace directive, no pseudo-version, no other tag. It reads
// go.mod rather than the binary's build info, which older toolchains do not embed for tests.
// The behaviour only v0.10.0 has (the 409/403/429 bodies, database-revalidated tokens) is
// asserted by the tests below.
func TestAuthModuleIsPinnedRelease(t *testing.T) {
	raw, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, line := range strings.Split(string(raw), "\n") {
		f := strings.Fields(strings.TrimSpace(line))
		if len(f) > 0 && f[0] == "replace" {
			t.Fatalf("go.mod has a replace directive (%q); the dashboard must build against the tagged release", strings.TrimSpace(line))
		}
		if len(f) >= 2 && f[0] == "github.com/togo-framework/auth" {
			found = true
			if f[1] != wantAuthVersion {
				t.Fatalf("auth is %s, want %s", f[1], wantAuthVersion)
			}
		}
	}
	if !found {
		t.Fatal("go.mod does not require github.com/togo-framework/auth")
	}
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("not a JSON object (status %d): %v", rec.Code, err)
	}
	return m
}

func createdUserID(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	user, _ := decode(t, rec)["user"].(map[string]any)
	id, _ := user["id"].(string)
	if id == "" {
		t.Fatalf("no user.id in %s", rec.Body.String())
	}
	return id
}

func rolesOf(t *testing.T, k *togo.Kernel, bearer, id string) []string {
	t.Helper()
	rec := doJSON(k, http.MethodGet, "/api/auth/admin/users/"+id, bearer, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get user: %d %s", rec.Code, rec.Body.String())
	}
	var out []string
	for _, r := range decode(t, rec)["roles"].([]any) {
		out = append(out, r.(string))
	}
	return out
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}

// A promotion of an account another administrator created is a 409 with the body the
// confirmation dialog parses; only the same PATCH with the accept field goes through, and
// the acceptance is not remembered.
func TestIntegrationPromotionConflict(t *testing.T) {
	k, svc := bootMail(t)
	a1ID, a1 := newAccount(t, svc, "a1", []string{"admin"})
	_, a2 := newAccount(t, svc, "a2", []string{"admin"})

	// a1 creates an account with a password: email and password are now set by a1.
	rec := doJSON(k, http.MethodPost, "/api/auth/admin/users", a1,
		`{"email":"`+uniqueEmail("promotee")+`","password":"a-long-password-1!"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	id := createdUserID(t, rec)

	// a2 tries to promote it.
	rec = doJSON(k, http.MethodPatch, "/api/auth/admin/users/"+id, a2, `{"roles":["admin"]}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("promotion: %d %s, want 409", rec.Code, rec.Body.String())
	}
	body := decode(t, rec)
	if body["error"] != "identity_set_by_other_admin" {
		t.Fatalf("error = %v", body["error"])
	}
	if body["accept_field"] != "accept_identity_set_by_other" {
		t.Fatalf("accept_field = %v", body["accept_field"])
	}
	if msg, _ := body["message"].(string); msg == "" {
		t.Fatal("no message")
	}
	tainted, _ := body["tainted_fields"].([]any)
	if len(tainted) != 2 || tainted[0] != "email" || tainted[1] != "password" {
		t.Fatalf("tainted_fields = %v, want [email password]", body["tainted_fields"])
	}
	setBy, _ := body["set_by"].(map[string]any)
	setAt, _ := body["set_at"].(map[string]any)
	for _, f := range []string{"email", "password"} {
		if by, _ := setBy[f].(string); by != a1ID {
			t.Fatalf("set_by[%s] = %v, want %s (a comma-separated string of ids)", f, setBy[f], a1ID)
		}
		if at, _ := setAt[f].(string); at == "" {
			t.Fatalf("set_at[%s] missing", f)
		}
	}
	if hasRole(rolesOf(t, k, a2, id), "admin") {
		t.Fatal("the refused promotion must not have changed the roles")
	}

	// The confirmed request is the same PATCH plus the accept field.
	rec = doJSON(k, http.MethodPatch, "/api/auth/admin/users/"+id, a2, `{"roles":["admin"],"accept_identity_set_by_other":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("confirmed promotion: %d %s", rec.Code, rec.Body.String())
	}
	if !hasRole(rolesOf(t, k, a2, id), "admin") {
		t.Fatal("confirmed promotion did not take effect")
	}

	// Acceptance is for that one request: after a demotion the next promotion asks again.
	if err := svc.SetRoles(context.Background(), id, []string{"user"}); err != nil {
		t.Fatal(err)
	}
	rec = doJSON(k, http.MethodPatch, "/api/auth/admin/users/"+id, a2, `{"roles":["admin"]}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("re-promotion without accept: %d %s, want 409", rec.Code, rec.Body.String())
	}
}

// 403 has two meanings the UI tells apart: adminTargetErr (another administrator is the
// target) and requireAdmin (the caller may not use the admin API at all).
func TestIntegrationForbidden(t *testing.T) {
	k, svc := bootMail(t)
	_, a1 := newAccount(t, svc, "a1", []string{"admin"})
	a2ID, _ := newAccount(t, svc, "a2", []string{"admin"})
	uID, user := newAccount(t, svc, "u", []string{"user"})

	const targetErr = "administrators cannot be acted on this way"
	for _, tc := range []struct{ name, method, path, body string }{
		{"email change", http.MethodPatch, "/api/auth/admin/users/" + a2ID, `{"email":"changed-` + uniqueEmail("x") + `"}`},
		{"role change", http.MethodPatch, "/api/auth/admin/users/" + a2ID, `{"roles":["user"]}`},
		{"permission change", http.MethodPatch, "/api/auth/admin/users/" + a2ID, `{"permissions":["x"]}`},
		{"reset-password", http.MethodPost, "/api/auth/admin/users/" + a2ID + "/reset-password", `{}`},
		{"magic-link", http.MethodPost, "/api/auth/admin/users/" + a2ID + "/magic-link", `{}`},
		{"impersonate", http.MethodPost, "/api/auth/admin/users/" + a2ID + "/impersonate", `{}`},
	} {
		t.Run("adminTargetErr/"+tc.name, func(t *testing.T) {
			rec := doJSON(k, tc.method, tc.path, a1, tc.body)
			if rec.Code != http.StatusForbidden {
				t.Fatalf("%d %s, want 403", rec.Code, rec.Body.String())
			}
			if got := decode(t, rec)["error"]; got != targetErr {
				t.Fatalf("error = %v, want %q", got, targetErr)
			}
		})
	}

	// requireAdmin: a non-admin, a personal access token and an impersonated session.
	rec := doJSON(k, http.MethodPost, "/api/auth/tokens", a1, `{"name":"ci","abilities":["read"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create PAT: %d %s", rec.Code, rec.Body.String())
	}
	pat, _ := decode(t, rec)["token"].(string)
	rec = doJSON(k, http.MethodPost, "/api/auth/admin/users/"+uID+"/impersonate", a1, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("impersonate: %d %s", rec.Code, rec.Body.String())
	}
	imp, _ := decode(t, rec)["token"].(string)
	for name, tok := range map[string]string{"non-admin": user, "personal access token": pat, "impersonated session": imp} {
		t.Run("requireAdmin/"+name, func(t *testing.T) {
			rec := doJSON(k, http.MethodGet, "/api/auth/admin/users", tok, "")
			if rec.Code != http.StatusForbidden {
				t.Fatalf("%d %s, want 403", rec.Code, rec.Body.String())
			}
			if got := decode(t, rec)["error"]; got != "forbidden" {
				t.Fatalf("error = %v, want forbidden", got)
			}
		})
	}
	if got := doJSON(k, http.MethodGet, "/api/auth/admin/users", "", "").Code; got != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d, want 401", got)
	}
}

// reset-password, magic-link and impersonate share one limiter: once it is spent each of them
// answers 429 {"error":"too many requests"} with a Retry-After header the UI shows.
func TestIntegrationRateLimit(t *testing.T) {
	k, svc := bootMail(t)
	_, a1 := newAccount(t, svc, "a1", []string{"admin"})
	uID, _ := newAccount(t, svc, "u", []string{"user"})

	path := "/api/auth/admin/users/" + uID + "/magic-link"
	for i := 0; i < 60; i++ {
		if rec := doJSON(k, http.MethodPost, path, a1, `{}`); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d limited too early", i+1)
		}
	}
	for _, p := range []string{"/magic-link", "/reset-password", "/impersonate"} {
		rec := doJSON(k, http.MethodPost, "/api/auth/admin/users/"+uID+p, a1, `{}`)
		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("%s: %d %s, want 429", p, rec.Code, rec.Body.String())
		}
		if got := decode(t, rec)["error"]; got != "too many requests" {
			t.Fatalf("%s: error = %v", p, got)
		}
		if rec.Header().Get("Retry-After") == "" {
			t.Fatalf("%s: no Retry-After header", p)
		}
	}
}
