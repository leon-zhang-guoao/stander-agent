const storageKey = 'stander-console-ui-v1'

const state = {
  providers: [],
  agents: [],
  tools: [],
  skills: [],
  sessions: [],
  events: [],
  activeProviderId: '',
  activeAgentId: '',
  activeSessionId: '',
  activeTab: 'providers',
  eventSource: null,
  isSending: false,
}

const el = {
  connectionLabel: document.querySelector('#connectionLabel'),
  tabs: [...document.querySelectorAll('.nav-tab')],
  panels: [...document.querySelectorAll('.panel')],
  sessionCount: document.querySelector('#sessionCount'),
  sessionsList: document.querySelector('#sessionsList'),
  createSessionButton: document.querySelector('#createSessionButton'),
  refreshButton: document.querySelector('#refreshButton'),
  agentLabel: document.querySelector('#agentLabel'),
  sessionLabel: document.querySelector('#sessionLabel'),
  streamStatus: document.querySelector('#streamStatus'),
  notice: document.querySelector('#notice'),
  timeline: document.querySelector('#timeline'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  sendButton: document.querySelector('#sendButton'),

  providersList: document.querySelector('#providersList'),
  providerForm: document.querySelector('#providerForm'),
  providerId: document.querySelector('#providerId'),
  providerName: document.querySelector('#providerName'),
  providerType: document.querySelector('#providerType'),
  providerBaseURL: document.querySelector('#providerBaseURL'),
  providerDefaultModelId: document.querySelector('#providerDefaultModelId'),
  providerAvailableModels: document.querySelector('#providerAvailableModels'),
  providerApiKeyRef: document.querySelector('#providerApiKeyRef'),
  providerEnabled: document.querySelector('#providerEnabled'),
  capStreaming: document.querySelector('#capStreaming'),
  capToolCalling: document.querySelector('#capToolCalling'),
  capVision: document.querySelector('#capVision'),
  capJsonMode: document.querySelector('#capJsonMode'),
  capReasoning: document.querySelector('#capReasoning'),
  newProviderButton: document.querySelector('#newProviderButton'),
  testProviderButton: document.querySelector('#testProviderButton'),
  deleteProviderButton: document.querySelector('#deleteProviderButton'),
  providerTestResult: document.querySelector('#providerTestResult'),

  agentsList: document.querySelector('#agentsList'),
  agentForm: document.querySelector('#agentForm'),
  agentId: document.querySelector('#agentId'),
  agentName: document.querySelector('#agentName'),
  agentProviderId: document.querySelector('#agentProviderId'),
  agentModelId: document.querySelector('#agentModelId'),
  agentBaseURL: document.querySelector('#agentBaseURL'),
  agentSystemPrompt: document.querySelector('#agentSystemPrompt'),
  agentTools: document.querySelector('#agentTools'),
  agentSkills: document.querySelector('#agentSkills'),
  newAgentButton: document.querySelector('#newAgentButton'),
  deleteAgentButton: document.querySelector('#deleteAgentButton'),

  toolsList: document.querySelector('#toolsList'),
  skillsList: document.querySelector('#skillsList'),
  skillDetail: document.querySelector('#skillDetail'),
}

function restoreUiState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
    state.activeProviderId = stored.activeProviderId || ''
    state.activeAgentId = stored.activeAgentId || ''
    state.activeSessionId = stored.activeSessionId || ''
    state.activeTab = stored.activeTab || 'providers'
  } catch {
    state.activeTab = 'providers'
  }
}

function persistUiState() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      activeProviderId: state.activeProviderId,
      activeAgentId: state.activeAgentId,
      activeSessionId: state.activeSessionId,
      activeTab: state.activeTab,
    }),
  )
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return data
}

