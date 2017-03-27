'use strict';

const loopback = require('../');
const supertest = require('supertest');
const strongErrorHandler = require('strong-error-handler');

describe('Authorization scopes', () => {
  const CUSTOM_SCOPE = 'read:custom';

  let app, request, User, testUser, regularToken, scopedToken;
  beforeEach(givenAppAndRequest);
  beforeEach(givenRemoteMethodWithCustomScope);
  beforeEach(givenUser);
  beforeEach(givenDefaultToken);
  beforeEach(givenScopedToken);

  it('denies regular token to invoke custom-scoped method', () => {
    logServerErrorsOtherThan(401);
    return request.get('/users/scoped')
      .set('Authorization', regularToken.id)
      .expect(401);
  });

  it('allows regular tokens to invoke default-scoped method', () => {
    logAllServerErrors();
    return request.get('/users/' + testUser.id)
      .set('Authorization', regularToken.id)
      .expect(200);
  });

  it('allows scoped token to invoke custom-scoped method', () => {
    logAllServerErrors();
    return request.get('/users/scoped')
      .set('Authorization', scopedToken.id)
      .expect(204);
  });

  it('denies scoped token to invoke default-scoped method', () => {
    logServerErrorsOtherThan(401);
    return request.get('/users/' + testUser.id)
      .set('Authorization', scopedToken.id)
      .expect(401);
  });

  describe('token granted both default and custom scope', () => {
    beforeEach('given token with default and custom scope',
      () => givenScopedToken(['DEFAULT', CUSTOM_SCOPE]));
    beforeEach(logAllServerErrors);

    it('allows invocation of default-scoped method', () => {
      return request.get('/users/' + testUser.id)
        .set('Authorization', scopedToken.id)
        .expect(200);
    });

    it('allows invocation of custom-scoped method', () => {
      return request.get('/users/scoped')
        .set('Authorization', scopedToken.id)
        .expect(204);
    });
  });

  it('allows invocation when at least one method scope is matched', () => {
    givenRemoteMethodWithCustomScope(['read', 'write']);
    givenScopedToken(['read', 'execute']).then(() => {
      return request.get('/users/scoped')
        .set('Authorization', scopedToken.id)
        .expect(204);
    });
  });

  function givenAppAndRequest() {
    app = loopback({localRegistry: true, loadBuiltinModels: true});
    app.set('remoting', {rest: {handleErrors: false}});
    app.dataSource('db', {connector: 'memory'});
    app.enableAuth({dataSource: 'db'});
    request = supertest(app);

    app.use(loopback.rest());

    User = app.models.User;
  }

  function givenRemoteMethodWithCustomScope() {
    const accessScopes = arguments[0] || [CUSTOM_SCOPE];
    User.scoped = function(cb) { cb(); };
    User.remoteMethod('scoped', {
      accessScopes,
      http: {verb: 'GET', path: '/scoped'},
    });
    User.settings.acls.push({
      principalType: 'ROLE',
      principalId: '$authenticated',
      permission: 'ALLOW',
      property: 'scoped',
      accessType: 'EXECUTE',
    });
  }

  function givenUser() {
    return User.create({email: 'test@example.com', password: 'pass'})
      .then(u => testUser = u);
  }

  function givenDefaultToken() {
    return testUser.createAccessToken(60)
      .then(t => regularToken = t);
  }

  function givenScopedToken() {
    const scopes = arguments[0] || [CUSTOM_SCOPE];
    return testUser.accessTokens.create({ttl: 60, scopes})
      .then(t => scopedToken = t);
  }

  function logAllServerErrors() {
    logServerErrorsOtherThan(-1);
  }

  function logServerErrorsOtherThan(statusCode) {
    app.use((err, req, res, next) => {
      if ((err.statusCode || 500) !== statusCode) {
        console.log('Unhandled error for request %s %s: %s',
          req.method, req.url, err.stack || err);
      }
      res.statusCode = err.statusCode || 500;
      res.json(err);
    });
  }
});
