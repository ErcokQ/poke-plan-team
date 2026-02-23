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
  return dexStore.getPokemon(props.mode, member.pokemonId)?.name ?? member.pokemonId
}

function spriteUrl(pokemonId: string): string {
  if (!pokemonId) return mudkipSprite
  return `https://img.pokemondb.net/sprites/home/normal/${pokemonId}.png`
}

const spriteAliasFallback: Record<string, string> = {
  'calyrex-shadow': 'calyrex-shadow-rider',
  'calyrex-ice': 'calyrex-ice-rider',
}

function spriteIdFromUrl(url: string): string {
  const marker = '/sprites/home/normal/'
  const markerIndex = url.lastIndexOf(marker)
  if (markerIndex === -1) return ''
  return url.slice(markerIndex + marker.length).replace('.png', '').toLowerCase()
}

function onSpriteError(event: Event) {
  const target = event.target as HTMLImageElement
  const failedId = spriteIdFromUrl(target.src)
  const aliasId = spriteAliasFallback[failedId]
  if (aliasId && target.dataset.spriteAliasTried !== aliasId) {
    target.dataset.spriteAliasTried = aliasId
    target.src = `https://img.pokemondb.net/sprites/home/normal/${aliasId}.png`
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
