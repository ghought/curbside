/*
 * PCKT Games bridge adapter, version 1.
 *
 * Copy this file into a game and call PcktBridge.init() once. It does nothing
 * when the game runs on its own, or inside a page that isn't on the allowlist.
 * See docs/integration-bridge.md.
 *
 *   const bridge = PcktBridge.init({
 *     gameId: 'timber-job',
 *     allowedParents: ['https://example.com'],
 *     capabilities: { pause: true, mute: true, restart: false },
 *     onPause() {}, onResume() {}, onMute(muted) {}, onRestart() {},
 *   });
 *   bridge.playStarted();
 *   bridge.roundEnded({ score: 12 });
 */
(function (root) {
  'use strict';

  var NAMESPACE = 'pckt-games';
  var VERSION = 1;

  function eventId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function init(options) {
    var capabilities = options.capabilities || {};
    var allowedParents = options.allowedParents || [];
    var embedded = root.parent !== root;
    var sessionId = null;
    var parentOrigin = null;
    var context = {};

    function send(type, payload) {
      if (!sessionId || !parentOrigin) return;
      var message = {
        namespace: NAMESPACE,
        version: VERSION,
        gameId: options.gameId,
        sessionId: sessionId,
        eventId: eventId(),
        type: type,
      };
      if (payload) message.payload = payload;
      root.parent.postMessage(message, parentOrigin);
    }

    function call(handler, value) {
      if (typeof handler === 'function') handler(value);
    }

    function onMessage(event) {
      if (event.source !== root.parent) return;
      if (allowedParents.indexOf(event.origin) === -1) return;

      var data = event.data;
      if (!data || data.namespace !== NAMESPACE || data.version !== VERSION) return;
      if (data.gameId !== options.gameId || typeof data.sessionId !== 'string') return;

      if (data.type === 'INIT') {
        // A repeated INIT is expected. A new session id replaces the old one.
        sessionId = data.sessionId;
        parentOrigin = event.origin;
        context = data.payload || {};
        call(options.onInit, context);
        send('READY', { capabilities: capabilities });
        return;
      }

      if (data.sessionId !== sessionId) return;

      if (data.type === 'PAUSE' && capabilities.pause) {
        call(options.onPause);
        send('PAUSED');
      } else if (data.type === 'RESUME' && capabilities.pause) {
        call(options.onResume);
        send('PLAY_STARTED', { resumed: true });
      } else if (data.type === 'SET_MUTED' && capabilities.mute) {
        call(options.onMute, !!(data.payload && data.payload.muted));
      } else if (data.type === 'RESTART' && capabilities.restart) {
        call(options.onRestart);
      }
    }

    if (embedded) root.addEventListener('message', onMessage);

    return {
      embedded: embedded,
      /** The hub's page URL for this game, once the shell has said hello. */
      canonicalUrl: function () {
        return context.canonicalUrl || null;
      },
      playStarted: function () {
        send('PLAY_STARTED');
      },
      roundEnded: function (payload) {
        send('ROUND_ENDED', payload);
      },
      score: function (score) {
        send('SCORE', { score: score });
      },
      error: function (message) {
        send('ERROR', { message: String(message).slice(0, 200) });
      },
    };
  }

  root.PcktBridge = { init: init, version: VERSION };
})(window);
