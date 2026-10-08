package dashboard

import (
	"net/http"
	"os"
	"strings"

	"github.com/togo-framework/auth"
	"github.com/togo-framework/togo"
)

// Dashboard access policy.
//
// DASHBOARD_REQUIRED_ROLE is an opt-in policy for the dashboard page group (the web app's
// (app) routes, profile included). Unset, it keeps the v0.9 behaviour: any signed-in account
// may open the dashboard. Set (for example to "admin"), only a first-party session whose
// account currently holds that role may; a personal access token or an impersonated session
// is refused even when its account has the role, exactly as on the mail admin routes.
//
// GET /api/dashboard/access is the decision point. The web app's server layout and every
// (app) page call it with the caller's session cookie and render nothing protected unless it
// answers 204. It only says yes or no: the body never carries the identity. It does not secure
// any other route; each API still enforces its own authorization.
//
// Unsetting the variable on a deployment that had it set is a security downgrade, not a
// rollback.

const (
	requiredRoleEnv = "DASHBOARD_REQUIRED_ROLE"
	accessPath      = "/api/dashboard/access"
)

// requiredRole returns the configured dashboard role, or "" when the policy is off.
func requiredRole() string { return strings.TrimSpace(os.Getenv(requiredRoleEnv)) }

// mountAccessRoute wires GET /api/dashboard/access. Like the mail routes it is a no-op (with
// a warning) when the auth service isn't on the kernel; the web guard then fails closed.
func mountAccessRoute(k *togo.Kernel) {
	svc, ok := auth.FromKernel(k)
	if !ok {
		if k.Log != nil {
			k.Log.Warn("dashboard access check disabled", "reason", "auth service unavailable")
		}
		return
	}
	role := requiredRole()
	k.Router.With(noStore).Get(accessPath, accessHandler(svc, role).ServeHTTP)
	if k.Log != nil {
		policy := "any signed-in account"
		if role != "" {
			policy = "role " + role
		}
		k.Log.Info("dashboard access check active", "route", accessPath, "policy", policy)
	}
}

// accessHandler answers 204 when the caller may use the dashboard. Without a role it needs
// only an authenticated identity (401 otherwise). With a role it composes auth's RequireRole
// (401 anonymous, 403 without the role, roles re-read from the database) with
// refuseBorrowedAdmin (403 for a PAT or an impersonated session).
func accessHandler(svc *auth.Service, role string) http.Handler {
	allow := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	if role == "" {
		return svc.Middleware(allow) // 401 unless a session or token authenticates
	}
	return svc.RequireRole(role)(refuseBorrowedAdmin(allow))
}

// noStore marks every answer, including the guards' 401 and 403, as uncacheable and
// per-user, so no shared cache can replay one caller's decision to another.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, private")
		w.Header().Add("Vary", "Cookie, Authorization")
		next.ServeHTTP(w, r)
	})
}