async function loadPlatform() {
  setConnection('正在加载平台数据', 'busy')
  const [providers, agents, tools, skills, sessions] = await Promise.all([
    api('/v1/model-providers'),
    api('/v1/agents'),
    api('/v1/tools'),
    api('/v1/skills'),
    api('/v1/sessions'),
  ])

  state.providers = providers
  state.agents = agents
  state.tools = tools
  state.skills = skills
  state.sessions = sessions
  reconcileSelection()
  renderAll()

  if (state.activeSessionId) {
    await loadEvents(state.activeSessionId)
    connectEventStream(state.activeSessionId)
  }

  setConnection('平台已连接', 'ok')
}

function reconcileSelection() {
  if (!state.providers.some((provider) => provider.id === state.activeProviderId)) {
    state.activeProviderId = state.providers[0]?.id || ''
  }
  if (!state.agents.some((agent) => agent.id === state.activeAgentId)) {
    state.activeAgentId = state.agents[0]?.id || ''
  }
  if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0]?.id || ''
  }
  persistUiState()
}

function renderAll() {
  renderTabs()
  renderProviders()
  renderProviderForm()
  renderAgents()
  renderAgentForm()
  renderRegistries()
  renderSessions()
  renderWorkspaceHeader()
  renderTimeline()
}

function setConnection(text, stateName = 'idle') {
  el.connectionLabel.textContent = text
  el.connectionLabel.dataset.state = stateName
}

function setStreamStatus(text, stateName = 'idle') {
  el.streamStatus.dataset.state = stateName
  el.streamStatus.querySelector('strong').textContent = text
}

function showNotice(message, tone = 'info') {
  el.notice.hidden = false
  el.notice.dataset.tone = tone
  el.notice.textContent = message
}

function clearNotice() {
  el.notice.hidden = true
  el.notice.textContent = ''
}

function renderTabs() {
  for (const tab of el.tabs) {
    tab.dataset.active = tab.dataset.tab === state.activeTab ? 'true' : 'false'
  }
  for (const panel of el.panels) {
    panel.hidden = panel.dataset.panel !== state.activeTab
  }
}

function renderProviders() {
  el.providersList.innerHTML = ''

  if (!state.providers.length) {
    el.providersList.append(emptyBlock('暂无 provider，请先创建一个模型供应商。'))
    return
  }

  for (const provider of state.providers) {
    const item = entityButton({
      id: provider.id,
      title: provider.name,
      meta: `${provider.type} · ${provider.enabled ? 'enabled' : 'disabled'}`,
      active: provider.id === state.activeProviderId,
    })
    item.addEventListener('click', () => {
      state.activeProviderId = provider.id
      state.activeTab = 'providers'
      persistUiState()
      renderAll()
    })
    el.providersList.append(item)
  }
}

function renderProviderForm() {
  const provider = getActiveProvider()
  el.providerId.value = provider?.id || ''
  el.providerName.value = provider?.name || ''
  el.providerType.value = provider?.type || 'openai-compatible'
  el.providerBaseURL.value = provider?.baseURL || ''
  el.providerDefaultModelId.value = provider?.defaultModelId || ''
  el.providerAvailableModels.value = provider?.availableModels?.join('\n') || ''
  el.providerApiKeyRef.value = provider?.apiKeyRef || ''
  el.providerEnabled.checked = provider?.enabled ?? true
  el.capStreaming.checked = provider?.capabilities?.streaming ?? true
  el.capToolCalling.checked = provider?.capabilities?.toolCalling ?? true
  el.capVision.checked = provider?.capabilities?.vision ?? false
  el.capJsonMode.checked = provider?.capabilities?.jsonMode ?? true
  el.capReasoning.checked = provider?.capabilities?.reasoning ?? false
  el.deleteProviderButton.disabled = !provider
  el.testProviderButton.disabled = !provider
  el.providerTestResult.hidden = true
}

