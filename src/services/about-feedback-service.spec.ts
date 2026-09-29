import { describe, expect, it } from 'vitest'
import { buildAboutFeedbackIssueUrl } from './about-feedback-service'

describe('buildAboutFeedbackIssueUrl', () => {
  it('prepares a bug report with context and notifies the repository owner', () => {
    const url = new URL(
      buildAboutFeedbackIssueUrl(
        {
          type: 'bug',
          subject: '  Falla al cambiar de equipo  ',
          message: '  No se abre el selector.  ',
          mode: 'vgc',
          language: 'es',
        },
        '[Bug] El Estanque de Mudkip',
      ),
    )

    expect(url.origin + url.pathname).toBe(
      'https://github.com/ErcokQ/poke-plan-team/issues/new',
    )
    expect(url.searchParams.get('title')).toBe('[Bug] Falla al cambiar de equipo')
    expect(url.searchParams.get('body')).toContain('No se abre el selector.')
    expect(url.searchParams.get('body')).toContain('Modo: VGC')
    expect(url.searchParams.get('body')).toContain('Idioma: es')
    expect(url.searchParams.get('body')).toContain('@ErcokQ')
  })

  it('uses a fallback title when only a suggestion message is provided', () => {
    const url = new URL(
      buildAboutFeedbackIssueUrl(
        {
          type: 'suggestion',
          subject: '',
          message: 'Mostrar filtros más claros',
          mode: 'singles',
          language: 'en',
        },
        '[Suggestion] Mudkip Pond',
      ),
    )

    expect(url.searchParams.get('title')).toBe('[Suggestion] Mudkip Pond')
    expect(url.searchParams.get('body')).toContain('Mostrar filtros más claros')
    expect(url.searchParams.get('body')).toContain('Modo: SINGLES')
  })
})
