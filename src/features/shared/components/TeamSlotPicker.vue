<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import mudkipSprite from '@/assets/pokesprite/pokemon-gen8/regular/mudkip.png'
import type { BattleMode, TeamMember } from '@/models/domain'
import { useDexStore } from '@/stores/dex'
import { memberIsComplete } from '@/utils/team'

interface Props {
  mode: BattleMode
  members: TeamMember[]
  selectedSlot: TeamMember['slot']
  title?: string
  showCount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showCount: false,
})

const emit = defineEmits<{
  (event: 'update:selectedSlot', slot: TeamMember['slot']): void
}>()

const { t } = useI18n()
const dexStore = useDexStore()

const filledSlots = computed(() => props.members.filter((member) => member.pokemonId).length)

function pokemonNameFor(member: TeamMember): string {
  if (!member.pokemonId) return t('analytics.emptySlot')
  const pokemon = dexStore.getPokemon(props.mode, member.pokemonId)
  if (!pokemon) return member.pokemonId
  return displayPokemonName(pokemon.id, pokemon.name)
}

function formSuffixFromPokemonId(pokemonId: string): string {
  if (!pokemonId.includes('-')) return ''
  const suffixParts = pokemonId.split('-').slice(1)
  if (!suffixParts.length) return ''

  const [head, ...tail] = suffixParts
  if (head === 'mega') {
    return tail.length
      ? `Mega ${tail.map((part) => prettifySlug(part)).join(' ')}`
      : 'Mega'
  }
  if (head === 'gmax') return 'Gmax'
  if (head === 'alola' || head === 'galar' || head === 'hisui' || head === 'paldea') {
    const region = prettifySlug(head)
    const rest = tail.map((part) => prettifySlug(part)).join(' ')
    return rest ? `${region} ${rest}` : region
  }
  return suffixParts.map((part) => prettifySlug(part)).join(' ')
}

function prettifySlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function displayPokemonName(pokemonId: string, baseName: string): string {
  const suffix = formSuffixFromPokemonId(pokemonId)
  return suffix ? `${baseName} (${suffix})` : baseName
}

function spriteUrl(pokemonId: string): string {
  if (!pokemonId) return mudkipSprite
  return spriteCandidatesForPokemon(pokemonId)[0] ?? mudkipSprite
}

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
}

function spriteCandidatesForPokemon(pokemonId: string): string[] {
  if (!pokemonId) return [mudkipSprite]

  const ids = [pokemonId]
  const aliasId = spriteAliasFallback[pokemonId]
  if (aliasId && aliasId !== pokemonId) ids.push(aliasId)

  const prefersShowdown = pokemonId.includes('-')
  const candidates: string[] = []

  for (const id of ids) {
    if (prefersShowdown) {
      candidates.push(`https://play.pokemonshowdown.com/sprites/ani/${id}.gif`)
      candidates.push(`https://img.pokemondb.net/sprites/home/normal/${id}.png`)
    } else {
      candidates.push(`https://img.pokemondb.net/sprites/home/normal/${id}.png`)
      candidates.push(`https://play.pokemonshowdown.com/sprites/ani/${id}.gif`)
    }
    candidates.push(`https://play.pokemonshowdown.com/sprites/gen5/${id}.png`)
  }

  return [...new Set(candidates)]
}

function spriteIdFromUrl(url: string): string {
  const match = url.match(/\/([^/?#]+)\.(?:png|gif)(?:[?#].*)?$/)
  return match?.[1] ?? ''
}

function onSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  const pokemonId = target.dataset.spriteId || spriteIdFromUrl(target.src)
  const candidates = spriteCandidatesForPokemon(pokemonId)
  const currentIndex = Number(target.dataset.spriteFallbackIndex ?? '0')
  const nextIndex = currentIndex + 1

  if (nextIndex < candidates.length) {
    target.dataset.spriteFallbackIndex = String(nextIndex)
    target.src = candidates[nextIndex]
    return
  }

  if (target.src !== mudkipSprite) {
    target.src = mudkipSprite
  }
}
</script>

<template>
  <div class="rounded-xl border border-gray-700 bg-st-black/50 p-3">
    <div v-if="title || showCount" class="mb-2 flex items-center justify-between">
      <p class="text-sm text-gray-200">{{ title }}</p>
      <p v-if="showCount" class="text-xs text-gray-400">{{ filledSlots }}/6</p>
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <button
        v-for="member in members"
        :key="member.slot"
        class="rounded-lg border p-2 text-left transition"
        :class="
          selectedSlot === member.slot
            ? 'border-sky-500 bg-sky-500/10'
            : 'border-gray-700 bg-off-black/60 hover:border-sky-500/40'
        "
        @click="emit('update:selectedSlot', member.slot)"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs text-gray-300">{{ t('common.slot', { slot: member.slot }) }}</span>
          <span class="text-[10px]" :class="memberIsComplete(member) ? 'text-green-300' : 'text-gray-500'">
            {{ memberIsComplete(member) ? t('builder.completeShort') : t('builder.incompleteShort') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <img
            :src="spriteUrl(member.pokemonId)"
            :alt="pokemonNameFor(member)"
            :data-sprite-id="member.pokemonId"
            :data-sprite-fallback-index="0"
            class="h-10 w-10 rounded bg-black/20 object-contain transition"
            :class="member.pokemonId ? '' : 'opacity-70 grayscale'"
            loading="lazy"
            @error="onSpriteError"
          />
          <p class="line-clamp-2 text-xs text-gray-200">{{ pokemonNameFor(member) }}</p>
        </div>
      </button>
    </div>
  </div>
</template>
