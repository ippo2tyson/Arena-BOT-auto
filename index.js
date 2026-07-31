const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ CONFIGURATION SÉCURISÉE (Via GitHub Secrets)
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
// 🛠️ FONCTIONS UTILITAIRES
// ==========================================
async function notifierDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (err) {
        console.error("Erreur d'envoi Discord:", err);
    }
}

const attendre = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// ⚔️ LOGIQUE DE COMBAT
// ==========================================
async function lancerCycleDeCombats() {
    console.log(`[${new Date().toLocaleTimeString()}] Lancement du cycle...`);
    await notifierDiscord("⚔️ **Nouveau cycle :** Lancement de 6 combats depuis GitHub Actions.");
    
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        await page.setCookie(...COOKIES);
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        
        for (let i = 1; i <= 6; i++) {
            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            await attendre(2000);
            await page.mouse.click(640, 360);
            
            console.log(`Combat ${i}/6 effectué.`);
            await attendre(5000); 
        }
        
        await notifierDiscord("✅ **Cycle terminé :** 6 combats validés. À dans 2 heures !");
        
    } catch (error) {
        console.error("Erreur pendant le cycle:", error);
        await notifierDiscord("⚠️ **Erreur :** Le bot a rencontré un problème.");
    } finally {
        await browser.close();
    }
}

// Lancement immédiat (pas de setInterval)
lancerCycleDeCombats();