// в начале файла
const https = require('https');
const { URL } = require('url');

function httpsRequest(method, urlString, { headers = {}, body, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);

    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers,
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let parsed = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch (_) {}
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: raw,
          json: parsed,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timeout'));
    });

    if (body) {
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        body = JSON.stringify(body);
        if (!headers['Content-Type']) {
          req.setHeader('Content-Type', 'application/json');
        }
      }
      req.write(body);
    }

    req.end();
  });
}

module.exports = { httpsRequest };
