# Decisões técnicas — viagens e acertos de despesas

**Estado:** MVP iniciado. As decisões confirmadas pelo utilizador estão separadas dos padrões provisórios e das questões que ainda dependem de configuração.

## Objetivo técnico

Disponibilizar uma aplicação web responsiva, acessível pelo browser, para gerir viagens, despesas repartidas e acertos por participante. A aplicação está implementada como MVP em React, TypeScript e Vite; Auth, PostgreSQL, funções backend e armazenamento de anexos usam Supabase.

## Decisões confirmadas

- **Acesso:** aplicação online, acessível por browser.
- **Contas:** criação ad hoc pelo administrador através da página de gestão, com password definida ou gerada internamente e entregue diretamente ao utilizador.
- **Autenticação:** login direto por email/password, sem OTP nem confirmação de email.
- **Perfil:** cada utilizador pode alterar o próprio nome apresentado através do avatar no topo e terminar sessão no mesmo local.
- **Criação e gestão de viagens:** qualquer utilizador com conta ativa pode criar uma viagem e torna-se manager dessa viagem. As permissões de manager são limitadas às viagens que gere.
- **Privacidade:** participantes consultam apenas as suas próprias despesas, planos, abatimentos e saldos. O manager consulta e gere os dados das viagens sob a sua responsabilidade.
- **Despesas:** cada despesa tem descritivo e valor; pode ter anexo opcional, que o manager pode exigir. Todas as despesas são repartidas. A divisão igual é o padrão e o manager pode personalizar os valores atribuídos.
- **Acertos:** o manager define valores e datas previstos para cada tranche. Cada abatimento efetivo é confirmado pelo manager com o valor e a data reais, que podem diferir do previsto. O saldo é calculado a partir dos abatimentos efetivamente registados.
- **Alojamento:** preferência inicial por uma opção gratuita, sujeita à validação das limitações e dos termos aplicáveis.

## Decisões técnicas do MVP

- **Aplicação:** SPA responsiva em React, TypeScript e Vite. A aplicação usa a publishable key da Supabase no browser; chaves secretas ficam exclusivamente nas Edge Functions.
- **Dados:** PostgreSQL gerido pela Supabase. Valores monetários são guardados como cêntimos inteiros. A migração está em `supabase/migrations/202611120001_init.sql`.
- **Autenticação:** o frontend usa Supabase Auth `signInWithPassword`. O registo público deve estar desativado; o fluxo antigo de OTP, `prepare-first-access` e `bootstrap_invites` não é usado pela interface atual.
- **Provisionamento de utilizadores:** `create-managed-user` valida o JWT e compara o email autenticado com o secret `ADMIN_EMAIL`, depois cria a conta confirmada pela Admin API. A variável pública `VITE_ADMIN_EMAIL` serve apenas para mostrar o controlo na interface; não é uma fronteira de segurança.
- **Perfil:** `profiles.display_name` guarda o nome escolhido pelo utilizador. A migração `202611130001_profile_display_name.sql` adiciona a coluna e permite atualização apenas do próprio perfil, sujeita à política RLS existente.
- **Convites:** a associação à viagem continua separada da criação de contas. Resend pode enviar a notificação do convite; SMTP de autenticação para OTP não é necessário no fluxo atual.
- **Autorização e privacidade:** RLS está ativado em todas as tabelas expostas. RPCs verificam o manager da viagem. Participantes recebem apenas a sua parte e os seus movimentos; o valor total da despesa é devolvido apenas ao manager. Os anexos usam bucket privado e links temporários sujeitos a autorização.
- **Anexos:** PDFs, JPG e PNG, até 10 MB por ficheiro, em armazenamento privado Supabase Storage.
- **Histórico financeiro:** cada abatimento confirmado fica como movimento imutável com valor e data efetivos. O saldo não é editável diretamente.
- **Moeda:** EUR.
- **Integração com budget mensal:** não foi especificada uma integração com outro sistema. Por omissão, o MVP regista os abatimentos confirmados pelo manager e apresenta o saldo, sem efetuar débitos automáticos num sistema externo.

## Alojamento gratuito: limitações a validar

Uma opção gratuita pode servir para protótipo ou piloto, mas não se deve assumir que oferece disponibilidade, backups ou envio de email adequados para uso continuado. A escolha deve cobrir aplicação, base de dados persistente, autenticação por email, armazenamento privado de anexos, exportação/backup e termos que permitam o uso pretendido.

