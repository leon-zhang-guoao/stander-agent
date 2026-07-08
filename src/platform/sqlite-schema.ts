import type { DatabaseSync } from 'node:sqlite'

export function initializeSqliteSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      baseURL TEXT NOT NULL,
      apiKeyRef TEXT,
      defaultModelId TEXT,
      availableModels TEXT,
      capabilities TEXT NOT NULL,
      tls TEXT,
      enabled INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      modelProviderId TEXT,
      modelId TEXT NOT NULL,
      baseURL TEXT NOT NULL,
      systemPrompt TEXT NOT NULL,
      tools TEXT NOT NULL,
      skills TEXT NOT NULL,
      mcpServers TEXT NOT NULL,
      agentTools TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args TEXT,
      env TEXT,
      cwd TEXT,
      url TEXT,
      headers TEXT,
      enabled INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'agent',
      status TEXT NOT NULL,
      title TEXT,
      meta TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(sessionId, sequence)
    );

    CREATE INDEX IF NOT EXISTS session_events_session_sequence_idx
      ON session_events(sessionId, sequence);

    CREATE TABLE IF NOT EXISTS secrets (
      ref TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL,
      nodes TEXT NOT NULL,
      edges TEXT NOT NULL,
      startNodeId TEXT,
      maxSteps INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  const sessionColumns = new Set(
    (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  )

  if (!sessionColumns.has('kind')) {
    db.exec("ALTER TABLE sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'agent';")
  }
  if (!sessionColumns.has('title')) {
    db.exec('ALTER TABLE sessions ADD COLUMN title TEXT;')
  }
  if (!sessionColumns.has('meta')) {
    db.exec('ALTER TABLE sessions ADD COLUMN meta TEXT;')
  }

  const providerColumns = new Set(
    (db.prepare('PRAGMA table_info(model_providers)').all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  )

  if (!providerColumns.has('tls')) {
    db.exec('ALTER TABLE model_providers ADD COLUMN tls TEXT;')
  }
}
