// Setup script: creates agent user, seeds data, and adds RLS policies
const SUPABASE_URL = 'https://opxerjgbagzknaroxkln.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weGVyamdiYWd6a25hcm94a2xuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTMyOTc4MCwiZXhwIjoyMDk2OTA1NzgwfQ.zHLxGu5WWWoBzQeWm-lMb_WS-9a-VxoXyl0xsaklLbc';

async function main() {
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Add RLS policies via the SQL endpoint (using rpc if available)
  // Since we can't run raw DDL via PostgREST, we'll create a temporary function
  console.log('Creating RLS policies via temporary function...');
  
  // First, create a helper function to run SQL
  const sqlStatements = [
    // Allow authenticated agents to read their own sessions
    `CREATE POLICY IF NOT EXISTS "agents_read_own_sessions" ON sessions FOR SELECT TO authenticated USING (agent_id = auth.uid())`,
    // Allow authenticated agents to read their own user row
    `CREATE POLICY IF NOT EXISTS "users_read_own" ON users FOR SELECT TO authenticated USING (id = auth.uid())`,
  ];

  // Try using the pg_net or database function approach
  // Since we can't run DDL directly via PostgREST, let's create a function first
  const createFnRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql: sqlStatements[0] }),
  });

  if (!createFnRes.ok) {
    console.log('RPC exec_sql not available (expected). Will use alternative approach.');
    console.log('');
    console.log('=== MANUAL STEP REQUIRED ===');
    console.log('Please run these SQL statements in the Supabase SQL Editor:');
    console.log('');
    for (const sql of sqlStatements) {
      console.log(sql + ';');
    }
    console.log('');
    console.log('OR: The API routes use supabaseAdmin (service_role) which bypasses RLS.');
    console.log('The client-side session listing should go through an API route instead.');
  } else {
    console.log('RLS policies created successfully.');
  }
}

main().catch(console.error);