function renderAgents() {
  el.agentsList.innerHTML = ''

  if (!state.agents.length) {
    el.agentsList.append(emptyBlock('暂无 agent，创建后即可发起 platform session。'))
    return
  }

  for (const agent of state.agents) {
    const provider = state.providers.find((item) => item.id === agent.modelProviderId)
    const item = entityButton({
      id: agent.id,
      title: agent.name,
      meta: `${agent.modelId} · ${provider?.name || 'legacy baseURL'}`,
      active: agent.id === state.activeAgentId,
    })
    item.addEventListener('click', () => {
      state.activeAgentId = agent.id
      state.activeTab = 'agents'
      persistUiState()
      renderAll()
    })
    el.agentsList.append(item)
  }
}

function renderAgentForm() {
  const agent = getActiveAgent()
  el.agentProviderId.innerHTML = '<option value="">不使用 provider，走 baseURL fallback</option>'
  for (const provider of state.providers) {
    const option = document.createElement('option')
    option.value = provider.id
    option.textContent = `${provider.name}${provider.enabled ? '' : ' (disabled)'}`
    el.agentProviderId.append(option)
  }

  el.agentId.value = agent?.id || ''
  el.agentName.value = agent?.name || ''
  el.agentProviderId.value = agent?.modelProviderId || ''
  el.agentModelId.value = agent?.modelId || getActiveProvider()?.defaultModelId || ''
  el.agentBaseURL.value = agent?.baseURL || getActiveProvider()?.baseURL || ''
  el.agentSystemPrompt.value = agent?.systemPrompt || '你是一个 helpful assistant，请用中文回答。'
  renderChecks(el.agentTools, state.tools, agent?.tools || [], 'tool')
  renderChecks(el.agentSkills, state.skills, agent?.skills || [], 'skill')
  el.deleteAgentButton.disabled = !agent
}

function renderChecks(container, items, selected, kind) {
  container.innerHTML = ''
  if (!items.length) {
    container.append(emptyBlock(`暂无 ${kind}。`))
    return
  }

  for (const item of items) {
    const label = document.createElement('label')
    label.className = 'check-item'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = item.name
    checkbox.checked = selected.includes(item.name)
    const text = document.createElement('span')
    text.textContent = item.name
    label.append(checkbox, text)
    container.append(label)
  }
}

function renderRegistries() {
  el.toolsList.innerHTML = ''
  el.skillsList.innerHTML = ''

  for (const tool of state.tools) {
    const item = document.createElement('article')
    item.className = 'registry-item'
    item.innerHTML = `<strong></strong><p></p>`
    item.querySelector('strong').textContent = tool.name
    item.querySelector('p').textContent = tool.description || '无描述'
    el.toolsList.append(item)
  }

  for (const skill of state.skills) {
    const button = document.createElement('button')
    button.className = 'registry-item registry-button'
    button.type = 'button'
    button.innerHTML = `<strong></strong><p></p>`
    button.querySelector('strong').textContent = skill.name
    button.querySelector('p').textContent = skill.description || '点击查看内容'
    button.addEventListener('click', () => showSkill(skill.name))
    el.skillsList.append(button)
  }

  if (!state.tools.length) {
    el.toolsList.append(emptyBlock('暂无内置 tools。'))
  }
  if (!state.skills.length) {
    el.skillsList.append(emptyBlock('暂无 skills。'))
  }
}

function renderSessions() {
  el.sessionsList.innerHTML = ''
  el.sessionCount.textContent = `${state.sessions.length} 个会话`

  if (!state.sessions.length) {
    el.sessionsList.append(emptyBlock('还没有 session。'))
    return
  }

  for (const session of state.sessions) {
    const agent = state.agents.find((item) => item.id === session.agentId)
    const item = document.createElement('button')
    item.className = 'session-item'
    item.type = 'button'
    item.dataset.active = session.id === state.activeSessionId ? 'true' : 'false'
    item.innerHTML = `
      <span>
        <strong></strong>
        <small></small>
      </span>
      <b></b>
    `
    item.querySelector('strong').textContent = agent?.name || session.agentId
    item.querySelector('small').textContent = `${session.id.slice(0, 8)} · ${formatStatus(session.status)}`
    item.querySelector('b').textContent = session.status
    item.addEventListener('click', async () => {
      state.activeSessionId = session.id
      state.activeAgentId = session.agentId
      persistUiState()
      renderAll()
      await loadEvents(session.id)
      connectEventStream(session.id)
    })
    el.sessionsList.append(item)
  }
}

