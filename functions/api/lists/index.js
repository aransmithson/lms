// functions/api/lists/index.js
// Handles GET (list index/summaries) and POST (create new list)
import { getListsIndex, saveList, getList } from '../_db.js';

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const full = url.searchParams.get('full') === '1';

    const index = await getListsIndex(env);
    if (!full) {
      return Response.json({ lists: index });
    }

    // If full data requested, fetch items for all lists in index
    const fullLists = [];
    for (const item of index) {
      const list = await getList(env, item.id);
      if (list) fullLists.push(list);
    }
    return Response.json({ lists: fullLists });
  } catch (err) {
    return Response.json({ error: 'Failed to read lists', detail: err.message }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    if (!name) {
      return Response.json({ error: 'List name is required' }, { status: 400 });
    }

    const newList = {
      id: body.id || 'list_' + Date.now(),
      name,
      items: [],
      archived: false,
      shopDone: false,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: Date.now()
    };

    const saved = await saveList(env, newList, { role: 'editor' });
    return Response.json({ ok: true, list: saved }, { status: 201 });
  } catch (err) {
    return Response.json({ error: 'Failed to create list', detail: err.message }, { status: 500 });
  }
}
