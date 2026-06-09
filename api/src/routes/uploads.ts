import { Hono } from 'hono';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

const uploads = new Hono();

// Asegurar que la carpeta uploads existe
const UPLOADS_DIR = './uploads';
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

uploads.post('/', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No se recibió ningún archivo válido en el campo "file"' }, 400);
    }

    // Validar tipo de archivo (solo imágenes)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Formato de archivo no permitido. Solo se aceptan imágenes (JPEG, PNG, WEBP)' }, 400);
    }

    // Validar tamaño (máximo 5MB)
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return c.json({ error: 'El archivo excede el tamaño máximo permitido de 5MB' }, 400);
    }

    const fileExt = extname(file.name) || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${fileExt}`;
    const filePath = join(UPLOADS_DIR, filename);

    const buffer = await file.arrayBuffer();
    writeFileSync(filePath, Buffer.from(buffer));

    // Retornar la ruta accesible públicamente
    const fileUrl = `/api/uploads/${filename}`;
    return c.json({ url: fileUrl }, 201);
  } catch (err) {
    console.error('[Upload] Error:', err);
    return c.json({ error: 'Error al subir el archivo' }, 500);
  }
});

export default uploads;
