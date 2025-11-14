# iWanted

Aplicacao Node.js + Express que entrega as paginas estaticas do site e uma API administrativa para cadastro de produtos.

## Estrutura das pastas

- `backend/`  
  - `server.js`: servidor Express.  
  - `data/`: banco SQLite (`iwanted.sqlite`) e arquivos enviados pelo painel (`uploads/`).
- `frontend/public/`: arquivos estaticos do site (HTML, CSS, JS e imagens).
- `package.json`: scripts de inicializacao (`npm start` roda `backend/server.js`).  
- `Dockerfile`, `docker-compose.yml`: utilitarios para conteneirizacao.

## Executando localmente

```bash
npm install
npm start
```

O servidor sobe em `http://localhost:3000`. Ajuste as variaveis de ambiente conforme necessario:

| Variavel              | Descricao                                                             | Padrao          |
| --------------------- | --------------------------------------------------------------------- | ----------------|
| `PORT`                | Porta interna do Express                                              | `3000`          |
| `HOST`                | Interface exposta pelo Express                                        | `0.0.0.0`       |
| `PUBLIC_URL`          | URL publica usada somente nos logs                                    | vazio           |
| `CORS_ORIGIN`         | Origem autorizada para requisicoes (usa `PUBLIC_URL` quando definido) | `*`             |
| `ADMIN_USER`          | Usuario para acessar `/admin`                                         | `kayo`          |
| `ADMIN_PASS`          | Senha para acessar `/admin`                                           | `@Mine9273`     |
| `SUPABASE_URL`        | URL do projeto Supabase (opcional)                                    | `https://ozulqzzgmglucoaqhlen.supabase.co` |
| `SUPABASE_SERVICE_ROLE` / `SUPABASE_ANON_KEY` | Chaves Supabase usadas para sincronizar os produtos         | service role configurada |
| `SUPABASE_TABLE`      | Nome da tabela Supabase usada na sincronizacao                        | `products_sheet`|
| `SUPABASE_VISITORS_TABLE` | Tabela Supabase usada para registrar visitantes (coluna `numero`) | `entrou`        |

Para criar essa estrutura de controle de visitas no Supabase, execute o script em `backend/sql/create_visitors_table.sql`. Ele cria
as tabelas `public.entrou` (dados agregados por visitante) e `public.entrou_logs` (historico detalhado), alem das politicas basicas
de RLS esperadas pela aplicacao.

> Dica: crie um arquivo `.env` com esses campos (sem subir para o Git) e use `cross-var` ou similar se precisar carregar automaticamente.

## Guia de deploy na Hostinger (Node.js)

1. **Preparar os arquivos**
   - Faca upload de todo o projeto para a hospedagem (por exemplo via SFTP).  
   - Garanta que `backend/server.js` e `package.json` estejam na mesma raiz onde o app sera iniciado.  
   - Crie a pasta `backend/data/uploads` caso ainda nao exista (o servidor cria automaticamente em tempo de execucao).

2. **Configurar o aplicativo Node.js no hPanel**
   - Acesse **Sites > (seu site) > Gerenciar > Node.js**.  
   - Defina o *Document Root* como a pasta onde voce enviou o projeto (por exemplo `~/domains/seusite.com/backend`).  
   - Em **Application Startup File**, informe `../backend/server.js` ou o caminho equivalente partindo da raiz do Document Root.  
   - Em **Application URL**, escolha o dominio/subdominio que vai apontar para o app.

3. **Variaveis de ambiente**
   - Dentro do painel, cadastre as variaveis listadas na tabela acima (ao menos `ADMIN_USER`, `ADMIN_PASS`, `PUBLIC_URL`).

4. **Instalar dependencias e iniciar**
   - Ainda na area do app Node.js, clique em **Install Dependencies** (o Hostinger executa `npm install`).  
   - Depois, clique em **Restart** para subir o servidor com `npm start` (que roda `node backend/server.js`).

5. **Rotas expostas**
   - `GET /` - landing page.  
   - `GET /catalogo` - listagem.  
   - `GET /produto/:id` - detalhe.  
   - `GET /admin` - painel protegido por Basic Auth.  
   - `POST /api/upload`, `POST/PUT/DELETE /api/products` - operacoes administradas (precisam de autenticacao).

### Alternativa: usar proxy reverso

Se estiver em um VPS, use um proxy (NGINX, Caddy) apontando para `HOST=0.0.0.0` e `PORT=3000`, conforme o exemplo em `docker-compose.yml`.

## Docker

```bash
docker compose up --build
```

Volumes montados mantem o banco (`backend/data`) e os arquivos do site (`frontend/public`). Ajuste as variaveis no arquivo conforme o ambiente.

## Backup e conteudo enviado

- Banco e uploads ficam em `backend/data`. Faca backup periodico desses arquivos.  
- Limpe a pasta `uploads/` se precisar remover imagens antigas (o app nao apaga automaticamente).

---

Qualquer duvida ou se precisar de script extra para deploy continuo, abra uma issue ou entre em contato.
