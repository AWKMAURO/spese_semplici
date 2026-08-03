accountOverview=function(){
  const actual=state.expenses.filter(x=>inView(x.date));
  const forecast=projectedForView();
  $('stateAccounts').innerHTML=state.accounts.map(a=>{
    const actualAccount=actual.filter(x=>x.accountId===a.id);
    const forecastAccount=forecast.filter(x=>x.accountId===a.id);
    if(a.type==='credit'){
      const usedActual=actualAccount.filter(x=>x.kind!=='credit_statement'&&x.transactionType!=='income').reduce((s,x)=>s+x.amount,0);
      const usedForecast=forecastAccount.filter(x=>x.transactionType!=='income').reduce((s,x)=>s+x.amount,0);
      const used=usedActual+usedForecast,limit=Number(a.limit)||0,p=limit?Math.round(used/limit*100):0;
      return`<article class="state-account-card"><span>💳 ${esc(a.name)} · plafond</span><strong>${eur.format(used)}</strong><div class="mini-progress"><i style="width:${Math.min(p,100)}%;background:${p>100?'#d95b4f':p>=80?'#e9a13b':''}"></i></div>${usedForecast?`<span>${eur.format(usedForecast)} previsti</span>`:''}</article>`;
    }
    const outgoingActual=actualAccount.filter(x=>x.transactionType!=='income'&&(x.kind==='credit_statement'||!isCredit(x.accountId))).reduce((s,x)=>s+x.amount,0);
    const outgoingForecast=forecastAccount.filter(x=>x.transactionType!=='income').reduce((s,x)=>s+x.amount,0);
    const incomingActual=actualAccount.filter(x=>x.transactionType==='income').reduce((s,x)=>s+x.amount,0);
    const incomingForecast=forecastAccount.filter(x=>x.transactionType==='income').reduce((s,x)=>s+x.amount,0);
    const balance=incomingActual+incomingForecast-outgoingActual-outgoingForecast;
    const forecastNet=incomingForecast-outgoingForecast;
    return`<article class="state-account-card"><span>● ${esc(a.name)} · saldo mese</span><strong>${balance>=0?'+ ':''}${eur.format(balance)}</strong><div class="mini-progress"><i style="width:${Math.min((outgoingActual+outgoingForecast)/Math.max(state.budget||outgoingActual+outgoingForecast,1)*100,100)}%"></i></div>${forecastNet?`<span>${forecastNet>=0?'+ ':''}${eur.format(forecastNet)} previsti</span>`:''}</article>`;
  }).join('');
};
render();
