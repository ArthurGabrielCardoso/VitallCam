import 'server-only'

import { S3Client } from '@aws-sdk/client-s3'

const requiredEnv = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
] as const

export function getR2Config() {
  const missing = requiredEnv.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Configuração R2 ausente: ${missing.join(', ')}`)
  }

  const accountId = process.env.R2_ACCOUNT_ID!
  const endpoint = (process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`)
    .replace(/\/$/, '')

  return {
    accountId,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET_NAME!,
    endpoint,
  }
}

let client: S3Client | null = null

export function getR2Client() {
  if (client) return client

  const config = getR2Config()
  client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  return client
}

export function isValidR2Key(key: string) {
  return /^patients\/[0-9a-f-]{36}\/(photos|videos|profile)\/[a-zA-Z0-9._-]+$/.test(key)
    && !key.includes('..')
}

export function assertAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return

  const allowedOrigins = new Set([
    'https://vitallcam.vercel.app',
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ].filter(Boolean))

  if (!allowedOrigins.has(origin)) {
    throw new Error('Origem não autorizada')
  }
}
