import { describe, expect, it } from 'vitest'
import { inferDefaultValue, normalizeText } from './workflow-utils'

describe('workflow utils', () => {
  it('normalizes text for filtering', () => {
    expect(normalizeText('  Hello/World  ')).toBe('hello/world')
  })

  it('infers boolean defaults', () => {
    expect(
      inferDefaultValue({
        default_value: 'true',
        type: 'boolean',
        options: [],
      }),
    ).toBe(true)
  })

  it('falls back to first option for choice fields', () => {
    expect(
      inferDefaultValue({
        default_value: null,
        type: 'choice',
        options: ['dev', 'prod'],
      }),
    ).toBe('dev')
  })
})
