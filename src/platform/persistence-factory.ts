import path from 'node:path'
import { createInMemoryPersistence, type EventListener } from './in-memory-persistence'
import type { Persistence } from './persistence'
import { createSqlitePersistence } from './sqlite-persistence'

export type PersistenceMode = 'memory' | 'sqlite'

export type PersistenceFactoryOptions = {
  onEvent?: EventListener
}

function resolvePersistenceMode(): PersistenceMode {
  const rawMode = process.env.PERSISTENCE_MODE ?? 'sqlite'
  return rawMode === 'memory' ? 'memory' : 'sqlite'
}

export function createPlatformPersistence(options: PersistenceFactoryOptions = {}): Persistence {
  const mode = resolvePersistenceMode()
  if (mode === 'memory') {
    return createInMemoryPersistence(options)
  }

  const dataDir = path.resolve(process.cwd(), process.env.STANDER_DATA_DIR ?? '.stander')
  const databasePath = path.resolve(
    process.cwd(),
    process.env.STANDER_DB_PATH ?? path.join(dataDir, 'stander-agent.sqlite'),
  )

  return createSqlitePersistence({
    databasePath,
    dataDir,
    onEvent: options.onEvent,
  })
}
