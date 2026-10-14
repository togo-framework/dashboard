package dashboard

import (
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

// A host that accepts the connection and never speaks must not hold the request open.
func TestSendSMTPTimesOutOnSilentHost(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer c.Close()
		}
	}()
	old := smtpTotalTimeout
	smtpTotalTimeout = 300 * time.Millisecond
	defer func() { smtpTotalTimeout = old }()

	cfg := smtpConfig{Host: "127.0.0.1", Port: ln.Addr().(*net.TCPAddr).Port, From: "a@a.test"}
	done := make(chan error, 1)
	go func() { done <- sendSMTP(cfg, "b@a.test", "s", "b") }()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("expected an error from a silent host")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("sendSMTP did not honour its deadline")
	}
}

func TestMailTestEndpointRateLimited(t *testing.T) {
	r := newMailRig(t, baseCfg())
	// Nothing listens on this port, so every attempt fails fast at the connect stage.
	cfg := baseCfg()
	cfg.Host, cfg.Port = "127.0.0.1", 1
	cfg.Password = ""
	cfg.Username = ""
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(cfg)); code != http.StatusOK {
		t.Fatalf("PUT got %d %s", code, b)
	}
	for i := 0; i < testMailBurst; i++ {
		if code, b := r.call(http.MethodPost, mailURL+"/test", `{}`); code != http.StatusOK {
			t.Fatalf("attempt %d got %d %s, want 200", i, code, b)
		}
	}
	if code, b := r.call(http.MethodPost, mailURL+"/test", `{}`); code != http.StatusTooManyRequests {
		t.Fatalf("over-limit got %d %s, want 429", code, b)
	}
}

// The failure response carries a fixed per-stage text, never the dial error.
func TestMailTestErrorIsGeneric(t *testing.T) {
	r := newMailRig(t, baseCfg())
	cfg := smtpConfig{Host: "127.0.0.1", Port: 1, From: "a@a.test"}
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(cfg)); code != http.StatusOK {
		t.Fatalf("PUT got %d %s", code, b)
	}
	code, b := r.call(http.MethodPost, mailURL+"/test", `{}`)
	if code != http.StatusOK {
		t.Fatalf("got %d %s", code, b)
	}
	if !strings.Contains(b, smtpFailureText["connect"]) || strings.Contains(b, "127.0.0.1") || strings.Contains(b, "refused") {
		t.Fatalf("response leaks detail or lacks stage text: %s", b)
	}
}

func TestAsciiEqualFold(t *testing.T) {
	if !asciiEqualFold("SMTP.Example.com", "smtp.example.COM") {
		t.Fatal("ASCII case should fold")
	}
	if asciiEqualFold("K.test", "k.test") {
		t.Fatal("Kelvin sign must not equal k")
	}
	if asciiEqualFold("a", "ab") {
		t.Fatal("different lengths must differ")
	}
}

func TestMailPutTrimsHostAndUsername(t *testing.T) {
	r := newMailRig(t, baseCfg())
	cfg := smtpConfig{Host: "  smtp.new.test ", Port: 25, Username: " u2 ", Password: "pw", From: "a@a.test"}
	if code, b := r.call(http.MethodPut, mailURL, cfgJSON(cfg)); code != http.StatusOK {
		t.Fatalf("got %d %s", code, b)
	}
	if got := r.stored(); got.Host != "smtp.new.test" || got.Username != "u2" {
		t.Fatalf("stored = %+v, want trimmed", got)
	}
}

func TestMailPutOmittedUsernameKeepsLogin(t *testing.T) {
	r := newMailRig(t, baseCfg())
	body := `{"host":"smtp.old.test","port":587,"from":"new@old.test","password":"` + maskedSecret + `"}`
	if code, b := r.call(http.MethodPut, mailURL, body); code != http.StatusOK {
		t.Fatalf("got %d %s", code, b)
	}
	if got := r.stored(); got.Username != "user" || got.Password != "old-secret" || got.From != "new@old.test" {
		t.Fatalf("stored = %+v, want login kept", got)
	}
}

func TestMailPutBadBodyIsGeneric(t *testing.T) {
	r := newMailRig(t, baseCfg())
	code, b := r.call(http.MethodPut, mailURL, `{not json`)
	if code != http.StatusBadRequest || !strings.Contains(b, "invalid request body") || strings.Contains(b, "character") {
		t.Fatalf("got %d %s", code, b)
	}
}
