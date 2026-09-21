<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BattleMode } from '@/models/domain'
import { useTeamStore } from '@/stores/team'
import { memberIsComplete } from '@/utils/team'
import ConfirmModal from '@/features/shared/components/ConfirmModal.vue'
import TextInputModal from '@/features/shared/components/TextInputModal.vue'

const route = useRoute()
const { t } = useI18n()
const teamStore = useTeamStore()

const importJsonText = ref('')
const importShowdownText = ref('')
const statusMessage = ref('')
const showCreateModal = ref(false)
const showRenameModal = ref(false)
const showDeleteModal = ref(false)

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const teams = computed(() => teamStore.teamsForMode(mode.value))
const activeTeam = computed(() => teamStore.getActiveTeam(mode.value))
const suggestedTeamName = computed(
  () => `${mode.value === 'vgc' ? t('nav.vgc') : t('nav.singles')} ${t('common.team')}`,
)

function completion(teamId: string): string {
  const team = teamStore.getTeamById(teamId)
  if (!team) return '0/6'
  const completeCount = team.members.filter((member) => memberIsComplete(member)).length
  return `${completeCount}/6`
}

function createTeam() {
  showCreateModal.value = true
}

function renameTeam() {
  showRenameModal.value = true
}

function duplicateTeam() {
  teamStore.duplicateTeam(activeTeam.value.id)
}

function deleteTeam() {
  showDeleteModal.value = true
}

function confirmCreateTeam(name: string) {
  teamStore.createTeam(mode.value, name || suggestedTeamName.value)
}

function confirmRenameTeam(name: string) {
  if (!name) return
  teamStore.renameTeam(activeTeam.value.id, name)
}

function confirmDeleteTeam() {
  teamStore.deleteTeam(activeTeam.value.id)
}

async function copyText(value: string, okMessage: string) {
  await navigator.clipboard.writeText(value)
  statusMessage.value = okMessage
}

function doImportJson() {
  try {
    const source = teamStore.importFromJson(importJsonText.value, mode.value)
    importJsonText.value = ''
    statusMessage.value =
      source === 'full' ? t('common.jsonImportedFull') : t('common.jsonImportedCompact')
  } catch (error) {
    statusMessage.value = t('common.importError', { message: (error as Error).message })
  }
}

function doImportShowdown() {
  try {
    teamStore.importFromShowdown(importShowdownText.value, mode.value)
    importShowdownText.value = ''
    statusMessage.value = t('common.showdownImported')
  } catch (error) {
    statusMessage.value = t('common.importError', { message: (error as Error).message })
  }
}
</script>

<template>
  <section class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-3">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-sky-300">{{ t('common.team') }}</h2>
      <button class="rounded-md border border-sky-500/40 px-2 py-1 text-xs" @click="createTeam">{{ t('common.create') }}</button>
    </div>

    <ul class="space-y-2">
      <li v-for="team in teams" :key="team.id">
        <button
          class="w-full rounded-lg border px-2 py-2 text-left text-sm transition"
          :class="
            activeTeam.id === team.id
              ? 'border-sky-500/70 bg-sky-500/15'
              : 'border-gray-700 bg-st-black/60 hover:border-sky-500/40'
          "
          @click="teamStore.selectTeam(mode, team.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate">{{ team.name }}</span>
            <span class="text-xs text-gray-400">{{ completion(team.id) }}</span>
          </div>
        </button>
      </li>
    </ul>

    <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
      <button class="rounded-md border border-gray-700 px-2 py-1" @click="renameTeam">{{ t('common.rename') }}</button>
      <button class="rounded-md border border-gray-700 px-2 py-1" @click="duplicateTeam">{{ t('common.duplicate') }}</button>
      <button class="rounded-md border border-gray-700 px-2 py-1" @click="deleteTeam">{{ t('common.delete') }}</button>
      <button
        class="rounded-md border border-gray-700 px-2 py-1"
        @click="copyText(teamStore.exportJson(mode), t('common.jsonCopiedCompact'))"
      >
        {{ t('common.jsonCompact') }}
      </button>
      <button
        class="rounded-md border border-gray-700 px-2 py-1"
        @click="copyText(teamStore.exportJsonFull(mode), t('common.jsonCopiedFull'))"
      >
        {{ t('common.jsonFull') }}
      </button>
      <button
        class="col-span-2 rounded-md border border-gray-700 px-2 py-1"
        @click="copyText(teamStore.exportShowdown(mode), t('common.showdownCopied'))"
      >
        Showdown
      </button>
    </div>

    <details class="mt-3 rounded-lg border border-gray-700 p-2">
      <summary class="cursor-pointer text-xs">{{ t('common.import') }} {{ t('common.jsonCompact') }} / {{ t('common.jsonFull') }}</summary>
      <textarea
        v-model="importJsonText"
        class="mt-2 h-24 w-full rounded-md border border-gray-700 bg-st-black p-2 text-xs"
      />
      <button class="mt-2 rounded-md border border-sky-500/40 px-2 py-1 text-xs" @click="doImportJson">{{ t('common.import') }}</button>
    </details>

    <details class="mt-2 rounded-lg border border-gray-700 p-2">
      <summary class="cursor-pointer text-xs">{{ t('common.importShowdown') }}</summary>
      <textarea
        v-model="importShowdownText"
        class="mt-2 h-24 w-full rounded-md border border-gray-700 bg-st-black p-2 text-xs"
      />
      <button class="mt-2 rounded-md border border-sky-500/40 px-2 py-1 text-xs" @click="doImportShowdown">{{ t('common.import') }}</button>
    </details>

    <p v-if="statusMessage" class="mt-2 text-xs text-gray-300">{{ statusMessage }}</p>

    <TextInputModal
      v-model="showCreateModal"
      :title="t('common.create')"
      :message="t('common.createTeamPrompt')"
      :placeholder="t('common.teamName')"
      :initial-value="suggestedTeamName"
      :confirm-label="t('common.create')"
      :cancel-label="t('common.cancel')"
      @confirm="confirmCreateTeam"
    />

    <TextInputModal
      v-model="showRenameModal"
      :title="t('common.rename')"
      :message="t('common.renameTeamPrompt')"
      :placeholder="t('common.teamName')"
      :initial-value="activeTeam.name"
      :confirm-label="t('common.save')"
      :cancel-label="t('common.cancel')"
      @confirm="confirmRenameTeam"
    />

    <ConfirmModal
      v-model="showDeleteModal"
      :title="t('common.delete')"
      :message="t('common.confirmDeleteTeam', { name: activeTeam.name })"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :destructive="true"
      @confirm="confirmDeleteTeam"
    />
  </section>
</template>
