import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'

function requiredEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

const API_BASE = requiredEnv('MISSION_CONTROL_API_BASE').replace(/\/$/, '')
const BOARD_ID = requiredEnv('MISSION_CONTROL_BOARD_ID')

async function apiGetBoard() {
  const res = await fetch(`${API_BASE}/api/board?boardId=${encodeURIComponent(BOARD_ID)}`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `GET board failed (${res.status})`)
  }
  const j = await res.json()
  return j.board
}

async function apiSaveBoard(state) {
  const res = await fetch(`${API_BASE}/api/board?boardId=${encodeURIComponent(BOARD_ID)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `PUT board failed (${res.status})`)
  }
  const j = await res.json()
  return j.board
}

function uid(prefix = 'c') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function findColumnId(boardState, cardId) {
  for (const [colId, col] of Object.entries(boardState.columns)) {
    if (col.cardIds.includes(cardId)) return colId
  }
  return null
}

const ColumnIdSchema = z.enum(['backlog', 'in_progress', 'done'])

const server = new McpServer({ name: 'mission-control-mcp', version: '0.1.0' })

server.registerTool('board_get', { description: 'Fetch current board (Supabase-backed).', inputSchema: z.object({}).strict() }, async () => {
  const board = await apiGetBoard()
  return { content: [{ type: 'text', text: JSON.stringify(board, null, 2) }] }
})

server.registerTool('cards_list', { description: 'List all cards with their current column.', inputSchema: z.object({}).strict() }, async () => {
  const board = await apiGetBoard()
  const state = board.state
  const out = Object.values(state.cards).map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    columnId: findColumnId(state, c.id)
  }))
  return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
})

server.registerTool(
  'card_create',
  {
    description: 'Create a card in a column.',
    inputSchema: z.object({ columnId: ColumnIdSchema, title: z.string().min(1), description: z.string().optional() }).strict()
  },
  async ({ columnId, title, description }) => {
    const board = await apiGetBoard()
    const state = structuredClone(board.state)
    const id = uid()
    state.cards[id] = { id, title, description }
    state.columns[columnId].cardIds = [id, ...state.columns[columnId].cardIds]
    const saved = await apiSaveBoard(state)
    return { content: [{ type: 'text', text: JSON.stringify({ createdCardId: id, board: saved }, null, 2) }] }
  }
)

server.registerTool(
  'card_move',
  {
    description: 'Move a card to another column.',
    inputSchema: z.object({ cardId: z.string().min(1), toColumnId: ColumnIdSchema, position: z.number().int().min(0).optional() }).strict()
  },
  async ({ cardId, toColumnId, position }) => {
    const board = await apiGetBoard()
    const state = structuredClone(board.state)

    const from = findColumnId(state, cardId)
    if (!from) throw new Error(`Card not found in any column: ${cardId}`)

    state.columns[from].cardIds = state.columns[from].cardIds.filter((id) => id !== cardId)

    const dest = [...state.columns[toColumnId].cardIds]
    dest.splice(Math.min(position ?? 0, dest.length), 0, cardId)
    state.columns[toColumnId].cardIds = dest

    const saved = await apiSaveBoard(state)
    return { content: [{ type: 'text', text: JSON.stringify({ moved: true, board: saved }, null, 2) }] }
  }
)

server.registerTool(
  'card_update',
  {
    description: 'Update card title/description.',
    inputSchema: z.object({ cardId: z.string().min(1), title: z.string().min(1).optional(), description: z.string().optional() }).strict()
  },
  async ({ cardId, title, description }) => {
    const board = await apiGetBoard()
    const state = structuredClone(board.state)

    const cur = state.cards[cardId]
    if (!cur) throw new Error(`Card not found: ${cardId}`)

    state.cards[cardId] = {
      ...cur,
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {})
    }

    const saved = await apiSaveBoard(state)
    return { content: [{ type: 'text', text: JSON.stringify({ updated: true, board: saved }, null, 2) }] }
  }
)

server.registerTool(
  'card_delete',
  {
    description: 'Delete a card from the board.',
    inputSchema: z.object({ cardId: z.string().min(1) }).strict()
  },
  async ({ cardId }) => {
    const board = await apiGetBoard()
    const state = structuredClone(board.state)

    if (!state.cards[cardId]) throw new Error(`Card not found: ${cardId}`)
    delete state.cards[cardId]

    for (const col of Object.values(state.columns)) {
      col.cardIds = col.cardIds.filter((id) => id !== cardId)
    }

    const saved = await apiSaveBoard(state)
    return { content: [{ type: 'text', text: JSON.stringify({ deleted: true, board: saved }, null, 2) }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
