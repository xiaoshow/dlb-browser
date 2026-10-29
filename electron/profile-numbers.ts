/** Stable public numbers are monotonic; never recycle a deleted Profile's number. */
export function assignProfileNumbers(state: any, previous?: any) {
  const old = new Map<string, number>((previous?.profiles || []).filter((p: any) => Number.isSafeInteger(p.number) && p.number > 0).map((p: any) => [p.id, p.number]))
  let next = Math.max(1, state.nextProfileNumber || 1, previous?.nextProfileNumber || 1, ...(state.profiles || []).map((p: any) => Number.isSafeInteger(p.number) && p.number > 0 ? p.number + 1 : 1), ...[...old.values()].map(n => n + 1))
  const used = new Set<number>()
  for (const p of state.profiles || []) {
    let n = old.get(p.id) || p.number
    if (!Number.isSafeInteger(n) || n < 1 || used.has(n)) n = next++
    p.number = n; used.add(n)
  }
  state.nextProfileNumber = next
  return state
}
