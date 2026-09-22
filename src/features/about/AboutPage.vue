<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ownerPlaceholder from '@/assets/img/about-owner-placeholder.svg'
import type { BattleMode } from '@/models/domain'
import { getAboutFeedbackCounters, saveAboutFeedback } from '@/services/about-feedback-service'
import { resolvePublicAssetPath } from '@/utils/base-path'

const route = useRoute()
const { t, locale } = useI18n()

const mode = computed<BattleMode>(() => (route.params.mode === 'singles' ? 'singles' : 'vgc'))
const ownerPhotoEnv = (import.meta.env.VITE_OWNER_PHOTO_URL as string | undefined)?.trim()
const ownerPhoto = computed(() => ownerPhotoEnv || resolvePublicAssetPath('ercokq.jpeg'))
const thirdPartyNoticesUrl = resolvePublicAssetPath('third-party-notices.txt')
const ownerPhotoSrc = ref(ownerPhoto.value)
const feedbackCounters = ref(getAboutFeedbackCounters())
const feedbackStatus = ref<{ tone: 'success' | 'error'; message: string } | null>(null)

const bugSubject = ref('')
const bugMessage = ref('')
const suggestionSubject = ref('')
const suggestionMessage = ref('')

const bugSavedCount = computed(() => feedbackCounters.value.bug)
const suggestionSavedCount = computed(() => feedbackCounters.value.suggestion)

watch(ownerPhoto, (value) => {
  ownerPhotoSrc.value = value
})

function onOwnerPhotoError() {
  if (ownerPhotoSrc.value !== ownerPlaceholder) {
    ownerPhotoSrc.value = ownerPlaceholder
  }
}

function refreshCounters() {
  feedbackCounters.value = getAboutFeedbackCounters()
}

function validateFeedback(subject: string, message: string): boolean {
  const valid = Boolean(subject.trim()) || Boolean(message.trim())
  if (!valid) {
    feedbackStatus.value = { tone: 'error', message: t('about.saveValidation') }
  }
  return valid
}

function sendBugReport() {
  if (!validateFeedback(bugSubject.value, bugMessage.value)) return

  saveAboutFeedback({
    type: 'bug',
    subject: bugSubject.value.trim(),
    message: bugMessage.value.trim(),
    mode: mode.value,
    language: locale.value,
  })

  bugSubject.value = ''
  bugMessage.value = ''
  refreshCounters()
  feedbackStatus.value = { tone: 'success', message: t('about.saveBugSuccess') }
}

