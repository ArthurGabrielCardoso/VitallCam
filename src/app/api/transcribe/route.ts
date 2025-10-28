import { NextRequest, NextResponse } from 'next/server'

const MODAL_ENDPOINT = process.env.MODAL_WHISPERX_ENDPOINT!

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const language = formData.get('language') as string || 'pt'

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    if (!MODAL_ENDPOINT) {
      return NextResponse.json(
        { error: 'Modal endpoint not configured' },
        { status: 500 }
      )
    }

    // Criar FormData para enviar ao Modal
    // IMPORTANTE: O Modal espera um campo chamado 'audio_file' do tipo File ou Blob com nome
    const modalFormData = new FormData()
    modalFormData.append('audio_file', audioFile, audioFile.name || 'audio.webm')
    modalFormData.append('language', 'pt') // SEMPRE PORTUGUÊS

    // Chamar API do Modal
    const response = await fetch(MODAL_ENDPOINT, {
      method: 'POST',
      body: modalFormData,
    })

    if (!response.ok) {
      throw new Error(`Modal API error: ${response.statusText}`)
    }

    const result = await response.json()

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Transcription API error:', error)
    return NextResponse.json(
      {
        error: 'Transcription failed',
        message: error.message
      },
      { status: 500 }
    )
  }
}

// Endpoint para transcrição streaming (chunks)
export async function PUT(request: NextRequest) {
  try {
    const { chunks, language = 'pt' } = await request.json()

    if (!chunks || !Array.isArray(chunks)) {
      return NextResponse.json(
        { error: 'Invalid chunks data' },
        { status: 400 }
      )
    }

    if (!MODAL_ENDPOINT) {
      return NextResponse.json(
        { error: 'Modal endpoint not configured' },
        { status: 500 }
      )
    }

    // Para streaming, você pode implementar chamadas sequenciais
    // ou processar em batch dependendo da sua necessidade

    // Por enquanto, vamos processar um chunk de cada vez
    const results = []

    for (const chunkBase64 of chunks) {
      const audioBytes = Buffer.from(chunkBase64, 'base64')

      const formData = new FormData()
      formData.append('audio_file', new Blob([audioBytes]))
      formData.append('language', language)

      const response = await fetch(MODAL_ENDPOINT, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        results.push(result)
      }
    }

    // Combinar resultados
    const combinedText = results
      .map(r => r.text)
      .filter(Boolean)
      .join(' ')

    const allSegments = results
      .flatMap(r => r.segments || [])

    return NextResponse.json({
      success: true,
      text: combinedText,
      segments: allSegments,
      chunks_processed: results.length
    })

  } catch (error: any) {
    console.error('Streaming transcription error:', error)
    return NextResponse.json(
      {
        error: 'Streaming transcription failed',
        message: error.message
      },
      { status: 500 }
    )
  }
}
