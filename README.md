# Tripledger MVP

Aplicação web para viagens, despesas partilhadas e abatimentos por participante. A interface usa React/Vite; autenticação, PostgreSQL, políticas RLS e anexos privados usam Supabase.

## Estado

O MVP inclui login direto por email/password, gestão de utilizadores, viagens, despesas e acertos. O frontend usa Supabase; a publicação está preparada para GitHub Pages através de GitHub Actions.

## Desenvolvimento local

1. Instalar Node.js e pnpm.
2. Criar um projeto Supabase e executar as migrações em `supabase/migrations/` por ordem cronológica. Num projeto já existente, aplicar também `202611130001_profile_display_name.sql` para ativar a edição do nome no perfil.
3. Copiar `.env.example` para `.env.local` e preencher o URL do projeto e a publishable key.
4. Desativar o registo público de utilizadores no Supabase Auth; as contas são criadas pela Edge Function administrativa.
5. Instalar dependências e iniciar:

   ```sh
   pnpm install
   pnpm dev
   ```

## Utilizadores e convites

- O login normal usa email e password; a aplicação não usa OTP nem confirmação de email.
- O utilizador administrador cria as contas na página **Gerir utilizadores**, define ou gera uma password inicial e entrega as credenciais diretamente ao utilizador.
- O formulário de gestão chama `create-managed-user`, que valida a sessão e compara o email do utilizador autenticado com o secret `ADMIN_EMAIL`. A função cria a conta confirmada através da Admin API do Supabase, sem enviar email.
- Publicar a função e configurar o administrador com a Supabase CLI:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase secrets set ADMIN_EMAIL=admin@example.com
   supabase functions deploy create-managed-user
   ```

- Os convites para uma viagem são distintos da criação de contas. Para enviar notificações, publicar também `send-trip-invite` e configurar `RESEND_API_KEY`, `INVITE_FROM_EMAIL` e `APP_URL` como secrets da Supabase.
- `prepare-first-access` e `bootstrap_invites` pertencem ao fluxo antigo de OTP e não são necessários para o login direto atual.

## Publicar no GitHub Pages

O frontend é uma SPA estática; a base de dados, Auth, Edge Functions e Storage permanecem na Supabase. O workflow `.github/workflows/deploy-pages.yml` publica automaticamente a pasta `dist` quando há um push para `main`, ou pode ser iniciado manualmente em **GitHub → Actions**.

1. Em **GitHub → Settings → Secrets and variables → Actions → Variables**, criar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_ADMIN_EMAIL`. A última variável só controla a apresentação da opção de gestão; a autorização é feita no servidor através do secret `ADMIN_EMAIL`.
2. Em **GitHub → Settings → Pages**, definir **Build and deployment → Source** como **GitHub Actions**.
3. Enviar as alterações para `main` e acompanhar o workflow **Deploy to GitHub Pages** no separador **Actions**.
4. Após o workflow terminar com sucesso, abrir `https://shurikahta.github.io/tripledger/`.
5. Em **Supabase → Authentication → URL Configuration**, definir esse endereço como **Site URL** e adicionar `https://shurikahta.github.io/tripledger/**` às **Redirect URLs**.

Os valores `VITE_*` ficam incluídos no JavaScript público do site. A publishable key e o email do administrador são dados públicos; nunca adicionar `service_role`, credenciais SMTP ou Resend ao frontend, às variáveis `VITE_*` ou ao Git. O workflow falha com uma mensagem explícita se faltar alguma das três variáveis.

O bucket `expense-attachments` é privado e aceita PDF, JPG e PNG até 10 MB. Os caminhos dos ficheiros usam o formato `<trip_id>/<expense_id>/<nome>`.

## Limitações conhecidas do MVP

- O plano de pagamento substitui as tranches previstas anteriormente ao guardar um novo plano; abatimentos efetivos permanecem no histórico.
- Os anexos obrigatórios são verificados antes de guardar a despesa. O acesso a anexos depende das políticas de Storage da migração.
- O envio de convites requer a configuração de Resend; sem essa configuração, o convite fica guardado e a interface informa que o email não foi enviado.
- A migração ainda precisa de ser aplicada e validada num projeto Supabase real antes de usar dados reais.
