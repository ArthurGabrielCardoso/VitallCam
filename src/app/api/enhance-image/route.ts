import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY
const openai = apiKey ? new OpenAI({ apiKey }) : null

export async function POST(req: NextRequest) {
  if (!openai) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 })
  }

  let imageData: string
  try {
    const body = await req.json()
    imageData = body.imageData as string
    if (!imageData) throw new Error('imageData missing')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData
    const buffer = Buffer.from(base64, 'base64')
    const file = new File([buffer], 'photo.jpg', { type: 'image/jpeg' })

    const response = await openai.images.edit({
      model: 'gpt-image-2',
      image: file,
      prompt:
        'Deixa isso o mais nítido possível, resolução 4k mantendo a proporção, ' +
        'iluminando os pontos de escuridão para deixar mais visível e sem mudar nada na imagem.',
      n: 1,
      size: 'auto' as any,
      quality: 'auto' as any,
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('No image returned from OpenAI')

    return NextResponse.json({ imageData: `data:image/png;base64,${b64}` })
  } catch (err: any) {
    console.error('enhance-image error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Enhancement failed' }, { status: 500 })
  }
}
