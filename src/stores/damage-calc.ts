import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BattleMode, MoveEntry, StatKey, TeamMember } from '@/models/domain'
import type {
  DamageCombatContext,
  DamageCalcScenario,
  DamageGeneration,
  DamageMatrixCell,
  DamagePairComputation,
  DamageSideId,
  DamageSlotNumber,
  DamageSlotSet,
} from '@/models/damage-calc'
import { useDexStore } from '@/stores/dex'
import { useMetaUsageStore } from '@/stores/meta-usage'
import { useTeamStore } from '@/stores/team'
import { metaTemplateService } from '@/services/meta-template-service'
import { computeMatrixDamage, computePairDamage } from '@/utils/damage-engine'
import { useBufferedStorage } from '@/utils/buffered-storage'
import { getEffectiveLearnsetMoveIds } from '@/utils/move-legality'
import { canonicalizePokemonId } from '@/utils/showdown'
import type { MetaTeamTemplate } from '@/models/meta'

function emptyEvs(): Record<StatKey, number> {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
}

function emptyIvs(): Record<StatKey, number> {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
}

function protectMap(): Record<string, boolean> {
  return { '1': false, '2': false, '3': false, '4': false, '5': false, '6': false }
}

function defaultCombatContext(): DamageCombatContext {
  return {
    wasHitThisTurn: false,
    tookDamageThisTurn: false,
    statsLoweredThisTurn: false,
    previousMoveFailed: false,
    moveOrderHint: 'auto',
    consecutiveMoveUses: 0,
    timesHitThisBattle: 0,
    alliesFaintedCount: 0,
    stockpileCount: 0,
    friendship: 255,
  }
}

function defaultTargetMap(): Record<string, DamageSlotNumber> {
  return { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function createSlot(slot: DamageSlotNumber, level: number): DamageSlotSet {
  return {
    slot,
    pokemonId: '',
    abilityId: '',
    itemId: '',
    natureId: 'jolly',
    evs: emptyEvs(),
    ivs: emptyIvs(),
    teraType: undefined,
    isTeraActive: false,
    moves: ['', '', '', ''],
    level,
    currentHpPercent: 100,
    status: 'healthy',
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    combatContext: defaultCombatContext(),
  }
}

function createScenario(mode: BattleMode): DamageCalcScenario {
  const level = mode === 'vgc' ? 50 : 100
  const active = mode === 'vgc' ? ([1, 2, 3, 4] as DamageSlotNumber[]) : ([1, 2, 3, 4, 5, 6] as DamageSlotNumber[])
  return {
    mode,
    generation: 'gen9',
    battleType: mode === 'vgc' ? 'doubles' : 'singles',
    sideA: {
      slots: [1, 2, 3, 4, 5, 6].map((slot) => createSlot(slot as DamageSlotNumber, level)),
      activeSlotIds: [...active],
      targetByAttacker: defaultTargetMap(),
    },
    sideB: {
      slots: [1, 2, 3, 4, 5, 6].map((slot) => createSlot(slot as DamageSlotNumber, level)),
      activeSlotIds: [...active],
      targetByAttacker: defaultTargetMap(),
    },
    field: {
      weather: 'none',
      terrain: 'none',
      sideA: {
        reflect: false,
        lightScreen: false,
        auroraVeil: false,
        friendGuard: false,
        helpingHand: false,
        battery: false,
        powerSpot: false,
        hazards: { stealthRock: false, spikesLayers: 0, toxicSpikesLayers: 0, stickyWeb: false },
        protectBySlot: protectMap(),
      },
      sideB: {
        reflect: false,
        lightScreen: false,
        auroraVeil: false,
        friendGuard: false,
        helpingHand: false,
        battery: false,
        powerSpot: false,
        hazards: { stealthRock: false, spikesLayers: 0, toxicSpikesLayers: 0, stickyWeb: false },
        protectBySlot: protectMap(),
      },
      globalFlags: {
        gravity: false,
        magicRoom: false,
        wonderRoom: false,
      },
      advancedFlags: {
        tailwindA: false,
        tailwindB: false,
        trickRoom: false,
        expectedDamageMode: false,
        assumeSpreadHitsMultipleTargets: true,
      },
    },
    selectedPair: {
      attackerSide: 'A',
      attackerSlot: 1,
      defenderSlot: 1,
    },
  }
}

function normalizeMoves(moves: string[]): [string, string, string, string] {
  return [
    moves[0] ?? '',
    moves[1] ?? '',
    moves[2] ?? '',
    moves[3] ?? '',
  ]
}

function normalizeMemberMoves(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value)) return ['', '', '', '']
  return normalizeMoves(value.map((entry) => (typeof entry === 'string' ? entry : '')))
}

