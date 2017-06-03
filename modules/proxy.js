// Process environment settings.
require('dotenv').config();

const fs = require('fs');
const request = require('request');

// Settings.
const DEBUG = (process.env.DEBUG === 'true') || false;
const ENABLE_PROXIES = (process.env.ENABLE_PROXIES === 'true') || false;
const PROXY_LIST_PATH = process.env.PROXY_LIST_PATH || 'proxies.txt';

const RESPONSE_SIZE_LIMIT = parseInt(process.env.RESPONSE_SIZE_LIMIT) || 2097152;

// API per-IP rate limiting. Rate limit is based on x sleep after we've 
// sent y requests (burst rate limiter). Tests showed 6, then 60s sleep.
const REQS_TILL_RATE_LIMIT = parseInt(process.env.REQS_TILL_RATE_LIMIT) || 5;
const RATE_LIMIT_SLEEP_IN_MS = parseInt(process.env.RATE_LIMIT_SLEEP_IN_MS) || 60000;

// 
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
var last_request = new Date('1-1-1970'); // Used for rate limiting if we don't have proxies.
var num_calls = 0;

var proxies = [];

if (ENABLE_PROXIES) {
    if (fs.existsSync(PROXY_LIST_PATH)) {
        let proxy_list = fs.readFileSync(PROXY_LIST_PATH, 'utf8').split(/\r?\n/);
        let now = Date.now();

        for (var i = 0; i < proxy_list.length; i++) {
            let proxy = proxy_list[i].trim();

            if (proxy.length > 0) {
                proxies.push({
                    'proxy': proxy_list[i],
                    'uses': 0,
                    'available_at': now
                });
            }
        }
    } else {
        throw Error('Proxies are enabled, but proxy path does not exist: ' + PROXY_LIST_PATH + '.');
    }
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
    if (DEBUG) {
        console.log('Received proxy request to: %s.', url);
    }

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

    // Using a proxy?
    if (ENABLE_PROXIES) {
        let proxy = findBestProxy(proxies);

        // Time to sleep?
        if (typeof proxy === 'number') {
            // Rate limited!
            if (DEBUG) {
                console.log('Rate limited. Next available in %s ms.', proxy);
            }

            return res.send(429, proxy);
        } else {
            // Yay, we have a proxy!
            if (DEBUG) {
                console.log('Using proxy %s for request...', proxy['proxy']);
            }

            sendRequest(req, res, proxy);
        }
    } else {
        // No proxy.
        num_calls += 1;

        // Below the rate limit or it's the last request.
        if (num_calls <= REQS_TILL_RATE_LIMIT) {
            return sendRequest(req, res);
        }

        // Whoops, rate limit.
        let now = Date.now();
        let next_available = last_request + RATE_LIMIT_SLEEP_IN_MS;
        let sleep_ms = next_available - now;

        if (DEBUG) {
            console.log('Rate limited. Next available in %s ms.', sleep_ms);
        }

        // Clear the counter on time.
        setTimeout(function () {
            num_calls = 0;
        }, sleep_ms);

        return res.send(429, sleep_ms);
    }
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


/*
 * Helpers.
 */

// Get best proxy to use for next request, or return the amount of ms we need
// to wait until one is available again.
// Fields in a proxy item: 'proxy', 'uses', 'available_at'.
function findBestProxy(proxies) {
    let now = Date.now();

    // Return time to wait (in ms) for the earliest available proxy.
    let min_waiting_time_ms = 0;

    for (let i = 0; i < proxies.length; i++) {
        let proxy = proxies[i];

        // Is this one available already?
        if (now > proxy.available_at)
            return proxy;

        // It's not available yet, so update min_waiting_time_ms.
        let time_left_ms = proxy.available_at - now;

        if (time_left_ms < min_waiting_time_ms)
            min_waiting_time_ms = time_left_ms;
    }

    // None available, return time to wait.
    return min_waiting_time_ms;
}

// Send request.
// Fields in a proxy item: 'proxy', 'uses', 'available_at'.
function sendRequest(req, res, proxy) {
    // Update timer.
    last_request = Date.now();

    // Request options.
    var request_options = {
        'url': url,
        'headers': headers
    };

    // Using a proxy?
    if (typeof proxy !== 'undefined') {
        request_options.proxy = proxy.proxy;

        // Update proxy.
        proxy.uses += 1;

        // Time for bed after this request?
        if (proxy.uses === REQS_TILL_RATE_LIMIT) {
            let available_at = Date.now() + RATE_LIMIT_SLEEP_IN_MS;
            proxy.available_at = available_at;
            proxy.uses = 0;
        }
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

            if (DEBUG) {
                console.log('Received %s as response code.', page.statusCode);
            }

            // If the page already supports cors, redirect to the URL.
            // TODO: Is this the optimal way of doing this?
            if (page.headers['access-control-allow-origin'] === '*') {
                if (DEBUG) {
                    console.log('Page already supports CORS. Redirected.');
                }
                
                return res.redirect(url, next);
            }

            // Remove blacklisted headers.
            for (var header in page.headers) {
                if (!serverHeadersBlacklist.has(header.toLowerCase())) {
                    res.header(header, page.headers[header]);
                }
            }

            // Must flush here, otherwise pipe() will include the headers.
            res.flushHeaders();
        }).on('error', function (err) {
            console.log(err);
            return res.abort();
        }).on('end', function () {
            if (DEBUG) {
                console.log('Request to %s has ended.', url);
            }

            return res.end(); // End the response when the stream ends.
        }).pipe(res); // Stream requested url to response.
}


/*
 * Exports.
 */

module.exports = {
    get,
    opts
};
