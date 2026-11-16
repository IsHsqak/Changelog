# Changelogg

Ändringslogg för PLC-ändringar i maskiner. Webbapp som körs i webbläsaren (Microsoft Edge eller Chrome på PC) och sparar all data som filer i en delad mapp i ett SharePoint-bibliotek, synkat med OneDrive. Inga data lämnar Microsoft 365 och appen gör inga externa anrop.

> **Det här repot ska bara innehålla kod.** Lägg aldrig in ändringsdata, bilder, säkerhetskopior eller zip-filer med data här. Repot är offentligt på GitHub, så gör det helst privat. Mappen `Data/` är ignorerad i `.gitignore`.

## Funktioner

Menyn har tre huvudknappar med undermenyer:

- **Ändringar**
  - **Ändringslogg:** lista med uppföljningschips (Öppna, Väntar på godkännande, Q ej synkad, Säkerhet/kvalité), sök och filter, export till CSV. Klick på en rad öppnar en skrivskyddad sida med all information, bilder och historik, med knapp för att redigera.
  - **Ny / Redigera:** formulär med avsnitt 1–6 (allmän information, påverkade komponenter, beskrivning med bilder, risk, backup, godkännande) och en översiktsrad som visas i listan. Initialerna fylls i av namnet, och fabrik, maskin och PLC-plattform fylls i när du väljer process.
  - **Tech Foundation:** loggbok med en rubrik per datum, sök och import av text.
- **Felsökning**
  - **Felsökningslogg:** lista med chips per status, sök, filter och export till CSV.
  - **Ny felsökning:** formulär vars fält bestäms under Inställningar. Skrivskyddad visning och historik som för ändringar.
- **Inställningar**
  - **Processer:** gemensam processlista (fabrik, maskin, PLC-plattform), fält i Felsökning, backupmapp och säkerhetskopiering.
  - **Importera:** klistra in den gamla översiktstabellen från OneNote.

Varje sparning loggas med vem och vad. En säkerhetskopia av allt skapas automatiskt en gång per dag.

## Krav

- Microsoft Edge eller Chrome på en PC (stöd för File System Access API krävs, alltså inte Firefox eller Safari).
- Ett SharePoint-bibliotek som alla användare har skrivrättighet i och synkar med OneDrive.
- IT får inte blockera filåtkomst i webbläsaren (till exempel via policyerna `DefaultFileSystemWriteGuardSetting` eller `FileSystemWriteBlockedForUrls`).

## Uppsättning

1. Skapa SharePoint-biblioteket och två mappar i det: `App` och `Data`.
2. Kopiera `index.html`, `css/` och `js/` från det här repot till `App`.
3. Valfritt: packa upp `Andringslogg-data.zip` (migrerad data) i `Data`, så att mappen innehåller `changes`, `processes`, `techlog`, `felsokning`, `settings`, `images` och `backup`. En tom `Data`-mapp fungerar också, då skapas strukturen automatiskt.
4. Alla i teamet synkar biblioteket med OneDrive (knappen Synkronisera i biblioteket).
5. Öppna `App/index.html` i den synkade mappen med Edge (dubbelklicka eller öppna som `file:///…`).
6. Tryck **Välj datamapp**, peka ut `Data`-mappen och tillåt att webbläsaren ändrar filerna. Mappen kommer ihåg valet. Webbläsaren kan be om tillåtelse igen vid nästa besök, då trycker du Fortsätt.
7. Första gången: fyll i ditt fullständiga namn i en ny ändring. Initialerna fylls i automatiskt (första bokstaven i varje namn). Namnet sparas i den webbläsaren och används som ansvarig och i historiken.

Går det inte att öppna appen från en lokal fil kan `index.html`, `css/` och `js/` i stället läggas på en intern webbserver över https. Appen innehåller inga data.

## Datamapp

```
Data/
  changes/     en JSON-fil per ändring (001.json, 002.json, …) inklusive historik
  processes/   en JSON-fil per process
  techlog/     en JSON-fil per loggboksanteckning
  felsokning/  en JSON-fil per felsökning (F001.json, …) inklusive historik
  settings/    app.json (gemensamma inställningar, till exempel backupmapp)
  images/      bilder
  backup/      säkerhetskopior (backup-ÅÅÅÅ-MM-DD-HHMM.json)
  _andringslogg.json
```

## Samtidig användning

Filerna delas via OneDrive, så två personer som sparar exakt samma ändring samtidigt kan skriva över varandra. Därför:

- Varje ändring ligger i en egen fil, så konflikter uppstår bara om samma ändring redigeras samtidigt.
- Innan en ändring sparas kontrollerar appen att filen inte har ändrats av någon annan. Då visas ett meddelande i stället för att skriva över.
- Nya ändrings-ID kontrolleras efter sparande. Skulle två personer få samma nummer väljer den som sparade sist nästa lediga.
- Om OneDrive ändå skapar en konfliktkopia (till exempel `048-DATORNAMN.json`) visas den överst på fliken Ändringar. Där kan du lägga till den som ny ändring eller ta bort den.
- Appen läser om mappen var tionde sekund och när fönstret får fokus. Det kan ta en stund innan OneDrive hunnit synka andras ändringar.

## Säkerhetskopior

- SharePoint sparar versionshistorik och har en papperskorg för alla filer.
- Appen skapar `backup/backup-….json` en gång per dag, och när du trycker Skapa säkerhetskopia nu under Processer. Gamla kopior tas inte bort automatiskt.

## Utveckling

Appen är vanlig HTML, CSS och JavaScript utan byggsteg och utan externa bibliotek eller teckensnitt.

```
index.html
css/app.css
js/storage.js   lagring i vald mapp (File System Access API), polling och säkerhetskopia
js/app.js       gränssnitt och logik
```

Kör lokalt med en enkel webbserver, till exempel `python3 -m http.server`, och öppna `http://localhost:8000`.
