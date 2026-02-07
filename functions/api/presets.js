const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

async function supabaseRequest(env, path, options = {}) {
  const supabaseUrl = requireEnv(env, 'SUPABASE_URL');
  const serviceKey = requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const url = `${supabaseUrl}/rest/v1/${path}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  return response;
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (request.method === 'GET') {
      const res = await supabaseRequest(env, 'presets?select=*&order=created_at.asc');
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    const adminToken = (request.headers.get('x-admin-token') || '').trim();
    const expectedToken = requireEnv(env, 'ADMIN_TOKEN').trim();
    if (adminToken !== expectedToken) {
      return jsonResponse({ error: 'unauthorized' }, 403);
    }

    if (request.method === 'POST') {
      const body = await readJson(request);
      if (!body.name || !body.params) {
        return jsonResponse({ error: 'name and params required' }, 400);
      }
      const res = await supabaseRequest(env, 'presets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          name: body.name,
          description: body.description || null,
          params: body.params,
          display: body.display || null
        }
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!body.id || !body.name || !body.params) {
        return jsonResponse({ error: 'id, name, params required' }, 400);
      }
      const res = await supabaseRequest(env, `presets?id=eq.${body.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          name: body.name,
          description: body.description || null,
          params: body.params,
          display: body.display || null
        }
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request);
      if (!body.id) {
        return jsonResponse({ error: 'id required' }, 400);
      }
      const res = await supabaseRequest(env, `presets?id=eq.${body.id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      });
      const data = await res.json();
      return jsonResponse(data, res.status);
    }

    return jsonResponse({ error: 'method not allowed' }, 405);
  } catch (err) {
    return jsonResponse({ error: 'server_error' }, 500);
  }
}
