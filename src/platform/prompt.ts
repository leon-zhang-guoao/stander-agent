import type { AgentConfig } from './types'

export type PromptSkill = {
  name: string
  content: string
}

export type ComposePlatformPromptInput = {
  agent: AgentConfig
  defaultSkills?: PromptSkill[]
  triggeredSkills?: PromptSkill[]
  platformGuidance?: string
  memoryPrompts?: string[]
  appendablePrompts?: string[]
}

function dedupeSkills(defaultSkills: PromptSkill[], triggeredSkills: PromptSkill[]) {
  const triggeredNames = new Set(triggeredSkills.map((skill) => skill.name))
  return {
    defaultSkills: defaultSkills.filter((skill) => !triggeredNames.has(skill.name)),
    triggeredSkills,
  }
}

export function renderSkillContext(skills: PromptSkill[]) {
  if (!skills.length) {
    return ''
  }

  return skills
    .map(
      (skill) => `## Skill: ${skill.name}

${skill.content}`,
    )
    .join('\n\n---\n\n')
}

export function composePlatformPrompt(input: ComposePlatformPromptInput) {
  const { defaultSkills, triggeredSkills } = dedupeSkills(
    input.defaultSkills ?? [],
    input.triggeredSkills ?? [],
  )
  const sections = [input.agent.systemPrompt]

  if (input.platformGuidance?.trim()) {
    sections.push(input.platformGuidance.trim())
  }

  if (input.memoryPrompts?.length) {
    sections.push(input.memoryPrompts.filter(Boolean).join('\n\n'))
  }

  if (input.appendablePrompts?.length) {
    sections.push(input.appendablePrompts.filter(Boolean).join('\n\n'))
  }

  const defaultSkillContext = renderSkillContext(defaultSkills)
  if (defaultSkillContext) {
    sections.push(`以下是这个 agent 默认启用的 skills，请持续遵循这些 skill 的说明。

${defaultSkillContext}`)
  }

  const triggeredSkillContext = renderSkillContext(triggeredSkills)
  if (triggeredSkillContext) {
    sections.push(`以下是本轮用户显式触发的 skills，请优先遵循这些 skill 的说明完成任务。

${triggeredSkillContext}`)
  }

  return sections.filter((section) => section.trim()).join('\n\n')
}

