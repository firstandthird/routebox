const Hapi = require('hapi');
const expect = require('chai').expect;
const sinon = require('sinon');

function assertCached(res) {
    expect(res.headers['x-was-cached']).to.exist;
}


function assertNotCached(res) {
    expect(res.headers['x-was-cached']).not.to.exist;
}

describe('routebox', function () {
    var server;
    var clock;
    beforeEach(function (done) {
        clock = sinon.useFakeTimers();
        server = new Hapi.Server();
        server.connection();
        server.register(require('../'), (err) => {
            expect(err).to.not.exist;
            server.start(done);
        });
    });

    afterEach(function (done) {
        server.stop(done);
        clock.restore();
    });

    it('caches responses', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                cache: { expiresIn: 1000 },
                handler: (req, reply) => reply(i++),
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/a' }, (res) => {
            expect(res.result).to.equal(0);
            expect(res.statusCode).to.equal(200);
            assertNotCached(res);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(0);
                expect(res2.statusCode).to.equal(200);
                assertCached(res2);
                done();
            });
        });
    });

    it('expires ttl correctly', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                cache: { expiresIn: 1000 },
                handler: (req, reply) => reply(i++),
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/a' }, (res) => {
            expect(res.result).to.equal(0);
            expect(res.statusCode).to.equal(200);
            assertNotCached(res);
            clock.tick(1001);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(1);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res2);
                done();
            });
        });
    });

    it('does not cache on routes without caching', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                handler: (req, reply) => reply(i++),
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/a' }, (res) => {
            expect(res.result).to.equal(0);
            expect(res.statusCode).to.equal(200);
            assertNotCached(res);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(1);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res2);
                done();
            });
        });
    });

    it('does not cache on routes with private caching', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                cache: { expiresIn: 1000, privacy: 'private' },
                handler: (req, reply) => reply(i++),
            },
        });

        server.route({
            method: 'get', path: '/{b}',
            config: {
                cache: { expiresIn: 1000, privacy: 'private' },
                handler: (req, reply) => reply(i++),
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/b' }, (res) => {
            expect(res.result).to.equal(0);
            expect(res.statusCode).to.equal(200);
            assertNotCached(res);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(1);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res);

                server.inject({ method: 'GET', url: '/a' }, (res3) => {
                    expect(res3.result).to.equal(2);
                    expect(res3.statusCode).to.equal(200);
                    assertNotCached(res3);
                    done();
                });
            });
        });
    });

    it('does not cache not-ok responses', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                cache: { expiresIn: 1000, privacy: 'private' },
                handler: (req, reply) => {
                    i++;
                    if (i === 1) {
                        reply(new Error());
                    } else {
                        reply(i);
                    }
                },
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/a' }, (res) => {
            expect(res.statusCode).to.equal(500);
            assertNotCached(res);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(2);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res2);
                done();
            });
        });
    });

    it('respects reply.nocache', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                cache: { expiresIn: 1000 },
                handler: (req, reply) => {
                    req.nocache();
                    reply(i++);
                },
            },
        });

        var i = 0;
        server.inject({ method: 'GET', url: '/a' }, (res) => {
            expect(res.result).to.equal(0);
            expect(res.statusCode).to.equal(200);
            assertNotCached(res);

            server.inject({ method: 'GET', url: '/a' }, (res2) => {
                expect(res2.result).to.equal(1);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res2);
                done();
            });
        });
    });
});
