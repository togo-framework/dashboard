package dashboard

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Test sends are capped: each one opens an outbound connection to the configured host.
const (
	testMailBurst  = 5
	testMailWindow = time.Minute
	maxMailBody    = 64 << 10
)

// logFailure records a failure's detail server side. The HTTP response carries
// only a generic message, so error text (which can reveal hosts, ports and
// driver internals) never reaches the browser.
func (m *mailAdmin) logFailure(msg string, err error, attrs ...any) {
	if m.k != nil && m.k.Log != nil {
		m.k.Log.Warn(msg, append(attrs, "error", err)...)
	}
}

func (m *mailAdmin) putMail(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxMailBody))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var cfg smtpConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Store the connection identity trimmed, so what is saved is what sameConnection compares.
	cfg.Host = strings.TrimSpace(cfg.Host)
	cfg.Username = strings.TrimSpace(cfg.Username)
	var present map[string]json.RawMessage
	_ = json.Unmarshal(raw, &present)
	_, usernameSent := present["username"]

	old, hadOld := m.loadSMTP(r.Context())
	// A client that leaves "username" out (a From-only edit) is not asking to drop the login:
	// keep the stored one. An explicit "username": "" still means "no authentication".
	if !usernameSent && hadOld {
		cfg.Username = strings.TrimSpace(old.Username)
	}
	// A blank or masked password means "keep the stored one", but the stored secret is only ever
	// sent to the server it was saved for. If the connection identity (host, port, username,
	// security) changed, the caller must supply the password again: otherwise POST /mail/test
	// would hand the old credential to whatever host was just entered.
	if cfg.Password == "" || cfg.Password == maskedSecret {
		cfg.Password = ""
		if hadOld && old.Password != "" {
			switch {
			case sameConnection(old, cfg):
				cfg.Password = old.Password
			case cfg.Username != "":
				// Authenticated connection to a different identity: no silent carry-over.
				writeErr(w, http.StatusBadRequest, "password required when changing SMTP host, port, username or security")
				return
			}
			// A new config without a username sends no credentials, so the old password is dropped.
		}
	}
	if err := m.saveSMTP(r.Context(), cfg); err != nil {
		m.logFailure("dashboard: saving the SMTP settings failed", err)
		writeErr(w, http.StatusInternalServerError, "could not save the SMTP settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// rateLimiter allows at most max events per sliding window.
type rateLimiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   []time.Time
}

func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{max: max, window: window}
}

// allow records an event and reports true, or reports false and how long to wait
// when the window is full.
func (l *rateLimiter) allow() (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	keep := l.hits[:0]
	for _, t := range l.hits {
		if now.Sub(t) < l.window {
			keep = append(keep, t)
		}
	}
	l.hits = keep
	if len(l.hits) >= l.max {
		return false, l.window - now.Sub(l.hits[0])
	}
	l.hits = append(l.hits, now)
	return true, 0
}

// smtpFailureText is the only SMTP error text the API returns, per failed stage.
var smtpFailureText = map[string]string{
	"connect": "Could not connect to the SMTP server",
	"tls":     "Could not establish a secure connection to the SMTP server",
	"auth":    "The SMTP server rejected the login",
	"send":    "The SMTP server did not accept the message",
}

func (m *mailAdmin) testMail(w http.ResponseWriter, r *http.Request) {
	if m.testLimit != nil {
		if ok, wait := m.testLimit.allow(); !ok {
			w.Header().Set("Retry-After", fmt.Sprint(int(wait/time.Second)+1))
			writeErr(w, http.StatusTooManyRequests, "too many test emails; try again shortly")
			return
		}
	}
	var body struct {
		To string `json:"to"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, maxMailBody)).Decode(&body)
	cfg, ok := m.loadSMTP(r.Context())
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "SMTP is not configured — set host/port/from first"})
		return
	}
	if body.To == "" {
		body.To = cfg.From
	}
	if err := sendSMTP(cfg, body.To, "togo SMTP test", "This is a test email from your togo dashboard. SMTP is working."); err != nil {
		stage := "send"
		var se *smtpError
		if errors.As(err, &se) {
			stage = se.stage
		}
		m.logFailure("dashboard: SMTP test send failed", err, "stage", stage, "host", cfg.Host, "port", cfg.Port)
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": smtpFailureText[stage], "stage": stage})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
