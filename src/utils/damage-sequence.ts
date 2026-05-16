import type { DamageStatus, DamageRollResult } from '@/models/damage-calc'
import type { PokemonTypeKey } from '@/models/domain'

export type DamageRollProfile = 'low' | 'mid' | 'high'

export interface ReactiveRecoveryResult {
  itemId: string
  healAmount: number
  triggered: boolean
}

export interface EndTurnEffectResult {
  label: string
  hpDelta: number
  kind: 'heal' | 'damage'
}

export interface TwoHitSequenceSimulation {
  firstHitDamage: number
  secondHitDamage: number
  initialHp: number
  maxHp: number
  afterFirstHitHp: number
  afterRecoveryHp: number
  afterTurnOneHp: number
  afterSecondHitHp: number
  recovery: ReactiveRecoveryResult
  endTurnEffects: EndTurnEffectResult[]
  twoHitKoWithoutRecovery: boolean
  twoHitKoAfterRecovery: boolean
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function reactiveHealAmount(itemId: string, maxHp: number, hpAfterHit: number): number {
  const normalized = itemId.trim().toLowerCase()
  if (!normalized || hpAfterHit <= 0) return 0

  if (normalized === 'sitrus-berry' && hpAfterHit <= Math.floor(maxHp / 2)) {
    return Math.max(1, Math.floor(maxHp / 4))
  }

  if (normalized === 'oran-berry' && hpAfterHit <= Math.floor(maxHp / 2)) {
    return 10
  }

  if (normalized === 'berry-juice' && hpAfterHit <= Math.floor(maxHp / 2)) {
    return 20
  }

  if (['figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry'].includes(normalized)) {
    if (hpAfterHit <= Math.floor(maxHp / 4)) {
      return Math.max(1, Math.floor(maxHp / 3))
    }
  }

  return 0
}

export function selectRollDamage(rolls: number[], profile: DamageRollProfile): number {
  if (rolls.length === 0) return 0
  const sorted = [...rolls].sort((a, b) => a - b)

  if (profile === 'low') return sorted[0]
  if (profile === 'high') return sorted[sorted.length - 1]

  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function hasPoisonType(types: PokemonTypeKey[]): boolean {
  return types.includes('poison')
}

function residualStatusDamage(status: DamageStatus, maxHp: number): number {
  if (status === 'burn') return Math.max(1, Math.floor(maxHp / 16))
  if (status === 'poison') return Math.max(1, Math.floor(maxHp / 8))
  if (status === 'toxic') return Math.max(1, Math.floor(maxHp / 16))
  return 0
}

function resolveEndTurnEffects(options: {
  hp: number
  maxHp: number
  defenderItemId?: string
  defenderStatus?: DamageStatus
  defenderTypes?: PokemonTypeKey[]
}): { nextHp: number; effects: EndTurnEffectResult[] } {
  const effects: EndTurnEffectResult[] = []
  let currentHp = clamp(options.hp, 0, options.maxHp)
  const itemId = options.defenderItemId?.trim().toLowerCase() ?? ''
  const types = options.defenderTypes ?? []

  if (currentHp > 0 && itemId === 'leftovers') {
    const heal = Math.max(1, Math.floor(options.maxHp / 16))
    currentHp = Math.min(options.maxHp, currentHp + heal)
    effects.push({ label: 'leftovers', hpDelta: heal, kind: 'heal' })
  }

  if (currentHp > 0 && itemId === 'black-sludge') {
    if (hasPoisonType(types)) {
      const heal = Math.max(1, Math.floor(options.maxHp / 16))
      currentHp = Math.min(options.maxHp, currentHp + heal)
      effects.push({ label: 'black-sludge', hpDelta: heal, kind: 'heal' })
    } else {
      const damage = Math.max(1, Math.floor(options.maxHp / 8))
      currentHp = Math.max(0, currentHp - damage)
      effects.push({ label: 'black-sludge', hpDelta: damage, kind: 'damage' })
    }
  }

  if (currentHp > 0) {
    const residual = residualStatusDamage(options.defenderStatus ?? 'healthy', options.maxHp)
    if (residual > 0) {
      currentHp = Math.max(0, currentHp - residual)
      effects.push({ label: options.defenderStatus ?? 'healthy', hpDelta: residual, kind: 'damage' })
    }
  }

  return {
    nextHp: currentHp,
    effects,
  }
}

export function simulateTwoHitSequence(
  result: DamageRollResult,
  options: {
    profile: DamageRollProfile
    currentHp: number
    maxHp: number
    defenderItemId?: string
    defenderAbilityId?: string
    defenderStatus?: DamageStatus
    defenderTypes?: PokemonTypeKey[]
  },
): TwoHitSequenceSimulation | null {
  const maxHp = clamp(options.maxHp, 1, 9999)
  const currentHp = clamp(options.currentHp, 1, maxHp)
  if (result.rolls.length === 0 || result.max <= 0) return null

  const mitigationAbilityId = options.defenderAbilityId?.trim().toLowerCase() ?? ''
  const freshRolls = result.sequenceRolls?.fresh ?? result.rolls
  const chippedRolls = result.sequenceRolls?.chipped ?? result.rolls
  const firstRollPool = currentHp >= maxHp ? freshRolls : chippedRolls
  const firstHitDamage = clamp(selectRollDamage(firstRollPool, options.profile), 0, 9999)
  const afterFirstHitHp = Math.max(0, currentHp - firstHitDamage)
  const healAmount = reactiveHealAmount(options.defenderItemId ?? '', maxHp, afterFirstHitHp)
  const afterRecoveryHp = Math.min(maxHp, afterFirstHitHp + healAmount)
  const turnOneResolution = resolveEndTurnEffects({
    hp: afterRecoveryHp,
    maxHp,
    defenderItemId: options.defenderItemId,
    defenderStatus: options.defenderStatus,
    defenderTypes: options.defenderTypes,
  })
  const afterTurnOneHp = turnOneResolution.nextHp
  const mitigationAppliesOnFirstUse =
    currentHp >= maxHp && (mitigationAbilityId === 'multiscale' || mitigationAbilityId === 'shadow-shield')
  const mitigationAppliesOnSecondUse =
    afterTurnOneHp >= maxHp && (mitigationAbilityId === 'multiscale' || mitigationAbilityId === 'shadow-shield')

  let secondHitDamage = clamp(
    selectRollDamage(mitigationAppliesOnSecondUse ? freshRolls : chippedRolls, options.profile),
    0,
    9999,
  )
  if (!result.sequenceRolls) {
    if (mitigationAppliesOnFirstUse && !mitigationAppliesOnSecondUse) {
      secondHitDamage = Math.min(9999, firstHitDamage * 2)
    } else if (!mitigationAppliesOnFirstUse && mitigationAppliesOnSecondUse) {
      secondHitDamage = Math.max(1, Math.floor(firstHitDamage / 2))
    }
  }

  const afterSecondHitHp = Math.max(0, afterTurnOneHp - secondHitDamage)

  return {
    firstHitDamage,
    secondHitDamage,
    initialHp: currentHp,
    maxHp,
    afterFirstHitHp,
    afterRecoveryHp,
    afterTurnOneHp,
    afterSecondHitHp,
    recovery: {
      itemId: options.defenderItemId?.trim().toLowerCase() ?? '',
      healAmount,
      triggered: healAmount > 0,
    },
    endTurnEffects: turnOneResolution.effects,
    twoHitKoWithoutRecovery: currentHp - firstHitDamage - secondHitDamage <= 0,
    twoHitKoAfterRecovery: afterSecondHitHp <= 0,
  }
}
