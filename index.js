const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ==========================================
// ⚙️ CONFIGURATION DE BASE
// ==========================================
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const OPA_SESSION_1 = process.env.OPA_SESSION;
const OPA_SESSION_2 = process.env.OPA_SESSION_2;
const URL_DU_JEU = 'https://grand-line-arena.vercel.app/';

// ==========================================
// 🛠️ FONCTIONS UTILITAIRES
// ==========================================
const attendre = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function delaiHumain(moyenneMs, ecartTypeMs, minMs = 300) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const valeur = Math.round(moyenneMs + z * ecartTypeMs);
    return attendre(Math.max(minMs, valeur));
}

async function pauseDistractionAleatoire(probabilite = 0.12) {
    if (Math.random() < probabilite) {
        const pauseMs = 8000 + Math.random() * 25000;
        console.log(`   💭 Micro-pause de distraction (${Math.round(pauseMs / 1000)}s)...`);
        await attendre(pauseMs);
    }
}

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
        const response = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
        if (!response.ok) await notifierDiscord(message + "\n\n*(image non envoyée)*");
    } catch (err) {
        console.error("Erreur d'envoi d'image Discord:", err);
        await notifierDiscord(message + "\n\n*(erreur critique image)*");
    }
}

// ==========================================
// 📅 FENÊTRES D'ACTIVITÉ (SAUTS CHAOTIQUES & ZÉRO PERTE)
// ==========================================
function hashChaine(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function dateDuJourParis() {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

function heureActuelleParis() {
    return parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(new Date()));
}

function jourSemaineParis() {
    const abrege = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date());
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[abrege];
}

// bouchonSoir : 23 (même jour, sûr) ou 0/1 (nuit suivante -> vérifié via seed de la veille)
function calculerBouchonSoir(dateStr, nomCompte, jour) {
    const graine = hashChaine(`${dateStr}-${nomCompte}`);
    const rng = mulberry32(graine);
    let heureCourante = 8;
    while (heureCourante < 23) {
        heureCourante += 2 + Math.floor(rng() * 7);
    }
    const optionsBouchon = [23, 0, 1];
    return (jour === 0) ? 23 : optionsBouchon[Math.floor(rng() * optionsBouchon.length)];
}

function dateVeilleParis() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat('fr-CA').format(d);
}

function genererFenetresDuJour(nomCompte) {
    const dateJour = dateDuJourParis();
    const jour = jourSemaineParis();
    const graine = hashChaine(`${dateJour}-${nomCompte}`);
    const rng = mulberry32(graine);

    let heures = [8]; // Premier vidage du matin garanti
    let heureCourante = 8;

    while (heureCourante < 23) {
        let saut = 2 + Math.floor(rng() * 7); // Saut de 2h à 8h
        heureCourante += saut;
        if (heureCourante < 23) heures.push(heureCourante);
    }

    const bouchonSoir = calculerBouchonSoir(dateJour, nomCompte, jour);
    if (bouchonSoir === 23 && !heures.includes(23)) heures.push(23);

    return heures.sort((a, b) => a - b);
}

function sessionActivePourCetteHeure(nomCompte) {
    const heureActuelle = heureActuelleParis();
    const jour = jourSemaineParis();
    const dateJour = dateDuJourParis();

    // 0h/1h : on vérifie si la VEILLE avait choisi ce bouchon comme clôture tardive
    if (heureActuelle === 0 || heureActuelle === 1) {
        const dateVeille = dateVeilleParis();
        const jourVeille = (jour + 6) % 7;
        const bouchonVeille = calculerBouchonSoir(dateVeille, nomCompte, jourVeille);
        if (bouchonVeille === heureActuelle) {
            console.log(`[${nomCompte}] 🌙 Bouchon tardif d'hier (${dateVeille}) déclenché à ${heureActuelle}h.`);
            return true;
        }
    }

    const fenetres = genererFenetresDuJour(nomCompte);
    const bouchonSoir = calculerBouchonSoir(dateJour, nomCompte, jour);

    const candidatsAujourdhui = fenetres.filter(h => h > heureActuelle);
    let prochainLancement;
    if (candidatsAujourdhui.length > 0) {
        prochainLancement = `${Math.min(...candidatsAujourdhui)}h aujourd'hui`;
    } else if (bouchonSoir === 0 || bouchonSoir === 1) {
        prochainLancement = `${bouchonSoir}h cette nuit`;
    } else {
        prochainLancement = `8h demain matin`;
    }

    console.log(`[${nomCompte}] Planning du jour (Europe/Paris) : ${fenetres.join('h, ')}h — heure actuelle : ${heureActuelle}h — prochain lancement : ${prochainLancement}`);
    return fenetres.includes(heureActuelle);
}

