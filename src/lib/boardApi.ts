export type ColumnId = 'backlog' | 'in_progress' | 'done'

export type Card = {
  id: string
  title: string
  description?: string
}

export type BoardState = {
  columns: Record<ColumnId, { title: string; cardIds: string[] }>
  cards: Record<string, Card>
}

export async function fetchBoard(boardId: string) {
  const res = await fetch(`/api/board?boardId=${encodeURIComponent(boardId)}`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `Failed to load board (${res.status})`)
  }
  return (await res.json()) as { board: { id: string; name: string; state: BoardState } }
}

export async function saveBoard(boardId: string, state: BoardState) {
  const res = await fetch(`/api/board?boardId=${encodeURIComponent(boardId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `Failed to save board (${res.status})`)
  }
  return (await res.json()) as { board: { id: string; name: string; state: BoardState } }
}
