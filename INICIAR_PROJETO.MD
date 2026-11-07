> **Nota:** Este documento é histórico de uma das versões de origem. Para executar a versão integrada, siga o `README.md` da raiz.

# Iniciar o projeto Taú Sports

1. Instale Node.js 18 ou superior e MySQL 8 ou superior.
2. Copie `.env.example` para `.env` e preencha os dados do seu banco.
3. Gere uma chave exclusiva para `SESSION_SECRET`:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Instale as dependências travadas no projeto:

   ```bash
   npm ci
   ```

5. Crie o banco `tau_sports` no MySQL e prepare as tabelas:

   ```bash
   npm run banco:preparar
   ```

6. Crie o primeiro administrador e inicie a aplicação:

   ```bash
   npm run admin:criar
   npm start
   ```

As credenciais Google e Facebook são opcionais. Configure-as no `.env` junto com `APP_ORIGIN` para habilitar o login social.
