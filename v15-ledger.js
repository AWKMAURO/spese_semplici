(()=>{
  function ensureLedger(target){
    if(!Array.isArray(target.balanceAdjustments))target.balanceAdjustments=[];
    if(!Array.isArray(target.transfers))target.transfers=[];
    return target;
  }

  const previousLoad=load;
  load=function(){return ensureLedger(previousLoad())};
  ensureLedger(state);

  function cents(value){return Math.round((Number(value)||0)*100)/100}
  function recordTime(item){return Number(item?.createdAt??item?.recordedAt??0)||0}
  function anchorDate(anchor){return anchor?.date||anchor?.asOfDate||''}
  function afterAnchor(item,anchor){
    if(!anchor)return true;
    if(item.date!==anchorDate(anchor))return item.date>anchorDate(anchor);
    return recordTime(item)>recordTime(anchor);
  }
  function latestBalanceAnchor(accountId,targetDate=today()){
    const candidates=[];
    const snapshot=state.balanceSnapshots?.[accountId];
    if(snapshot?.asOfDate&&snapshot.asOfDate<=targetDate)candidates.push({
      kind:'snapshot',accountId,targetBalance:Number(snapshot.amount)||0,date:snapshot.asOfDate,
      createdAt:Number(snapshot.recordedAt)||0,asOfDate:snapshot.asOfDate,recordedAt:Number(snapshot.recordedAt)||0
    });
    for(const item of state.balanceAdjustments){
      if(item.accountId!==accountId||!item.date||item.date>targetDate)continue;
      candidates.push({...item,targetBalance:Number(item.targetBalance??item.amount)||0});
    }
    return candidates.sort((a,b)=>a.date.localeCompare(b.date)||recordTime(a)-recordTime(b)).at(-1)||null;
  }

  v14BankBalance=function(accountId,targetDate=today()){
    const anchor=latestBalanceAnchor(accountId,targetDate);
    if(!anchor)return null;
    const expenseDelta=state.expenses
      .filter(item=>item.accountId===accountId&&item.date<=targetDate&&afterAnchor(item,anchor))
      .reduce((sum,item)=>sum+(item.transactionType==='income'?Number(item.amount):-Number(item.amount)),0);
    const transferDelta=state.transfers
      .filter(item=>item.date<=targetDate&&afterAnchor(item,anchor)&&(item.fromAccountId===accountId||item.toAccountId===accountId))
      .reduce((sum,item)=>sum+(item.toAccountId===accountId?Number(item.amount):0)-(item.fromAccountId===accountId?Number(item.amount):0),0);
    return cents(Number(anchor.targetBalance)+expenseDelta+transferDelta);
  };

  const previousCardCycleActual=v14CardCycleActual;
  v14CardCycleActual=function(cardId,period,throughDate=null){
    const baseline=v14CardBaseline(cardId,period);
    const transfers=state.transfers
      .filter(item=>item.fromAccountId===cardId&&v14Period(item.date)===period&&(!throughDate||item.date<=throughDate)&&(!baseline||afterAnchor(item,baseline)))
      .reduce((sum,item)=>sum+Number(item.amount),0);
    return cents(previousCardCycleActual(cardId,period,throughDate)+transfers);
  };

  const previousCardPlannedForView=v14CardPlannedForView;
  v14CardPlannedForView=function(cardId){
    const period=v14ViewPeriod(),current=v14CurrentPeriod(),baseline=v14CardBaseline(cardId,period);
    if(period<current)return 0;
    const futureTransfers=state.transfers
      .filter(item=>item.fromAccountId===cardId&&v14Period(item.date)===period&&item.date>today()&&(!baseline||afterAnchor(item,baseline)))
      .reduce((sum,item)=>sum+Number(item.amount),0);
    return cents(previousCardPlannedForView(cardId)+futureTransfers);
  };

  syncStatements=function(){
    const valid=new Set();
    for(const card of state.accounts.filter(item=>item.type==='credit'&&item.linkedAccountId)){
      const periods=new Set(Object.keys(state.creditCycleBaselines?.[card.id]||{}));
      state.expenses
        .filter(item=>item.accountId===card.id&&item.kind!=='credit_statement')
        .forEach(item=>periods.add(v14Period(item.date)));
      state.transfers
        .filter(item=>item.fromAccountId===card.id)
        .forEach(item=>periods.add(v14Period(item.date)));
      for(const period of periods){
        if(!/^\d{4}-\d{2}$/.test(period))continue;
        const date=chargeDate(period,card.debitDay),key=`${card.id}:${period}`;
        if(date>today())continue;
        const total=v14CardCycleActual(card.id,period);
        const existing=state.expenses.find(item=>item.kind==='credit_statement'&&item.statementKey===key);
        if(!(total>0))continue;
        valid.add(key);
        const label=monthFmt.format(new Date(`${period}-15T12:00:00`));
        const values={amount:total,accountId:card.linkedAccountId,date,note:`Addebito ${card.name} · ${label}`,kind:'credit_statement',statementKey:key,cardId:card.id,transactionType:'expense',category:null};
        if(existing)Object.assign(existing,values);
        else state.expenses.push({id:uid(),createdAt:Date.now(),...values});
      }
    }
    state.expenses=state.expenses.filter(item=>item.kind!=='credit_statement'||valid.has(item.statementKey));
  };

  const switcher=document.querySelector('.transaction-type');
  if(switcher&&!switcher.querySelector('[data-transaction-type="balance"]')){
    switcher.insertAdjacentHTML('beforeend','<button type="button" data-transaction-type="balance">Saldo</button><button type="button" data-transaction-type="transfer">Giroconto</button>');
  }

  const movementHint=document.createElement('p');
  movementHint.id='v15MovementHint';
  movementHint.className='v15-movement-hint hidden';
  switcher?.after(movementHint);

  const signChoice=document.createElement('div');
  signChoice.id='v15SignChoice';
  signChoice.className='v15-sign-choice v15-only hidden';
  signChoice.setAttribute('role','group');
  signChoice.setAttribute('aria-label','Segno del saldo');
  signChoice.innerHTML='<button type="button" class="active" data-v15-sign="positive" aria-pressed="true">+ Positivo</button><button type="button" data-v15-sign="negative" aria-pressed="false">− Negativo</button>';
  document.querySelector('#expenseForm .amount-field')?.after(signChoice);

  const transferField=document.createElement('label');
  transferField.id='v15TransferDestinationField';
  transferField.className='text-field v15-only hidden';
  transferField.innerHTML='<span>A conto / contanti</span><select id="v15TransferDestination"></select>';
  document.querySelector('#expenseForm .inline-fields')?.after(transferField);

  let balanceSign=1;
  let lockedSpecialType=null;
  const accountLabel=$('account')?.closest('label')?.querySelector('span');
  const recurringToggle=$('isRecurring')?.closest('label');
  const formTitle=document.querySelector('#expenseDialog .quick-add .section-heading h2')||document.querySelector('.quick-add .section-heading h2');

  function setBalanceSign(sign){
    balanceSign=sign<0?-1:1;
    signChoice.querySelectorAll('[data-v15-sign]').forEach(button=>{
      const active=(button.dataset.v15Sign==='negative'?-1:1)===balanceSign;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  signChoice.querySelectorAll('[data-v15-sign]').forEach(button=>button.onclick=()=>setBalanceSign(button.dataset.v15Sign==='negative'?-1:1));

  function preferredCashAccount(){
    const banks=state.accounts.filter(item=>item.type!=='credit');
    return banks.find(item=>/contant|cash/i.test(item.name))||banks[0]||null;
  }

  function renderTransferDestination(){
    const select=$('v15TransferDestination');
    if(!select)return;
    const previous=select.value,available=state.accounts.filter(item=>item.type!=='credit');
    select.innerHTML=available.map(item=>`<option value="${esc(item.id)}">● ${esc(item.name)}</option>`).join('');
    const fallback=preferredCashAccount();
    select.value=available.some(item=>item.id===previous)?previous:(fallback?.id||'');
  }

  const previousRenderCategories=renderCategories;
  renderCategories=function(){
    if(transactionType==='balance'||transactionType==='transfer'){
      $('categoryGrid').innerHTML='';
      $('categoryGrid').classList.add('v15-form-hidden');
      return;
    }
    $('categoryGrid').classList.remove('v15-form-hidden');
    previousRenderCategories();
  };

  const previousRenderAccountsForType=renderAccountsForType;
  renderAccountsForType=function(){
    if(transactionType==='balance'){
      const old=$('account').value,available=state.accounts.filter(item=>item.type!=='credit');
      $('account').innerHTML=available.map(item=>`<option value="${esc(item.id)}">● ${esc(item.name)}</option>`).join('');
      $('account').value=available.some(item=>item.id===old)?old:(available[0]?.id||'');
      return;
    }
    if(transactionType==='transfer'){
      const old=$('account').value,available=state.accounts.filter(item=>item.type==='credit');
      $('account').innerHTML=available.map(item=>`<option value="${esc(item.id)}">💳 ${esc(item.name)}</option>`).join('');
      $('account').value=available.some(item=>item.id===old)?old:(available[0]?.id||'');
      renderTransferDestination();
      return;
    }
    previousRenderAccountsForType();
  };

  function updateTypeButtons(){
    document.querySelectorAll('[data-transaction-type]').forEach(button=>{
      const editingId=$('expenseId').value;
      const editingOrdinary=Boolean(editingId&&!editingId.includes(':'));
      const blockedBySpecial=Boolean(lockedSpecialType&&button.dataset.transactionType!==lockedSpecialType);
      const blockedByOrdinary=editingOrdinary&&(button.dataset.transactionType==='balance'||button.dataset.transactionType==='transfer');
      button.disabled=blockedBySpecial||blockedByOrdinary;
      button.classList.toggle('locked',button.disabled);
    });
  }

  function applyTypeUi(){
    const special=transactionType==='balance'||transactionType==='transfer';
    const editing=Boolean($('expenseId').value);
    movementHint.classList.toggle('hidden',!special);
    signChoice.classList.toggle('hidden',transactionType!=='balance');
    transferField.classList.toggle('hidden',transactionType!=='transfer');
    $('v15TransferDestination').disabled=transactionType!=='transfer';
    $('v15TransferDestination').required=transactionType==='transfer';
    $('categoryGrid').classList.toggle('v15-form-hidden',special);
    recurringToggle?.classList.toggle('v15-form-hidden',special);
    if(special){
      $('isRecurring').checked=false;
      $('frequencyField').classList.add('hidden');
      $('recurringEndField')?.classList.add('hidden');
    }
    $('date').max=transactionType==='balance'?today():'';
    if(transactionType==='balance'){
      if(accountLabel)accountLabel.textContent='Conto / contanti';
      if(formTitle)formTitle.textContent=editing?'Modifica saldo':'Registra saldo reale';
      $('amount').setAttribute('aria-label','Saldo reale');
      $('saveButton').textContent=editing?'Salva saldo':'Registra saldo';
      movementHint.innerHTML='<strong>Saldo reale</strong><br>Imposta quanto c’è davvero sul conto in questa data. Non sarà conteggiato come entrata o uscita.';
    }else if(transactionType==='transfer'){
      if(accountLabel)accountLabel.textContent='Da carta di credito';
      if(formTitle)formTitle.textContent=editing?'Modifica giroconto':'Giroconto carta → contanti';
      $('amount').setAttribute('aria-label','Importo del giroconto');
      $('saveButton').textContent=editing?'Salva giroconto':'Registra giroconto';
      movementHint.innerHTML='<strong>Prelievo dalla carta</strong><br>Aumenta i contanti, usa il plafond e confluisce nell’addebito della carta. Non è una spesa né un’entrata.';
      renderTransferDestination();
    }else{
      if(accountLabel)accountLabel.textContent=transactionType==='income'?'Conto / contanti':'Conto o carta';
      if(formTitle)formTitle.textContent=editing?(transactionType==='income'?'Modifica entrata':'Modifica uscita'):(transactionType==='income'?'Nuova entrata':'Nuova uscita');
      $('amount').setAttribute('aria-label','Importo');
      $('saveButton').textContent=editing?'Salva modifica':(transactionType==='income'?'Aggiungi entrata':'Aggiungi spesa');
    }
    updateTypeButtons();
  }

  const previousSetTransactionType=setTransactionType;
  setTransactionType=function(type){
    if(lockedSpecialType&&type!==lockedSpecialType)return;
    previousSetTransactionType(type);
    applyTypeUi();
  };
  document.querySelectorAll('[data-transaction-type]').forEach(button=>button.onclick=()=>setTransactionType(button.dataset.transactionType));

  const previousResetForm=resetForm;
  resetForm=function(){
    lockedSpecialType=null;
    previousResetForm();
    setBalanceSign(1);
    $('expenseId').value='';
    applyTypeUi();
  };

  function openSpecial(kind,id){
    const collection=kind==='balance'?state.balanceAdjustments:state.transfers;
    const item=collection.find(entry=>entry.id===id);
    if(!item)return;
    resetForm();
    setTransactionType(kind);
    lockedSpecialType=kind;
    $('expenseId').value=`${kind}:${id}`;
    $('amount').value=Math.abs(Number(kind==='balance'?(item.targetBalance??item.amount):item.amount)).toFixed(2).replace('.',',');
    $('date').value=item.date;
    $('note').value=item.note||'';
    if(kind==='balance'){
      $('account').value=item.accountId;
      setBalanceSign(Number(item.targetBalance??item.amount)<0?-1:1);
    }else{
      $('account').value=item.fromAccountId;
      renderTransferDestination();
      $('v15TransferDestination').value=item.toAccountId;
    }
    applyTypeUi();
    $('cancelEdit').classList.remove('hidden');
    if(!expenseDialog.open)expenseDialog.showModal();
    setTimeout(()=>$('amount').focus(),100);
  }

  function saveBalanceAdjustment(){
    const entered=parseAmount($('amount').value),accountId=$('account').value,date=$('date').value;
    const target=account(accountId);
    if(!target||target.type==='credit')return alert('Scegli un conto o i contanti.');
    if(!Number.isFinite(entered))return alert('Inserisci un saldo valido, anche zero o negativo.');
    if(!date||date>today())return alert('Il saldo reale non può avere una data futura.');
    const idValue=$('expenseId').value,id=idValue.startsWith('balance:')?idValue.slice(8):'';
    const old=state.balanceAdjustments.find(item=>item.id===id);
    const value=cents(Math.abs(entered)*(entered<0?-1:balanceSign));
    const record={id:id||uid(),kind:'balance_adjustment',accountId,targetBalance:value,date,note:$('note').value.trim(),createdAt:old?.createdAt||Date.now()};
    if(old)state.balanceAdjustments=state.balanceAdjustments.map(item=>item.id===id?record:item);
    else state.balanceAdjustments.push(record);
    viewMonth=new Date(`${date}T12:00:00`);viewMonth.setDate(1);
    save();
    finishSpecialSave();
  }

  function saveTransfer(){
    const amount=parseAmount($('amount').value),fromAccountId=$('account').value,toAccountId=$('v15TransferDestination').value,date=$('date').value;
    const source=account(fromAccountId),destination=account(toAccountId);
    if(!source||source.type!=='credit')return alert('Scegli la carta di credito da cui prelevare.');
    if(!destination||destination.type==='credit')return alert('Scegli il conto o i contanti su cui arriva il denaro.');
    if(fromAccountId===toAccountId)return alert('Origine e destinazione devono essere diverse.');
    if(!(amount>0))return alert('Inserisci un importo maggiore di zero.');
    if(!date)return alert('Inserisci la data del giroconto.');
    const idValue=$('expenseId').value,id=idValue.startsWith('transfer:')?idValue.slice(9):'';
    const old=state.transfers.find(item=>item.id===id);
    const record={id:id||uid(),kind:'transfer',fromAccountId,toAccountId,amount:cents(amount),date,note:$('note').value.trim(),createdAt:old?.createdAt||Date.now()};
    if(old)state.transfers=state.transfers.map(item=>item.id===id?record:item);
    else state.transfers.push(record);
    viewMonth=new Date(`${date}T12:00:00`);viewMonth.setDate(1);
    save();
    finishSpecialSave();
  }

  function finishSpecialSave(){
    lockedSpecialType=null;
    resetForm();
    if(expenseDialog.open)expenseDialog.close();
    setPage('status');
  }

  const previousSubmit=$('expenseForm').onsubmit;
  $('expenseForm').onsubmit=function(event){
    if(transactionType==='balance'){
      event.preventDefault();
      saveBalanceAdjustment();
      return;
    }
    if(transactionType==='transfer'){
      event.preventDefault();
      saveTransfer();
      return;
    }
    previousSubmit(event);
  };

  $('cancelEdit').onclick=()=>{
    resetForm();
    if(expenseDialog.open)expenseDialog.close();
  };

  function customItemsForView(){
    if(categoryFilter!=='all')return[];
    const balances=state.balanceAdjustments
      .filter(item=>inView(item.date)&&(accountFilter==='all'||item.accountId===accountFilter))
      .map(item=>({...item,_v15Type:'balance'}));
    const transfers=state.transfers
      .filter(item=>inView(item.date)&&(accountFilter==='all'||item.fromAccountId===accountFilter||item.toAccountId===accountFilter))
      .map(item=>({...item,_v15Type:'transfer'}));
    return [...balances,...transfers];
  }

  function ordinaryMarkup(item){
    const statement=item.kind==='credit_statement',category=statement?{icon:'💳',label:'Carta di credito'}:cat(item.category),itemAccount=account(item.accountId);
    const badge=statement?'<span class="statement-badge">● addebito carta</span>':isCredit(item.accountId)?'<span class="pending-badge">◷ addebito futuro</span>':item.recurringId?'<span class="recurring-badge">↻ ricorrente</span>':'';
    return`<article class="expense-item"><div class="expense-icon">${category.icon}</div><div class="expense-copy"><strong>${esc(item.note||category.label)}${badge}</strong><span>${esc(category.label)} · ${esc(itemAccount?.name||'Conto')} · ${dateFmt.format(new Date(`${item.date}T12:00:00`))}</span></div><div><div class="expense-amount">− ${eur.format(item.amount)}</div>${statement?'':`<div class="expense-menu"><button data-edit="${esc(item.id)}">Modifica</button><button data-del="${esc(item.id)}">Elimina</button></div>`}</div></article>`;
  }

  function balanceMarkup(item){
    const value=Number(item.targetBalance??item.amount)||0,itemAccount=account(item.accountId);
    return`<article class="expense-item balance-adjustment-item"><div class="expense-icon">=</div><div class="expense-copy"><strong>${esc(item.note||'Saldo reale')}<span class="balance-adjustment-badge">saldo</span></strong><span>${esc(itemAccount?.name||'Conto')} · ${dateFmt.format(new Date(`${item.date}T12:00:00`))}</span></div><div><div class="expense-amount neutral-amount">= ${value<0?'− ':''}${eur.format(Math.abs(value))}</div><div class="expense-menu"><button data-v15-edit-balance="${esc(item.id)}">Modifica</button><button data-v15-delete-balance="${esc(item.id)}">Elimina</button></div></div></article>`;
  }

  function transferMarkup(item){
    const source=account(item.fromAccountId),destination=account(item.toAccountId);
    const sign=accountFilter===item.fromAccountId?'− ':accountFilter===item.toAccountId?'+ ':'';
    return`<article class="expense-item transfer-item"><div class="expense-icon">⇢</div><div class="expense-copy"><strong>${esc(item.note||'Prelievo contanti')}<span class="transfer-badge">giroconto</span></strong><span>${esc(source?.name||'Carta')} → ${esc(destination?.name||'Contanti')} · ${dateFmt.format(new Date(`${item.date}T12:00:00`))}</span></div><div><div class="expense-amount neutral-amount">${sign}${eur.format(item.amount)}</div><div class="expense-menu"><button data-v15-edit-transfer="${esc(item.id)}">Modifica</button><button data-v15-delete-transfer="${esc(item.id)}">Elimina</button></div></div></article>`;
  }

  renderExpenses=function(items){
    const combined=[...items.map(item=>({...item,_v15Type:'ordinary'})),...customItemsForView()]
      .sort((a,b)=>b.date.localeCompare(a.date)||recordTime(b)-recordTime(a));
    $('expenseList').innerHTML=combined.map(item=>item._v15Type==='balance'?balanceMarkup(item):item._v15Type==='transfer'?transferMarkup(item):ordinaryMarkup(item)).join('');
    $('emptyState').classList.toggle('hidden',combined.length>0);
    document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>editExpense(button.dataset.edit));
    document.querySelectorAll('[data-del]').forEach(button=>button.onclick=()=>{
      if(confirm('Eliminare questo movimento?')){state.expenses=state.expenses.filter(item=>item.id!==button.dataset.del);save()}
    });
    document.querySelectorAll('[data-v15-edit-balance]').forEach(button=>button.onclick=()=>openSpecial('balance',button.dataset.v15EditBalance));
    document.querySelectorAll('[data-v15-edit-transfer]').forEach(button=>button.onclick=()=>openSpecial('transfer',button.dataset.v15EditTransfer));
    document.querySelectorAll('[data-v15-delete-balance]').forEach(button=>button.onclick=()=>{
      if(confirm('Eliminare questa rettifica di saldo? Il saldo stimato tornerà a basarsi sul valore precedente.')){
        state.balanceAdjustments=state.balanceAdjustments.filter(item=>item.id!==button.dataset.v15DeleteBalance);save();
      }
    });
    document.querySelectorAll('[data-v15-delete-transfer]').forEach(button=>button.onclick=()=>{
      if(confirm('Eliminare questo giroconto? Verranno aggiornati contanti, plafond e addebito futuro della carta.')){
        state.transfers=state.transfers.filter(item=>item.id!==button.dataset.v15DeleteTransfer);save();
      }
    });
  };

  function monthlyAccountNet(accountId){
    const actual=state.expenses.filter(item=>inView(item.date)&&item.accountId===accountId)
      .reduce((sum,item)=>sum+(item.transactionType==='income'?Number(item.amount):-Number(item.amount)),0);
    const forecast=projectedForView().filter(item=>item.accountId===accountId)
      .reduce((sum,item)=>sum+(item.transactionType==='income'?Number(item.amount):-Number(item.amount)),0);
    const transfers=state.transfers.filter(item=>inView(item.date)&&(item.fromAccountId===accountId||item.toAccountId===accountId))
      .reduce((sum,item)=>sum+(item.toAccountId===accountId?Number(item.amount):0)-(item.fromAccountId===accountId?Number(item.amount):0),0);
    return cents(actual+forecast+transfers);
  }

  accountOverview=function(){
    const period=v14ViewPeriod(),current=v14CurrentPeriod();
    $('stateAccounts').innerHTML=state.accounts.map(item=>{
      if(item.type==='credit'){
        const used=Math.max(v14CardVisibleActual(item.id,period),0),planned=v14CardPlannedForView(item.id),limit=Number(item.limit)||0,remaining=limit-used,p=limit?Math.round(used/limit*100):0;
        return`<article class="state-account-card live-account-card"><span>💳 ${esc(item.name)} · speso nel ciclo</span><strong>${eur.format(used)}</strong><div class="mini-progress"><i style="width:${limit?Math.min(p,100):0}%;background:${p>100?'#d95b4f':p>=80?'#e9a13b':''}"></i></div><span class="account-detail">${limit?`${eur.format(Math.max(remaining,0))} disponibili sul plafond`:'Plafond da impostare'}</span>${planned?`<span class="account-detail">${eur.format(planned)} previsti</span>`:''}</article>`;
      }
      if(period===current){
        const anchor=latestBalanceAnchor(item.id),balance=v14BankBalance(item.id);
        if(anchor&&balance!==null){
          const change=cents(balance-Number(anchor.targetBalance));
          return`<article class="state-account-card live-account-card"><span>● ${esc(item.name)} · saldo stimato oggi</span><strong>${balance<0?'− ':''}${eur.format(Math.abs(balance))}</strong><span class="account-detail">Aggiornato ${v14HumanDate(anchor.date)} · ${change===0?'nessun nuovo movimento':`${change>0?'+ ':'− '}${eur.format(Math.abs(change))}`}</span></article>`;
        }
        const net=monthlyAccountNet(item.id);
        return`<article class="state-account-card live-account-card"><span>● ${esc(item.name)}</span><strong>Saldo non impostato</strong><span class="account-detail">Movimenti del mese ${net>=0?'+ ':'− '}${eur.format(Math.abs(net))}</span></article>`;
      }
      const net=monthlyAccountNet(item.id);
      return`<article class="state-account-card live-account-card"><span>● ${esc(item.name)} · movimenti del mese</span><strong>${net>=0?'+ ':'− '}${eur.format(Math.abs(net))}</strong><div class="mini-progress"><i style="width:${Math.min(Math.abs(net)/Math.max(state.budget||Math.abs(net),1)*100,100)}%"></i></div></article>`;
    }).join('');
  };

  v14RenderBalanceHero=function(){
    v14BalanceHero.classList.add('hidden');
    v14BalanceHero.innerHTML='';
  };

  const previousRenderSettings=renderSettings;
  renderSettings=function(){
    previousRenderSettings();
    for(const item of state.accounts.filter(entry=>entry.type!=='credit')){
      const rename=[...document.querySelectorAll('[data-rename-account]')].find(button=>button.dataset.renameAccount===item.id);
      const row=rename?.closest('.setting-row'),type=row?.querySelector('.account-type'),button=row?.querySelector('[data-balance-account]');
      const anchor=latestBalanceAnchor(item.id),balance=v14BankBalance(item.id);
      if(button)button.textContent='Base iniziale';
      if(type)type.textContent=anchor&&balance!==null?`Saldo stimato ${eur.format(balance)} · aggiornato ${v14HumanDate(anchor.date)}`:'Conto / contanti · saldo da impostare';
    }
  };

  const previousDeleteAccount=deleteAccount;
  deleteAccount=function(id){
    if(state.balanceAdjustments.some(item=>item.accountId===id)||state.transfers.some(item=>item.fromAccountId===id||item.toAccountId===id)){
      return alert('Il conto è utilizzato da saldi o giroconti. Elimina prima quei movimenti.');
    }
    previousDeleteAccount(id);
  };

  const previousEnhanceAfterRender=enhanceAfterRender;
  enhanceAfterRender=function(){
    previousEnhanceAfterRender();
    showAll.textContent=showAllExpenses?'Mostra solo gli ultimi':'Vedi tutti i movimenti';
  };

  function finishRender(){
    v14BalanceHero.classList.add('hidden');
    document.querySelectorAll('.history-section .section-heading h2').forEach(title=>title.textContent='Movimenti');
    const emptyTitle=$('emptyState')?.querySelector('h3'),emptyText=$('emptyState')?.querySelector('p');
    if(emptyTitle)emptyTitle.textContent='Ancora nessun movimento';
    if(emptyText)emptyText.textContent='Aggiungi il primo: bastano pochi secondi.';
    const add=document.querySelector('.floating-add');
    if(add)add.setAttribute('aria-label','Aggiungi movimento');
    $('emptyState').classList.toggle('hidden',$('expenseList').children.length>0);
    applyTypeUi();
  }

  const previousRender=render;
  render=function(){previousRender();finishRender()};

  window.SpeseLedgerV15={ensureLedger,latestBalanceAnchor,bankBalance:(id,date)=>v14BankBalance(id,date),cardCycle:(id,period,date)=>v14CardCycleActual(id,period,date)};
  syncStatements();
  persistOnly();
  setTransactionType(transactionType||'expense');
  render();
})();

