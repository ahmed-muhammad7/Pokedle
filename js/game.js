/**
 * game.js — Logique du jeu Pokémondle
 * =====================================
 * Responsabilité UNIQUE : gérer les règles et l'état de la partie.
 * Ce fichier ne touche JAMAIS au DOM (c'est le rôle de ui.js)
 * et ne fait PAS d'appels réseau directs (c'est le rôle de api.js).
 *
 * Dépendances : window.PokemonAPI (api.js doit être chargé avant)
 */

// ─── Configuration du jeu ─────────────────────────────────────────────────────

/**
 * Nombre d'essais avant qu'un indice soit révélé.
 * Après HINT_THRESHOLD essais sans trouver, le type du Pokémon du jour
 * est affiché comme indice.
 */
const HINT_THRESHOLD = 5;

/**
 * Nombre d'essais maximum avant la fin de partie (défaite).
 * Mettre à Infinity pour un jeu sans limite.
 */
const MAX_ATTEMPTS = 10;

// ─── État de la partie ────────────────────────────────────────────────────────

/**
 * L'objet gameState centralise TOUT l'état mutable de la partie.
 * On ne disperse jamais l'état dans des variables globales isolées.
 *
 * @type {{
 * targetPokemon:  Object|null,   // Données complètes du Pokémon à deviner
 * guesses:        Object[],      // Historique des essais [{pokemon, comparison}]
 * isOver:         boolean,       // Vrai si la partie est terminée
 * isWon:          boolean,       // Vrai si le joueur a trouvé
 * hintUnlocked:   boolean,       // Vrai si le joueur a débloqué le droit de voir l'indice
 * hintShown:      boolean,       // Vrai si l'indice a déjà été affiché
 * }}
 */
const gameState = {
    targetPokemon: null,
    guesses:       [],
    isOver:        false,
    isWon:         false,
    hintUnlocked:  false,
    hintShown:     false,
};

// ─── Sélection du Pokémon du jour & Sauvegarde ─────────────────────────────────

/**
 * Calcule une "graine" (seed) à partir de la date (AAAAMMJJ).
 * Utilisé pour générer le même Pokémon toute la journée et réinitialiser
 * la sauvegarde le lendemain.
 * * @returns {number}
 */
function getDailySeed() {
    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day   = String(today.getDate()).padStart(2, "0");

    return parseInt(`${year}${month}${day}`, 10);
}

/**
 * Calcule un index pseudo-aléatoire mais DÉTERMINISTE pour la date du jour.
 * Même date = même Pokémon pour tout le monde.
 *
 * @returns {number} - Index entre 0 et POKEMON_COUNT - 1
 */
function getDailyPokemonIndex() {
    const seed = getDailySeed();
    // Modulo pour rester dans la plage des Pokémon disponibles
    return seed % window.PokemonAPI.POKEMON_COUNT;
}

/**
 * Sauvegarde l'état actuel de la partie dans le localStorage.
 */
function saveState() {
    const state = {
        seed: getDailySeed(),
        guesses: gameState.guesses.map(g => g.pokemon.name),
        hintUnlocked: gameState.hintUnlocked,
        hintShown: gameState.hintShown
    };
    localStorage.setItem("pokemondle_save", JSON.stringify(state));
}

/**
 * Charge la sauvegarde du localStorage si elle correspond à la date du jour.
 * @returns {Object|null}
 */
function loadSavedState() {
    try {
        const saved = localStorage.getItem("pokemondle_save");
        if (!saved) return null;

        const state = JSON.parse(saved);

        // Si la sauvegarde date d'un autre jour, on la supprime
        if (state.seed !== getDailySeed()) {
            localStorage.removeItem("pokemondle_save");
            return null;
        }

        return state;
    } catch (e) {
        return null;
    }
}

/**
 * Initialise la partie en :
 * 1. Récupérant la liste de tous les noms
 * 2. Sélectionnant le Pokémon du jour selon la date
 * 3. Pré-chargeant ses données
 *
 * @returns {Promise<void>}
 */
