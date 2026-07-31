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
const attendreAleatoire = (min, max) => {
    const temps = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, temps));
};

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
// ⚔️ LOGIQUE DE COMBAT ET REPORTING
// ==========================================
async function lancerCycleDeCombats() {
    console.log(`[${new Date().toLocaleTimeString()}] Lancement du cycle...`);
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
        
        // 1. Laisser le temps à l'interface de charger
        await attendreAleatoire(2000, 3000);

        // 2. LECTURE DE L'ÉNERGIE DISPONIBLE
        const combatsDispo = await page.evaluate(() => {
            const text = document.body.innerText;
            const match = text.match(/(\d+)\s*\/\s*10/);
            if (match) return parseInt(match[1]);
            return null;
        });

        const nbCombats = combatsDispo !== null ? combatsDispo : 0;
        console.log(`Nombre de combats détectés : ${nbCombats}/10`);

        // 3. VÉRIFICATION DE LA CONDITION STRICTE (Minimum 8)
        if (nbCombats < 8) {
            console.log(`Seulement ${nbCombats}/10 combats disponibles (minimum requis : 8). Le bot se rendort silencieusement.`);
            await browser.close();
            return; // Fin de l'exécution, Discord ne sera pas notifié
        }
        
        // 4. LANCEMENT STRICT DE 6 COMBATS
        console.log(`Condition remplie. Lancement strict de 6 combats.`);
        
        for (let i = 1; i <= 6; i++) {
            console.log(`Combat ${i}/6...`);

            await page.waitForFunction(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                return boutons.some(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
            }, { timeout: 10000 }).catch(() => console.log("Attente du bouton expirée."));

            await attendreAleatoire(800, 1500);

            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            await attendreAleatoire(2000, 2500);
            
            // Clic au centre pour passer l'animation "Découdre"
            await page.mouse.click(640, 360);
            
            await attendreAleatoire(5500, 7000); 

            // Comptage des victoires et défaites pour le tableau de bord
            const texteEcran = await page.evaluate(() => document.body.innerText.toLowerCase());
            if (texteEcran.includes('victoire')) {
                victoires++;
            } else if (texteEcran.includes('défaite') || texteEcran.includes('defaite')) {
                defaites++;
            }
        }
        
        // 5. NAVIGATION VERS LE PROFIL (Piste d'audit)
        console.log("Navigation vers l'historique des combats...");
        
        // Clic sur l'onglet CLASSEMENT
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, button'));
            const onglet = elements.find(el => el.textContent.trim() === 'CLASSEMENT');
            if (onglet) onglet.click();
        });
        await attendreAleatoire(2000, 3000);

        // Clic sur votre profil
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span'));
            const profil = elements.find(el => el.textContent.includes('akaimed'));
            if (profil) profil.click();
        });
        await attendreAleatoire(2000, 3000);

        // Extraction des données d'historique
        const historique = await page.evaluate(() => {
            const texteComplet = document.body.innerText;
            const index = texteComplet.indexOf('5 DERNIERS COMBATS');
            if (index !== -1) {
                return texteComplet.substring(index).trim();
            }
            return "Historique indisponible sur la page.";
        });

        // 6. RAPPORT FINAL ET ENVOI
        const capture = await page.screenshot();
        const rapport = `✅ **Cycle terminé !**\n\n📊 **RÉSUMÉ DES 6 COMBATS :**\n🏆 Victoires : ${victoires}\n💀 Défaites : ${defaites}\n\n📝 **EXTRAIT DU PROFIL (5 derniers combats) :**\n\`\`\`text\n${historique}\n\`\`\``;
        
        await notifierDiscordAvecImage(rapport, capture);
        
    } catch (error) {
        console.error("Erreur pendant le cycle:", error);
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                const captureErreur = await pages[0].screenshot();
                await notifierDiscordAvecImage(`⚠️ **Le bot a planté !**\nMessage d'erreur : \`${error.message}\``, captureErreur);
            }
        } catch (e) {
            await notifierDiscord("⚠️ **Erreur critique.** Le script a craché sans pouvoir prendre de photo.");
        }
    } finally {
        await browser.close();
    }
}

lancerCycleDeCombats();
