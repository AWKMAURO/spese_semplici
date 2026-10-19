const WIDGET_SCRIPT_NAME='Spese Semplici Widget';
const WIDGET_SYNC_KEY='spese-semplici-widget-last-send-v1';
const WIDGET_SCRIPT_FILE='./spese-semplici-widget.js';

function widgetCents(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.round(number*100):0;
}

function widgetMonthBounds(referenceDate=new Date()){
  const date=new Date(referenceDate);
  date.setHours(12,0,0,0);
  const start=new Date(date.getFullYear(),date.getMonth(),1,12);
  const end=new Date(date.getFullYear(),date.getMonth()+1,0,12);
  return{start:iso(start),end:iso(end),date:start,month:iso(start).slice(0,7)};
}

function widgetForecastForMonth(start,end){
  const forecast=[];
  for(const rule of state.recurring){
    for(const date of recurrenceOccurrences(rule,start,end)){
      if(state.expenses.some(item=>item.recurringId===rule.id&&item.date===date))continue;
      forecast.push({
        amount:Number(rule.amount)||0,
        category:rule.category,
        accountId:rule.accountId,
        date,
        kind:'expense',
        transactionType:rule.transactionType||'expense'
      });
    }
  }
  return forecast;
}

function buildWidgetSnapshot(referenceDate=new Date()){
  const bounds=widgetMonthBounds(referenceDate);
  const inMonth=item=>item.date>=bounds.start&&item.date<=bounds.end;
  const actual=state.expenses.filter(inMonth);
  const forecast=widgetForecastForMonth(bounds.start,bounds.end);
  const budgetedIds=new Set(state.categories
    .filter(category=>!category.incomeOnly&&Number(state.categoryBudgets[category.id])>0)
    .map(category=>category.id));
  const budgetLimit=[...budgetedIds].reduce((sum,id)=>sum+Number(state.categoryBudgets[id]||0),0);
  const budgetSpent=actual
    .filter(item=>item.kind!=='credit_statement'&&item.transactionType!=='income'&&budgetedIds.has(item.category))
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  const budgetForecast=forecast
    .filter(item=>item.transactionType!=='income'&&budgetedIds.has(item.category))
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  const income=actual
    .filter(item=>item.transactionType==='income')
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  const incomeForecast=forecast
    .filter(item=>item.transactionType==='income')
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  const outgoing=actual
    .filter(item=>item.transactionType!=='income'&&(item.kind==='credit_statement'||!isCredit(item.accountId)))
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  const outgoingForecast=forecast
    .filter(item=>item.transactionType!=='income'&&!isCredit(item.accountId))
    .reduce((sum,item)=>sum+Number(item.amount||0),0);
  return{
    schema:1,
    sourceKey:KEY,
    month:bounds.month,
    monthLabel:monthFmt.format(bounds.date),
    generatedAt:new Date().toISOString(),
    currency:'EUR',
    unit:'cent',
    budget:{
      limit:widgetCents(budgetLimit),
      spent:widgetCents(budgetSpent),
      forecast:widgetCents(budgetForecast)
    },
    cashflow:{
      income:widgetCents(income),
      incomeForecast:widgetCents(incomeForecast),
      outgoing:widgetCents(outgoing),
      outgoingForecast:widgetCents(outgoingForecast)
    }
  };
}

function widgetSnapshotSignature(snapshot){
  const comparable={...snapshot,generatedAt:''};
  return JSON.stringify(comparable);
}

function readWidgetLastSend(){
  try{return JSON.parse(localStorage.getItem(WIDGET_SYNC_KEY))||null}catch{return null}
}

function widgetStatusText(){
  const last=readWidgetLastSend();
  if(!last?.sentAt)return{state:'idle',text:'Non ancora inviato a Scriptable'};
  const date=new Date(last.sentAt);
  const when=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);
  const currentSignature=widgetSnapshotSignature(buildWidgetSnapshot());
  if(last.signature!==currentSignature)return{state:'stale',text:`Da sincronizzare · ultimo invio ${when}`};
  return{state:'ready',text:`Ultimo invio ${when}`};
}

function renderWidgetSyncStatus(){
  const label=$('widgetSyncStatus'),dot=document.querySelector('.widget-sync-dot');
  if(!label||!dot)return;
  const status=widgetStatusText();
  label.textContent=status.text;
  dot.classList.remove('ready','stale');
  if(status.state!=='idle')dot.classList.add(status.state);
}

