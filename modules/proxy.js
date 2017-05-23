// Process environment settings.
require('dotenv').config();

const fs = require('fs');
const request = require('request');
const CircularList = require('easy-circular-list');

// Settings.
const DEBUG = (process.env.DEBUG === 'true') || false;
const ENABLE_PROXIES = (process.env.ENABLE_PROXIES === 'true') || false;
const PROXY_LIST_PATH = process.env.PROXY_LIST_PATH || 'proxies.txt';

const RESPONSE_SIZE_LIMIT = parseInt(process.env.RESPONSE_SIZE_LIMIT) || 2097152;

const blockedPhrases = [
    'porn',
    'sexy'
];

const requireHeader = [
    'origin',
    'x-requested-with',
];

const clientHeadersBlacklist = new Set([
    'host',
    'cookie',
]);
const serverHeadersBlacklist = new Set([
    'set-cookie',
    'connection',
    'access-control-allow-origin'
]);


// Application.
var proxies = [];

if (ENABLE_PROXIES) {
    if (fs.existsSync(PROXY_LIST_PATH)) {
        let proxy_list = fs.readFileSync(PROXY_LIST_PATH, 'utf8').split(/\r?\n/)

        for (var i = 0; i < proxy_list.length; i++) {
            let proxy = proxy_list[i].strip();

            if (proxy.length > 0)
                proxies.push(proxy_list[i]);
        }
    } else {
        throw Error('Proxies are enabled, but proxy path does not exist: ' + PROXY_LIST_PATH + '.');
    }

    proxies = new CircularList(proxies);
}


/*
 * Handle GET requests.
 */
function get(req, res, next) {
    // Enable CORS.
    res.header('Access-Control-Allow-Origin', '*');

    var url = req.url.substr(1);
    var using_https = (url.indexOf('https:') !== -1);

    // Disallow blocked phrases.
    if (url.match(blockedPhrases)) {
        return res.send(403, 'Disallowed URL.');
    }

    // Require Origin header.
    if (!requireHeader.some(header => req.headers[header])) {
        return res.send(403, 'Header "origin" is required.');
    }

    // Log.
    if (DEBUG)
        console.log('Received proxy request to: %s.', url);

    // TODO: Redirect same origin.

    // Forward client headers to server.
    var headers = {};

    for (var header in req.headers) {
        if (!clientHeadersBlacklist.has(header.toLowerCase())) {
            headers[header] = req.headers[header];
        }
    }

    var forwardedFor = req.headers['X-Fowarded-For'];
    headers['X-Fowarded-For'] = (forwardedFor ? forwardedFor + ',' : '') + req.connection.remoteAddress;

    // File size limiter.
    var data_size = 0;

    // Request options.
    var request_options = {
        'url': url,
        'headers': headers
    };

    // Using a proxy?
    if (ENABLE_PROXIES) {
        let proxy = proxies.getNext();

        if (DEBUG)
            console.log('Using proxy %s for request...', proxy);

        request_options.proxy = proxy;
    }

    // Send request.
    request
        .get(request_options)
        .on('response', function (page) {
            // Check content length.
            if (Number(page.headers['content-length']) > RESPONSE_SIZE_LIMIT) {
                return res.send(413, 'Maximum allowed size is ' + RESPONSE_SIZE_LIMIT + ' bytes.');
            }

            // Reply w/ proper status code.
            res.statusCode = page.statusCode;

            if (DEBUG)
                console.log('Received %s as response code.', page.statusCode)

            // If the page already supports cors, redirect to the URL.
            // TODO: Is this the optimal way of doing this?
            if (page.headers['access-control-allow-origin'] === '*') {
                return res.redirect(url, next);
            }

            // Remove blacklisted headers.
            for (var header in page.headers) {
                if (!serverHeadersBlacklist.has(header.toLowerCase())) {
                    res.header(header, page.headers[header]);
                }
            }

            // Must flush here, otherwise pipe() will include the headers!
            res.flushHeaders();
        }).on('error', function (err) {
            console.log(err);
            return res.abort();
        }).on('end', function () {
            if (DEBUG)
                console.log('Request to %s has ended.', url)

            return res.end(); // End the response when the stream ends.
        }).pipe(res); // Stream requested url to response.
}

/*
 * Opts handler allows us to use our own CORS preflight settings.
 */
function opts(req, res, next) { // Couple of lines taken from http://stackoverflow.com/questions/14338683
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET'); // Only allow GET for now
    res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers'));
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hrs if supported
    res.send(200);
    next();
}

module.exports = {
    get,
    opts
};
