// Process environment settings.
require('dotenv').config();

// Requirements.
const toobusy = require('toobusy-js');
const servers = require('./modules/server');

// Settings.
const WEB_PORT = parseInt(process.env.WEB_PORT) || 8080;
const WEB_SSL_PORT = parseInt(process.env.WEB_SSL_PORT) || 8081;
const WEB_HOST = process.env.WEB_HOST || '0.0.0.0';

const ENABLE_HTTPS = (process.env.ENABLE_HTTPS === 'true');

const HTTP_SERVER = servers.http;
const HTTPS_SERVER = servers.https;

// Start.
HTTP_SERVER.listen(WEB_PORT, WEB_HOST, function () {
    console.log('%s listening for HTTP at %s.', HTTP_SERVER.name, HTTP_SERVER.url);
});

if (ENABLE_HTTPS) {
    HTTPS_SERVER.listen(WEB_SSL_PORT, WEB_HOST, function () {
        console.log('%s listening for HTTPS at %s.', HTTPS_SERVER.name, HTTPS_SERVER.url);
    });
}

process.on('SIGINT', function () {
    server.close();
    // Calling .shutdown allows your process to exit normally.
    toobusy.shutdown();
    process.exit();
});
