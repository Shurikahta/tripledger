# Decisões técnicas — viagens e acertos de despesas

**Estado:** MVP iniciado. As decisões confirmadas pelo utilizador estão separadas dos padrões provisórios e das questões que ainda dependem de configuração.

## Objetivo técnico

Disponibilizar uma aplicação web responsiva, acessível pelo browser, para gerir viagens, despesas repartidas e acertos por participante. A aplicação está implementada como MVP em React, TypeScript e Vite; Auth, PostgreSQL, funções backend e armazenamento de anexos usam Supabase.

## Decisões confirmadas

- **Acesso:** aplicação online, acessível por browser.
- **Contas:** sem registo público. O manager convida por email; não há restrição ao domínio do endereço.
- **Convite e ativação:** o convite cria uma conta pendente associada ao email. No primeiro acesso, o utilizador valida um OTP enviado para esse email e define uma password. Nos acessos seguintes, usa email e password, com recuperação de password disponível.
- **Criação e gestão de viagens:** qualquer utilizador com conta ativa pode criar uma viagem e torna-se manager dessa viagem. As permissões de manager são limitadas às viagens que gere.
- **Privacidade:** participantes consultam apenas as suas próprias despesas, planos, abatimentos e saldos. O manager consulta e gere os dados das viagens sob a sua responsabilidade.
- **Despesas:** cada despesa tem descritivo e valor; pode ter anexo opcional, que o manager pode exigir. Todas as despesas são repartidas. A divisão igual é o padrão e o manager pode personalizar os valores atribuídos.
- **Acertos:** o manager define valores e datas previstos para cada tranche. Cada abatimento efetivo é confirmado pelo manager com o valor e a data reais, que podem diferir do previsto. O saldo é calculado a partir dos abatimentos efetivamente registados.
- **Alojamento:** preferência inicial por uma opção gratuita, sujeita à validação das limitações e dos termos aplicáveis.

## Decisões técnicas do MVP

- **Aplicação:** SPA responsiva em React, TypeScript e Vite. A aplicação usa a publishable key da Supabase no browser; chaves secretas ficam exclusivamente nas Edge Functions.
- **Dados:** PostgreSQL gerido pela Supabase. Valores monetários são guardados como cêntimos inteiros. A migração está em `supabase/migrations/202611120001_init.sql`.
- **Autenticação:** Supabase Auth. Não há registo público na interface; uma Edge Function só prepara o primeiro acesso após encontrar convite. O utilizador recebe OTP por email, valida-o e define a password. O login normal usa email/password e existe recuperação de password.
- **Arranque do primeiro manager:** uma tabela sem acesso pelo browser contém um convite inicial de uso único, inserido pelo responsável no SQL Editor. Depois do primeiro OTP, esse utilizador pode criar a primeira viagem.
- **Convites:** a associação pendente é criada ao convidar qualquer endereço de email. Resend envia a notificação do convite; Supabase SMTP envia o OTP de acesso.
- **Autorização e privacidade:** RLS está ativado em todas as tabelas expostas. RPCs verificam o manager da viagem. Participantes recebem apenas a sua parte e os seus movimentos; o valor total da despesa é devolvido apenas ao manager. Os anexos usam bucket privado e links temporários sujeitos a autorização.
- **Anexos:** PDFs, JPG e PNG, até 10 MB por ficheiro, em armazenamento privado Supabase Storage.
- **Histórico financeiro:** cada abatimento confirmado fica como movimento imutável com valor e data efetivos. O saldo não é editável diretamente.
- **Moeda:** EUR.
- **Integração com budget mensal:** não foi especificada uma integração com outro sistema. Por omissão, o MVP regista os abatimentos confirmados pelo manager e apresenta o saldo, sem efetuar débitos automáticos num sistema externo.

## Alojamento gratuito: limitações a validar

Uma opção gratuita pode servir para protótipo ou piloto, mas não se deve assumir que oferece disponibilidade, backups ou envio de email adequados para uso continuado. A escolha deve cobrir aplicação, base de dados persistente, autenticação por email, armazenamento privado de anexos, exportação/backup e termos que permitam o uso pretendido.

- O plano gratuito do Supabase indica limites de base de dados e armazenamento, pausa projetos sem atividade durante uma semana e o email padrão de autenticação só envia para membros da equipa do projeto, com um limite documentado de duas mensagens por hora. Para convidar utilizadores externos é necessário configurar um serviço SMTP próprio. [Planos Supabase](https://supabase.com/pricing) · [SMTP de autenticação Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
- Git/GitHub pode guardar o código e automatizar publicações, mas GitHub Pages só publica ficheiros estáticos; não fornece o backend, autenticação, base de dados ou armazenamento de anexos necessários. Além disso, GitHub Pages não se destina a alojar SaaS comercial nem a tratar transações sensíveis como passwords. [GitHub Pages: criação e limites](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) · [Limites de uso do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- O Render documenta que os serviços web gratuitos adormecem após inatividade e que as bases de dados Postgres gratuitas expiram ao fim de 30 dias; não é adequado usar essa base como armazenamento persistente de dados reais. [Limitações do plano gratuito Render](https://render.com/docs/free)
- O plano Hobby da Vercel é limitado a utilização pessoal ou não comercial nos seus termos; não o assumir como opção para uma ferramenta de uso empresarial. [Termos da Vercel](https://vercel.com/legal/terms)

**Orientação:** o frontend e as Edge Functions ainda não estão publicados e o projeto Supabase ainda não foi ligado. A opção de alojamento do frontend permanece por escolher. Antes de guardar dados reais, aplicar e validar a migração, configurar email e confirmar persistência, backups e termos do alojamento.

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
- Conta pendente não pode consultar viagens nem dados até completar a ativação por OTP.
- O manager pode convidar participantes pendentes para uma repartição; o acesso só é ativado depois da validação do email.

## Configuração e decisões ainda em aberto

1. Criar projeto Supabase, aplicar a migração e inserir o email do primeiro manager em `bootstrap_invites`.
2. Configurar SMTP para OTP e Resend para emails de convite, com remetente/domínio validado.
3. Publicar frontend e Edge Functions, e definir `APP_URL`.
4. Confirmar backups e responsável operacional antes de usar dados reais.
5. Definir validade, reenvio e cancelamento de convites.
6. Confirmar campos adicionais de viagem, se necessários além do nome e datas.

## Critérios de aceitação técnica

- Convite para qualquer domínio envia OTP apenas ao endereço convidado; conta pendente fica inacessível até à ativação.
- Um utilizador ativo pode criar uma viagem e gerir essa viagem sem ganhar acesso de manager às restantes.
- Políticas RLS e RPCs impedem um participante de consultar partes, planos, abatimentos ou anexos de outra pessoa.
- O participante consulta, em cada viagem, as tranches previstas e o histórico de abatimentos confirmados.
- Divisão igual e personalizada preserva o total da despesa ao cêntimo.
- Plano previsto, histórico de abatimentos efetivos, datas e saldo são apresentados separadamente; o plano futuro é recalculado após abatimentos parciais ou variáveis.
- Dados e anexos persistem a reinícios e novas publicações da aplicação.