async function initGame() {
    // Récupération de la liste complète des noms
    const allNames = await window.PokemonAPI.fetchAllPokemonNames();

    // Sélection déterministe du Pokémon du jour
    const index        = getDailyPokemonIndex();
    const targetName   = allNames[index];

    // Pré-chargement des données du Pokémon cible (mise en cache)
    gameState.targetPokemon = await window.PokemonAPI.fetchPokemonData(targetName);

    console.info(
        `[Pokémondle] Pokémon du jour chargé. Index: ${index}/${allNames.length}`
        // On ne log pas le nom pour éviter de "tricher" en regardant la console
        // Décommenter la ligne suivante pour déboguer :
        // + ` — Nom: ${targetName}`
    );
}

// ─── Logique de comparaison ───────────────────────────────────────────────────

/**
 * Compare les données d'un Pokémon essayé avec le Pokémon cible,
 * et retourne un objet décrivant le résultat de chaque critère.
 *
 * @param {Object} guessedPokemon - Données du Pokémon soumis par le joueur
 * @returns {ComparisonResult}
 *
 * @typedef {Object} ComparisonResult
 * @property {CellResult} type1       - Comparaison du type principal
 * @property {CellResult} type2       - Comparaison du type secondaire
 * @property {CellResult} stage       - Comparaison du stade d'évolution
 * @property {CellResult} fullyEvolved - Comparaison "entièrement évolué"
 * @property {CellResult} color       - Comparaison de la couleur
 * @property {CellResult} generation  - Comparaison de la génération (avec flèche)
 * @property {CellResult} weightKg    - Comparaison du poids (avec flèche)
 * @property {CellResult} heightM     - Comparaison de la taille (avec flèche)
 *
 * @typedef {Object} CellResult
 * @property {boolean}         correct   - Vrai si correspondance exacte
 * @property {string|null}     arrow     - "up" | "down" | null (pour les numériques)
 * @property {string}          display   - Texte à afficher dans la cellule
 */
function compareGuess(guessedPokemon) {
    const target  = gameState.targetPokemon;
    const guessed = guessedPokemon;

    return {

        // ── Type 1 ──────────────────────────────────────────────────────
        type1: {
            correct: guessed.type1 === target.type1,
            arrow:   null,
            display: guessed.type1,
        },

        // ── Type 2 ──────────────────────────────────────────────────────
        // Cas spéciaux :
        //   - Les deux Pokémon n'ont pas de type 2 → VERT
        //   - Seulement l'un n'a pas de type 2 → ROUGE
        //   - Les types 2 correspondent → VERT
        type2: {
            correct: guessed.type2 === target.type2,
            arrow:   null,
            display: guessed.type2 ?? "Aucun",
        },

        // ── Stade d'évolution ────────────────────────────────────────────
        stage: {
            correct: guessed.stage === target.stage,
            arrow:   null,
            display: String(guessed.stage),
        },

        // ── Entièrement évolué ───────────────────────────────────────────
        fullyEvolved: {
            correct: guessed.fullyEvolved === target.fullyEvolved,
            arrow:   null,
            display: guessed.fullyEvolved ? "Oui" : "Non",
        },

        // ── Couleur ──────────────────────────────────────────────────────
        color: {
            correct: guessed.color === target.color,
            arrow:   null,
            display: capitalizeFirstGame(guessed.color),
        },

        // ── Génération (numérique → flèche directionnelle) ───────────────
        generation: compareNumeric(guessed.generation, target.generation),

        // ── Poids en kg (numérique → flèche directionnelle) ─────────────
        weightKg: {
            ...compareNumeric(guessed.weightKg, target.weightKg),
            display: `${guessed.weightKg} kg`,
        },

        // ── Taille en m (numérique → flèche directionnelle) ─────────────
        heightM: {
            ...compareNumeric(guessed.heightM, target.heightM),
            display: `${guessed.heightM} m`,
        },
    };
}

/**
 * Compare deux valeurs numériques et retourne un CellResult avec flèche.
 * La flèche indique dans quel sens chercher :
 * ⬆ = le Pokémon cible a une valeur PLUS ÉLEVÉE
 * ⬇ = le Pokémon cible a une valeur PLUS BASSE
 *
 * @param {number} guessedValue  - La valeur du Pokémon essayé
 * @param {number} targetValue   - La valeur du Pokémon cible
 * @returns {CellResult}
 */
