package dashboard

import (
	"context"
	"crypto/subtle"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"

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
	csrfCookieName = "togo_csrf"  // matches the auth plugin's CSRF cookie
	mailKVKey      = "smtp"       // dashboard_kv row holding the SMTP config JSON
	maskedSecret   = "••••••••" //nolint:gosmopolitan // UI mask, not a credential
)

// smtpConfig is the persisted SMTP configuration. Field names match the kit's
// MailConfig type (host/port/username/password/from/secure) so MailSettingsForm
// round-trips it directly.
type smtpConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
	Secure   bool   `json:"secure"`
}

// mailAdmin carries the kernel handle for the mail routes.
type mailAdmin struct{ k *togo.Kernel }

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
	m := &mailAdmin{k: k}
	k.Router.Route("/api/dashboard/admin", func(r chi.Router) {
		r.Use(svc.RequireRole("admin"))
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

func (m *mailAdmin) putMail(w http.ResponseWriter, r *http.Request) {
	var cfg smtpConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	// Keep the existing password when the caller echoes the mask (or sends none).
	if cfg.Password == "" || cfg.Password == maskedSecret {
		if old, ok := m.loadSMTP(r.Context()); ok {
			cfg.Password = old.Password
		} else {
			cfg.Password = ""
		}
	}
	if err := m.saveSMTP(r.Context(), cfg); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (m *mailAdmin) testMail(w http.ResponseWriter, r *http.Request) {
	var body struct {
		To string `json:"to"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	cfg, ok := m.loadSMTP(r.Context())
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "SMTP is not configured — set host/port/from first"})
		return
	}
	if body.To == "" {
		body.To = cfg.From
	}
	if err := sendSMTP(cfg, body.To, "togo SMTP test", "This is a test email from your togo dashboard. SMTP is working."); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
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
		`INSERT INTO dashboard_kv (k,v) VALUES (`+ph(1)+`,`+ph(2)+`) ON CONFLICT(k) DO UPDATE SET v=`+ph(2),
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

// ---- SMTP send (stdlib net/smtp) -----------------------------------------

func sendSMTP(cfg smtpConfig, to, subject, body string) error {
	if cfg.Host == "" {
		return fmt.Errorf("smtp host not set")
	}
	port := cfg.Port
	if port == 0 {
		port = 587
	}
	addr := fmt.Sprintf("%s:%d", cfg.Host, port)
	from := cfg.From
	if from == "" {
		from = cfg.Username
	}
	msg := []byte("From: " + from + "\r\nTo: " + to + "\r\nSubject: " + subject +
		"\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + body + "\r\n")

	var smtpAuth smtp.Auth
	if cfg.Username != "" {
		smtpAuth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
	}

	// Implicit TLS (SMTPS) on 465; STARTTLS upgrade is handled by smtp.SendMail.
	if cfg.Secure && port == 465 {
		c, err := tls.Dial("tcp", addr, &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return err
		}
		defer func() { _ = c.Close() }()
		cl, err := smtp.NewClient(c, cfg.Host)
		if err != nil {
			return err
		}
		defer func() { _ = cl.Close() }()
		if smtpAuth != nil {
			if err := cl.Auth(smtpAuth); err != nil {
				return err
			}
		}
		if err := cl.Mail(from); err != nil {
			return err
		}
		if err := cl.Rcpt(to); err != nil {
			return err
		}
		wc, err := cl.Data()
		if err != nil {
			return err
		}
		if _, err := wc.Write(msg); err != nil {
			return err
		}
		return wc.Close()
	}
	return smtp.SendMail(addr, smtpAuth, from, []string{to}, msg)
}

// ---- middleware + helpers ------------------------------------------------

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
