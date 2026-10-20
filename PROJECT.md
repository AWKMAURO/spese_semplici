# Spese Semplici

Versione progetto: **1.3.0**  
Stato: **in produzione**

Spese Semplici è una PWA personale per iPhone, utilizzabile offline e senza database esterno. Il codice è pubblicato tramite GitHub Pages; movimenti, conti e budget rimangono nel browser del dispositivo.

## Funzioni

- Entrate e uscite
- Conti e contanti
- Carte di credito con plafond, chiusura mensile e addebito cumulativo sul conto collegato
- Budget derivato dalla somma dei budget delle categorie
- Categorie personalizzabili
- Spese ed entrate ricorrenti con data finale
- Previsioni nei mesi futuri
- Riepilogo mensile di entrate, uscite e saldo
- Esportazione e importazione del backup JSON
- Installazione sulla schermata Home e funzionamento offline
- Widget iPhone tramite Scriptable, con riepilogo locale di budget, entrate, uscite e saldo
- Saldo di partenza manuale per ogni conto, aggiornato dai movimenti registrati successivamente
- Saldo di partenza positivo o negativo tramite selettore ottimizzato per iPhone
- Situazione iniziale delle carte di credito inclusa nel plafond e nel successivo addebito cumulativo
- Rettifica **Saldo** datata, positiva, negativa o pari a zero, separata da entrate e uscite
- **Giroconto Carta → Contanti**, incluso nel plafond e nell’addebito della carta ma escluso dai budget

## Produzione

- Repository: https://github.com/AWKMAURO/spese_semplici
- Applicazione: https://awkmauro.github.io/spese_semplici/
- Branch pubblicato: `main`, cartella `/ (root)`

## Archiviazione dati

I dati sono conservati in `localStorage` con la chiave `spese-semplici-v1`. Gli aggiornamenti mantengono la stessa chiave per preservare i dati esistenti.

Nessun movimento finanziario viene inviato a GitHub. Il repository contiene esclusivamente il codice dell'applicazione.

## Backup

Usare periodicamente **Impostazioni → Esporta dati**. Il file JSON esportato contiene conti, carte, categorie, budget, movimenti e ricorrenze.

Per ripristinare: **Impostazioni → Importa dati** e selezionare il backup.

## Aggiornamento su iPhone

1. Aprire l'indirizzo dell'app in Safari.
2. Ricaricare la pagina.
3. Chiudere completamente la PWA.
4. Riaprirla dalla schermata Home.

Non è necessario reinstallare l'app.

## Architettura attuale

- `index.html`: pagina pubblicata
- `styles.css`, `v3.css` … `v9-budget-summary.css`: stili progressivi
- `v3.js` … `v10-category-budget-total.js`: logica applicativa e migrazioni progressive
- `v13-widget.js`, `v13-widget.css`: collegamento e guida del widget iPhone
- `v14-balances.js`, `v14-balances.css`: saldi di partenza per conti e carte
- `v15-ledger.js`, `v15-ledger.css`: rettifiche saldo e giroconti dalla carta ai contanti
- `spese-semplici-widget.js`: script da copiare nell’app Scriptable
- `manifest.webmanifest`: configurazione PWA
- `sw.js`: cache offline e aggiornamento versione
- `icon.svg`: icona dell'app

I moduli progressivi vengono caricati in ordine e rappresentano la cronologia evolutiva del prototipo. Prima di una futura fase di manutenzione estesa potranno essere consolidati in un unico bundle, mantenendo invariato il formato dei dati.

Il widget riceve soltanto totali mensili aggregati tramite un collegamento locale verso Scriptable. Non riceve note, movimenti, categorie o nomi dei conti. La sincronizzazione è manuale e non modifica la chiave `spese-semplici-v1`.

## Regole contabili principali

- Le entrate aumentano il saldo del mese.
- Le uscite da conto o contanti entrano immediatamente nelle uscite effettive.
- Gli acquisti con carta consumano plafond e budget di categoria ma non le uscite effettive.
- Il saldo iniziale di un conto non è un movimento e non modifica entrate, uscite o budget.
- Lo speso iniziale di una carta consuma il plafond e viene incluso nell'addebito successivo, ma non modifica i budget delle categorie.
- Una rettifica saldo imposta il valore reale del conto a una data precisa e non è né un'entrata né un'uscita.
- Un giroconto dalla carta ai contanti aumenta la disponibilità del conto/contanti di destinazione, consuma il plafond e confluisce nell'addebito successivo; non modifica entrate, uscite o budget.
- L'estratto della carta chiude a fine mese.
- Il mese seguente viene creato un unico addebito sul conto collegato.
- L'addebito cumulativo non viene conteggiato nuovamente nei budget.
- Le previsioni ricorrenti diventano movimenti effettivi alla data prevista.

