import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { EventListener } from './in-memory-persistence'
import type { McpServerStore } from './mcp-servers-store'
import type { ModelProviderStore } from './model-providers-store'
import type { Persistence } from './persistence'
import type { SecretStore } from './secret-store'
import type { SessionStore } from './sessions-store'
import type { WorkflowStore } from './workflows-store'
import { initializeSqliteSchema } from './sqlite-schema'
import type {
  AgentConfig,
  CreateAgentConfigInput,
  CreateMcpServerInput,
  CreateModelProviderInput,
  CreateWorkflowInput,
  McpServerConfig,
  ModelProviderCapabilities,
  ModelProviderConfig,
  ModelProviderType,
  SessionEvent,
  SessionKind,
  SessionMeta,
  SessionStatus,
  UpdateAgentConfigInput,
  UpdateMcpServerInput,
  UpdateModelProviderInput,
  UpdateWorkflowInput,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from './types'

type SqlitePersistenceOptions = {
  databasePath: string
  dataDir?: string
  onEvent?: EventListener
}

type Row = Record<string, unknown>

function nowIso() {
  return new Date().toISOString()
}

function json<T>(value: T) {
  return JSON.stringify(value)
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) {
    return fallback
  }

  return JSON.parse(value) as T
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function requiredString(value: unknown) {
  return String(value)
}

function boolValue(value: unknown) {
  return Boolean(value)
}

function cloneAgent(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    tools: [...agent.tools],
    skills: [...agent.skills],
    mcpServers: agent.mcpServers ? [...agent.mcpServers] : undefined,
    agentTools: agent.agentTools ? [...agent.agentTools] : undefined,
  }
}

function cloneModelProvider(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    ...provider,
    availableModels: provider.availableModels ? [...provider.availableModels] : undefined,
    capabilities: { ...provider.capabilities },
    tls: provider.tls ? { ...provider.tls } : undefined,
  }
}

function sanitizeModelProvider(provider: ModelProviderConfig): ModelProviderConfig {
  const clone = cloneModelProvider(provider)
  const hasApiKey = Boolean(clone.apiKey)
  delete clone.apiKey
  return {
    ...clone,
    hasApiKey,
  }
}

function cloneMcpServer(server: McpServerConfig): McpServerConfig {
  return {
    ...server,
    args: server.args ? [...server.args] : undefined,
    env: server.env ? { ...server.env } : undefined,
    headers: server.headers ? { ...server.headers } : undefined,
  }
}

function cloneSession(session: SessionMeta): SessionMeta {
  return {
    ...session,
    meta: session.meta ? { ...session.meta } : undefined,
  }
}

function cloneEvent(event: SessionEvent): SessionEvent {
  return { ...event }
}

function cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
    })),
    edges: workflow.edges.map((edge) => ({ ...edge })),
  }
}

function eventTimestamp(event: SessionEvent) {
  if ('createdAt' in event) {
    return event.createdAt
  }
  if ('updatedAt' in event) {
    return event.updatedAt
  }
  if ('deletedAt' in event) {
    return event.deletedAt
  }
  return nowIso()
}

function mapAgent(row: Row): AgentConfig {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    modelProviderId: stringValue(row.modelProviderId),
    modelId: requiredString(row.modelId),
    baseURL: requiredString(row.baseURL),
    systemPrompt: requiredString(row.systemPrompt),
    tools: parseJson<string[]>(row.tools, []),
    skills: parseJson<string[]>(row.skills, []),
    mcpServers: parseJson<string[]>(row.mcpServers, []),
    agentTools: parseJson<string[]>(row.agentTools, []),
    createdAt: requiredString(row.createdAt),
    updatedAt: requiredString(row.updatedAt),
  }
}

function mapProvider(row: Row, apiKey?: string): ModelProviderConfig {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    type: requiredString(row.type) as ModelProviderType,
    baseURL: requiredString(row.baseURL),
    apiKey,
    apiKeyRef: stringValue(row.apiKeyRef),
    defaultModelId: stringValue(row.defaultModelId),
    availableModels: parseJson<string[] | undefined>(row.availableModels, undefined),
    capabilities: parseJson<ModelProviderCapabilities>(row.capabilities, {
      streaming: true,
      toolCalling: true,
      vision: false,
      jsonMode: true,
      reasoning: false,
    }),
    tls: parseJson<ModelProviderConfig['tls'] | undefined>(row.tls, undefined),
    enabled: boolValue(row.enabled),
    createdAt: requiredString(row.createdAt),
    updatedAt: requiredString(row.updatedAt),
  }
}

