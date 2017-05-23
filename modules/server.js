// Process environment settings.
require('dotenv').config();

// Requirements.
const restify = require('restify');
const toobusy = require('toobusy-js');
const fs = require('fs');
var proxy = require('./proxy');

// Settings.
const SERVER_NAME = process.env.SERVER_NAME || 'cors.devkat.org';
const THROTTLE_ON = process.env.THROTTLE_ON || 'XFF'; // IP or X-Forwarded-For.
const THROTTLE_ON_IP = (THROTTLE_ON.toUpperCase() === 'IP');
const THROTTLE_ON_XFF = !THROTTLE_ON_IP;

const MAX_LAG_MS = parseInt(process.env.MAX_LAG_MS) || 70;
const LAG_INTERVAL_MS = parseInt(process.env.LAG_INTERVAL_MS) || 500;

const ENABLE_HTTPS = (process.env.ENABLE_HTTPS === 'true');
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/etc/ssl/self-signed/server.key';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/ssl/self-signed/server.crt';

const HTTP_OPTIONS = {
    name: SERVER_NAME
};
const HTTPS_OPTIONS = {
    key: fs.readFileSync(SSL_KEY_PATH),
    certificate: fs.readFileSync(SSL_CERT_PATH),
    name: SERVER_NAME
};

// Start.
const HTTP_SERVER = restify.createServer(HTTP_OPTIONS);
const HTTPS_SERVER = (ENABLE_HTTPS) ? restify.createServer(HTTPS_OPTIONS) : null;

// Load limiter.
toobusy.maxLag(MAX_LAG_MS);
toobusy.interval(LAG_INTERVAL_MS);

toobusy.onLag(function (currentLag) {
    currentLag = Math.round(currentLag);
    console.error('Event loop lag detected! Latency: ' + currentLag + 'ms.');
});

// Throttling tiers.
const throttleTierOne = restify.throttle({
    rate: 3,
    burst: 10,
    ip: THROTTLE_ON_IP,
    xff: THROTTLE_ON_XFF,
    overrides: {
        '192.168.1.1': {
            rate: 0, // unlimited
            burst: 0
        }
    }
});

// Setup.
function setup_server(server) {
    server.use(restify.queryParser({
        mapParams: false
    }));

    server.use(function (req, res, next) {
        if (toobusy()) {
            res.send(503, 'Server is busy! Please try again later.');
        } else {
            next();
        }
    });

    // CORS.
    server.opts('/', proxy.opts);

    // Request handlers.
    server.get(/^\/(https?:\/\/.+)/, throttleTierOne, proxy.get);
    // NOT READY:
    // server.post(/^\/(http:\/\/.+)/, throttleTierOne, proxy.post);
    // server.put(/^\/(http:\/\/.+)/, throttleTierOne, proxy.put);
}

// Set up both HTTP and HTTPS.
setup_server(HTTP_SERVER);
if (ENABLE_HTTPS) setup_server(HTTPS_SERVER);

// Export.
module.exports = {
    'http': HTTP_SERVER,
    'https': HTTPS_SERVER
};
