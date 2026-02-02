import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { BoardState, ColumnId } from './lib/boardApi'
import { fetchBoard, saveBoard } from './lib/boardApi'

type Card = {
  id: string
  title: string
  description?: string
}

const STORAGE_KEY = 'mission_control.board.v1'
const REMOTE_BOARD_ID = import.meta.env.VITE_MISSION_CONTROL_BOARD_ID as string | undefined

function uid(prefix = 'c') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function defaultBoard(): BoardState {
  const c1: Card = {
    id: uid(),
    title: 'Onboarding on first login (company + rules setup)',
    description:
      'Implement onboarding flow in auto-pricer: company fields + initial pricing rules. Skippable with warnings; editable later.'
  }

  return {
    columns: {
      backlog: { title: 'Backlog', cardIds: [c1.id] },
      in_progress: { title: 'In Progress', cardIds: [] },
      done: { title: 'Done', cardIds: [] }
    },
    cards: {
      [c1.id]: c1
    }
  }
}

function safeParseBoard(raw: string | null): BoardState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as BoardState
    if (!parsed?.columns || !parsed?.cards) return null
    return parsed
  } catch {
    return null
  }
}

export default function App() {
  const [board, setBoard] = useState<BoardState>(() => {
    const fromStorage = safeParseBoard(localStorage.getItem(STORAGE_KEY))
    return fromStorage ?? defaultBoard()
  })

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  // Load remote board if configured
  useEffect(() => {
    if (!REMOTE_BOARD_ID) return
    let cancelled = false

    fetchBoard(REMOTE_BOARD_ID)
      .then((r) => {
        if (cancelled) return
        if (r?.board?.state) setBoard(r.board.state)
      })
      .catch(() => {
        // best-effort: fall back to local
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Local persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  }, [board])

  // Remote persistence (debounced)
  useEffect(() => {
    if (!REMOTE_BOARD_ID) return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveBoard(REMOTE_BOARD_ID, board).catch(() => {
        // best-effort
      })
    }, 400)

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [board])

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null
    return board.cards[selectedCardId] ?? null
  }, [board.cards, selectedCardId])

  const columns: Array<{ id: ColumnId; title: string }> = [
    { id: 'backlog', title: board.columns.backlog.title },
    { id: 'in_progress', title: board.columns.in_progress.title },
    { id: 'done', title: board.columns.done.title }
  ]

  function addCard(colId: ColumnId) {
    const title = prompt('Card title?')?.trim()
    if (!title) return
    const description = prompt('Description (optional)?')?.trim() || undefined

    const id = uid()
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, description }
      },
      columns: {
        ...prev.columns,
        [colId]: {
          ...prev.columns[colId],
          cardIds: [id, ...prev.columns[colId].cardIds]
        }
      }
    }))
  }

  function moveCard(cardId: string, from: ColumnId, to: ColumnId) {
    if (from === to) return
    setBoard((prev) => {
      const fromIds = prev.columns[from].cardIds.filter((id) => id !== cardId)
      const toIds = [cardId, ...prev.columns[to].cardIds]
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [from]: { ...prev.columns[from], cardIds: fromIds },
          [to]: { ...prev.columns[to], cardIds: toIds }
        }
      }
    })
  }

  function deleteCard(cardId: string) {
    const ok = confirm('Delete this card?')
    if (!ok) return

    setBoard((prev) => {
      const nextCards = { ...prev.cards }
      delete nextCards[cardId]

      const nextColumns: BoardState['columns'] = {
        backlog: {
          ...prev.columns.backlog,
          cardIds: prev.columns.backlog.cardIds.filter((id) => id !== cardId)
        },
        in_progress: {
          ...prev.columns.in_progress,
          cardIds: prev.columns.in_progress.cardIds.filter((id) => id !== cardId)
        },
        done: {
          ...prev.columns.done,
          cardIds: prev.columns.done.cardIds.filter((id) => id !== cardId)
        }
      }

      return { ...prev, cards: nextCards, columns: nextColumns }
    })

    setSelectedCardId((cur) => (cur === cardId ? null : cur))
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <div className="title">Mission Control</div>
          <div className="subtitle">
            Kanban (local + Supabase persistence via /api/board)
            {REMOTE_BOARD_ID ? '' : ' — set VITE_MISSION_CONTROL_BOARD_ID to enable remote sync'}
          </div>
        </div>
      </header>

      <main className="main">
        <section className="board">
          {columns.map((col) => (
            <div className="column" key={col.id}>
              <div className="columnHeader">
                <div className="columnTitle">{col.title}</div>
                <button className="btnSmall" onClick={() => addCard(col.id)}>
                  + Add
                </button>
              </div>

              <div className="cards">
                {board.columns[col.id].cardIds.map((cardId) => {
                  const card = board.cards[cardId]
                  if (!card) return null

                  return (
                    <button
                      key={card.id}
                      className={`card ${selectedCardId === card.id ? 'cardSelected' : ''}`}
                      onClick={() => setSelectedCardId(card.id)}
                    >
                      <div className="cardTitle">{card.title}</div>
                      {card.description ? <div className="cardDesc">{card.description}</div> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        <aside className="panel">
          <div className="panelTitle">Details</div>

          {!selectedCard ? (
            <div className="panelEmpty">Select a card to view actions.</div>
          ) : (
            <div className="panelBody">
              <div className="panelCardTitle">{selectedCard.title}</div>
              {selectedCard.description ? <div className="panelCardDesc">{selectedCard.description}</div> : null}

              <div className="panelActions">
                <div className="panelActionsLabel">Move to</div>
                <div className="panelActionsRow">
                  {columns.map((col) => (
                    <button
                      key={col.id}
                      className="btnSmall"
                      onClick={() => {
                        const from = (Object.keys(board.columns) as ColumnId[]).find((cid) =>
                          board.columns[cid].cardIds.includes(selectedCard.id)
                        )
                        if (!from) return
                        moveCard(selectedCard.id, from, col.id)
                      }}
                    >
                      {col.title}
                    </button>
                  ))}
                </div>

                <button className="btnDanger" onClick={() => deleteCard(selectedCard.id)}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