function mapMcpServer(row: Row): McpServerConfig {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    transport: row.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
    command: stringValue(row.command),
    args: parseJson<string[] | undefined>(row.args, undefined),
    env: parseJson<Record<string, string> | undefined>(row.env, undefined),
    cwd: stringValue(row.cwd),
    url: stringValue(row.url),
    headers: parseJson<Record<string, string> | undefined>(row.headers, undefined),
    enabled: boolValue(row.enabled),
    createdAt: requiredString(row.createdAt),
    updatedAt: requiredString(row.updatedAt),
  }
}

function mapSession(row: Row): SessionMeta {
  return {
    id: requiredString(row.id),
    agentId: requiredString(row.agentId),
    kind: (stringValue(row.kind) ?? 'agent') as SessionKind,
    status: requiredString(row.status) as SessionStatus,
    title: stringValue(row.title),
    meta: parseJson<Record<string, unknown> | undefined>(row.meta, undefined),
    createdAt: requiredString(row.createdAt),
    updatedAt: requiredString(row.updatedAt),
  }
}

function mapWorkflow(row: Row): WorkflowDefinition {
  return {
    id: requiredString(row.id),
    name: requiredString(row.name),
    description: stringValue(row.description),
    kind: requiredString(row.kind) === 'swarm' ? 'swarm' : 'graph',
    nodes: parseJson<WorkflowNode[]>(row.nodes, []),
    edges: parseJson<WorkflowEdge[]>(row.edges, []),
    startNodeId: stringValue(row.startNodeId),
    maxSteps: row.maxSteps === null || row.maxSteps === undefined ? undefined : Number(row.maxSteps),
    createdAt: requiredString(row.createdAt),
    updatedAt: requiredString(row.updatedAt),
  }
}

function mapEvent(row: Row): SessionEvent {
  return parseJson<SessionEvent>(row.payload, {
    type: 'session.error',
    sessionId: requiredString(row.sessionId),
    message: 'Invalid persisted event',
    createdAt: requiredString(row.createdAt),
  })
}

