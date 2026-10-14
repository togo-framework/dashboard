package dashboard

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"
)

// Mail / SMTP admin surface for the dashboard plugin.
//
// The auth plugin intentionally leaves outbound email OUT of scope (its
// reset/magic-link endpoints return the link in the response with emailed:false
// and fire an event so a mail plugin can deliver it). The dashboard is the
// admin/ops plugin, so it owns SMTP configuration + a test-send here.
//
// Routes mount under /api/dashboard/admin/mail behind the auth plugin's
// RequireRole("admin") guard; writes also carry a double-submit CSRF check
// (bearer requests are exempt, mirroring the auth plugin's admin surface). The
// config persists in a small kv table (dashboard_kv) — the same reliable
// pattern Fort uses — so it works across every SQL driver togo supports.

const (
	csrfCookieName = "togo_csrf" // matches the auth plugin's CSRF cookie
	mailKVKey      = "smtp"      // dashboard_kv row holding the SMTP config JSON
	maskedSecret   = "••••••••"  //nolint:gosmopolitan // UI mask, not a credential
)

// smtpConfig is the persisted SMTP configuration. The web client
// (web/lib/mail.ts) maps this shape (host/port/username/password/from/secure)
// to and from Nasaq's SmtpSettings.
type smtpConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
	Secure   bool   `json:"secure"`
}

// sameConnection reports whether a and b address the same SMTP server with the same login:
// host (ASCII case-insensitive), port (0 means the 587 default), username and TLS mode. From is not
// part of the authentication identity.
func sameConnection(a, b smtpConfig) bool {
	port := func(p int) int {
		if p == 0 {
			return 587
		}
		return p
	}
	return asciiEqualFold(strings.TrimSpace(a.Host), strings.TrimSpace(b.Host)) &&
		port(a.Port) == port(b.Port) &&
		strings.TrimSpace(a.Username) == strings.TrimSpace(b.Username) &&
		a.Secure == b.Secure
}

// mailAdmin carries the kernel handle for the mail routes.
type mailAdmin struct {
	k         *togo.Kernel
	testLimit *rateLimiter
}

// mountMailRoutes wires the dashboard SMTP/mail admin API. It is a no-op (with a
// warning) when the auth service isn't on the kernel, since the routes are
// guarded by auth's RequireRole.
func mountMailRoutes(k *togo.Kernel) {
	svc, ok := auth.FromKernel(k)
	if !ok {
		if k.Log != nil {
			k.Log.Warn("dashboard mail admin disabled", "reason", "auth service unavailable")
		}
		return
	}
	m := &mailAdmin{k: k, testLimit: newRateLimiter(testMailBurst, testMailWindow)}
	k.Router.Route("/api/dashboard/admin", func(r chi.Router) {
		r.Use(svc.RequireRole("admin"), refuseBorrowedAdmin)
		r.Get("/mail", m.getMail)
		r.With(csrfGuard).Put("/mail", m.putMail)
		r.With(csrfGuard).Post("/mail/test", m.testMail)
	})
	if k.Log != nil {
		k.Log.Info("dashboard mail admin active", "routes", "/api/dashboard/admin/mail")
	}
}

// ---- HTTP handlers -------------------------------------------------------

func (m *mailAdmin) getMail(w http.ResponseWriter, r *http.Request) {
	cfg, _ := m.loadSMTP(r.Context())
	if cfg.Password != "" {
		cfg.Password = maskedSecret // never leak the stored secret
	}
	writeJSON(w, http.StatusOK, cfg)
}

// ---- persistence (dashboard_kv) ------------------------------------------

func (m *mailAdmin) db(ctx context.Context) (*sql.DB, func(int) string) {
	db, err := m.k.SQL(ctx)
	if err != nil || db == nil {
		return nil, nil
	}
	return db, m.k.Dialect().Placeholder
}

func (m *mailAdmin) kvSet(ctx context.Context, key, val string) error {
	db, ph := m.db(ctx)
	if db == nil {
		return fmt.Errorf("no database")
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS dashboard_kv (k TEXT PRIMARY KEY, v TEXT)`); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO dashboard_kv (k,v) VALUES (`+ph(1)+`,`+ph(2)+`) ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
		key, val)
	return err
}

func (m *mailAdmin) kvGet(ctx context.Context, key string) (string, bool) {
	db, ph := m.db(ctx)
	if db == nil {
		return "", false
	}
	_, _ = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS dashboard_kv (k TEXT PRIMARY KEY, v TEXT)`)
	var v string
	if err := db.QueryRowContext(ctx, `SELECT v FROM dashboard_kv WHERE k=`+ph(1), key).Scan(&v); err != nil {
		return "", false
	}
	return v, true
}

func (m *mailAdmin) loadSMTP(ctx context.Context) (smtpConfig, bool) {
	raw, ok := m.kvGet(ctx, mailKVKey)
	if !ok {
		return smtpConfig{}, false
	}
	var cfg smtpConfig
	_ = json.Unmarshal([]byte(raw), &cfg)
	return cfg, cfg.Host != ""
}

func (m *mailAdmin) saveSMTP(ctx context.Context, cfg smtpConfig) error {
	b, _ := json.Marshal(cfg)
	return m.kvSet(ctx, mailKVKey, string(b))
}

// ---- middleware + helpers ------------------------------------------------

// refuseBorrowedAdmin runs after auth's RequireRole("admin"), which only checks the role. It
// mirrors auth's own admin API (requireAdmin): an impersonated session is borrowed and an API
// token (PAT) is scoped by its abilities, so neither may act with the owner's administrator role
// on the mail routes. With AUTH_ADMIN_CROSS_CONTROL=true an administrator can impersonate
// another administrator, whose borrowed session would otherwise pass RequireRole.
func refuseBorrowedAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := auth.IdentityFrom(r.Context())
		if !ok || id == nil || id.Impersonator != "" || id.Guard == "pat" {
			writeErr(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// csrfGuard enforces double-submit CSRF on unsafe methods for COOKIE-authed
// requests, mirroring the auth plugin. Bearer (API/impersonation) requests are
// exempt — they're not cookie-driven, so not CSRF-prone.
func csrfGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if h := r.Header.Get("Authorization"); len(h) > 7 && h[:7] == "Bearer " {
			next.ServeHTTP(w, r)
			return
		}
		c, err := r.Cookie(csrfCookieName)
		header := r.Header.Get("X-CSRF-Token")
		if err != nil || header == "" || subtle.ConstantTimeCompare([]byte(c.Value), []byte(header)) != 1 {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid csrf token"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
