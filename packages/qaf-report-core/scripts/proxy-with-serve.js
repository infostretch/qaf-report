#!/usr/bin/env node
/**
 * @author Chirag Jayswal, QAF team
 * Proxy that runs both npx serve (static UI) and the dashboard API server.
 *
 * Usage: node scripts/proxy-with-serve.js [port]
 *
 * Forwards: /api/* -> dashboard API (port PROXY+1)
 *           /*     -> npx serve (port PROXY+2) of qaf-dashboard-ui
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { resolveUiStaticRoot } = require('./resolve-ui-static-root.js');
const { resolveProjectRoot } = require('./resolve-project-root.js');

const PROXY_PORT = parseInt(process.argv[2], 10) || 2612;
const API_PORT = PROXY_PORT + 1;
const SERVE_PORT = PROXY_PORT + 2;
const projectRoot = resolveProjectRoot();
const staticUiRoot = resolveUiStaticRoot({ projectRoot });
const serverJs = path.join(__dirname, 'server.js');

function startProcess(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { stdio: 'inherit', cwd, shell: process.platform === 'win32' });
  child.on('error', (e) => console.error(name, 'error:', e.message));
  child.on('exit', (code) => code && console.error(name, 'exited with', code));
  return child;
}

startProcess('API server', 'node', [serverJs, String(API_PORT)], projectRoot);
startProcess('serve', 'npx', ['serve', '-l', String(SERVE_PORT), '-s', staticUiRoot], projectRoot);

setTimeout(() => {
  const proxy = http.createServer((req, res) => {
    const isApi = req.url.startsWith('/api');
    const targetPort = isApi ? API_PORT : SERVE_PORT;
    const opts = {
      hostname: 'localhost',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${targetPort}` }
    };
    const proxyReq = http.request(opts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
      res.writeHead(502);
      res.end('Bad Gateway: ' + e.message);
    });
    req.pipe(proxyReq);
  });
  proxy.listen(PROXY_PORT, () => {
    console.log('Dashboard at http://localhost:' + PROXY_PORT + ' (serve + upload API)');
  });
}, 2000);
