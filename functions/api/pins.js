// functions/api/pins.js
// GET  /api/pins  — returns { editor, shopper } PIN object
// POST /api/pins  — updates PINs (body: { editor, shopper })
// Requires KV binding: OURSHOP_KV

const PINS_KEY = 'pins';

// Default PINs used if KV has never been seeded.
// IMPORTANT: Change these before your first deploy, then remove them
// from here and store only in KV via the Cloudflare dashboard.
const DEFAULT_PINS = {
  editor: '1234',   // Wife's PIN — can create & edit lists
  shopper: '5678',  // Your PIN  — can view & tick items
};

export async function onRequestGet({ env }) {
  try {
    const raw = await env.OURSHOP_KV.get(PINS_KEY);
    if (!raw) {
      // First-run: seed KV with defaults and return them
      await env.OURSHOP_KV.put(PINS_KEY, JSON.stringify(DEFAULT_PINS));
      return Response.json(DEFAULT_PINS);
    }
    return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return Response.json({ error: 'Failed to read PINs', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (
      typeof body.editor !== 'string' || !/^\d{4}$/.test(body.editor) ||
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
