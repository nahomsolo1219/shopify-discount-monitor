const test = require('node:test');
const assert = require('node:assert');
const { createPoller, MAX_NOTIFICATIONS_PER_POLL } = require('../src/poller');
const realStore = require('../src/store');

const silentLogger = { log() {}, error() {}, warn() {} };

function rule(id, overrides = {}) {
  return {
    key: `rule-${id}`,
    price_rule_id: id,
    title: `RULE${id}`,
    value: '-10.0',
    value_type: 'percentage',
    ...overrides,
  };
}

function rulesMap(ids, overrides) {
  return Object.fromEntries(ids.map((id) => [`rule-${id}`, rule(id, overrides)]));
}

/** In-memory store that records the order of operations. */
function memoryStore(initial = {}, events = []) {
  let data = initial;
  return {
    load: () => data,
    save: (d) => {
      events.push('save');
      data = d;
    },
    diff: realStore.diff,
    get data() {
      return data;
    },
  };
}

function recordingNotifier(events = [], { delayMs = 0 } = {}) {
  const sent = [];
  const wrap = (kind) => async (...args) => {
    events.push(kind);
    sent.push({ kind, args });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  };
  return {
    sent,
    notifyNew: wrap('new'),
    notifyEdited: wrap('edited'),
    notifyDeleted: wrap('deleted'),
    notifySummary: wrap('summary'),
  };
}

async function primed(poller) {
  // First poll is a silent sync
  const r = await poller.poll();
  assert.strictEqual(r.status, 'synced');
}

test('MAX_NOTIFICATIONS_PER_POLL is 10', () => {
  assert.strictEqual(MAX_NOTIFICATIONS_PER_POLL, 10);
});

test('first poll is silent and saves state', async () => {
  const store = memoryStore();
  const notifier = recordingNotifier();
  let current = rulesMap([1, 2, 3]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);
  assert.strictEqual(notifier.sent.length, 0);
  assert.deepStrictEqual(Object.keys(store.data), ['rule-1', 'rule-2', 'rule-3']);
});

test('never runs two polls at once — an overlapping tick is skipped', async () => {
  let release;
  let fetchCalls = 0;
  const gate = new Promise((r) => (release = r));
  const poller = createPoller({
    fetchRules: async () => {
      fetchCalls++;
      await gate;
      return rulesMap([1]);
    },
    store: memoryStore(),
    notifier: recordingNotifier(),
    logger: silentLogger,
  });

  const first = poller.poll();
  assert.strictEqual(poller.isRunning(), true);
  const second = await poller.poll();
  assert.strictEqual(second.status, 'skipped-overlap');
  assert.strictEqual(fetchCalls, 1);

  release();
  await first;
  assert.strictEqual(poller.isRunning(), false);

  // after it finishes, the next poll runs normally
  const third = await poller.poll();
  assert.strictEqual(third.status, 'ok');
  assert.strictEqual(fetchCalls, 2);
});

test('the running flag is cleared even if a poll throws', async () => {
  let fail = true;
  const poller = createPoller({
    fetchRules: async () => {
      if (fail) throw new Error('boom');
      return {};
    },
    store: memoryStore(),
    notifier: recordingNotifier(),
    logger: silentLogger,
  });
  assert.strictEqual((await poller.poll()).status, 'error');
  fail = false;
  assert.strictEqual((await poller.poll()).status, 'synced');
});

test('state is saved BEFORE any notification is sent', async () => {
  const events = [];
  const store = memoryStore({}, events);
  const notifier = recordingNotifier(events);
  let current = rulesMap([1]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);
  events.length = 0;

  current = { ...rulesMap([1], { value: '-20.0' }), ...rulesMap([2]) };
  await poller.poll();
  assert.deepStrictEqual(events, ['save', 'new', 'edited']);
});

test('state saved even when notifications hang/fail, so changes are not re-posted', async () => {
  const store = memoryStore();
  const notifier = recordingNotifier();
  notifier.notifyNew = async () => {
    throw new Error('Discord 429 forever');
  };
  let current = rulesMap([1]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);

  current = rulesMap([1, 2]);
  await poller.poll();
  assert.ok(store.data['rule-2'], 'new rule persisted despite send failure');

  const again = await poller.poll();
  assert.deepStrictEqual([again.added, again.edited, again.deleted], [0, 0, 0]);
});

