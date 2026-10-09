package dashboard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"
)

// access sends GET /api/dashboard/access the way the web guard does: the session cookie only.
// A PAT goes as a bearer, since a PAT is never a cookie.
func access(k *togo.Kernel, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, accessPath, nil)
	switch {
	case strings.HasPrefix(token, "togo_pat_"):
		req.Header.Set("Authorization", "Bearer "+token)
	case token != "":
		req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: token})
	}
	rec := httptest.NewRecorder()
	k.Router.ServeHTTP(rec, req)
	return rec
}

// wantAccess checks the status and that every answer, allow or deny, is no-store/private.
func wantAccess(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("got %d %s, want %d", rec.Code, rec.Body.String(), want)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store, private" {
		t.Fatalf("Cache-Control = %q, want no-store, private", cc)
	}
	if want == http.StatusNoContent && rec.Body.Len() != 0 {
		t.Fatalf("allow carries a body: %q", rec.Body.String())
	}
}

func bootAccess(t *testing.T, role string) (*togo.Kernel, *auth.Service) {
	t.Helper()
	t.Setenv(requiredRoleEnv, role)
	return bootMail(t)
}

func issuedToken(t *testing.T, rec *httptest.ResponseRecorder, want int) string {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("got %d %s, want %d", rec.Code, rec.Body.String(), want)
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || out.Token == "" {
		t.Fatalf("no token in %s", rec.Body.String())
	}
	return out.Token
}

// Unset, the policy keeps the v0.9 behaviour: any signed-in account, anonymous refused.
func TestAccessUnsetAllowsAnySession(t *testing.T) {
	k, svc := bootAccess(t, "")
	_, user := newAccount(t, svc, "plain", []string{"user"})
	wantAccess(t, access(k, ""), http.StatusUnauthorized)
	wantAccess(t, access(k, user), http.StatusNoContent)
}

// Whitespace only is unset, not a role nobody holds.
func TestAccessBlankRoleIsUnset(t *testing.T) {
	k, svc := bootAccess(t, "   ")
	_, user := newAccount(t, svc, "plain", []string{"user"})
	wantAccess(t, access(k, user), http.StatusNoContent)
}

func TestAccessRoleRequired(t *testing.T) {
	k, svc := bootAccess(t, " admin ")
	_, user := newAccount(t, svc, "user", []string{"user"})
	_, admin := newAccount(t, svc, "admin", []string{"admin"})
	t.Run("anonymous is 401", func(t *testing.T) { wantAccess(t, access(k, ""), http.StatusUnauthorized) })
	t.Run("garbage cookie is 401", func(t *testing.T) { wantAccess(t, access(k, "not-a-token"), http.StatusUnauthorized) })
	t.Run("non-admin is 403", func(t *testing.T) { wantAccess(t, access(k, user), http.StatusForbidden) })
	t.Run("admin is 204", func(t *testing.T) { wantAccess(t, access(k, admin), http.StatusNoContent) })
}

// The decision follows the database, not the token: demotion revokes on the next request,
// deletion makes the old session anonymous, and a forged admin claim gets nothing.
func TestAccessRevocation(t *testing.T) {
	k, svc := bootAccess(t, "admin")
	_, remover := newAccount(t, svc, "remover", []string{"admin"})

	demotedID, demoted := newAccount(t, svc, "demoted", []string{"admin"})
	wantAccess(t, access(k, demoted), http.StatusNoContent)
	if err := svc.SetRoles(t.Context(), demotedID, []string{"user"}); err != nil {
		t.Fatal(err)
	}
	wantAccess(t, access(k, demoted), http.StatusForbidden)

	deletedID, deleted := newAccount(t, svc, "deleted", []string{"admin"})
	wantAccess(t, access(k, deleted), http.StatusNoContent)
	if got := doJSON(k, http.MethodDelete, "/api/auth/admin/users/"+deletedID, remover, "").Code; got != http.StatusOK {
		t.Fatalf("delete admin: got %d, want 200", got)
	}
	wantAccess(t, access(k, deleted), http.StatusUnauthorized)

	forged, err := svc.IssueToken(auth.Identity{ID: "never-existed", Email: "x@example.com", Roles: []string{"admin"}, Guard: "api"})
	if err != nil {
		t.Fatal(err)
	}
	wantAccess(t, access(k, forged), http.StatusUnauthorized)
}

// An administrator's PAT is refused. Under auth v0.10.0 a PAT carries no account roles, so
// RequireRole refuses it first; refuseBorrowedAdmin's PAT check is the second layer.
func TestAccessRefusesAdminPAT(t *testing.T) {
	k, svc := bootAccess(t, "admin")
	_, admin := newAccount(t, svc, "pat-owner", []string{"admin"})
	pat := issuedToken(t, doJSON(k, http.MethodPost, "/api/auth/tokens", admin, `{"name":"dash","abilities":["*"]}`), http.StatusCreated)
	if !strings.HasPrefix(pat, "togo_pat_") {
		t.Fatalf("expected a PAT, got %q", pat[:min(len(pat), 12)])
	}
	wantAccess(t, access(k, pat), http.StatusForbidden)
}

// An impersonated administrator passes RequireRole("admin") on its own; refuseBorrowedAdmin is
// what stops it. The impersonation token is sent as the session cookie, the hardest case.
func TestAccessRefusesImpersonatedAdmin(t *testing.T) {
	t.Setenv("AUTH_ADMIN_CROSS_CONTROL", "true")
	k, svc := bootAccess(t, "admin")
	_, actor := newAccount(t, svc, "actor", []string{"admin"})
	targetID, target := newAccount(t, svc, "target", []string{"admin"})
	borrowed := issuedToken(t, doJSON(k, http.MethodPost, "/api/auth/admin/users/"+targetID+"/impersonate", actor, `{}`), http.StatusOK)

	// Precondition: RequireRole alone admits the borrowed session, so the 403 below is
	// refuseBorrowedAdmin's, not RequireRole's.
	alone := svc.RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, accessPath, nil)
	req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: borrowed})
	rec := httptest.NewRecorder()
	alone.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("RequireRole alone: got %d, want 204", rec.Code)
	}

	wantAccess(t, access(k, borrowed), http.StatusForbidden)
	wantAccess(t, access(k, target), http.StatusNoContent)
	wantAccess(t, access(k, actor), http.StatusNoContent)
}
