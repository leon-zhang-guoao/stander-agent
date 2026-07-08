const storageKey = 'stander-console-ui-v1'

const state = {
  providers: [],
  mcpServers: [],
  agents: [],
  tools: [],
  skills: [],
  sessions: [],
  workflows: [],
  workflowTemplates: [],
  workflowRuns: [],
  events: [],
  platformStatus: null,
  activeProviderId: '',
  activeMcpServerId: '',
  activeAgentId: '',
  activeSessionId: '',
  activeWorkflowId: '',
  activeWorkflowNodeId: '',
  activeTab: 'providers',
  isConnectingWorkflow: false,
  workflowConnectSourceId: '',
  workflowDragEdge: null,
  eventSource: null,
  isSending: false,
  isRunningMultiAgent: false,
}

const el = {
  connectionLabel: document.querySelector('#connectionLabel'),
  platformStatusLabel: document.querySelector('#platformStatusLabel'),
  tabs: [...document.querySelectorAll('.nav-tab')],
  panels: [...document.querySelectorAll('.panel')],
  sessionCount: document.querySelector('#sessionCount'),
  sessionsList: document.querySelector('#sessionsList'),
  createSessionButton: document.querySelector('#createSessionButton'),
  refreshButton: document.querySelector('#refreshButton'),
  agentLabel: document.querySelector('#agentLabel'),
  sessionLabel: document.querySelector('#sessionLabel'),
  streamStatus: document.querySelector('#streamStatus'),
  providersMetric: document.querySelector('#providersMetric'),
  agentsMetric: document.querySelector('#agentsMetric'),
  sessionsMetric: document.querySelector('#sessionsMetric'),
  eventsMetric: document.querySelector('#eventsMetric'),
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
  providerApiKey: document.querySelector('#providerApiKey'),
  providerApiKeyHint: document.querySelector('#providerApiKeyHint'),
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

  mcpServersList: document.querySelector('#mcpServersList'),
  mcpServerForm: document.querySelector('#mcpServerForm'),
  mcpServerId: document.querySelector('#mcpServerId'),
  mcpServerName: document.querySelector('#mcpServerName'),
  mcpServerTransport: document.querySelector('#mcpServerTransport'),
  mcpServerCommand: document.querySelector('#mcpServerCommand'),
  mcpServerArgs: document.querySelector('#mcpServerArgs'),
  mcpServerEnv: document.querySelector('#mcpServerEnv'),
  mcpServerCwd: document.querySelector('#mcpServerCwd'),
  mcpServerUrl: document.querySelector('#mcpServerUrl'),
  mcpServerHeaders: document.querySelector('#mcpServerHeaders'),
  mcpServerEnabled: document.querySelector('#mcpServerEnabled'),
  newMcpServerButton: document.querySelector('#newMcpServerButton'),
  testMcpServerButton: document.querySelector('#testMcpServerButton'),
  loadMcpToolsButton: document.querySelector('#loadMcpToolsButton'),
  deleteMcpServerButton: document.querySelector('#deleteMcpServerButton'),
  mcpServerResult: document.querySelector('#mcpServerResult'),

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
  agentMcpServers: document.querySelector('#agentMcpServers'),
  agentChildAgents: document.querySelector('#agentChildAgents'),
  newAgentButton: document.querySelector('#newAgentButton'),
  deleteAgentButton: document.querySelector('#deleteAgentButton'),

  workflowsList: document.querySelector('#workflowsList'),
  workflowForm: document.querySelector('#workflowForm'),
  workflowId: document.querySelector('#workflowId'),
  workflowName: document.querySelector('#workflowName'),
  workflowDescription: document.querySelector('#workflowDescription'),
  workflowKind: document.querySelector('#workflowKind'),
  addWorkflowNodeButton: document.querySelector('#addWorkflowNodeButton'),
  connectWorkflowNodeButton: document.querySelector('#connectWorkflowNodeButton'),
  deleteWorkflowNodeButton: document.querySelector('#deleteWorkflowNodeButton'),
  workflowCanvas: document.querySelector('#workflowCanvas'),
  workflowEdges: document.querySelector('#workflowEdges'),
  workflowNodes: document.querySelector('#workflowNodes'),
  workflowNodeAgent: document.querySelector('#workflowNodeAgent'),
  workflowNodeLabel: document.querySelector('#workflowNodeLabel'),
  workflowStartNodeLabel: document.querySelector('#workflowStartNodeLabel'),
  workflowStartNode: document.querySelector('#workflowStartNode'),
  workflowMaxSteps: document.querySelector('#workflowMaxSteps'),
  duplicateWorkflowButton: document.querySelector('#duplicateWorkflowButton'),
  deleteWorkflowButton: document.querySelector('#deleteWorkflowButton'),
  exportWorkflowButton: document.querySelector('#exportWorkflowButton'),
  newWorkflowButton: document.querySelector('#newWorkflowButton'),
  workflowTemplatesList: document.querySelector('#workflowTemplatesList'),
  workflowImportJson: document.querySelector('#workflowImportJson'),
  importWorkflowButton: document.querySelector('#importWorkflowButton'),
  workflowRunForm: document.querySelector('#workflowRunForm'),
  workflowRunInput: document.querySelector('#workflowRunInput'),
  workflowRunsList: document.querySelector('#workflowRunsList'),
  runResult: document.querySelector('#runResult'),

  toolsList: document.querySelector('#toolsList'),
  skillsList: document.querySelector('#skillsList'),
  skillDetail: document.querySelector('#skillDetail'),
}

