const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ CONFIGURATION DE BASE
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
// 🛠️ FONCTIONS UTILITAIRES & DISCORD
// ==========================================
const attendre = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const attendreAleatoire = (min, max) => attendre(Math.floor(Math.random() * (max - min + 1)) + min);

async function notifierDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (err) { console.error("Erreur Discord:", err); }
}

async function notifierDiscordAvecImage(message, imageBuffer) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        formData.append('files[0]', blob, 'capture.png');
        formData.append('payload_json', JSON.stringify({ content: message }));

        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            await notifierDiscord(message + "\n\n*(L'image n'a pas pu être envoyée par Discord)*");
        }
    } catch (err) { 
        console.error("Erreur d'envoi d'image Discord:", err);
        await notifierDiscord(message + "\n\n*(Erreur critique lors de la génération de l'image)*");
    }
}

// ==========================================
// ⚔️ MISSION : 6 COMBATS + CLASSEMENT
// ==========================================
async function lancerCycleExpress() {
    console.log("Démarrage du bot (Mode F5 Rapide)...");

    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setCookie(...COOKIES);
        
        // 1. Aller sur le jeu et attendre le chargement initial
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        await attendreAleatoire(3000, 4000);

        // 2. Lire l'énergie affichée
        const energieAffichee = await page.evaluate(() => {
            const match = document.body.innerText.match(/(\d+)\s*\/\s*10/);
            return match ? match[1] : "?";
        });
        console.log(`Énergie lue au démarrage : ${energieAffichee}/10`);

        // 3. Lancer les 6 combats avec la technique du rafraîchissement
        for (let i = 1; i <= 6; i++) {
            console.log(`Tentative de combat ${i}/6...`);

            // Petite pause humaine avant de cliquer
            await attendreAleatoire(1500, 2000);

            // Clic sur "Combattre" ou "Rejouer"
            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            // ⚠️ ATTENTE STRICTE DE 5 SECONDES QUE L'ARÈNE SE LANCE SUR LE SERVEUR
            console.log("Attente de 5 secondes...");
            await attendre(5000);
            
            // 🔄 F5 POUR PASSER L'ANIMATION DE COMBAT
            console.log("Rafraîchissement (F5) pour skip l'animation !");
            await page.reload({ waitUntil: 'networkidle2' });
            
            // Laisse le temps à la page de se recharger correctement avant de recommencer
            await attendreAleatoire(3000, 4000); 
        }
        
        // 4. Navigation vers le Classement
        console.log("Navigation vers le Classement pour la capture d'écran...");
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            const onglet = elements.find(el => el.textContent.trim().toUpperCase() === 'CLASSEMENT' && el.children.length === 0);
            if (onglet) {
                onglet.click();
                if (onglet.parentElement) onglet.parentElement.click();
            }
        });
        
        // On attend pour que les avatars du classement s'affichent bien
        await attendreAleatoire(4000, 5000);

        // 5. Capture d'écran et envoi du message Discord
        const capture = await page.screenshot();
        const message = `✅ **Cycle terminé !**\nJ'ai exécuté ma routine de 6 combats (Skip F5).\n⚡ Énergie au lancement : **${energieAffichee}/10**\n\n*(La capture d'écran ci-jointe montre l'état du Classement)*`;
        
        await notifierDiscordAvecImage(message, capture);
        console.log("Mission accomplie.");
        
    } catch (error) {
        console.error("Crash inattendu :", error);
        await notifierDiscord(`⚠️ **Problème technique** : Le bot a crashé. Raison : ${error.message}`);
    } finally {
        await browser.close();
    }
}

lancerCycleExpress();
