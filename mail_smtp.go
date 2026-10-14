package dashboard

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"time"
)

// Bounds on an outbound SMTP conversation, so a host that never answers cannot
// hold a handler goroutine. Variables so tests can shorten them.
var (
	smtpDialTimeout  = 10 * time.Second
	smtpTotalTimeout = 30 * time.Second
)

// smtpError tags a failure with the stage it happened at (connect, tls, auth,
// send). The API reports the stage, never the error text.
type smtpError struct {
	stage string
	err   error
}

func (e *smtpError) Error() string { return e.stage + ": " + e.err.Error() }
func (e *smtpError) Unwrap() error { return e.err }

func stageErr(stage string, err error) error {
	if err == nil {
		return nil
	}
	return &smtpError{stage: stage, err: err}
}

// sendSMTP delivers one plain-text message. The dial and the whole conversation
// are time-bounded; failures are tagged with their stage (see smtpError).
func sendSMTP(cfg smtpConfig, to, subject, body string) error {
	if cfg.Host == "" {
		return stageErr("connect", fmt.Errorf("smtp host not set"))
	}
	port := cfg.Port
	if port == 0 {
		port = 587
	}
	addr := net.JoinHostPort(cfg.Host, fmt.Sprint(port))
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
	tlsCfg := &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}

	dialer := net.Dialer{Timeout: smtpDialTimeout}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return stageErr("connect", err)
	}
	defer func() { _ = conn.Close() }()
	// One deadline for the whole conversation: every read and write below honours it.
	_ = conn.SetDeadline(time.Now().Add(smtpTotalTimeout))

	// Implicit TLS (SMTPS) on 465; otherwise STARTTLS is used when the server offers it.
	implicit := cfg.Secure && port == 465
	if implicit {
		tc := tls.Client(conn, tlsCfg)
		if err := tc.Handshake(); err != nil {
			return stageErr("tls", err)
		}
		conn = tc
	}
	cl, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return stageErr("connect", err)
	}
	defer func() { _ = cl.Close() }()
	if !implicit {
		if ok, _ := cl.Extension("STARTTLS"); ok {
			if err := cl.StartTLS(tlsCfg); err != nil {
				return stageErr("tls", err)
			}
		}
	}
	if smtpAuth != nil {
		if err := cl.Auth(smtpAuth); err != nil {
			return stageErr("auth", err)
		}
	}
	if err := cl.Mail(from); err != nil {
		return stageErr("send", err)
	}
	if err := cl.Rcpt(to); err != nil {
		return stageErr("send", err)
	}
	wc, err := cl.Data()
	if err != nil {
		return stageErr("send", err)
	}
	if _, err := wc.Write(msg); err != nil {
		return stageErr("send", err)
	}
	if err := wc.Close(); err != nil {
		return stageErr("send", err)
	}
	return stageErr("send", cl.Quit())
}

// asciiEqualFold compares two strings ignoring ASCII case only. strings.EqualFold applies Unicode
// folding, under which e.g. U+212A (Kelvin sign) equals "k"; hosts are ASCII (or punycode).
func asciiEqualFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		x, y := a[i], b[i]
		if 'A' <= x && x <= 'Z' {
			x += 'a' - 'A'
		}
		if 'A' <= y && y <= 'Z' {
			y += 'a' - 'A'
		}
		if x != y {
			return false
		}
	}
	return true
}
