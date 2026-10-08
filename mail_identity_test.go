package dashboard

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// fakeSMTP is a minimal plaintext SMTP server on 127.0.0.1 that advertises AUTH PLAIN and records
// the decoded credentials every client presented.
type fakeSMTP struct {
	ln    net.Listener
	mu    sync.Mutex
	conns int
	auths []string // "user:password"
}

func startFakeSMTP(t *testing.T) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeSMTP{ln: ln}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			f.mu.Lock()
			f.conns++
			f.mu.Unlock()
			go f.serve(c)
		}
	}()
	return f
}

func (f *fakeSMTP) port() int { return f.ln.Addr().(*net.TCPAddr).Port }

func (f *fakeSMTP) serve(c net.Conn) {
	defer func() { _ = c.Close() }()
	rd := bufio.NewReader(c)
	say := func(s string) { _, _ = fmt.Fprint(c, s+"\r\n") }
	say("220 fake ESMTP")
	inData := false
	for {
		line, err := rd.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		if inData {
			if line == "." {
				inData = false
				say("250 queued")
			}
			continue
		}
		switch cmd := strings.ToUpper(line); {
		case strings.HasPrefix(cmd, "EHLO"):
			say("250-fake")
			say("250 AUTH PLAIN")
		case strings.HasPrefix(cmd, "AUTH PLAIN "):
			raw, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(line[len("AUTH PLAIN "):]))
			parts := strings.Split(string(raw), "\x00") // authzid, user, password
			if len(parts) == 3 {
				f.mu.Lock()
				f.auths = append(f.auths, parts[1]+":"+parts[2])
				f.mu.Unlock()
			}
			say("235 ok")
		case strings.HasPrefix(cmd, "MAIL"), strings.HasPrefix(cmd, "RCPT"):
			say("250 ok")
		case cmd == "DATA":
			inData = true
			say("354 go")
		case cmd == "QUIT":
			say("221 bye")
			return
		default:
			say("250 ok")
		}
	}
}

func (f *fakeSMTP) seen() (int, []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.conns, append([]string(nil), f.auths...)
}

func cfgJSON(c smtpConfig) string { b, _ := json.Marshal(c); return string(b) }

// mailRig boots the kernel, an admin, and saves a base config as the stored one.
type mailRig struct {
	m    *mailAdmin
	call func(method, path, body string) (int, string)
}

func newMailRig(t *testing.T, base smtpConfig) *mailRig {
	t.Helper()
	k, svc := bootMail(t)
	_, admin := newAccount(t, svc, "admin", []string{"admin"})
	r := &mailRig{m: &mailAdmin{k: k}}
	r.call = func(method, path, body string) (int, string) {
		rec := call(k, method, path, admin, true, body)
		return rec.Code, rec.Body.String()
	}
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(base)); code != http.StatusOK {
		t.Fatalf("seed PUT got %d (%s)", code, b)
	}
	return r
}

func (r *mailRig) raw() string {
	v, _ := r.m.kvGet(context.Background(), mailKVKey)
	return v
}

func (r *mailRig) stored() smtpConfig {
	c, _ := r.m.loadSMTP(context.Background())
	return c
}

func baseCfg() smtpConfig {
	return smtpConfig{Host: "smtp.old.test", Port: 587, Username: "user", Password: "old-secret", From: "a@old.test"}
}

// A rejected change must be a 400 with a clear message, and must write nothing.
func TestMailPutRefusesConnectionChangeWithoutPassword(t *testing.T) {
	changes := map[string]func(*smtpConfig){
		"host":     func(c *smtpConfig) { c.Host = "evil.example" },
		"port":     func(c *smtpConfig) { c.Port = 2525 },
		"username": func(c *smtpConfig) { c.Username = "someone-else" },
		"secure":   func(c *smtpConfig) { c.Secure = true },
	}
	for name, change := range changes {
		for _, pw := range []string{"", maskedSecret} {
			t.Run(fmt.Sprintf("%s/pw=%q", name, pw), func(t *testing.T) {
				r := newMailRig(t, baseCfg())
				before := r.raw()
				next := baseCfg()
				change(&next)
				next.Password = pw
				code, body := r.call(http.MethodPut, mailURL, cfgJSON(next))
				if code != http.StatusBadRequest || !strings.Contains(body, "password required") {
					t.Fatalf("got %d %s, want 400 password required", code, body)
				}
				if after := r.raw(); after != before {
					t.Fatalf("stored config changed on a rejected PUT:\nbefore %s\nafter  %s", before, after)
				}
			})
		}
	}
}

