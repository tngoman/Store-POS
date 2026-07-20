import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';
import { requireAnyPerm } from '../auth.js';

function getPexelsKey() {
  const row = getDb().prepare('SELECT pexels_api_key FROM settings WHERE id = 1').get();
  return (row?.pexels_api_key || '').trim();
}

function mapMedia(row) {
  return {
    id: row.id,
    filename: row.filename,
    path: `library/${row.filename}`,
    source: row.source,
    pexels_id: row.pexels_id,
    photographer: row.photographer,
    alt: row.alt,
    created_at: row.created_at,
  };
}

export default function mediaRouter(uploadsPath) {
  const libraryDir = path.join(uploadsPath, 'library');
  fs.mkdirSync(libraryDir, { recursive: true });

  const router = Router();
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, libraryDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `upload-${Date.now()}${ext}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image uploads are allowed'));
      }
      cb(null, true);
    },
  });

  router.get('/library', (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM media_library ORDER BY id DESC')
      .all();
    res.json(rows.map(mapMedia));
  });

  router.post('/upload', requireAnyPerm('perm_products', 'perm_settings'), upload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const result = getDb()
      .prepare(
        `INSERT INTO media_library (filename, source, photographer, alt, created_at)
         VALUES (?, 'upload', '', ?, ?)`
      )
      .run(req.file.filename, req.body?.alt || '', new Date().toISOString());
    const row = getDb()
      .prepare('SELECT * FROM media_library WHERE id = ?')
      .get(result.lastInsertRowid);
    res.json(mapMedia(row));
  });

  router.delete('/library/:id', requireAnyPerm('perm_products', 'perm_settings'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = getDb().prepare('SELECT * FROM media_library WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    getDb().prepare('DELETE FROM media_library WHERE id = ?').run(id);
    const filePath = path.join(libraryDir, row.filename);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error(err);
    }
    res.sendStatus(200);
  });

  router.get('/pexels/search', requireAnyPerm('perm_products', 'perm_settings'), async (req, res) => {
    const key = getPexelsKey();
    if (!key) {
      return res.status(400).json({
        error: 'Add a Pexels API key in Settings first.',
      });
    }
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Search query required' });
    const page = parseInt(String(req.query.page || '1'), 10) || 1;
    const perPage = Math.min(parseInt(String(req.query.per_page || '20'), 10) || 20, 40);

    try {
      const url = new URL('https://api.pexels.com/v1/search');
      url.searchParams.set('query', q);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('orientation', 'square');

      const response = await fetch(url, {
        headers: { Authorization: key },
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({
          error: text || 'Pexels search failed',
        });
      }
      const data = await response.json();
      const photos = (data.photos || []).map((p) => ({
        id: p.id,
        photographer: p.photographer,
        alt: p.alt || q,
        preview: p.src?.medium || p.src?.small,
        download: p.src?.large || p.src?.original || p.src?.medium,
        url: p.url,
      }));
      res.json({
        page: data.page,
        per_page: data.per_page,
        total_results: data.total_results,
        photos,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Pexels request failed' });
    }
  });

  router.post('/pexels/download', requireAnyPerm('perm_products', 'perm_settings'), async (req, res) => {
    const key = getPexelsKey();
    if (!key) {
      return res.status(400).json({ error: 'Add a Pexels API key in Settings first.' });
    }

    const body = req.body || {};
    const photoId = parseInt(body.photoId, 10);
    const imageUrl = body.imageUrl;
    if (!photoId || !imageUrl) {
      return res.status(400).json({ error: 'photoId and imageUrl are required' });
    }

    const existing = getDb()
      .prepare('SELECT * FROM media_library WHERE pexels_id = ?')
      .get(photoId);
    if (existing) {
      return res.json(mapMedia(existing));
    }

    try {
      const response = await fetch(imageUrl, {
        headers: { Authorization: key },
      });
      if (!response.ok) {
        return res.status(502).json({ error: 'Failed to download image from Pexels' });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `pexels-${photoId}-${Date.now()}.jpg`;
      fs.writeFileSync(path.join(libraryDir, filename), buffer);

      const result = getDb()
        .prepare(
          `INSERT INTO media_library (filename, source, pexels_id, photographer, alt, created_at)
           VALUES (?, 'pexels', ?, ?, ?, ?)`
        )
        .run(
          filename,
          photoId,
          body.photographer || '',
          body.alt || '',
          new Date().toISOString()
        );
      const row = getDb()
        .prepare('SELECT * FROM media_library WHERE id = ?')
        .get(result.lastInsertRowid);
      res.json(mapMedia(row));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || 'Download failed' });
    }
  });

  return router;
}
