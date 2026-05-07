export interface WorkflowInputLike {
  default_value: string | null
  type: 'string' | 'choice' | 'boolean' | 'environment' | 'number'
  options: string[]
}

export type FormValue = string | boolean | number

export function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

export function inferDefaultValue(input: WorkflowInputLike): FormValue {
  if (input.default_value !== null) {
    if (input.type === 'boolean') {
      return input.default_value === 'true'
    }
    if (input.type === 'number') {
      return Number(input.default_value)
    }
    return input.default_value
  }
  if (input.type === 'boolean') {
    return false
  }
  if (input.type === 'number') {
    return 0
  }
  return input.options[0] ?? ''
}
