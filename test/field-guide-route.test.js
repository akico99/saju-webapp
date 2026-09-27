'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const router = require('../src/server/routes/fieldGuide');

async function startServer(t) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('POST /api/field-guide returns a named guide with a known hour', async (t) => {
  const baseUrl = await startServer(t);
  const response = await fetch(`${baseUrl}/api/field-guide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ year: 1996, month: 5, day: 21, hour: 14, minute: 30, gender: '여', calendar: '양력', name: '지은' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.guide.name.display, '지은이');
  assert.equal(payload.guide.hourKnown, true);
  assert.equal(payload.guide.cover.iljuKo, '무오일주');
});

test('POST /api/field-guide excludes an unknown hour and rejects missing dates', async (t) => {
  const baseUrl = await startServer(t);
  const unknownHourResponse = await fetch(`${baseUrl}/api/field-guide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ year: 1996, month: 5, day: 21, gender: '여', hourUnknown: true }),
  });
  const unknownHour = await unknownHourResponse.json();
  assert.equal(unknownHourResponse.status, 200);
  assert.equal(unknownHour.guide.hourKnown, false);
  assert.equal(unknownHour.guide.constitution.total, 6);
  assert.equal(unknownHour.guide.pillars[3].unknown, true);

  const invalidResponse = await fetch(`${baseUrl}/api/field-guide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ month: 5, day: 21 }),
  });
  const invalid = await invalidResponse.json();
  assert.equal(invalidResponse.status, 400);
  assert.ok(invalid.error);
});
