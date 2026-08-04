import { randomUUID } from 'node:crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextResponse } from 'next/server'
import { assertAllowedOrigin, getR2Client, getR2Config } from '@/lib/r2'

export const runtime = 'nodejs'

const mediaFolders = {
  photo: 'photos',
  profile: 'profile',
  video: 'videos',
} as const

const contentTypeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request)
    const { patientId, mediaType, contentType, sizeBytes } = await request.json()

    if (!/^[0-9a-f-]{36}$/i.test(patientId || '')) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 })
    }

    const folder = mediaFolders[mediaType as keyof typeof mediaFolders]
    const extension = contentTypeExtensions[contentType]
    if (!folder || !extension) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
    }

    const maxBytes = mediaType === 'video' ? 500 * 1024 * 1024 : 30 * 1024 * 1024
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
      return NextResponse.json({ error: 'Tamanho de arquivo não permitido' }, { status: 400 })
    }

    const key = `patients/${patientId}/${folder}/${randomUUID()}.${extension}`
    const config = getR2Config()
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: 'private, max-age=31536000, immutable',
    })
    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 10 * 60 })
    const objectUrl = `/api/r2/object?key=${encodeURIComponent(key)}`

    return NextResponse.json({ key, uploadUrl, objectUrl })
  } catch (error) {
    console.error('Erro ao gerar URL de upload R2:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: message === 'Origem não autorizada' ? 403 : 500 })
  }
}
