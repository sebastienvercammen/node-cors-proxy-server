// Process environment settings.
require('dotenv').config();

const request = require('request');
const CircularList = require('easy-circular-list');

// Settings.
const ENABLE_PROXIES = (process.env.ENABLE_PROXIES === 'true');
const HTTP_PROXY_LIST_PATH = process.env.HTTP_PROXY_LIST_PATH || 'http_proxies.txt';
const HTTPS_PROXY_LIST_PATH = process.env.HTTPS_PROXY_LIST_PATH || 'https_proxies.txt';

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
    'connection'
]);


// Application.
var http_proxies;
var https_proxies;

if (ENABLE_PROXIES) {
    http_proxies = new CircularList(fs.readFileSync(HTTP_PROXY_LIST_PATH, 'utf8').split(/\r?\n/));
    https_proxies = new CircularList(fs.readFileSync(HTTPS_PROXY_LIST_PATH, 'utf8').split(/\r?\n/));
}


/*
 * Handle GET requests.
 */
function get(req, res, next) {
    // Enable CORS.
    res.header('Access-Control-Allow-Origin', '*');
    
    // No delay.
    res.setNoDelay(true);

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
        let proxy = '';

        if (using_https) {
            proxy = https_proxies.getNext();
        } else {
            proxy = http_proxies.getNext();
        }

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

            console.log('Received %s as response code.', page.statusCode)

            // If the page already supports cors, redirect to the URL.
            // TODO: Is this the optimal way of doing this?
            if (page.headers['access-control-allow-origin'] === '*') {
                return res.redirect(url, next);
            }

            // Remove blacklisted headers.
            for (var header in page.headers) {
                if (!serverHeadersBlacklist.has(header)) {
                    res.header(header, page.headers[header]);
                }
            }

            // Must flush here, otherwise pipe() will include the headers!
            res.flushHeaders();
        }).on('data', function (chunk) {
            data += chunk.length;

            if (data > RESPONSE_SIZE_LIMIT) {
                //return res.send(413, 'Maximum allowed size is ' + RESPONSE_SIZE_LIMIT + ' bytes.');
                return res.abort();
            }
        }).on('error', function (err) {
            console.log(err);
            return res.abort();
        }).on('end', function () {
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
