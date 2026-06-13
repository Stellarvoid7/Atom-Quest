-- AtomQuest Hackathon 1.0 - Database Schema
-- Note: chat_messages.file_id references files(id), so we create files before chat_messages.

-- USERS (Agents & Admins) - profile/role linked to Supabase Auth
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- = auth.users.id
    role VARCHAR(50) CHECK (role IN ('agent','admin')),
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE
);

-- SESSIONS
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- also used as the LiveKit room name
    invite_token VARCHAR(255) UNIQUE NOT NULL, -- opaque, random
    invite_expires_at TIMESTAMPTZ NOT NULL, -- set to NOW() + 30 mins
    agent_id UUID REFERENCES users(id),
    status VARCHAR(50) CHECK (status IN ('active','ended')) DEFAULT 'active',
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER, -- computed server-side
    agent_notes TEXT
);

-- PARTICIPANTS
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    role VARCHAR(50) CHECK (role IN ('agent','customer')),
    identity VARCHAR(255) NOT NULL, -- the LiveKit identity string (deterministic; see Section 9)
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- SHARED FILES
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    uploader_id UUID REFERENCES participants(id),
    s3_key VARCHAR(255) NOT NULL, -- server-generated key (never the client filename)
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHAT MESSAGES
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    participant_id UUID REFERENCES participants(id),
    payload TEXT,
    file_id UUID REFERENCES files(id) NULL, -- non-null = file message
    client_message_id UUID NOT NULL, -- client-generated, for idempotency
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, client_message_id)
);

-- RECORDINGS
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    egress_id VARCHAR(255),
    status VARCHAR(50) CHECK (status IN ('in_progress','processing','ready','failed')),
    s3_key VARCHAR(255), -- object key; signed URL minted on demand
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- EVENTS (audit trail / observability)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    participant_id UUID REFERENCES participants(id), -- nullable for system events
    event_type VARCHAR(100), -- created, joined, left, recording_started, recording_ended, etc.
    details_json JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS to block direct client access since we are building server-enforced APIs
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