function renderWorkspaceHeader() {
  const session = getActiveSession()
  const agent = session
    ? state.agents.find((item) => item.id === session.agentId)
    : getActiveAgent()
  el.agentLabel.textContent = agent ? `Agent · ${agent.name}` : '未选择 agent'
  el.sessionLabel.textContent = session
    ? `Session ${session.id.slice(0, 8)}`
    : agent
      ? '尚未创建 session'
      : '选择或创建一个 agent'

  if (!state.providers.length) {
    showNotice('还没有 model provider。右侧先创建 provider，再配置 agent。', 'info')
  } else if (!state.agents.length) {
    showNotice('还没有 agent。右侧创建 agent 后即可新建 session。', 'info')
  } else if (!state.sessions.length) {
    showNotice('还没有 session。点击左侧 + 基于当前 agent 创建 session。', 'info')
  } else if (!state.activeSessionId) {
    showNotice('请选择一个 session 查看事件时间线。', 'info')
  } else {
    clearNotice()
  }
}

function renderTimeline() {
  el.timeline.innerHTML = ''
  if (!state.activeSessionId) {
    el.timeline.append(emptyTimeline('没有 active session。'))
    return
  }

  if (!state.events.length) {
    el.timeline.append(emptyTimeline('该 session 还没有消息事件。'))
    return
  }

  let streamingBubble = null
  let streamingText = ''

  for (const event of state.events) {
    if (event.type === 'agent.text_delta') {
      streamingText += event.text || ''
      if (!streamingBubble) {
        streamingBubble = appendMessageRow('assistant', streamingText, event.createdAt, true)
      } else {
        streamingBubble.textContent = streamingText
      }
      continue
    }

    if (event.type === 'agent.message') {
      if (streamingBubble) {
        streamingBubble.textContent = event.text || streamingText
        streamingBubble.closest('.timeline-row')?.classList.remove('streaming')
        streamingBubble = null
        streamingText = ''
      } else {
        appendMessageRow('assistant', event.text || '', event.createdAt, false)
      }
      continue
    }

    if (streamingBubble && !event.type.startsWith('agent.')) {
      streamingBubble.closest('.timeline-row')?.classList.remove('streaming')
      streamingBubble = null
      streamingText = ''
    }

    if (event.type === 'user.message') {
      appendMessageRow('user', event.text || '', event.createdAt, false)
    } else if (event.type === 'agent.tool_use') {
      appendEventRow('tool', `工具调用：${event.name || 'unknown'}`, event.createdAt)
    } else if (event.type === 'agent.tool_result') {
      appendEventRow('tool-result', `工具完成：${event.name || 'tool result'}`, event.createdAt)
    } else if (event.type === 'session.status_updated') {
      appendEventRow('status', `状态变更：${formatStatus(event.status)}`, event.updatedAt)
    } else if (event.type === 'session.error') {
      appendEventRow('error', `错误：${event.message}`, event.createdAt)
    } else if (event.type === 'session.created') {
      appendEventRow('status', 'Session created', event.createdAt)
    } else if (event.type === 'session.deleted') {
      appendEventRow('status', 'Session deleted', event.deletedAt)
    }
  }

  el.timeline.scrollTop = el.timeline.scrollHeight
}

