// functions/api/_db.js
// Atomic List Storage helper for Cloudflare KV (OURSHOP_KV)
// Provides isolated, per-list storage to prevent race conditions and overwrite bugs.

const INDEX_KEY = 'lists_index';
const KNOWN_ITEMS_KEY = 'known_items';
const LEGACY_DATA_KEY = 'shopping_data';

export function listKey(listId) {
  return `list:${listId}`;
}

export function computeListSummary(list) {
  const items = Array.isArray(list.items) ? list.items : [];
  const doneItems = items.filter(i => i.checked).length;
  const skippedItems = items.filter(i => i.skipped).length;
  return {
    id: list.id,
    name: list.name || 'Untitled List',
    createdAt: list.createdAt || new Date().toISOString(),
    archived: Boolean(list.archived),
    shopDone: Boolean(list.shopDone),
    shopDoneAt: list.shopDoneAt || null,
    totalItems: items.length,
    doneItems,
    skippedItems,
    mealPlanUrl: list.mealPlanUrl || null,
    updatedAt: list.updatedAt || Date.now()
  };
}

// Migrate from legacy single-blob 'shopping_data' if it exists and lists_index doesn't
export async function ensureMigrated(env) {
  if (!env.OURSHOP_KV) return;
  const hasIndex = await env.OURSHOP_KV.get(INDEX_KEY);
  if (hasIndex !== null) return;

  const legacyRaw = await env.OURSHOP_KV.get(LEGACY_DATA_KEY);
  if (!legacyRaw) {
    // Brand new DB: initialize empty index and empty known items
    await env.OURSHOP_KV.put(INDEX_KEY, JSON.stringify([]));
    await env.OURSHOP_KV.put(KNOWN_ITEMS_KEY, JSON.stringify([]));
    return;
  }

  try {
    const legacy = JSON.parse(legacyRaw);
    const lists = Array.isArray(legacy.lists) ? legacy.lists : [];
    const knownItems = Array.isArray(legacy.knownItems) ? legacy.knownItems : [];

    const index = [];
    for (const list of lists) {
      if (!list.id) list.id = 'list_' + Date.now() + Math.random().toString(36).slice(2, 6);
      list.updatedAt = Date.now();
      await env.OURSHOP_KV.put(listKey(list.id), JSON.stringify(list));
      index.push(computeListSummary(list));
    }

    await env.OURSHOP_KV.put(INDEX_KEY, JSON.stringify(index));
    await env.OURSHOP_KV.put(KNOWN_ITEMS_KEY, JSON.stringify(knownItems));
    console.log(`Migrated ${lists.length} lists to atomic storage.`);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

// Get list index (summaries of all lists)
export async function getListsIndex(env) {
  if (!env.OURSHOP_KV) return [];
  await ensureMigrated(env);
  const raw = await env.OURSHOP_KV.get(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save list index
export async function saveListsIndex(env, index) {
  if (!env.OURSHOP_KV) return;
  await env.OURSHOP_KV.put(INDEX_KEY, JSON.stringify(index));
}

// Get single list by ID
export async function getList(env, listId) {
  if (!env.OURSHOP_KV) return null;
  await ensureMigrated(env);
  const raw = await env.OURSHOP_KV.get(listKey(listId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Smart merge list update to prevent overwriting concurrent changes
export async function saveList(env, incomingList, { role } = {}) {
  if (!env.OURSHOP_KV) throw new Error('OURSHOP_KV not bound');
  await ensureMigrated(env);

  const key = listKey(incomingList.id);
  const existingRaw = await env.OURSHOP_KV.get(key);
  let finalList = incomingList;

  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      const existingItems = Array.isArray(existing.items) ? existing.items : [];
      const incomingItems = Array.isArray(incomingList.items) ? incomingList.items : [];

      if (role === 'shopper') {
        // Shopper in store: updates checked and skipped states on items.
        // We preserve any new items that editor might have added concurrently at home!
        const incomingMap = new Map(incomingItems.map(i => [i.id, i]));
        const mergedItems = existingItems.map(ext => {
          const inc = incomingMap.get(ext.id);
          if (inc) {
            return { ...ext, checked: Boolean(inc.checked), skipped: Boolean(inc.skipped) };
          }
          return ext;
        });

        // Also if shopper added any item, keep it
        incomingItems.forEach(inc => {
          if (!existingItems.some(ext => ext.id === inc.id)) {
            mergedItems.push(inc);
          }
        });

        finalList = {
          ...existing,
          ...incomingList,
          items: mergedItems,
          updatedAt: Date.now()
        };
      } else {
        // Editor: preserve checked status from shopper if item is in both
        const incomingMap = new Map(incomingItems.map(i => [i.id, i]));
        const mergedItems = incomingItems.map(inc => {
          const ext = existingItems.find(e => e.id === inc.id);
          if (ext && ext.checked && !inc.checked) {
            // Keep shopper's tick if editor hasn't explicitly reset
            return { ...inc, checked: ext.checked, skipped: ext.skipped };
          }
          return inc;
        });

        finalList = {
          ...incomingList,
          items: mergedItems,
          updatedAt: Date.now()
        };
      }
    } catch (err) {
      console.error('Merge error, using incoming list:', err);
      finalList = { ...incomingList, updatedAt: Date.now() };
    }
  } else {
    finalList = { ...incomingList, updatedAt: Date.now() };
  }

  // Save the atomic list
  await env.OURSHOP_KV.put(key, JSON.stringify(finalList));

  // Update lists_index summary
  const summary = computeListSummary(finalList);
  const index = await getListsIndex(env);
  const idx = index.findIndex(l => l.id === finalList.id);
  if (idx >= 0) {
    index[idx] = summary;
  } else {
    index.unshift(summary);
  }
  await saveListsIndex(env, index);

  return finalList;
}

// Delete list atomically
export async function deleteList(env, listId) {
  if (!env.OURSHOP_KV) return;
  await ensureMigrated(env);

  await env.OURSHOP_KV.delete(listKey(listId));

  // Remove from index
  const index = await getListsIndex(env);
  const updated = index.filter(l => l.id !== listId);
  await saveListsIndex(env, updated);

  // Clean up R2 image if bucket is present
  if (env.IMAGES_BUCKET) {
    try {
      await env.IMAGES_BUCKET.delete(`meal-plan/${listId}.jpg`);
    } catch {}
  }
}

// Known items
export async function getKnownItems(env) {
  if (!env.OURSHOP_KV) return [];
  await ensureMigrated(env);
  const raw = await env.OURSHOP_KV.get(KNOWN_ITEMS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveKnownItems(env, items) {
  if (!env.OURSHOP_KV) return;
  if (!Array.isArray(items)) return;
  await env.OURSHOP_KV.put(KNOWN_ITEMS_KEY, JSON.stringify(items));
}
