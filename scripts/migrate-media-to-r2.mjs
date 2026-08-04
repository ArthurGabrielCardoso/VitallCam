import { readFile, writeFile } from 'node:fs/promises'

const appOrigin = (process.env.VITALLCAM_APP_ORIGIN || 'https://vitallcam.vercel.app').replace(/\/$/, '')
const publicEnvFile = process.env.VITALLCAM_PUBLIC_ENV_FILE
const checkpointFile = process.env.VITALLCAM_MIGRATION_CHECKPOINT || '/tmp/vitallcam-media-migration.json'
const concurrency = Math.max(1, Math.min(6, Number(process.env.VITALLCAM_MIGRATION_CONCURRENCY || 3)))
const canary = process.env.VITALLCAM_MIGRATION_CANARY === '1'

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if ((!supabaseUrl || !anonKey) && publicEnvFile) {
  const publicEnv = JSON.parse(await readFile(publicEnvFile, 'utf8'))
  supabaseUrl ||= publicEnv.supabaseUrl
  anonKey ||= publicEnv.anonKey
}

if (!supabaseUrl || !anonKey) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

const supabaseHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
}

const state = await readFile(checkpointFile, 'utf8')
  .then(value => JSON.parse(value))
  .catch(() => ({ migrated: { profiles: 0, videos: 0, photos: 0 }, skipped: 0, failures: [] }))

let completedSinceSave = 0

async function saveCheckpoint(force = false) {
  if (!force && completedSinceSave < 25) return
  completedSinceSave = 0
  state.updatedAt = new Date().toISOString()
  await writeFile(checkpointFile, JSON.stringify(state, null, 2), { mode: 0o600 })
}

async function withRetry(label, operation, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function supabaseRequest(table, { select, filters = {}, order, limit, method = 'GET', body } = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  if (select) url.searchParams.set('select', select)
  if (order) url.searchParams.set('order', order)
  if (limit) url.searchParams.set('limit', String(limit))
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    method,
    headers: method === 'PATCH'
      ? { ...supabaseHeaders, Prefer: 'return=representation' }
      : supabaseHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`Supabase ${table} ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

function isR2Url(value) {
  return typeof value === 'string' && (value.startsWith('/api/r2/object?key=') || value.startsWith('r2://'))
}

async function mediaValueToBuffer(value) {
  if (!value) throw new Error('Mídia vazia')
  if (value.startsWith('data:')) {
    const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s)
    if (!match) throw new Error('Data URL inválida')
    return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
  }

  const response = await fetch(value)
  if (!response.ok) throw new Error(`Download legado ${response.status}`)
  return {
    contentType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

async function uploadToR2(patientId, mediaType, value, fallbackContentType) {
  const media = await mediaValueToBuffer(value)
  const contentType = media.contentType === 'application/octet-stream' && fallbackContentType
    ? fallbackContentType
    : media.contentType

  const signedResponse = await fetch(`${appOrigin}/api/r2/upload-url`, {
    method: 'POST',
    headers: { Origin: appOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId, mediaType, contentType, sizeBytes: media.buffer.length }),
  })
  const signed = await signedResponse.json()
  if (!signedResponse.ok) throw new Error(`Preparação R2 ${signedResponse.status}: ${signed.error || 'erro'}`)

  const uploadResponse = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: media.buffer,
  })
  if (!uploadResponse.ok) throw new Error(`Upload R2 ${uploadResponse.status}`)

  const verification = await fetch(`${appOrigin}${signed.objectUrl}`, { headers: { Range: 'bytes=0-0' } })
  const contentRange = verification.headers.get('content-range')
  const remoteSize = Number(contentRange?.split('/')[1] || verification.headers.get('content-length'))
  await verification.body?.cancel()
  if (!verification.ok || remoteSize !== media.buffer.length) {
    throw new Error(`Validação R2 falhou: local=${media.buffer.length}, remoto=${remoteSize || 'desconhecido'}`)
  }

  return { ...signed, sizeBytes: media.buffer.length }
}

async function cleanupR2(key) {
  await fetch(`${appOrigin}/api/r2/object`, {
    method: 'DELETE',
    headers: { Origin: appOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => null)
}

async function migrateProfile(row) {
  if (!row.profile_photo || isR2Url(row.profile_photo)) {
    state.skipped++
    return
  }
  const uploaded = await uploadToR2(row.id, 'profile', row.profile_photo, 'image/jpeg')
  try {
    const updated = await supabaseRequest('patients', {
      method: 'PATCH',
      filters: { id: `eq.${row.id}` },
      body: { profile_photo: uploaded.objectUrl },
    })
    if (updated.length !== 1) throw new Error('Perfil não foi atualizado no Supabase')
  } catch (error) {
    await cleanupR2(uploaded.key)
    throw error
  }
  state.migrated.profiles++
}

async function migrateVideo(row) {
  const source = row.video_data || row.video_url
  if (!source || isR2Url(source) || isR2Url(row.storage_path)) {
    state.skipped++
    return
  }
  const uploaded = await uploadToR2(row.patient_id, 'video', source, row.mime_type || 'video/mp4')
  try {
    const updated = await supabaseRequest('videos', {
      method: 'PATCH',
      filters: { id: `eq.${row.id}` },
      body: { storage_path: `r2://${uploaded.key}`, video_url: uploaded.objectUrl, video_data: null },
    })
    if (updated.length !== 1) throw new Error('Vídeo não foi atualizado no Supabase')
  } catch (error) {
    await cleanupR2(uploaded.key)
    throw error
  }
  state.migrated.videos++
}

