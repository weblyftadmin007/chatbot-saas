-- Initial schema for multi-tenant chatbot
-- Run with: python run_migrations.py (idempotent; the container runs it on boot)

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    domain TEXT,
    plan TEXT DEFAULT 'free',
    settings TEXT DEFAULT '{}',
    business_hours TEXT,
    timezone TEXT DEFAULT 'UTC',
    slot_duration INTEGER DEFAULT 30,
    buffer_minutes INTEGER DEFAULT 15,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- End users table
CREATE TABLE IF NOT EXISTS end_users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    clerk_user_id TEXT UNIQUE,
    email TEXT,
    name TEXT,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    end_user_id TEXT REFERENCES end_users(id),
    status TEXT DEFAULT 'active',
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    intent TEXT,
    tool_calls TEXT,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    conversation_id TEXT REFERENCES conversations(id),
    end_user_id TEXT REFERENCES end_users(id),
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    title TEXT,
    notes TEXT,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Knowledge chunks table
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    source_id TEXT,
    source_type TEXT,
    content TEXT NOT NULL,
    embedding BLOB,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Vector search virtual table (requires sqlite-vec extension)
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
    embedding FLOAT[768],
    chunk_id TEXT
);

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    event_type TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conv_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(end_user_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_appt_tenant_time ON appointments(tenant_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appt_user ON appointments(end_user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_enduser_tenant ON end_users(tenant_id);