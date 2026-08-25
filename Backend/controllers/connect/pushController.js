const sql = require('../../config/db');

// GET /connect/push/vapid-public-key — the public key only, safe to expose
// to any authenticated user (that's the whole point of it being public).
// 503 if this deploy hasn't configured VAPID keys — the frontend's push
// toggle should treat that as "notifications unavailable here", not crash.
const getVapidPublicKey = (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ message: 'Push notifications are not configured on this server' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

// POST /connect/push/subscribe — body: { endpoint, keys: { p256dh, auth } }.
// Upserts by endpoint (globally unique — the push service hands back the
// same endpoint for the same browser/device registration) so re-subscribing
// (e.g. after a permission re-grant) updates the existing row instead of
// erroring or duplicating.
const subscribe = async (req, res) => {
  const { endpoint, keys } = req.body;
  const userId = req.user.id;

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ message: 'endpoint and keys.{p256dh,auth} are required' });
  }

  try {
    await sql`
      INSERT INTO connect_push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth;
    `;
    res.status(201).json({ message: 'Subscribed to push notifications' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /connect/push/subscribe — body: { endpoint }. Only removes the
// caller's own subscription for that endpoint.
const unsubscribe = async (req, res) => {
  const { endpoint } = req.body;
  const userId = req.user.id;

  if (!endpoint) {
    return res.status(400).json({ message: 'endpoint is required' });
  }

  try {
    await sql`DELETE FROM connect_push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${userId}`;
    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getVapidPublicKey, subscribe, unsubscribe };
