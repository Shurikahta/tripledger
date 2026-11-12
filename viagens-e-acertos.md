# Viagens e acertos de despesas

## Objetivo

Registar viagens pagas pela empresa cujas despesas são repartidas pelos participantes e acompanhadas através de abatimentos aos respetivos budgets mensais. Cada participante consulta apenas os seus próprios valores; o manager gere a viagem e acompanha os acertos.

## Fluxo principal

1. O manager cria uma viagem e associa os participantes.
2. O manager regista as despesas da viagem.
3. Cada despesa é repartida pelos participantes, por partes iguais por omissão. O manager pode personalizar os valores atribuídos a cada pessoa.
4. Para cada participante, o manager define um plano de acerto: abatimento direto ao saldo ou em tranches mensais.
5. O manager confirma e regista os abatimentos realizados. O participante acompanha o histórico, o saldo em dívida e os pagamentos ainda previstos.

## Dados e regras

### Viagem

- Qualquer utilizador com conta ativa pode criar uma viagem e torna-se manager dessa viagem.
- O manager gere apenas as viagens que criou ou para as quais foi nomeado.
- Os participantes são associados por convite de email.
- Agrupa as despesas e os acertos correspondentes.

### Despesa

- **Descritivo:** identificação ou explicação da despesa.
- **Valor:** montante total da despesa.
- **Anexo:** opcional; o manager pode assinalar que é solicitado ou necessário.
- **Repartição:** todas as despesas são repartidas pelos participantes. A divisão igual é o padrão; o manager pode personalizar a parte atribuída a cada participante.

### Plano de pagamento e abatimentos

O plano de cada participante pode prever um abatimento direto ou várias tranches mensais. O manager define o valor e a data de cada tranche; por exemplo, 100 € no dia 31 de cada mês até ao pagamento total. O plano mostra os valores e datas previstos, incluindo o prazo final estimado.

O abatimento efetivo é registado separadamente pelo manager, que confirma o valor e a data reais. Esse valor pode ser diferente do previsto em determinado mês (por exemplo, inferior ou superior); o saldo em dívida é atualizado com base nos abatimentos efetivamente registados.

A aplicação deve distinguir claramente:

- **Valor atribuído:** parte das despesas da viagem imputada ao participante.
- **Valor previsto:** montantes e datas definidos no plano, ainda não confirmados como abatidos.
- **Valor abatido:** movimento confirmado pelo manager, com valor e data efetivos.
- **Saldo por pagar:** valor atribuído menos os abatimentos registados.

O histórico mantém os abatimentos realizados e permite consultar o que já foi pago, quando foi pago, o que falta pagar e até quando está previsto o acerto. Na primeira versão, cada abatimento é confirmado e registado pelo manager.

## Acessos e autenticação

- O acesso é feito por convite de email; não há registo público aberto.
- Ao convidar um email para uma viagem, é criada uma conta em estado pendente.
- O utilizador inicia o primeiro acesso com um código OTP enviado para o email convidado.
- Após validar o OTP, define a sua própria password; o número de contribuinte não é usado como password.
- Nos acessos seguintes, inicia sessão com email e password, podendo recorrer à recuperação de password se necessário.
- O participante vê as viagens a que está associado e apenas as suas despesas atribuídas, planos, abatimentos e saldos.
- Um participante não pode consultar os valores ou planos de pagamento dos outros participantes.
- O manager pode criar e gerir viagens, participantes, despesas, repartições e planos, e registar abatimentos.

## Alojamento

- Preferência inicial: considerar alojamento gratuito. Avaliar as quotas e capacidades necessárias para a aplicação, base de dados, envio de OTP por email e armazenamento de anexos.

## Possibilidades a considerar

Estas ideias são opções futuras e não requisitos definidos para a primeira versão:

- Pedir ao participante que confirme as despesas que lhe foram atribuídas e permitir sinalizar divergências.
- Acrescentar notas às despesas e aos acertos.
- Pedir comprovativos para despesas específicas.
- Criar alertas para limites de despesa ou abatimentos que tenham impacto elevado no budget mensal.
- Mostrar uma previsão do saldo mensal após cada tranche.
- Manter um histórico de alterações às despesas, repartições e planos.
- Definir como tratar cancelamentos de viagem, despesas corrigidas ou reembolsos da empresa.





