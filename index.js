#!/usr/bin/env node

/**
 * Session Cleaner - Skill para limpar sessões órfãs do OpenClaw
 * 
 * Remove sessões de cron que contêm ":run:" no nome
 * Suporta cleanup manual e automático via cron do sistema
 * 
 * Uso:
 *   node index.js --help
 *   node index.js --cleanup
 *   node index.js --dry-run
 *   node index.js --setup (configura cron do sistema)
 *   node index.js --remove (remove cron do sistema)
 *   node index.js --status
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SESSIONS_FILE = process.env.OPENCLAW_SESSIONS || '/root/.openclaw/agents/main/sessions/sessions.json';
const BACKUP_DIR = '/root/.openclaw/agents/main/sessions/backups';
const CRON_IDENTIFIER = '# OpenClaw Session Cleaner';

const CONFIG = {
  frequency: process.env.CLEANUP_FREQUENCY || '1h',  // 1h, 2h, 6h, 12h, 24h
  minAge: process.env.CLEANUP_MIN_AGE || 0,          // em ms (0 = qualquer idade)
  dryRun: false
};

// Cores para console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(50)}`, 'blue');
  log(title, 'cyan');
  log('='.repeat(50), 'blue');
}

function getFrequencyCron(freq) {
  const map = {
    '30m': '*/30 * * * *',
    '1h': '0 * * * *',
    '2h': '0 */2 * * *',
    '6h': '0 */6 * * *',
    '12h': '0 */12 * * *',
    '24h': '0 0 * * *'
  };
  return map[freq] || map['1h'];
}

function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    log(`ERRO: Arquivo de sessões não encontrado: ${SESSIONS_FILE}`, 'red');
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch (err) {
    log(`ERRO ao ler sessões: ${err.message}`, 'red');
    return null;
  }
}

function findOrphanSessions(sessions) {
  const now = Date.now();
  const orphans = [];
  const cronSessions = [];
  
  for (const [key, value] of Object.entries(sessions)) {
    // Sessões de cron com :run: são órfãs
    if (key.includes(':run:')) {
      const age = now - (value.updatedAt || 0);
      orphans.push({
        key,
        sessionId: value.sessionId,
        updatedAt: value.updatedAt,
        age,
        label: value.label || key
      });
    }
    // Todas as sessões de cron
    if (key.includes('cron')) {
      cronSessions.push({
        key,
        sessionId: value.sessionId,
        updatedAt: value.updatedAt,
        label: value.label || key
      });
    }
  }
  
  return { orphans, cronSessions };
}

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const backupFile = path.join(BACKUP_DIR, `sessions-${Date.now()}.json`);
  fs.copyFileSync(SESSIONS_FILE, backupFile);
  log(`Backup criado: ${backupFile}`, 'yellow');
  return backupFile;
}

function cleanup(dryRun = false) {
  logSection('SESSION CLEANER - OpenClaw');
  
  const sessions = loadSessions();
  if (!sessions) return { success: false, error: 'Failed to load sessions' };
  
  const before = Object.keys(sessions).length;
  const { orphans, cronSessions } = findOrphanSessions(sessions);
  
  log(`Sessões totais: ${before}`);
  log(`Sessões de cron: ${cronSessions.length}`);
  log(`Sessões órfãs (:run:): ${orphans.length}`, orphans.length > 0 ? 'red' : 'green');
  
  if (orphans.length === 0) {
    log('\n✅ Nenhuma sessão órfã para limpar!', 'green');
    return { success: true, cleaned: 0 };
  }
  
  // Mostrar sessões órfãs
  log('\n📋 Sessões órfãs encontradas:', 'yellow');
  orphans.slice(0, 10).forEach(o => {
    const ageMin = Math.round(o.age / 60000);
    log(`  - ${o.key.substring(0, 60)}... (${ageMin}min)`, 'yellow');
  });
  if (orphans.length > 10) {
    log(`  ... e mais ${orphans.length - 10}`, 'yellow');
  }
  
  if (dryRun) {
    log(`\n🔍 [DRY RUN] Seriam removidas: ${orphans.length} sessões`, 'yellow');
    return { success: true, dryRun: true, wouldClean: orphans.length };
  }
  
  // Criar backup antes de limpar
  createBackup();
  
  // Remover órfãs
  for (const orphan of orphans) {
    delete sessions[orphan.key];
  }
  
  // Salvar
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  
  const after = Object.keys(sessions).length;
  const removed = before - after;
  
  log(`\n✅ Limpeza concluída! Removidas: ${removed} sessões`, 'green');
  
  return { success: true, cleaned: removed };
}

