// functions/api/data.js
// Cloudflare Pages Function — handles GET and POST for shopping data
// Requires a KV namespace binding called OURSHOP_KV

const KV_KEY = 'shopping_data';

export async function onRequestGet({ env }) {
  try {
    const raw = await env.OURSHOP_KV.get(KV_KEY);
    if (!raw) {
      return Response.json({ lists: [], knownItems: [] });
    }
    return new Response(raw, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return Response.json({ error: 'Failed to read data', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.lists) || !Array.isArray(body.knownItems)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }
    await env.OURSHOP_KV.put(KV_KEY, JSON.stringify(body));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to save data', detail: err.message }, { status: 500 });
  }
}
