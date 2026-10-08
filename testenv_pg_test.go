//go:build dashpg

package dashboard

import _ "github.com/jackc/pgx/v5/stdlib" // registers "pgx" for the PostgreSQL run

func init() { pgDriverLinked = true }