function setupCron(frequency = '1h') {
  logSection('CONFIGURAR CRON AUTOMÁTICO');
  
  const cronExpr = getFrequencyCron(frequency);
  const scriptPath = path.resolve(__dirname, 'index.js');
  
  // Verificar se já existe
  try {
    const currentCrontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    if (currentCrontab.includes(CRON_IDENTIFIER)) {
      log('⚠️ Cron já configurado. Removendo primeiro...', 'yellow');
      removeCron();
    }
  } catch (e) {
    // Nenhum crontab existente
  }
  
  const cronEntry = `${cronExpr} cd ${path.dirname(scriptPath)} && node index.js --cleanup >> /var/log/openclaw-session-cleaner.log 2>&1 ${CRON_IDENTIFIER}`;
  
  try {
    // Adicionar ao crontab
    execSync(`(crontab -l 2>/dev/null; echo "${cronEntry}") | crontab -`, { encoding: 'utf8' });
    log(`✅ Cron configurado com sucesso!`, 'green');
    log(`   Frequência: ${frequency} (${cronExpr})`, 'cyan');
    log(`   Script: ${scriptPath}`, 'cyan');
    log(`   Log: /var/log/openclaw-session-cleaner.log`, 'cyan');
    
    return { success: true, frequency, cron: cronExpr };
  } catch (err) {
    log(`❌ ERRO ao configurar cron: ${err.message}`, 'red');
    log('\nPara configurar manualmente, execute:', 'yellow');
    log(`  sudo crontab -e`, 'cyan');
    log(`  Adicione: ${cronEntry}`, 'cyan');
    
    return { success: false, error: err.message };
  }
}

function removeCron() {
  logSection('REMOVER CRON AUTOMÁTICO');
  
  try {
    const currentCrontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    const lines = currentCrontab.split('\n').filter(line => !line.includes(CRON_IDENTIFIER));
    execSync(`echo "${lines.join('\n')}" | crontab -`, { encoding: 'utf8' });
    log('✅ Cron removido com sucesso!', 'green');
    return { success: true };
  } catch (err) {
    log('ℹ️ Nenhum cron encontrado para remover', 'yellow');
    return { success: true };
  }
}

function showStatus() {
  logSection('STATUS DO CLEANER');
  
  // Verificar cron
  try {
    const crontab = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    if (crontab.includes(CRON_IDENTIFIER)) {
      log('✅ Cron automático: ATIVO', 'green');
      const line = crontab.split('\n').find(l => l.includes(CRON_IDENTIFIER));
      if (line) log(`   ${line}`, 'cyan');
    } else {
      log('❌ Cron automático: INATIVO', 'red');
    }
  } catch (e) {
    log('❌ Cron automático: INATIVO', 'red');
  }
  
  // Verificar sessões
  const sessions = loadSessions();
  if (sessions) {
    const { orphans, cronSessions } = findOrphanSessions(sessions);
    log(`\n📊 Sessões de cron: ${cronSessions.length}`);
    log(`📊 Sessões órfãs: ${orphans.length}`, orphans.length > 0 ? 'red' : 'green');
  }
}

function showHelp() {
  logSection('SESSION CLEANER - Ajuda');
  
  console.log(`
用法 (Usage):
  node index.js --cleanup      Limpa sessões órfãs agora
  node index.js --dry-run     Simula sem limpar
  node index.js --setup       Configura cron automático
  node index.js --remove      Remove cron automático
  node index.js --status      Mostra status atual
  node index.js --help        Mostra esta ajuda
  node index.js --config      Configurações

Exemplos:
  # Limpar agora
  node index.js --cleanup
  
  # Ver o que seria limpado
  node index.js --dry-run
  
  # Configurar limpeza a cada hora
  node index.js --setup 1h
  
  # Configurar limpeza a cada 6 horas
  node index.js --setup 6h
  
  # Ver status
  node index.js --status

Variáveis de ambiente:
  OPENCLAW_SESSIONS   Caminho para sessions.json
  CLEANUP_FREQUENCY   Frequência (30m, 1h, 2h, 6h, 12h, 24h)
  CLEANUP_MIN_AGE     Idade mínima em ms
`);
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
} else if (args.includes('--cleanup')) {
  cleanup(false);
} else if (args.includes('--dry-run')) {
  cleanup(true);
} else if (args.includes('--setup')) {
  const freq = args.find(a => a.match(/^\d+h$|^\d+m$/)) || '1h';
  setupCron(freq);
} else if (args.includes('--remove')) {
  removeCron();
} else if (args.includes('--status')) {
  showStatus();
} else {
  showHelp();
}
