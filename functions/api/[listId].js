// functions/api/image/[listId].js
// Handles GET (serve), POST (upload), DELETE (remove) for meal plan images
// Requires R2 binding: IMAGES_BUCKET
// Requires KV binding: OURSHOP_KV

const DATA_KEY = 'shopping_data';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit

// GET /api/image/:listId — serve the image from R2
export async function onRequestGet({ params, env }) {
  const { listId } = params;
  try {
    const obj = await env.IMAGES_BUCKET.get(`meal-plan/${listId}.jpg`);
    if (!obj) {
      return new Response('Image not found', { status: 404 });
    }
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return Response.json({ error: 'Failed to fetch image', detail: err.message }, { status: 500 });
  }
}

// POST /api/image/:listId — upload image to R2, store URL on list in KV
export async function onRequestPost({ params, request, env }) {
  const { listId } = params;
  try {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.startsWith('image/')) {
      return Response.json({ error: 'Content-Type must be an image' }, { status: 400 });
    }

    const imageData = await request.arrayBuffer();
    if (imageData.byteLength > MAX_SIZE) {
      return Response.json({ error: 'Image too large (max 5MB)' }, { status: 413 });
    }

    // Store in R2
    const key = `meal-plan/${listId}.jpg`;
    await env.IMAGES_BUCKET.put(key, imageData, {
      httpMetadata: { contentType: 'image/jpeg' },
    });

    // Update list in KV with image URL
    const imageUrl = `/api/image/${listId}`;
    const raw = await env.OURSHOP_KV.get(DATA_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const list = (data.lists || []).find(l => l.id === listId);
      if (list) {
        list.mealPlanUrl = imageUrl;
        await env.OURSHOP_KV.put(DATA_KEY, JSON.stringify(data));
      }
    }

    return Response.json({ ok: true, url: imageUrl });
  } catch (err) {
    return Response.json({ error: 'Failed to upload image', detail: err.message }, { status: 500 });
  }
}

// DELETE /api/image/:listId — remove image from R2 and clear URL from KV
export async function onRequestDelete({ params, env }) {
  const { listId } = params;
  try {
    // Remove from R2
    await env.IMAGES_BUCKET.delete(`meal-plan/${listId}.jpg`);

    // Clear URL from list in KV
    const raw = await env.OURSHOP_KV.get(DATA_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const list = (data.lists || []).find(l => l.id === listId);
      if (list) {
        delete list.mealPlanUrl;
        await env.OURSHOP_KV.put(DATA_KEY, JSON.stringify(data));
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete image', detail: err.message }, { status: 500 });
  }
}
