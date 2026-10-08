package dashboard

import (
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite" // test-only SQLite driver for the kernel DB
)

// pgDriverLinked is set by testenv_pg_test.go (build tag dashpg), which links the pgx driver.
var pgDriverLinked bool

// bootEnv points the kernel at the database under test: SQLite in a temp dir by default, or the
// PostgreSQL database in DASHBOARD_TEST_PG_URL when it is set and the tests are built with
// -tags dashpg. The URL is read from the environment only and is never logged.
func bootEnv(t *testing.T) {
	t.Helper()
	if url := os.Getenv("DASHBOARD_TEST_PG_URL"); url != "" && pgDriverLinked {
		t.Setenv("DB_DRIVER", "pgx")
		t.Setenv("DATABASE_URL", url)
		return
	}
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("DATABASE_URL", "file:"+filepath.Join(t.TempDir(), "t.db")+"?_pragma=busy_timeout(5000)")
}
