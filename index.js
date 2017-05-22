// Process environment settings.
require('dotenv').config();

// Requirements.
const toobusy = require('toobusy-js');
const server = require('./modules/server');

// Settings.
const WEB_PORT = parseInt(process.env.WEB_PORT) || 8080;
const WEB_HOST = process.env.WEB_HOST || '0.0.0.0';

// Start.
server.listen(WEB_PORT, WEB_HOST, function () {
    console.log('%s listening at %s.', server.name, server.url);
});

process.on('SIGINT', function () {
    server.close();
    // Calling .shutdown allows your process to exit normally.
    toobusy.shutdown();
    process.exit();
});
