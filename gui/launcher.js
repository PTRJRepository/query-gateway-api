import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const GUI_PORT = 3000;
const API_URL = 'http://localhost:8001'; // The main API URL

const fastify = Fastify({ logger: true });

// 1. Serve the HTML file for root
fastify.get('/', async (request, reply) => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    reply.type('text/html').send(html);
});

// 2. Proxy middleware to bypass CORS
// Maps requests from /proxy/v1/query -> http://localhost:8001/v1/query
fastify.all('/proxy/*', async (request, reply) => {
    const targetPath = request.url.replace('/proxy', ''); // Strip /proxy prefix
    const targetUrl = `${API_URL}${targetPath}`;
    
    request.log.info(`Proxying request: ${request.url} -> ${targetUrl}`);

    try {
        // Forward the request to the main API
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: {
                'content-type': 'application/json',
                // Forward the auth token if present
                'x-api-key': request.headers['x-api-key'] || '',
            },
            body: ['GET', 'HEAD'].includes(request.method) ? undefined : JSON.stringify(request.body),
        });

        // Forward the response back to the GUI
        const data = await response.json();
        reply.code(response.status).send(data);
    } catch (error) {
        request.log.error(error);
        reply.code(502).send({ 
            success: false, 
            error: `Proxy Error: Failed to connect to backend at ${API_URL}. Is it running?` 
        });
    }
});

// Start the GUI server
const start = async () => {
    try {
        await fastify.listen({ port: GUI_PORT });
        console.log(`\n🖥️  GUI Client running at: http://localhost:${GUI_PORT}`);
        console.log(`🔗 Proxying API requests to: ${API_URL}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
