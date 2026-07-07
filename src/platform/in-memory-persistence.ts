import { randomUUID } from 'node:crypto'
import type { AgentStore } from './agents-store'
import type { EventLog } from './event-log'
import type { Persistence } from './persistence'
import type { SessionStore } from './sessions-store'
import type {
  AgentConfig,
  CreateAgentConfigInput,
  SessionEvent,
  SessionMeta,
  SessionStatus,
  UpdateAgentConfigInput,
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
  }
}

function cloneSession(session: SessionMeta): SessionMeta {
  return { ...session }
}

function cloneEvent(event: SessionEvent): SessionEvent {
  return { ...event }
}

export function createInMemoryPersistence(options: { onEvent?: EventListener } = {}): Persistence {
  const agents = new Map<string, AgentConfig>()
  const sessions = new Map<string, SessionMeta>()
  const events = new Map<string, SessionEvent[]>()

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
        modelId: input.modelId,
        baseURL: input.baseURL,
        systemPrompt: input.systemPrompt,
        tools: [...input.tools],
        skills: [...input.skills],
        mcpServers: input.mcpServers ? [...input.mcpServers] : [],
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
        tools: patch.tools ? [...patch.tools] : existing.tools,
        skills: patch.skills ? [...patch.skills] : existing.skills,
        mcpServers: patch.mcpServers ? [...patch.mcpServers] : existing.mcpServers,
        updatedAt: nowIso(),
      }

      agents.set(id, updated)
      return cloneAgent(updated)
    },

    async delete(id) {
      return agents.delete(id)
    },
  }

  const sessionStore: SessionStore = {
    async create(input) {
      const timestamp = nowIso()
      const session: SessionMeta = {
        id: randomUUID(),
        agentId: input.agentId,
        status: 'idle',
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

  return {
    agents: agentStore,
    sessions: sessionStore,
    events: eventLog,
  }
}
