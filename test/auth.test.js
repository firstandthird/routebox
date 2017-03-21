const Hapi = require('hapi');
const expect = require('chai').expect;

function assertCached(res) {
    expect(res.headers['x-was-cached']).to.exist;
}

function assertNotCached(res) {
    expect(res.headers['x-was-cached']).not.to.exist;
}

describe('auth, plugin-level option', function () {
    var server;
    beforeEach(function (done) {
        server = new Hapi.Server();
        server.connection();
        const validate = function (request, username, password, callback) {
          console.log('validate:')
            callback(err, true, { id: 'userId', name: 'robotnik' });
        };
        // scheme always returns good:
        const schemeAlwaysGood = () => {
          return {
            authenticate(request, reply) {
              return reply.continue({ credentials: {} })
            }
          };
        };
        server.register({ register: require('../'), options: { auth: true } }, (err) => {
            expect(err).to.not.exist;
            server.auth.scheme('good', schemeAlwaysGood);
            server.auth.strategy('alwaysAccept', 'good', { validateFunc: validate, allowEmptyUsername: true });
            server.start((err) => {
              expect(err).to.not.exist;
              done();
            });
        });
    });

    afterEach(function (done) {
        server.stop(done);
    });

    it('does not cache on routes with "auth" set when requester is authenticated ', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                auth: 'alwaysAccept',
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
                expect(res2.result).to.equal(1);
                expect(res2.statusCode).to.equal(200);
                assertNotCached(res2);
                done();
            });
        });
    });
});

describe('auth, route-level option', function () {
    var server;
    beforeEach(function (done) {
        server = new Hapi.Server();
        server.connection();
        const validate = function (request, username, password, callback) {
          console.log('validate:')
            callback(err, true, { id: 'userId', name: 'robotnik' });
        };
        // scheme always returns good:
        const schemeAlwaysGood = () => {
          return {
            authenticate(request, reply) {
              return reply.continue({ credentials: {} })
            }
          };
        };
        server.register({ register: require('../') }, (err) => {
            expect(err).to.not.exist;
            server.auth.scheme('good', schemeAlwaysGood);
            server.auth.strategy('alwaysAccept', 'good', { validateFunc: validate, allowEmptyUsername: true });
            server.start((err) => {
              expect(err).to.not.exist;
              done();
            });
        });
    });

    afterEach(function (done) {
        server.stop(done);
    });

    it('does not cache on routes with "auth" set when requester is authenticated ', function (done) {
        server.route({
            method: 'get', path: '/a',
            config: {
                auth: 'alwaysAccept',
                cache: { expiresIn: 1000 },
                plugins: {
                  routebox: {
                    auth: true
                  }
                },
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
});
