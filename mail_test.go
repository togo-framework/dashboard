package dashboard

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"
)

// bootMail boots a real kernel (SQLite in a temp dir) with the auth and dashboard
// providers, so the guard under test is auth's own RequireRole, not a stand-in.
func bootMail(t *testing.T) (*togo.Kernel, *auth.Service) {
	t.Helper()
	bootEnv(t)
	t.Setenv("AUTH_SECRET", "a-sufficiently-long-test-secret-string!!")
	k := togo.New()
	t.Cleanup(k.Close) // release the database before TempDir removal (Windows)
	svc, ok := auth.FromKernel(k)
	if !ok {
		t.Fatal("auth service not on the kernel")
	}
	return k, svc
}

var accountSeq atomic.Int64

// newAccount creates a real account (so the database knows it) and returns its id and a
// session token issued for it with those roles.
func newAccount(t *testing.T, svc *auth.Service, label string, roles []string) (string, string) {
	t.Helper()
	email := uniqueEmail(label)
	id, err := svc.CreateUser(context.Background(), email, "a-long-password-1!", roles)
	if err != nil {
		t.Fatal(err)
	}
	tok, err := svc.IssueToken(*id)
	if err != nil {
		t.Fatal(err)
	}
	return id.ID, tok
}

// doJSON sends a bearer-authenticated JSON request (bearer requests are CSRF-exempt).
func doJSON(k *togo.Kernel, method, path, bearer, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rec := httptest.NewRecorder()
	k.Router.ServeHTTP(rec, req)
	return rec
}

func call(k *togo.Kernel, method, path, bearer string, csrf bool, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if csrf {
		req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "c"})
		req.Header.Set("X-CSRF-Token", "c")
	}
	rec := httptest.NewRecorder()
	k.Router.ServeHTTP(rec, req)
	return rec
}

// mailRoutes are the SMTP admin routes; every one must refuse a caller the database no longer
// recognises as an administrator.
var mailRoutes = []struct{ method, path, body string }{
	{http.MethodGet, "/api/dashboard/admin/mail", ""},
	{http.MethodPut, "/api/dashboard/admin/mail", `{}`},
	{http.MethodPost, "/api/dashboard/admin/mail/test", `{}`},
}

// TestMailAdminRequiresAdmin: anonymous is 401, a real non-admin account is 403.
func TestMailAdminRequiresAdmin(t *testing.T) {
	k, svc := bootMail(t)
	_, user := newAccount(t, svc, "user", []string{"user"})
	for _, rt := range mailRoutes {
		t.Run(rt.method+" anonymous is 401", func(t *testing.T) {
			if got := call(k, rt.method, rt.path, "", true, rt.body).Code; got != http.StatusUnauthorized {
				t.Fatalf("got %d, want 401", got)
			}
		})
		t.Run(rt.method+" non-admin is 403", func(t *testing.T) {
			if got := call(k, rt.method, rt.path, user, true, rt.body).Code; got != http.StatusForbidden {
				t.Fatalf("got %d, want 403", got)
			}
		})
	}
}

func TestMailAdminAdminPassesGuard(t *testing.T) {
	k, svc := bootMail(t)
	_, admin := newAccount(t, svc, "admin", []string{"admin"})
	if got := call(k, http.MethodGet, "/api/dashboard/admin/mail", admin, false, "").Code; got != http.StatusOK {
		t.Fatalf("admin GET got %d, want 200", got)
	}
}

// auth v0.10.0 authorizes RequireRole through VerifyContext -> revalidate, so the roles in the
// token are the ones the database held when it was issued, not the ones it holds now. A token
// minted for an account that no longer exists is refused outright (a claims-only check would
// have accepted it).
func TestMailAdminRefusesTokenForUnknownAccount(t *testing.T) {
	k, svc := bootMail(t)
	forged, err := svc.IssueToken(auth.Identity{ID: "never-existed", Email: "x@example.com", Roles: []string{"admin"}, Guard: "api"})
	if err != nil {
		t.Fatal(err)
	}
	for _, rt := range mailRoutes {
		if got := call(k, rt.method, rt.path, forged, true, rt.body).Code; got != http.StatusUnauthorized {
			t.Fatalf("%s: got %d, want 401", rt.method, got)
		}
	}
}

// A session issued while the user was an administrator stops working on the mail routes the
// moment the database demotes them, with no re-login and no token expiry.
func TestMailAdminDemotedAdminIsRefused(t *testing.T) {
	k, svc := bootMail(t)
	_, other := newAccount(t, svc, "other-admin", []string{"admin"}) // keeps the instance with an admin
	_ = other
	id, token := newAccount(t, svc, "demoted", []string{"admin"})
	for _, rt := range mailRoutes {
		if got := call(k, rt.method, rt.path, token, true, rt.body).Code; got == http.StatusUnauthorized || got == http.StatusForbidden {
			t.Fatalf("%s before demotion: got %d, want the guard to pass", rt.method, got)
		}
	}
	if err := svc.SetRoles(context.Background(), id, []string{"user"}); err != nil {
		t.Fatal(err)
	}
	for _, rt := range mailRoutes {
		if got := call(k, rt.method, rt.path, token, true, rt.body).Code; got != http.StatusForbidden {
			t.Fatalf("%s after demotion: got %d, want 403", rt.method, got)
		}
	}
}

// Likewise for an account deleted through the admin API: its earlier token is a 401.
func TestMailAdminDeletedAdminIsRefused(t *testing.T) {
	k, svc := bootMail(t)
	_, remover := newAccount(t, svc, "remover", []string{"admin"})
	id, token := newAccount(t, svc, "deleted", []string{"admin"})
	if got := call(k, http.MethodGet, "/api/dashboard/admin/mail", token, false, "").Code; got != http.StatusOK {
		t.Fatalf("before deletion: got %d, want 200", got)
	}
	if got := doJSON(k, http.MethodDelete, "/api/auth/admin/users/"+id, remover, "").Code; got != http.StatusOK {
		t.Fatalf("delete admin: got %d, want 200", got)
	}
	for _, rt := range mailRoutes {
		if got := call(k, rt.method, rt.path, token, true, rt.body).Code; got != http.StatusUnauthorized {
			t.Fatalf("%s after deletion: got %d, want 401", rt.method, got)
		}
	}
}

func TestCSRFGuardRejectsCookieWriteWithoutToken(t *testing.T) {
	h := csrfGuard(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	req := httptest.NewRequest(http.MethodPut, "/x", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "c"})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403", rec.Code)
	}
}

// uniqueEmail keeps accounts apart when the tests share one (PostgreSQL) database.
func uniqueEmail(label string) string {
	return fmt.Sprintf("%s-%d-%d@example.com", label, time.Now().UnixNano(), accountSeq.Add(1))
}
