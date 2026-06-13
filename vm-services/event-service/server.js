/**
 * AtomQuest Event Service — VM-deployed Node/Express server (:3001)
 *
 * Endpoints:
 *   POST /webhooks/livekit       — LiveKit webhook handler (signature-verified)
 *   GET  /events/admin/live      — SSE stream for admin dashboard (Supabase auth)
 *   POST /api/admin/force-end    — Admin-only room destruction (Supabase auth)
 *   GET  /metrics                — Prometheus exposition format (Basic Auth)
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { WebhookReceiver, RoomServiceClient } = require('livekit-server-sdk');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Environment ────────────────────────────────────────────────────────────────
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'http://localhost:7880';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const METRICS_USER = process.env.METRICS_USER || 'prometheus';
const METRICS_PASS = process.env.METRICS_PASS || 'changeme';

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder');
const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const webhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// ─── Prometheus Metrics ─────────────────────────────────────────────────────────
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const activeSessions = new promClient.Gauge({
  name: 'active_sessions',
  help: 'Number of currently active sessions',
  registers: [register],
});

const connectedParticipants = new promClient.Gauge({
  name: 'connected_participants',
  help: 'Number of currently connected participants',
  registers: [register],
});

const reconnectsTotal = new promClient.Counter({
  name: 'reconnects_total',
  help: 'Total number of successful reconnections',
  registers: [register],
});

const joinFailuresTotal = new promClient.Counter({
  name: 'join_failures_total',
  help: 'Total number of join failures',
  registers: [register],
});

const recordingJobs = new promClient.Gauge({
  name: 'recording_jobs',
  help: 'Number of active recording/egress jobs',
  registers: [register],
});

// ─── In-memory state ────────────────────────────────────────────────────────────
const sseClients = new Set();                     // Admin SSE connections
const graceTimers = new Map();                     // key: `${roomName}:${identity}` → setTimeout id
const activeRooms = new Map();                     // roomName → Set<identity>

// ─── Helpers ────────────────────────────────────────────────────────────────────

function broadcastSSE(event) {
  const data = JSON.stringify(event);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

async function writeEvent(sessionId, participantId, eventType, details) {
  const { error } = await supabase.from('events').insert({
    session_id: sessionId,
    participant_id: participantId,
    event_type: eventType,
    details_json: details || {},
  });
  if (error) console.error('Failed to write event:', error);

  broadcastSSE({
    sessionId,
    participantId,
    eventType,
    details,
    timestamp: new Date().toISOString(),
  });
}

async function lookupParticipant(sessionId, identity) {
  const { data } = await supabase
    .from('participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('identity', identity)
    .single();
  return data?.id || null;
}

// ─── Supabase Auth middleware (for admin routes) ────────────────────────────────

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  // Check role in users table
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userRow || userRow.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.adminUser = user;
  next();
}

// ─── POST /webhooks/livekit ─────────────────────────────────────────────────────

// Raw body needed for signature verification
app.post('/webhooks/livekit', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  try {
    const event = await webhookReceiver.receive(req.body, req.get('Authorization'));

    const room = event.room?.name;
    const identity = event.participant?.identity;

    console.log(`[webhook] ${event.event} room=${room} identity=${identity}`);

    switch (event.event) {
      case 'room_started': {
        activeRooms.set(room, new Set());
        activeSessions.inc();
        await writeEvent(room, null, 'room_started', { roomSid: event.room?.sid });
        break;
      }

      case 'room_finished': {
        activeRooms.delete(room);
        activeSessions.dec();
        await writeEvent(room, null, 'room_finished', { roomSid: event.room?.sid });
        break;
      }

      case 'participant_joined': {
        const graceKey = `${room}:${identity}`;
        const participantId = await lookupParticipant(room, identity);

        // Check if this is a reconnect (grace timer active)
        if (graceTimers.has(graceKey)) {
          clearTimeout(graceTimers.get(graceKey));
          graceTimers.delete(graceKey);
          reconnectsTotal.inc();
          await writeEvent(room, participantId, 'reconnected', { identity });
          console.log(`[grace] Reconnected: ${graceKey}`);
        } else {
          connectedParticipants.inc();
          await writeEvent(room, participantId, 'joined', { identity });
        }

        // Track in active rooms
        if (activeRooms.has(room)) {
          activeRooms.get(room).add(identity);
        }
        break;
      }

      case 'participant_left': {
        const graceKey = `${room}:${identity}`;
        const participantId = await lookupParticipant(room, identity);

        // Remove from active rooms tracking
        if (activeRooms.has(room)) {
          activeRooms.get(room).delete(identity);
        }

        // Start 30-second grace timer (Section 9)
        const timer = setTimeout(async () => {
          graceTimers.delete(graceKey);
          connectedParticipants.dec();

          // Write 'left' event only after grace period expires
          await writeEvent(room, participantId, 'left', { identity });

          // Update participants.left_at
          if (participantId) {
            await supabase
              .from('participants')
              .update({ left_at: new Date().toISOString() })
              .eq('id', participantId);
          }

          console.log(`[grace] Left confirmed: ${graceKey}`);
        }, 30_000);

        graceTimers.set(graceKey, timer);
        console.log(`[grace] Timer started: ${graceKey} (30s)`);
        break;
      }

      case 'egress_started': {
        recordingJobs.inc();
        const egressId = event.egressInfo?.egressId;

        // Update recording status to in_progress (row was created by the Vercel API)
        if (egressId) {
          await supabase
            .from('recordings')
            .update({ status: 'in_progress' })
            .eq('egress_id', egressId);
        }

        await writeEvent(room, null, 'recording_started', { egressId });
        break;
      }

      case 'egress_ended': {
        recordingJobs.dec();
        const egressId = event.egressInfo?.egressId;
        const egressStatus = event.egressInfo?.status;

        // First transition to 'processing'
        if (egressId) {
          await supabase
            .from('recordings')
            .update({ status: 'processing' })
            .eq('egress_id', egressId);
        }

        // Determine final status based on egress result
        // LiveKit egress statuses: EGRESS_COMPLETE = 4, EGRESS_FAILED = 5
        const isSuccess = egressStatus === 4 || egressStatus === 'EGRESS_COMPLETE';
        const isFailed = egressStatus === 5 || egressStatus === 'EGRESS_FAILED';

        if (egressId) {
          if (isSuccess) {
            // Extract the s3_key from file results — store KEY only, never a signed URL (gotcha #6)
            let s3Key = null;
            const fileResults = event.egressInfo?.fileResults;
            if (fileResults && fileResults.length > 0) {
              s3Key = fileResults[0]?.filename || null;
            }

            const updateData = {
              status: 'ready',
              completed_at: new Date().toISOString(),
            };
            if (s3Key) {
              updateData.s3_key = s3Key;
            }

            await supabase
              .from('recordings')
              .update(updateData)
              .eq('egress_id', egressId);

            console.log(`[recording] Ready: ${egressId}, s3_key: ${s3Key}`);
          } else if (isFailed) {
            await supabase
              .from('recordings')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
              })
              .eq('egress_id', egressId);

            console.log(`[recording] Failed: ${egressId}`);
          } else {
            // Unknown status — mark as ready if we have file results, else failed
            const fileResults = event.egressInfo?.fileResults;
            const hasFiles = fileResults && fileResults.length > 0;

            await supabase
              .from('recordings')
              .update({
                status: hasFiles ? 'ready' : 'failed',
                completed_at: new Date().toISOString(),
                ...(hasFiles ? { s3_key: fileResults[0]?.filename } : {}),
              })
              .eq('egress_id', egressId);
          }
        }

        await writeEvent(room, null, 'recording_ended', {
          egressId,
          status: egressStatus,
        });
        break;
      }

      default:
        console.log(`[webhook] Unhandled event: ${event.event}`);
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('[webhook] Verification or processing failed:', err);
    res.status(400).send('Invalid webhook');
  }
});

// ─── GET /events/admin/live (SSE) ───────────────────────────────────────────────

app.get('/events/admin/live', requireAdmin, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial state
  const snapshot = {
    type: 'snapshot',
    activeRooms: Array.from(activeRooms.entries()).map(([name, participants]) => ({
      name,
      participants: Array.from(participants),
    })),
  };
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

  sseClients.add(res);
  console.log(`[SSE] Admin connected (total: ${sseClients.size})`);

  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] Admin disconnected (total: ${sseClients.size})`);
  });
});

// ─── POST /api/admin/force-end ──────────────────────────────────────────────────

app.use(express.json());

app.post('/api/admin/force-end', requireAdmin, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  // Verify session exists
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, start_time')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.status === 'ended') {
    return res.status(400).json({ error: 'Session already ended' });
  }

  // Destroy the LiveKit room via SERVER API
  try {
    await roomService.deleteRoom(sessionId);
  } catch (e) {
    console.error('Failed to delete room:', e);
  }

  // Update session in DB
  const durationSeconds = Math.floor(
    (Date.now() - new Date(session.start_time).getTime()) / 1000
  );

  await supabase.from('sessions').update({
    status: 'ended',
    end_time: new Date().toISOString(),
    duration_seconds: durationSeconds,
  }).eq('id', sessionId);

  await writeEvent(sessionId, null, 'force_ended', {
    admin: req.adminUser.email,
  });

  console.log(`[admin] Force-ended session ${sessionId} by ${req.adminUser.email}`);
  res.json({ success: true });
});

// ─── GET /metrics (Prometheus) ──────────────────────────────────────────────────

app.get('/metrics', (req, res) => {
  // Basic Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
    return res.status(401).send('Unauthorized');
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [user, pass] = credentials.split(':');

  if (user !== METRICS_USER || pass !== METRICS_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
    return res.status(401).send('Unauthorized');
  }

  register.metrics().then((metrics) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(metrics);
  });
});

// ─── Health check ───────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Event Service running on :${PORT}`);
  console.log(`  POST /webhooks/livekit`);
  console.log(`  GET  /events/admin/live (SSE)`);
  console.log(`  POST /api/admin/force-end`);
  console.log(`  GET  /metrics`);
});
