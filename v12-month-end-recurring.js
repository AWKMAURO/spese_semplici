function addMonthClamped(date,anchorDay){
  const d=new Date(date+'T12:00:00'),targetMonth=d.getMonth()+1,targetYear=d.getFullYear()+Math.floor(targetMonth/12),month=((targetMonth%12)+12)%12,last=new Date(targetYear,month+1,0,12).getDate();
  return iso(new Date(targetYear,month,Math.min(anchorDay,last),12));
}
function recurrenceAdvance(rule,date){
  if(rule.frequency==='monthly')return addMonthClamped(date,rule.anchorDay||new Date(date+'T12:00:00').getDate());
  if(rule.frequency==='yearly'){
    const d=new Date(date+'T12:00:00'),month=d.getMonth(),day=rule.anchorDay||d.getDate(),year=d.getFullYear()+1,last=new Date(year,month+1,0,12).getDate();
    return iso(new Date(year,month,Math.min(day,last),12));
  }
  return advance(date,rule.frequency);
}
function repairRecurrenceAnchors(){
  for(const rule of state.recurring){
    const linked=state.expenses.filter(x=>x.recurringId===rule.id&&x.kind!=='credit_statement').sort((a,b)=>a.date.localeCompare(b.date));
    const source=linked[0];
    if(!rule.anchorDay)rule.anchorDay=source?new Date(source.date+'T12:00:00').getDate():new Date(rule.nextDate+'T12:00:00').getDate();
    if(rule.frequency==='monthly'&&source){
      const latest=linked.at(-1),expected=addMonthClamped(latest.date,rule.anchorDay);
      if(!rule.endDate||expected<=rule.endDate){
        const hasExpected=linked.some(x=>x.date===expected);
        if(!hasExpected&&expected<rule.nextDate)rule.nextDate=expected;
      }
    }
  }
}
recurrenceOccurrences=function(rule,start,end){
  if(!rule.active)return[];
  const dates=[];let date=rule.nextDate,guard=0;
  while(date<start&&guard++<600)date=recurrenceAdvance(rule,date);
  while(date<=end&&(!rule.endDate||date<=rule.endDate)&&guard++<700){dates.push(date);date=recurrenceAdvance(rule,date)}
  return dates;
};
processRecurring=function(){
  let changed=false;
  for(const rule of state.recurring.filter(x=>x.active)){
    let guard=0;
    while(rule.nextDate<=today()&&(!rule.endDate||rule.nextDate<=rule.endDate)&&guard++<240){
      if(!state.expenses.some(x=>x.recurringId===rule.id&&x.date===rule.nextDate))state.expenses.push({id:uid(),amount:rule.amount,category:rule.category,accountId:rule.accountId,note:rule.note,date:rule.nextDate,createdAt:Date.now(),recurringId:rule.id,kind:'expense',transactionType:rule.transactionType||'expense'});
      rule.nextDate=recurrenceAdvance(rule,rule.nextDate);changed=true;
    }
  }
  cleanAfterEnd();if(changed)persistOnly();
};
const v11SubmitMonthEnd=$('expenseForm').onsubmit;
$('expenseForm').onsubmit=function(event){
  const editingId=$('expenseId').value,date=$('date').value,wantsRecurring=$('isRecurring').checked,before=new Set(state.recurring.map(r=>r.id));
  v11SubmitMonthEnd(event);
  if(wantsRecurring){
    const tx=editingId?state.expenses.find(x=>x.id===editingId):state.expenses.find(x=>x.date===date&&x.recurringId&&!before.has(x.recurringId));
    const rule=tx?.recurringId?state.recurring.find(r=>r.id===tx.recurringId):state.recurring.find(r=>!before.has(r.id));
    if(rule){rule.anchorDay=new Date(date+'T12:00:00').getDate();if(rule.frequency==='monthly')rule.nextDate=addMonthClamped(date,rule.anchorDay)}
  }
  repairRecurrenceAnchors();persistOnly();render();
};
repairRecurrenceAnchors();processRecurring();syncStatements();persistOnly();render();
