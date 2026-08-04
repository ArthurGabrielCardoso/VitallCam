import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getR2Client, getR2Config } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 300

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function isAuthorized(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(token && token === process.env.R2_ACCOUNT_ID)
}

function isR2Url(value?: string | null) {
  return Boolean(value && value.startsWith('/api/r2/object?key='))
}

async function sourceToBuffer(value: string) {
  if (value.startsWith('data:')) {
    const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s)
    if (!match) throw new Error('Data URL inválida')
    return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
  }

  const response = await fetch(value, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Download legado ${response.status}`)
  return {
    contentType: response.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

async function migratePhoto(row: { id: string; patient_id: string; image_data: string | null }) {
  if (!row.image_data || isR2Url(row.image_data)) return 'skipped' as const

  const { contentType, buffer } = await sourceToBuffer(row.image_data)
  const extension = mimeExtensions[contentType]
  if (!extension) throw new Error(`Tipo não suportado: ${contentType}`)

  const key = `patients/${row.patient_id}/photos/migrated-${row.id}.${extension}`
  const config = getR2Config()
  const client = getR2Client()

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'private, max-age=31536000, immutable',
  }))

  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
  if (Number(head.ContentLength) !== buffer.length) {
    throw new Error(`Tamanho divergente: ${buffer.length}/${head.ContentLength}`)
  }

  const objectUrl = `/api/r2/object?key=${encodeURIComponent(key)}`
  const { data, error } = await (supabase as any)
    .from('photos')
    .update({ image_data: objectUrl })
    .eq('id', row.id)
    .select('id')
    .single()

  if (error || !data?.id) throw new Error(error?.message || 'Atualização não confirmada')
  return 'migrated' as const
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>) {
  let cursor = 0
  const results: R[] = []
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await operation(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const cursor = typeof body.cursor === 'string' && body.cursor ? body.cursor : null
    const limit = Math.max(1, Math.min(100, Number(body.limit) || 80))
    const query = (supabase as any)
      .from('photos')
      .select('id,patient_id')
      .order('id', { ascending: true })
      .limit(limit)
    if (cursor) query.gt('id', cursor)

    const { data: ids, error: idsError } = await query
    if (idsError) throw idsError
    if (!ids?.length) {
      return NextResponse.json({ done: true, nextCursor: null, processed: 0, migrated: 0, skipped: 0, failures: [] })
    }

    const rows: Array<{ id: string; patient_id: string; image_data: string | null }> = []
    for (let index = 0; index < ids.length; index += 8) {
      const batchIds = ids.slice(index, index + 8).map((row: { id: string }) => row.id)
      const { data, error } = await (supabase as any)
        .from('photos')
        .select('id,patient_id,image_data')
        .in('id', batchIds)
        .order('id', { ascending: true })
      if (error) throw error
      rows.push(...(data || []))
    }

    const results = await mapWithConcurrency(rows, 6, async row => {
      try {
        return { id: row.id, status: await migratePhoto(row) }
      } catch (error) {
        return { id: row.id, status: 'failed' as const, error: error instanceof Error ? error.message : String(error) }
      }
    })

    const failures = results.filter(result => result.status === 'failed')
    return NextResponse.json({
      done: ids.length < limit,
      nextCursor: ids.at(-1).id,
      processed: rows.length,
      migrated: results.filter(result => result.status === 'migrated').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      failures,
    })
  } catch (error) {
    console.error('Erro no lote de migração R2:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno' }, { status: 500 })
  }
}
