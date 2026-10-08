import { randomUUID } from 'crypto'
import { S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { z } from 'zod'
import { canteenForSession } from '@/lib/auth/canteen'
import { requireSession } from '@/lib/auth/session'
import { AppError, fail, ok } from '@/lib/http'

const schema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().min(1).max(5 * 1024 * 1024),
})

const extension: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const { contentType, size } = schema.parse(await req.json())
    const bucket = process.env.IMAGE_STORAGE_BUCKET
    const publicBase = process.env.IMAGE_STORAGE_PUBLIC_URL?.replace(/\/+$/, '')
    const region = process.env.IMAGE_STORAGE_REGION
    if (!bucket || !publicBase || !region) {
      throw new AppError('IMAGE_STORAGE_NOT_CONFIGURED', 'Image uploads are not configured. Set the storage bucket, region, and public URL.', 503)
    }
    const endpoint = process.env.IMAGE_STORAGE_ENDPOINT
    const accessKeyId = process.env.IMAGE_STORAGE_ACCESS_KEY_ID
    const secretAccessKey = process.env.IMAGE_STORAGE_SECRET_ACCESS_KEY
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new AppError('IMAGE_STORAGE_INVALID_CONFIG', 'Configure both image-storage access key values or use the hosting provider identity.', 503)
    }
    const key = `${canteenId}/${randomUUID()}.${extension[contentType]}`
    const client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    })
    const signed = await createPresignedPost(client, {
      Bucket: bucket,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', 1, size],
        ['eq', '$Content-Type', contentType],
      ],
    })
    const publicUrl = `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`
    return ok({ ...signed, publicUrl })
  } catch (e) {
    return fail(e)
  }
}
