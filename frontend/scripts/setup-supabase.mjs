// Setup script: creates agent user and seeds data
const SUPABASE_URL = 'https://opxerjgbagzknaroxkln.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weGVyamdiYWd6a25hcm94a2xuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyOTc4MCwiZXhwIjoyMDk2OTA1NzgwfQ.zHLxGu5WWWoBzQeWm-lMb_WS-9a-VxoXyl0xsaklLbc';

async function main() {
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Create auth user via Admin API
  console.log('Creating agent auth user...');
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: 'agent@atomquest.dev',
      password: 'Agent@2026!',
      email_confirm: true,
    }),
  });

  const authData = await authRes.json();
  if (!authRes.ok && !authData.msg?.includes('already')) {
    console.error('Auth user creation failed:', JSON.stringify(authData));
    // Try to fetch existing user
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      method: 'GET',
      headers,
    });
    const listData = await listRes.json();
    const existing = listData.users?.find(u => u.email === 'agent@atomquest.dev');
    if (existing) {
      console.log('User already exists with ID:', existing.id);
      await seedUsersTable(existing.id, headers);
      return;
    }
    process.exit(1);
  }

  const userId = authData.id;
  console.log('Auth user created with ID:', userId);

  // Step 2: Insert into users table
  await seedUsersTable(userId, headers);
}

async function seedUsersTable(userId, headers) {
  console.log('Inserting into users table...');
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      id: userId,
      role: 'agent',
      name: 'Support Agent',
      email: 'agent@atomquest.dev',
    }),
  });

  if (insertRes.ok) {
    const data = await insertRes.json();
    console.log('Users table seeded:', JSON.stringify(data));
  } else {
    const err = await insertRes.json();
    if (err.code === '23505') {
      console.log('User row already exists, skipping.');
    } else {
      console.error('Insert failed:', JSON.stringify(err));
    }
  }

  console.log('\n=== SETUP COMPLETE ===');
  console.log('Login credentials:');
  console.log('  Email:    agent@atomquest.dev');
  console.log('  Password: Agent@2026!');
}

main().catch(console.error);