test('a slow in-flight send does not let the next tick re-post the same changes', async () => {
  const store = memoryStore();
  const notifier = recordingNotifier([], { delayMs: 30 });
  let current = rulesMap([1]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);

  current = rulesMap([1, 2, 3]);
  const inFlight = poller.poll();
  const overlapping = await poller.poll(); // tick fires while Discord is slow
  assert.strictEqual(overlapping.status, 'skipped-overlap');
  await inFlight;
  const next = await poller.poll();
  assert.strictEqual(next.added, 0);
  assert.strictEqual(notifier.sent.filter((s) => s.kind === 'new').length, 2);
});

test('caps notifications at 10 and sends ONE summary for the rest', async () => {
  const ids = Array.from({ length: 140 }, (_, i) => i + 1);
  const store = memoryStore();
  const notifier = recordingNotifier();
  let current = rulesMap(ids);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);

  // 138 real edits + 3 new + 2 deleted = 143 changes
  current = {
    ...rulesMap(ids.slice(2), { value: '-25.0' }),
    ...rulesMap([200, 201, 202]),
  };
  const result = await poller.poll();
  assert.strictEqual(result.sent, 10);
  assert.strictEqual(result.summarized, 133); // 143 changes - 10 sent individually

  const individual = notifier.sent.filter((s) => s.kind !== 'summary');
  const summaries = notifier.sent.filter((s) => s.kind === 'summary');
  assert.strictEqual(individual.length, 10);
  assert.strictEqual(summaries.length, 1);
  const [count, breakdown] = summaries[0].args;
  assert.strictEqual(count, 133);
  assert.deepStrictEqual(breakdown, { added: 0, edited: 131, deleted: 2 });
});

test('no summary when changes fit within the cap', async () => {
  const store = memoryStore();
  const notifier = recordingNotifier();
  let current = rulesMap([1]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);

  current = rulesMap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // exactly 10 new
  const result = await poller.poll();
  assert.strictEqual(result.sent, 10);
  assert.strictEqual(result.summarized, 0);
  assert.strictEqual(notifier.sent.filter((s) => s.kind === 'summary').length, 0);
});

test('format-only API changes across all rules produce no notifications', async () => {
  const ids = Array.from({ length: 140 }, (_, i) => i + 1);
  const store = memoryStore();
  const notifier = recordingNotifier();
  let current = rulesMap(ids, { value: '-10.0', ends_at: null, prerequisite_subtotal_range: null });
  const poller = createPoller({ fetchRules: async () => current, store, notifier, logger: silentLogger });
  await primed(poller);

  current = rulesMap(ids, { value: '-10.00', ends_at: '', prerequisite_subtotal_range: {} });
  const result = await poller.poll();
  assert.strictEqual(result.edited, 0);
  assert.strictEqual(notifier.sent.length, 0);
});

test('logs which fields changed for each edited rule', async () => {
  const lines = [];
  const logger = { log: (m) => lines.push(m), error() {} };
  const store = memoryStore();
  let current = rulesMap([7]);
  const poller = createPoller({ fetchRules: async () => current, store, notifier: recordingNotifier(), logger });
  await primed(poller);

  current = rulesMap([7], { value: '-30.0', ends_at: '2026-12-01T00:00:00Z' });
  await poller.poll();
  assert.ok(
    lines.includes('[Poll] Edited rule-7 "RULE7": value, ends_at'),
    `got: ${JSON.stringify(lines)}`
  );
});

test('skips when not authorized', async () => {
  const poller = createPoller({
    fetchRules: async () => assert.fail('should not fetch'),
    store: memoryStore(),
    notifier: recordingNotifier(),
    isAuthorized: () => false,
    logger: silentLogger,
  });
  assert.strictEqual((await poller.poll()).status, 'skipped-unauthorized');
});
