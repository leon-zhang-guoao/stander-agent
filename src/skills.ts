import fs from 'node:fs/promises'
import path from 'node:path'

export type SkillSummary = {
  name: string
  description: string
}

const skillsRoot = path.join(process.cwd(), 'skills')
const skillNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

function assertValidSkillName(name: string) {
  if (!skillNamePattern.test(name)) {
    throw new Error('skill 名称只能包含字母、数字、下划线和短横线')
  }
}

function getSkillPath(name: string) {
  assertValidSkillName(name)
  return path.join(skillsRoot, name, 'SKILL.md')
}

function getDescription(markdown: string) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const firstParagraph = lines.find((line) => !line.startsWith('#'))
  return firstParagraph?.slice(0, 180) ?? ''
}

export async function listSkills(): Promise<SkillSummary[]> {
  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
    const skills: SkillSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || !skillNamePattern.test(entry.name)) {
        continue
      }

      try {
        const markdown = await fs.readFile(getSkillPath(entry.name), 'utf-8')
        skills.push({
          name: entry.name,
          description: getDescription(markdown),
        })
      } catch {
        // Skip directories that do not contain a readable SKILL.md.
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export async function readSkill(name: string) {
  return fs.readFile(getSkillPath(name), 'utf-8')
}

export function extractRequestedSkillNames(message: string) {
  const names = new Set<string>()
  const matches = message.matchAll(/\$([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})/g)

  for (const match of matches) {
    names.add(match[1])
  }

  return [...names]
}

export async function withTriggeredSkills(message: string) {
  const skillNames = extractRequestedSkillNames(message)

  if (!skillNames.length) {
    return message
  }

  const loadedSkills = await Promise.all(
    skillNames.map(async (name) => {
      try {
        return {
          name,
          content: await readSkill(name),
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        return {
          name,
          content: `无法加载 skill: ${reason}`,
        }
      }
    }),
  )

  const skillContext = loadedSkills
    .map(
      (skill) => `## Skill: ${skill.name}

${skill.content}`,
    )
    .join('\n\n---\n\n')

  return `以下是本轮用户显式触发的 skill，请优先遵循这些 skill 的说明完成任务。

${skillContext}

---

用户原始消息:
${message}`
}
