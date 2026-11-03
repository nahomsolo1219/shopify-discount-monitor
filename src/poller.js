const MAX_NOTIFICATIONS_PER_POLL = 10;

/**
 * Build a poll() function with injected dependencies so it can be tested
 * without Shopify, Discord or the filesystem.
 *
 * Guarantees:
 *   - only one poll runs at a time; a tick that arrives while a poll is in
 *     progress is skipped, not queued
 *   - the new state is saved BEFORE any notification is sent, so slow or
 *     rate-limited Discord sends can never cause the same change to be
 *     re-detected and re-posted on the next poll
 *   - at most `maxNotifications` individual messages per poll; anything
 *     beyond that is collapsed into a single summary message
 */
function createPoller({
  fetchRules,
  store,
  notifier,
  isAuthorized = () => true,
  onPollComplete = () => {},
  logger = console,
  maxNotifications = MAX_NOTIFICATIONS_PER_POLL,
}) {
  let running = false;
  let firstRun = true;

  async function poll() {
    if (running) {
      logger.log('[Poll] Previous poll still running, skipping this tick');
      return { status: 'skipped-overlap' };
    }
    if (!isAuthorized()) {
      logger.log('[Poll] No token available, skipping');
      return { status: 'skipped-unauthorized' };
    }

    running = true;
    const silent = firstRun;
    const label = silent ? 'Initial sync' : 'Poll';

    try {
      const currentRules = await fetchRules();
      const storedRules = store.load();
      const changes = store.diff(storedRules, currentRules);
      const { added, edited, deleted } = changes;

      logger.log(
        `[${label}] ${Object.keys(currentRules).length} price rules — ` +
          `${added.length} new, ${edited.length} edited, ${deleted.length} deleted`
      );
      for (const { rule, changes: fieldChanges } of edited) {
        logger.log(
          `[${label}] Edited ${rule.key} "${rule.title}": ${fieldChanges.map((c) => c.field).join(', ')}`
        );
      }

      // Persist first: whatever happens while notifying, this change set is
      // never detected again.
      store.save(currentRules);
      firstRun = false;
      onPollComplete();

      if (silent) {
        logger.log('[Initial sync] Loaded existing price rules into store (no notifications sent)');
        return { status: 'synced', ...counts(changes), sent: 0, summarized: 0 };
      }

      const { sent, summarized } = await sendNotifications(changes);
      return { status: 'ok', ...counts(changes), sent, summarized };
    } catch (err) {
      logger.error(`[${label}] Error during poll:`, err.message);
      return { status: 'error', error: err };
    } finally {
      running = false;
    }
  }

  async function sendNotifications({ added, edited, deleted }) {
    const queue = [
      ...added.map((rule) => ({ kind: 'added', send: () => notifier.notifyNew(rule) })),
      ...edited.map(({ rule, changes }) => ({
        kind: 'edited',
        send: () => notifier.notifyEdited(rule, changes),
      })),
      ...deleted.map((rule) => ({ kind: 'deleted', send: () => notifier.notifyDeleted(rule) })),
    ];

    const toSend = queue.slice(0, maxNotifications);
    const overflow = queue.slice(maxNotifications);

    for (const item of toSend) {
      await safely(item.send);
    }

    if (overflow.length > 0) {
      const breakdown = { added: 0, edited: 0, deleted: 0 };
      for (const item of overflow) breakdown[item.kind]++;
      logger.log(
        `[Poll] ${queue.length} changes exceed the per-poll cap of ${maxNotifications}; ` +
          `sending one summary for the remaining ${overflow.length}`
      );
      await safely(() => notifier.notifySummary(overflow.length, breakdown));
    }

    return { sent: toSend.length, summarized: overflow.length };
  }

  async function safely(fn) {
    try {
      await fn();
    } catch (err) {
      logger.error('[Poll] Failed to send notification:', err.message);
    }
  }

  return { poll, isRunning: () => running };
}

function counts({ added, edited, deleted }) {
  return { added: added.length, edited: edited.length, deleted: deleted.length };
}

module.exports = { createPoller, MAX_NOTIFICATIONS_PER_POLL };
