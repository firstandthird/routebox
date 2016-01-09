const Hoek = require('hoek');
const Joi = require('joi');
const hash = require('es-hash');

const routebox = module.exports = {};

const schema = Joi.object({
    cache: Joi.string().required(),
    enabled: Joi.bool(),
    digest: Joi.string().allow('djb2', 'md5', 'sha1', 'sha256', 'sha512', 'ripemd160').required(),
    segment: Joi.string().required(),
    parse: Joi.object({
        query: Joi.bool(),
        method: Joi.bool(),
        route: Joi.bool(),
    }).required(),
}).required();

routebox.register = function (server, options, next) {
    const defaults = Hoek.applyToDefaults({
        cache: '_default',
        enabled: true,
        digest: 'djb2',
        segment: 'routebox',
        parse: {
            query: true,
            method: true,
            route: true,
        },
    }, options || {});

    Joi.assert(defaults, schema);

    /**
     * Checks if see if the request should be cached. If so, it return
     * cache settings to do so, otherwise returns undefined.
     * @param  {Hapi.Request} req
     * @return {Object}
     */
    function getSettings (req) {
        const cache = req.route.settings.cache;
        if (!cache || (cache.privacy && cache.privacy !== 'public')) return;

        const settings = Hoek.applyToDefaults(defaults, req.route.settings.plugins.routebox || {});
        if (!settings.enabled) return;

        settings.expiresIn = cache.expiresIn;
        settings.expiresAt = cache.expiresAt;
        settings.statuses = cache.statuses;

        return settings;
    }

    /**
     * Logs an error associated with Routebox.
     * @param  {Error} err
     */
    function logError (err) {
        if (err) {
            server.log(['error', 'catbox', 'routebox'], err);
        }
    }

    /**
     * Creates a cache key for Catbox with the given ID and routebox settings.
     * @param  {String|Number} ident
     * @param  {Object}        segment
     * @return {Object}
     */
    function buildCacheKey (id, settings) {
        return { id: String(id), segment: settings.segment };
    }

    /**
     * Returns an object consisting of the given properties
     * taken from the source `object`.
     * @param  {Object} object
     * @param  {[]String} keys
     * @return {Object}
     */
    function pick (object, keys) {
        const output = {};
        keys.forEach((key) => { output[key] = object[key]; });
        return output;
    }

    server.ext('onPreHandler', function (req, reply) {
        const settings = getSettings(req);
        if (!settings) return reply.continue();

        // Create an identifying hash off what we were told to parse.
        const ident = hash({
            method: settings.parse.method && req.route.settings.method,
            query: settings.parse.query && req.query,
            path: settings.parse.path && req.route.settings.path,
        }, settings.digest);

        const policy = pick(settings, ['cache', 'segment', 'expiresIn', 'expiresAt']);
        policy.shared = true;
        const cache = server.cache(policy);

        req.plugins.routebox = { ident, cache };

        cache._cache.get(buildCacheKey(ident, settings), function (err, cached) {
            if (err) {
                // If an error happens, log it, but don't fail the request. If
                // the cache goes down, we still want to at least *try* to
                // serve the request.
                logError(err);
                return reply.continue();
            }

            if (cached) {
                // Serve the cached response if we have one.
                const response = reply();
                Object.keys(cached.item).forEach((key) => {
                    response[key] = cached.item[key];
                });

                return response;
            }

            req.plugins.routebox = { ident, cache };
            return reply.continue();
        });
    });

    server.ext('onPreResponse', function (req, reply) {
        const settings = getSettings(req);
        const rset = req.plugins.routebox;
        if (!settings || !rset) return reply.continue();

        if (settings.statuses.indexOf(req.response.statusCode) === -1) {
            return reply.continue();
        }

        rset.cache._cache.set(
            buildCacheKey(rset.ident, settings),
            pick(req.response, ['statusCode', 'headers', 'source', 'variety']),
            rset.cache.ttl(),
            logError
        );

        reply.continue();
    });

    next();
};

routebox.register.attributes = { pkg: require('../package') };
