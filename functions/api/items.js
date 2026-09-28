// functions/api/items.js
// Handles GET and POST for known autocomplete items
import { getKnownItems, saveKnownItems } from './_db.js';

export async function onRequestGet({ env }) {
  try {
    const items = await getKnownItems(env);
    return Response.json({ items });
  } catch (err) {
    return Response.json({ error: 'Failed to read items', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    let current = await getKnownItems(env);

    if (Array.isArray(body.items)) {
      current = body.items;
    } else if (body.item && body.item.name) {
      const name = body.item.name.trim();
      const aisle = body.item.aisle || 'General';
      const idx = current.findIndex(i => (typeof i === 'object' ? i.name : i).toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        current[idx] = { name, aisle };
      } else {
        current.push({ name, aisle });
        current.sort((a, b) => (a.name || a).localeCompare(b.name || b));
        if (current.length > 500) current.shift();
      }
    }

    await saveKnownItems(env, current);
    return Response.json({ ok: true, items: current });
  } catch (err) {
    return Response.json({ error: 'Failed to save items', detail: err.message }, { status: 500 });
  }
}
