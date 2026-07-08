import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { deriveModelContext } from './context-projection'
import { allowsSelfSignedCertificates, createProviderFetch } from './model-provider-tls'
import { composePlatformPrompt } from './prompt'
import { createSessionEvent } from './session-events'
import type { AgentConfig, SessionEvent } from './types'

function agentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const timestamp = '2026-07-08T00:00:00.000Z'
  return {
    id: 'agent-1',
    name: 'Test Agent',
    modelId: 'test-model',
    baseURL: 'http://localhost:1234/v1',
    systemPrompt: 'Base system prompt.',
    tools: [],
    skills: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function eventBase(type: SessionEvent['type']) {
  return {
    type,
    eventId: randomUUID(),
    sessionId: 'session-1',
    createdAt: '2026-07-08T00:00:00.000Z',
  }
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('composePlatformPrompt returns the agent system prompt when no prompt fragments exist', () => {
  const prompt = composePlatformPrompt({ agent: agentConfig() })

  assert.equal(prompt, 'Base system prompt.')
})

test('composePlatformPrompt includes default and triggered skills with triggered precedence', () => {
  const prompt = composePlatformPrompt({
    agent: agentConfig(),
    defaultSkills: [
      { name: 'review', content: 'Default review instructions.' },
      { name: 'frontend', content: 'Frontend instructions.' },
    ],
    triggeredSkills: [
      { name: 'review', content: 'Triggered review instructions.' },
    ],
  })

  assert.match(prompt, /Base system prompt\./)
  assert.match(prompt, /默认启用的 skills/)
  assert.match(prompt, /本轮用户显式触发的 skills/)
  assert.match(prompt, /## Skill: frontend/)
  assert.match(prompt, /## Skill: review/)
  assert.match(prompt, /Triggered review instructions\./)
  assert.doesNotMatch(prompt, /Default review instructions\./)
})

test('deriveModelContext projects user and final assistant messages while ignoring deltas and tools', () => {
  const events: SessionEvent[] = [
    { ...eventBase('user.message'), type: 'user.message', text: 'Hello' },
    { ...eventBase('agent.text_delta'), type: 'agent.text_delta', text: 'Hel' },
    { ...eventBase('agent.tool_use'), type: 'agent.tool_use', name: 'read_file', toolUseId: 'tool-1', input: { path: 'a.txt' } },
    { ...eventBase('agent.tool_result'), type: 'agent.tool_result', name: 'read_file', toolUseId: 'tool-1', result: 'content' },
    { ...eventBase('agent.message'), type: 'agent.message', text: 'Hi there' },
  ]

  assert.deepEqual(deriveModelContext(events), {
    messages: [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there' },
    ],
  })
})

test('deriveModelContext supports legacy events without event ids', () => {
  const events: SessionEvent[] = [
    { type: 'user.message', sessionId: 'session-1', text: 'Legacy hello', createdAt: '2026-07-08T00:00:00.000Z' },
    { type: 'agent.message', sessionId: 'session-1', text: 'Legacy answer', createdAt: '2026-07-08T00:00:01.000Z' },
  ]

  assert.deepEqual(deriveModelContext(events).messages, [
    { role: 'user', text: 'Legacy hello' },
    { role: 'assistant', text: 'Legacy answer' },
  ])
})

test('deriveModelContext replaces compacted earlier messages with a summary marker', () => {
  const events: SessionEvent[] = [
    { ...eventBase('user.message'), type: 'user.message', text: 'Old user' },
    { ...eventBase('agent.message'), type: 'agent.message', text: 'Old assistant' },
    {
      ...eventBase('agent.thread_context_compacted'),
      type: 'agent.thread_context_compacted',
      summary: 'Earlier conversation summary.',
      compactedEventCount: 2,
      reason: 'manual',
    },
    { ...eventBase('user.message'), type: 'user.message', text: 'New user' },
  ]

  assert.deepEqual(deriveModelContext(events).messages, [
    { role: 'assistant', text: '<conversation-summary>\nEarlier conversation summary.\n</conversation-summary>' },
    { role: 'user', text: 'New user' },
  ])
})

test('createSessionEvent adds event ids without overwriting existing ids', () => {
  const withoutId: SessionEvent = {
    type: 'user.message',
    sessionId: 'session-1',
    text: 'Needs id',
    createdAt: '2026-07-08T00:00:00.000Z',
  }
  const withId: SessionEvent = {
    type: 'agent.message',
    eventId: 'event-existing',
    sessionId: 'session-1',
    text: 'Already has id',
    createdAt: '2026-07-08T00:00:01.000Z',
  }

  assert.match(createSessionEvent(withoutId).eventId ?? '', /^[0-9a-f-]{36}$/)
  assert.equal(createSessionEvent(withId).eventId, 'event-existing')
})

test('provider TLS helper only creates custom fetch when self-signed certificates are explicitly allowed', () => {
  assert.equal(createProviderFetch(undefined), undefined)
  assert.equal(allowsSelfSignedCertificates({ tls: { allowSelfSignedCertificates: false } }), false)
  assert.equal(typeof createProviderFetch({ tls: { allowSelfSignedCertificates: true } }), 'function')
})
