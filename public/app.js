const messagesEl = document.querySelector('#messages')
const form = document.querySelector('#chatForm')
const input = document.querySelector('#messageInput')
const sendButton = document.querySelector('#sendButton')
const stopButton = document.querySelector('#stopButton')
const clearButton = document.querySelector('#clearButton')
const newChatButton = document.querySelector('#newChatButton')
const sessionsList = document.querySelector('#sessionsList')
const sessionCount = document.querySelector('#sessionCount')
const statusEl = document.querySelector('#status')
const sessionLabel = document.querySelector('#sessionLabel')

const STORE_KEY = 'stander-agent-sessions-v1'
let store = loadStore()
let abortController = null

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return {
      activeId: parsed.activeId || '',
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    }
  } catch {
    return { activeId: '', sessions: [] }
  }
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

function createLocalSession(sessionId, title = '新会话') {
  const now = new Date().toISOString()
  return {
    id: sessionId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function getActiveSession() {
  return store.sessions.find((session) => session.id === store.activeId)
}

function setStatus(label, state = 'idle') {
  statusEl.dataset.state = state
  statusEl.querySelector('strong').textContent = label
}

function updateSessionLabel() {
  const active = getActiveSession()
  sessionLabel.textContent = active
    ? `${active.title} · ${active.id.slice(0, 8)}`
    : 'No session selected'
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function ensureEmptyState() {
  if (messagesEl.children.length) {
    return
  }

  messagesEl.innerHTML = `
    <div class="empty-state">
      <div>
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <path d="M40 8 66 23v34L40 72 14 57V23L40 8Z" />
          <path d="M29 34h22M29 45h14" />
        </svg>
        <h2>开始对话</h2>
        <p>点击左侧加号创建会话，然后直接提问。也可以用 $code-review 触发 skill。</p>
      </div>
    </div>
  `
}

function removeEmptyState() {
  const empty = messagesEl.querySelector('.empty-state')
  if (empty) {
    empty.remove()
  }
}

function renderSessions() {
  sessionsList.innerHTML = ''
  sessionCount.textContent = `${store.sessions.length} active`

  for (const session of store.sessions) {
    const item = document.createElement('button')
    item.className = 'session-item'
    item.type = 'button'
    item.dataset.active = session.id === store.activeId ? 'true' : 'false'
    item.dataset.sessionId = session.id

    const text = document.createElement('span')
    text.className = 'session-text'

    const title = document.createElement('strong')
    title.textContent = session.title

    const meta = document.createElement('small')
    meta.textContent = `${session.messages.length} 条消息`

    const remove = document.createElement('span')
    remove.className = 'session-delete'
    remove.title = '删除会话'
    remove.setAttribute('role', 'button')
    remove.setAttribute('aria-label', `删除 ${session.title}`)
    remove.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    `

    text.append(title, meta)
    item.append(text, remove)
    sessionsList.append(item)
  }
}

function renderMessages() {
  messagesEl.innerHTML = ''
  const active = getActiveSession()

  if (!active) {
    ensureEmptyState()
    return
  }

  for (const message of active.messages) {
    if (message.role === 'tool') {
      addToolRow(message.name, false)
    } else {
      createMessage(message.role, message.text, false)
    }
  }

  ensureEmptyState()
  scrollToBottom()
}

function syncUi() {
  renderSessions()
  renderMessages()
  updateSessionLabel()
  saveStore()
}

function createMessage(role, text = '', persist = true) {
  removeEmptyState()

  const wrapper = document.createElement('article')
  wrapper.className = `message ${role}`

  const label = document.createElement('div')
  label.className = 'message-label'
  label.textContent = role === 'user' ? 'You' : 'Agent'

  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  bubble.textContent = text

  wrapper.append(label, bubble)
  messagesEl.append(wrapper)
  scrollToBottom()

  if (persist) {
    const active = getActiveSession()
    if (active) {
      active.messages.push({ role, text })
      active.updatedAt = new Date().toISOString()
      saveStore()
      renderSessions()
    }
  }

  return bubble
}

function updatePersistedAssistantText(bubble) {
  const active = getActiveSession()
  if (!active) {
    return
  }

  const lastAssistant = [...active.messages]
    .reverse()
    .find((message) => message.role === 'assistant')

  if (lastAssistant) {
    lastAssistant.text = bubble.textContent
    active.updatedAt = new Date().toISOString()
    saveStore()
  }
}

function addToolRow(name, persist = true) {
  removeEmptyState()

  const row = document.createElement('div')
  row.className = 'tool-row'
  row.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.7 6.3 3 3M5 19l5.8-5.8M15 4l5 5-8.5 8.5H6.5V12.5L15 4Z" />
    </svg>
    <span></span>
  `
  row.querySelector('span').textContent = `调用工具：${name}`
  messagesEl.append(row)
  scrollToBottom()

  if (persist) {
    const active = getActiveSession()
    if (active) {
      active.messages.push({ role: 'tool', name })
      active.updatedAt = new Date().toISOString()
      saveStore()
    }
  }
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy
  input.disabled = isBusy
  stopButton.hidden = !isBusy
  setStatus(isBusy ? 'Running' : 'Idle', isBusy ? 'busy' : 'idle')
}

function resizeInput() {
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`
}

function parseSseChunk(buffer, onEvent) {
  const events = buffer.split('\n\n')
  const rest = events.pop() || ''

  for (const block of events) {
    let eventName = 'message'
    let data = ''

    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim()
      }
    }

    if (data) {
      onEvent(eventName, JSON.parse(data))
    }
  }

  return rest
}

async function createSession() {
  const response = await fetch('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const { sessionId } = await response.json()
  const sessionNumber = store.sessions.length + 1
  const session = createLocalSession(sessionId, `会话 ${sessionNumber}`)
  store.sessions.unshift(session)
  store.activeId = session.id
  syncUi()
  input.focus()
}

async function deleteSession(sessionId) {
  if (abortController && sessionId === store.activeId) {
    abortController.abort()
  }

  await fetch(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  }).catch(() => undefined)

  store.sessions = store.sessions.filter((session) => session.id !== sessionId)

  if (store.activeId === sessionId) {
    store.activeId = store.sessions[0]?.id || ''
  }

  syncUi()
}

function activateSession(sessionId) {
  if (abortController) {
    return
  }

  store.activeId = sessionId
  syncUi()
  input.focus()
}

function ensureSessionTitle(message) {
  const active = getActiveSession()
  if (!active || active.messages.length > 1 || active.title !== '新会话') {
    return
  }

  active.title = message.slice(0, 18)
  saveStore()
  renderSessions()
  updateSessionLabel()
}

async function ensureActiveSession() {
  if (getActiveSession()) {
    return getActiveSession()
  }

  await createSession()
  return getActiveSession()
}

async function sendMessage(message) {
  const active = await ensureActiveSession()
  if (!active) {
    return
  }

  abortController = new AbortController()
  setBusy(true)

  createMessage('user', message)
  ensureSessionTitle(message)
  const assistantBubble = createMessage('assistant', '')

  try {
    const response = await fetch('/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId: active.id }),
      signal: abortController.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = parseSseChunk(buffer, (eventName, data) => {
        if (eventName === 'text') {
          assistantBubble.textContent += data.text
          updatePersistedAssistantText(assistantBubble)
          scrollToBottom()
        } else if (eventName === 'tool_use') {
          addToolRow(data.name)
        }
      })
    }

    if (!assistantBubble.textContent.trim()) {
      assistantBubble.textContent = '没有收到文本响应。'
      updatePersistedAssistantText(assistantBubble)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      assistantBubble.textContent += '\n[已停止]'
      updatePersistedAssistantText(assistantBubble)
    } else {
      setStatus('Error', 'error')
      assistantBubble.textContent = `请求失败：${error.message}`
      updatePersistedAssistantText(assistantBubble)
    }
  } finally {
    abortController = null
    setBusy(false)
    input.focus()
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const message = input.value.trim()
  if (!message || abortController) {
    return
  }

  input.value = ''
  resizeInput()
  sendMessage(message)
})

input.addEventListener('input', resizeInput)

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    form.requestSubmit()
  }
})

stopButton.addEventListener('click', () => {
  abortController?.abort()
})

clearButton.addEventListener('click', () => {
  const active = getActiveSession()
  if (!active) {
    return
  }

  active.messages = []
  active.updatedAt = new Date().toISOString()
  syncUi()
})

newChatButton.addEventListener('click', () => {
  createSession().catch((error) => {
    setStatus('Error', 'error')
    console.error(error)
  })
})

sessionsList.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.session-delete')
  const item = event.target.closest('.session-item')

  if (!item) {
    return
  }

  const sessionId = item.dataset.sessionId

  if (deleteButton) {
    deleteSession(sessionId)
    return
  }

  activateSession(sessionId)
})

if (!store.sessions.length) {
  createSession().catch(() => {
    syncUi()
  })
} else {
  syncUi()
}

resizeInput()
