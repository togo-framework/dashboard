package dashboard

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite" // test-only SQLite driver for the kernel DB

	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"
)

// bootMail boots a real kernel (SQLite in a temp dir) with the auth and dashboard
// providers, so the guard under test is auth's own RequireRole, not a stand-in.
func bootMail(t *testing.T) (*togo.Kernel, *auth.Service) {
	t.Helper()
	t.Setenv("DATABASE_URL", "file:"+filepath.Join(t.TempDir(), "t.db")+"?_pragma=busy_timeout(5000)")
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("AUTH_SECRET", "a-sufficiently-long-test-secret-string!!")
	k := togo.New()
	t.Cleanup(k.Close) // release the SQLite file before TempDir removal (Windows)
	svc, ok := auth.FromKernel(k)
	if !ok {
		t.Fatal("auth service not on the kernel")
	}
	return k, svc
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

func TestMailAdminRequiresAdmin(t *testing.T) {
	k, svc := bootMail(t)
	user, err := svc.IssueToken(auth.Identity{ID: "u1", Email: "u@example.com", Roles: []string{"user"}, Guard: "api"})
	if err != nil {
		t.Fatal(err)
	}
	routes := []struct{ method, path, body string }{
		{http.MethodGet, "/api/dashboard/admin/mail", ""},
		{http.MethodPut, "/api/dashboard/admin/mail", `{}`},
		{http.MethodPost, "/api/dashboard/admin/mail/test", `{}`},
	}
	for _, rt := range routes {
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
	admin, _ := svc.IssueToken(auth.Identity{ID: "a1", Email: "a@example.com", Roles: []string{"admin"}, Guard: "api"})
	if got := call(k, http.MethodGet, "/api/dashboard/admin/mail", admin, false, "").Code; got != http.StatusOK {
		t.Fatalf("admin GET got %d, want 200", got)
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
