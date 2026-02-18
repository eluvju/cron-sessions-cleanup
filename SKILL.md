# Skill: Session Cleaner

Limpa sessões órfãs de cron do OpenClaw para evitar acúmulo de sessões zumbis.

## Problema

O OpenClaw cria sessões com `:run:` no nome para cada execução de cron job. Quando cron jobs rodam frequentemente (ex: arbitragem a cada minuto), essas sessões se acumulam e travam o sistema.

## Instalação

```bash
cd /root/.openclaw/workspace/skills/session-cleaner
npm install
```

## Uso

### Limpar agora (manual)
```bash
node index.js --cleanup
```

### Simular (ver o que seria limpado)
```bash
node index.js --dry-run
```

### Configurar cleanup automático
```bash
# A cada hora
node index.js --setup 1h

# A cada 6 horas
node index.js --setup 6h
```

### Ver status
```bash
node index.js --status
```

### Removerbash
node index cron automático
```.js --remove
```

## Configuração

### Variáveis de ambiente
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `OPENCLAW_SESSIONS` | `/root/.openclaw/agents/main/sessions/sessions.json` | Caminho do arquivo |
| `CLEANUP_FREQUENCY` | `1h` | Frequência do cron |
| `CLEANUP_MIN_AGE` | `0` | Idade mínima em ms |

### Frequências disponíveis
- `30m` - a cada 30 minutos
- `1h` - a cada hora
- `2h` - a cada 2 horas
- `6h` - a cada 6 horas
- `12h` - a cada 12 horas
- `24h` - uma vez por dia

## O que faz

1. **Lê** o arquivo de sessões do OpenClaw
2. **Identifica** sessões órfãs (contêm `:run:` no nome)
3. **Faz backup** antes de limpar
4. **Remove** as sessões órfãs
5. **Salva** o arquivo limpo

## Log

Logs são salvos em:
- `/var/log/openclaw-session-cleaner.log`

## Requisitos

- Node.js 18+
- Acesso ao arquivo de sessões do OpenClaw
- Permissão para configurar crontab (para setup automático)

## Troubleshooting

### "Permission denied" ao configurar cron
Execute com sudo:
```bash
sudo node index.js --setup
```

### Verificar se cron está rodando
```bash
crontab -l | grep "Session Cleaner"
```

## Contribuição

Fork no GitHub e contribua!
