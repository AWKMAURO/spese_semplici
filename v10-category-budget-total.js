function categoryBudgetSnapshot(){
  const budgetedIds=new Set(state.categories.filter(c=>!c.incomeOnly&&Number(state.categoryBudgets[c.id])>0).map(c=>c.id));
  const total=[...budgetedIds].reduce((sum,id)=>sum+Number(state.categoryBudgets[id]||0),0);
  const actual=state.expenses.filter(x=>inView(x.date)&&x.kind!=='credit_statement'&&x.transactionType!=='income'&&budgetedIds.has(x.category)).reduce((sum,x)=>sum+x.amount,0);
  const forecast=projectedForView().filter(x=>x.transactionType!=='income'&&budgetedIds.has(x.category)).reduce((sum,x)=>sum+x.amount,0);
  return{total,actual,forecast,used:actual+forecast,remaining:total-actual-forecast};
}
renderMonthlyBudgetHero=function(){
  const b=categoryBudgetSnapshot(),pct=b.total?Math.round(b.used/b.total*100):0,status=pct>100?'over':pct>=80?'warning':'';
  monthlyBudgetHero.classList.toggle('over',b.remaining<0);
  if(!b.total){monthlyBudgetHero.innerHTML='<span>BUDGET DELLE CATEGORIE</span><strong>Non impostato</strong><p class="cashflow-note">Assegna un budget alle categorie per vedere qui il totale disponibile.</p><button id="setCategoryBudgets">Gestisci categorie</button>';$('setCategoryBudgets').onclick=()=>setPage('categories');return}
  monthlyBudgetHero.innerHTML=`<span>${b.remaining>=0?'BUDGET CATEGORIE RIMASTO':'BUDGET CATEGORIE SUPERATO'}</span><strong>${eur.format(Math.abs(b.remaining))}</strong><div class="budget-meta"><span>Speso ${eur.format(b.actual)}${b.forecast?` · previsto ${eur.format(b.forecast)}`:''}</span><span>${pct}% di ${eur.format(b.total)}</span></div><div class="budget-track"><div class="budget-fill ${status}" style="width:${Math.min(pct,100)}%"></div></div>`;
};
function renderCategoryBudgetSummary(){
  const b=categoryBudgetSnapshot(),pct=b.total?Math.round(b.used/b.total*100):0;
  $('budgetText').textContent=b.total?`${eur.format(Math.max(b.remaining,0))} disponibili nei budget delle categorie`:'Imposta i budget nelle categorie';
  $('budgetPercent').textContent=b.total?`${pct}%`:'';
  $('budgetProgress').style.width=`${Math.min(pct,100)}%`;
  $('budgetProgress').style.background=pct>100?'#ff7a72':'';
}
const overallBudgetField=$('budget')?.closest('.text-field');if(overallBudgetField)overallBudgetField.classList.add('hidden');
const overallBudgetSave=$('settingsForm')?.querySelector('.primary-button[value="save"]');if(overallBudgetSave)overallBudgetSave.classList.add('hidden');
const v9RenderCategoryTotal=render;render=function(){v9RenderCategoryTotal();renderCategoryBudgetSummary()};render();
