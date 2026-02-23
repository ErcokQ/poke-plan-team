import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { BattleMode, Team, TeamMember } from '@/models/domain'
import { createEmptyTeam, normalizeEvs } from '@/utils/team'
import {
  exportTeamAsFullJson,
  exportTeamAsShareJson,
  exportTeamAsShowdown,
  importTeamFromShowdown,
  parseTeamImportPayload,
} from '@/utils/showdown'
import { useUiStore } from './ui'

type MemberPatch = Partial<Omit<TeamMember, 'slot'>>

export const useTeamStore = defineStore('team', () => {
  const teams = useStorage<Team[]>('pokeplan.v1.teams', [])
  const uiStore = useUiStore()

  function ensureSeeded() {
    const hasVgc = teams.value.some((team) => team.mode === 'vgc')
    const hasSingles = teams.value.some((team) => team.mode === 'singles')

    if (!hasVgc) teams.value.push(createEmptyTeam('vgc', 'VGC Core'))
    if (!hasSingles) teams.value.push(createEmptyTeam('singles', 'Singles Core'))

    ;(['vgc', 'singles'] as BattleMode[]).forEach((mode) => {
      const selected = uiStore.getSelectedTeam(mode)
      if (!selected || !teams.value.find((team) => team.id === selected && team.mode === mode)) {
        const fallback = teams.value.find((team) => team.mode === mode)
        if (fallback) uiStore.setSelectedTeam(mode, fallback.id)
      }
    })
  }

  ensureSeeded()

  const sortedTeams = computed(() => {
    return [...teams.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })

  function teamsForMode(mode: BattleMode): Team[] {
    return sortedTeams.value.filter((team) => team.mode === mode)
  }

  function getTeamById(teamId: string): Team | undefined {
    return teams.value.find((team) => team.id === teamId)
  }

  function getActiveTeam(mode: BattleMode): Team {
    const selectedId = uiStore.getSelectedTeam(mode)
    const selected = teams.value.find((team) => team.id === selectedId && team.mode === mode)
    if (selected) return selected

    const fallback = teams.value.find((team) => team.mode === mode)
    if (!fallback) {
      const created = createEmptyTeam(mode)
      teams.value.push(created)
      uiStore.setSelectedTeam(mode, created.id)
      return created
    }

    uiStore.setSelectedTeam(mode, fallback.id)
    return fallback
  }

  function createTeam(mode: BattleMode, name?: string) {
    const team = createEmptyTeam(mode, name)
    teams.value.push(team)
    uiStore.setSelectedTeam(mode, team.id)
  }

  function renameTeam(teamId: string, name: string) {
    const team = getTeamById(teamId)
    if (!team) return
    team.name = name || team.name
    team.updatedAt = new Date().toISOString()
  }

  function duplicateTeam(teamId: string) {
    const team = getTeamById(teamId)
    if (!team) return
    const copy = structuredClone(team)
    copy.id = crypto.randomUUID()
    copy.name = `${team.name} Copy`
    copy.createdAt = new Date().toISOString()
    copy.updatedAt = copy.createdAt
    teams.value.push(copy)
    uiStore.setSelectedTeam(copy.mode, copy.id)
  }

  function deleteTeam(teamId: string) {
    const team = getTeamById(teamId)
    if (!team) return

    teams.value = teams.value.filter((entry) => entry.id !== teamId)

    const remaining = teamsForMode(team.mode)
    if (remaining.length === 0) {
      createTeam(team.mode, team.mode === 'vgc' ? 'VGC Core' : 'Singles Core')
      return
    }

    if (uiStore.getSelectedTeam(team.mode) === teamId) {
      uiStore.setSelectedTeam(team.mode, remaining[0].id)
    }
  }

  function updateMember(mode: BattleMode, slot: TeamMember['slot'], patch: MemberPatch) {
    const team = getActiveTeam(mode)
    const target = team.members.find((member) => member.slot === slot)
    if (!target) return

    Object.assign(target, patch)
    const normalized = normalizeEvs(target)
    Object.assign(target, normalized)
    team.updatedAt = new Date().toISOString()
  }

  function setTeamNotes(mode: BattleMode, notes: string) {
    const team = getActiveTeam(mode)
    team.notes = notes
    team.updatedAt = new Date().toISOString()
  }

  function selectTeam(mode: BattleMode, teamId: string) {
    uiStore.setSelectedTeam(mode, teamId)
  }

  function importFromJson(raw: string, mode: BattleMode) {
    const parsed = parseTeamImportPayload(raw, mode)
    const imported = parsed.team
    imported.mode = mode
    imported.id = crypto.randomUUID()
    imported.createdAt = new Date().toISOString()
    imported.updatedAt = new Date().toISOString()
    teams.value.push(imported)
    uiStore.setSelectedTeam(mode, imported.id)
    return parsed.source
  }

  function importFromShowdown(raw: string, mode: BattleMode) {
    const template = createEmptyTeam(mode, mode === 'vgc' ? 'Imported VGC Team' : 'Imported Singles Team')
    const parsed = importTeamFromShowdown(raw, mode, template)
    parsed.id = crypto.randomUUID()
    teams.value.push(parsed)
    uiStore.setSelectedTeam(mode, parsed.id)
  }

  function exportJson(mode: BattleMode): string {
    const team = getActiveTeam(mode)
    return exportTeamAsShareJson(team)
  }

  function exportJsonFull(mode: BattleMode): string {
    const team = getActiveTeam(mode)
    return exportTeamAsFullJson(team)
  }

  function exportShowdown(mode: BattleMode): string {
    const team = getActiveTeam(mode)
    return exportTeamAsShowdown(team)
  }

  return {
    teams,
    teamsForMode,
    getTeamById,
    getActiveTeam,
    createTeam,
    renameTeam,
    duplicateTeam,
    deleteTeam,
    updateMember,
    setTeamNotes,
    selectTeam,
    importFromJson,
    importFromShowdown,
    exportJson,
    exportJsonFull,
    exportShowdown,
  }
})
