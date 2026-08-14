const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ CONFIGURATION DE BASE
// ==========================================
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const OPA_SESSION_1 = process.env.OPA_SESSION;     // Cookie Compte 1
const OPA_SESSION_2 = process.env.OPA_SESSION_2;   // Cookie Compte 2
const URL_DU_JEU = 'https://grand-line-arena.vercel.app/';

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
async function lancerCycle(cookieValue, nomCompte, avecCapture) {
    console.log(`\n🚀 Démarrage du bot pour le ${nomCompte}...`);

    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'] 
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        
        await page.setCookie({
            name: 'opa_session',
            value: cookieValue,
            domain: 'grand-line-arena.vercel.app',
            path: '/',
            httpOnly: true,
            secure: true
        });
        
        // 1. Connexion au jeu
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        await attendreAleatoire(3000, 4000);

        // 2. Lecture de l'énergie
        const energieAffichee = await page.evaluate(() => {
            const match = document.body.innerText.match(/(\d+)\s*\/\s*10/);
            return match ? match[1] : "?";
        });
        console.log(`[${nomCompte}] Énergie lue au démarrage : ${energieAffichee}/10`);

        // 3. Boucle de 6 combats avec rafraîchissement rapide
        for (let i = 1; i <= 6; i++) {
            console.log(`[${nomCompte}] Tentative de combat ${i}/6...`);
            await attendreAleatoire(1500, 2000);

            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            console.log(`[${nomCompte}] Attente serveur de 5 secondes...`);
            await attendre(5000);
            
            console.log(`[${nomCompte}] Rafraîchissement (F5)...`);
            await page.reload({ waitUntil: 'networkidle2' });
            await attendreAleatoire(3000, 4000); 
        }
        
        // 4. Capture d'écran (Uniquement pour le compte configuré avec 'true')
        if (avecCapture) {
            console.log(`[${nomCompte}] Navigation vers le Classement...`);
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const onglet = elements.find(el => el.textContent.trim().toUpperCase() === 'CLASSEMENT' && el.children.length === 0);
                if (onglet) {
                    onglet.click();
                    if (onglet.parentElement) onglet.parentElement.click();
                }
            });
            
            await attendreAleatoire(4000, 5000);
            const capture = await page.screenshot();
            const message = `✅ **Cycle terminé pour le ${nomCompte} !**\n⚡ Énergie au lancement : **${energieAffichee}/10**\n\n*(Capture du Classement)*`;
            await notifierDiscordAvecImage(message, capture);
        } else {
            console.log(`[${nomCompte}] Mode silencieux activé (pas de notification Discord).`);
        }
        
        console.log(`✅ Mission terminée pour le ${nomCompte}.`);
        
    } catch (error) {
        console.error(`Crash sur le ${nomCompte} :`, error);
        await notifierDiscord(`⚠️ **Erreur sur le ${nomCompte}** : ${error.message}`);
    } finally {
        await browser.close();
    }
}

// ==========================================
// 🚀 LANCEUR PRINCIPAL
// ==========================================
async function executerTousLesComptes() {
    console.log("=== Initialisation du cycle ===");

    // 🎲 DÉLAI ALÉATOIRE ANTI-DÉTECTION (Entre 0 et 420 secondes = 0 à 7 minutes)
    const secondesAleatoires = Math.floor(Math.random() * 421);
    const minutes = Math.floor(secondesAleatoires / 60);
    const secondes = secondesAleatoires % 60;
    
    console.log(`⏳ Temporisation aléatoire : pause de ${minutes} min ${secondes} s avant exécution...`);
    await attendre(secondesAleatoires * 1000);

    // 1. Exécution Compte 1 (Avec capture d'écran sur Discord)
    if (OPA_SESSION_1) {
        await lancerCycle(OPA_SESSION_1, "Compte 1", true);
    } else {
        console.log("❌ Variable OPA_SESSION manquante.");
    }

    // 2. Exécution Compte 2 (Mode silencieux)
    if (OPA_SESSION_2) {
        console.log("\n⏳ Pause de 5 secondes avant le Compte 2...");
        await attendre(5000);
        await lancerCycle(OPA_SESSION_2, "Compte 2", false);
    }
}

executerTousLesComptes();
