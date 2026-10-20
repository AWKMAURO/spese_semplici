function v14EnsureState(target){
  if(!target.balanceSnapshots||Array.isArray(target.balanceSnapshots)||typeof target.balanceSnapshots!=='object')target.balanceSnapshots={};
  if(!target.creditCycleBaselines||Array.isArray(target.creditCycleBaselines)||typeof target.creditCycleBaselines!=='object')target.creditCycleBaselines={};
  return target;
}

const v14PreviousLoad=load;
load=function(){return v14EnsureState(v14PreviousLoad())};
v14EnsureState(state);

const v14LongDate=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'});

function v14Money(value){return Math.round((Number(value)||0)*100)/100}
function v14Period(date){return String(date||'').slice(0,7)}
function v14CurrentPeriod(){return v14Period(today())}
function v14ViewPeriod(){return`${viewMonth.getFullYear()}-${String(viewMonth.getMonth()+1).padStart(2,'0')}`}
function v14HumanDate(date){return v14LongDate.format(new Date(`${date}T12:00:00`))}
function v14AfterAnchor(transaction,anchor){
  if(!anchor)return true;
  if(transaction.date!==anchor.asOfDate)return transaction.date>anchor.asOfDate;
  return Number(transaction.createdAt||0)>Number(anchor.recordedAt||0);
}

function v14BankBalance(accountId,targetDate=today()){
  const snapshot=state.balanceSnapshots[accountId];
  if(!snapshot||targetDate<snapshot.asOfDate)return null;
  const delta=state.expenses
    .filter(x=>x.accountId===accountId&&x.date<=targetDate&&v14AfterAnchor(x,snapshot))
    .reduce((sum,x)=>sum+(x.transactionType==='income'?Number(x.amount):-Number(x.amount)),0);
  return v14Money(Number(snapshot.amount)+delta);
}

function v14CardBaseline(cardId,period){return state.creditCycleBaselines[cardId]?.[period]||null}
function v14CardCycleActual(cardId,period,throughDate=null){
  const baseline=v14CardBaseline(cardId,period);
  const movementTotal=state.expenses
    .filter(x=>x.accountId===cardId&&x.kind!=='credit_statement'&&v14Period(x.date)===period&&(!throughDate||x.date<=throughDate)&&(!baseline||v14AfterAnchor(x,baseline)))
    .reduce((sum,x)=>sum+(x.transactionType==='income'?-Number(x.amount):Number(x.amount)),0);
  return v14Money(Number(baseline?.amount||0)+movementTotal);
}

function v14CardVisibleActual(cardId,period){
  const current=v14CurrentPeriod();
  if(period>current)return 0;
  return v14CardCycleActual(cardId,period,period===current?today():null);
}

function v14CardPlannedForView(cardId){
  const period=v14ViewPeriod(),current=v14CurrentPeriod(),baseline=v14CardBaseline(cardId,period);
  if(period<current)return 0;
  const recordedFuture=state.expenses
    .filter(x=>x.accountId===cardId&&x.kind!=='credit_statement'&&x.transactionType!=='income'&&v14Period(x.date)===period&&x.date>today()&&(!baseline||v14AfterAnchor(x,baseline)))
    .reduce((sum,x)=>sum+Number(x.amount),0);
  const recurringFuture=projectedForView()
    .filter(x=>x.accountId===cardId&&x.transactionType!=='income'&&x.date>today()&&(!baseline||x.date>baseline.asOfDate))
    .reduce((sum,x)=>sum+Number(x.amount),0);
  return v14Money(recordedFuture+recurringFuture);
}

