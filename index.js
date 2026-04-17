// Polyfills must run before everything else
require('react-native-get-random-values');

const { Buffer } = require('buffer');
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Configure @noble/ed25519 sha512 for React Native (crypto.subtle is not available in RN)
const { sha512 } = require('@noble/hashes/sha2');
const ed = require('@noble/ed25519');
if (ed.etc) {
  ed.etc.sha512Sync = (msg) => sha512(msg);
  ed.etc.sha512Async = async (msg) => sha512(msg);
}

// Load the Expo Router entry point last
require('expo-router/entry');