export function createSqlitePersistence(options: SqlitePersistenceOptions): Persistence {
  fs.mkdirSync(path.dirname(options.databasePath), { recursive: true })
  const db = new DatabaseSync(options.databasePath)
  initializeSqliteSchema(db)

  const getProviderSecretRef = (providerId: string) => `model-provider:${providerId}:apiKey`

  const secretStore: SecretStore = {
    async put(ref, value) {
      db.prepare(`
        INSERT INTO secrets (ref, value, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(ref) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).run(ref, value, nowIso())
    },

    async get(ref) {
      const row = db.prepare('SELECT value FROM secrets WHERE ref = ?').get(ref) as Row | undefined
      return row ? requiredString(row.value) : undefined
    },

    async delete(ref) {
      return db.prepare('DELETE FROM secrets WHERE ref = ?').run(ref).changes > 0
    },
  }

  const eventLog: EventLog = {
    async append(sessionId, event) {
      const nextSequenceRow = db
        .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM session_events WHERE sessionId = ?')
        .get(sessionId) as Row
      const sequence = Number(nextSequenceRow.sequence)
      const storedEvent = cloneEvent(event)
      db.prepare(`
        INSERT INTO session_events (id, sessionId, sequence, type, payload, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        sessionId,
        sequence,
        event.type,
        json(storedEvent),
        eventTimestamp(event),
      )
      options.onEvent?.(sessionId, cloneEvent(storedEvent))
    },

    async list(sessionId) {
      const rows = db
        .prepare('SELECT payload, sessionId, createdAt FROM session_events WHERE sessionId = ? ORDER BY sequence ASC')
        .all(sessionId) as Row[]
      return rows.map(mapEvent)
    },
  }

  const agentStore: AgentStore = {
    async create(input: CreateAgentConfigInput) {
      const timestamp = nowIso()
      const agent: AgentConfig = {
        id: randomUUID(),
        name: input.name,
        modelProviderId: input.modelProviderId,
        modelId: input.modelId,
        baseURL: input.baseURL,
        systemPrompt: input.systemPrompt,
        tools: [...input.tools],
        skills: [...input.skills],
        mcpServers: input.mcpServers ? [...input.mcpServers] : [],
        agentTools: input.agentTools ? [...input.agentTools] : [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.prepare(`
        INSERT INTO agents (
          id, name, modelProviderId, modelId, baseURL, systemPrompt,
          tools, skills, mcpServers, agentTools, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agent.id,
        agent.name,
        agent.modelProviderId ?? null,
        agent.modelId,
        agent.baseURL,
        agent.systemPrompt,
        json(agent.tools),
        json(agent.skills),
        json(agent.mcpServers ?? []),
        json(agent.agentTools ?? []),
        agent.createdAt,
        agent.updatedAt,
      )
      return cloneAgent(agent)
    },

    async list() {
      const rows = db.prepare('SELECT * FROM agents ORDER BY createdAt DESC').all() as Row[]
      return rows.map((row) => cloneAgent(mapAgent(row)))
    },

    async get(id) {
      const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Row | undefined
      return row ? cloneAgent(mapAgent(row)) : undefined
    },

    async update(id, patch: UpdateAgentConfigInput) {
      const existing = await this.get(id)
      if (!existing) {
        return undefined
      }
      const updated: AgentConfig = {
        ...existing,
        ...patch,
        modelProviderId: patch.modelProviderId ?? existing.modelProviderId,
        tools: patch.tools ? [...patch.tools] : existing.tools,
        skills: patch.skills ? [...patch.skills] : existing.skills,
        mcpServers: patch.mcpServers ? [...patch.mcpServers] : existing.mcpServers,
        agentTools: patch.agentTools ? [...patch.agentTools] : existing.agentTools,
        updatedAt: nowIso(),
      }
      db.prepare(`
        UPDATE agents SET
          name = ?, modelProviderId = ?, modelId = ?, baseURL = ?, systemPrompt = ?,
          tools = ?, skills = ?, mcpServers = ?, agentTools = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.modelProviderId ?? null,
        updated.modelId,
        updated.baseURL,
        updated.systemPrompt,
        json(updated.tools),
        json(updated.skills),
        json(updated.mcpServers ?? []),
        json(updated.agentTools ?? []),
        updated.updatedAt,
        id,
      )
      return cloneAgent(updated)
    },

    async delete(id) {
      return db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes > 0
    },
  }

  const modelProviderStore: ModelProviderStore = {
    async create(input: CreateModelProviderInput) {
      const timestamp = nowIso()
      const provider: ModelProviderConfig = {
        id: randomUUID(),
        name: input.name,
        type: input.type,
        baseURL: input.baseURL,
        apiKeyRef: input.apiKeyRef,
        defaultModelId: input.defaultModelId,
        availableModels: input.availableModels ? [...input.availableModels] : undefined,
        capabilities: { ...input.capabilities },
        tls: input.tls ? { ...input.tls } : undefined,
        enabled: input.enabled ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.prepare(`
        INSERT INTO model_providers (
          id, name, type, baseURL, apiKeyRef, defaultModelId,
          availableModels, capabilities, tls, enabled, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        provider.id,
        provider.name,
        provider.type,
        provider.baseURL,
        provider.apiKeyRef ?? null,
        provider.defaultModelId ?? null,
        provider.availableModels ? json(provider.availableModels) : null,
        json(provider.capabilities),
        provider.tls ? json(provider.tls) : null,
        provider.enabled ? 1 : 0,
        provider.createdAt,
        provider.updatedAt,
      )
      if (input.apiKey) {
        await secretStore.put(getProviderSecretRef(provider.id), input.apiKey)
      }
      return sanitizeModelProvider({
        ...provider,
        apiKey: input.apiKey,
      })
    },

    async list() {
      const rows = db.prepare('SELECT * FROM model_providers ORDER BY createdAt DESC').all() as Row[]
      const providers = await Promise.all(
        rows.map(async (row) => {
          const provider = mapProvider(row)
          const apiKey = await secretStore.get(getProviderSecretRef(provider.id))
          return sanitizeModelProvider({ ...provider, apiKey })
        }),
      )
      return providers
    },

    async get(id) {
      const row = db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as Row | undefined
      if (!row) {
        return undefined
      }
      const provider = mapProvider(row)
      const apiKey = await secretStore.get(getProviderSecretRef(provider.id))
      return sanitizeModelProvider({ ...provider, apiKey })
    },

    async getWithSecret(id) {
      const row = db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as Row | undefined
      if (!row) {
        return undefined
      }
      const provider = mapProvider(row)
      const apiKey = await secretStore.get(getProviderSecretRef(provider.id))
      return cloneModelProvider({ ...provider, apiKey })
    },

    async update(id, patch: UpdateModelProviderInput) {
      const existing = await this.getWithSecret(id)
      if (!existing) {
        return undefined
      }
      const updated: ModelProviderConfig = {
        ...existing,
        ...patch,
        apiKey: patch.apiKey ?? existing.apiKey,
        capabilities: patch.capabilities ? { ...patch.capabilities } : existing.capabilities,
        tls: patch.tls ? { ...patch.tls } : existing.tls,
        availableModels: patch.availableModels
          ? [...patch.availableModels]
          : existing.availableModels,
        updatedAt: nowIso(),
      }
      db.prepare(`
        UPDATE model_providers SET
          name = ?, type = ?, baseURL = ?, apiKeyRef = ?, defaultModelId = ?,
          availableModels = ?, capabilities = ?, tls = ?, enabled = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.type,
        updated.baseURL,
        updated.apiKeyRef ?? null,
        updated.defaultModelId ?? null,
        updated.availableModels ? json(updated.availableModels) : null,
        json(updated.capabilities),
        updated.tls ? json(updated.tls) : null,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
      )
      if (patch.apiKey) {
        await secretStore.put(getProviderSecretRef(id), patch.apiKey)
      }
      return sanitizeModelProvider(updated)
    },

    async delete(id) {
      await secretStore.delete(getProviderSecretRef(id))
      return db.prepare('DELETE FROM model_providers WHERE id = ?').run(id).changes > 0
    },
  }

  const mcpServerStore: McpServerStore = {
    async create(input: CreateMcpServerInput) {
      const timestamp = nowIso()
      const server: McpServerConfig = {
        id: randomUUID(),
        name: input.name,
        transport: input.transport,
        command: input.command,
        args: input.args ? [...input.args] : undefined,
        env: input.env ? { ...input.env } : undefined,
        cwd: input.cwd,
        url: input.url,
        headers: input.headers ? { ...input.headers } : undefined,
        enabled: input.enabled ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.prepare(`
        INSERT INTO mcp_servers (
          id, name, transport, command, args, env, cwd, url, headers,
          enabled, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        server.id,
        server.name,
        server.transport,
        server.command ?? null,
        server.args ? json(server.args) : null,
        server.env ? json(server.env) : null,
        server.cwd ?? null,
        server.url ?? null,
        server.headers ? json(server.headers) : null,
        server.enabled ? 1 : 0,
        server.createdAt,
        server.updatedAt,
      )
      return cloneMcpServer(server)
    },

    async list() {
      const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY createdAt DESC').all() as Row[]
      return rows.map((row) => cloneMcpServer(mapMcpServer(row)))
    },

    async get(id) {
      const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Row | undefined
      return row ? cloneMcpServer(mapMcpServer(row)) : undefined
    },

    async update(id, patch: UpdateMcpServerInput) {
      const existing = await this.get(id)
      if (!existing) {
        return undefined
      }
      const updated: McpServerConfig = {
        ...existing,
        ...patch,
        args: patch.args ? [...patch.args] : existing.args,
        env: patch.env ? { ...patch.env } : existing.env,
        headers: patch.headers ? { ...patch.headers } : existing.headers,
        updatedAt: nowIso(),
      }
      db.prepare(`
        UPDATE mcp_servers SET
          name = ?, transport = ?, command = ?, args = ?, env = ?, cwd = ?,
          url = ?, headers = ?, enabled = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.transport,
        updated.command ?? null,
        updated.args ? json(updated.args) : null,
        updated.env ? json(updated.env) : null,
        updated.cwd ?? null,
        updated.url ?? null,
        updated.headers ? json(updated.headers) : null,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
      )
      return cloneMcpServer(updated)
    },

    async delete(id) {
      return db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id).changes > 0
    },
  }

  const sessionStore: SessionStore = {
    async create(input) {
      const timestamp = nowIso()
      const session: SessionMeta = {
        id: randomUUID(),
        agentId: input.agentId,
        kind: input.kind ?? 'agent',
        status: 'idle',
        title: input.title,
        meta: input.meta ? { ...input.meta } : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.prepare(`
        INSERT INTO sessions (id, agentId, kind, status, title, meta, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.agentId,
        session.kind,
        session.status,
        session.title ?? null,
        session.meta ? json(session.meta) : null,
        session.createdAt,
        session.updatedAt,
      )
      await eventLog.append(session.id, {
        type: 'session.created',
        sessionId: session.id,
        agentId: session.agentId,
        createdAt: timestamp,
      })
      return cloneSession(session)
    },

    async list() {
      const rows = db.prepare('SELECT * FROM sessions ORDER BY createdAt DESC').all() as Row[]
      return rows.map((row) => cloneSession(mapSession(row)))
    },

    async get(id) {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined
      return row ? cloneSession(mapSession(row)) : undefined
    },

    async updateStatus(id, status: SessionStatus) {
      const existing = await this.get(id)
      if (!existing) {
        return undefined
      }
      const updated: SessionMeta = {
        ...existing,
        status,
        updatedAt: nowIso(),
      }
      db.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?').run(
        updated.status,
        updated.updatedAt,
        id,
      )
      await eventLog.append(id, {
        type: 'session.status_updated',
        sessionId: id,
        status,
        updatedAt: updated.updatedAt,
      })
      return cloneSession(updated)
    },

    async delete(id) {
      const existing = await this.get(id)
      if (!existing) {
        return false
      }
      await eventLog.append(id, {
        type: 'session.deleted',
        sessionId: id,
        deletedAt: nowIso(),
      })
      return db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0
    },
  }

  const workflowStore: WorkflowStore = {
    async create(input: CreateWorkflowInput) {
      const timestamp = nowIso()
      const workflow: WorkflowDefinition = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        kind: input.kind,
        nodes: input.nodes.map((node) => ({
          ...node,
          position: { ...node.position },
        })),
        edges: input.edges.map((edge) => ({ ...edge })),
        startNodeId: input.startNodeId,
        maxSteps: input.maxSteps,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      db.prepare(`
        INSERT INTO workflows (
          id, name, description, kind, nodes, edges,
          startNodeId, maxSteps, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workflow.id,
        workflow.name,
        workflow.description ?? null,
        workflow.kind,
        json(workflow.nodes),
        json(workflow.edges),
        workflow.startNodeId ?? null,
        workflow.maxSteps ?? null,
        workflow.createdAt,
        workflow.updatedAt,
      )
      return cloneWorkflow(workflow)
    },

    async list() {
      const rows = db.prepare('SELECT * FROM workflows ORDER BY createdAt DESC').all() as Row[]
      return rows.map((row) => cloneWorkflow(mapWorkflow(row)))
    },

    async get(id) {
      const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Row | undefined
      return row ? cloneWorkflow(mapWorkflow(row)) : undefined
    },

    async update(id, patch: UpdateWorkflowInput) {
      const existing = await this.get(id)
      if (!existing) {
        return undefined
      }
      const updated: WorkflowDefinition = {
        ...existing,
        ...patch,
        nodes: patch.nodes
          ? patch.nodes.map((node) => ({ ...node, position: { ...node.position } }))
          : existing.nodes,
        edges: patch.edges ? patch.edges.map((edge) => ({ ...edge })) : existing.edges,
        updatedAt: nowIso(),
      }
      db.prepare(`
        UPDATE workflows SET
          name = ?, description = ?, kind = ?, nodes = ?, edges = ?,
          startNodeId = ?, maxSteps = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        updated.name,
        updated.description ?? null,
        updated.kind,
        json(updated.nodes),
        json(updated.edges),
        updated.startNodeId ?? null,
        updated.maxSteps ?? null,
        updated.updatedAt,
        id,
      )
      return cloneWorkflow(updated)
    },

    async delete(id) {
      return db.prepare('DELETE FROM workflows WHERE id = ?').run(id).changes > 0
    },
  }

  return {
    mode: 'sqlite',
    dataDir: options.dataDir,
    databasePath: options.databasePath,
    agents: agentStore,
    modelProviders: modelProviderStore,
    mcpServers: mcpServerStore,
    sessions: sessionStore,
    events: eventLog,
    secrets: secretStore,
    workflows: workflowStore,
  }
}
