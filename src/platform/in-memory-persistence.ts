import { randomUUID } from 'node:crypto'
import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { McpServerStore } from './mcp-servers-store'
import type { ModelProviderStore } from './model-providers-store'
import type { Persistence } from './persistence'
import type { SecretStore } from './secret-store'
import type { SessionStore } from './sessions-store'
import type { WorkflowStore } from './workflows-store'
import type {
  AgentConfig,
  CreateAgentConfigInput,
  CreateMcpServerInput,
  CreateModelProviderInput,
  CreateWorkflowInput,
  ModelProviderConfig,
  McpServerConfig,
  SessionEvent,
  SessionMeta,
  SessionStatus,
  UpdateAgentConfigInput,
  UpdateMcpServerInput,
  UpdateModelProviderInput,
  UpdateWorkflowInput,
  WorkflowDefinition,
} from './types'

export type EventListener = (sessionId: string, event: SessionEvent) => void

function nowIso() {
  return new Date().toISOString()
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

function cloneSession(session: SessionMeta): SessionMeta {
  return {
    ...session,
    meta: session.meta ? { ...session.meta } : undefined,
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

export function createInMemoryPersistence(options: { onEvent?: EventListener } = {}): Persistence {
  const agents = new Map<string, AgentConfig>()
  const modelProviders = new Map<string, ModelProviderConfig>()
  const mcpServers = new Map<string, McpServerConfig>()
  const sessions = new Map<string, SessionMeta>()
  const events = new Map<string, SessionEvent[]>()
  const secrets = new Map<string, string>()
  const workflows = new Map<string, WorkflowDefinition>()

  const eventLog: EventLog = {
    async append(sessionId, event) {
      const storedEvent = cloneEvent(event)
      const existing = events.get(sessionId) ?? []
      existing.push(storedEvent)
      events.set(sessionId, existing)
      options.onEvent?.(sessionId, cloneEvent(storedEvent))
    },

    async list(sessionId) {
      return (events.get(sessionId) ?? []).map(cloneEvent)
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

      agents.set(agent.id, agent)
      return cloneAgent(agent)
    },

    async list() {
      return [...agents.values()].map(cloneAgent)
    },

    async get(id) {
      const agent = agents.get(id)
      return agent ? cloneAgent(agent) : undefined
    },

    async update(id, patch: UpdateAgentConfigInput) {
      const existing = agents.get(id)
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

      agents.set(id, updated)
      return cloneAgent(updated)
    },

    async delete(id) {
      return agents.delete(id)
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
        apiKey: input.apiKey,
        apiKeyRef: input.apiKeyRef,
        defaultModelId: input.defaultModelId,
        availableModels: input.availableModels ? [...input.availableModels] : undefined,
        capabilities: { ...input.capabilities },
        enabled: input.enabled ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      modelProviders.set(provider.id, provider)
      return sanitizeModelProvider(provider)
    },

    async list() {
      return [...modelProviders.values()].map(sanitizeModelProvider)
    },

    async get(id) {
      const provider = modelProviders.get(id)
      return provider ? sanitizeModelProvider(provider) : undefined
    },

    async getWithSecret(id) {
      const provider = modelProviders.get(id)
      return provider ? cloneModelProvider(provider) : undefined
    },

    async update(id, patch: UpdateModelProviderInput) {
      const existing = modelProviders.get(id)
      if (!existing) {
        return undefined
      }

      const updated: ModelProviderConfig = {
        ...existing,
        ...patch,
        apiKey: patch.apiKey ?? existing.apiKey,
        capabilities: patch.capabilities ? { ...patch.capabilities } : existing.capabilities,
        availableModels: patch.availableModels
          ? [...patch.availableModels]
          : existing.availableModels,
        updatedAt: nowIso(),
      }

      modelProviders.set(id, updated)
      return sanitizeModelProvider(updated)
    },

    async delete(id) {
      return modelProviders.delete(id)
    },
  }

  const secretStore: SecretStore = {
    async put(ref, value) {
      secrets.set(ref, value)
    },

    async get(ref) {
      return secrets.get(ref)
    },

    async delete(ref) {
      return secrets.delete(ref)
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

      mcpServers.set(server.id, server)
      return cloneMcpServer(server)
    },

    async list() {
      return [...mcpServers.values()].map(cloneMcpServer)
    },

    async get(id) {
      const server = mcpServers.get(id)
      return server ? cloneMcpServer(server) : undefined
    },

    async update(id, patch: UpdateMcpServerInput) {
      const existing = mcpServers.get(id)
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

      mcpServers.set(id, updated)
      return cloneMcpServer(updated)
    },

    async delete(id) {
      return mcpServers.delete(id)
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

      sessions.set(session.id, session)
      await eventLog.append(session.id, {
        type: 'session.created',
        sessionId: session.id,
        agentId: session.agentId,
        createdAt: timestamp,
      })

      return cloneSession(session)
    },

    async list() {
      return [...sessions.values()].map(cloneSession)
    },

    async get(id) {
      const session = sessions.get(id)
      return session ? cloneSession(session) : undefined
    },

    async updateStatus(id, status: SessionStatus) {
      const existing = sessions.get(id)
      if (!existing) {
        return undefined
      }

      const updatedAt = nowIso()
      const updated: SessionMeta = {
        ...existing,
        status,
        updatedAt,
      }

      sessions.set(id, updated)
      await eventLog.append(id, {
        type: 'session.status_updated',
        sessionId: id,
        status,
        updatedAt,
      })

      return cloneSession(updated)
    },

    async delete(id) {
      const existing = sessions.get(id)
      if (!existing) {
        return false
      }

      const deletedAt = nowIso()
      await eventLog.append(id, {
        type: 'session.deleted',
        sessionId: id,
        deletedAt,
      })

      return sessions.delete(id)
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

      workflows.set(workflow.id, workflow)
      return cloneWorkflow(workflow)
    },

    async list() {
      return [...workflows.values()].map(cloneWorkflow)
    },

    async get(id) {
      const workflow = workflows.get(id)
      return workflow ? cloneWorkflow(workflow) : undefined
    },

    async update(id, patch: UpdateWorkflowInput) {
      const existing = workflows.get(id)
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

      workflows.set(id, updated)
      return cloneWorkflow(updated)
    },

    async delete(id) {
      return workflows.delete(id)
    },
  }

  return {
    mode: 'memory',
    agents: agentStore,
    modelProviders: modelProviderStore,
    mcpServers: mcpServerStore,
    sessions: sessionStore,
    events: eventLog,
    secrets: secretStore,
    workflows: workflowStore,
  }
}