function restoreUiState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
    state.activeProviderId = stored.activeProviderId || ''
    state.activeMcpServerId = stored.activeMcpServerId || ''
    state.activeAgentId = stored.activeAgentId || ''
    state.activeSessionId = stored.activeSessionId || ''
    state.activeWorkflowId = stored.activeWorkflowId || ''
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
      activeMcpServerId: state.activeMcpServerId,
      activeAgentId: state.activeAgentId,
      activeSessionId: state.activeSessionId,
      activeWorkflowId: state.activeWorkflowId,
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
  const [
    status,
    providers,
    mcpServers,
    agents,
    tools,
    skills,
    sessions,
    workflows,
    workflowTemplates,
  ] = await Promise.all([
    api('/v1/platform/status'),
    api('/v1/model-providers'),
    api('/v1/mcp-servers'),
    api('/v1/agents'),
    api('/v1/tools'),
    api('/v1/skills'),
    api('/v1/sessions'),
    api('/v1/workflows'),
    api('/v1/workflow-templates'),
  ])

  state.platformStatus = status
  state.providers = providers
  state.mcpServers = mcpServers
  state.agents = agents
  state.tools = tools
  state.skills = skills
  state.sessions = sessions
  state.workflows = workflows
  state.workflowTemplates = workflowTemplates
  reconcileSelection()
  await loadWorkflowRuns()
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
  if (!state.mcpServers.some((server) => server.id === state.activeMcpServerId)) {
    state.activeMcpServerId = state.mcpServers[0]?.id || ''
  }
  if (!state.agents.some((agent) => agent.id === state.activeAgentId)) {
    state.activeAgentId = state.agents[0]?.id || ''
  }
  if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
    state.activeSessionId = state.sessions[0]?.id || ''
  }
  if (!state.workflows.some((workflow) => workflow.id === state.activeWorkflowId)) {
    state.activeWorkflowId = state.workflows[0]?.id || ''
  }
  const agentIds = new Set(state.agents.map((agent) => agent.id))
  for (const workflow of state.workflows) {
    workflow.nodes = workflow.nodes.filter((node) => !node.agentId || agentIds.has(node.agentId))
    workflow.edges = workflow.edges.filter(
      (edge) =>
        workflow.nodes.some((node) => node.id === edge.sourceNodeId) &&
        workflow.nodes.some((node) => node.id === edge.targetNodeId),
    )
  }
  persistUiState()
}

function renderAll() {
  renderTabs()
  renderPlatformStatus()
  renderMetrics()
  renderProviders()
  renderProviderForm()
  renderMcpServers()
  renderMcpServerForm()
  renderAgents()
  renderAgentForm()
  renderRuns()
  renderRegistries()
  renderSessions()
  renderWorkspaceHeader()
  renderTimeline()
}

function renderPlatformStatus() {
  const status = state.platformStatus
  if (!status) {
    el.platformStatusLabel.textContent = 'persistence: unknown'
    return
  }

  el.platformStatusLabel.textContent = `persistence: ${status.persistence}`
  el.platformStatusLabel.title = status.database || status.dataDir || ''
}

