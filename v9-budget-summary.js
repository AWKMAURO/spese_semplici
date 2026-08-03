const monthlyBudgetHero=document.createElement('section');monthlyBudgetHero.className='monthly-budget-hero';monthlyBudgetHero.id='monthlyBudgetHero';budgetPage.insertBefore(monthlyBudgetHero,budgetSection);
function renderMonthlyBudgetHero(){
  const actual=state.expenses.filter(x=>inView(x.date)&&x.kind!=='credit_statement'&&x.transactionType!=='income').reduce((s,x)=>s+x.amount,0);
  const forecast=projectedForView().filter(x=>x.transactionType!=='income').reduce((s,x)=>s+x.amount,0);
  const used=actual+forecast,budget=Number(state.budget)||0,remaining=budget-used,pct=budget?Math.round(used/budget*100):0,status=pct>100?'over':pct>=80?'warning':'';
  monthlyBudgetHero.classList.toggle('over',remaining<0);
  if(!budget){monthlyBudgetHero.innerHTML='<span>BUDGET MENSILE</span><strong>Non impostato</strong><p class="cashflow-note">Imposta un budget complessivo per vedere quanto rimane ogni mese.</p><button id="setMonthlyBudget">Imposta budget</button>';$('setMonthlyBudget').onclick=()=>{$('budget').value='';$('settingsDialog').showModal()};return}
  monthlyBudgetHero.innerHTML=`<span>${remaining>=0?'BUDGET MENSILE RIMASTO':'BUDGET MENSILE SUPERATO'}</span><strong>${eur.format(Math.abs(remaining))}</strong><div class="budget-meta"><span>Speso ${eur.format(actual)}${forecast?` · previsto ${eur.format(forecast)}`:''}</span><span>${pct}% di ${eur.format(budget)}</span></div><div class="budget-track"><div class="budget-fill ${status}" style="width:${Math.min(pct,100)}%"></div></div>`;
}
const v8RenderBudget=render;render=function(){v8RenderBudget();renderMonthlyBudgetHero()};render();
