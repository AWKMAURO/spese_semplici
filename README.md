# Spese Semplici

## Saldi di partenza

Da **Impostazioni → Conti e carte** è possibile inserire il saldo disponibile mostrato oggi per ogni conto. Il valore resta separato dai movimenti e diventa la base da cui l'app calcola il saldo stimato con le nuove entrate e uscite.

Per le carte di credito si inserisce invece il totale già speso nel ciclo corrente. Questo valore consuma il plafond e confluisce nell'addebito cumulativo del mese successivo, senza entrare nei budget delle categorie e senza ridurre subito il saldo del conto.

PWA locale per gestire le spese personali. Non usa server e conserva i dati nel `localStorage` del browser.

## Avvio locale

La PWA richiede un server HTTP locale (non aprire direttamente `index.html`). Per esempio:

```powershell
python -m http.server 8080 --directory C:\spese-semplici
```

Poi aprire `http://localhost:8080`.

## Installazione su iPhone

Per usarla su iPhone deve essere pubblicata su un indirizzo HTTPS. Aprire l'indirizzo in Safari, usare **Condividi** e scegliere **Aggiungi alla schermata Home**.

I dati sono locali al browser/dispositivo. Usare periodicamente **Impostazioni → Esporta dati** per creare un backup.

## Widget iPhone

Da **Impostazioni → Widget iPhone → Come installarlo** è possibile copiare lo script per Scriptable e aggiungere un widget piccolo o medio alla schermata Home. Il widget mostra soltanto totali mensili aggregati e si aggiorna manualmente con **Sincronizza widget**.