function modeBurstActif() {
    return false;
}

// ==========================================
// 🖱️ CLIC "HUMAIN" & NAVIGATION
// ==========================================
async function clicHumain(page, boundingBox) {
    const x = boundingBox.x + boundingBox.width * (0.3 + Math.random() * 0.4);
    const y = boundingBox.y + boundingBox.height * (0.3 + Math.random() * 0.4);

    const startX = Math.random() * 1280;
    const startY = Math.random() * 720;
    await page.mouse.move(startX, startY);

    const etapes = 6 + Math.floor(Math.random() * 4);
    for (let i = 1; i <= etapes; i++) {
        const progress = i / etapes;
        const jitterX = (Math.random() - 0.5) * 8;
        const jitterY = (Math.random() - 0.5) * 8;
        await page.mouse.move(
            startX + (x - startX) * progress + jitterX,
            startY + (y - startY) * progress + jitterY
        );
        await attendre(15 + Math.random() * 35);
    }

    await page.mouse.move(x, y);
    await attendre(80 + Math.random() * 150);
    await page.mouse.down();
    await attendre(40 + Math.random() * 80);
    await page.mouse.up();
}

function normaliserTexte(str) {
    // Retire emojis/icônes/ponctuation, garde lettres/chiffres, espaces réduits.
    // Corrige le bug où "⚔️ Combattre" ne matchait jamais "combattre" en égalité stricte.
    return str.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function trouverEtCliquerBouton(page, textesCibles) {
    const boite = await page.evaluate((textes) => {
        const normaliser = (str) => str.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const boutons = Array.from(document.querySelectorAll('button'));
        const cible = boutons.find(b => textes.includes(normaliser(b.textContent)));
        if (!cible) return null;
        const r = cible.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, textesCibles);

    if (!boite || boite.width === 0) return false;
    await clicHumain(page, boite);
    return true;
}

async function avecRetry(fn, tentatives = 3, delaiBaseMs = 2000) {
    let derniereErreur;
    for (let i = 0; i < tentatives; i++) {
        try {
            return await fn();
        } catch (err) {
            derniereErreur = err;
            const delai = delaiBaseMs * Math.pow(2, i) + Math.random() * 1000;
            console.log(`   ⚠️ Échec (tentative ${i + 1}/${tentatives}), retry dans ${Math.round(delai)}ms : ${err.message}`);
            await attendre(delai);
        }
    }
    throw derniereErreur;
}

// ==========================================
// ⚔️ MISSION : COMBATS DYNAMIQUES
// ==========================================
async function lancerCycle(cookieValue, nomCompte, avecCapture, modeBurst = false) {
    console.log(`\n🚀 Démarrage du bot pour le ${nomCompte}...${modeBurst ? ' [MODE BURST]' : ''}`);

    const largeur = 1270 + Math.floor(Math.random() * 40);
    const hauteur = 700 + Math.floor(Math.random() * 40);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-size=${largeur},${hauteur}`]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: largeur, height: hauteur });

        await page.setCookie({
            name: 'opa_session',
            value: cookieValue,
            domain: 'grand-line-arena.vercel.app',
            path: '/',
            httpOnly: true,
            secure: true
        });

        await avecRetry(() => page.goto(URL_DU_JEU, { waitUntil: 'networkidle2', timeout: 30000 }));
        await delaiHumain(3500, 800);

        const energieLue = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, p, h1, h2, h3'));
            const conteneur = elements.find(el => el.textContent.includes('/30'));
            const match = conteneur ? conteneur.textContent.match(/(\d+)\s*\/\s*30/) : null;
            return match ? parseInt(match[1]) : 0;
        });
        console.log(`[${nomCompte}] Énergie lue au démarrage : ${energieLue}/30`);

        const ENERGIE_MAX = 30;
        let combatsAFaire = Math.min(energieLue, ENERGIE_MAX);
        let combatsReussis = 0;

        if (combatsAFaire > 0) {
            console.log(`[${nomCompte}] Lancement de ${combatsAFaire} combats...`);

            for (let i = 1; i <= combatsAFaire; i++) {
                try {
                    console.log(`[${nomCompte}] Combat ${i}/${combatsAFaire}...`);
                    await delaiHumain(1800, 400);
                    await pauseDistractionAleatoire();

                    const clique = await trouverEtCliquerBouton(page, ['combattre', 'rejouer']);
                    if (!clique) throw new Error("Bouton 'Combattre'/'Rejouer' introuvable.");

                    await delaiHumain(5000, 700, 3000);

                    await avecRetry(() => page.reload({ waitUntil: 'networkidle2', timeout: 30000 }));
                    await delaiHumain(3500, 700);

                    combatsReussis++;

                } catch (erreurBoucle) {
                    console.log(`[${nomCompte}] ⚠️ Soft-fail combat ${i} : ${erreurBoucle.message}. Suivant.`);
                    continue;
                }
            }
        } else {
            console.log(`[${nomCompte}] Mode dormant : jauge à zéro.`);
        }

        // Vérification réelle : on relit l'énergie après coup au lieu de faire confiance
        // au nombre de tentatives. Si ça ne correspond pas, on l'affiche clairement.
        const energieApres = combatsAFaire > 0 ? await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, span, p, h1, h2, h3'));
            const conteneur = elements.find(el => el.textContent.includes('/30'));
            const match = conteneur ? conteneur.textContent.match(/(\d+)\s*\/\s*30/) : null;
            return match ? parseInt(match[1]) : null;
        }) : energieLue;

        const echec = combatsReussis < combatsAFaire;
        if (echec) {
            console.log(`[${nomCompte}] 🔴 ALERTE : ${combatsReussis}/${combatsAFaire} combats réellement réussis (énergie après : ${energieApres ?? 'inconnue'}/30). Le bouton n'a probablement pas été cliqué correctement (cookie expiré ? page inattendue ?).`);
        }

        if (avecCapture) {
            await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                const onglet = els.find(el => el.textContent.trim().toUpperCase() === 'CLASSEMENT' && el.children.length === 0);
                if (onglet) { onglet.click(); onglet.parentElement?.click(); }
            });
            await delaiHumain(2500, 500);

            await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                const btn = els.find(el => el.textContent.toUpperCase().includes('HALL OF FAME') && el.children.length === 0);
                if (btn) { btn.click(); btn.parentElement?.click(); }
            });
            await delaiHumain(4500, 500);

            const capture = await page.screenshot();
            let message;
            if (combatsAFaire === 0) {
                message = `💤 **Mode Dormant pour le ${nomCompte}.**\n🔋 Jauge à **${energieLue}/30**.`;
            } else if (echec) {
                message = `🔴 **PROBLÈME sur le ${nomCompte} !**\n⚔️ **${combatsReussis}/${combatsAFaire}** combats réellement réussis.\n🔋 Énergie avant/après : **${energieLue}/30 → ${energieApres ?? '?'}/30**\n⚠️ Vérifie les logs du run (recherche "Soft-fail") — cookie de session probablement expiré.`;
            } else {
                message = `✅ **Cycle terminé pour le ${nomCompte} !**\n⚔️ **${combatsReussis} combats** réussis.\n🔋 Jauge vidée à **${energieApres}/30**`;
            }
            await notifierDiscordAvecImage(message, capture);
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
    console.log("=== Vérification du planning du jour ===");

    if (!OPA_SESSION_1) {
        console.log("❌ Variable OPA_SESSION manquante.");
        return;
    }

    if (!sessionActivePourCetteHeure("Compte 1")) {
        console.log("⏸️  Hors fenêtre active pour ce déclenchement — le bot ne joue pas cette heure-ci.");
        return;
    }

    const secondesAleatoires = Math.floor(Math.random() * 421);
    console.log(`⏳ Pause avant démarrage de ${Math.floor(secondesAleatoires / 60)}min ${secondesAleatoires % 60}s...`);
    await attendre(secondesAleatoires * 1000);

    await lancerCycle(OPA_SESSION_1, "Compte 1", true, modeBurstActif());

    if (OPA_SESSION_2 && sessionActivePourCetteHeure("Compte 2")) {
        await delaiHumain(6000, 1500);
        await lancerCycle(OPA_SESSION_2, "Compte 2", false, modeBurstActif());
    }
}

executerTousLesComptes();
