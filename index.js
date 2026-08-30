const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

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
// ⚔️ MISSION : COMBATS DYNAMIQUES & RÉSERVE
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

        // 2. Lecture optimisée de la jauge sur 30 (Affinement du DOM)
        const energieLue = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, p, h1, h2, h3'));
            const conteneurEnergie = elements.find(el => el.textContent.includes('/30'));
            const match = conteneurEnergie ? conteneurEnergie.textContent.match(/(\d+)\s*\/\s*30/) : null;
            return match ? parseInt(match[1]) : 0;
        });
        console.log(`[${nomCompte}] Énergie lue au démarrage : ${energieLue}/30`);

        // 3. Calcul intelligent des combats
        const reserveManuelle = 10;
        let combatsAFaire = energieLue - reserveManuelle;
        if (combatsAFaire > 20) combatsAFaire = 20;

        // 4. Boucle de combats (Avec Try/Catch Soft-Fail)
        if (combatsAFaire > 0) {
            console.log(`[${nomCompte}] Lancement de ${combatsAFaire} combats pour écrémer la jauge...`);
            
            for (let i = 1; i <= combatsAFaire; i++) {
                try {
                    console.log(`[${nomCompte}] Tentative de combat ${i}/${combatsAFaire}...`);
                    await attendreAleatoire(1500, 2000);

                    const actionReussie = await page.evaluate(() => {
                        // Correction : Ciblage souple avec .includes() pour éviter les bugs liés aux espaces/caractères invisibles
                        const boutons = Array.from(document.querySelectorAll('button'));
                        const cible = boutons.find(b => 
                            b.textContent.toLowerCase().includes('combattre') || 
                            b.textContent.toLowerCase().includes('rejouer')
                        );
                        if (cible) {
                            cible.click();
                            return true;
                        }
                        return false;
                    });

                    if (!actionReussie) throw new Error("Bouton 'Combattre' ou 'Rejouer' introuvable dans le DOM.");
                    
                    console.log(`[${nomCompte}] Attente serveur de 5 secondes...`);
                    await attendre(5000);
                    
                    console.log(`[${nomCompte}] Rafraîchissement (F5)...`);
                    await page.reload({ waitUntil: 'networkidle2' });
                    await attendreAleatoire(3000, 4000); 

                } catch (erreurBoucle) {
                    console.log(`[${nomCompte}] ⚠️ Soft-fail activé au combat ${i} : ${erreurBoucle.message}. Passage au suivant.`);
                    continue; 
                }
            }
        } else {
            console.log(`[${nomCompte}] Mode dormant : La jauge (${energieLue}/30) est réservée pour le mode manuel.`);
        }
        
        // 5. Capture d'écran permanente
        if (avecCapture) {
            console.log(`[${nomCompte}] Navigation vers le menu Classement...`);
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const onglet = elements.find(el => el.textContent.trim().toUpperCase() === 'CLASSEMENT' && el.children.length === 0);
                if (onglet) {
                    onglet.click();
                    if (onglet.parentElement) onglet.parentElement.click();
                }
            });
            
            await attendreAleatoire(2000, 3000);
            
            console.log(`[${nomCompte}] Ouverture de l'onglet Hall of Fame...`);
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const btnHallOfFame = elements.find(el => el.textContent.toUpperCase().includes('HALL OF FAME') && el.children.length === 0);
                if (btnHallOfFame) {
                    btnHallOfFame.click();
                    if (btnHallOfFame.parentElement) btnHallOfFame.parentElement.click();
                }
            });

            await attendreAleatoire(4000, 5000);
            const capture = await page.screenshot();
            
            let message;
            if (combatsAFaire > 0) {
                const energieRestante = energieLue - combatsAFaire;
                message = `✅ **Cycle terminé pour le ${nomCompte} !**\n⚔️ **${combatsAFaire} combats** tentés.\n🔋 Énergie gardée en réserve : **${energieRestante}/30**\n\n*(Capture du Hall of Fame)*`;
            } else {
                message = `💤 **Mode Dormant pour le ${nomCompte}.**\n🔋 La jauge est à **${energieLue}/30** (Réserve de 10 intacte).\nAucun combat lancé pour ce cycle.\n\n*(Capture du Hall of Fame)*`;
            }
            
            await notifierDiscordAvecImage(message, capture);
        } else {
            console.log(`[${nomCompte}] Mode silencieux activé (pas de notification Discord).`);
        }
        
        console.log(`✅ Mission terminée pour le ${nomCompte}.`);
        
    } catch (error) {
        console.error(`Crash critique sur le ${nomCompte} :`, error);
        await notifierDiscord(`⚠️ **Erreur critique sur le ${nomCompte}** : ${error.message}`);
    } finally {
        await browser.close();
    }
}

// ==========================================
// 🚀 LANCEUR PRINCIPAL
// ==========================================
async function executerTousLesComptes() {
    console.log("=== Initialisation du cycle ===");

    const secondesAleatoires = Math.floor(Math.random() * 421);
    const minutes = Math.floor(secondesAleatoires / 60);
    const secondes = secondesAleatoires % 60;
    
    console.log(`⏳ Temporisation aléatoire : pause de ${minutes} min ${secondes} s avant exécution...`);
    await attendre(secondesAleatoires * 1000);

    if (OPA_SESSION_1) {
        await lancerCycle(OPA_SESSION_1, "Compte 1", true);
    } else {
        console.log("❌ Variable OPA_SESSION manquante.");
    }

    if (OPA_SESSION_2) {
        console.log("\n⏳ Pause de 5 secondes avant le Compte 2...");
        await attendre(5000);
        await lancerCycle(OPA_SESSION_2, "Compte 2", false);
    }
}

executerTousLesComptes();
