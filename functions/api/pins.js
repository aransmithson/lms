// functions/api/pins.js
// GET  /api/pins  — returns { editor, shopper } PIN object
// POST /api/pins  — updates PINs (body: { editor, shopper })
// Requires KV binding: OURSHOP_KV

const PINS_KEY = 'pins';

// Default PINs — used on first run before KV is seeded.
// After deploying, update via the KV dashboard or POST /api/pins.
const DEFAULT_PINS = {
  editor: '1234',   // Wife's PIN — can create & edit lists
  shopper: '5678',  // Your PIN  — can view & tick items
};

export async function onRequestGet({ env }) {
  // If KV binding is missing entirely, return defaults so the app still works
  if (!env.OURSHOP_KV) {
    return Response.json(DEFAULT_PINS);
  }
  try {
    const raw = await env.OURSHOP_KV.get(PINS_KEY);
    if (!raw) {
      // First run: seed KV with defaults
      await env.OURSHOP_KV.put(PINS_KEY, JSON.stringify(DEFAULT_PINS));
      return Response.json(DEFAULT_PINS);
    }
    const pins = JSON.parse(raw);
    return Response.json(pins);
  } catch (err) {
    // Return defaults rather than a 500 so the app stays usable
    console.error('pins GET error:', err);
    return Response.json(DEFAULT_PINS);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.OURSHOP_KV) {
    return Response.json({ error: 'KV not bound — add OURSHOP_KV binding in Pages settings' }, { status: 503 });
  }
  try {
    const body = await request.json();
    if (
      typeof body.editor  !== 'string' || !/^\d{4}$/.test(body.editor) ||
      typeof body.shopper !== 'string' || !/^\d{4}$/.test(body.shopper)
    ) {
      return Response.json({ error: 'PINs must be exactly 4 digits each' }, { status: 400 });
    }
    await env.OURSHOP_KV.put(PINS_KEY, JSON.stringify({ editor: body.editor, shopper: body.shopper }));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to save PINs', detail: err.message }, { status: 500 });
  }
}
