/**
 * POST /api/upload: the raw bytes of one photo or video (Content-Type image/* or video/*).
 * Saved under a random name in <dataDir>/uploads and served from /media/uploads/<file>.
 * The apps send the picture's size in X-Width / X-Height (they know it after resizing).
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import express, { Router } from 'express'
import type { UploadResponse } from '../../shared/types.ts'
import { uploadsDir } from '../config.ts'
import { dimension, FILE_TYPES, HttpError } from './http.ts'

export const mediaRoutes = Router()

mediaRoutes.post('/upload', express.raw({ type: ['image/*', 'video/*'], limit: '150mb' }), async (req, res) => {
  const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  const extension = FILE_TYPES[mime]
  if (!extension) throw new HttpError(415, 'Upload a photo (JPEG, PNG, WebP, GIF, AVIF, HEIC) or a video (MP4, MOV, WebM)')
  const bytes: unknown = req.body
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, 'The file is empty')

  const file = `${crypto.randomBytes(12).toString('base64url')}.${extension}`
  await fs.writeFile(path.join(uploadsDir, file), bytes)
  const response: UploadResponse = {
    url: `/media/uploads/${file}`,
    type: mime.startsWith('video/') ? 'video' : 'image',
    width: dimension(req.headers['x-width']),
    height: dimension(req.headers['x-height']),
  }
  res.json(response)
})
