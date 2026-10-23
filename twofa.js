/* Two-step sign-in helpers: authenticator-app codes (TOTP, RFC 6238), recovery codes and a tiny
   built-in email sender (SMTP) for the "code by email" option. No outside packages. */
import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

/* ---------- base32 (what authenticator apps use for the secret) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }

/* ---------- TOTP: 6 digits, 30 seconds ---------- */
export function totpAt(secret, timeMs = Date.now()) {
  const counter = Math.floor(timeMs / 30000);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// Accepts the code from one step before/after, so a slightly-off phone clock still works.
// Returns the matched step number (so the same code can't be used twice) or null.
export function checkTotp(secret, code, timeMs = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const base = Math.floor(timeMs / 30000);
  for (const d of [0, -1, 1]) {
    const expect = totpAt(secret, (base + d) * 30000);
    if (crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(c))) return base + d;
  }
  return null;
}
export function otpauthUrl(secret, account, issuer) {
  const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(account);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ---------- recovery codes (for a lost phone) ---------- */
export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const h = crypto.randomBytes(5).toString('hex').toUpperCase();
    return h.slice(0, 5) + '-' + h.slice(5);
  });
}
export const hashCode = (c) => crypto.createHash('sha256').update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

/* ---------- email code ---------- */
export const newEmailCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export function smtpConfigured(env = process.env) {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
export function maskEmail(e) {
  const [a, b] = String(e || '').split('@');
  if (!b) return '';
  return (a.length <= 2 ? a[0] + '*' : a.slice(0, 2) + '*'.repeat(Math.min(a.length - 2, 6))) + '@' + b;
}
export const looksLikeEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && String(e).length <= 160;

// Minimal SMTP: implicit TLS (port 465) or STARTTLS (587), AUTH LOGIN. Plain text mail only.
export function sendMail({ to, subject, text }, env = process.env) {
  const host = env.SMTP_HOST, port = parseInt(env.SMTP_PORT || '465', 10);
  const user = env.SMTP_USER, pass = env.SMTP_PASS;
  const from = env.SMTP_FROM || user;
  const implicitTls = port === 465 || env.SMTP_SECURE === 'true';
  const clean = (s) => String(s).replace(/[\r\n]+/g, ' ');
  const addr = (s) => { const m = clean(s).match(/<([^>]+)>/); return m ? m[1] : clean(s).trim(); };
  const message = ['From: ' + clean(from), 'To: ' + clean(to), 'Subject: ' + clean(subject), 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8', '', String(text).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'), '.'].join('\r\n');
  // each step: what to send, and the reply code that means "go on"
  const login = [
    { send: 'EHLO erp', ok: 250 }, { send: 'AUTH LOGIN', ok: 334 },
    { send: Buffer.from(user).toString('base64'), ok: 334 }, { send: Buffer.from(pass).toString('base64'), ok: 235 },
    { send: 'MAIL FROM:<' + addr(from) + '>', ok: 250 }, { send: 'RCPT TO:<' + addr(to) + '>', ok: 250 },
    { send: 'DATA', ok: 354 }, { send: message, ok: 250 }, { send: 'QUIT', ok: 221 },
  ];
  return new Promise((resolve, reject) => {
    let sock, buf = '', done = false, steps = null, i = -1;
    const fail = (e) => { if (!done) { done = true; clearTimeout(timer); try { sock && sock.destroy(); } catch (_) {} reject(e instanceof Error ? e : new Error(String(e))); } };
    const finish = () => { if (!done) { done = true; clearTimeout(timer); try { sock.end(); } catch (_) {} resolve(true); } };
    const timer = setTimeout(() => fail(new Error('Email server did not answer in time.')), 20000);
    const next = () => { i++; if (i >= steps.length) return finish(); sock.write(steps[i].send + '\r\n'); };
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/).filter(Boolean);
      if (!lines.length || !/\r?\n$/.test(buf) || !/^\d{3} /.test(lines[lines.length - 1])) return; // reply not complete yet
      const last = lines[lines.length - 1]; const code = parseInt(last.slice(0, 3), 10); buf = '';
      if (i === -1) { if (code !== 220) return fail(new Error('Email server refused the connection.')); steps = implicitTls ? login : [{ send: 'EHLO erp', ok: 250 }, { send: 'STARTTLS', ok: 220 }]; return next(); }
      if (code !== steps[i].ok && steps[i].send !== 'QUIT') return fail(new Error('Email server said: ' + last.slice(0, 120)));
      if (steps[i].send === 'STARTTLS') {
        sock.removeListener('data', onData);
        const t = tls.connect({ socket: sock, servername: host }, () => { sock = t; t.on('data', onData); steps = login; i = -1; next(); });
        t.on('error', fail); return;
      }
      next();
    };
    sock = implicitTls ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    sock.on('data', onData);
    sock.on('error', fail);
    sock.on('close', () => { if (!done) fail(new Error('Email server closed the connection.')); });
  });
}
