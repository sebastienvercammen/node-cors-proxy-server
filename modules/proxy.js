const request = require('request');

// Settings.
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
]);



/*
 * Handle GET requests.
 */
function get(req, res, next) {
    // Enable CORS.
    res.header('Access-Control-Allow-Origin', '*');

    var url = req.url.substr(1);

    // Disallow blocked phrases.
    if (url.match(blockedPhrases)) {
        return res.send(403, 'Disallowed URL.');
    }

    // require Origin header
    if (!requireHeader.some(header => req.headers[header])) {
        return res.send(403, 'Header "origin" is required.');
    }

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

    // Send request.
    request
        .get(url, {
            headers
        })
        .on('response', function (page) {
            // Check content length.
            if (Number(page.headers['content-length']) > RESPONSE_SIZE_LIMIT) {
                return res.send(413, 'Maximum allowed size is ' + RESPONSE_SIZE_LIMIT + ' bytes.');
            }

            // Reply w/ proper status code.
            res.statusCode = page.statusCode;

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
                res.abort(); // Kills response and request cleanly.
            }
        }).on('end', function () {
            res.end(); // End the response when the stream ends
        }).pipe(res); // Stream requested url to response;

    // Routing.
    next();
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
