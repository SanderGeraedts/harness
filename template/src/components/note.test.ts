import { describe, expect, it } from 'vitest'
import { firstLine } from './note'

describe('firstLine', () => {
  it('gives the first line of a note, not the lines after it', () => {
    expect(firstLine('Check the train times.\nBook a table.')).toBe('Check the train times.')
    expect(firstLine('One line.')).toBe('One line.')
  })

  it('skips empty lines at the start, and gives nothing for an empty note', () => {
    expect(firstLine('\n  \n  Second.  \nThird.')).toBe('Second.')
    expect(firstLine('')).toBe('')
    expect(firstLine(' \n ')).toBe('')
  })
})