func TestMailPutKeepsPasswordWhenConnectionUnchanged(t *testing.T) {
	r := newMailRig(t, baseCfg())
	next := baseCfg()
	next.From = "new-sender@old.test"
	next.Host = "  SMTP.Old.Test " // same server, different spelling
	next.Port = 0                  // the 587 default
	next.Password = maskedSecret
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(next)); code != http.StatusOK {
		t.Fatalf("got %d %s, want 200", code, b)
	}
	got := r.stored()
	if got.Password != "old-secret" || got.From != "new-sender@old.test" {
		t.Fatalf("stored = %+v, want the old password kept and the new From", got)
	}
	if strings.Contains(r.raw(), maskedSecret) {
		t.Fatal("the mask was persisted")
	}
	// An empty password behaves like the mask.
	next.Password = ""
	next.From = "again@old.test"
	if code, _ := r.call(http.MethodPut, mailURL, cfgJSON(next)); code != http.StatusOK {
		t.Fatalf("empty password with same identity got %d, want 200", code)
	}
	if got := r.stored(); got.Password != "old-secret" || got.From != "again@old.test" {
		t.Fatalf("stored = %+v", got)
	}
}

func TestMailPutChangedHostWithNewPasswordStoresIt(t *testing.T) {
	r := newMailRig(t, baseCfg())
	next := baseCfg()
	next.Host = "smtp.new.test"
	next.Password = "new-secret"
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(next)); code != http.StatusOK {
		t.Fatalf("got %d %s, want 200", code, b)
	}
	if got := r.stored(); got.Host != "smtp.new.test" || got.Password != "new-secret" {
		t.Fatalf("stored = %+v", got)
	}
}

// Dropping the username means no credentials are sent, so the old password is discarded rather
// than carried (and no password is demanded).
func TestMailPutWithoutUsernameDropsStoredPassword(t *testing.T) {
	r := newMailRig(t, baseCfg())
	next := smtpConfig{Host: "relay.new.test", Port: 25, From: "a@old.test", Password: maskedSecret}
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(next)); code != http.StatusOK {
		t.Fatalf("got %d %s, want 200", code, b)
	}
	if got := r.stored(); got.Password != "" || got.Host != "relay.new.test" {
		t.Fatalf("stored = %+v, want no password", got)
	}
}

// With nothing stored, a mask is no password and is never persisted.
func TestMailPutMaskWithNothingStoredIsNoPassword(t *testing.T) {
	k, svc := bootMail(t)
	_, admin := newAccount(t, svc, "admin", []string{"admin"})
	m := &mailAdmin{k: k}
	body := cfgJSON(smtpConfig{Host: "smtp.first.test", Port: 587, Username: "u", Password: maskedSecret, From: "a@first.test"})
	if rec := call(k, http.MethodPut, mailURL, admin, true, body); rec.Code != http.StatusOK {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	raw, _ := m.kvGet(context.Background(), mailKVKey)
	if cfg, _ := m.loadSMTP(context.Background()); cfg.Password != "" || strings.Contains(raw, maskedSecret) {
		t.Fatalf("stored %s, want an empty password and no mask", raw)
	}
}

// End to end: a rejected PUT toward a new host leaves the old config in place, so the test send
// still goes to the old server and the new host never sees a connection or the old credential;
// once the admin supplies a password for the new host it receives that one.
func TestMailTestNeverSendsOldPasswordToNewHost(t *testing.T) {
	good, evil := startFakeSMTP(t), startFakeSMTP(t)
	base := smtpConfig{Host: "127.0.0.1", Port: good.port(), Username: "user", Password: "old-secret", From: "a@old.test"}
	r := newMailRig(t, base)

	evilCfg := base
	evilCfg.Port = evil.port()
	evilCfg.Password = maskedSecret
	if code, _ := r.call(http.MethodPut, mailURL, cfgJSON(evilCfg)); code != http.StatusBadRequest {
		t.Fatalf("PUT to a new host with the mask got %d, want 400", code)
	}
	if code, b := r.call(http.MethodPost, mailURL+"/test", `{"to":"x@y.test"}`); code != http.StatusOK || !strings.Contains(b, `"ok":true`) {
		t.Fatalf("test send got %d %s", code, b)
	}
	if n, _ := evil.seen(); n != 0 {
		t.Fatalf("the new host received %d connection(s) after a rejected PUT", n)
	}
	if _, auths := good.seen(); len(auths) != 1 || auths[0] != "user:old-secret" {
		t.Fatalf("original host saw %v, want the old credentials once", auths)
	}

	evilCfg.Password = "new-secret"
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(evilCfg)); code != http.StatusOK {
		t.Fatalf("PUT with a new password got %d %s", code, b)
	}
	if code, b := r.call(http.MethodPost, mailURL+"/test", `{"to":"x@y.test"}`); code != http.StatusOK || !strings.Contains(b, `"ok":true`) {
		t.Fatalf("test send got %d %s", code, b)
	}
	_, auths := evil.seen()
	if len(auths) != 1 || auths[0] != "user:new-secret" {
		t.Fatalf("new host saw %v, want only the new credentials", auths)
	}
}