- O plano gratuito do Supabase indica limites de base de dados e armazenamento e pode pausar projetos sem atividade. O fluxo atual não depende de SMTP de autenticação; notificações opcionais de convite usam Resend. [Planos Supabase](https://supabase.com/pricing)
- GitHub Pages publica apenas ficheiros estáticos; neste projeto, o backend, a autenticação, a base de dados e os anexos permanecem na Supabase. O deploy de teste usa GitHub Actions e o caminho `/tripledger/`. Antes de produção, validar os termos e requisitos de disponibilidade do alojamento. [GitHub Pages: criação e limites](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) · [Limites de uso do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- O Render documenta que os serviços web gratuitos adormecem após inatividade e que as bases de dados Postgres gratuitas expiram ao fim de 30 dias; não é adequado usar essa base como armazenamento persistente de dados reais. [Limitações do plano gratuito Render](https://render.com/docs/free)
- O plano Hobby da Vercel é limitado a utilização pessoal ou não comercial nos seus termos; não o assumir como opção para uma ferramenta de uso empresarial. [Termos da Vercel](https://vercel.com/legal/terms)

**Orientação:** o frontend está preparado para GitHub Pages; o workflow exige as variáveis públicas da Supabase no repositório. Aplicar todas as migrações por ordem e validar Auth, RLS, provisionamento seguro, persistência, backups e termos do alojamento antes de usar dados reais.

## Regras de integridade e cenários

- A soma das partes atribuídas deve corresponder ao valor total da despesa.
- Cêntimos residuais numa divisão igual são atribuídos, um a um, aos primeiros participantes na ordem de criação da associação à viagem.
- O saldo de cada participante é o total atribuído menos os abatimentos efetivamente confirmados.
- A aplicação bloqueia um abatimento que exceda o saldo em dívida.
- As tranches previstas não contam como pagas até existir confirmação do abatimento efetivo.
- Ao registar um abatimento, as tranches futuras são recalculadas com base no saldo restante e no valor mensal planeado. A data da próxima tranche mantém-se quando ainda está no futuro; caso contrário, passa para o mês seguinte.
- Uma tranche prevista para o dia 31 vence no último dia do mês que não tenha dia 31.
- Um abatimento diferente do valor previsto deve atualizar o saldo e deixar as restantes previsões visíveis para revisão.
- A última tranche pode ser inferior ao valor mensal definido para o plano.
- Os anexos devem continuar privados mesmo quando se conhece o URL do ficheiro.
- Um utilizador sem associação ativa a uma viagem não pode consultar os respetivos dados.
- O manager pode criar contas e convidar participantes para uma viagem; a criação da conta e a associação à viagem são operações distintas.

## Configuração e decisões ainda em aberto

1. Criar projeto Supabase e aplicar todas as migrações em ordem cronológica.
2. Desativar o registo público de utilizadores; definir `ADMIN_EMAIL` nos secrets e publicar `create-managed-user` com a Supabase CLI.
3. Definir `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_ADMIN_EMAIL` nas variáveis do GitHub e publicar pelo workflow Pages.
4. Confirmar backups e responsável operacional antes de usar dados reais.
5. Definir validade, reenvio e cancelamento de convites.
6. Confirmar campos adicionais de viagem, se necessários além do nome e datas.

## Critérios de aceitação técnica

- Utilizadores autorizados iniciam sessão diretamente com email/password, sem OTP ou confirmação de email.
- Apenas o email configurado em `ADMIN_EMAIL` pode criar contas através da Edge Function; outros utilizadores recebem uma resposta não autorizada.
- O utilizador pode atualizar o próprio nome de perfil; não pode atualizar o perfil de outra pessoa.
- Um utilizador ativo pode criar uma viagem e gerir essa viagem sem ganhar acesso de manager às restantes.
- Políticas RLS e RPCs impedem um participante de consultar partes, planos, abatimentos ou anexos de outra pessoa.
- O participante consulta, em cada viagem, as tranches previstas e o histórico de abatimentos confirmados.
- Divisão igual e personalizada preserva o total da despesa ao cêntimo.
- Plano previsto, histórico de abatimentos efetivos, datas e saldo são apresentados separadamente; o plano futuro é recalculado após abatimentos parciais ou variáveis.
- Dados e anexos persistem a reinícios e novas publicações da aplicação.

