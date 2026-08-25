const sql = require('../../config/db');
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// sendPushToUsers — the one shared entry point every notification trigger
// (new announcement, new assignment, assignment graded, new message) calls.
// Loads every subscription (one user can have several — one per browser/
// device) for the given user ids and pushes the same payload to each.
// A subscription that comes back 404/410 (gone/expired — the browser
// revoked it or the push service dropped it) is deleted on the spot, so
// the table doesn't accumulate dead rows over time.
const sendPushToUsers = async (userIds, { title, body, url }) => {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return;

  const subscriptions = await sql`
    SELECT id, user_id, endpoint, p256dh, auth
    FROM connect_push_subscriptions
    WHERE user_id = ANY(${ids})
  `;
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url || '/' });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sql`DELETE FROM connect_push_subscriptions WHERE id = ${sub.id}`;
        } else {
          console.error('[Push] sendNotification failed:', err.statusCode, err.message);
        }
      }
    })
  );
};

module.exports = { sendPushToUsers };
