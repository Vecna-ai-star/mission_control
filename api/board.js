import { createClient } from '@supabase/supabase-js'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
    }

    const boardId = req.query?.boardId || process.env.MISSION_CONTROL_BOARD_ID
    if (!boardId) return json(res, 400, { error: 'Missing boardId' })

    const supabase = createClient(supabaseUrl, serviceKey)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('boards').select('id,name,state,updated_at').eq('id', boardId).maybeSingle()
      if (error) return json(res, 500, { error: error.message })
      if (!data) return json(res, 404, { error: 'Board not found' })
      return json(res, 200, { board: data })
    }

    if (req.method === 'PUT') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks).toString('utf8')
      const body = raw ? JSON.parse(raw) : {}
      if (!body?.state) return json(res, 400, { error: 'Missing body.state' })

      const payload = {
        id: boardId,
        name: body?.name ?? 'Mission Control',
        state: body.state,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase.from('boards').upsert(payload, { onConflict: 'id' }).select('id,name,state,updated_at').single()
      if (error) return json(res, 500, { error: error.message })
      return json(res, 200, { board: data })
    }

    return json(res, 405, { error: 'Method not allowed' })
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) })
  }
}
