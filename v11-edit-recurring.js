const v10EditRecurring=editExpense;
editExpense=function(id){
  const tx=state.expenses.find(x=>x.id===id);
  v10EditRecurring(id);
  const rule=tx?.recurringId?state.recurring.find(r=>r.id===tx.recurringId):null;
  $('isRecurring').checked=Boolean(rule);
  $('frequencyField').classList.toggle('hidden',!rule);
  $('recurringEndField').classList.toggle('hidden',!rule);
  if(rule){$('frequency').value=rule.frequency;$('recurringEndDate').value=rule.endDate||''}
};

const v10SubmitRecurring=$('expenseForm').onsubmit;
$('expenseForm').onsubmit=function(event){
  const editingId=$('expenseId').value;
  const wantsRecurring=$('isRecurring').checked;
  const frequency=$('frequency').value;
  const endDate=$('recurringEndDate').value||null;
  const transactionKind=transactionType;
  const original=editingId?state.expenses.find(x=>x.id===editingId):null;
  const existingRule=original?.recurringId?state.recurring.find(r=>r.id===original.recurringId):null;
  v10SubmitRecurring(event);
  if(!editingId)return;
  const tx=state.expenses.find(x=>x.id===editingId);
  if(!tx)return;
  if(wantsRecurring){
    if(endDate&&endDate<tx.date)return;
    if(existingRule){
      Object.assign(existingRule,{amount:tx.amount,category:tx.category,accountId:tx.accountId,note:tx.note,frequency,endDate,transactionType:transactionKind,active:true});
      if(existingRule.nextDate<=tx.date)existingRule.nextDate=advance(tx.date,frequency);
      tx.recurringId=existingRule.id;
    }else{
      const rule={id:uid(),amount:tx.amount,category:tx.category,accountId:tx.accountId,note:tx.note,frequency,nextDate:advance(tx.date,frequency),endDate,transactionType:transactionKind,active:true};
      state.recurring.push(rule);tx.recurringId=rule.id;
    }
  }else if(existingRule){
    existingRule.active=false;
    delete tx.recurringId;
  }
  persistOnly();syncStatements();render();
};
render();