function normalizeMemberEvs(value: unknown): Record<StatKey, number> {
  const source = typeof value === 'object' && value !== null ? (value as Partial<Record<StatKey, unknown>>) : {}
  return {
    hp: clampInt(Number(source.hp ?? 0), 0, 252),
    atk: clampInt(Number(source.atk ?? 0), 0, 252),
    def: clampInt(Number(source.def ?? 0), 0, 252),
    spa: clampInt(Number(source.spa ?? 0), 0, 252),
    spd: clampInt(Number(source.spd ?? 0), 0, 252),
    spe: clampInt(Number(source.spe ?? 0), 0, 252),
  }
}

function normalizeMemberIvs(value: unknown): Record<StatKey, number> {
  const source = typeof value === 'object' && value !== null ? (value as Partial<Record<StatKey, unknown>>) : {}
  return {
    hp: clampInt(Number(source.hp ?? 31), 0, 31),
    atk: clampInt(Number(source.atk ?? 31), 0, 31),
    def: clampInt(Number(source.def ?? 31), 0, 31),
    spa: clampInt(Number(source.spa ?? 31), 0, 31),
    spd: clampInt(Number(source.spd ?? 31), 0, 31),
    spe: clampInt(Number(source.spe ?? 31), 0, 31),
  }
}

function findTeamMemberBySlot(members: TeamMember[], slot: DamageSlotNumber, fallbackIndex?: number): TeamMember | undefined {
  const bySlot = members.find((entry) => Number(entry.slot) === slot)
  if (bySlot) return bySlot
  if (fallbackIndex === undefined) return undefined
  return members[fallbackIndex]
}

function normalizeSlotSet(input: DamageSlotSet): DamageSlotSet {
  const canonicalPokemonId = canonicalizePokemonId(input.pokemonId ?? '')
  const combatContext = input.combatContext ?? defaultCombatContext()
  return {
    ...input,
    pokemonId: canonicalPokemonId,
    level: clampInt(input.level, 1, 100),
    currentHpPercent: clampInt(input.currentHpPercent, 1, 100),
    evs: {
      hp: clampInt(input.evs.hp, 0, 252),
      atk: clampInt(input.evs.atk, 0, 252),
      def: clampInt(input.evs.def, 0, 252),
      spa: clampInt(input.evs.spa, 0, 252),
      spd: clampInt(input.evs.spd, 0, 252),
      spe: clampInt(input.evs.spe, 0, 252),
    },
    ivs: {
      hp: clampInt(input.ivs.hp, 0, 31),
      atk: clampInt(input.ivs.atk, 0, 31),
      def: clampInt(input.ivs.def, 0, 31),
      spa: clampInt(input.ivs.spa, 0, 31),
      spd: clampInt(input.ivs.spd, 0, 31),
      spe: clampInt(input.ivs.spe, 0, 31),
    },
    moves: normalizeMoves(input.moves),
    stages: {
      atk: clampInt(input.stages.atk ?? 0, -6, 6),
      def: clampInt(input.stages.def ?? 0, -6, 6),
      spa: clampInt(input.stages.spa ?? 0, -6, 6),
      spd: clampInt(input.stages.spd ?? 0, -6, 6),
      spe: clampInt(input.stages.spe ?? 0, -6, 6),
    },
    status: input.status ?? 'healthy',
    isTeraActive: Boolean(input.isTeraActive && input.teraType),
    combatContext: {
      wasHitThisTurn: Boolean(combatContext.wasHitThisTurn),
      tookDamageThisTurn: Boolean(combatContext.tookDamageThisTurn),
      statsLoweredThisTurn: Boolean(combatContext.statsLoweredThisTurn),
      previousMoveFailed: Boolean(combatContext.previousMoveFailed),
      moveOrderHint:
        combatContext.moveOrderHint === 'before-target' || combatContext.moveOrderHint === 'after-target'
          ? combatContext.moveOrderHint
          : 'auto',
      consecutiveMoveUses: clampInt(combatContext.consecutiveMoveUses ?? 0, 0, 5),
      timesHitThisBattle: clampInt(combatContext.timesHitThisBattle ?? 0, 0, 6),
      alliesFaintedCount: clampInt(combatContext.alliesFaintedCount ?? 0, 0, 5),
      stockpileCount: clampInt(combatContext.stockpileCount ?? 0, 0, 3),
      friendship: clampInt(combatContext.friendship ?? 255, 0, 255),
    },
  }
}

