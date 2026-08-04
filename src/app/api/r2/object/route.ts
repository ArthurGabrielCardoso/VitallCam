import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextResponse } from 'next/server'
import { assertAllowedOrigin, getR2Client, getR2Config, isValidR2Key } from '@/lib/r2'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get('key') || ''
    if (!isValidR2Key(key)) {
      return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 })
    }

    const config = getR2Config()
    const signedUrl = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: 15 * 60 },
    )

    const response = NextResponse.redirect(signedUrl, 307)
    response.headers.set('Cache-Control', 'private, max-age=600')
    return response
  } catch (error) {
    console.error('Erro ao abrir objeto R2:', error)
    return NextResponse.json({ error: 'Não foi possível abrir o arquivo' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    assertAllowedOrigin(request)
    const { key } = await request.json()
    if (!isValidR2Key(key || '')) {
      return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 })
    }

    const config = getR2Config()
    await getR2Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao remover objeto R2:', error)
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: message === 'Origem não autorizada' ? 403 : 500 })
  }
}