syncStatements=function(){
  const valid=new Set();
  for(const card of state.accounts.filter(a=>a.type==='credit'&&a.linkedAccountId)){
    const periods=new Set(Object.keys(state.creditCycleBaselines[card.id]||{}));
    state.expenses
      .filter(x=>x.accountId===card.id&&x.kind!=='credit_statement')
      .forEach(x=>periods.add(v14Period(x.date)));
    for(const period of periods){
      if(!/^\d{4}-\d{2}$/.test(period))continue;
      const date=chargeDate(period,card.debitDay),key=`${card.id}:${period}`;
      if(date>today())continue;
      const total=v14CardCycleActual(card.id,period);
      const existing=state.expenses.find(x=>x.kind==='credit_statement'&&x.statementKey===key);
      if(!(total>0))continue;
      valid.add(key);
      const label=monthFmt.format(new Date(`${period}-15T12:00:00`));
      const values={amount:total,accountId:card.linkedAccountId,date,note:`Addebito ${card.name} · ${label}`,kind:'credit_statement',statementKey:key,cardId:card.id,transactionType:'expense'};
      if(existing)Object.assign(existing,values);
      else state.expenses.push({id:uid(),createdAt:Date.now(),category:null,...values});
    }
  }
  state.expenses=state.expenses.filter(x=>x.kind!=='credit_statement'||valid.has(x.statementKey));
};

const v14BalanceHero=document.createElement('section');
v14BalanceHero.className='live-balance-summary';
v14BalanceHero.id='liveBalanceSummary';
$('stateAccounts').before(v14BalanceHero);

const v14BalanceDialog=document.createElement('dialog');
v14BalanceDialog.id='balanceDialog';
v14BalanceDialog.innerHTML=`
  <form class="dialog-card scrollable" id="balanceForm">
    <div class="dialog-heading">
      <div><p class="eyebrow" id="balanceKind">SALDO DI PARTENZA</p><h2 id="balanceDialogTitle">Saldo di oggi</h2></div>
      <button type="button" class="icon-button" id="closeBalanceDialog" aria-label="Chiudi">×</button>
    </div>
    <input type="hidden" id="balanceAccountId">
    <label class="text-field"><span id="balanceAmountLabel">Saldo disponibile mostrato dalla banca (€)</span><input id="balanceAmount" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
    <div class="balance-sign-choice" id="balanceSignChoice" role="group" aria-label="Segno del saldo">
      <button type="button" data-balance-sign="positive" aria-pressed="true">+ Positivo</button>
      <button type="button" data-balance-sign="negative" aria-pressed="false">− Negativo</button>
    </div>
    <label class="text-field"><span>Data del punto di partenza</span><input id="balanceDate" type="date" readonly></label>
    <div class="balance-explanation" id="balanceHint"></div>
    <button class="primary-button" type="submit" id="saveBalance">Usa come punto di partenza</button>
  </form>`;
document.body.appendChild(v14BalanceDialog);

