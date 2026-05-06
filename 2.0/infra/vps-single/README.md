# AgenteZap VPS unica - staging paralelo

Esta pasta define a base do novo ambiente em uma VPS Hostinger unica, sem tocar no ambiente atual Vercel + gateway.

Objetivo:

- rodar `web`, `api`, `worker`, `gateway` e `proxy` em containers separados;
- fazer deploy rapido por servico;
- evitar build pesado na VPS;
- preservar volumes de sessao;
- permitir migrar o dominio apenas depois de validar o novo ambiente.

Na VPS Hostinger paralela, a stack deve ficar em `/opt/agentezap-single/compose` e usar volumes em `/data/agentezap`. Isso evita conflito com qualquer instalacao antiga que exista em `/opt/agentezap` ou sessoes antigas em `/data/whatsapp-sessions`.

## Fluxo de deploy rapido

O caminho comum de deploy nao reinicia a VPS e nao derruba todos os servicos:

```bash
./scripts/deploy-service.sh api ghcr.io/OWNER/agentezap-api:SHA
./scripts/deploy-service.sh worker ghcr.io/OWNER/agentezap-worker:SHA
./scripts/deploy-service.sh web ghcr.io/OWNER/agentezap-web:SHA
```

O script atualiza a imagem no `.env.runtime`, faz `docker compose pull` e sobe apenas o servico escolhido com `--no-deps --wait`.

## GitHub Actions

Workflow ativo:

- `.github/workflows/agentezap-vps-fast-deploy.yml`

Secrets necessarios no repositorio:

- `AGENTEZAP_VPS_HOST`: IP ou host da VPS. Para esta VPS: `187.127.18.177`.
- `AGENTEZAP_VPS_USER`: usuario SSH. Para esta VPS: `root`.
- `AGENTEZAP_VPS_SSH_PRIVATE_KEY`: chave privada gerada localmente em `2.0/infra/vps-single/secrets/agentezap_vps_fast_deploy_ed25519`.

A chave publica correspondente ja foi instalada em `/root/.ssh/authorized_keys` na VPS e o login por chave foi testado.

Depois dos secrets configurados, o deploy rapido fica assim:

1. Abrir o workflow `Fast deploy AgenteZap VPS`.
2. Escolher `service`:
   - `web`: somente painel/frontend.
   - `api`: somente API.
   - `worker`: filas, IA, follow-up e jobs.
   - `app`: API, worker e web usando a mesma imagem do app.
   - `gateway`: somente WhatsApp/Baileys/W-API.
   - `all`: gateway, API, worker e web.
3. Rodar o workflow.

O workflow faz build com cache no GitHub Actions, publica no GHCR e chama `scripts/fast-deploy.sh` na VPS. A VPS nao builda codigo no caminho comum.

Observacao de operacao: a imagem `agentezap-app` e construida a partir da raiz atual do repositorio (`.`). Isso mantem todos os chats trabalhando no mesmo codigo principal, sem worktree ou workspace paralelo para o app.

## Fases

1. Preparar VPS nova e snapshots.
2. Subir `proxy`, `web` e `api` com dominio temporario.
3. Subir `worker` sem consumir fila real de producao.
4. Subir `gateway` com numero de teste, sem migrar sessoes reais.
5. Medir latencia e validar rollback.
6. Migrar dominio quando o ambiente novo estiver comprovado.

## Arquivos

- `compose.yml`: stack da VPS unica.
- `Caddyfile`: proxy HTTPS.
- `env/*.example`: modelos de variaveis sem segredos.
- `scripts/bootstrap-folders.sh`: cria diretorios persistentes.
- `scripts/deploy-service.sh`: deploy por servico.
- `scripts/health.sh`: health geral da stack.
- `scripts/rollback-service.sh`: volta um servico para imagem anterior informada.

## Regras

- Nao usar `docker compose down` em deploy normal.
- Nao reiniciar a VPS em deploy normal.
- Nao apagar `/data/agentezap/sessions`.
- Nao rodar build pesado na VPS, exceto fallback emergencial.
- Gateway so recebe deploy quando mudanca tocar WhatsApp/Baileys/sessoes/W-API.
- Worker precisa terminar jobs ou devolve-los para fila antes de desligar.
