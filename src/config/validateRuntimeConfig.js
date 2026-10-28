'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEVELOPMENT_SESSION_SECRET = 'dev-only-insecure-secret-change-me';
const MAX_SESSION_SECRET_BYTES = 512;

function looksLikeStrongSessionSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') > MAX_SESSION_SECRET_BYTES) return false;
  const chars = Array.from(secret);
  if (chars.length < 32 || new Set(chars).size < 12) return false;

  // Length and character diversity cannot prove how a secret was generated. Reject obvious
  // short-period repetition and low observed entropy, while allowing random hex/base64 values.
  for (let period = 1; period <= Math.floor(chars.length / 2); period++) {
    let repeats = true;
    for (let i = period; i < chars.length; i++) {
      if (chars[i] !== chars[i % period]) { repeats = false; break; }
    }
    if (repeats) return false;
  }

  const counts = new Map();
  for (const char of chars) counts.set(char, (counts.get(char) || 0) + 1);
  const entropy = -Array.from(counts.values()).reduce((sum, count) => {
    const probability = count / chars.length;
    return sum + probability * Math.log2(probability);
  }, 0);
  return entropy * chars.length >= 160;
}

function validateRuntimeConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return { production: false };

  const sessionSecret = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET : '';
  if (Buffer.byteLength(sessionSecret, 'utf8') < 32 || sessionSecret === DEVELOPMENT_SESSION_SECRET || !looksLikeStrongSessionSecret(sessionSecret)) {
    throw new Error('SESSION_SECRET must be set to a strong value of at least 32 bytes in production.');
  }

  const configuredOutput = typeof env.OUTPUT_DIR === 'string' ? env.OUTPUT_DIR.trim() : '';
  if (!configuredOutput) throw new Error('OUTPUT_DIR must be explicitly set to a writable directory in production.');
  if (!path.isAbsolute(configuredOutput)) throw new Error('OUTPUT_DIR must be an absolute path in production.');

  const outputDir = path.resolve(configuredOutput);
  const probe = path.join(outputDir, `.saju-write-check-${crypto.randomBytes(8).toString('hex')}`);
  try {
    if (!fs.statSync(outputDir).isDirectory()) throw new Error('not a directory');
    fs.writeFileSync(probe, '', { flag: 'wx' });
  } catch {
    throw new Error('OUTPUT_DIR must exist and be writable in production.');
  } finally {
    try { fs.unlinkSync(probe); } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw new Error('OUTPUT_DIR must allow temporary-file cleanup in production.');
    }
  }

  return { production: true, outputDir };
}

module.exports = { validateRuntimeConfig, DEVELOPMENT_SESSION_SECRET, looksLikeStrongSessionSecret };
