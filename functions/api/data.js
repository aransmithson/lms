// functions/api/data.js
// Backwards-compatible data endpoint for shopping list data
// Powered by Atomic List Storage via _db.js
import { getListsIndex, getList, saveList, getKnownItems, saveKnownItems } from './_db.js';

export async function onRequestGet({ env }) {
  try {
    const index = await getListsIndex(env);
    const knownItems = await getKnownItems(env);

    // Reconstruct full list data for backwards compatibility
    const lists = [];
    for (const item of index) {
      const list = await getList(env, item.id);
      if (list) lists.push(list);
    }

    return Response.json({ lists, knownItems });
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

    // Save known items
    await saveKnownItems(env, body.knownItems);

    // Save each list atomically
    for (const list of body.lists) {
      await saveList(env, list);
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to save data', detail: err.message }, { status: 500 });
  }
}
