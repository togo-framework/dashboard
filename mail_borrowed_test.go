package dashboard

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// F1: with AUTH_ADMIN_CROSS_CONTROL=true an administrator can impersonate another administrator;
// that borrowed session passes auth's RequireRole("admin") but must not reach the mail routes.
func TestMailAdminRefusesImpersonatedAdminSession(t *testing.T) {
	t.Setenv("AUTH_ADMIN_CROSS_CONTROL", "true")
	k, svc := bootMail(t)
	_, actor := newAccount(t, svc, "actor-admin", []string{"admin"})
	targetID, target := newAccount(t, svc, "target-admin", []string{"admin"})

	rec := doJSON(k, http.MethodPost, "/api/auth/admin/users/"+targetID+"/impersonate", actor, `{}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("impersonate got %d %s, want 200", rec.Code, rec.Body.String())
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || out.Token == "" {
		t.Fatalf("no impersonation token in %s", rec.Body.String())
	}
	for _, rt := range mailRoutes {
		got := call(k, rt.method, rt.path, out.Token, true, rt.body)
		if got.Code != http.StatusForbidden || !strings.Contains(got.Body.String(), `"forbidden"`) {
			t.Errorf("impersonated %s %s: got %d %s, want 403 forbidden", rt.method, rt.path, got.Code, got.Body.String())
		}
	}
	// The same admin, not borrowed, and the real actor keep their access.
	for _, tok := range []string{target, actor} {
		for _, rt := range mailRoutes {
			if got := call(k, rt.method, rt.path, tok, true, rt.body).Code; got != http.StatusOK {
				t.Errorf("normal admin %s %s: got %d, want 200", rt.method, rt.path, got)
			}
		}
	}
}
