// functions/api/lists/[listId].js
// Handles atomic operations for a single shopping list
import { getList, saveList, deleteList } from '../_db.js';

// GET /api/lists/:listId — returns specific list with items
export async function onRequestGet({ params, env }) {
  const { listId } = params;
  try {
    const list = await getList(env, listId);
    if (!list) {
      return Response.json({ error: 'List not found' }, { status: 404 });
    }
    return Response.json({ list });
  } catch (err) {
    return Response.json({ error: 'Failed to read list', detail: err.message }, { status: 500 });
  }
}

// POST or PUT /api/lists/:listId — atomic save with smart conflict resolution
export async function onRequestPost(context) {
  return handleUpdate(context);
}

export async function onRequestPut(context) {
  return handleUpdate(context);
}

async function handleUpdate({ params, request, env }) {
  const { listId } = params;
  try {
    const body = await request.json();
    const incomingList = body.list || body;
    if (!incomingList || typeof incomingList !== 'object') {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    incomingList.id = listId;
    const role = body.role || (body.list && body.list.role) || 'editor';

    const saved = await saveList(env, incomingList, { role });
    return Response.json({ ok: true, list: saved });
  } catch (err) {
    return Response.json({ error: 'Failed to update list', detail: err.message }, { status: 500 });
  }
}

// DELETE /api/lists/:listId — atomic deletion
export async function onRequestDelete({ params, env }) {
  const { listId } = params;
  try {
    await deleteList(env, listId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete list', detail: err.message }, { status: 500 });
  }
}
