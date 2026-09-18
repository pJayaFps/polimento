const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL, papel TEXT NOT NULL DEFAULT 'lider', criado_em TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS polimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, hora TEXT NOT NULL,
    chassi TEXT NOT NULL, carro TEXT NOT NULL, modelo TEXT NOT NULL, cor TEXT NOT NULL,
    tipo_polimento TEXT NOT NULL CHECK(tipo_polimento IN ('COMPLETO','PARCIAL')),
    observacoes TEXT, responsavel TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT
  );
  CREATE TABLE IF NOT EXISTS solicitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acao TEXT NOT NULL CHECK(acao IN ('CRIAR','EDITAR','EXCLUIR')),
    polimento_id INTEGER,
    dados TEXT,
    solicitante_id INTEGER NOT NULL,
    solicitante_nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','APROVADO','REJEITADO')),
    criado_em TEXT NOT NULL,
    decidido_em TEXT,
    decidido_por TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_polimentos_chassi ON polimentos(chassi);
  CREATE INDEX IF NOT EXISTS idx_polimentos_data ON polimentos(data);
  CREATE INDEX IF NOT EXISTS idx_polimentos_carro ON polimentos(carro);
  CREATE INDEX IF NOT EXISTS idx_polimentos_tipo ON polimentos(tipo_polimento);
  CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status);
`);
if (!db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get('lider')) {
  db.prepare('INSERT INTO usuarios (nome, usuario, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run('Líder', 'lider', bcrypt.hashSync('Polimento@2026', 12), 'lider', new Date().toISOString());
}
if (!db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get('polidor')) {
  db.prepare('INSERT INTO usuarios (nome, usuario, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run('Polidor', 'polidor', bcrypt.hashSync('Polidor@2026', 12), 'polidor', new Date().toISOString());
}
module.exports = { db, dbPath };