function copyTextFallback(text){
  const area=document.createElement('textarea');
  area.value=text;
  area.setAttribute('readonly','');
  area.style.position='fixed';
  area.style.opacity='0';
  document.body.appendChild(area);
  area.select();
  const copied=document.execCommand('copy');
  area.remove();
  return copied;
}

async function copyWidgetScript(){
  const button=$('copyWidgetScript');
  try{
    const response=await fetch(WIDGET_SCRIPT_FILE);
    if(!response.ok)throw new Error('download');
    const source=await response.text();
    let copied=false;
    if(navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(source);copied=true}catch{}
    }
    if(!copied)copied=copyTextFallback(source);
    if(!copied)throw new Error('clipboard');
    button.textContent='Codice copiato ✓';
    setTimeout(()=>button.textContent='Copia codice Scriptable',2200);
  }catch{
    alert('Non sono riuscito a copiare il codice. Controlla la connessione e riprova.');
  }
}

function sendWidgetSnapshot(){
  const snapshot=buildWidgetSnapshot();
  const record={sentAt:snapshot.generatedAt,signature:widgetSnapshotSignature(snapshot)};
  localStorage.setItem(WIDGET_SYNC_KEY,JSON.stringify(record));
  renderWidgetSyncStatus();
  const payload=encodeURIComponent(JSON.stringify(snapshot));
  const script=encodeURIComponent(WIDGET_SCRIPT_NAME);
  window.location.href=`scriptable:///run/${script}?data=${payload}`;
}

const widgetSettings=document.createElement('section');
widgetSettings.className='settings-section widget-settings';
widgetSettings.innerHTML=`
  <p class="eyebrow">WIDGET IPHONE</p>
  <div class="widget-sync-state">
    <span class="widget-sync-dot" aria-hidden="true"></span>
    <div><strong>Riepilogo del mese</strong><small id="widgetSyncStatus">Non ancora inviato a Scriptable</small></div>
  </div>
  <button type="button" class="widget-sync-button" id="syncWidget">↻ Sincronizza widget</button>
  <button type="button" class="settings-link widget-help-button" id="openWidgetHelp">Come installarlo</button>
  <p class="privacy-note">Con Scriptable vengono condivisi solo i totali del mese. Movimenti, note e nomi dei conti restano nell’app.</p>`;
document.querySelector('#settingsDialog .dialog-actions').before(widgetSettings);

const widgetHelpDialog=document.createElement('dialog');
widgetHelpDialog.id='widgetHelpDialog';
widgetHelpDialog.innerHTML=`<div class="dialog-card scrollable widget-help-card">
  <div class="dialog-heading"><h2>Widget iPhone</h2><button type="button" class="icon-button" id="closeWidgetHelp" aria-label="Chiudi">×</button></div>
  <p class="widget-intro">La web app non può creare direttamente un widget iOS. Scriptable ci permette di farlo senza Mac e senza inviare i tuoi movimenti online.</p>
  <ol class="widget-steps">
    <li><a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noopener">Installa Scriptable</a> e aprilo almeno una volta.</li>
    <li>Tocca <strong>Copia codice Scriptable</strong>.</li>
    <li>In Scriptable premi <strong>+</strong>, incolla il codice e salva lo script esattamente come <strong>${WIDGET_SCRIPT_NAME}</strong>.</li>
    <li>Torna qui e premi <strong>Sincronizza widget</strong>.</li>
    <li>Sulla Home tieni premuto, premi <strong>+</strong>, scegli <strong>Scriptable</strong>, poi seleziona questo script.</li>
  </ol>
  <button type="button" class="primary-button" id="copyWidgetScript">Copia codice Scriptable</button>
  <button type="button" class="secondary-button" id="finishWidgetHelp">Ho finito</button>
  <p class="privacy-note">La sincronizzazione è manuale: ripetila dopo modifiche importanti. Il widget continua a mostrare l’ultimo riepilogo anche offline.</p>
</div>`;
document.body.appendChild(widgetHelpDialog);

$('syncWidget').onclick=sendWidgetSnapshot;
$('openWidgetHelp').onclick=()=>widgetHelpDialog.showModal();
$('closeWidgetHelp').onclick=()=>$('widgetHelpDialog').close();
$('finishWidgetHelp').onclick=()=>$('widgetHelpDialog').close();
$('copyWidgetScript').onclick=copyWidgetScript;

const v12RenderForWidget=render;
render=function(){v12RenderForWidget();renderWidgetSyncStatus()};
renderWidgetSyncStatus();

