const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ CONFIGURATION DE BASE
// ==========================================
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const OPA_SESSION_1 = process.env.OPA_SESSION;     // Cookie du Compte 1
const OPA_SESSION_2 = process.env.OPA_SESSION_2;   // Cookie du Compte 2
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
        
        // 1. Aller sur le jeu et attendre le chargement initial
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        await attendreAleatoire(3000, 4000);

        // 2. Lire l'énergie affichée
        const energieAffichee = await page.evaluate(() => {
            const match = document.body.innerText.match(/(\d+)\s*\/\s*10/);
            return match ? match[1] : "?";
        });
        console.log(`[${nomCompte}] Énergie lue au démarrage : ${energieAffichee}/10`);

        // 3. Lancer les 6 combats avec la technique du rafraîchissement
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
            
            console.log(`[${nomCompte}] Attente de 5 secondes...`);
            await attendre(5000);
            
            console.log(`[${nomCompte}] Rafraîchissement (F5) pour skip l'animation !`);
            await page.reload({ waitUntil: 'networkidle2' });
            await attendreAleatoire(3000, 4000); 
        }
        
        // 4. Gestion de la fin (Avec ou sans image)
        if (avecCapture) {
            console.log(`[${nomCompte}] Navigation vers le Classement pour la capture d'écran...`);
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
            const message = `✅ **Cycle terminé pour le ${nomCompte} !**\n⚡ Énergie au lancement : **${energieAffichee}/10**\n\n*(Voici l'état du Classement)*`;
            await notifierDiscordAvecImage(message, capture);
        } else {
            // Mode furtif : Aucune notification envoyée
            console.log(`[${nomCompte}] Fin des combats. Mode silencieux activé (aucun message Discord).`);
        }
        
        console.log(`✅ Mission accomplie pour le ${nomCompte}.`);
        
    } catch (error) {
        console.error(`Crash inattendu pour le ${nomCompte} :`, error);
        await notifierDiscord(`⚠️ **Problème technique sur le ${nomCompte}** : ${error.message}`);
    } finally {
        await browser.close();
    }
}

// ==========================================
// 🚀 LANCEUR PRINCIPAL
// ==========================================
async function executerTousLesComptes() {
    // Lancement du Compte 1 (Avec Capture sur Discord)
    if (OPA_SESSION_1) {
        await lancerCycle(OPA_SESSION_1, "Compte 1", true);
    } else {
        console.log("❌ Erreur : OPA_SESSION (Compte 1) introuvable !");
    }

    // Lancement du Compte 2 (Mode 100% silencieux)
    if (OPA_SESSION_2) {
        console.log("\n⏳ Lancement du Compte 2 dans 5 secondes...");
        await attendre(5000); 
        await lancerCycle(OPA_SESSION_2, "Compte 2", false);
    }
}

executerTousLesComptes();