async function migratePhoto(row) {
  if (!row.image_data || isR2Url(row.image_data)) {
    state.skipped++
    return
  }
  const uploaded = await uploadToR2(row.patient_id, 'photo', row.image_data, 'image/jpeg')
  try {
    const updated = await supabaseRequest('photos', {
      method: 'PATCH',
      filters: { id: `eq.${row.id}` },
      body: { image_data: uploaded.objectUrl },
    })
    if (updated.length !== 1) throw new Error('Foto não foi atualizada no Supabase')
  } catch (error) {
    await cleanupR2(uploaded.key)
    throw error
  }
  state.migrated.photos++
}

async function processRows(kind, rows, migrate) {
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      try {
        await withRetry(`${kind} ${row.id}`, () => migrate(row))
        state.failures = state.failures.filter(failure => !(failure.kind === kind && failure.id === row.id))
      } catch (error) {
        state.failures.push({ kind, id: row.id, error: error instanceof Error ? error.message : String(error) })
      }
      completedSinceSave++
      await saveCheckpoint()
    }
  })
  await Promise.all(workers)
}

async function migrateSmallTables() {
  const profiles = await supabaseRequest('patients', {
    select: 'id,profile_photo',
    filters: { profile_photo: 'not.is.null' },
    order: 'id.asc',
  })
  await processRows('profile', canary ? profiles.slice(0, 1) : profiles, migrateProfile)
  console.log(`Perfis concluídos: ${state.migrated.profiles} migrados`)

  const videos = await supabaseRequest('videos', {
    select: 'id,patient_id,video_data,video_url,storage_path,mime_type',
    order: 'id.asc',
  })
  await processRows('video', canary ? videos.slice(0, 1) : videos, migrateVideo)
  console.log(`Vídeos concluídos: ${state.migrated.videos} migrados`)
}

async function migratePhotos() {
  let after = null
  let visited = 0
  while (true) {
    const ids = await supabaseRequest('photos', {
      select: 'id,patient_id',
      filters: after ? { id: `gt.${after}` } : {},
      order: 'id.asc',
      limit: 100,
    })
    if (ids.length === 0) break

    const selectedIds = canary ? ids.slice(0, 5) : ids
    for (let index = 0; index < selectedIds.length; index += 8) {
      const batch = selectedIds.slice(index, index + 8)
      const idFilter = `in.(${batch.map(row => row.id).join(',')})`
      const fullRows = await withRetry('carregar lote de fotos', () => supabaseRequest('photos', {
        select: 'id,patient_id,image_data',
        filters: { id: idFilter },
        order: 'id.asc',
      }))
      await processRows('photo', fullRows, migratePhoto)
    }

    visited += selectedIds.length
    after = ids.at(-1).id
    console.log(`Fotos verificadas: ${visited}; migradas nesta execução: ${state.migrated.photos}; falhas: ${state.failures.length}`)
    if (canary) break
  }
}

console.log(`Iniciando migração com concorrência ${concurrency}`)
await migrateSmallTables()
await migratePhotos()
await saveCheckpoint(true)
console.log(JSON.stringify({ ...state, checkpointFile }, null, 2))