let v14BalanceSign=1;
function v14SetBalanceSign(sign){
  v14BalanceSign=sign<0?-1:1;
  document.querySelectorAll('[data-balance-sign]').forEach(button=>{
    const active=(button.dataset.balanceSign==='negative'?-1:1)===v14BalanceSign;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
document.querySelectorAll('[data-balance-sign]').forEach(button=>button.onclick=()=>v14SetBalanceSign(button.dataset.balanceSign==='negative'?-1:1));

function v14OpenBalance(accountId){
  const item=account(accountId);
  if(!item)return;
  const isCard=item.type==='credit',period=v14CurrentPeriod();
  $('balanceAccountId').value=item.id;
  $('balanceDate').value=today();
  $('balanceKind').textContent=isCard?'CARTA DI CREDITO':'CONTO O CONTANTI';
  $('balanceDialogTitle').textContent=isCard?item.name:`Saldo di ${item.name}`;
  $('balanceAmountLabel').textContent=isCard?'Totale già speso nel ciclo corrente (€)':'Saldo disponibile mostrato oggi (€)';
  const current=isCard?v14CardVisibleActual(item.id,period):v14BankBalance(item.id);
  $('balanceSignChoice').classList.toggle('hidden',isCard);
  v14SetBalanceSign(!isCard&&current!==null&&Number(current)<0?-1:1);
  $('balanceAmount').value=current===null?'':Math.abs(Number(current)).toFixed(2).replace('.',',');
  $('balanceHint').innerHTML=isCard
    ?`<strong>Chiusura il 31 del mese</strong><span>Inserisci il totale che vedi oggi sulla carta. Non diventa una spesa di categoria: consumerà il plafond e sarà incluso nell’unico addebito del mese prossimo sul conto collegato.</span>`
    :`<strong>Nessun movimento fittizio</strong><span>Questo valore diventa la base di oggi. Da qui in avanti entrate, uscite e addebiti della carta aggiorneranno automaticamente il saldo stimato.</span>`;
  if($('settingsDialog').open)$('settingsDialog').close();
  v14BalanceDialog.showModal();
  setTimeout(()=>$('balanceAmount').focus(),100);
}

$('closeBalanceDialog').onclick=()=>v14BalanceDialog.close();
$('balanceForm').onsubmit=event=>{
  event.preventDefault();
  const item=account($('balanceAccountId').value),entered=parseAmount($('balanceAmount').value);
  if(!item||!Number.isFinite(entered))return alert('Inserisci un importo valido.');
  if(item.type==='credit'&&entered<0)return alert('Lo speso della carta non può essere negativo.');
  const value=item.type==='credit'?entered:v14Money(Math.abs(entered)*(entered<0?-1:v14BalanceSign));
  syncStatements();
  const snapshot={amount:v14Money(value),asOfDate:today(),recordedAt:Date.now()};
  if(item.type==='credit'){
    const period=v14CurrentPeriod();
    if(!state.creditCycleBaselines[item.id]||Array.isArray(state.creditCycleBaselines[item.id]))state.creditCycleBaselines[item.id]={};
    state.creditCycleBaselines[item.id][period]=snapshot;
  }else state.balanceSnapshots[item.id]=snapshot;
  save();
  v14BalanceDialog.close();
};

function v14BindBalanceButtons(){
  document.querySelectorAll('[data-balance-account]').forEach(button=>button.onclick=()=>v14OpenBalance(button.dataset.balanceAccount));
  const openSettings=$('openBalanceSettings');
  if(openSettings)openSettings.onclick=()=>{$('budget').value=state.budget||'';renderSettings();$('settingsDialog').showModal()};
}

const v14PreviousRenderSettings=renderSettings;
renderSettings=function(){
  v14PreviousRenderSettings();
  for(const item of state.accounts){
    const selector=item.type==='credit'?'[data-config-card]':'[data-rename-account]';
    const anchor=[...document.querySelectorAll(selector)].find(button=>(item.type==='credit'?button.dataset.configCard:button.dataset.renameAccount)===item.id);
    const actions=anchor?.closest('.setting-row-actions'),row=actions?.closest('.setting-row');
    if(!actions||!row)continue;
    const button=document.createElement('button');
    button.type='button';
    button.dataset.balanceAccount=item.id;
    button.textContent=item.type==='credit'?'Situazione':'Saldo';
    actions.prepend(button);
    const type=row.querySelector('.account-type');
    if(item.type==='credit'){
      const used=v14CardVisibleActual(item.id,v14CurrentPeriod()),remaining=Number(item.limit)?Number(item.limit)-used:null;
      type.textContent=`Carta · speso ${eur.format(used)}${remaining===null?'':` · disponibile ${eur.format(Math.max(remaining,0))}`}`;
    }else{
      const current=v14BankBalance(item.id),snapshot=state.balanceSnapshots[item.id];
      type.textContent=snapshot?`Saldo stimato ${eur.format(current)} · base ${v14HumanDate(snapshot.asOfDate)}`:'Conto / contanti · saldo da impostare';
    }
  }
  v14BindBalanceButtons();
};

renderCreditCards=function(){
  const cards=state.accounts.filter(a=>a.type==='credit'),period=v14ViewPeriod(),current=v14CurrentPeriod();
  $('creditCardsSection').classList.toggle('hidden',!cards.length);
  const title=$('creditCardsSection').querySelector('h2');
  if(title)title.textContent='Speso nel ciclo e disponibilità';
  $('creditCardsChart').innerHTML=cards.map(card=>{
    const used=Math.max(v14CardVisibleActual(card.id,period),0),planned=v14CardPlannedForView(card.id),limit=Number(card.limit)||0,remaining=limit-used,p=limit?Math.round(used/limit*100):0,status=p>100?'over':p>=80?'warning':'',debitDate=chargeDate(period,card.debitDay),baseline=v14CardBaseline(card.id,period);
    const debitLabel=debitDate<=today()?'Addebitato':'Prossimo addebito';
    return`<div class="card-status"><div class="card-status-head"><strong>💳 ${esc(card.name)}</strong><span>${eur.format(used)} di ${limit?eur.format(limit):'plafond non impostato'}</span></div><div class="budget-track"><div class="budget-fill ${status}" style="width:${limit?Math.min(p,100):0}%"></div></div><div class="card-balance-meta"><strong>${limit?`${eur.format(Math.max(remaining,0))} disponibili`:'Imposta il plafond'}</strong><span>${debitLabel} ${v14HumanDate(debitDate)} · ${eur.format(used)} su ${esc(account(card.linkedAccountId)?.name||'conto da configurare')}</span>${planned?`<span>${eur.format(planned)} di spese previste, non ancora conteggiate</span>`:''}${baseline?`<span>Base iniziale rilevata ${v14HumanDate(baseline.asOfDate)}</span>`:''}</div>${period===current?`<button type="button" class="balance-card-button" data-balance-account="${esc(card.id)}">Aggiorna situazione carta</button>`:''}</div>`;
  }).join('');
  v14BindBalanceButtons();
};

accountOverview=function(){
  const actual=state.expenses.filter(x=>inView(x.date)),forecast=projectedForView(),period=v14ViewPeriod(),current=v14CurrentPeriod();
  $('stateAccounts').innerHTML=state.accounts.map(item=>{
    if(item.type==='credit'){
      const used=Math.max(v14CardVisibleActual(item.id,period),0),planned=v14CardPlannedForView(item.id),limit=Number(item.limit)||0,remaining=limit-used,p=limit?Math.round(used/limit*100):0;
      return`<article class="state-account-card live-account-card"><span>💳 ${esc(item.name)} · speso nel ciclo</span><strong>${eur.format(used)}</strong><div class="mini-progress"><i style="width:${limit?Math.min(p,100):0}%;background:${p>100?'#d95b4f':p>=80?'#e9a13b':''}"></i></div><span class="account-detail">${limit?`${eur.format(Math.max(remaining,0))} disponibili sul plafond`:'Plafond da impostare'}</span>${planned?`<span class="account-detail">${eur.format(planned)} previsti</span>`:''}${period===current?`<button type="button" class="balance-inline-button" data-balance-account="${esc(item.id)}">Aggiorna</button>`:''}</article>`;
    }
    const snapshot=state.balanceSnapshots[item.id];
    if(period===current&&snapshot){
      const balance=v14BankBalance(item.id),change=v14Money(balance-Number(snapshot.amount));
      return`<article class="state-account-card live-account-card"><span>● ${esc(item.name)} · saldo stimato oggi</span><strong>${balance>=0?'':'− '}${eur.format(Math.abs(balance))}</strong><span class="account-detail">Base ${v14HumanDate(snapshot.asOfDate)} · ${change===0?'nessun nuovo movimento':`${change>0?'+ ':'− '}${eur.format(Math.abs(change))}`}</span><button type="button" class="balance-inline-button" data-balance-account="${esc(item.id)}">Aggiorna saldo</button></article>`;
    }
    const actualAccount=actual.filter(x=>x.accountId===item.id),forecastAccount=forecast.filter(x=>x.accountId===item.id),outgoingActual=actualAccount.filter(x=>x.transactionType!=='income').reduce((sum,x)=>sum+Number(x.amount),0),outgoingForecast=forecastAccount.filter(x=>x.transactionType!=='income').reduce((sum,x)=>sum+Number(x.amount),0),incomingActual=actualAccount.filter(x=>x.transactionType==='income').reduce((sum,x)=>sum+Number(x.amount),0),incomingForecast=forecastAccount.filter(x=>x.transactionType==='income').reduce((sum,x)=>sum+Number(x.amount),0),balance=incomingActual+incomingForecast-outgoingActual-outgoingForecast;
    return`<article class="state-account-card live-account-card"><span>● ${esc(item.name)} · bilancio mese</span><strong>${balance>=0?'+ ':''}${eur.format(balance)}</strong><div class="mini-progress"><i style="width:${Math.min((outgoingActual+outgoingForecast)/Math.max(state.budget||outgoingActual+outgoingForecast,1)*100,100)}%"></i></div>${period===current?`<button type="button" class="balance-inline-button" data-balance-account="${esc(item.id)}">Inserisci saldo di oggi</button>`:''}</article>`;
  }).join('');
  v14BindBalanceButtons();
};

function v14RenderBalanceHero(){
  const current=v14ViewPeriod()===v14CurrentPeriod(),banks=state.accounts.filter(a=>a.type!=='credit');
  v14BalanceHero.classList.toggle('hidden',!current);
  if(!current)return;
  const known=banks.filter(a=>state.balanceSnapshots[a.id]&&v14BankBalance(a.id)!==null);
  if(!known.length){
    v14BalanceHero.innerHTML='<div><span>DISPONIBILITÀ DI OGGI</span><strong>Inserisci i saldi di partenza</strong><p>Da questo momento l’app aggiornerà automaticamente ogni conto.</p></div><button type="button" id="openBalanceSettings">Imposta saldi</button>';
  }else{
    const total=v14Money(known.reduce((sum,a)=>sum+v14BankBalance(a.id),0)),missing=banks.length-known.length;
    v14BalanceHero.innerHTML=`<div><span>${missing?'SALDI INSERITI':'DISPONIBILITÀ TOTALE OGGI'}</span><strong>${total>=0?'':'− '}${eur.format(Math.abs(total))}</strong><p>${missing?`Manca il saldo di ${missing} ${missing===1?'conto':'conti'}.`:`Somma di ${known.length} ${known.length===1?'conto':'conti'}; le carte incidono solo nel giorno dell’addebito.`}</p></div><button type="button" id="openBalanceSettings">Gestisci</button>`;
  }
  v14BindBalanceButtons();
}

const v14PreviousDeleteAccount=deleteAccount;
deleteAccount=function(id){
  const existed=Boolean(account(id));
  v14PreviousDeleteAccount(id);
  if(existed&&!account(id)){
    delete state.balanceSnapshots[id];
    delete state.creditCycleBaselines[id];
    persistOnly();
  }
};

const v14PreviousRender=render;
render=function(){
  v14PreviousRender();
  v14RenderBalanceHero();
  const selected=account(accountFilter),period=v14ViewPeriod();
  if(selected?.type==='credit'){
    const actual=v14CardVisibleActual(selected.id,period),planned=v14CardPlannedForView(selected.id);
    $('totalLabel').textContent=`Speso con ${selected.name}`;
    $('monthlyTotal').textContent=eur.format(actual);
    $('cashflowNote').textContent=planned?`${eur.format(planned)} previsti nel resto del ciclo. Sarà addebitato il totale il mese successivo.`:'Sarà addebitato in un’unica soluzione il mese successivo.';
  }else $('totalLabel').textContent='Bilancio del mese';
};

syncStatements();
persistOnly();
render();
