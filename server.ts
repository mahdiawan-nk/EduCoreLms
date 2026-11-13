import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import fastifyMiddie from '@fastify/middie';
import { createServer as createViteServer } from 'vite';
import { buildApiServer } from './src/server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = await buildApiServer();
  await app.register(fastifyMiddie);

  const isProd = process.env.NODE_ENV === 'production';
  const disableHmr = process.env.DISABLE_HMR === 'true';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Bind HMR WebSocket directly to Fastify HTTP server on the same port
        // Avoids fallback standalone HMR server on port 24678
        ws: disableHmr ? false : { server: app.server },
        hmr: disableHmr ? false : { server: app.server },
      },
      appType: 'spa',
    });

    app.use((req, res, next) => {
      const host = req.headers.host || '';
      // 0.0.0.0 is an INADDR_ANY server socket bind address, not a valid browser destination.
      // If a browser connects via 0.0.0.0, redirect to localhost so cookies, storage,
      // and WebSockets operate within a valid, trustworthy browser origin.
      if (host.startsWith('0.0.0.0') && !req.url?.startsWith('/api/')) {
        const redirectHost = host.replace(/^0\.0\.0\.0/, 'localhost');
        res.writeHead(302, { Location: `http://${redirectHost}${req.url || '/'}` });
        return res.end();
      }

      if (req.url && req.url.startsWith('/api/')) {
        return next();
      }
      return vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.get('/*', async (req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan', details: [] },
        });
      }
      const requestedPath = path.join(distPath, req.url.split('?')[0]);
      if (
        fs.existsSync(requestedPath) &&
        fs.statSync(requestedPath).isFile()
      ) {
        const ext = path.extname(requestedPath);
        const mimeMap: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
          '.ico': 'image/x-icon',
          '.png': 'image/png',
        };
        reply.type(mimeMap[ext] || 'application/octet-stream');
        return reply.send(fs.readFileSync(requestedPath));
      }
      reply.type('text/html');
      return reply.send(fs.readFileSync(path.join(distPath, 'index.html')));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`\n  Politeknik Kampar LMS (Fastify + PostgreSQL)`);
  console.log(`  ➜  Local:   http://localhost:${port}/`);
  console.log(`  ➜  Network: http://0.0.0.0:${port}/ (listening on all interfaces)\n`);
}

startServer().catch((err) => {
  console.error('Failed to start Politeknik Kampar LMS server:', err);
  process.exit(1);
});
