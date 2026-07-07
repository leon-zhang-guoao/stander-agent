import {
  extractRequestedSkillNames,
  listSkills,
  readSkill,
  type SkillSummary,
} from '../skills'

export type SkillContent = {
  name: string
  content: string
}

export interface SkillRegistry {
  list(): Promise<SkillSummary[]>
  get(name: string): Promise<SkillContent | undefined>
  resolve(names: string[]): Promise<SkillContent[]>
  unknown(names: string[]): Promise<string[]>
  resolveTriggered(message: string): Promise<SkillContent[]>
}

export function createFileSkillRegistry(): SkillRegistry {
  return {
    list: listSkills,

    async get(name) {
      try {
        return {
          name,
          content: await readSkill(name),
        }
      } catch {
        return undefined
      }
    },

    async resolve(names) {
      const skills = await Promise.all(names.map((name) => this.get(name)))
      return skills.filter((skill): skill is SkillContent => Boolean(skill))
    },

    async unknown(names) {
      const skills = await this.resolve(names)
      const known = new Set(skills.map((skill) => skill.name))
      return names.filter((name) => !known.has(name))
    },

    async resolveTriggered(message) {
      return this.resolve(extractRequestedSkillNames(message))
    },
  }
}