function appendMessageRow(role, text, timestamp, streaming) {
  const row = document.createElement('article')
  row.className = `timeline-row message-row ${role}${streaming ? ' streaming' : ''}`
  row.innerHTML = `
    <div class="row-meta">
      <strong></strong>
      <time></time>
    </div>
    <div class="message-bubble"></div>
  `
  row.querySelector('strong').textContent = role === 'user' ? 'User' : 'Agent'
  row.querySelector('time').textContent = formatTime(timestamp)
  const bubble = row.querySelector('.message-bubble')
  bubble.textContent = text
  el.timeline.append(row)
  return bubble
}

function appendEventRow(kind, text, timestamp) {
  const row = document.createElement('article')
  row.className = `timeline-row event-row ${kind}`
  row.innerHTML = `
    <div class="row-meta">
      <strong></strong>
      <time></time>
    </div>
    <p></p>
  `
  row.querySelector('strong').textContent = eventTitle(kind)
  row.querySelector('time').textContent = formatTime(timestamp)
  row.querySelector('p').textContent = text
  el.timeline.append(row)
}

function eventTitle(kind) {
  return {
    tool: 'Tool Use',
    'tool-result': 'Tool Result',
    status: 'Status',
    error: 'Error',
  }[kind] || 'Event'
}

function connectEventStream(sessionId) {
  if (state.eventSource) {
    state.eventSource.close()
    state.eventSource = null
  }

  if (!sessionId) {
    setStreamStatus('Idle', 'idle')
    return
  }

  setStreamStatus('Connecting', 'busy')
  const source = new EventSource(`/v1/sessions/${encodeURIComponent(sessionId)}/events/stream`)
  state.eventSource = source

  source.addEventListener('session_event', (event) => {
    if (sessionId !== state.activeSessionId) {
      return
    }
    const payload = JSON.parse(event.data)
    addEvent(payload)
    if (payload.type === 'session.status_updated') {
      updateSessionStatus(payload.sessionId, payload.status)
    }
    renderTimeline()
    renderSessions()
    renderWorkspaceHeader()
  })

  source.addEventListener('ready', () => {
    if (sessionId === state.activeSessionId) {
      setStreamStatus('Live', 'ok')
    }
  })

  source.onerror = () => {
    if (sessionId === state.activeSessionId) {
      setStreamStatus('Disconnected', 'error')
      showNotice('SSE 已断开，可以点击“刷新 events”手动恢复当前 timeline。', 'error')
    }
  }
}

async function loadEvents(sessionId) {
  if (!sessionId) {
    state.events = []
    renderTimeline()
    return
  }
  state.events = await api(`/v1/sessions/${encodeURIComponent(sessionId)}/events`)
  renderTimeline()
}

function addEvent(event) {
  const fingerprint = JSON.stringify(event)
  if (state.events.some((item) => JSON.stringify(item) === fingerprint)) {
    return
  }
  state.events.push(event)
}

async function createSession() {
  const agent = getActiveAgent()
  if (!agent) {
    state.activeTab = 'agents'
    renderAll()
    showNotice('请先创建或选择 agent，再创建 session。', 'error')
    return undefined
  }

  const session = await api('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ agentId: agent.id }),
  })
  state.sessions.unshift(session)
  state.activeSessionId = session.id
  state.activeAgentId = session.agentId
  state.events = []
  persistUiState()
  renderAll()
  await loadEvents(session.id)
  connectEventStream(session.id)
  return session
}

async function ensureActiveSession() {
  const existing = getActiveSession()
  if (existing) {
    return existing
  }
  return createSession()
}

