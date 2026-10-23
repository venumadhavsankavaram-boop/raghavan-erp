// A pretend Razorpay for testing the online-payment flow without real money.
import http from 'node:http';
import crypto from 'node:crypto';
export function startFakeRazorpay(port, keyId, keySecret) {
  const orders = new Map(), payments = new Map();
  const id = p => p + '_' + crypto.randomBytes(7).toString('hex');
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/__')) { // test controls (no auth)
      if (url.pathname === '/__pay') {
        const o = orders.get(body.order_id); if (!o) return send(404, {});
        const p = { id: id('pay'), order_id: o.id, amount: body.amount ?? o.amount, currency: 'INR', status: body.status || 'captured' };
        payments.set(p.id, p); return send(200, p);
      }
      return send(404, {});
    }
    const want = 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64');
    if (req.headers.authorization !== want) return send(401, { error: { description: 'Authentication failed' } });
    if (req.method === 'POST' && url.pathname === '/v1/orders') {
      const o = { id: id('order'), amount: body.amount, currency: body.currency, status: 'created', notes: body.notes }; orders.set(o.id, o); return send(200, o);
    }
    let m;
    if (req.method === 'GET' && (m = /^\/v1\/payments\/([^/]+)$/.exec(url.pathname))) { const p = payments.get(m[1]); return p ? send(200, p) : send(400, { error: { description: 'not found' } }); }
    if (req.method === 'POST' && (m = /^\/v1\/payments\/([^/]+)\/capture$/.exec(url.pathname))) { const p = payments.get(m[1]); if (!p) return send(400, {}); p.status = 'captured'; return send(200, p); }
    if (req.method === 'GET' && (m = /^\/v1\/orders\/([^/]+)\/payments$/.exec(url.pathname))) return send(200, { items: [...payments.values()].filter(p => p.order_id === m[1]) });
    return send(404, { error: { description: 'no such route' } });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}
