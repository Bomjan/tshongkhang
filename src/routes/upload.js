import { Router, raw } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { requireSeller, attemptLimit } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

export function uploadRoutes(pool, directory) {
  const router = Router();
  router.post('/products', requireSeller(pool), attemptLimit(30, 60 * 1000),
    raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }), async (req, res) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 32) throw new HttpError(400, 'Choose a valid JPG, PNG or WebP image');
      const type = req.get('content-type')?.split(';')[0].trim().toLowerCase();
      const jpeg = type === 'image/jpeg' && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
        && body.at(-2) === 0xff && body.at(-1) === 0xd9;
      const png = type === 'image/png' && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        && body.subarray(-8, -4).toString() === 'IEND';
      const webp = type === 'image/webp' && body.subarray(0, 4).toString() === 'RIFF'
        && body.subarray(8, 12).toString() === 'WEBP' && body.readUInt32LE(4) + 8 === body.length;
      if (!jpeg && !png && !webp) throw new HttpError(400, 'This file is not a valid JPG, PNG or WebP image');
      const filename = `${randomUUID()}.${jpeg ? 'jpg' : png ? 'png' : 'webp'}`;
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, filename), body, { flag: 'wx' });
      res.status(201).json({ image_url: `/images/uploads/${filename}` });
    });
  return router;
}
