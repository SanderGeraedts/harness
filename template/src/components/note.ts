/** What a card shows of a note: its first line that isn't empty. */
export function firstLine(note: string): string {
  return (
    note
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  )
}
