package dashboard

import (
	"context"
	"net/http"
	"testing"
)

const mailURL = "/api/dashboard/admin/mail"

// TestMailPutPersistsOnEveryDriver: a first save and a second save (the ON CONFLICT path) both
// succeed and the second value wins. kvSet used to reuse placeholder 2, which binds three
// arguments for two on drivers with positional "?" placeholders (SQLite), so every PUT was a 500.
func TestMailPutPersistsOnEveryDriver(t *testing.T) {
	k, svc := bootMail(t)
	_, admin := newAccount(t, svc, "admin", []string{"admin"})
	m := &mailAdmin{k: k}
	first := `{"host":"smtp.a.test","port":587,"username":"u","password":"pw1","from":"a@a.test","secure":false}`
	if got := call(k, http.MethodPut, mailURL, admin, true, first); got.Code != http.StatusOK {
		t.Fatalf("first PUT got %d (%s), want 200", got.Code, got.Body.String())
	}
	second := `{"host":"smtp.a.test","port":587,"username":"u","password":"pw2","from":"b@a.test","secure":false}`
	if got := call(k, http.MethodPut, mailURL, admin, true, second); got.Code != http.StatusOK {
		t.Fatalf("second PUT got %d (%s), want 200", got.Code, got.Body.String())
	}
	cfg, ok := m.loadSMTP(context.Background())
	if !ok || cfg.Password != "pw2" || cfg.From != "b@a.test" {
		t.Fatalf("stored config = %+v ok=%v, want the second save", cfg, ok)
	}
}
