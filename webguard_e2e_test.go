//go:build webe2e

package dashboard

// End-to-end check of the dashboard page guard: the plugin's web/ built into the test harness
// (`next build` in test-harness/.build) served by `next start`, talking to a real kernel with
// DASHBOARD_REQUIRED_ROLE=admin. Every (app) route is requested the four ways a browser asks
// for a page: a hard load, an RSC fetch, a prefetch, and a soft navigation from an already
// mounted (app) layout (the router-state header Next's client sends, so the server renders the
// page segment only and the layout's own check does not run).
//
//	node test-harness/assemble.mjs && (cd test-harness/.build && npm ci && npm run build)
//	go test -tags webe2e -run TestWebGuard -count=1 -v .

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/togo-framework/auth"
)

// outcome is what the guard must do for a caller.
type outcome int

const (
	allow outcome = iota
	signin
	forbidden
)

func (o outcome) String() string { return [...]string{"allow", "signin", "forbidden"}[o] }

type webCaller struct {
	name   string
	cookie string // togo_session value; "" sends no cookie
	bearer string // Authorization bearer sent to Next, which the guard must ignore
	want   outcome
}

type webRequest struct {
	kind    string
	headers map[string]string
}

// softNavTree is the router state Next's client sends while it shows the (app) page at from
// (one segment, such as "dashboard"): the (app) layout is mounted, so the server renders only
// the segments below it.
func softNavTree(from string) string {
	page := []any{"__PAGE__", map[string]any{}}
	tree := []any{"", map[string]any{"children": []any{"(app)", map[string]any{"children": []any{from, map[string]any{"children": page}}}}}}
	b, _ := json.Marshal(tree)
	return url.QueryEscape(string(b))
}

