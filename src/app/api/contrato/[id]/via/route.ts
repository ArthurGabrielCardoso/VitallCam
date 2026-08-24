/**
 * Entrega a via assinada ao paciente, pelo link mandado no WhatsApp.
 *
 * Abre no celular dele, fora do app: não há sessão nem origem pra conferir, só
 * o token. Por isso a validação vem antes de qualquer consulta ao banco.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getR2Client, getR2Config, isValidR2Key } from '@/lib/r2'
import { SegredoAusenteError, validarToken } from '@/lib/contrato-link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Mensagens curtas e em português: quem lê isso é o paciente, não a clínica. */
function aviso(titulo: string, texto: string, status: number) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${titulo}</title></head>
     <body style="font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;
                  align-items:center;justify-content:center;background:#f9fafb;color:#374151">
       <div style="max-width:32ch;text-align:center;padding:24px">
         <h1 style="font-size:18px;margin:0 0 8px">${titulo}</h1>
         <p style="font-size:14px;line-height:1.5;margin:0;color:#6b7280">${texto}</p>
       </div>
     </body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const token = new URL(request.url).searchParams.get('t') || ''

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return aviso('Link inválido', 'Peça uma nova cópia na recepção da clínica.', 400)
    }

    const resultado = validarToken(id, token)
    if (resultado === 'expirado') {
      return aviso('Link expirado', 'Este link vale por 7 dias. Peça uma nova cópia na recepção da clínica.', 410)
    }
    if (resultado !== 'ok') {
      return aviso('Link inválido', 'Peça uma nova cópia na recepção da clínica.', 403)
    }

    const supabase = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    )
    const { data, error } = await supabase
      .from('contratos_emitidos')
      .select('via_assinada_key')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error

    const key = (data as { via_assinada_key?: string | null } | null)?.via_assinada_key
    if (!key || !isValidR2Key(key)) {
      return aviso('Documento indisponível', 'Peça uma nova cópia na recepção da clínica.', 404)
    }

    const config = getR2Config()
    const signedUrl = await getSignedUrl(
      getR2Client(),
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: 15 * 60 },
    )

    const response = NextResponse.redirect(signedUrl, 307)
    // Nunca em cache compartilhado: é documento de um paciente só.
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof SegredoAusenteError) {
      return aviso('Indisponível', 'Peça uma cópia na recepção da clínica.', 503)
    }
    console.error('Erro ao entregar via assinada:', error)
    return aviso('Não foi possível abrir', 'Tente de novo mais tarde ou peça na recepção da clínica.', 500)
  }
}
