import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, CreditCard, FileText, Landmark, LogOut, Mail, Plus, ReceiptText, Search,
  ShieldCheck, Upload, Users, WalletCards, X,
} from 'lucide-react'
import { dateLabel, eurosToCents, isConfigured, money, supabase } from './lib/supabase'

type Trip = { id: string; name: string; start_date: string | null; end_date: string | null; created_by: string }
type Member = { id: string; trip_id: string; email: string; role: 'manager' | 'participant'; status: 'pending' | 'active' | 'revoked'; user_id: string | null }
type Expense = { id: string; trip_id: string; description: string; amount_cents: number | null; own_share_cents: number; attachment_path: string | null; attachment_required: boolean; created_at: string }
type Share = { id: string; expense_id: string; trip_member_id: string; amount_cents: number }
type Schedule = { id: string; trip_member_id: string; due_date: string; planned_cents: number }
type PlanRow = { due_date: string; planned_cents: number }
type Repayment = { id: string; trip_member_id: string; paid_at: string; amount_cents: number; note: string | null }
type UserProfile = { password_set_at: string | null; display_name: string | null }

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro. Tente novamente.'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [view, setView] = useState<'home' | 'trip'>('home')
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'trip' | 'invite' | 'expense' | 'plan' | 'repayment' | 'users' | 'profile' | null>(null)
  const [search, setSearch] = useState('')
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (!nextSession) { setProfile(null); setTrips([]); setSelectedTrip(null); setView('home') }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) { setAuthLoading(false); return }
    let alive = true
    void supabase.from('profiles').select('password_set_at, display_name').eq('id', session.user.id).maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!alive) return
        if (queryError) setError(queryError.message)
        setProfile(data)
        setAuthLoading(false)
      })
    return () => { alive = false }
  }, [session])

  useEffect(() => { if (session && profile?.password_set_at) void loadTrips() }, [session, profile?.password_set_at])

  async function loadTrips() {
    if (!supabase) return
    setLoading(true)
    const { data, error: queryError } = await supabase.from('trips').select('id,name,start_date,end_date,created_by').order('created_at', { ascending: false })
    if (queryError) setError(queryError.message)
    const nextTrips = (data ?? []) as Trip[]
    setTrips(nextTrips)
    if (nextTrips.length) {
      const tripIds = nextTrips.map((trip) => trip.id)
      const [memberResult, expenseResult] = await Promise.all([
        supabase.from('trip_members').select('id,trip_id,email,role,status,user_id').in('trip_id', tripIds),
        Promise.all(tripIds.map((tripId) => supabase!.rpc('list_trip_expenses', { p_trip_id: tripId }))).then((results) => ({ data: results.flatMap((result) => result.data ?? []), error: results.find((result) => result.error)?.error ?? null })),
      ])
      if (memberResult.error) setError(memberResult.error.message)
      if (expenseResult.error) setError(expenseResult.error.message)
      const nextMembers = (memberResult.data ?? []) as Member[]
      const nextExpenses = (expenseResult.data ?? []) as Expense[]
      setMembers(nextMembers)
      setExpenses(nextExpenses)
      if (nextMembers.length) {
        const memberIds = nextMembers.map((member) => member.id)
        const [shareResult, scheduleResult, repaymentResult] = await Promise.all([
          supabase.from('expense_shares').select('id,expense_id,trip_member_id,amount_cents').in('trip_member_id', memberIds),
          supabase.from('payment_schedule').select('id,trip_member_id,due_date,planned_cents').in('trip_member_id', memberIds),
          supabase.from('repayments').select('id,trip_member_id,paid_at,amount_cents,note').in('trip_member_id', memberIds),
        ])
        if (shareResult.error) setError(shareResult.error.message)
        if (scheduleResult.error) setError(scheduleResult.error.message)
        if (repaymentResult.error) setError(repaymentResult.error.message)
        setShares((shareResult.data ?? []) as Share[])
        setSchedules((scheduleResult.data ?? []) as Schedule[])
        setRepayments((repaymentResult.data ?? []) as Repayment[])
      } else { setShares([]); setSchedules([]); setRepayments([]) }
    } else { setMembers([]); setExpenses([]); setShares([]); setSchedules([]); setRepayments([]) }
    setLoading(false)
  }

  async function signOut() {
    await supabase?.auth.signOut()
    setModal(null)
  }

  async function openTrip(tripId: string) {
    if (!supabase) return
    setError('')
    setLoading(true)
    setExpandedPerson(null)
    setSelectedTrip(tripId)
    setView('trip')
    const [memberResult, expenseResult] = await Promise.all([
      supabase.from('trip_members').select('id,trip_id,email,role,status,user_id').eq('trip_id', tripId).order('created_at'),
      supabase.rpc('list_trip_expenses', { p_trip_id: tripId }),
    ])
    if (memberResult.error) setError(memberResult.error.message)
    if (expenseResult.error) setError(expenseResult.error.message)
    const nextMembers = (memberResult.data ?? []) as Member[]
    const nextExpenses = (expenseResult.data ?? []) as Expense[]
    setMembers(nextMembers)
    setExpenses(nextExpenses)
    if (nextExpenses.length) {
      const [shareResult, scheduleResult, repaymentResult] = await Promise.all([
        supabase.from('expense_shares').select('id,expense_id,trip_member_id,amount_cents').in('expense_id', nextExpenses.map((item) => item.id)),
        supabase.from('payment_schedule').select('id,trip_member_id,due_date,planned_cents').in('trip_member_id', nextMembers.map((item) => item.id)),
        supabase.from('repayments').select('id,trip_member_id,paid_at,amount_cents,note').in('trip_member_id', nextMembers.map((item) => item.id)),
      ])
      if (shareResult.error) setError(shareResult.error.message)
      if (scheduleResult.error) setError(scheduleResult.error.message)
      if (repaymentResult.error) setError(repaymentResult.error.message)
      setShares((shareResult.data ?? []) as Share[])
      setSchedules((scheduleResult.data ?? []) as Schedule[])
      setRepayments((repaymentResult.data ?? []) as Repayment[])
    } else { setShares([]); setSchedules([]); setRepayments([]) }
    setLoading(false)
  }

  async function resendInvite(memberId: string) {
    if (!supabase) return
    const { error: inviteError } = await supabase.functions.invoke('send-trip-invite', { body: { member_id: memberId } })
    if (inviteError) setError(inviteError.message || 'Não foi possível reenviar o convite.')
    else setNotice('Convite reenviado por email.')
  }

  async function recordRepayment(memberId: string, cents: number, paidAt: string, note: string) {
    if (!supabase) return
    const assigned = shares.filter((share) => share.trip_member_id === memberId).reduce((sum, share) => sum + share.amount_cents, 0)
    const alreadyPaid = repayments.filter((item) => item.trip_member_id === memberId).reduce((sum, item) => sum + item.amount_cents, 0)
    const balance = assigned - alreadyPaid
    if (cents > balance) throw new Error(`O abatimento excede o saldo por pagar (${money(Math.max(0, balance))}).`)
    const { error: insertError } = await supabase.rpc('record_trip_repayment', { p_member_id: memberId, p_amount_cents: cents, p_paid_at: paidAt, p_note: note || null })
    if (insertError) throw insertError

    let planAdjusted = true
    const currentPlan = schedules.filter((item) => item.trip_member_id === memberId).sort((a, b) => a.due_date.localeCompare(b.due_date))
    if (currentPlan.length) {
      const rows = adjustScheduleAfterPayment(Math.max(0, balance - cents), currentPlan, paidAt)
      const { error: scheduleError } = await supabase.rpc('replace_payment_schedule', { p_member_id: memberId, p_rows: rows })
      if (scheduleError) planAdjusted = false
    }
    await openTrip(selectedTrip!)
    setNotice(planAdjusted ? 'Abatimento confirmado. O saldo e as tranches futuras foram atualizados.' : 'Abatimento confirmado, mas o plano futuro não foi atualizado. Revê o plano desta pessoa.')
    if (!planAdjusted) setError('O abatimento ficou registado; o manager deve rever as próximas tranches.')
  }

  const currentTrip = trips.find((trip) => trip.id === selectedTrip) ?? null
  const isManager = members.some((member) => member.user_id === session?.user.id && member.role === 'manager' && member.status === 'active')
  const currentUserMember = members.find((member) => member.user_id === session?.user.id)
  const ownMemberIds = members.filter((member) => member.user_id === session?.user.id).map((member) => member.id)
  const ownAssigned = shares.filter((share) => ownMemberIds.includes(share.trip_member_id)).reduce((sum, share) => sum + share.amount_cents, 0)
  const ownPaid = repayments.filter((payment) => ownMemberIds.includes(payment.trip_member_id)).reduce((sum, payment) => sum + payment.amount_cents, 0)
  const currentAssigned = shares.filter((share) => share.trip_member_id === currentUserMember?.id).reduce((sum, share) => sum + share.amount_cents, 0)
  const currentPaid = repayments.filter((payment) => payment.trip_member_id === currentUserMember?.id).reduce((sum, payment) => sum + payment.amount_cents, 0)
  const currentSchedule = schedules.filter((item) => item.trip_member_id === currentUserMember?.id)
  const currentPlanNeedsReview = currentSchedule.length > 0 && currentSchedule.reduce((sum, item) => sum + item.planned_cents, 0) !== Math.max(0, currentAssigned - currentPaid)
  const profileName = (profile?.display_name ?? '').trim() || session?.user?.email?.split('@')[0] || 'Utilizador'
  const filteredTrips = useMemo(() => trips.filter((trip) => trip.name.toLowerCase().includes(search.toLowerCase())), [trips, search])
  const totalAmount = expenses.reduce((sum, expense) => sum + (expense.amount_cents ?? 0), 0)
  const isAdminUser = Boolean(import.meta.env.VITE_ADMIN_EMAIL) && session?.user.email?.trim().toLowerCase() === import.meta.env.VITE_ADMIN_EMAIL.trim().toLowerCase()

  if (!isConfigured) return <SetupScreen />
  if (authLoading) return <div className="loading-screen"><div className="brand-mark">t</div><p>A preparar o teu espaço...</p></div>
  if (!session) return <AuthScreen onError={setError} error={error} />
  if (recoveryMode) return <SetPasswordScreen onDone={() => setRecoveryMode(false)} error={error} onError={setError} />
  if (!profile?.password_set_at) return <SetPasswordScreen onDone={() => { setError(''); void supabase?.from('profiles').update({ password_set_at: new Date().toISOString() }).eq('id', session.user.id).then(({ error: e }) => { if (e) setError(e.message); else setProfile({ password_set_at: new Date().toISOString(), display_name: profile?.display_name ?? null }) }) }} error={error} onError={setError} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => { setView('home'); setSelectedTrip(null) }}><span className="brand-mark">t</span><span>tripledger<span className="brand-dot">.</span></span></button>
        <div className="side-label">MENU</div>
        <button className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => { setView('home'); setSelectedTrip(null) }}><Landmark size={18} /> Painel geral</button>
        <div className="side-label nav-spacer">AS TUAS VIAGENS <span>{trips.length}</span></div>
        <div className="trip-nav-list">
          {trips.slice(0, 6).map((trip) => <button key={trip.id} className={`nav-trip ${selectedTrip === trip.id ? 'selected' : ''}`} onClick={() => void openTrip(trip.id)}><span className="trip-emoji">✳</span><span className="truncate">{trip.name}</span></button>)}
          {trips.length === 0 && <div className="empty-nav">As tuas viagens aparecem aqui.</div>}
        </div>
        <button className="new-trip-side" onClick={() => setModal('trip')}><Plus size={16} /> Criar viagem</button>
        {isAdminUser && <button className="new-trip-side secondary" onClick={() => setModal('users')}><Users size={16} /> Gerir utilizadores</button>}
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Precisas de ajuda?</strong><span>Fala com o manager da tua viagem.</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Tripledger</span><span className="crumb-slash">/</span><strong>{view === 'home' ? 'Painel geral' : currentTrip?.name ?? 'Viagem'}</strong></div><div className="topbar-actions"><span className="secure-label"><ShieldCheck size={15} /> Espaço privado</span><button className="avatar small" type="button" onClick={() => setModal('profile')}>{profileName.slice(0, 1).toUpperCase()}</button></div></header>
        {error && <div className="toast error-toast"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="toast success-toast"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={16} /></button></div>}

        {view === 'home' ? (
          <section className="page-content">
            <div className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</div><h1>Olá, {profileName} <span className="wave">✳</span></h1><p className="subhead">Aqui está o resumo das tuas viagens e acertos.</p></div><button className="button primary" onClick={() => setModal('trip')}><Plus size={17} /> Nova viagem</button></div>
            <div className="metric-grid">
              <Metric icon={<ReceiptText size={18} />} label="Viagens ativas" value={String(trips.length)} tone="mint" detail="Acompanha os teus acertos" />
              <Metric icon={<WalletCards size={18} />} label="Total atribuído" value={money(ownAssigned)} tone="peach" detail="Nas tuas viagens" />
              <Metric icon={<CreditCard size={18} />} label="Já abatido" value={money(ownPaid)} tone="blue" detail="Registado pelo manager" />
              <Metric icon={<Clock3 size={18} />} label="Por regularizar" value={money(Math.max(0, ownAssigned - ownPaid))} tone="lavender" detail="Saldo em aberto" />
            </div>
            <div className="section-heading"><div><h2>As tuas viagens</h2><p>Viagens onde estás associado como participante ou manager.</p></div><button className="text-button" onClick={() => setModal('trip')}>Criar viagem <ArrowUpRight size={15} /></button></div>
            <div className="toolbar"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar viagens..." /></label><button className="filter-button">Todas as viagens <ChevronDown size={15} /></button></div>
            {loading ? <LoadingRows /> : filteredTrips.length ? <div className="trip-grid">{filteredTrips.map((trip, i) => <TripCard key={trip.id} trip={trip} index={i} members={members} expenses={expenses} onOpen={() => void openTrip(trip.id)} />)}</div> : <EmptyState title="Ainda não tens viagens" text="Cria uma viagem ou pede ao manager para te convidar." action={<button className="button primary" onClick={() => setModal('trip')}><Plus size={16} /> Criar viagem</button>} />}
          </section>
        ) : currentTrip ? (
          <section className="page-content">
            <button className="back-link" onClick={() => { setView('home'); setSelectedTrip(null) }}><ArrowLeft size={15} /> Todas as viagens</button>
            <div className="trip-hero"><div className="trip-hero-main"><div className="trip-cover-icon">✳</div><div><div className="eyebrow">VIAGEM · {currentTrip.start_date ? dateLabel(currentTrip.start_date).toUpperCase() : 'SEM DATA'}</div><h1>{currentTrip.name}</h1><p className="subhead">{members.filter((member) => member.status === 'active').length} participantes <span className="bullet">·</span> {expenses.length} despesas registadas</p></div></div><div className="trip-hero-actions">{isManager && <><button className="button secondary" onClick={() => setModal('invite')}><Users size={16} /> Convidar</button><button className="button primary" onClick={() => setModal('expense')}><Plus size={16} /> Adicionar despesa</button><button className="button secondary" onClick={() => setModal('repayment')}><ArrowDownLeft size={15}/> Registar abatimento</button></>}</div></div>
            <div className="trip-metrics"><div><span>{isManager ? 'Total das despesas' : 'A tua parte atribuída'}</span><strong>{money(isManager ? totalAmount : expenses.reduce((sum, expense) => sum + Number(expense.own_share_cents ?? 0), 0))}</strong></div><div><span>Participantes</span><strong>{members.filter((m) => m.status !== 'revoked').length}<small> pessoas</small></strong></div><div><span>Despesas registadas</span><strong>{expenses.length}<small> registos</small></strong></div><div><span>O teu saldo por pagar</span><strong className="accent-value">{money(Math.max(0, (shares.filter((share) => share.trip_member_id === currentUserMember?.id).reduce((sum, share) => sum + share.amount_cents, 0) - repayments.filter((r) => r.trip_member_id === currentUserMember?.id).reduce((sum, r) => sum + r.amount_cents, 0))))}</strong></div></div>
            <div className="detail-layout"><div className="primary-column"><div className="panel"><div className="panel-heading"><div><h2>Despesas da viagem</h2><p>As despesas são repartidas entre os participantes.</p></div><span className="count-pill">{expenses.length}</span></div>{loading ? <LoadingRows /> : expenses.length ? <div className="expense-list">{expenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} />)}</div> : <EmptyState title="Sem despesas por agora" text={isManager ? 'Adiciona a primeira despesa para a viagem.' : 'O manager ainda não adicionou despesas.'} action={isManager ? <button className="text-button" onClick={() => setModal('expense')}><Plus size={15} /> Adicionar despesa</button> : null} />}</div>
                <div className="panel"><div className="panel-heading"><div><h2>Participantes</h2><p>{isManager ? 'Valores por participante e estado dos acertos.' : 'Apenas os teus valores e acertos são apresentados.'}</p></div><span className="count-pill">{members.filter((member) => member.status !== 'revoked').length}</span></div><div className="member-list">{members.filter((member) => member.status !== 'revoked').map((member) => { const memberShares = shares.filter((share) => share.trip_member_id === member.id); const assigned = memberShares.reduce((sum, share) => sum + share.amount_cents, 0); const memberRepayments = repayments.filter((repayment) => repayment.trip_member_id === member.id); const paid = memberRepayments.reduce((sum, repayment) => sum + repayment.amount_cents, 0); const memberSchedule = schedules.filter((schedule) => schedule.trip_member_id === member.id).sort((a,b) => b.due_date.localeCompare(a.due_date)); const planNeedsReview = memberSchedule.length > 0 && memberSchedule.reduce((sum, item) => sum + item.planned_cents, 0) !== Math.max(0, assigned - paid); return <div key={member.id} className="member-row"><div className="avatar member-avatar">{member.email.slice(0,1).toUpperCase()}</div><div className="member-info"><strong>{member.email === session.user.email ? 'Tu' : member.email}</strong><span>{member.status === 'pending' ? 'Convite pendente' : member.role === 'manager' ? 'Manager da viagem' : 'Participante'}</span>{isManager && <span className="member-finance">Atribuído {money(assigned)} · Abatido {money(paid)} · Em dívida {money(Math.max(0, assigned - paid))}{memberSchedule.length ? ` · Até ${dateLabel(memberSchedule[0].due_date)}` : ''}{planNeedsReview ? ' · Plano por rever' : ''}</span>}</div><span className={`status-pill ${member.status}`}>{member.status === 'pending' ? 'Pendente' : 'Ativo'}</span>{isManager && <>{member.status === 'pending' && <button className="icon-button" title="Reenviar convite" onClick={() => void resendInvite(member.id)}><Mail size={15}/></button>}<button className="icon-button" title="Plano de pagamento" onClick={() => { setExpandedPerson(member.id); setModal('plan') }}><CalendarDays size={16} /></button><button className="icon-button" title="Registar abatimento" onClick={() => { setExpandedPerson(member.id); setModal('repayment') }}><ArrowDownLeft size={16}/></button></>}</div>})}</div></div>
                <div className="panel note-panel"><div className="note-icon"><ShieldCheck size={18}/></div><div><strong>Os teus dados são privados</strong><p>Só tu e o manager desta viagem podem consultar os teus valores.</p></div></div></div></div>
            <div className="panel"><div className="panel-heading"><div><h2>O teu plano e histórico</h2><p>Tranches previstas e abatimentos confirmados para esta viagem.</p></div>{currentPlanNeedsReview && <span className="status-pill pending">Plano por rever</span>}</div><div className="personal-ledger"><div><strong>Tranches previstas</strong>{currentSchedule.length ? currentSchedule.slice().sort((a,b) => a.due_date.localeCompare(b.due_date)).map((item) => <div className="ledger-row" key={item.id}><span>{dateLabel(item.due_date)}</span><strong>{money(item.planned_cents)}</strong></div>) : <p className="muted">Ainda não foi definido um plano de pagamento.</p>}</div><div><strong>Abatimentos registados</strong>{repayments.filter((item) => item.trip_member_id === currentUserMember?.id).length ? repayments.filter((item) => item.trip_member_id === currentUserMember?.id).slice().sort((a,b) => b.paid_at.localeCompare(a.paid_at)).map((item) => <div className="ledger-row" key={item.id}><span>{dateLabel(item.paid_at)}{item.note ? ` · ${item.note}` : ''}</span><strong>{money(item.amount_cents)}</strong></div>) : <p className="muted">Ainda não há abatimentos registados.</p>}</div></div></div>
          </section>
        ) : <LoadingRows />}
      </main>

      {modal === 'profile' && (
        <Modal title={modalTitle('profile')} onClose={() => setModal(null)}>
          <ProfileNameForm currentName={profileName} onCancel={() => setModal(null)} onLogout={() => void signOut()} onSave={async (name) => { if (!supabase) return; const nextName = name.trim(); const { error: e } = await supabase.from('profiles').update({ display_name: nextName || null }).eq('id', session.user.id); if (e) throw e; setProfile((current) => ({ ...(current ?? { password_set_at: null, display_name: null }), display_name: nextName || null })); setModal(null); setNotice('Nome de utilizador atualizado.'); }} />
        </Modal>
      )}
      {modal && modal !== 'profile' && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>{modal === 'trip' ? <TripForm onCancel={() => setModal(null)} onSave={async (name, start, end) => { if (!supabase) return; const { error: e } = await supabase.from('trips').insert({ name, start_date: start || null, end_date: end || null, created_by: session.user.id }); if (e) throw e; await loadTrips(); setModal(null); setNotice('Viagem criada. Já és manager desta viagem.'); }} /> : modal === 'invite' ? <InviteForm tripId={selectedTrip!} onCancel={() => setModal(null)} onSave={async (email) => { if (!supabase) return; const { data, error: e } = await supabase.from('trip_members').insert({ trip_id: selectedTrip, email, role: 'participant', status: 'pending', invited_by: session.user.id }).select('id').single(); if (e) throw e; const { error: inviteError } = await supabase.functions.invoke('send-trip-invite', { body: { member_id: data.id } }); await openTrip(selectedTrip!); setModal(null); setNotice(inviteError ? 'Convite guardado. O envio de email ainda não está configurado.' : 'Convite enviado por email.'); }} /> : modal === 'users' ? <UserManagementForm onCancel={() => setModal(null)} onCreate={async (email, password) => { if (!supabase) return; const { error: createError } = await supabase.functions.invoke('create-managed-user', { body: { email, password } }); if (createError) throw createError; setModal(null); setNotice('Conta criada. Entrega a password ao utilizador e pede que a altere no primeiro acesso.'); }} /> : modal === 'expense' ? <ExpenseForm members={members.filter((m) => m.status !== 'revoked')} onCancel={() => setModal(null)} onSave={async (description, cents, allocations, required, file) => { if (!supabase) return; const sharesPayload = allocations.map((item) => ({ trip_member_id: item.member, amount_cents: item.cents })); if (file && (file.size > 10485760 || !['application/pdf','image/jpeg','image/png'].includes(file.type))) throw new Error('O anexo deve ser PDF, JPG ou PNG até 10 MB.'); const expenseId = crypto.randomUUID(); let attachmentPath: string | null = null; if (file) { attachmentPath = `${selectedTrip}/${expenseId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const { error: uploadError } = await supabase.storage.from('expense-attachments').upload(attachmentPath, file, { upsert: false }); if (uploadError) throw uploadError }; const { error: e } = await supabase.rpc('create_expense_with_shares', { p_expense_id: expenseId, p_trip_id: selectedTrip, p_description: description, p_amount_cents: cents, p_attachment_required: required, p_attachment_path: attachmentPath, p_shares: sharesPayload }); if (e) { if (attachmentPath) await supabase.storage.from('expense-attachments').remove([attachmentPath]); throw e }; await openTrip(selectedTrip!); setModal(null); setNotice('Despesa e repartição registadas.'); }} /> : modal === 'plan' ? <PlanForm members={members.filter((m) => m.status !== 'revoked')} selected={expandedPerson} shares={shares} schedules={schedules} repayments={repayments} onCancel={() => setModal(null)} onSave={async (memberId, planRows) => { if (!supabase) return; const { error: planError } = await supabase.rpc('replace_payment_schedule', { p_member_id: memberId, p_rows: planRows }); if (planError) throw planError; await openTrip(selectedTrip!); setModal(null); setNotice('Plano de pagamento atualizado.'); }} /> : <RepaymentForm members={members.filter((m) => m.status !== 'revoked')} selected={expandedPerson ?? currentUserMember?.id ?? null} isManager={isManager} onCancel={() => setModal(null)} onSave={recordRepayment} />}</Modal>}
    </div>
  )
}

function modalTitle(type: string) { return ({ trip: 'Criar viagem', invite: 'Convidar participante', expense: 'Adicionar despesa', plan: 'Plano de pagamento', repayment: 'Registar abatimento', users: 'Gerir utilizadores', profile: 'Editar nome do utilizador' } as Record<string,string>)[type] }

function SetupScreen() {
  return <div className="setup-screen"><div className="setup-card"><span className="brand-mark">t</span><p className="eyebrow">TRIPLEDGER · MVP</p><h1>Vamos ligar a tua base de dados.</h1><p>Cria um projeto Supabase, configura a base de dados e adiciona as credenciais ao ficheiro <code>.env.local</code>.</p><div className="setup-steps"><span><b>1</b> Cria um projeto na Supabase</span><span><b>2</b> Executa as migrações em <code>supabase/migrations/</code></span><span><b>3</b> Copia <code>.env.example</code> para <code>.env.local</code> e preenche os valores</span></div><a className="button primary" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Abrir Supabase <ArrowUpRight size={16}/></a></div></div>
}

function AuthScreen({ error, onError }: { error: string; onError: (value: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')

  async function login(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    onError('')
    setInfo('')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (loginError) onError('Email ou password inválidos.')
    setBusy(false)
  }
  return <div className="auth-screen"><div className="auth-story"><div className="brand light"><span className="brand-mark">t</span><span>tripledger<span className="brand-dot">.</span></span></div><div className="story-copy"><p className="eyebrow">VIAGENS, SEM SURPRESAS</p><h1>Despesas partilhadas.<br/><em>Acertos claros.</em></h1><p>Acompanha cada viagem, cada despesa e cada acerto — tudo num só lugar.</p></div><div className="story-footer"><ShieldCheck size={16}/> Os teus valores são privados e só tu os podes consultar.</div><div className="story-shape shape-one"/><div className="story-shape shape-two"/></div><div className="auth-form-side"><div className="auth-form-wrap"><span className="form-kicker">BEM-VINDO DE VOLTA</span><h2>Iniciar sessão</h2><p>Entra com as tuas credenciais diretas.</p>{error && <div className="inline-error">{error}</div>}{info && <div className="inline-info">{info}</div>}<form onSubmit={(e) => void login(e)} className="form-stack"><label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@exemplo.com"/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="A tua password"/></label><button className="button primary full-button" disabled={busy}>{busy ? 'A entrar...' : 'Entrar'} <ArrowUpRight size={16}/></button></form></div></div></div>
}

function SetPasswordScreen({ onDone, error, onError }: { onDone: () => void; error: string; onError: (value: string) => void }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); if (!supabase) return; if (password !== confirm) { onError('As passwords não coincidem.'); return }; if (password.length < 10) { onError('Escolhe uma password com pelo menos 10 caracteres.'); return }; setBusy(true); onError(''); const { error: updateError } = await supabase.auth.updateUser({ password }); if (updateError) onError(updateError.message); else onDone(); setBusy(false) }
  return <div className="setup-screen"><div className="setup-card"><span className="brand-mark">t</span><p className="eyebrow">PRIMEIRO ACESSO</p><h1>Define a tua password.</h1><p>A tua conta foi criada pelo administrador. Define uma password pessoal para os próximos acessos.</p>{error && <div className="inline-error">{error}</div>}<form className="form-stack" onSubmit={(e) => void submit(e)}><label>Nova password<input type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)}/></label><label>Confirmar password<input type="password" minLength={10} required value={confirm} onChange={(e) => setConfirm(e.target.value)}/></label><button className="button primary full-button" disabled={busy}>{busy ? 'A guardar...' : 'Guardar password'} <Check size={16}/></button></form></div></div>
}

function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div> }

function TripCard({ trip, index, members, expenses, onOpen }: { trip: Trip; index: number; members: Member[]; expenses: Expense[]; onOpen: () => void }) {
  const palettes = ['cover-mint', 'cover-peach', 'cover-lilac', 'cover-blue']; const count = members.filter((m) => m.trip_id === trip.id && m.status === 'active').length; const tripExpenses = expenses.filter((e) => e.trip_id === trip.id); const total = tripExpenses.reduce((sum, e) => sum + (e.amount_cents ?? 0), 0); const managerView = tripExpenses.every((expense) => expense.amount_cents !== null)
  return <button className="trip-card" onClick={onOpen}><div className={`trip-cover ${palettes[index % palettes.length]}`}><div className="cover-orb"/><div className="cover-symbol">✳</div><span className="trip-state">ATIVA</span></div><div className="trip-card-body"><div className="trip-card-top"><div><strong>{trip.name}</strong><span><CalendarDays size={13}/>{trip.start_date ? `${dateLabel(trip.start_date)}${trip.end_date ? ` — ${dateLabel(trip.end_date)}` : ''}` : 'Datas por definir'}</span></div><ArrowUpRight size={17}/></div><div className="trip-card-foot"><div className="avatar-stack">{Array.from({ length: Math.min(count, 4) }, (_, i) => <span className={`avatar-dot a${i}`} key={i}>{['M','A','J','+'][i]}</span>)}<small>{count} pessoas</small></div><strong>{managerView ? money(total) : `${tripExpenses.length} despesas`}</strong></div></div></button>
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  useEffect(() => { if (!supabase || !expense.attachment_path) return; void supabase.storage.from('expense-attachments').createSignedUrl(expense.attachment_path, 300).then(({ data }) => setAttachmentUrl(data?.signedUrl ?? null)) }, [expense.attachment_path])
  return <div className="expense-row"><div className="expense-icon"><ReceiptText size={18}/></div><div className="expense-copy"><strong>{expense.description}</strong><span>{dateLabel(expense.created_at.slice(0,10))}{expense.attachment_path ? attachmentUrl ? <> · <a className="attachment-link" href={attachmentUrl} target="_blank" rel="noreferrer">Ver comprovativo</a></> : ' · A carregar comprovativo...' : expense.attachment_required ? ' · Comprovativo pendente' : ''}</span></div><div className="expense-share"><span>A tua parte</span><strong>{money(Number(expense.own_share_cents ?? 0))}</strong></div>{expense.amount_cents !== null && <div className="expense-total"><span>Total</span><strong>{money(expense.amount_cents)}</strong></div>}</div>
}

function EmptyState({ title, text, action }: { title: string; text: string; action: ReactNode }) { return <div className="empty-state"><div className="empty-illustration"><FileText size={26}/><span>+</span></div><h3>{title}</h3><p>{text}</p>{action}</div> }
function LoadingRows() { return <div className="loading-rows"><span/><span/><span/></div> }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><div className="modal"><div className="modal-header"><div><span className="form-kicker">TRIPLEDGER</span><h2>{title}</h2></div><button className="icon-button close-button" onClick={onClose}><X size={18}/></button></div>{children}</div></div> }

function TripForm({ onCancel, onSave }: { onCancel: () => void; onSave: (name: string, start: string, end: string) => Promise<void> }) { const [name, setName] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onSave(name.trim(), start, end) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } } return <form className="modal-form" onSubmit={(e) => void submit(e)}><p className="modal-hint">Cria um espaço para registar despesas e organizar os acertos do grupo.</p><label>Nome da viagem<input autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fim de semana no Porto"/></label><div className="form-row"><label>Data de início<input type="date" value={start} onChange={(e) => setStart(e.target.value)}/></label><label>Data de fim<input type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)}/></label></div>{error && <div className="inline-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'A criar...' : 'Criar viagem'} <ArrowUpRight size={16}/></button></div></form> }

function InviteForm({ tripId, onCancel, onSave }: { tripId: string; onCancel: () => void; onSave: (email: string) => Promise<void> }) { const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await onSave(email.trim().toLowerCase()) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } } return <form className="modal-form" onSubmit={(e) => void submit(e)}><p className="modal-hint">O convite é enviado por email. O endereço pode ser de qualquer domínio; a conta fica pendente até ao primeiro acesso.</p><input type="hidden" value={tripId}/><label>Email do participante<input autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com"/></label>{error && <div className="inline-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'A enviar...' : 'Enviar convite'} <Mail size={16}/></button></div></form> }

function ProfileNameForm({ currentName, onCancel, onLogout, onSave }: { currentName: string; onCancel: () => void; onLogout: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('O nome não pode ficar vazio.')
      if (trimmed.length > 30) throw new Error('O nome pode ter até 30 caracteres.')
      await onSave(trimmed)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return <form className="modal-form" onSubmit={(e) => void submit(e)}>
    <p className="modal-hint">Escolhe o nome que pretendes ver no teu avatar e nas saudações da aplicação.</p>
    <label>Nome de utilizador<input autoFocus required maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mário" /></label>
    {error && <div className="inline-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onLogout}><LogOut size={16}/> Terminar sessão</button><div><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'A guardar...' : 'Guardar nome'} <Check size={16}/></button></div></div>
  </form>
}

function UserManagementForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generateInternalPassword())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const normalized = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Introduz um email válido.')
      if (password.length < 10) throw new Error('A password deve ter pelo menos 10 caracteres.')
      await onCreate(normalized, password)
      setEmail('')
      setPassword(generateInternalPassword())
      setInfo('Conta criada. Guarda esta password e envia-a ao utilizador.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return <form className="modal-form" onSubmit={(e) => void submit(e)}>
    <p className="modal-hint">Cria contas diretamente com email e password, sem OTP nem confirmação por email. A password pode ser gerada internamente e enviada ao utilizador.</p>
    <label>Email do utilizador<input autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="novo-utilizador@empresa.pt"/></label>
    <div className="form-row">
      <label>Password<input type="text" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha gerada"/></label>
      <button type="button" className="button secondary" onClick={() => setPassword(generateInternalPassword())}>Gerar</button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {info && <div className="inline-info">{info}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'A criar...' : 'Criar utilizador'} <Users size={16}/></button></div>
  </form>
}

type Allocation = { member: string; cents: number }
function ExpenseForm({ members, onCancel, onSave }: { members: Member[]; onCancel: () => void; onSave: (description: string, cents: number, allocations: Allocation[], required: boolean, file: File | null) => Promise<void> }) { const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [required, setRequired] = useState(false); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [custom, setCustom] = useState(false); const [values, setValues] = useState<Record<string,string>>({}); const cents = eurosToCents(amount); const equal = splitEvenly(cents, members.map((m) => m.id)); const allocations = custom ? members.map((m) => ({ member: m.id, cents: eurosToCents(values[m.id] || '') })) : equal; const allocated = allocations.reduce((sum, item) => sum + item.cents, 0); async function submit(e: FormEvent) { e.preventDefault(); if (!members.length) { setError('Adiciona participantes antes de registar despesas.'); return }; if (allocated !== cents) { setError('A soma das partes tem de corresponder ao valor total.'); return }; if (required && !file) { setError('Anexa o comprovativo solicitado para esta despesa.'); return }; setBusy(true); setError(''); try { await onSave(description.trim(), cents, allocations, required, file) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } } return <form className="modal-form" onSubmit={(e) => void submit(e)}><p className="modal-hint">A despesa é repartida por todos os participantes ativos. Podes ajustar as partes manualmente.</p><label>Descritivo<input autoFocus required maxLength={140} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Alojamento — duas noites"/></label><label>Valor total (€)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"/></label><div className="allocation-head"><strong>Repartição</strong><button type="button" className="link-button inline-link" onClick={() => setCustom(!custom)}>{custom ? 'Dividir igualmente' : 'Personalizar valores'}</button></div><div className="allocation-list">{members.map((member) => <label className="allocation-row" key={member.id}><span><span className="avatar mini-avatar">{member.email.slice(0,1).toUpperCase()}</span>{member.email}</span>{custom ? <input aria-label={`Parte de ${member.email}`} type="number" min="0" step="0.01" value={values[member.id] ?? ((equal.find((v) => v.member === member.id)?.cents ?? 0) / 100).toFixed(2)} onChange={(e) => setValues({ ...values, [member.id]: e.target.value })}/> : <strong>{money(equal.find((v) => v.member === member.id)?.cents ?? 0)}</strong>}</label>)}</div><div className="allocation-total"><span>Total repartido</span><strong className={allocated !== cents ? 'invalid-value' : ''}>{money(allocated)} <small>/ {money(cents)}</small></strong></div><div className="upload-field"><label htmlFor="expense-file" className="upload-drop"><Upload size={17}/><span>{file ? file.name : 'Adicionar comprovativo (opcional)'}</span><small>PDF, JPG ou PNG</small></label><input id="expense-file" type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)}/><label className="check-label"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)}/> Este comprovativo é obrigatório</label></div>{error && <div className="inline-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'A guardar...' : 'Registar despesa'} <Check size={16}/></button></div></form> }

function PlanForm({ members, selected, shares, schedules, repayments, onCancel, onSave }: { members: Member[]; selected: string | null; shares: Share[]; schedules: Schedule[]; repayments: Repayment[]; onCancel: () => void; onSave: (member: string, rows: PlanRow[]) => Promise<void> }) {
  const [member, setMember] = useState(selected ?? members[0]?.id ?? '')
  const [amount, setAmount] = useState('100')
  const [start, setStart] = useState(todayISO())
  const [rows, setRows] = useState<PlanRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const assigned = shares.filter((share) => share.trip_member_id === member).reduce((sum, share) => sum + share.amount_cents, 0)
  const paid = repayments.filter((item) => item.trip_member_id === member).reduce((sum, item) => sum + item.amount_cents, 0)
  const balance = Math.max(0, assigned - paid)
  const plannedTotal = rows.reduce((sum, row) => sum + row.planned_cents, 0)
  const validRows = rows.every((row) => Boolean(row.due_date) && row.planned_cents > 0) && new Set(rows.map((row) => row.due_date)).size === rows.length

  useEffect(() => {
    if (!member) return
    const existing = schedules.filter((item) => item.trip_member_id === member).sort((a,b) => a.due_date.localeCompare(b.due_date))
    if (existing.length) {
      setRows(existing.map(({ due_date, planned_cents }) => ({ due_date, planned_cents })))
      setAmount((Math.max(...existing.map((item) => item.planned_cents)) / 100).toFixed(2))
      setStart(existing[0].due_date)
    } else {
      try { setRows(makeSchedule(member, balance, eurosToCents(amount), start).map(({ due_date, planned_cents }) => ({ due_date, planned_cents }))) }
      catch (e) { setRows([]); setError(errorMessage(e)) }
    }
  }, [member])

  function regenerate() {
    try {
      setRows(makeSchedule(member, balance, eurosToCents(amount), start).map(({ due_date, planned_cents }) => ({ due_date, planned_cents })))
      setError('')
    } catch (e) { setError(errorMessage(e)) }
  }
  function updateRow(index: number, patch: Partial<PlanRow>) { setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)) }
  function addRow() { if (rows.length >= 240) return; const nextDate = rows.length ? addOneMonthClamped(rows[rows.length - 1].due_date) : start; setRows((current) => [...current, { due_date: nextDate, planned_cents: 0 }]) }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (plannedTotal !== balance) { setError(`As tranches têm de somar ${money(balance)}.`); return }
    if (!validRows) { setError('Cada tranche precisa de uma data única e um valor superior a zero.'); return }
    setBusy(true); setError('')
    try { await onSave(member, [...rows].sort((a,b) => a.due_date.localeCompare(b.due_date))) }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  return <form className="modal-form" onSubmit={(e) => void submit(e)}>
    <p className="modal-hint">Define um valor mensal e a primeira data; depois podes ajustar individualmente o valor e a data de cada tranche.</p>
    <label>Participante<select required value={member} onChange={(e) => setMember(e.target.value)}>{members.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
    <div className="plan-balance"><span>Saldo por regularizar</span><strong>{money(balance)}</strong></div>
    <div className="form-row"><label>Valor mensal (€)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}/></label><label>Primeira data<input type="date" required value={start} onChange={(e) => setStart(e.target.value)}/></label></div>
    <button type="button" className="link-button regenerate-button" onClick={regenerate}>Gerar tranches mensais <CalendarDays size={14}/></button>
    <div className="plan-rows">{rows.map((row, index) => <div className="plan-row" key={`${row.due_date}-${index}`}><span className="plan-row-index">{index + 1}</span><input aria-label={`Data da tranche ${index + 1}`} type="date" required value={row.due_date} onChange={(e) => updateRow(index, { due_date: e.target.value })}/><input aria-label={`Valor da tranche ${index + 1}`} type="number" min="0.01" step="0.01" required value={(row.planned_cents / 100).toFixed(2)} onChange={(e) => updateRow(index, { planned_cents: eurosToCents(e.target.value) })}/><button type="button" className="icon-button" title="Remover tranche" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><X size={15}/></button></div>)}</div>
    <div className="plan-total"><span>Total previsto</span><strong className={plannedTotal === balance ? '' : 'invalid-value'}>{money(plannedTotal)} <small>/ {money(balance)}</small></strong><button type="button" className="link-button inline-link" disabled={rows.length >= 240} onClick={addRow}><Plus size={13}/> Adicionar tranche</button></div>
    {!validRows && rows.length > 0 && <div className="inline-error">Cada tranche precisa de uma data única e um valor superior a zero.</div>}
    {error && <div className="inline-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy || !members.length || plannedTotal !== balance || !validRows}>{busy ? 'A guardar...' : 'Guardar plano'} <Check size={16}/></button></div>
  </form>
}

function RepaymentForm({ members, selected, isManager, onCancel, onSave }: { members: Member[]; selected: string | null; isManager: boolean; onCancel: () => void; onSave: (member: string, cents: number, date: string, note: string) => Promise<void> }) { const [member, setMember] = useState(selected ?? members.find((m) => m.role !== 'manager')?.id ?? ''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayISO()); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); async function submit(e: FormEvent) { e.preventDefault(); if (!isManager) { setError('Só o manager pode confirmar um abatimento.'); return }; setBusy(true); setError(''); try { await onSave(member, eurosToCents(amount), date, note) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) } } return <form className="modal-form" onSubmit={(e) => void submit(e)}><p className="modal-hint">Regista o valor efetivamente abatido e a data em que aconteceu. Pode diferir da tranche prevista.</p><label>Participante<select required value={member} onChange={(e) => setMember(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select></label><div className="form-row"><label>Valor abatido (€)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"/></label><label>Data efetiva<input type="date" required value={date} onChange={(e) => setDate(e.target.value)}/></label></div><label>Nota (opcional)<input maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: abatimento parcial deste mês"/></label>{error && <div className="inline-error">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy || !isManager}>{busy ? 'A registar...' : 'Confirmar abatimento'} <Check size={16}/></button></div></form> }

function splitEvenly(total: number, ids: string[]) { if (!ids.length || total <= 0) return ids.map((member) => ({ member, cents: 0 })); const base = Math.floor(total / ids.length); const remainder = total % ids.length; return ids.map((member, index) => ({ member, cents: base + (index < remainder ? 1 : 0) })) }
function generateInternalPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const randomValues = crypto.getRandomValues(new Uint8Array(length))
  let output = ''
  for (let index = 0; index < length; index += 1) {
    output += alphabet[randomValues[index] % alphabet.length]
  }
  return output
}
function todayISO() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` }
function addOneMonthClamped(dateValue: string) { const current = new Date(`${dateValue}T12:00:00`); const year = current.getFullYear(); const month = current.getMonth() + 1; const day = Math.min(current.getDate(), new Date(year, month + 1, 0).getDate()); return new Date(year, month, day, 12).toISOString().slice(0,10) }
function monthDate(anchorDate: string, offset: number, anchorDay: number) { const anchor = new Date(`${anchorDate}T12:00:00`); const year = anchor.getFullYear(); const month = anchor.getMonth() + offset; return new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0).getDate()), 12).toISOString().slice(0,10) }
function makeSchedule(member: string, balance: number, monthly: number, startDate: string) { if (!balance || !monthly) return []; const count = Math.ceil(balance / monthly); if (count > 240) throw new Error('O plano excede 240 tranches. Aumenta o valor mensal.'); const start = new Date(`${startDate}T12:00:00`); const day = start.getDate(); return Array.from({ length: count }, (_, index) => { const year = start.getFullYear(); const month = start.getMonth() + index; const lastDay = new Date(year, month + 1, 0).getDate(); const due = new Date(year, month, Math.min(day, lastDay), 12); const planned = Math.min(monthly, balance - monthly * index); return { trip_member_id: member, due_date: due.toISOString().slice(0,10), planned_cents: planned } }) }
function adjustScheduleAfterPayment(remaining: number, schedule: Schedule[], paidAt: string): PlanRow[] {
  let balanceLeft = remaining
  const future = schedule.filter((item) => item.due_date > paidAt).sort((a,b) => a.due_date.localeCompare(b.due_date))
  const rows: PlanRow[] = []
  for (const installment of future) {
    if (balanceLeft <= 0) break
    const planned = Math.min(installment.planned_cents, balanceLeft)
    rows.push({ due_date: installment.due_date, planned_cents: planned })
    balanceLeft -= planned
  }
  if (balanceLeft > 0) {
    const monthly = Math.max(...schedule.map((item) => item.planned_cents))
    const anchorDate = future.at(-1)?.due_date ?? paidAt
    const anchorDay = Math.max(...schedule.map((item) => Number(item.due_date.slice(-2))))
    let offset = 1
    while (balanceLeft > 0 && rows.length < 240) {
      const planned = Math.min(monthly, balanceLeft)
      rows.push({ due_date: monthDate(anchorDate, offset++, anchorDay), planned_cents: planned })
      balanceLeft -= planned
    }
    if (balanceLeft > 0) throw new Error('O plano excede 240 tranches.')
  }
  return rows
}

















