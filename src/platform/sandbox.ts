export type ShellResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export interface Sandbox {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string, options?: { overwrite?: boolean }): Promise<void>
  runShell(command: string): Promise<ShellResult>
}
