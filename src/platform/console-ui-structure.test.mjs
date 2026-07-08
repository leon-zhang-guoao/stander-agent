import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync('public/index.html', 'utf8')
const app = readFileSync('public/app.js', 'utf8')
const styles = readFileSync('public/styles.css', 'utf8')

assert.match(html, /data-tab="sessions"/)
assert.match(html, /id="sessionsPanel"[^>]*data-panel="sessions"/)
assert.match(html, /id="sessionAgentSelect"/)
assert.doesNotMatch(html, /<aside class="inspector"/)

assert.match(app, /activeTab:\s*'sessions'/)
assert.match(app, /sessionAgentSelect/)
assert.match(app, /function renderSessionAgentSelect/)

assert.match(styles, /\.main-content/)
assert.match(styles, /\.sessions-workbench/)
assert.match(html, /class="config-workbench"/)
assert.match(styles, /\.panel:not\(\.sessions-panel\) \.entity-list[\s\S]*overflow:\s*visible/)
assert.match(styles, /\.config-workbench[\s\S]*grid-template-columns:\s*minmax\(220px,\s*320px\) minmax\(0,\s*760px\)/)
assert.doesNotMatch(styles, /grid-template-columns:\s*294px minmax\(430px, 1fr\) 408px/)

console.log('ok - console UI exposes an independent Sessions workbench')
