import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type {
  BattleMode,
  PokemonTypeKey,
  StrategyDraft,
  StrategySection,
  StrategyThreatNote,
  StrategyThreatSeenTag,
} from '@/models/domain'
import { useAnalyticsStore } from './analytics'
import { useDexStore } from './dex'
import { useTeamStore } from './team'
import { useUiStore } from './ui'

function nowIso(): string {
  return new Date().toISOString()
}

function createEmptyThreatNote(pokemonId: string): StrategyThreatNote {
  const timestamp = nowIso()
  return {
    pokemonId,
    timesSeen: 0,
    lastSeenAt: timestamp,
    commonMoves: [],
    commonItems: [],
    commonAbilities: [],
    commonTeraTypes: [],
    commonPartners: [],
    tags: [],
    notes: '',
    responsePlan: '',
    lastEditedAt: timestamp,
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function uniqueTeraTypes(values: PokemonTypeKey[]): PokemonTypeKey[] {
  const seen = new Set<PokemonTypeKey>()
  const result: PokemonTypeKey[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function normalizeThreatNote(raw: Partial<StrategyThreatNote> & { pokemonId: string }): StrategyThreatNote {
  const fallback = createEmptyThreatNote(raw.pokemonId)
  return {
    pokemonId: raw.pokemonId,
    timesSeen: Math.max(0, Math.floor(raw.timesSeen ?? fallback.timesSeen)),
    lastSeenAt: raw.lastSeenAt || fallback.lastSeenAt,
    commonMoves: uniqueStrings(raw.commonMoves ?? fallback.commonMoves),
    commonItems: uniqueStrings(raw.commonItems ?? fallback.commonItems),
    commonAbilities: uniqueStrings(raw.commonAbilities ?? fallback.commonAbilities),
    commonTeraTypes: uniqueTeraTypes(raw.commonTeraTypes ?? fallback.commonTeraTypes),
    commonPartners: uniqueStrings(raw.commonPartners ?? fallback.commonPartners),
    tags: uniqueStrings(raw.tags ?? fallback.tags) as StrategyThreatSeenTag[],
    notes: raw.notes ?? fallback.notes,
    responsePlan: raw.responsePlan ?? fallback.responsePlan,
    lastEditedAt: raw.lastEditedAt || fallback.lastEditedAt,
  }
}

function isNormalizedThreatNote(raw: unknown): raw is StrategyThreatNote {
  if (!raw || typeof raw !== 'object') return false
  const note = raw as Partial<StrategyThreatNote>
  return (
    typeof note.pokemonId === 'string' &&
    typeof note.timesSeen === 'number' &&
    typeof note.lastSeenAt === 'string' &&
    Array.isArray(note.commonMoves) &&
    Array.isArray(note.commonItems) &&
    Array.isArray(note.commonAbilities) &&
    Array.isArray(note.commonTeraTypes) &&
    Array.isArray(note.commonPartners) &&
    Array.isArray(note.tags) &&
    typeof note.notes === 'string' &&
    typeof note.responsePlan === 'string' &&
    typeof note.lastEditedAt === 'string'
  )
}

function isNormalizedDraft(raw: unknown, mode: BattleMode, teamId: string): raw is StrategyDraft {
  if (!raw || typeof raw !== 'object') return false
  const draft = raw as Partial<StrategyDraft>
  return (
    draft.mode === mode &&
    draft.teamId === teamId &&
    Array.isArray(draft.autoSections) &&
    typeof draft.userEdits === 'string' &&
    Array.isArray(draft.threatNotes) &&
    draft.threatNotes.every((entry) => isNormalizedThreatNote(entry)) &&
    (draft.selectedThreatPokemonId === null || typeof draft.selectedThreatPokemonId === 'string') &&
    typeof draft.updatedAt === 'string'
  )
}

export const useStrategyStore = defineStore('strategy', () => {
  const drafts = useStorage<Record<string, StrategyDraft>>('pokeplan.v1.strategy', {})
  const teamStore = useTeamStore()
  const analyticsStore = useAnalyticsStore()
  const dexStore = useDexStore()
  const uiStore = useUiStore()

  function draftKey(mode: BattleMode, teamId: string): string {
    return `${mode}:${teamId}`
  }

  function buildAutoSections(mode: BattleMode): StrategySection[] {
    const team = teamStore.getActiveTeam(mode)
    const analytics = analyticsStore.getTeamAnalytics(mode)
    const archetypes = dexStore.getArchetypes(mode).slice(0, 2)
    const filledMembers = team.members.filter((member) => member.pokemonId)
    const teraDependency = analyticsStore.getTeamTeraDependency(mode)
    const isEs = uiStore.locale === 'es'
    const teraPriorityText = (() => {
      if (teraDependency.criticalMembers.length === 0) {
        return isEs
          ? 'No hay dependencia critica de Tera en el equipo actual.'
          : 'No critical Tera dependency detected in the current team.'
      }
      const ordered = teraDependency.criticalMembers.map((entry) => `S${entry.slot}`).join(' > ')
      return isEs
        ? `Prioridad sugerida de Tera: ${ordered}.`
        : `Suggested Tera priority: ${ordered}.`
    })()

    if (mode === 'vgc') {
      const leadNames = filledMembers
        .slice(0, 2)
        .map((member) => dexStore.getPokemon(mode, member.pokemonId)?.name ?? member.pokemonId)

      return [
        {
          title: isEs ? 'Plan de leads' : 'Lead plan',
          bullets: [
            leadNames.length
              ? isEs
                ? `Abre con ${leadNames.join(' + ')} en estados neutrales.`
                : `Start with ${leadNames.join(' + ')} in neutral game states.`
              : isEs
                ? 'Define una pareja de lead por defecto.'
                : 'Define a default lead pair.',
            analytics.speedControl >= 45
              ? isEs
                ? 'Usa control de velocidad en turnos 1-2 para asegurar tempo.'
                : 'Use your speed control tools in turn 1-2 to secure tempo.'
              : isEs
                ? 'Agrega una linea dedicada de speed control para early game.'
                : 'Add one dedicated speed control line for early turns.',
            teraPriorityText,
          ],
        },
        {
          title: isEs ? 'Presion de mid game' : 'Mid game pressure',
          bullets: [
            analytics.offenseCoverage >= 55
              ? isEs
                ? 'Cicla pivots para mantener cobertura ofensiva activa contra cambios.'
                : 'Cycle pivots to keep offensive coverage active against switches.'
              : isEs
                ? 'Prioriza mejorar cobertura para evitar turnos muertos.'
                : 'Prioritize move coverage upgrades to avoid dead turns.',
            isEs
              ? 'Protege tus wincons mientras fuerzas chip hacia rangos de KO.'
              : 'Protect critical win conditions while forcing chip into KO ranges.',
          ],
        },
        {
          title: isEs ? 'Enfoque de matchups' : 'Matchup focus',
          bullets: archetypes.map((archetype) => `Vs ${archetype.name}: ${archetype.summary}.`),
        },
      ]
    }

    return [
      {
        title: isEs ? 'Juego temprano' : 'Early game',
        bullets: [
          isEs
            ? 'Establece hazards o limpia hazards rivales en los primeros intercambios.'
            : 'Establish hazards or remove opposing hazards in the first exchanges.',
          analytics.defenseCoverage >= 55
            ? isEs
              ? 'Usa pivots defensivos para scout antes de comprometer la wincon.'
              : 'Leverage defensive pivots to scout sets before committing wincons.'
            : isEs
              ? 'Evita exponer debilidades compartidas hasta identificar sets rivales.'
              : 'Avoid exposing shared weaknesses until you identify opponent sets.',
          teraPriorityText,
        ],
      },
      {
        title: isEs ? 'Condicion de victoria' : 'Win condition',
        bullets: [
          analytics.roleBalance >= 60
            ? isEs
              ? 'Usa sinergia de roles para abrir camino a tu cleaner.'
              : 'Use role synergy to open the board for your cleaner.'
            : isEs
              ? 'Define un cleaner y un breaker para mejorar secuencias.'
              : 'Clarify one cleaner and one breaker role to improve sequencing.',
          isEs
            ? 'Manten priority y opciones de revenge para controlar el endgame.'
            : 'Keep priority and revenge options healthy for endgame control.',
        ],
      },
      {
        title: isEs ? 'Checks de arquetipo' : 'Archetype checks',
        bullets: archetypes.map((archetype) => `Vs ${archetype.name}: ${archetype.summary}.`),
      },
    ]
  }

  function normalizeDraft(mode: BattleMode, teamId: string, raw?: Partial<StrategyDraft>): StrategyDraft {
    const threatNotes = (raw?.threatNotes ?? [])
      .filter((entry): entry is StrategyThreatNote => Boolean(entry?.pokemonId))
      .map((entry) => normalizeThreatNote(entry))

    const selectedThreatPokemonId =
      raw?.selectedThreatPokemonId && threatNotes.some((entry) => entry.pokemonId === raw.selectedThreatPokemonId)
        ? raw.selectedThreatPokemonId
        : threatNotes[0]?.pokemonId ?? null

    return {
      mode,
      teamId,
      autoSections: raw?.autoSections ?? buildAutoSections(mode),
      userEdits: raw?.userEdits ?? '',
      threatNotes,
      selectedThreatPokemonId,
      updatedAt: raw?.updatedAt ?? nowIso(),
    }
  }

  function ensureDraft(mode: BattleMode): StrategyDraft {
    const team = teamStore.getActiveTeam(mode)
    const key = draftKey(mode, team.id)
    const current = drafts.value[key]
    if (isNormalizedDraft(current, mode, team.id)) {
      return current
    }
    const normalized = normalizeDraft(mode, team.id, current)
    drafts.value[key] = normalized
    return normalized
  }

  function touchDraft(draft: StrategyDraft) {
    draft.updatedAt = nowIso()
  }

  function sortThreatNotes(mode: BattleMode, threatNotes: StrategyThreatNote[]) {
    const isEs = uiStore.locale === 'es'
    return [...threatNotes].sort((a, b) => {
      if (b.timesSeen !== a.timesSeen) return b.timesSeen - a.timesSeen
      const dateCompare = (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')
      if (dateCompare !== 0) return dateCompare
      const aName = dexStore.getPokemon(mode, a.pokemonId)?.name ?? a.pokemonId
      const bName = dexStore.getPokemon(mode, b.pokemonId)?.name ?? b.pokemonId
      return aName.localeCompare(bName, isEs ? 'es' : 'en')
    })
  }

  function applyThreatNotes(mode: BattleMode, nextNotes: StrategyThreatNote[]) {
    const draft = ensureDraft(mode)
    draft.threatNotes = sortThreatNotes(mode, nextNotes)
    if (!draft.selectedThreatPokemonId || !draft.threatNotes.some((entry) => entry.pokemonId === draft.selectedThreatPokemonId)) {
      draft.selectedThreatPokemonId = draft.threatNotes[0]?.pokemonId ?? null
    }
    touchDraft(draft)
  }

  function findThreatIndex(draft: StrategyDraft, pokemonId: string): number {
    return draft.threatNotes.findIndex((entry) => entry.pokemonId === pokemonId)
  }

  function upsertThreatNote(mode: BattleMode, pokemonId: string, patch: Partial<StrategyThreatNote> = {}) {
    if (!pokemonId) return
    const draft = ensureDraft(mode)
    const index = findThreatIndex(draft, pokemonId)
    const current = index >= 0 ? draft.threatNotes[index] : createEmptyThreatNote(pokemonId)
    const merged = normalizeThreatNote({
      ...current,
      ...patch,
      pokemonId,
      lastEditedAt: nowIso(),
    })
    const nextNotes = [...draft.threatNotes]
    if (index >= 0) nextNotes[index] = merged
    else nextNotes.push(merged)
    applyThreatNotes(mode, nextNotes)
    const refreshed = ensureDraft(mode)
    refreshed.selectedThreatPokemonId = pokemonId
  }

  function incrementThreatSeen(mode: BattleMode, pokemonId: string) {
    const draft = ensureDraft(mode)
    const index = findThreatIndex(draft, pokemonId)
    const current = index >= 0 ? draft.threatNotes[index] : createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      timesSeen: current.timesSeen + 1,
      lastSeenAt: nowIso(),
    })
  }

  function toggleThreatTag(mode: BattleMode, pokemonId: string, tag: StrategyThreatSeenTag) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    const tags = current.tags.includes(tag)
      ? current.tags.filter((entry) => entry !== tag)
      : [...current.tags, tag]
    upsertThreatNote(mode, pokemonId, {
      ...current,
      tags,
    })
  }

  function appendThreatMove(mode: BattleMode, pokemonId: string, moveId: string) {
    if (!moveId) return
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonMoves: uniqueStrings([...current.commonMoves, moveId]),
    })
  }

  function appendThreatItem(mode: BattleMode, pokemonId: string, itemId: string) {
    if (!itemId) return
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonItems: uniqueStrings([...current.commonItems, itemId]),
    })
  }

  function appendThreatAbility(mode: BattleMode, pokemonId: string, abilityId: string) {
    if (!abilityId) return
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonAbilities: uniqueStrings([...current.commonAbilities, abilityId]),
    })
  }

  function appendThreatTera(mode: BattleMode, pokemonId: string, teraType: PokemonTypeKey) {
    if (!teraType) return
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonTeraTypes: uniqueTeraTypes([...current.commonTeraTypes, teraType]),
    })
  }

  function appendThreatPartner(mode: BattleMode, pokemonId: string, partnerPokemonId: string) {
    if (!partnerPokemonId) return
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonPartners: uniqueStrings([...current.commonPartners, partnerPokemonId]),
    })
  }

  function removeThreatMove(mode: BattleMode, pokemonId: string, moveId: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId)
    if (!current) return
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonMoves: current.commonMoves.filter((entry) => entry !== moveId),
    })
  }

  function removeThreatItem(mode: BattleMode, pokemonId: string, itemId: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId)
    if (!current) return
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonItems: current.commonItems.filter((entry) => entry !== itemId),
    })
  }

  function removeThreatAbility(mode: BattleMode, pokemonId: string, abilityId: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId)
    if (!current) return
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonAbilities: current.commonAbilities.filter((entry) => entry !== abilityId),
    })
  }

  function removeThreatTera(mode: BattleMode, pokemonId: string, teraType: PokemonTypeKey) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId)
    if (!current) return
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonTeraTypes: current.commonTeraTypes.filter((entry) => entry !== teraType),
    })
  }

  function removeThreatPartner(mode: BattleMode, pokemonId: string, partnerPokemonId: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId)
    if (!current) return
    upsertThreatNote(mode, pokemonId, {
      ...current,
      commonPartners: current.commonPartners.filter((entry) => entry !== partnerPokemonId),
    })
  }

  function setThreatNotes(mode: BattleMode, pokemonId: string, notes: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      notes,
    })
  }

  function setThreatResponsePlan(mode: BattleMode, pokemonId: string, plan: string) {
    const draft = ensureDraft(mode)
    const current = draft.threatNotes.find((entry) => entry.pokemonId === pokemonId) ?? createEmptyThreatNote(pokemonId)
    upsertThreatNote(mode, pokemonId, {
      ...current,
      responsePlan: plan,
    })
  }

  function setSelectedThreat(mode: BattleMode, pokemonId: string | null) {
    const draft = ensureDraft(mode)
    draft.selectedThreatPokemonId =
      pokemonId && draft.threatNotes.some((entry) => entry.pokemonId === pokemonId)
        ? pokemonId
        : draft.threatNotes[0]?.pokemonId ?? null
    touchDraft(draft)
  }

  function removeThreatNote(mode: BattleMode, pokemonId: string) {
    const draft = ensureDraft(mode)
    applyThreatNotes(
      mode,
      draft.threatNotes.filter((entry) => entry.pokemonId !== pokemonId),
    )
  }

  function regenerate(mode: BattleMode) {
    const draft = ensureDraft(mode)
    draft.autoSections = buildAutoSections(mode)
    touchDraft(draft)
  }

  function setUserEdits(mode: BattleMode, value: string) {
    const draft = ensureDraft(mode)
    draft.userEdits = value
    touchDraft(draft)
  }

  return {
    drafts,
    ensureDraft,
    regenerate,
    setUserEdits,
    upsertThreatNote,
    incrementThreatSeen,
    toggleThreatTag,
    appendThreatMove,
    appendThreatItem,
    appendThreatAbility,
    appendThreatTera,
    appendThreatPartner,
    removeThreatMove,
    removeThreatItem,
    removeThreatAbility,
    removeThreatTera,
    removeThreatPartner,
    setThreatNotes,
    setThreatResponsePlan,
    setSelectedThreat,
    removeThreatNote,
  }
})
