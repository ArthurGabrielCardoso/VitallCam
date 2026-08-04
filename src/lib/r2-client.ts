export type R2MediaType = 'photo' | 'profile' | 'video'

interface UploadMediaOptions {
  patientId: string
  mediaType: R2MediaType
  data: Blob | File | string
  contentType?: string
}

interface R2UploadResult {
  key: string
  url: string
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  if (!header || !base64) throw new Error('Imagem inválida')

  const contentType = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: contentType })
}

export async function uploadMediaToR2({
  patientId,
  mediaType,
  data,
  contentType,
}: UploadMediaOptions): Promise<R2UploadResult> {
  const blob = typeof data === 'string' ? dataUrlToBlob(data) : data
  const resolvedContentType = contentType || blob.type || 'application/octet-stream'

  const signedResponse = await fetch('/api/r2/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId,
      mediaType,
      contentType: resolvedContentType,
      sizeBytes: blob.size,
    }),
  })

  const signed = await signedResponse.json()
  if (!signedResponse.ok) {
    throw new Error(signed?.error || 'Não foi possível preparar o upload')
  }

  const uploadResponse = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': resolvedContentType },
    body: blob,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Falha no upload R2 (${uploadResponse.status})`)
  }

  return { key: signed.key, url: signed.objectUrl }
}

export function extractR2Key(value?: string | null): string | null {
  if (!value) return null
  if (value.startsWith('r2://')) return value.slice(5)

  try {
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'https://vitallcam.vercel.app')
    if (url.pathname !== '/api/r2/object') return null
    return url.searchParams.get('key')
  } catch {
    return null
  }
}

export async function deleteMediaFromR2(value?: string | null) {
  const key = extractR2Key(value)
  if (!key) return

  const response = await fetch('/api/r2/object', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Falha ao remover arquivo do R2')
  }
}
