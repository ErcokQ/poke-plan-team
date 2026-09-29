export type AboutFeedbackType = 'bug' | 'suggestion'

export interface AboutFeedbackDraft {
  type: AboutFeedbackType
  subject: string
  message: string
  mode: 'vgc' | 'singles'
  language: string
}

const ISSUES_URL = 'https://github.com/ErcokQ/poke-plan-team/issues/new'

export function buildAboutFeedbackIssueUrl(draft: AboutFeedbackDraft, fallbackTitle: string): string {
  const url = new URL(ISSUES_URL)
  const subject = draft.subject.trim()
  const prefix = draft.type === 'bug' ? 'Bug' : draft.language === 'en' ? 'Suggestion' : 'Sugerencia'
  url.searchParams.set('title', subject ? `[${prefix}] ${subject}` : fallbackTitle)
  url.searchParams.set(
    'body',
    [
      draft.message.trim(),
      '',
      '---',
      `Modo: ${draft.mode.toUpperCase()}`,
      `Idioma: ${draft.language}`,
      'Aviso: @ErcokQ',
    ].join('\n'),
  )
  return url.toString()
}