function ensureActiveSlots(mode: BattleMode, slotIds: DamageSlotNumber[]): DamageSlotNumber[] {
  const max = mode === 'vgc' ? 4 : 6
  const clean = [...new Set(slotIds)].filter((slot) => slot >= 1 && slot <= 6) as DamageSlotNumber[]
  return clean.slice(0, max)
}

function guessNatureAndEvsByMoves(moves: MoveEntry[]): { natureId: string; evs: Record<StatKey, number> } {
  const damaging = moves.filter((move) => move.category !== 'status')
  const physical = damaging.filter((move) => move.category === 'physical').length
  const special = damaging.filter((move) => move.category === 'special').length

  if (special > physical) {
    return {
      natureId: 'timid',
      evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    }
  }
  if (physical > special) {
    return {
      natureId: 'jolly',
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    }
  }
  return {
    natureId: 'jolly',
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  }
}

function normalizeScenario(mode: BattleMode, scenario: DamageCalcScenario): DamageCalcScenario {
  const defaultScenario = createScenario(mode)
  return {
    ...defaultScenario,
    ...scenario,
    mode,
    battleType: mode === 'vgc' ? 'doubles' : 'singles',
    sideA: {
      ...defaultScenario.sideA,
      ...scenario.sideA,
      slots: (scenario.sideA?.slots ?? defaultScenario.sideA.slots).map((slot) => normalizeSlotSet(slot)),
      activeSlotIds: ensureActiveSlots(mode, scenario.sideA?.activeSlotIds ?? defaultScenario.sideA.activeSlotIds),
      targetByAttacker: {
        ...defaultScenario.sideA.targetByAttacker,
        ...(scenario.sideA?.targetByAttacker ?? {}),
      },
    },
    sideB: {
      ...defaultScenario.sideB,
      ...scenario.sideB,
      slots: (scenario.sideB?.slots ?? defaultScenario.sideB.slots).map((slot) => normalizeSlotSet(slot)),
      activeSlotIds: ensureActiveSlots(mode, scenario.sideB?.activeSlotIds ?? defaultScenario.sideB.activeSlotIds),
      targetByAttacker: {
        ...defaultScenario.sideB.targetByAttacker,
        ...(scenario.sideB?.targetByAttacker ?? {}),
      },
    },
    field: {
      ...defaultScenario.field,
      ...scenario.field,
      sideA: {
        ...defaultScenario.field.sideA,
        ...(scenario.field?.sideA ?? {}),
        protectBySlot: {
          ...defaultScenario.field.sideA.protectBySlot,
          ...(scenario.field?.sideA?.protectBySlot ?? {}),
        },
      },
      sideB: {
        ...defaultScenario.field.sideB,
        ...(scenario.field?.sideB ?? {}),
        protectBySlot: {
          ...defaultScenario.field.sideB.protectBySlot,
          ...(scenario.field?.sideB?.protectBySlot ?? {}),
        },
      },
      globalFlags: {
        ...defaultScenario.field.globalFlags,
        ...(scenario.field?.globalFlags ?? {}),
      },
      advancedFlags: {
        ...defaultScenario.field.advancedFlags,
        ...(scenario.field?.advancedFlags ?? {}),
      },
    },
    selectedPair: {
      ...defaultScenario.selectedPair,
      ...(scenario.selectedPair ?? {}),
    },
  }
}