function renderMetrics() {
  el.providersMetric.textContent = String(state.providers.length)
  el.agentsMetric.textContent = String(state.agents.length)
  el.sessionsMetric.textContent = String(state.sessions.length)
  el.eventsMetric.textContent = String(state.events.length)
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
  el.providerApiKey.value = ''
  el.providerApiKeyHint.textContent = provider?.hasApiKey
    ? '已保存本地 API key。留空表示不修改；填写新值会替换当前 key。'
    : '未保存本地 API key。运行和测试会按 apiKeyRef 环境变量、OPENAI_API_KEY 的顺序回退。'
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

function renderMcpServers() {
  el.mcpServersList.innerHTML = ''

  if (!state.mcpServers.length) {
    el.mcpServersList.append(emptyBlock('暂无 MCP server。可先创建本地 stdio 或 streamable-http server。'))
    return
  }

  for (const server of state.mcpServers) {
    const item = entityButton({
      id: server.id,
      title: server.name,
      meta: `${server.transport} · ${server.enabled ? 'enabled' : 'disabled'}`,
      active: server.id === state.activeMcpServerId,
    })
    item.addEventListener('click', () => {
      state.activeMcpServerId = server.id
      state.activeTab = 'mcp'
      persistUiState()
      renderAll()
    })
    el.mcpServersList.append(item)
  }
}

function renderMcpServerForm() {
  const server = getActiveMcpServer()
  el.mcpServerId.value = server?.id || ''
  el.mcpServerName.value = server?.name || ''
  el.mcpServerTransport.value = server?.transport || 'stdio'
  el.mcpServerCommand.value = server?.command || ''
  el.mcpServerArgs.value = server?.args?.join('\n') || ''
  el.mcpServerEnv.value = formatJsonInput(server?.env)
  el.mcpServerCwd.value = server?.cwd || ''
  el.mcpServerUrl.value = server?.url || ''
  el.mcpServerHeaders.value = formatJsonInput(server?.headers)
  el.mcpServerEnabled.checked = server?.enabled ?? true
  el.testMcpServerButton.disabled = !server
  el.loadMcpToolsButton.disabled = !server
  el.deleteMcpServerButton.disabled = !server
  el.mcpServerResult.hidden = true
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
  renderChecks(el.agentMcpServers, state.mcpServers, agent?.mcpServers || [], 'MCP server', {
    valueKey: 'id',
    label: (server) => `${server.name} (${server.transport})`,
  })
  renderChecks(
    el.agentChildAgents,
    state.agents.filter((item) => item.id !== agent?.id),
    agent?.agentTools || [],
    'child agent',
    {
      valueKey: 'id',
      label: (child) => `${child.name} (${child.modelId})`,
    },
  )
  el.deleteAgentButton.disabled = !agent
}

function renderChecks(container, items, selected, kind, options = {}) {
  const valueKey = options.valueKey || 'name'
  const getLabel = options.label || ((item) => item.name)
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
    checkbox.value = item[valueKey]
    checkbox.checked = selected.includes(item[valueKey])
    const text = document.createElement('span')
    text.textContent = getLabel(item)
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

function renderRuns() {
  renderWorkflowList()
  renderWorkflowForm()
  renderWorkflowCanvas()
  renderWorkflowNodeInspector()
  renderWorkflowTemplates()
  renderWorkflowRuns()
}

function renderWorkflowList() {
  el.workflowsList.innerHTML = ''
  if (!state.workflows.length) {
    el.workflowsList.append(emptyBlock('暂无 workflow。点击“新建”创建可复用编排。'))
    return
  }

  for (const workflow of state.workflows) {
    const item = entityButton({
      id: workflow.id,
      title: workflow.name,
      meta: `${workflow.kind} · ${workflow.nodes.length} nodes · ${workflow.edges.length} edges`,
      active: workflow.id === state.activeWorkflowId,
    })
    item.addEventListener('click', () => {
      state.activeWorkflowId = workflow.id
      state.activeWorkflowNodeId = workflow.nodes[0]?.id || ''
      state.workflowConnectSourceId = ''
      persistUiState()
      renderAll()
      loadWorkflowRuns()
        .then(renderRuns)
        .catch((error) => showNotice(error.message, 'error'))
    })
    el.workflowsList.append(item)
  }
}

function renderWorkflowForm() {
  const workflow = getActiveWorkflow()
  el.workflowId.value = workflow?.id || ''
  el.workflowName.value = workflow?.name || ''
  el.workflowDescription.value = workflow?.description || ''
  el.workflowKind.value = workflow?.kind || 'graph'
  el.workflowStartNodeLabel.hidden = el.workflowKind.value !== 'swarm'
  el.workflowMaxSteps.closest('label').hidden = el.workflowKind.value !== 'swarm'
  el.duplicateWorkflowButton.disabled = !workflow
  el.deleteWorkflowButton.disabled = !workflow
  el.addWorkflowNodeButton.disabled = !state.agents.length
  el.connectWorkflowNodeButton.disabled = !workflow || workflow.kind !== 'graph' || workflow.nodes.length < 2
  el.deleteWorkflowNodeButton.disabled = !workflow || !state.activeWorkflowNodeId

  renderWorkflowStartOptions()
}

function renderWorkflowStartOptions() {
  const workflow = getActiveWorkflow()
  el.workflowStartNode.innerHTML = ''
  if (!workflow) {
    return
  }

  for (const node of workflow.nodes) {
    const option = document.createElement('option')
    option.value = node.id
    option.textContent = getWorkflowNodeTitle(node)
    el.workflowStartNode.append(option)
  }
  el.workflowStartNode.value = workflow.startNodeId || workflow.nodes[0]?.id || ''
  el.workflowMaxSteps.value = String(workflow.maxSteps || 4)
}

function renderWorkflowCanvas() {
  const workflow = getActiveWorkflow()
  el.workflowNodes.innerHTML = ''
  el.workflowEdges.innerHTML = ''

  if (!workflow) {
    const empty = document.createElement('div')
    empty.className = 'workflow-empty'
    empty.textContent = state.agents.length
      ? '选择或新建 workflow，然后添加 agent 节点。'
      : '请先创建 agent，再编排 workflow。'
    el.workflowNodes.append(empty)
    return
  }

  const canvasRect = el.workflowCanvas.getBoundingClientRect()
  el.workflowEdges.setAttribute('viewBox', `0 0 ${Math.max(canvasRect.width, 1)} ${Math.max(canvasRect.height, 1)}`)

  for (const edge of workflow.edges) {
    const source = workflow.nodes.find((node) => node.id === edge.sourceNodeId)
    const target = workflow.nodes.find((node) => node.id === edge.targetNodeId)
    if (!source || !target) {
      continue
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(source.position.x + 76))
    line.setAttribute('y1', String(source.position.y + 28))
    line.setAttribute('x2', String(target.position.x + 76))
    line.setAttribute('y2', String(target.position.y + 28))
    line.setAttribute('class', 'workflow-edge-line')
    el.workflowEdges.append(line)
  }

  if (state.workflowDragEdge) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', String(state.workflowDragEdge.x1))
    line.setAttribute('y1', String(state.workflowDragEdge.y1))
    line.setAttribute('x2', String(state.workflowDragEdge.x2))
    line.setAttribute('y2', String(state.workflowDragEdge.y2))
    line.setAttribute('class', 'workflow-edge-line pending')
    el.workflowEdges.append(line)
  }

  for (const node of workflow.nodes) {
    const button = document.createElement('button')
    button.className = 'workflow-node'
    button.type = 'button'
    button.dataset.nodeId = node.id
    button.dataset.active = node.id === state.activeWorkflowNodeId ? 'true' : 'false'
    button.dataset.connecting = node.id === state.workflowConnectSourceId ? 'true' : 'false'
    button.style.left = `${node.position.x}px`
    button.style.top = `${node.position.y}px`
    button.innerHTML = `<strong></strong><small></small><span class="workflow-port" title="拖拽连接到另一个节点"></span>`
    button.querySelector('strong').textContent = getWorkflowNodeTitle(node)
    button.querySelector('small').textContent = getAgentName(node.agentId)
    button.addEventListener('click', () => selectWorkflowNode(node.id))
    button.addEventListener('pointerdown', (event) => startWorkflowNodeDrag(event, node.id))
    button
      .querySelector('.workflow-port')
      .addEventListener('pointerdown', (event) => startWorkflowEdgeDrag(event, node.id))
    el.workflowNodes.append(button)
  }
}

function renderWorkflowNodeInspector() {
  const workflow = getActiveWorkflow()
  const node = getActiveWorkflowNode()
  el.workflowNodeAgent.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = '选择 agent'
  el.workflowNodeAgent.append(placeholder)
  for (const agent of state.agents) {
    const option = document.createElement('option')
    option.value = agent.id
    option.textContent = agent.name
    el.workflowNodeAgent.append(option)
  }
  el.workflowNodeAgent.disabled = !node
  el.workflowNodeLabel.disabled = !node
  el.workflowNodeAgent.value = node?.agentId || ''
  el.workflowNodeLabel.value = node?.label || ''

  if (workflow?.kind === 'swarm' && node && !workflow.startNodeId) {
    workflow.startNodeId = node.id
  }
}

function renderWorkflowTemplates() {
  el.workflowTemplatesList.innerHTML = ''
  if (!state.workflowTemplates.length) {
    el.workflowTemplatesList.append(emptyBlock('暂无 workflow templates。'))
    return
  }

  for (const template of state.workflowTemplates) {
    const item = document.createElement('button')
    item.className = 'template-item'
    item.type = 'button'
    item.innerHTML = `<strong></strong><small></small>`
    item.querySelector('strong').textContent = template.name
    item.querySelector('small').textContent = `${template.kind} · ${template.nodeLabels.join(' -> ')}`
    item.addEventListener('click', () => {
      createWorkflowFromTemplate(template.id).catch((error) => showNotice(error.message, 'error'))
    })
    el.workflowTemplatesList.append(item)
  }
}

function renderWorkflowRuns() {
  el.workflowRunsList.innerHTML = ''
  const workflow = getActiveWorkflow()
  if (!workflow?.id) {
    el.workflowRunsList.append(emptyBlock('保存 workflow 后可查看 run history。'))
    return
  }

  if (!state.workflowRuns.length) {
    el.workflowRunsList.append(emptyBlock('还没有 run history。'))
    return
  }

  for (const run of state.workflowRuns) {
    const item = document.createElement('button')
    item.className = 'run-history-item'
    item.type = 'button'
    item.dataset.status = run.status
    item.innerHTML = `
      <strong></strong>
      <span></span>
      <small></small>
    `
    item.querySelector('strong').textContent = `${run.status} · ${formatTime(run.startedAt)}`
    item.querySelector('span').textContent = run.error || run.outputPreview || run.runId
    item.querySelector('small').textContent = run.completedAt
      ? `completed ${formatTime(run.completedAt)}`
      : run.sessionId
    item.addEventListener('click', () => {
      selectSession(run.sessionId).catch((error) => showNotice(error.message, 'error'))
    })
    el.workflowRunsList.append(item)
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
    const title = session.title || agent?.name || session.agentId
    const kind = session.kind || 'agent'
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
    item.querySelector('strong').textContent = title
    item.querySelector('small').textContent = `${kind} · ${agent?.name || session.agentId} · ${session.id.slice(0, 8)}`
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
  el.agentLabel.textContent = session
    ? `${session.kind || 'agent'} · ${agent?.name || session.agentId}`
    : agent
      ? `Agent · ${agent.name}`
      : '未选择 agent'
  el.sessionLabel.textContent = session
    ? `${session.title || 'Session'} ${session.id.slice(0, 8)}`
    : agent
      ? '尚未创建 session'
      : '选择或创建一个 agent'
  el.messageInput.disabled = Boolean(session && session.kind && session.kind !== 'agent')
  el.sendButton.disabled = state.isSending || Boolean(session && session.kind && session.kind !== 'agent')

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
  renderMetrics()
  const activeSession = getActiveSession()
  const activeWorkflow = getSessionWorkflow(activeSession)
  let nodeResultCount = 0
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
    } else if (event.type === 'multi_agent.run_started') {
      appendEventRow(
        'run',
        `${activeWorkflow?.name || activeSession?.title || event.mode} started · ${event.nodeAgentIds?.length || 0} nodes · ${event.runId}`,
        event.createdAt,
      )
    } else if (event.type === 'multi_agent.node_result') {
      nodeResultCount += 1
      appendEventRow(
        'node-result',
        `${getAgentName(event.nodeId)} · ${event.status}${event.error ? ` · ${event.error}` : ''}${event.output ? `\n${truncateText(event.output, 900)}` : ''}`,
        event.createdAt,
      )
    } else if (event.type === 'multi_agent.run_completed') {
      appendEventRow(
        'run-completed',
        `${activeWorkflow?.name || activeSession?.title || event.mode} completed · ${event.status} · ${nodeResultCount} node results${event.output ? `\n${truncateText(event.output, 1200)}` : ''}`,
        event.createdAt,
      )
    } else if (event.type === 'multi_agent.run_failed') {
      appendEventRow(
        'error',
        `${activeWorkflow?.name || activeSession?.title || event.mode} failed · ${nodeResultCount} node results\n${event.message}`,
        event.createdAt,
      )
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
    run: 'Run',
    'node-result': 'Node Result',
    'run-completed': 'Run Completed',
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

async function runWorkflow(event) {
  event.preventDefault()
  const workflow = getActiveWorkflow()
  const input = el.workflowRunInput.value.trim()
  if (!workflow) {
    showNotice('请先选择或保存 workflow。', 'error')
    return
  }
  if (!input) {
    showNotice('Run input 必填。', 'error')
    return
  }
  const validationError = validateWorkflowBody(buildWorkflowBody())
  if (validationError) {
    showNotice(validationError, 'error')
    return
  }

  await submitWorkflowRun(workflow.id, { input })
}

async function submitWorkflowRun(workflowId, body) {
  if (state.isRunningMultiAgent) {
    return
  }

  state.isRunningMultiAgent = true
  el.runResult.hidden = false
  el.runResult.textContent = '正在运行...'
  clearNotice()

  try {
    const result = await api(`/v1/workflows/${encodeURIComponent(workflowId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    el.runResult.textContent = JSON.stringify(
      {
        sessionId: result.sessionId,
        runId: result.runId,
        status: result.status,
        output: result.output,
        nodeResults: result.nodeResults,
      },
      null,
      2,
    )
    state.sessions = await api('/v1/sessions')
    state.activeSessionId = result.sessionId
    await loadWorkflowRuns()
    const session = getActiveSession()
    state.activeAgentId = session?.agentId || state.activeAgentId
    persistUiState()
    renderAll()
    await loadEvents(result.sessionId)
    connectEventStream(result.sessionId)
    showNotice('Run 已写入 session timeline。', result.status === 'error' ? 'error' : 'ok')
  } finally {
    state.isRunningMultiAgent = false
  }
}

async function saveWorkflow(event) {
  event.preventDefault()
  const workflow = getActiveWorkflow()
  const body = buildWorkflowBody()
  const validationError = validateWorkflowBody(body)
  if (validationError) {
    showNotice(validationError, 'error')
    return
  }

  const saved = workflow?.id
    ? await api(`/v1/workflows/${encodeURIComponent(workflow.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    : await api('/v1/workflows', {
        method: 'POST',
        body: JSON.stringify(body),
      })

  state.workflows = await api('/v1/workflows')
  state.activeWorkflowId = saved.id
  state.activeWorkflowNodeId = saved.nodes[0]?.id || ''
  await loadWorkflowRuns()
  persistUiState()
  renderAll()
  showNotice('Workflow 已保存。', 'ok')
}

function buildWorkflowBody() {
  const workflow = getActiveWorkflow()
  const kind = el.workflowKind.value
  const nodes = workflow?.nodes || []
  const edges = kind === 'graph' ? workflow?.edges || [] : []
  const body = {
    name: el.workflowName.value.trim(),
    description: el.workflowDescription.value.trim(),
    kind,
    nodes,
    edges,
  }

  if (kind === 'swarm') {
    body.startNodeId = el.workflowStartNode.value || nodes[0]?.id
    body.maxSteps = Number(el.workflowMaxSteps.value || 4)
  }

  return body
}

function validateWorkflowBody(body) {
  if (!body.name) {
    return 'Workflow 名称必填。'
  }
  if (!body.nodes.length) {
    return 'Workflow 至少需要一个节点。'
  }
  const missingAgentNode = body.nodes.find((node) => !node.agentId)
  if (missingAgentNode) {
    return `节点「${missingAgentNode.label || missingAgentNode.id}」需要选择 agent。`
  }
  if (body.kind === 'graph' && !body.edges.length) {
    return 'Graph workflow 至少需要一条连线。'
  }
  if (body.kind === 'swarm' && !body.startNodeId) {
    return 'Swarm workflow 需要 start node。'
  }
  return undefined
}

function createDraftWorkflow(kind = 'graph') {
  return {
    id: '',
    name: 'Untitled workflow',
    description: '',
    kind,
    nodes: [],
    edges: [],
    startNodeId: '',
    maxSteps: 4,
    createdAt: '',
    updatedAt: '',
  }
}

function newWorkflow() {
  const draft = createDraftWorkflow()
  state.workflows = [draft, ...state.workflows.filter((workflow) => workflow.id)]
  state.activeWorkflowId = ''
  state.activeWorkflowNodeId = ''
  state.workflowConnectSourceId = ''
  state.activeTab = 'runs'
  persistUiState()
  renderAll()
}

async function loadWorkflowRuns() {
  const workflow = getActiveWorkflow()
  if (!workflow?.id) {
    state.workflowRuns = []
    return
  }

  state.workflowRuns = await api(`/v1/workflows/${encodeURIComponent(workflow.id)}/runs`)
}

async function createWorkflowFromTemplate(templateId) {
  const draft = await api(`/v1/workflow-templates/${encodeURIComponent(templateId)}/create`, {
    method: 'POST',
  })
  state.workflows = [draft, ...state.workflows.filter((workflow) => workflow.id)]
  state.activeWorkflowId = ''
  state.activeWorkflowNodeId = draft.nodes[0]?.id || ''
  state.workflowConnectSourceId = ''
  state.workflowRuns = []
  state.activeTab = 'runs'
  persistUiState()
  renderAll()
  showNotice('Template 已创建为草稿，请为每个节点选择 agent 后保存。', 'ok')
}

async function exportWorkflow() {
  const workflow = getActiveWorkflow()
  if (!workflow?.id) {
    showNotice('请先保存 workflow，再导出 JSON。', 'error')
    return
  }

  const exported = await api(`/v1/workflows/${encodeURIComponent(workflow.id)}/export`)
  const text = JSON.stringify(exported, null, 2)
  el.runResult.hidden = false
  el.runResult.textContent = text
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text).catch(() => undefined)
  }
  showNotice('Workflow export JSON 已生成。', 'ok')
}

async function importWorkflow() {
  const raw = el.workflowImportJson.value.trim()
  if (!raw) {
    showNotice('请先粘贴 workflow JSON。', 'error')
    return
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    showNotice('Import JSON 格式不合法。', 'error')
    return
  }

  const imported = await api('/v1/workflows/import', {
    method: 'POST',
    body: JSON.stringify(parsed),
  })
  state.workflows = await api('/v1/workflows')
  state.activeWorkflowId = imported.id
  state.activeWorkflowNodeId = imported.nodes[0]?.id || ''
  state.workflowRuns = []
  el.workflowImportJson.value = ''
  persistUiState()
  renderAll()
  showNotice('Workflow 已导入。', 'ok')
}

function addWorkflowNode() {
  const workflow = ensureWorkflowDraft()
  const agent = getActiveAgent() || state.agents[0]
  if (!agent) {
    showNotice('请先创建 agent，再添加 workflow node。', 'error')
    return
  }
  const index = workflow.nodes.length
  const node = {
    id: randomId('node'),
    agentId: agent.id,
    label: '',
    position: {
      x: 24 + (index % 2) * 170,
      y: 24 + Math.floor(index / 2) * 94,
    },
  }
  workflow.nodes.push(node)
  if (workflow.kind === 'swarm' && !workflow.startNodeId) {
    workflow.startNodeId = node.id
  }
  state.activeWorkflowNodeId = node.id
  renderRuns()
}

function ensureWorkflowDraft() {
  let workflow = getActiveWorkflow()
  if (!workflow) {
    workflow = createDraftWorkflow()
    state.workflows = [workflow, ...state.workflows]
    state.activeWorkflowId = ''
  }
  return workflow
}

function selectWorkflowNode(nodeId) {
  const workflow = getActiveWorkflow()
  if (!workflow) {
    return
  }

  if (state.isConnectingWorkflow && state.workflowConnectSourceId) {
    if (state.workflowConnectSourceId !== nodeId) {
      addWorkflowEdge(state.workflowConnectSourceId, nodeId)
    }
    state.isConnectingWorkflow = false
    state.workflowConnectSourceId = ''
  } else if (state.isConnectingWorkflow) {
    state.workflowConnectSourceId = nodeId
  }

  state.activeWorkflowNodeId = nodeId
  renderRuns()
}

function startWorkflowNodeDrag(event, nodeId) {
  if (event.target.closest('.workflow-port')) {
    return
  }
  const workflow = getActiveWorkflow()
  const node = workflow?.nodes.find((item) => item.id === nodeId)
  if (!workflow || !node) {
    return
  }
  state.activeWorkflowNodeId = nodeId
  const canvasRect = el.workflowCanvas.getBoundingClientRect()
  const offsetX = event.clientX - canvasRect.left - node.position.x
  const offsetY = event.clientY - canvasRect.top - node.position.y
  event.currentTarget.setPointerCapture(event.pointerId)

  const move = (moveEvent) => {
    node.position.x = Math.max(8, Math.min(canvasRect.width - 164, moveEvent.clientX - canvasRect.left - offsetX))
    node.position.y = Math.max(8, Math.min(canvasRect.height - 64, moveEvent.clientY - canvasRect.top - offsetY))
    renderWorkflowCanvas()
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    renderRuns()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startWorkflowEdgeDrag(event, sourceNodeId) {
  event.preventDefault()
  event.stopPropagation()
  const workflow = getActiveWorkflow()
  const source = workflow?.nodes.find((node) => node.id === sourceNodeId)
  if (!workflow || !source || workflow.kind !== 'graph') {
    return
  }

  const canvasRect = el.workflowCanvas.getBoundingClientRect()
  const start = {
    x: source.position.x + 152,
    y: source.position.y + 28,
  }
  state.activeWorkflowNodeId = sourceNodeId
  state.workflowDragEdge = {
    sourceNodeId,
    x1: start.x,
    y1: start.y,
    x2: event.clientX - canvasRect.left,
    y2: event.clientY - canvasRect.top,
  }
  renderWorkflowCanvas()

  const move = (moveEvent) => {
    state.workflowDragEdge = {
      sourceNodeId,
      x1: start.x,
      y1: start.y,
      x2: moveEvent.clientX - canvasRect.left,
      y2: moveEvent.clientY - canvasRect.top,
    }
    renderWorkflowCanvas()
  }

  const up = (upEvent) => {
    const targetElement = document.elementFromPoint(upEvent.clientX, upEvent.clientY)
    const targetNodeElement = targetElement?.closest?.('.workflow-node')
    const targetNodeId = targetNodeElement?.dataset.nodeId || ''

    if (targetNodeId && targetNodeId !== sourceNodeId) {
      addWorkflowEdge(sourceNodeId, targetNodeId)
    }
    state.workflowDragEdge = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    renderRuns()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function addWorkflowEdge(sourceNodeId, targetNodeId) {
  const workflow = getActiveWorkflow()
  if (!workflow || workflow.kind !== 'graph') {
    return
  }
  const exists = workflow.edges.some(
    (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId,
  )
  if (!exists) {
    workflow.edges.push({
      id: randomId('edge'),
      sourceNodeId,
      targetNodeId,
    })
  }
}

function toggleWorkflowConnectMode() {
  const workflow = getActiveWorkflow()
  if (!workflow || workflow.kind !== 'graph') {
    return
  }
  state.isConnectingWorkflow = !state.isConnectingWorkflow
  state.workflowConnectSourceId = state.isConnectingWorkflow ? state.activeWorkflowNodeId || '' : ''
  renderWorkflowCanvas()
}

function deleteWorkflowNode() {
  const workflow = getActiveWorkflow()
  const nodeId = state.activeWorkflowNodeId
  if (!workflow || !nodeId) {
    return
  }
  workflow.nodes = workflow.nodes.filter((node) => node.id !== nodeId)
  workflow.edges = workflow.edges.filter(
    (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
  )
  if (workflow.startNodeId === nodeId) {
    workflow.startNodeId = workflow.nodes[0]?.id || ''
  }
  state.activeWorkflowNodeId = workflow.nodes[0]?.id || ''
  renderRuns()
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
  addOptional(body, 'apiKey', el.providerApiKey.value)
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
    mcpServers: selectedChecks(el.agentMcpServers),
    agentTools: selectedChecks(el.agentChildAgents),
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

async function saveMcpServer(event) {
  event.preventDefault()
  const body = {
    name: el.mcpServerName.value.trim(),
    transport: el.mcpServerTransport.value,
    enabled: el.mcpServerEnabled.checked,
  }

  if (!body.name) {
    showNotice('MCP server 名称必填。', 'error')
    return
  }

  addOptional(body, 'command', el.mcpServerCommand.value)
  addOptional(body, 'cwd', el.mcpServerCwd.value)
  addOptional(body, 'url', el.mcpServerUrl.value)

  const args = splitList(el.mcpServerArgs.value)
  if (args.length) {
    body.args = args
  }

  const env = parseJsonRecordInput(el.mcpServerEnv.value, 'Env JSON')
  if (env) {
    body.env = env
  }

  const headers = parseJsonRecordInput(el.mcpServerHeaders.value, 'Headers JSON')
  if (headers) {
    body.headers = headers
  }

  if (body.transport === 'stdio' && !body.command) {
    showNotice('stdio MCP server 需要填写 command。', 'error')
    return
  }

  if (body.transport === 'streamable-http' && !body.url) {
    showNotice('streamable-http MCP server 需要填写 URL。', 'error')
    return
  }

  const serverId = el.mcpServerId.value
  const server = serverId
    ? await api(`/v1/mcp-servers/${encodeURIComponent(serverId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    : await api('/v1/mcp-servers', {
        method: 'POST',
        body: JSON.stringify(body),
      })

  state.activeMcpServerId = server.id
  state.mcpServers = await api('/v1/mcp-servers')
  persistUiState()
  renderAll()
  showNotice('MCP server 已保存。', 'ok')
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

async function testMcpServer() {
  const server = getActiveMcpServer()
  if (!server) {
    return
  }
  el.mcpServerResult.hidden = false
  el.mcpServerResult.textContent = '正在测试 MCP 连接...'
  const result = await api(`/v1/mcp-servers/${encodeURIComponent(server.id)}/test`, {
    method: 'POST',
  })
  el.mcpServerResult.textContent = JSON.stringify(result, null, 2)
}

async function loadMcpServerTools() {
  const server = getActiveMcpServer()
  if (!server) {
    return
  }
  el.mcpServerResult.hidden = false
  el.mcpServerResult.textContent = '正在读取 MCP tools...'
  const result = await api(`/v1/mcp-servers/${encodeURIComponent(server.id)}/tools`)
  el.mcpServerResult.textContent = JSON.stringify(result, null, 2)
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

async function deleteMcpServer() {
  const server = getActiveMcpServer()
  if (!server || !window.confirm(`删除 MCP server「${server.name}」？`)) {
    return
  }
  await api(`/v1/mcp-servers/${encodeURIComponent(server.id)}`, { method: 'DELETE' })
  state.mcpServers = await api('/v1/mcp-servers')
  state.activeMcpServerId = state.mcpServers[0]?.id || ''
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

async function duplicateWorkflow() {
  const workflow = getActiveWorkflow()
  if (!workflow) {
    return
  }
  const body = {
    name: `${workflow.name} Copy`,
    description: workflow.description || '',
    kind: workflow.kind,
    nodes: workflow.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: workflow.edges.map((edge) => ({ ...edge })),
    startNodeId: workflow.startNodeId,
    maxSteps: workflow.maxSteps,
  }
  const copy = await api('/v1/workflows', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  state.workflows = await api('/v1/workflows')
  state.activeWorkflowId = copy.id
  state.activeWorkflowNodeId = copy.nodes[0]?.id || ''
  persistUiState()
  renderAll()
  showNotice('Workflow 已复制。', 'ok')
}

async function deleteWorkflow() {
  const workflow = getActiveWorkflow()
  if (!workflow) {
    return
  }
  if (!workflow.id) {
    state.workflows = state.workflows.filter((item) => item !== workflow)
    state.activeWorkflowId = state.workflows[0]?.id || ''
    state.activeWorkflowNodeId = ''
    renderAll()
    return
  }
  if (!window.confirm(`删除 workflow「${workflow.name}」？`)) {
    return
  }
  await api(`/v1/workflows/${encodeURIComponent(workflow.id)}`, { method: 'DELETE' })
  state.workflows = await api('/v1/workflows')
  state.activeWorkflowId = state.workflows[0]?.id || ''
  state.activeWorkflowNodeId = state.workflows[0]?.nodes[0]?.id || ''
  await loadWorkflowRuns()
  persistUiState()
  renderAll()
}

function updateWorkflowNodeFromInspector() {
  const node = getActiveWorkflowNode()
  if (!node) {
    return
  }
  node.agentId = el.workflowNodeAgent.value
  node.label = el.workflowNodeLabel.value.trim()
  renderWorkflowCanvas()
  renderWorkflowStartOptions()
}

async function selectSession(sessionId) {
  state.sessions = await api('/v1/sessions')
  const session = state.sessions.find((item) => item.id === sessionId)
  if (!session) {
    showNotice('Run session 不存在或已被删除。', 'error')
    return
  }

  state.activeSessionId = session.id
  state.activeAgentId = session.agentId || state.activeAgentId
  persistUiState()
  renderAll()
  await loadEvents(session.id)
  connectEventStream(session.id)
  showNotice('已切换到 run session timeline。', 'ok')
}

async function showSkill(name) {
  const skill = await api(`/v1/skills/${encodeURIComponent(name)}`)
  el.skillDetail.textContent = skill.content
}

function getActiveProvider() {
  return state.providers.find((provider) => provider.id === state.activeProviderId)
}

function getActiveMcpServer() {
  return state.mcpServers.find((server) => server.id === state.activeMcpServerId)
}

function getActiveAgent() {
  return state.agents.find((agent) => agent.id === state.activeAgentId)
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId)
}

function getActiveWorkflow() {
  if (state.activeWorkflowId) {
    return state.workflows.find((workflow) => workflow.id === state.activeWorkflowId)
  }
  return state.workflows.find((workflow) => !workflow.id) || undefined
}

function getActiveWorkflowNode() {
  const workflow = getActiveWorkflow()
  return workflow?.nodes.find((node) => node.id === state.activeWorkflowNodeId)
}

function getSessionWorkflow(session) {
  const workflowId = session?.meta?.workflowId
  return workflowId ? state.workflows.find((workflow) => workflow.id === workflowId) : undefined
}

function getWorkflowNodeTitle(node) {
  return node.label || getAgentName(node.agentId) || '未选择 agent'
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

function parseJsonRecordInput(value, label) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} 必须是合法 JSON 对象。`)
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} 必须是 JSON 对象。`)
  }

  for (const [key, val] of Object.entries(parsed)) {
    if (typeof key !== 'string' || typeof val !== 'string') {
      throw new Error(`${label} 的 key 和 value 都必须是字符串。`)
    }
  }

  return parsed
}

function parseJsonArrayInput(value, label) {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} 必须是合法 JSON。`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 数组。`)
  }

  return parsed
}

function formatJsonInput(value) {
  return value ? JSON.stringify(value, null, 2) : ''
}

function getAgentName(agentId) {
  return state.agents.find((agent) => agent.id === agentId)?.name || agentId
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
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
    renderAll()
  })
})

el.providerForm.addEventListener('submit', (event) => {
  saveProvider(event).catch((error) => showNotice(error.message, 'error'))
})
el.mcpServerForm.addEventListener('submit', (event) => {
  saveMcpServer(event).catch((error) => showNotice(error.message, 'error'))
})
el.agentForm.addEventListener('submit', (event) => {
  saveAgent(event).catch((error) => showNotice(error.message, 'error'))
})
el.workflowForm.addEventListener('submit', (event) => {
  saveWorkflow(event).catch((error) => showNotice(error.message, 'error'))
})
el.workflowRunForm.addEventListener('submit', (event) => {
  runWorkflow(event).catch((error) => {
    el.runResult.hidden = false
    el.runResult.textContent = error.message
    showNotice(error.message, 'error')
  })
})
el.newProviderButton.addEventListener('click', () => {
  state.activeProviderId = ''
  persistUiState()
  renderProviderForm()
})
el.newMcpServerButton.addEventListener('click', () => {
  state.activeMcpServerId = ''
  state.activeTab = 'mcp'
  persistUiState()
  renderTabs()
  renderMcpServerForm()
})
el.newAgentButton.addEventListener('click', () => {
  state.activeAgentId = ''
  persistUiState()
  renderAgentForm()
})
el.newWorkflowButton.addEventListener('click', newWorkflow)
el.addWorkflowNodeButton.addEventListener('click', addWorkflowNode)
el.connectWorkflowNodeButton.addEventListener('click', toggleWorkflowConnectMode)
el.deleteWorkflowNodeButton.addEventListener('click', deleteWorkflowNode)
el.duplicateWorkflowButton.addEventListener('click', () => {
  duplicateWorkflow().catch((error) => showNotice(error.message, 'error'))
})
el.exportWorkflowButton.addEventListener('click', () => {
  exportWorkflow().catch((error) => showNotice(error.message, 'error'))
})
el.importWorkflowButton.addEventListener('click', () => {
  importWorkflow().catch((error) => showNotice(error.message, 'error'))
})
el.deleteWorkflowButton.addEventListener('click', () => {
  deleteWorkflow().catch((error) => showNotice(error.message, 'error'))
})
el.workflowKind.addEventListener('change', () => {
  const workflow = ensureWorkflowDraft()
  workflow.kind = el.workflowKind.value
  if (workflow.kind === 'swarm' && !workflow.startNodeId) {
    workflow.startNodeId = workflow.nodes[0]?.id || ''
  }
  renderRuns()
})
el.workflowName.addEventListener('input', () => {
  const workflow = ensureWorkflowDraft()
  workflow.name = el.workflowName.value
  renderWorkflowList()
})
el.workflowDescription.addEventListener('input', () => {
  const workflow = ensureWorkflowDraft()
  workflow.description = el.workflowDescription.value
})
el.workflowStartNode.addEventListener('change', () => {
  const workflow = getActiveWorkflow()
  if (workflow) {
    workflow.startNodeId = el.workflowStartNode.value
  }
})
el.workflowMaxSteps.addEventListener('input', () => {
  const workflow = getActiveWorkflow()
  if (workflow) {
    workflow.maxSteps = Number(el.workflowMaxSteps.value || 4)
  }
})
el.workflowNodeAgent.addEventListener('change', updateWorkflowNodeFromInspector)
el.workflowNodeLabel.addEventListener('input', updateWorkflowNodeFromInspector)
el.testProviderButton.addEventListener('click', () => {
  testProvider().catch((error) => {
    el.providerTestResult.hidden = false
    el.providerTestResult.textContent = error.message
  })
})
el.testMcpServerButton.addEventListener('click', () => {
  testMcpServer().catch((error) => {
    el.mcpServerResult.hidden = false
    el.mcpServerResult.textContent = error.message
  })
})
el.loadMcpToolsButton.addEventListener('click', () => {
  loadMcpServerTools().catch((error) => {
    el.mcpServerResult.hidden = false
    el.mcpServerResult.textContent = error.message
  })
})
el.deleteProviderButton.addEventListener('click', () => {
  deleteProvider().catch((error) => showNotice(error.message, 'error'))
})
el.deleteMcpServerButton.addEventListener('click', () => {
  deleteMcpServer().catch((error) => showNotice(error.message, 'error'))
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
