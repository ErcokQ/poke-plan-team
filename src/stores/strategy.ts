import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { BattleMode, StrategyDraft, StrategySection } from '@/models/domain'
import { useAnalyticsStore } from './analytics'
import { useDexStore } from './dex'
import { useTeamStore } from './team'
import { useUiStore } from './ui'

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

  function ensureDraft(mode: BattleMode): StrategyDraft {
    const team = teamStore.getActiveTeam(mode)
    const key = draftKey(mode, team.id)

    if (!drafts.value[key]) {
      drafts.value[key] = {
        mode,
        teamId: team.id,
        autoSections: buildAutoSections(mode),
        userEdits: '',
        updatedAt: new Date().toISOString(),
      }
    }

    return drafts.value[key]
  }

  function regenerate(mode: BattleMode) {
    const draft = ensureDraft(mode)
    draft.autoSections = buildAutoSections(mode)
    draft.updatedAt = new Date().toISOString()
  }

  function setUserEdits(mode: BattleMode, value: string) {
    const draft = ensureDraft(mode)
    draft.userEdits = value
    draft.updatedAt = new Date().toISOString()
  }

  return {
    drafts,
    ensureDraft,
    regenerate,
    setUserEdits,
  }
})
