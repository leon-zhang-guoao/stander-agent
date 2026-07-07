import { exec } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Sandbox, ShellResult } from './sandbox'

const execAsync = promisify(exec)

export type LocalWorkspaceSandboxOptions = {
  workspaceRoot?: string
  shellTimeoutMs?: number
  maxOutputBytes?: number
}

function limitText(value: string, maxBytes: number) {
  const buffer = Buffer.from(value)
  if (buffer.byteLength <= maxBytes) {
    return value
  }

  return `${buffer.subarray(0, maxBytes).toString('utf-8')}\n[output truncated]`
}

export class LocalWorkspaceSandbox implements Sandbox {
  readonly workspaceRoot: string
  private readonly shellTimeoutMs: number
  private readonly maxOutputBytes: number

  constructor(options: LocalWorkspaceSandboxOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd())
    this.shellTimeoutMs = options.shellTimeoutMs ?? 30_000
    this.maxOutputBytes = options.maxOutputBytes ?? 64_000
  }

  private resolveWorkspacePath(inputPath: string) {
    const resolved = path.resolve(this.workspaceRoot, inputPath)
    if (resolved !== this.workspaceRoot && !resolved.startsWith(`${this.workspaceRoot}${path.sep}`)) {
      throw new Error('Path is outside workspace root')
    }
    return resolved
  }

  async readFile(inputPath: string) {
    return fs.readFile(this.resolveWorkspacePath(inputPath), 'utf-8')
  }

  async writeFile(inputPath: string, content: string, options: { overwrite?: boolean } = {}) {
    const filePath = this.resolveWorkspacePath(inputPath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, {
      encoding: 'utf-8',
      flag: options.overwrite ? 'w' : 'wx',
    })
  }

  async runShell(command: string): Promise<ShellResult> {
    try {
      const result = await execAsync(command, {
        cwd: this.workspaceRoot,
        timeout: this.shellTimeoutMs,
        maxBuffer: this.maxOutputBytes * 2,
      })
      return {
        stdout: limitText(result.stdout, this.maxOutputBytes),
        stderr: limitText(result.stderr, this.maxOutputBytes),
        exitCode: 0,
      }
    } catch (error) {
      const execError = error as {
        stdout?: string
        stderr?: string
        code?: number | string
        signal?: string
      }
      return {
        stdout: limitText(execError.stdout ?? '', this.maxOutputBytes),
        stderr: limitText(execError.stderr ?? String(error), this.maxOutputBytes),
        exitCode: typeof execError.code === 'number' ? execError.code : 1,
      }
    }
  }
}
