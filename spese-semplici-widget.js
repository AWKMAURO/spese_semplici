// Spese Semplici Widget per Scriptable
// Salva questo script con il nome esatto: Spese Semplici Widget

const FILE_NAME='spese-semplici-widget.json';
const EXPECTED_SOURCE='spese-semplici-v1';
const fileManager=FileManager.local();
const dataPath=fileManager.joinPath(fileManager.documentsDirectory(),FILE_NAME);

function validAmount(value){return Number.isSafeInteger(value)&&value>=0}
function validSnapshot(value){
  if(!value||value.schema!==1||value.sourceKey!==EXPECTED_SOURCE)return false;
  if(!/^\d{4}-\d{2}$/.test(value.month||''))return false;
  const amounts=[value.budget?.limit,value.budget?.spent,value.budget?.forecast,value.cashflow?.income,value.cashflow?.incomeForecast,value.cashflow?.outgoing,value.cashflow?.outgoingForecast];
  return amounts.every(validAmount);
}

function decodeIncoming(value){
  if(!value)return null;
  try{return JSON.parse(value)}catch{}
  try{return JSON.parse(decodeURIComponent(value))}catch{}
  return null;
}

const incoming=decodeIncoming(args.queryParameters?.data);
if(incoming&&validSnapshot(incoming))fileManager.writeString(dataPath,JSON.stringify(incoming));

let data=null;
if(fileManager.fileExists(dataPath)){
  try{data=JSON.parse(fileManager.readString(dataPath));if(!validSnapshot(data))data=null}catch{data=null}
}

const widget=new ListWidget();
widget.setPadding(16,16,14,16);
const gradient=new LinearGradient();
gradient.colors=[new Color('#17352c'),new Color('#21483c')];
gradient.locations=[0,1];
widget.backgroundGradient=gradient;

function addText(container,value,size,color,weight='regular'){
  const text=container.addText(String(value));
  text.font=weight==='bold'?Font.boldSystemFont(size):weight==='semibold'?Font.semiboldSystemFont(size):Font.systemFont(size);
  text.textColor=new Color(color);
  text.minimumScaleFactor=.7;
  text.lineLimit=1;
  return text;
}

function money(cents,showPlus=false){
  const value=Number(cents||0)/100;
  const formatted=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Math.abs(value));
  if(value<0)return`− ${formatted}`;
  return showPlus&&value>0?`+ ${formatted}`:formatted;
}

function currentMonthKey(){
  const now=new Date();
  return`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

if(!data){
  addText(widget,'SPESE SEMPLICI',11,'#bdd0c8','semibold');
  widget.addSpacer(12);
  addText(widget,'Widget non sincronizzato',20,'#ffffff','bold');
  widget.addSpacer(7);
  const note=widget.addText('Apri l’app e usa Impostazioni → Sincronizza widget.');
  note.font=Font.systemFont(12);note.textColor=new Color('#d9e6e1');note.lineLimit=3;
}else{
  const budgetUsed=data.budget.spent+data.budget.forecast;
  const budgetRemaining=data.budget.limit-budgetUsed;
  const income=data.cashflow.income+data.cashflow.incomeForecast;
  const outgoing=data.cashflow.outgoing+data.cashflow.outgoingForecast;
  const balance=income-outgoing;
  const percent=data.budget.limit?Math.round(budgetUsed/data.budget.limit*100):0;
  const stale=data.month!==currentMonthKey();
  const header=widget.addStack();header.layoutHorizontally();
  addText(header,'SPESE SEMPLICI',10,'#bdd0c8','semibold');
  header.addSpacer();
  addText(header,stale?'DA AGGIORNARE':data.monthLabel.toUpperCase(),9,stale?'#f0bd67':'#bdd0c8','semibold');
  widget.addSpacer(9);
  if(data.budget.limit>0){
    addText(widget,budgetRemaining>=0?'BUDGET RIMASTO':'BUDGET SUPERATO',10,'#d9e6e1','semibold');
    addText(widget,money(Math.abs(budgetRemaining)),config.widgetFamily==='small'?27:30,budgetRemaining>=0?'#ffffff':'#ffb09f','bold');
  }else{
    addText(widget,'SALDO DEL MESE',10,'#d9e6e1','semibold');
    addText(widget,money(balance,true),config.widgetFamily==='small'?27:30,balance>=0?'#c9f3df':'#ffb09f','bold');
  }
  widget.addSpacer();
  if(config.widgetFamily==='medium'||config.widgetFamily==='large'||config.widgetFamily==='extraLarge'){
    const metrics=widget.addStack();metrics.layoutHorizontally();
    const incomeBox=metrics.addStack();incomeBox.layoutVertically();
    addText(incomeBox,'ENTRATE',9,'#bdd0c8','semibold');addText(incomeBox,money(income),15,'#c9f3df','bold');
    metrics.addSpacer(24);
    const outgoingBox=metrics.addStack();outgoingBox.layoutVertically();
    addText(outgoingBox,'USCITE EFFETTIVE',9,'#bdd0c8','semibold');addText(outgoingBox,money(outgoing),15,'#ffffff','bold');
    metrics.addSpacer();
    const balanceBox=metrics.addStack();balanceBox.layoutVertically();
    addText(balanceBox,'SALDO',9,'#bdd0c8','semibold');addText(balanceBox,money(balance,true),15,balance>=0?'#c9f3df':'#ffb09f','bold');
  }else{
    const summary=data.budget.limit>0?`${percent}% usato · Saldo ${money(balance,true)}`:`Entrate ${money(income)} · Uscite ${money(outgoing)}`;
    addText(widget,summary,10,'#d9e6e1','semibold');
  }
  widget.addSpacer(7);
  const updated=new Date(data.generatedAt);
  const updatedText=Number.isNaN(updated.getTime())?'Ultimo invio non disponibile':`Agg. ${new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(updated)}`;
  addText(widget,updatedText,9,'#9fb8ae');
}

Script.setWidget(widget);
if(!config.runsInWidget){
  if(config.widgetFamily==='small')await widget.presentSmall();
  else await widget.presentMedium();
}
Script.complete();

