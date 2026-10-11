'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEVELOPMENT_SESSION_SECRET = 'dev-only-insecure-secret-change-me';

function validateRuntimeConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return { production: false };

  const sessionSecret = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET : '';
  if (Buffer.byteLength(sessionSecret, 'utf8') < 32 || sessionSecret === DEVELOPMENT_SESSION_SECRET) {
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

module.exports = { validateRuntimeConfig, DEVELOPMENT_SESSION_SECRET };
