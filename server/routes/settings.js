import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getDb, mapSettings } from '../db.js';
import { requirePerm } from '../auth.js';

export default function settingsRouter(uploadsPath) {
  const router = Router();

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsPath),
    filename: (_req, _file, cb) => cb(null, `logo-${Date.now()}.jpg`),
  });
  const upload = multer({ storage });

  router.get('/get', (_req, res) => {
    const row = getDb().prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(mapSettings(row));
  });

  router.post(
    '/post',
    requirePerm('perm_settings'),
    upload.single('imagename'),
    (req, res) => {
      const body = req.body || {};
      let image = body.img || '';

      if (req.file) {
        image = req.file.filename;
      }

      if (String(body.remove) === '1' && body.img) {
        const oldPath = path.join(uploadsPath, body.img);
        try {
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (err) {
          console.error(err);
        }
        if (!req.file) image = '';
      }

      const existing = getDb().prepare('SELECT * FROM settings WHERE id = 1').get();
      const payload = {
        app: body.app || existing?.app || 'Standalone Point of Sale',
        store: body.store ?? existing?.store ?? '',
        address_one: body.address_one ?? existing?.address_one ?? '',
        address_two: body.address_two ?? existing?.address_two ?? '',
        contact: body.contact ?? existing?.contact ?? '',
        tax: body.tax ?? existing?.tax ?? '',
        symbol: body.symbol ?? existing?.symbol ?? '$',
        percentage: parseFloat(body.percentage ?? existing?.percentage ?? 0) || 0,
        charge_tax: body.charge_tax === 'on' || body.charge_tax === true || body.charge_tax === 1 || body.charge_tax === '1' ? 1 : 0,
        footer: body.footer ?? existing?.footer ?? '',
        img: image || existing?.img || '',
        till: parseInt(body.till ?? existing?.till ?? 1, 10) || 1,
        server_ip: body.ip ?? existing?.server_ip ?? '',
        pexels_api_key:
          body.pexels_api_key !== undefined
            ? String(body.pexels_api_key)
            : existing?.pexels_api_key || '',
      };

      getDb()
        .prepare(
          `UPDATE settings SET
            app = ?, store = ?, address_one = ?, address_two = ?, contact = ?,
            tax = ?, symbol = ?, percentage = ?, charge_tax = ?, footer = ?,
            img = ?, till = ?, server_ip = ?, pexels_api_key = ?
           WHERE id = 1`
        )
        .run(
          payload.app,
          payload.store,
          payload.address_one,
          payload.address_two,
          payload.contact,
          payload.tax,
          payload.symbol,
          payload.percentage,
          payload.charge_tax,
          payload.footer,
          payload.img,
          payload.till,
          payload.server_ip,
          payload.pexels_api_key
        );

      const row = getDb().prepare('SELECT * FROM settings WHERE id = 1').get();
      res.json(mapSettings(row));
    }
  );

  return router;
}