// webRequests are the four ways a browser asks for path. The soft navigation starts from
// another (app) page; navigating to the page already shown returns nothing to check.
func webRequests(path string) []webRequest {
	from := "dashboard"
	if path == "/dashboard" {
		from = "profile"
	}
	return []webRequest{
		{"hard", nil},
		{"rsc", map[string]string{"RSC": "1"}},
		{"prefetch", map[string]string{"RSC": "1", "Next-Router-Prefetch": "1"}},
		{"softnav", map[string]string{"RSC": "1", "Next-Router-State-Tree": softNavTree(from), "Next-Url": "/" + from}},
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// startNext serves the built harness with API_ORIGIN pointing at the kernel.
func startNext(t *testing.T, apiOrigin string) string {
	t.Helper()
	dir := os.Getenv("DASHBOARD_E2E_WEB")
	if dir == "" {
		dir = filepath.Join("test-harness", ".build")
	}
	if _, err := os.Stat(filepath.Join(dir, ".next", "BUILD_ID")); err != nil {
		t.Fatalf("no Next build in %s (run next build first): %v", dir, err)
	}
	port := freePort(t)
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, "node", filepath.Join("node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", fmt.Sprint(port))
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "API_ORIGIN="+apiOrigin, "NODE_ENV=production")
	cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() { cancel(); _ = cmd.Wait() })
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		if res, err := http.Get(base + "/login"); err == nil {
			res.Body.Close()
			return base
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("next start did not come up")
	return ""
}

type webResult struct {
	status   int
	location string
	body     string
}

// fetchPage requests path as req describes. Next 16 answers an RSC request without the _rsc
// cache-busting parameter with a redirect to the hashed URL; like the client, follow that once.
func fetchPage(t *testing.T, base, path string, c webCaller, req webRequest) webResult {
	t.Helper()
	res := fetchOnce(t, base, path, c, req)
	if req.headers["RSC"] != "" && res.status == http.StatusTemporaryRedirect && strings.HasPrefix(res.location, path+"?_rsc") {
		res = fetchOnce(t, base, res.location, c, req)
	}
	return res
}

func fetchOnce(t *testing.T, base, path string, c webCaller, req webRequest) webResult {
	t.Helper()
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Timeout: 30 * time.Second}
	r, _ := http.NewRequest(http.MethodGet, base+path, nil)
	for k, v := range req.headers {
		r.Header.Set(k, v)
	}
	if c.cookie != "" {
		r.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: c.cookie})
	}
	if c.bearer != "" {
		r.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	res, err := client.Do(r)
	if err != nil {
		t.Fatalf("%s %s: %v", req.kind, path, err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return webResult{res.StatusCode, res.Header.Get("Location"), string(b)}
}

const (
	deniedMark    = "data-dashboard-denied"
	loginRedirect = "NEXT_REDIRECT;replace;/login;"
)

type webRoute struct {
	path string
	dir  string // the route's folder under web/app/(app)
}

func webRoutes(userID string) []webRoute {
	return []webRoute{
		{"/dashboard", "dashboard"},
		{"/profile", "profile"},
		{"/admin", "admin"},
		{"/admin/users", "admin/users"},
		{"/admin/users/" + userID, "admin/users/[id]"},
		{"/admin/mail", "admin/mail"},
		{"/admin/posts", "admin/[resource]"},
	}
}

// clientRef returns the flight-payload reference ("I[<id>,") of a client module, read from the
// build's client-reference manifest for the route. A response renders that module only if it
// carries the reference, so the page view and the dashboard shell are told apart from the
// forbidden state without any test-only markup.
func clientRef(t *testing.T, web, dir, module string) string {
	t.Helper()
	if web == "" {
		web = filepath.Join("test-harness", ".build")
	}
	b, err := os.ReadFile(filepath.Join(web, ".next", "server", "app", "(app)", filepath.FromSlash(dir), "page_client-reference-manifest.js"))
	if err != nil {
		t.Fatal(err)
	}
	m := regexp.MustCompile(regexp.QuoteMeta(`"[project]/app/(app)/`+module+`":{"id":`) + `(\d+)`).FindSubmatch(b)
	if m == nil {
		t.Fatalf("%s not in the %s manifest", module, dir)
	}
	return "I[" + string(m[1]) + ","
}

// checkWeb asserts one response. Signed out is a redirect to /login (a 307 on a hard load, the
// NEXT_REDIRECT digest in a flight payload); forbidden is the denied state; allowed renders the
// view, and the shell too unless a soft navigation kept the mounted layout. A prefetch of these
// dynamic pages carries only the route tree, so it renders nothing for anyone.
func checkWeb(t *testing.T, res webResult, kind string, want outcome, view, shell string) {
	t.Helper()
	has := func(s string) bool { return strings.Contains(res.body, s) }
	fail := func(why string) {
		t.Helper()
		t.Fatalf("%s want %s: %s (status %d, location %q, %d bytes)", kind, want, why, res.status, res.location, len(res.body))
	}
	if kind == "prefetch" {
		if res.status != http.StatusOK || has(view) || has(shell) || has(deniedMark) || has(loginRedirect) {
			fail("prefetch carries more than the route tree")
		}
		return
	}
	if want != allow && (has(view) || has(shell)) {
		fail("protected view or shell rendered")
	}
	switch want {
	case signin:
		if kind == "hard" {
			if res.status != http.StatusTemporaryRedirect || res.location != "/login" {
				fail("no redirect to /login")
			}
		} else if res.status != http.StatusOK || !has(loginRedirect) {
			fail("no /login redirect in the payload")
		}
	case forbidden:
		if res.status != http.StatusOK || !has(deniedMark) || has(loginRedirect) {
			fail("no forbidden state")
		}
	case allow:
		if res.status != http.StatusOK || !has(view) || has(deniedMark) || has(loginRedirect) {
			fail("view not rendered")
		}
		if kind != "softnav" && !has(shell) {
			fail("shell not rendered")
		}
	}
}

// checkRoutes requests every (app) route every way for one caller.
func checkRoutes(t *testing.T, base, web string, routes []webRoute, c webCaller) {
	t.Helper()
	for _, rt := range routes {
		view := clientRef(t, web, rt.dir, rt.dir+"/view.tsx")
		shell := clientRef(t, web, rt.dir, "dashboard-shell.tsx")
		for _, rq := range webRequests(rt.path) {
			t.Run(c.name+" "+rq.kind+" "+rt.path, func(t *testing.T) {
				checkWeb(t, fetchPage(t, base, rt.path, c, rq), rq.kind, c.want, view, shell)
			})
		}
	}
}

func TestWebGuardRequiredRole(t *testing.T) {
	t.Setenv("AUTH_ADMIN_CROSS_CONTROL", "true")
	k, svc := bootAccess(t, "admin")
	api := httptest.NewServer(k.Router)
	t.Cleanup(api.Close)
	base := startNext(t, api.URL)
	web := os.Getenv("DASHBOARD_E2E_WEB")

	_, user := newAccount(t, svc, "user", []string{"user"})
	adminID, admin := newAccount(t, svc, "admin", []string{"admin"})
	targetID, _ := newAccount(t, svc, "target", []string{"admin"})
	borrowed := issuedToken(t, doJSON(k, http.MethodPost, "/api/auth/admin/users/"+targetID+"/impersonate", admin, `{}`), http.StatusOK)
	pat := issuedToken(t, doJSON(k, http.MethodPost, "/api/auth/tokens", admin, `{"name":"dash","abilities":["*"]}`), http.StatusCreated)
	forged, err := svc.IssueToken(auth.Identity{ID: "never-existed", Email: "x@example.com", Roles: []string{"admin"}, Guard: "api"})
	if err != nil {
		t.Fatal(err)
	}

	routes := webRoutes(adminID)
	for _, c := range []webCaller{
		{name: "anonymous", want: signin},
		{name: "garbage cookie", cookie: "not-a-token", want: signin},
		{name: "forged admin", cookie: forged, want: signin},
		{name: "admin PAT as cookie", cookie: pat, want: signin},
		{name: "admin PAT as bearer", bearer: pat, want: signin},
		{name: "user", cookie: user, want: forbidden},
		{name: "user with admin PAT bearer", cookie: user, bearer: pat, want: forbidden},
		{name: "impersonated admin", cookie: borrowed, want: forbidden},
		{name: "admin", cookie: admin, want: allow},
	} {
		checkRoutes(t, base, web, routes, c)
	}

	// The public auth pages are outside the guard.
	if res := fetchPage(t, base, "/login", webCaller{}, webRequests("/login")[0]); res.status != http.StatusOK {
		t.Fatalf("/login: got %d, want 200", res.status)
	}
}

// Revocation takes effect on the next request of any kind: the pages are dynamic and each one
// asks the API, which reads roles from the database.
func TestWebGuardRevocation(t *testing.T) {
	k, svc := bootAccess(t, "admin")
	api := httptest.NewServer(k.Router)
	t.Cleanup(api.Close)
	base := startNext(t, api.URL)
	web := os.Getenv("DASHBOARD_E2E_WEB")

	_, remover := newAccount(t, svc, "remover", []string{"admin"})
	id, token := newAccount(t, svc, "revoked", []string{"admin"})
	routes := webRoutes(id)
	checkRoutes(t, base, web, routes, webCaller{name: "admin", cookie: token, want: allow})

	if err := svc.SetRoles(t.Context(), id, []string{"user"}); err != nil {
		t.Fatal(err)
	}
	checkRoutes(t, base, web, routes, webCaller{name: "demoted", cookie: token, want: forbidden})

	if got := doJSON(k, http.MethodDelete, "/api/auth/admin/users/"+id, remover, "").Code; got != http.StatusOK {
		t.Fatalf("delete: got %d, want 200", got)
	}
	checkRoutes(t, base, web, routes, webCaller{name: "deleted", cookie: token, want: signin})
}

// Unset keeps the v0.9 behaviour: any signed-in account sees every (app) page.
func TestWebGuardUnsetRole(t *testing.T) {
	k, svc := bootAccess(t, "")
	api := httptest.NewServer(k.Router)
	t.Cleanup(api.Close)
	base := startNext(t, api.URL)
	web := os.Getenv("DASHBOARD_E2E_WEB")

	id, user := newAccount(t, svc, "user", []string{"user"})
	routes := webRoutes(id)
	checkRoutes(t, base, web, routes, webCaller{name: "anonymous", want: signin})
	checkRoutes(t, base, web, routes, webCaller{name: "user", cookie: user, want: allow})
}