function sendSuggestion() {
  if (!validateFeedback(suggestionSubject.value, suggestionMessage.value)) return

  saveAboutFeedback({
    type: 'suggestion',
    subject: suggestionSubject.value.trim(),
    message: suggestionMessage.value.trim(),
    mode: mode.value,
    language: locale.value,
  })

  suggestionSubject.value = ''
  suggestionMessage.value = ''
  refreshCounters()
  feedbackStatus.value = { tone: 'success', message: t('about.saveSuggestionSuccess') }
}
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-sky-200">{{ t('about.title') }}</h1>
          <p class="mt-1 text-sm text-gray-300">{{ t('about.subtitle') }}</p>
        </div>
        <span class="inline-flex items-center rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
          {{ t('about.betaStatus') }}
        </span>
      </div>
    </header>

    <div class="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <article class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
        <div class="mx-auto h-64 w-64 overflow-hidden rounded-full border-2 border-sky-400/35 bg-black/30">
          <img :src="ownerPhotoSrc" :alt="t('about.photoAlt')" class="h-full w-full object-cover" @error="onOwnerPhotoError" />
        </div>
        <h2 class="mt-4 text-center text-lg font-semibold text-sky-100">{{ t('about.authorTitle') }}</h2>
        <p class="mt-2 text-sm text-gray-300">{{ t('about.authorBio') }}</p>
      </article>

      <article class="space-y-4 rounded-2xl border border-sky-500/25 bg-off-black/70 p-4">
        <div>
          <h2 class="text-base font-semibold text-sky-100">{{ t('about.projectWhyTitle') }}</h2>
          <p class="mt-2 text-sm text-gray-300">{{ t('about.projectWhyBody') }}</p>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-sky-100">{{ t('about.projectNowTitle') }}</h3>
          <p class="mt-2 text-sm text-gray-300">{{ t('about.projectNowBody') }}</p>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-sky-100">{{ t('about.projectNextTitle') }}</h3>
          <p class="mt-2 text-sm text-gray-300">{{ t('about.projectNextBody') }}</p>
        </div>
      </article>
    </div>

    <article class="rounded-2xl border border-amber-400/25 bg-off-black/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-4xl">
          <h2 class="text-base font-semibold text-amber-100">{{ t('about.legalTitle') }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-gray-300">{{ t('about.legalIntro') }}</p>
        </div>
        <a
          :href="thirdPartyNoticesUrl"
          target="_blank"
          rel="noreferrer"
          class="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300/70"
        >
          {{ t('about.noticesLink') }}
        </a>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border border-gray-700 bg-black/20 p-3">
          <h3 class="text-sm font-semibold text-sky-100">{{ t('about.dataSourcesTitle') }}</h3>
          <ul class="mt-3 space-y-3 text-sm text-gray-300">
            <li>
              <a
                href="https://github.com/smogon/pokemon-showdown"
                target="_blank"
                rel="noreferrer"
                class="font-semibold text-sky-300 hover:text-sky-200"
                >Pokemon Showdown ↗</a
              >
              <p class="mt-1 text-xs leading-relaxed text-gray-400">
                {{ t('about.sourceShowdown') }}
              </p>
            </li>
            <li>
              <a
                href="https://pokeapi.co/"
                target="_blank"
                rel="noreferrer"
                class="font-semibold text-sky-300 hover:text-sky-200"
                >PokeAPI ↗</a
              >
              <p class="mt-1 text-xs leading-relaxed text-gray-400">
                {{ t('about.sourcePokeApi') }}
              </p>
            </li>
            <li>
              <a
                href="https://github.com/msikma/pokesprite"
                target="_blank"
                rel="noreferrer"
                class="font-semibold text-sky-300 hover:text-sky-200"
                >PokeSprite ↗</a
              >
              <p class="mt-1 text-xs leading-relaxed text-gray-400">
                {{ t('about.sourcePokeSprite') }}
              </p>
            </li>
          </ul>
        </section>

        <section class="rounded-xl border border-gray-700 bg-black/20 p-3">
          <h3 class="text-sm font-semibold text-sky-100">{{ t('about.rightsTitle') }}</h3>
          <p class="mt-3 text-sm leading-relaxed text-gray-300">{{ t('about.rightsBody') }}</p>
          <p
            class="mt-3 rounded-lg border border-violet-400/25 bg-violet-500/10 p-3 text-xs leading-relaxed text-violet-100"
          >
            {{ t('about.futureUseBody') }}
          </p>
        </section>
      </div>
    </article>

    <div class="grid gap-4 lg:grid-cols-2">
      <article class="rounded-2xl border border-rose-500/25 bg-off-black/70 p-4">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-rose-200">{{ t('about.bugTitle') }}</h2>
          <span class="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-100">
            {{ t('about.savedCount', { count: bugSavedCount }) }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-300">{{ t('about.bugHint') }}</p>
        <label class="mt-3 block text-xs text-gray-300">
          {{ t('about.subjectLabel') }}
          <input
            v-model.trim="bugSubject"
            type="text"
            class="mt-1 w-full rounded-md border border-gray-700 bg-st-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-rose-400/80"
            :placeholder="t('about.subjectPlaceholder')"
          />
        </label>
        <label class="mt-3 block text-xs text-gray-300">
          {{ t('about.messageLabel') }}
          <textarea
            v-model.trim="bugMessage"
            rows="5"
            class="mt-1 w-full rounded-md border border-gray-700 bg-st-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-rose-400/80"
            :placeholder="t('about.bugPlaceholder')"
          />
        </label>
        <button
          type="button"
          class="mt-3 rounded-md border border-rose-400/70 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100"
          @click="sendBugReport"
        >
          {{ t('about.sendBug') }}
        </button>
      </article>

      <article class="rounded-2xl border border-emerald-500/25 bg-off-black/70 p-4">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-emerald-200">{{ t('about.suggestionTitle') }}</h2>
          <span class="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100">
            {{ t('about.savedCount', { count: suggestionSavedCount }) }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-300">{{ t('about.suggestionHint') }}</p>
        <label class="mt-3 block text-xs text-gray-300">
          {{ t('about.subjectLabel') }}
          <input
            v-model.trim="suggestionSubject"
            type="text"
            class="mt-1 w-full rounded-md border border-gray-700 bg-st-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-400/80"
            :placeholder="t('about.subjectPlaceholder')"
          />
        </label>
        <label class="mt-3 block text-xs text-gray-300">
          {{ t('about.messageLabel') }}
          <textarea
            v-model.trim="suggestionMessage"
            rows="5"
            class="mt-1 w-full rounded-md border border-gray-700 bg-st-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-400/80"
            :placeholder="t('about.suggestionPlaceholder')"
          />
        </label>
        <button
          type="button"
          class="mt-3 rounded-md border border-emerald-400/70 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100"
          @click="sendSuggestion"
        >
          {{ t('about.sendSuggestion') }}
        </button>
      </article>
    </div>

    <div class="rounded-2xl border border-sky-500/25 bg-off-black/70 p-3">
      <p class="text-xs text-gray-300">{{ t('about.storageHint') }}</p>
      <p
        v-if="feedbackStatus"
        class="mt-2 text-xs font-semibold"
        :class="feedbackStatus.tone === 'success' ? 'text-emerald-300' : 'text-rose-300'"
      >
        {{ feedbackStatus.message }}
      </p>
    </div>
  </section>
</template>
