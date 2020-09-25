/* global window, StorageEvent */

import Emitter from 'tiny-emitter';
import { OktaAuth, AuthSdkError } from '@okta/okta-auth-js';
import tokens from '@okta/test.support/tokens';
import AuthStateManager, { DEFAULT_AUTH_STATE } from '../../lib/AuthStateManager';

function createAuth() {
  return new OktaAuth({
    pkce: false,
    issuer: 'https://auth-js-test.okta.com',
    clientId: 'NPSfOkH5eZrTy8PMDlvx',
    redirectUri: 'https://example.com/redirect',
    tokenManager: {
      autoRenew: false,
      autoRemove: false,
    }
  });
}

describe('AuthStateManager', () => {
  let sdkMock;

  beforeEach(function() {
    const emitter = new Emitter();
    sdkMock = {
      options: {},
      emitter,
      tokenManager: {
        on: jest.fn().mockImplementation((event, handler) => {
          sdkMock.emitter.on(event, handler);
        }),
        _getOptions: jest.fn().mockReturnValue({ 
          storageKey: 'okta-token-storage' 
        })
      }
    };
  });

  describe('constructor', () => {
    it('should listen on "added" and "removed" events from TokenManager', () => {
      new AuthStateManager(sdkMock); // eslint-disable-line no-new
      expect(sdkMock.tokenManager.on).toHaveBeenCalledWith('added', expect.any(Function));
      expect(sdkMock.tokenManager.on).toHaveBeenCalledWith('removed', expect.any(Function));
    });

    it('should call updateAuthState when "added" event emitted', () => {
      const instance = new AuthStateManager(sdkMock);
      instance.updateAuthState = jest.fn();
      const fakeTimestamp = 111;
      sdkMock.emitter.emit('added', 'fakeKey', 'fakeToken', { timestamp: fakeTimestamp });
      expect(instance.updateAuthState).toHaveBeenCalledWith({ event: 'added', key: 'fakeKey', token: 'fakeToken', timestamp: fakeTimestamp });
    });

    it('should call updateAuthState when "removed" event emitted', () => {
      const instance = new AuthStateManager(sdkMock);
      instance.updateAuthState = jest.fn();
      const fakeTimestamp = 111;
      sdkMock.emitter.emit('removed', 'fakeKey', 'fakeToken', { timestamp: fakeTimestamp });
      expect(instance.updateAuthState).toHaveBeenCalledWith({ event: 'removed', key: 'fakeKey', token: 'fakeToken', timestamp: fakeTimestamp });
    });

    it('should not call updateAuthState if events is not any of "added", "renewed" or "removed"', () => {
      const instance = new AuthStateManager(sdkMock);
      instance.updateAuthState = jest.fn();
      sdkMock.emitter.emit('fakeEvent');
      expect(instance.updateAuthState).not.toHaveBeenCalled();
    });

    it('should throw AuthSdkError if no emitter in sdk', () => {
      delete sdkMock.emitter;
      try {
        new AuthStateManager(sdkMock); // eslint-disable-line no-new
      } catch (err) {
        expect(err).toBeInstanceOf(AuthSdkError);
        expect(err.message).toBe('Emitter should be initialized before AuthStateManager');
      }
    });

    it('should initial with default authState', () => {
      const instance = new AuthStateManager(sdkMock);
      expect(instance._authState).toMatchObject(DEFAULT_AUTH_STATE);
    });
  });

  describe('getAuthState', () => {
    it('should return authState', () => {
      const instance = new AuthStateManager(sdkMock);
      expect(instance.getAuthState()).toMatchObject(DEFAULT_AUTH_STATE);
    });
  });

  describe('updateAuthState', () => {
    beforeEach(() => {
      sdkMock.tokenManager.getTokens = jest.fn()
        .mockResolvedValueOnce({ accessToken: 'fakeAccessToken0', idToken: 'fakeIdToken0' })
        .mockResolvedValueOnce({ accessToken: 'fakeAccessToken1', idToken: 'fakeIdToken1' });
      sdkMock.tokenManager._getOptions = jest.fn().mockReturnValue({ 
        autoRenew: true, 
        autoRemove: true 
      });
      sdkMock.tokenManager.hasExpired = jest.fn().mockReturnValue(false);
    });

    it('should emit an authState with isAuthenticated === true', () => {
      expect.assertions(2);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            isPending: false,
            isAuthenticated: true,
            idToken: 'fakeIdToken0',
            accessToken: 'fakeAccessToken0'
          });
          resolve();
        }, 100);
      });
    });

    it('should emit only latest authState', () => {
      expect.assertions(2);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            isPending: false,
            isAuthenticated: true,
            idToken: 'fakeIdToken1',
            accessToken: 'fakeAccessToken1'
          });
          resolve();
        }, 100);
      });
    });

    it('should handle both updateAuthState if the previous one has finished before the second one start', () => {
      expect.assertions(3);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        setTimeout(() => {
          instance.updateAuthState();
        }, 50);
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(2);
          expect(handler).toHaveBeenCalledWith({
            isPending: false,
            isAuthenticated: true,
            idToken: 'fakeIdToken0',
            accessToken: 'fakeAccessToken0'
          });
          expect(handler).toHaveBeenCalledWith({
            isPending: false,
            isAuthenticated: true,
            idToken: 'fakeIdToken1',
            accessToken: 'fakeAccessToken1'
          });
          resolve();
        }, 100);
      });
    });

    it('should evaluate authState.isAuthenticated based on "isAuthenticated" callback if it\'s provided', () => {
      sdkMock.options.isAuthenticated = jest.fn().mockResolvedValue(false);
      expect.assertions(3);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(sdkMock.options.isAuthenticated).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            accessToken: 'fakeAccessToken0',
            idToken: 'fakeIdToken0',
            isAuthenticated: false,
            isPending: false,
          });
          resolve();
        }, 100);
      });
    });

    it('should evaluate expired token as null with isPending state as true', () => {
      expect.assertions(2);
      sdkMock.tokenManager.hasExpired = jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            accessToken: 'fakeAccessToken0',
            idToken: null,
            isAuthenticated: false,
            isPending: true,
          });
          resolve();
        }, 100);
      });
    });

    it('should evaluate expired token as null with isPending state as false if both autoRenew and autoRemove are off', () => {
      expect.assertions(2);
      sdkMock.tokenManager.hasExpired = jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      sdkMock.tokenManager._getOptions = jest.fn().mockReturnValue({ 
        autoRenew: false, 
        autoRemove: false 
      });
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            accessToken: 'fakeAccessToken0',
            idToken: null,
            isAuthenticated: false,
            isPending: false,
          });
          resolve();
        }, 100);
      });
    });

    it('should emit error in authState if isAuthenticated throws error', () => {
      expect.assertions(2);
      const error = new Error('fake error');
      sdkMock.options.isAuthenticated = jest.fn().mockRejectedValue(error);
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            accessToken: 'fakeAccessToken0',
            idToken: 'fakeIdToken0',
            isAuthenticated: false,
            isPending: false,
            error
          });
          resolve();
        }, 100);
      });
    });

    it('should stop and evaluate at the 10th update if too many updateAuthState happen concurrently', () => {
      sdkMock.tokenManager.getTokens = jest.fn();
      for (let i = 0; i < 100; i++) {
        sdkMock.tokenManager.getTokens = sdkMock.tokenManager.getTokens
          .mockResolvedValueOnce({ 
            accessToken: `fakeAccessToken${i}`,
            idToken: `fakeIdToken${i}`,
          });
      }

      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        for (let i = 0; i < 100; i++) {
          instance.updateAuthState();
        }
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            accessToken: 'fakeAccessToken10',
            idToken: 'fakeIdToken10',
            isAuthenticated: true,
            isPending: false,
          });
          resolve();
        }, 100);
      });
    });

    it('should emit unique authState object', () => {
      expect.assertions(2);
      sdkMock.tokenManager.getTokens = jest.fn()
        .mockResolvedValueOnce({ accessToken: 'fakeAccessToken0', idToken: 'fakeIdToken0' })
        .mockResolvedValueOnce({ accessToken: 'fakeAccessToken1', idToken: 'fakeIdToken1' });
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        setTimeout(() => {
          instance.updateAuthState();
        }, 50);
        let prevAuthState;
        const handler = jest.fn().mockImplementation(authState => {
          if (!prevAuthState) {
            prevAuthState = authState;
          } else {
            expect(authState).not.toBe(prevAuthState);
          }
        });
        instance.subscribe(handler);
        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(2);
          resolve();
        }, 100);
      });
    });

    it('should only emit same authState once', () => {
      expect.assertions(1);
      sdkMock.tokenManager.getTokens = jest.fn()
        .mockResolvedValue({ accessToken: 'fakeAccessToken0', idToken: 'fakeIdToken0' });
      return new Promise(resolve => {
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState();
        setTimeout(() => {
          instance.updateAuthState();
        }, 50);
        const handler = jest.fn();
        instance.subscribe(handler);
        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          resolve();
        }, 100);
      });
    });

    it('should not trigger updateAuthState process if the comming event is earlier than last processed event', () => {
      expect.assertions(2);
      return new Promise(resolve => {
        const latestTimestamp = Date.now();
        const timestampFromPast = latestTimestamp - 1000;
        const instance = new AuthStateManager(sdkMock);
        instance.updateAuthState({ timestamp: latestTimestamp });
        setTimeout(() => {
          instance.updateAuthState({ timestamp: timestampFromPast });
        }, 50);
        const handler = jest.fn();
        instance.subscribe(handler);

        setTimeout(() => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({
            isPending: false,
            isAuthenticated: true,
            idToken: 'fakeIdToken0',
            accessToken: 'fakeAccessToken0'
          });
          resolve();
        }, 100);
      });
    });

    it('should only trigger authStateManager.updateAuthState once when localStorage changed from other dom', () => {
      const auth = createAuth();
      auth.authStateManager.updateAuthState = jest.fn();
      // simulate localStorage change from other dom context
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'okta-token-storage', 
        newValue: '{"idToken": "fake_id_token"}',
        oldValue: '{}'
      }));
      expect(auth.authStateManager.updateAuthState).toHaveBeenCalledTimes(1);
      expect(auth.authStateManager.updateAuthState).toHaveBeenCalledWith({ 
        event: 'added',
        key: 'idToken',
        token: 'fake_id_token',
        timestamp: expect.any(Number)
      });
    });

    it('should only trigger authStateManager.updateAuthState once when call tokenManager.add', () => {
      const auth = createAuth();
      auth.authStateManager.updateAuthState = jest.fn();
      auth.tokenManager.add('idToken', tokens.standardIdTokenParsed);
      expect(auth.authStateManager.updateAuthState).toHaveBeenCalledTimes(1);
      expect(auth.authStateManager.updateAuthState).toHaveBeenCalledWith({ 
        event: 'added', 
        key: 'idToken', 
        token: tokens.standardIdTokenParsed, 
        timestamp: expect.any(Number) 
      });
    });
  });

  describe('subscribe', () => {
    it('should add "authStateChange" listener on sdk.emitter', () => {
      jest.spyOn(Emitter.prototype, 'on');
      const handler = jest.fn();
      const instance = new AuthStateManager(sdkMock);
      instance.subscribe(handler);
      expect(sdkMock.emitter.on).toHaveBeenCalledWith('authStateChange', handler);
    });
  });

  describe('unsubscribe', () => {
    it('should remove "authStateChange" listener from sdk.emitter', () => {
      jest.spyOn(Emitter.prototype, 'off');
      const handler = jest.fn();
      const instance = new AuthStateManager(sdkMock);
      instance.unsubscribe(handler);
      expect(sdkMock.emitter.off).toHaveBeenCalledWith('authStateChange', handler);
    });
  });
});