async function sendMessage(message) {
  const session = await ensureActiveSession()
  if (!session) {
    return
  }

  state.isSending = true
  el.sendButton.disabled = true
  setStreamStatus('Running', 'busy')
  clearNotice()

  try {
    const result = await api(`/v1/sessions/${encodeURIComponent(session.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
    for (const event of result.events || []) {
      addEvent(event)
    }
    await refreshSessions()
    setStreamStatus(hasOpenEventStream() ? 'Live' : 'Idle', hasOpenEventStream() ? 'ok' : 'idle')
    renderAll()
  } catch (error) {
    setStreamStatus('Error', 'error')
    showNotice(error.message, 'error')
    await loadEvents(session.id).catch(() => undefined)
  } finally {
    state.isSending = false
    el.sendButton.disabled = false
    el.messageInput.focus()
  }
}

function hasOpenEventStream() {
  return state.eventSource && state.eventSource.readyState === EventSource.OPEN
}

async function refreshSessions() {
  state.sessions = await api('/v1/sessions')
  reconcileSelection()
}

async function saveProvider(event) {
  event.preventDefault()
  const body = {
    name: el.providerName.value.trim(),
    type: el.providerType.value,
    baseURL: el.providerBaseURL.value.trim(),
    capabilities: {
      streaming: el.capStreaming.checked,
      toolCalling: el.capToolCalling.checked,
      vision: el.capVision.checked,
      jsonMode: el.capJsonMode.checked,
      reasoning: el.capReasoning.checked,
    },
    enabled: el.providerEnabled.checked,
  }

  if (!body.name || !body.baseURL) {
    showNotice('Provider 名称和 Base URL 必填。', 'error')
    return
  }

  addOptional(body, 'defaultModelId', el.providerDefaultModelId.value)
  addOptional(body, 'apiKeyRef', el.providerApiKeyRef.value)
  const models = splitList(el.providerAvailableModels.value)
  if (models.length) {
    body.availableModels = models
  }

  const providerId = el.providerId.value
  const provider = providerId
    ? await api(`/v1/model-providers/${encodeURIComponent(providerId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    : await api('/v1/model-providers', {
        method: 'POST',
        body: JSON.stringify(body),
      })

  state.activeProviderId = provider.id
  state.providers = await api('/v1/model-providers')
  persistUiState()
  renderAll()
  showNotice('Provider 已保存。', 'ok')
}

async function saveAgent(event) {
  event.preventDefault()
  const body = {
    name: el.agentName.value.trim(),
    modelId: el.agentModelId.value.trim(),
    baseURL: el.agentBaseURL.value.trim(),
    systemPrompt: el.agentSystemPrompt.value,
    tools: selectedChecks(el.agentTools),
    skills: selectedChecks(el.agentSkills),
    mcpServers: [],
  }

  if (el.agentProviderId.value) {
    body.modelProviderId = el.agentProviderId.value
  }

  if (!body.name || !body.modelId || !body.baseURL) {
    showNotice('Agent 名称、Model ID 和 Base URL fallback 必填。', 'error')
    return
  }

  const agentId = el.agentId.value
  const agent = agentId
    ? await api(`/v1/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    : await api('/v1/agents', {
        method: 'POST',
        body: JSON.stringify(body),
      })

  state.activeAgentId = agent.id
  state.agents = await api('/v1/agents')
  persistUiState()
  renderAll()
  showNotice('Agent 已保存。', 'ok')
}

async function testProvider() {
  const provider = getActiveProvider()
  if (!provider) {
    return
  }
  el.providerTestResult.hidden = false
  el.providerTestResult.textContent = '正在测试连接...'
  const result = await api(`/v1/model-providers/${encodeURIComponent(provider.id)}/test`, {
    method: 'POST',
  })
  el.providerTestResult.textContent = JSON.stringify(result, null, 2)
}

async function deleteProvider() {
  const provider = getActiveProvider()
  if (!provider || !window.confirm(`删除 provider「${provider.name}」？`)) {
    return
  }
  await api(`/v1/model-providers/${encodeURIComponent(provider.id)}`, { method: 'DELETE' })
  state.providers = await api('/v1/model-providers')
  state.activeProviderId = state.providers[0]?.id || ''
  persistUiState()
  renderAll()
}

async function deleteAgent() {
  const agent = getActiveAgent()
  if (!agent || !window.confirm(`删除 agent「${agent.name}」？`)) {
    return
  }
  await api(`/v1/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' })
  state.agents = await api('/v1/agents')
  state.activeAgentId = state.agents[0]?.id || ''
  persistUiState()
  renderAll()
}

async function showSkill(name) {
  const skill = await api(`/v1/skills/${encodeURIComponent(name)}`)
  el.skillDetail.textContent = skill.content
}

function getActiveProvider() {
  return state.providers.find((provider) => provider.id === state.activeProviderId)
}

function getActiveAgent() {
  return state.agents.find((agent) => agent.id === state.activeAgentId)
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId)
}

function selectedChecks(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value)
}

function splitList(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function addOptional(target, key, value) {
  const trimmed = value.trim()
  if (trimmed) {
    target[key] = trimmed
  }
}

function entityButton({ id, title, meta, active }) {
  const button = document.createElement('button')
  button.className = 'entity-item'
  button.type = 'button'
  button.dataset.active = active ? 'true' : 'false'
  button.innerHTML = `
    <strong></strong>
    <small></small>
  `
  button.querySelector('strong').textContent = title || id
  button.querySelector('small').textContent = meta || id
  return button
}

function emptyBlock(text) {
  const block = document.createElement('p')
  block.className = 'empty-block'
  block.textContent = text
  return block
}

function emptyTimeline(text) {
  const block = document.createElement('div')
  block.className = 'empty-timeline'
  block.textContent = text
  return block
}

function formatStatus(status) {
  return {
    idle: 'idle',
    running: 'running',
    error: 'error',
  }[status] || status
}

function formatTime(value) {
  if (!value) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function updateSessionStatus(sessionId, status) {
  const session = state.sessions.find((item) => item.id === sessionId)
  if (session) {
    session.status = status
  }
}

function resizeInput() {
  el.messageInput.style.height = 'auto'
  el.messageInput.style.height = `${Math.min(el.messageInput.scrollHeight, 150)}px`
}

el.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    state.activeTab = tab.dataset.tab
    persistUiState()
    renderTabs()
  })
})

el.providerForm.addEventListener('submit', (event) => {
  saveProvider(event).catch((error) => showNotice(error.message, 'error'))
})
el.agentForm.addEventListener('submit', (event) => {
  saveAgent(event).catch((error) => showNotice(error.message, 'error'))
})
el.newProviderButton.addEventListener('click', () => {
  state.activeProviderId = ''
  persistUiState()
  renderProviderForm()
})
el.newAgentButton.addEventListener('click', () => {
  state.activeAgentId = ''
  persistUiState()
  renderAgentForm()
})
el.testProviderButton.addEventListener('click', () => {
  testProvider().catch((error) => {
    el.providerTestResult.hidden = false
    el.providerTestResult.textContent = error.message
  })
})
el.deleteProviderButton.addEventListener('click', () => {
  deleteProvider().catch((error) => showNotice(error.message, 'error'))
})
el.deleteAgentButton.addEventListener('click', () => {
  deleteAgent().catch((error) => showNotice(error.message, 'error'))
})
el.createSessionButton.addEventListener('click', () => {
  createSession().catch((error) => showNotice(error.message, 'error'))
})
el.refreshButton.addEventListener('click', () => {
  loadEvents(state.activeSessionId)
    .then(() => connectEventStream(state.activeSessionId))
    .catch((error) => showNotice(error.message, 'error'))
})
el.messageForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = el.messageInput.value.trim()
  if (!message || state.isSending) {
    return
  }
  el.messageInput.value = ''
  resizeInput()
  sendMessage(message)
})
el.messageInput.addEventListener('input', resizeInput)
el.messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    el.messageForm.requestSubmit()
  }
})

restoreUiState()
loadPlatform().catch((error) => {
  setConnection('平台连接失败', 'error')
  showNotice(error.message, 'error')
  renderAll()
})
resizeInput()
