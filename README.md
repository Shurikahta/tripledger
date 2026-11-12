# Tripledger MVP

Aplicação web para viagens, despesas partilhadas e abatimentos por participante. A interface usa React/Vite; autenticação, PostgreSQL, políticas RLS e anexos privados usam Supabase.

## Estado

Este workspace contém agora o esqueleto funcional do MVP e a migração SQL. Ainda não existe um projeto Supabase ligado, nem credenciais de email ou alojamento configuradas.

## Desenvolvimento local

1. Instalar Node.js e pnpm.
2. Criar um projeto Supabase e executar `supabase/migrations/202611120001_init.sql` no SQL Editor.
3. Copiar `.env.example` para `.env.local` e preencher o URL do projeto e a publishable key.
4. Configurar um servidor SMTP próprio para os OTPs. O servidor de email padrão da Supabase é apenas para testes e não envia para qualquer endereço convidado.
5. Instalar dependências e iniciar:

   ```sh
   pnpm install
   pnpm dev
   ```

## Convites e primeiro acesso

- Desativar o registo público de utilizadores nas definições de Auth da Supabase. A Edge Function `prepare-first-access` cria uma identidade apenas depois de confirmar um convite pendente.
- Depois da migração e antes do primeiro acesso, inserir o email inicial autorizado na tabela `bootstrap_invites` (via SQL Editor):

  ```sql
  insert into public.bootstrap_invites (email) values (lower('primeiro.manager@exemplo.com'));
  ```

  Esse endereço recebe acesso OTP uma vez e pode criar a primeira viagem. A autorização inicial é consumida na ativação; depois, os managers convidam participantes por viagem.
- Publicar as Edge Functions `prepare-first-access` e `send-trip-invite`.
- Para `send-trip-invite`, configurar os secrets `RESEND_API_KEY`, `INVITE_FROM_EMAIL` e `APP_URL` no projeto Supabase. O serviço Resend requer um domínio remetente verificado.
- Configurar os modelos de email de Auth para enviar o token OTP, usando `{{ .Token }}` no modelo de acesso por email.
- Os utilizadores ativam a conta validando o OTP; a associação pendente à viagem é ativada depois da confirmação do email. No primeiro acesso definem uma password.

## Deploy

O frontend é uma SPA estática e pode ser publicado num alojamento de frontend. A base de dados, Auth, Edge Functions e Storage permanecem na Supabase. Definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de build do alojamento do frontend.

O bucket `expense-attachments` é privado e aceita PDF, JPG e PNG até 10 MB. Os caminhos dos ficheiros usam o formato `<trip_id>/<expense_id>/<nome>`.

## Limitações conhecidas do MVP

- O plano de pagamento substitui as tranches previstas anteriormente ao guardar um novo plano; abatimentos efetivos permanecem no histórico.
- Os anexos obrigatórios são verificados antes de guardar a despesa. O acesso a anexos depende das políticas de Storage da migração.
- O envio de convites requer a configuração de Resend; sem essa configuração, o convite fica guardado e a interface informa que o email não foi enviado.
- A migração ainda precisa de ser aplicada e validada num projeto Supabase real antes de usar dados reais.
