const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ CONFIGURATION SÉCURISÉE
// ==========================================
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const OPA_SESSION_VALUE = process.env.OPA_SESSION; 
const URL_DU_JEU = 'https://grand-line-arena.vercel.app/';

const COOKIES = [{
    name: 'opa_session',
    value: OPA_SESSION_VALUE,
    domain: 'grand-line-arena.vercel.app',
    path: '/',
    httpOnly: true,
    secure: true
}];

// ==========================================
// 🛠️ FONCTIONS UTILITAIRES & ANTI-BAN
// ==========================================

// 1. Anti-Ban : Pause aléatoire (ex: attendreAleatoire(2000, 3000) attend entre 2s et 3s)
const attendreAleatoire = (min, max) => {
    const temps = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, temps));
};

// Envoi de texte simple sur Discord
async function notifierDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (err) { console.error("Erreur d'envoi Discord:", err); }
}

// 4. Envoi de texte + Capture d'écran sur Discord
async function notifierDiscordAvecImage(message, imageBuffer) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        formData.append('file', blob, 'capture.png');
        formData.append('payload_json', JSON.stringify({ content: message }));

        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });
    } catch (err) { console.error("Erreur d'envoi d'image Discord:", err); }
}

// ==========================================
// ⚔️ LOGIQUE DE COMBAT
// ==========================================
async function lancerCycleDeCombats() {
    console.log(`[${new Date().toLocaleTimeString()}] Lancement du cycle...`);
    
    // Variables pour le tableau de bord
    let victoires = 0;
    let defaites = 0;

    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setCookie(...COOKIES);
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        
        for (let i = 1; i <= 6; i++) {
            console.log(`Combat ${i}/6...`);

            // 2. Attente Intelligente : On attend maximum 10s que le bouton apparaisse
            await page.waitForFunction(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                return boutons.some(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
            }, { timeout: 10000 }).catch(() => console.log("Bouton de combat non trouvé, on tente quand même..."));

            // Pause humaine avant de cliquer
            await attendreAleatoire(800, 1500);

            // Clic sur Combattre / Rejouer
            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            // Attente de l'écran de transition ("Découdre")
            await attendreAleatoire(2000, 2500);
            
            // Clic au centre de l'écran
            await page.mouse.click(640, 360);
            
            // Attente pendant que le combat se déroule (entre 5.5s et 7s)
            await attendreAleatoire(5500, 7000); 

            // 3. Reporting : Le bot lit l'écran pour deviner le résultat
            const texteEcran = await page.evaluate(() => document.body.innerText.toLowerCase());
            if (texteEcran.includes('victoire')) {
                victoires++;
            } else if (texteEcran.includes('défaite') || texteEcran.includes('defaite')) {
                defaites++;
            }
        }
        
        // 4. Capture d'écran de la situation finale
        const capture = await page.screenshot();
        
        // Génération du rapport complet
        const rapport = `✅ **Cycle terminé !**\n⚔️ Combats menés : 6\n🏆 Victoires : ${victoires}\n💀 Défaites : ${defaites}\n\n*(L'image ci-jointe montre l'état du jeu à la fin du cycle)*\n⏳ Prochain réveil dans 2 heures.`;
        
        await notifierDiscordAvecImage(rapport, capture);
        
    } catch (error) {
        console.error("Erreur pendant le cycle:", error);
        
        // Système de secours : S'il y a un bug, on prend l'écran en photo pour comprendre pourquoi
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                const captureErreur = await pages[0].screenshot();
                await notifierDiscordAvecImage(`⚠️ **Le bot a planté !**\nMessage d'erreur : \`${error.message}\`\nVoici à quoi ressemblait l'écran au moment du crash :`, captureErreur);
            } else {
                await notifierDiscord("⚠️ **Erreur critique :** Le bot a planté et n'a pas pu prendre de photo.");
            }
        } catch (e) {
            await notifierDiscord("⚠️ **Erreur très critique.**");
        }
    } finally {
        await browser.close();
    }
}

lancerCycleDeCombats();