export const useDamageCalcStore = defineStore('damage-calc', () => {
  const dexStore = useDexStore()
  const teamStore = useTeamStore()
  const metaUsageStore = useMetaUsageStore()

  const { state: vgcScenario } = useBufferedStorage<DamageCalcScenario>(
    'pokeplan.v1.damage.vgc',
    createScenario('vgc'),
    { debounceMs: 250 },
  )
  const { state: singlesScenario } = useBufferedStorage<DamageCalcScenario>(
    'pokeplan.v1.damage.singles',
    createScenario('singles'),
    { debounceMs: 250 },
  )
  const { state: scenarioVersion } = useBufferedStorage<Record<BattleMode, number>>(
    'pokeplan.v1.damage.version',
    {
      vgc: 0,
      singles: 0,
    },
    { debounceMs: 250 },
  )

  const pairCache = new Map<string, DamagePairComputation>()
  const matrixCache = new Map<string, DamageMatrixCell[]>()
  const dynamicTeamTemplates = ref<Record<BattleMode, MetaTeamTemplate[]>>({
    vgc: [],
    singles: [],
  })
  const dynamicTemplatesStatus = ref<Record<BattleMode, 'idle' | 'loading' | 'ready' | 'error'>>({
    vgc: 'idle',
    singles: 'idle',
  })
  const dynamicTemplatesError = ref<Record<BattleMode, string | null>>({
    vgc: null,
    singles: null,
  })
  const pendingDynamicTeams = new Map<BattleMode, Promise<void>>()

  vgcScenario.value = normalizeScenario('vgc', vgcScenario.value)
  singlesScenario.value = normalizeScenario('singles', singlesScenario.value)

  function scenarioRef(mode: BattleMode) {
    return mode === 'vgc' ? vgcScenario : singlesScenario
  }

  function touch(mode: BattleMode) {
    scenarioVersion.value = {
      ...scenarioVersion.value,
      [mode]: (scenarioVersion.value[mode] ?? 0) + 1,
    }
    pairCache.clear()
    matrixCache.clear()
  }

  function logComputationPerf(label: string, startedAt: number, context: string) {
    if (!import.meta.env.DEV || typeof performance === 'undefined') return
    const duration = performance.now() - startedAt
    if (duration < 8) return
    console.info(`[DamageCalcPerf] ${label} ${duration.toFixed(1)}ms ${context}`)
  }

  function getScenario(mode: BattleMode): DamageCalcScenario {
    return scenarioRef(mode).value
  }

  function setScenario(mode: BattleMode, next: DamageCalcScenario, options?: { touch?: boolean }) {
    scenarioRef(mode).value = next
    if (options?.touch !== false) {
      touch(mode)
    }
  }

  function resetScenario(mode: BattleMode) {
    setScenario(mode, createScenario(mode))
  }

  function initFromBuilder(mode: BattleMode) {
    const team = teamStore.getActiveTeam(mode)
    const current = getScenario(mode)
    const defaultLevel = mode === 'vgc' ? 50 : 100
    const membersBySlot = [...team.members].sort((a, b) => Number(a.slot) - Number(b.slot))
    const sideA = {
      ...current.sideA,
      slots: current.sideA.slots.map((slot, index) => {
        const member = findTeamMemberBySlot(membersBySlot, slot.slot, index)
        if (!member) return createSlot(slot.slot, defaultLevel)
        const rawPokemonId = typeof member.pokemonId === 'string' ? member.pokemonId : ''
        const pokemonId = canonicalizePokemonId(rawPokemonId)
        const pokemon = pokemonId ? dexStore.getPokemon(mode, pokemonId) : undefined
        const abilityId = (typeof member.abilityId === 'string' ? member.abilityId : '') || pokemon?.abilities[0] || ''
        const natureId = (typeof member.natureId === 'string' ? member.natureId : '') || pokemon?.defaultNature || 'jolly'
        const itemId = typeof member.itemId === 'string' ? member.itemId : ''
        const teraType = typeof member.teraType === 'string' ? member.teraType : undefined
        return normalizeSlotSet(
          {
            ...slot,
            pokemonId,
            abilityId,
            itemId,
            natureId,
            teraType,
            moves: normalizeMemberMoves(member.moves),
            evs: normalizeMemberEvs(member.evs),
            ivs: normalizeMemberIvs(member.ivs),
            level: defaultLevel,
            currentHpPercent: 100,
            status: 'healthy',
            stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            combatContext: defaultCombatContext(),
            isTeraActive: false,
          },
        )
      }),
    }

    const activeWithPokemon = sideA.slots
      .filter((slot) => Boolean(slot.pokemonId))
      .map((slot) => slot.slot)
    sideA.activeSlotIds =
      activeWithPokemon.length > 0
        ? ensureActiveSlots(mode, activeWithPokemon)
        : ensureActiveSlots(mode, mode === 'vgc' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6])

    setScenario(mode, {
      ...current,
      sideA,
      selectedPair: {
        attackerSide: 'A',
        attackerSlot: sideA.activeSlotIds[0] ?? 1,
        defenderSlot: current.sideB.activeSlotIds[0] ?? 1,
      },
    })
  }

  function setGeneration(mode: BattleMode, generation: DamageGeneration) {
    const current = getScenario(mode)
    setScenario(mode, { ...current, generation })
  }

  function setActiveSlots(mode: BattleMode, side: DamageSideId, slots: DamageSlotNumber[]) {
    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    const nextSide = {
      ...current[key],
      activeSlotIds: ensureActiveSlots(mode, slots),
    }
    setScenario(mode, { ...current, [key]: nextSide }, { touch: false })
  }

  function setTarget(mode: BattleMode, side: DamageSideId, attackerSlot: DamageSlotNumber, defenderSlot: DamageSlotNumber) {
    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    const nextSide = {
      ...current[key],
      targetByAttacker: {
        ...current[key].targetByAttacker,
        [String(attackerSlot)]: defenderSlot,
      },
    }
    setScenario(mode, { ...current, [key]: nextSide })
  }

  function updateSlotSet(mode: BattleMode, side: DamageSideId, slot: DamageSlotNumber, patch: Partial<DamageSlotSet>) {
    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    const nextSlots = current[key].slots.map((entry) => {
      if (entry.slot !== slot) return entry
      const merged: DamageSlotSet = {
        ...entry,
        ...patch,
        moves: normalizeMoves((patch.moves as string[] | undefined) ?? entry.moves),
        evs: { ...entry.evs, ...(patch.evs ?? {}) },
        ivs: { ...entry.ivs, ...(patch.ivs ?? {}) },
        stages: { ...entry.stages, ...(patch.stages ?? {}) },
        combatContext: { ...entry.combatContext, ...(patch.combatContext ?? {}) },
      }
      return normalizeSlotSet(merged)
    })
    const nextSide = {
      ...current[key],
      slots: nextSlots,
    }
    setScenario(mode, { ...current, [key]: nextSide })
  }

  function updateField(mode: BattleMode, patch: Partial<DamageCalcScenario['field']>) {
    const current = getScenario(mode)
    setScenario(mode, {
      ...current,
      field: {
        ...current.field,
        ...patch,
      },
    })
  }

  function updateSideField(mode: BattleMode, side: DamageSideId, patch: Partial<DamageCalcScenario['field']['sideA']>) {
    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    setScenario(mode, {
      ...current,
      field: {
        ...current.field,
        [key]: {
          ...current.field[key],
          ...patch,
        },
      },
    })
  }

  function setSelectedPair(
    mode: BattleMode,
    attackerSide: DamageSideId,
    attackerSlot: DamageSlotNumber,
    defenderSlot: DamageSlotNumber,
  ) {
    const current = getScenario(mode)
    setScenario(mode, {
      ...current,
      selectedPair: {
        attackerSide,
        attackerSlot,
        defenderSlot,
      },
    }, { touch: false })
  }

  function applyMetaTemplate(mode: BattleMode, side: DamageSideId, templateId: string) {
    const template = getTeamTemplates(mode).find((entry) => entry.id === templateId)
    if (!template) return

    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    const defaultLevel = mode === 'vgc' ? 50 : 100
    const slotMap = new Map(template.members.map((member) => [member.slot, member]))
    const slots = current[key].slots.map((slot) => {
      const member = slotMap.get(slot.slot)
      if (!member) return slot
      return normalizeSlotSet(
        {
          ...slot,
          pokemonId: member.pokemonId,
          abilityId: member.abilityId,
          itemId: member.itemId,
          natureId: member.natureId,
          teraType: member.teraType,
          moves: normalizeMoves(member.moves),
          evs: { ...member.evs },
          ivs: { ...member.ivs },
          level: member.level || defaultLevel,
          isTeraActive: false,
          currentHpPercent: 100,
          status: 'healthy',
          stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          combatContext: defaultCombatContext(),
        },
      )
    })
    const active = ensureActiveSlots(
      mode,
      slots.filter((slot) => Boolean(slot.pokemonId)).map((slot) => slot.slot),
    )

    setScenario(mode, {
      ...current,
      [key]: {
        ...current[key],
        slots,
        activeSlotIds: active.length > 0 ? active : current[key].activeSlotIds,
      },
    })
  }

  async function applyBenchmark(mode: BattleMode, side: DamageSideId, slot: DamageSlotNumber, benchmarkId?: string) {
    const current = getScenario(mode)
    const key = side === 'A' ? 'sideA' : 'sideB'
    const currentSlot = current[key].slots.find((entry) => entry.slot === slot)
    if (!currentSlot?.pokemonId) return

    const byId = benchmarkId ? metaTemplateService.getBenchmarkById(mode, benchmarkId) : undefined
    const byPokemon = byId ?? metaTemplateService.getBenchmarkByPokemon(mode, currentSlot.pokemonId)
    if (byPokemon) {
      updateSlotSet(mode, side, slot, {
        abilityId: byPokemon.set.abilityId,
        itemId: byPokemon.set.itemId,
        natureId: byPokemon.set.natureId,
        teraType: byPokemon.set.teraType,
        moves: normalizeMoves(byPokemon.set.moves),
        evs: { ...byPokemon.set.evs },
        ivs: { ...byPokemon.set.ivs },
        level: byPokemon.set.level,
      })
      return
    }

    const pokemon = dexStore.getPokemon(mode, currentSlot.pokemonId)
    if (!pokemon) return

    await metaUsageStore.ensureModeLoaded(mode)
    const meta = metaUsageStore.getPokemonMeta(mode, pokemon.id)
    const moveCandidates = meta?.moves.map((entry) => entry.id) ?? []
    const itemCandidates = meta?.items.map((entry) => entry.id) ?? []
    const learnset = new Set(
      getEffectiveLearnsetMoveIds(
        pokemon,
        (pokemonId) => dexStore.getPokemon(mode, pokemonId),
      ),
    )

    const chosenMoves: string[] = []
    for (const moveId of moveCandidates) {
      if (chosenMoves.length >= 4) break
      if (!learnset.has(moveId)) continue
      if (!dexStore.getMove(moveId)) continue
      chosenMoves.push(moveId)
    }
    for (const moveId of pokemon.suggestedMoves) {
      if (chosenMoves.length >= 4) break
      if (!learnset.has(moveId)) continue
      if (!chosenMoves.includes(moveId)) chosenMoves.push(moveId)
    }
    while (chosenMoves.length < 4) chosenMoves.push('')

    const selectedMoveEntries = chosenMoves.map((moveId) => dexStore.getMove(moveId)).filter(Boolean) as MoveEntry[]
    const guessed = guessNatureAndEvsByMoves(selectedMoveEntries)
    const itemId = itemCandidates.find((item) => Boolean(dexStore.getItem(item))) || pokemon.suggestedItems[0] || ''
    const level = mode === 'vgc' ? 50 : 100

    updateSlotSet(mode, side, slot, {
      abilityId: pokemon.abilities[0] || '',
      itemId,
      natureId: guessed.natureId || pokemon.defaultNature || 'jolly',
      moves: normalizeMoves(chosenMoves),
      evs: guessed.evs,
      ivs: emptyIvs(),
      level,
      teraType: currentSlot.teraType ?? pokemon.types[0],
    })
  }

  function getTeamTemplates(mode: BattleMode) {
    const local = metaTemplateService.getTeamTemplates(mode)
    const dynamic = dynamicTeamTemplates.value[mode] ?? []
    if (dynamic.length === 0) return local

    const merged: MetaTeamTemplate[] = []
    const seen = new Set<string>()
    for (const team of [...local, ...dynamic]) {
      if (seen.has(team.id)) continue
      seen.add(team.id)
      merged.push(team)
    }
    return merged
  }

  function getBenchmarks(mode: BattleMode) {
    return metaTemplateService.getBenchmarks(mode)
  }

  async function ensureMetaTemplatesLoaded(mode: BattleMode) {
    if (dynamicTemplatesStatus.value[mode] === 'ready') return
    if (pendingDynamicTeams.has(mode)) {
      await pendingDynamicTeams.get(mode)
      return
    }

    dynamicTemplatesStatus.value = {
      ...dynamicTemplatesStatus.value,
      [mode]: 'loading',
    }
    dynamicTemplatesError.value = {
      ...dynamicTemplatesError.value,
      [mode]: null,
    }

    const task = metaTemplateService
      .getDynamicTeamTemplates(mode)
      .then((templates) => {
        dynamicTeamTemplates.value = {
          ...dynamicTeamTemplates.value,
          [mode]: templates,
        }
        dynamicTemplatesStatus.value = {
          ...dynamicTemplatesStatus.value,
          [mode]: 'ready',
        }
      })
      .catch((error) => {
        dynamicTeamTemplates.value = {
          ...dynamicTeamTemplates.value,
          [mode]: dynamicTeamTemplates.value[mode] ?? [],
        }
        dynamicTemplatesStatus.value = {
          ...dynamicTemplatesStatus.value,
          [mode]: 'ready',
        }
        dynamicTemplatesError.value = {
          ...dynamicTemplatesError.value,
          [mode]: null,
        }
        console.warn(`[MetaTemplates] Falling back to local-only mode for ${mode}`, error)
      })

    pendingDynamicTeams.set(mode, task)
    try {
      await task
    } finally {
      pendingDynamicTeams.delete(mode)
    }
  }

  function getMetaTemplateLoadStatus(mode: BattleMode) {
    return dynamicTemplatesStatus.value[mode]
  }

  function getMetaTemplateLoadError(mode: BattleMode) {
    return dynamicTemplatesError.value[mode]
  }

  function computePair(
    mode: BattleMode,
    attackerSide: DamageSideId,
    attackerSlot: DamageSlotNumber,
    defenderSlot: DamageSlotNumber,
    moveIndex?: number,
  ): DamagePairComputation {
    const cacheKey = `${mode}:${scenarioVersion.value[mode]}:${attackerSide}:${attackerSlot}:${defenderSlot}:${moveIndex ?? 'all'}`
    const cached = pairCache.get(cacheKey)
    if (cached) return cached

    const scenario = getScenario(mode)
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
    const result = computePairDamage(
      scenario,
      {
        getPokemon: (modeKey, pokemonId) => dexStore.getPokemon(modeKey, pokemonId),
        getMove: (moveId) => dexStore.getMove(moveId),
        getItem: (itemId) => dexStore.getItem(itemId),
      },
      attackerSide,
      attackerSlot,
      defenderSlot,
      moveIndex,
    )
    logComputationPerf(
      'pair',
      startedAt,
      `${mode}:${attackerSide}:${attackerSlot}->${defenderSlot}:${moveIndex ?? 'all'}`,
    )
    pairCache.set(cacheKey, result)
    return result
  }

  function computeMatrix(mode: BattleMode, attackerSide: DamageSideId): DamageMatrixCell[] {
    const cacheKey = `${mode}:${scenarioVersion.value[mode]}:${attackerSide}`
    const cached = matrixCache.get(cacheKey)
    if (cached) return cached

    const scenario = getScenario(mode)
    const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
    const matrix = computeMatrixDamage(
      scenario,
      {
        getPokemon: (modeKey, pokemonId) => dexStore.getPokemon(modeKey, pokemonId),
        getMove: (moveId) => dexStore.getMove(moveId),
        getItem: (itemId) => dexStore.getItem(itemId),
      },
      attackerSide,
    )
    logComputationPerf('matrix', startedAt, `${mode}:${attackerSide}`)
    matrixCache.set(cacheKey, matrix)
    return matrix
  }

  function getScenarioVersion(mode: BattleMode): number {
    return scenarioVersion.value[mode] ?? 0
  }

  return {
    getScenario,
    setScenario,
    resetScenario,
    initFromBuilder,
    setGeneration,
    setActiveSlots,
    setTarget,
    updateSlotSet,
    updateField,
    updateSideField,
    setSelectedPair,
    applyBenchmark,
    applyMetaTemplate,
    getTeamTemplates,
    getBenchmarks,
    ensureMetaTemplatesLoaded,
    getMetaTemplateLoadStatus,
    getMetaTemplateLoadError,
    getScenarioVersion,
    computePair,
    computeMatrix,
  }
})
