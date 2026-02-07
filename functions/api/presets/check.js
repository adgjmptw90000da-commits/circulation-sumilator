const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false }, 405);
  }
  try {
    const adminToken = request.headers.get('x-admin-token') || '';
    const expectedToken = requireEnv(env, 'ADMIN_TOKEN');
    if (adminToken !== expectedToken) {
      return jsonResponse({ ok: false }, 403);
    }
    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    return jsonResponse({ ok: false }, 500);
  }
}
