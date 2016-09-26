var http = require('http');

var assert = module.exports = exports = require('assert');
var request = require('request');

/**
 * Assert response from `server` with
 * the given `req` object and `res` assertions object.
 *
 * @param {Server} server
 * @param {Object} req
 * @param {Object|Function} res
 * @param {String|Function|Object} msg
 */
assert.responseOld = function(server, req, res, msg){
    var port = 5555;
    function check(){
        try {
            server.__port = server.address().port;
            server.__listening = true;
        } catch (err) {
            process.nextTick(check);
            return;
        }
        if (server.__deferred) {
            server.__deferred.forEach(function(args){
                assert.response.apply(assert, args);
            });
            server.__deferred = null;
        }
    }

    // Check that the server is ready or defer
    if (!server.fd) {
        server.__deferred = server.__deferred || [];
        server.listen(server.__port = port++, '127.0.0.1', check);
    } else if (!server.__port) {
        server.__deferred = server.__deferred || [];
        process.nextTick(check);
    }

    // The socket was created but is not yet listening, so keep deferring
    if (!server.__listening) {
        server.__deferred.push(arguments);
        return;
    }

    // Callback as third or fourth arg
    var callback = typeof res === 'function'
        ? res
        : typeof msg === 'function'
            ? msg
            : function(){};

    // Default messate to test title
    if (typeof msg === 'function') msg = null;
    msg = msg || assert.testTitle;
    msg += '. ';

    // Pending responses
    server.__pending = server.__pending || 0;
    server.__pending++;

    // Create client
    if (!server.fd) {
        server.listen(server.__port = port++, '127.0.0.1', issue);
    } else {
        issue();
    }

    function issue(){

        // Issue request
        var timer,
            method = req.method || 'GET',
            status = res.status || res.statusCode,
            data = req.data || req.body,
            requestTimeout = req.timeout || 0,
            encoding = req.encoding || 'utf8';

        var request = http.request({
            host: '127.0.0.1',
            port: server.__port,
            path: req.url,
            method: method,
            headers: req.headers,
            agent: false
        });

        var check = function() {
            if (--server.__pending === 0) {
                server.close();
                server.__listening = false;
            }
        };

        // Timeout
        if (requestTimeout) {
            timer = setTimeout(function(){
                check();
                delete req.timeout;
                request.destroy(); // will trigger 'error' event
            }, requestTimeout);
        }

        if (data) request.write(data);

        request.on('error', function(err){
          check();
          callback(err);
        });

        request.on('response', function(response){
            response.body = '';
            response.setEncoding(encoding);
            response.on('data', function(chunk){ response.body += chunk; });
            response.on('end', function(){
                if (timer) clearTimeout(timer);

                check();

                // Assert response body
                if (res.body !== undefined) {
                    var eql = res.body instanceof RegExp
                      ? res.body.test(response.body)
                      : res.body === response.body;
                    assert.ok(
                        eql,
                        msg + 'Invalid response body.\n'
                            + '    Expected: ' + res.body + '\n'
                            + '    Got: ' + response.body
                    );
                }

                // Assert response status
                if (typeof status === 'number') {
                    assert.equal(
                        response.statusCode,
                        status,
                        msg + colorize('Invalid response status code.\n'
                            + '    Expected: [green]{' + status + '}\n'
                            + '    Got: [red]{' + response.statusCode + '}\n'
                            + '    Response body: ' + response.body)
                    );
                }

                // Assert response headers
                if (res.headers) {
                    var keys = Object.keys(res.headers);
                    for (var i = 0, len = keys.length; i < len; ++i) {
                        var name = keys[i],
                            actual = response.headers[name.toLowerCase()],
                            expected = res.headers[name],
                            eql = expected instanceof RegExp
                              ? expected.test(actual)
                              : expected == actual;
                        assert.ok(
                            eql,
                            msg + colorize('Invalid response header [bold]{' + name + '}.\n'
                                + '    Expected: [green]{' + expected + '}\n'
                                + '    Got: [red]{' + actual + '}\n'
                                + '    Response body: ' + response.body)
                        );
                    }
                }

                callback(null, response);
            });
        });

        request.end();
      }
};

assert.response = function(server, req, res, callback) {
    if (!callback) {
        callback = res;
        res = {};
    }

    var port = 5555,
        host = '127.0.0.1';

    var listeningAttempts = 0;
    var listener;
    function listen() {
        if (listeningAttempts > 25) {
            return callback(new Error('Tried too many ports'));
        }
        listener = server.listen(port, host);
        listener.on('error', function() {
            port++;
            listeningAttempts++;
            listen();
        });
        listener.on('listening', onServerListening);
    }

    listen();

    // jshint maxcomplexity:10
    function onServerListening() {
        var status = res.status || res.statusCode;
        var requestParams = {
            url: 'http://' + host + ':' + port + req.url,
            method: req.method || 'GET',
            headers: req.headers || {},
            timeout: req.timeout || 0,
            encoding: req.encoding || 'utf8'
        };

        if (req.body || req.data) {
            requestParams.body = req.body || req.data;
        }

        request(requestParams, function assert$response$requestHandler(error, response, body) {
            listener.close(function() {
                if (error) {
                    return callback(error);
                }

                response = response || {};
                response.body = response.body || body;

                // Assert response body
                if (res.body) {
                    var eql = res.body instanceof RegExp ? res.body.test(response.body) : res.body === response.body;
                    assert.ok(
                        eql,
                        colorize('[red]{Invalid response body.}\n' +
                            '     Expected: [green]{' + res.body + '}\n' +
                            '     Got: [red]{' + response.body + '}')
                    );
                }

                // Assert response status
                if (typeof status === 'number') {
                    assert.equal(response.statusCode, status,
                        colorize('[red]{Invalid response status code.}\n' +
                            '     Expected: [green]{' + status + '}\n' +
                            '     Got: [red]{' + response.statusCode + '}\n' +
                            '     Body: ' + response.body)
                    );
                }

                // Assert response headers
                if (res.headers) {
                    var keys = Object.keys(res.headers);
                    for (var i = 0, len = keys.length; i < len; ++i) {
                        var name = keys[i],
                            actual = response.headers[name.toLowerCase()],
                            expected = res.headers[name],
                            headerEql = expected instanceof RegExp ? expected.test(actual) : expected === actual;
                        assert.ok(headerEql,
                            colorize('Invalid response header [bold]{' + name + '}.\n' +
                                '     Expected: [green]{' + expected + '}\n' +
                                '     Got: [red]{' + actual + '}')
                        );
                    }
                }

                // Callback
                callback(null, response);
            });
        });

    }
};

/**
 * Colorize the given string using ansi-escape sequences.
 * Disabled when --boring is set.
 *
 * @param {String} str
 * @return {String}
 */
function colorize(str) {
    var colors = { bold: 1, red: 31, green: 32, yellow: 33 };
    return str.replace(/\[(\w+)\]\{([^]*?)\}/g, function(_, color, str) {
        return '\x1B[' + colors[color] + 'm' + str + '\x1B[0m';
    });
}
