// Package dashboard is togo's admin/auth UI plugin. It injects a prism-style
// Next.js suite into the app web/ (login, register, reset, two-factor, lock,
// profile, dashboard) and depends on the auth plugin for the backend, so
// installing dashboard pulls in auth automatically (plugin-depends-on-plugin).
//
// Install: `togo install togo-framework/dashboard`.
package dashboard

import (
	"github.com/togo-framework/togo"

	_ "github.com/togo-framework/auth" // dashboard requires the auth backend
)

func init() {
	togo.RegisterProviderFunc("dashboard", togo.PriorityLate+10, func(k *togo.Kernel) error {
		if k.Log != nil {
			k.Log.Info("dashboard plugin active", "ui", "auth suite injected")
		}
		// Mount the dashboard's own admin surface: SMTP/mail config + test-send.
		// Runs after auth (PriorityLate+5) so the auth service is on the kernel.
		mountMailRoutes(k)
		return nil
	})
}