function compareNumeric(guessedValue, targetValue) {
    const correct = guessedValue === targetValue;

    let arrow = null;
    if (!correct) {
        // Si target > guessed, le joueur doit chercher plus haut → flèche ⬆
        arrow = targetValue > guessedValue ? "up" : "down";
    }

    return {
        correct,
        arrow,
        display: String(guessedValue),
    };
}

// ─── Gestion des essais ───────────────────────────────────────────────────────

/**
 * Traite un essai du joueur :
 * 1. Charge les données du Pokémon soumis
 * 2. Compare avec la cible
 * 3. Met à jour l'état de la partie
 * 4. Retourne le résultat pour que ui.js puisse l'afficher
 *
 * @param {string} pokemonName - Le nom du Pokémon soumis (minuscules)
 * @returns {Promise<GuessResult>}
 *
 * @typedef {Object} GuessResult
 * @property {Object}           pokemon    - Données complètes du Pokémon essayé
 * @property {ComparisonResult} comparison - Résultat de la comparaison
 * @property {boolean}          isWon      - Vrai si c'est la bonne réponse
 * @property {boolean}          isGameOver - Vrai si la partie est terminée (victoire OU défaite)
 */
async function makeGuess(pokemonName) {
    if (gameState.isOver) {
        throw new Error("La partie est déjà terminée !");
    }

    // Chargement des données (avec cache)
    const guessedPokemon = await window.PokemonAPI.fetchPokemonData(pokemonName);

    // Comparaison des attributs
    const comparison = compareGuess(guessedPokemon);

    // Vérification victoire : toutes les colonnes sont vertes
    const isWon = Object.values(comparison).every(cell => cell.correct);

    // Ajout à l'historique des essais
    gameState.guesses.push({ pokemon: guessedPokemon, comparison });

    // Mise à jour de l'état de fin de partie
    if (isWon) {
        gameState.isOver = true;
        gameState.isWon  = true;
    } else if (gameState.guesses.length >= MAX_ATTEMPTS) {
        gameState.isOver = true;
        gameState.isWon  = false;
    }

    // Déblocage de l'indice
    if (!gameState.hintUnlocked && gameState.guesses.length >= HINT_THRESHOLD && !gameState.isOver) {
        gameState.hintUnlocked = true;
    }

    // Sauvegarde en LocalStorage après chaque essai
    saveState();

    return {
        pokemon:    guessedPokemon,
        comparison,
        isWon,
        isGameOver: gameState.isOver
    };
}

/**
 * Vérifie si un nom de Pokémon a déjà été essayé dans cette partie.
 *
 * @param {string} pokemonName - Le nom à vérifier (minuscules)
 * @returns {boolean}
 */
function hasAlreadyGuessed(pokemonName) {
    return gameState.guesses.some(g => g.pokemon.name === pokemonName);
}

/**
 * Retourne le nombre d'essais effectués.
 * @returns {number}
 */
function getAttemptsCount() {
    return gameState.guesses.length;
}

/**
 * Retourne les données du Pokémon cible.
 * Utilisé par ui.js uniquement quand la partie est terminée.
 * @returns {Object|null}
 */
function getTargetPokemon() {
    return gameState.targetPokemon;
}

// ─── Utilitaire local ─────────────────────────────────────────────────────────

/**
 * Capitalise la première lettre d'une chaîne.
 * (Copie locale pour que game.js soit autonome sans dépendre de api.js)
 *
 * @param {string} str
 * @returns {string}
 */
function capitalizeFirstGame(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

window.PokemonGame = {
    initGame,
    makeGuess,
    hasAlreadyGuessed,
    getAttemptsCount,
    getTargetPokemon,
    saveState,          // Exporté pour sauvegarder le clic sur le bouton indice
    loadSavedState,     // Exporté pour charger les données à l'init
    gameState,          // exposé en lecture pour ui.js
    HINT_THRESHOLD,
    MAX_ATTEMPTS,
};