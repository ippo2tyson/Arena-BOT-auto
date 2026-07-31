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
// ⚔️ LOGIQUE PRINCIPALE
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
        
        // 1. Premier chargement
        await page.goto(URL_DU_JEU, { waitUntil: 'networkidle2' });
        await attendreAleatoire(2000, 3000);

        // 🆕 NOUVEAUTÉ : Rafraîchissement forcé (F5) pour actualiser l'énergie serveur
        console.log("Rafraîchissement de la page pour synchroniser l'énergie...");
        await page.reload({ waitUntil: 'networkidle2' });
        await attendreAleatoire(3000, 4000); // Laisse le temps au texte de s'afficher

        // 2. LECTURE DE L'ÉNERGIE DISPONIBLE
        const combatsDispo = await page.evaluate(() => {
            const text = document.body.innerText;
            const match = text.match(/(\d+)\s*\/\s*10/);
            if (match) return parseInt(match[1]);
            return null;
        });

        const nbCombats = combatsDispo !== null ? combatsDispo : 0;
        console.log(`Nombre de combats détectés après rafraîchissement : ${nbCombats}/10`);

        // 3. DÉCISION DU NOMBRE DE COMBATS (Garde toujours 1 de réserve, Max 8)
        let combatsAFaire = 0;
        
        if (nbCombats <= 1) {
            console.log(`Seulement ${nbCombats} combat(s) disponible(s). On en garde 1 en réserve. On passe au Classement.`);
        } else {
            combatsAFaire = Math.min(nbCombats - 1, 8);
            console.log(`Calcul : ${nbCombats} dispos -> 1 en réserve = ${nbCombats - 1}. Plafond max : 8. Lancement de ${combatsAFaire} combat(s).`);
        }
        
        // 4. BOUCLE DE COMBAT (Ne s'exécute que si combatsAFaire > 0)
        for (let i = 1; i <= combatsAFaire; i++) {
            console.log(`Combat ${i}/${combatsAFaire}...`);

            // Attente Intelligente (Timeout 10s si le bouton n'apparaît pas)
            await page.waitForFunction(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                return boutons.some(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
            }, { timeout: 10000 }).catch(() => console.log("Attente du bouton expirée."));

            // Pause Anti-ban avant clic
            await attendreAleatoire(800, 1500);

            await page.evaluate(() => {
                const boutons = Array.from(document.querySelectorAll('button'));
                const cible = boutons.find(b => 
                    b.textContent.toLowerCase().includes('combattre') || 
                    b.textContent.toLowerCase().includes('rejouer')
                );
                if (cible) cible.click();
            });
            
            // Pause Anti-ban pour transition
            await attendreAleatoire(2000, 2500);
            
            // Clic au centre "Découdre"
            await page.mouse.click(640, 360);
            
            // Pause Anti-ban du combat
            await attendreAleatoire(5500, 7000); 

            // Comptage des victoires et défaites
            const texteEcran = await page.evaluate(() => document.body.innerText.toLowerCase());
            if (texteEcran.includes('victoire')) {
                victoires++;
            } else if (texteEcran.includes('défaite') || texteEcran.includes('defaite')) {
                defaites++;
            }
        }
        
        // 5. NAVIGATION VERS LE CLASSEMENT SEUL (Pour le screenshot)
        console.log("Navigation vers le Classement pour la capture d'écran...");
        
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            const onglet = elements.find(el => el.textContent.trim().toUpperCase() === 'CLASSEMENT' && el.children.length === 0);
            if (onglet) {
                onglet.click();
                if (onglet.parentElement) onglet.parentElement.click();
            }
        });
        
        // On attend un peu plus longtemps pour que les avatars du classement s'affichent bien
        await attendreAleatoire(3000, 4500);

        // 6. RAPPORT FINAL ET ENVOI
        const capture = await page.screenshot();
        
        const titreMessage = combatsAFaire > 0 
            ? `✅ **Cycle de ${combatsAFaire} combat(s) terminé !**` 
            : `ℹ️ **Audit de routine (1 ou 0 combat dispo)**`;

        const rapport = `${titreMessage}\n\n📊 **RÉSUMÉ DE LA SESSION :**\n🏆 Victoires : ${victoires}\n💀 Défaites : ${defaites}\n\n*(La capture d'écran ci-jointe montre l'état du Classement actuel)*`;
        
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
