/**
 * ui.js — Interface utilisateur et gestion des événements
 * =========================================================
 * Responsabilité UNIQUE : tout ce qui touche au DOM.
 * - Écoute les événements (input, click, clavier)
 * - Construit et insère le HTML des lignes d'essais
 * - Orchestre les animations de flip 3D (avec délais en cascade)
 * - Affiche les messages (indice, victoire, défaite)
 *
 * Dépendances :
 * - window.PokemonAPI (api.js)
 * - window.PokemonGame (game.js)
 *
 * Point d'entrée : la fonction init() est appelée au DOMContentLoaded.
 */

// ─── Références aux éléments du DOM ──────────────────────────────────────────
// On récupère tous les éléments une seule fois au démarrage,
// ce qui est plus efficace que de les chercher à chaque événement.

/** @type {HTMLInputElement} */
const inputEl = document.getElementById("pokemon-input");

/** @type {HTMLButtonElement} */
const guessBtnEl = document.getElementById("guess-btn");

/** @type {HTMLUListElement} */
const autocompleteListEl = document.getElementById("autocomplete-list");

/** @type {HTMLElement} */
const guessesListEl = document.getElementById("guesses-list");

/** @type {HTMLElement} */
const attemptsCountEl = document.getElementById("attempts-count");

/** @type {HTMLElement} */
const hintBtnContainerEl = document.getElementById("hint-btn-container");

/** @type {HTMLButtonElement} */
const hintBtnEl = document.getElementById("hint-btn");

/** @type {HTMLElement} */
const hintBannerEl = document.getElementById("hint-banner");

/** @type {HTMLElement} */
const hintTextEl = document.getElementById("hint-text");

/** @type {HTMLElement} */
const resultBannerEl = document.getElementById("result-banner");

/** @type {HTMLElement} */
const resultTextEl = document.getElementById("result-text");

/** @type {HTMLButtonElement} */
const resultShareBtnEl = document.getElementById("result-share-btn");

/** @type {HTMLElement} */
const loadingEl = document.getElementById("loading-indicator");

// ─── État local de l'UI ───────────────────────────────────────────────────────

/** Index de la suggestion sélectionnée au clavier (-1 = aucune) */
let selectedSuggestionIndex = -1;

/** Nom du Pokémon validé (après sélection dans l'autocomplétion) */
let currentSelectedPokemon = "";

/** Liste complète des noms (pour l'autocomplétion, contient les noms FR et EN) */
let allPokemonNames = [];

// ─── Utilitaires de traduction ────────────────────────────────────────────────

/**
 * Dictionnaire de traduction type Pokémon anglais → français.
 * PokéAPI retourne les types en anglais.
 */
const TYPE_TRANSLATIONS = {
    normal:   "Normal",   fire:     "Feu",      water:    "Eau",
    grass:    "Plante",   electric: "Électrik", ice:      "Glace",
    fighting: "Combat",   poison:   "Poison",   ground:   "Sol",
    flying:   "Vol",      psychic:  "Psy",      bug:      "Insecte",
    rock:     "Roche",    ghost:    "Spectre",  dragon:   "Dragon",
    dark:     "Ténèbres", steel:    "Acier",    fairy:    "Fée",
    aucun:    "Aucun",
};

/**
 * Dictionnaire de traduction couleur anglais → français.
 */
const COLOR_TRANSLATIONS = {
    black:  "Noir",    blue:   "Bleu",   brown:  "Marron",
    gray:   "Gris",    green:  "Vert",   pink:   "Rose",
    purple: "Violet",  red:    "Rouge",  white:  "Blanc",
    yellow: "Jaune",
};

/**
 * Traduit un nom de type anglais en français.
 * @param {string} type - Nom du type en anglais
 * @returns {string}
 */
function translateType(type) {
    return TYPE_TRANSLATIONS[type] ?? type;
}

/**
 * Traduit un nom de couleur anglais en français.
 * @param {string} color - Nom de la couleur en anglais (souvent avec une majuscule)
 * @returns {string}
 */
function translateColor(color) {
    // Conversion en minuscules pour assurer la correspondance avec le dictionnaire
    return COLOR_TRANSLATIONS[color.toLowerCase()] ?? color;
}

// ─── Autocomplétion ───────────────────────────────────────────────────────────

/**
 * Filtre la liste de tous les Pokémon selon la saisie de l'utilisateur
 * et affiche les suggestions correspondantes.
 *
 * @param {string} query - Le texte saisi par l'utilisateur
 */
function updateAutocomplete(query) {
    // Fermeture si la saisie est trop courte
    if (query.length < 2) {
        closeAutocomplete();
        return;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Filtrage : on cherche les noms qui COMMENCENT par la saisie (nom FR ou nom interne)
    const matches = allPokemonNames
        .filter(p => p.frName.toLowerCase().startsWith(normalizedQuery) || p.name.startsWith(normalizedQuery))
        .slice(0, 8); // On limite à 8 suggestions pour éviter de surcharger l'UI

    if (matches.length === 0) {
        closeAutocomplete();
        return;
    }

    // Construction du HTML des suggestions
    autocompleteListEl.innerHTML = "";

    matches.forEach((match, index) => {
        const li = document.createElement("li");
        li.className    = "autocomplete-item";
        li.role         = "option";
        li.dataset.name = match.name;                 // stocke le nom interne (EN) pour l'API
        li.id           = `suggestion-${index}`;

        // Mini-sprite pour rendre la liste plus jolie
        const img       = document.createElement("img");
        img.src         = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${getPokemonIdFromName(match.name)}.png`;
        img.alt         = "";                         // décoratif, pas de texte alt
        img.loading     = "lazy";

        const nameSpan  = document.createElement("span");
        nameSpan.textContent = match.frName;          // Affichage du nom français propre

        li.appendChild(img);
        li.appendChild(nameSpan);
        autocompleteListEl.appendChild(li);
    });

    // Affichage de la liste
    autocompleteListEl.hidden = false;
    inputEl.setAttribute("aria-expanded", "true");
    selectedSuggestionIndex = -1;
}

/**
 * Ferme la liste d'autocomplétion et réinitialise l'index de sélection.
 */
function closeAutocomplete() {
    autocompleteListEl.hidden = true;
    autocompleteListEl.innerHTML = "";
    inputEl.setAttribute("aria-expanded", "false");
    selectedSuggestionIndex = -1;
}

/**
 * Déplace la sélection clavier dans la liste d'autocomplétion.
 * @param {"up"|"down"} direction
 */
function navigateAutocomplete(direction) {
    const items = autocompleteListEl.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    // Mise à jour de l'index (avec boucle)
    if (direction === "down") {
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
    } else {
        selectedSuggestionIndex =
            (selectedSuggestionIndex - 1 + items.length) % items.length;
    }

    // Mise à jour visuelle et ARIA
    items.forEach((item, i) => {
        const isSelected = i === selectedSuggestionIndex;
        item.setAttribute("aria-selected", isSelected);
        if (isSelected) {
            item.scrollIntoView({ block: "nearest" });
            // Met à jour l'input avec le nom français correspondant
            const selectedObj = allPokemonNames.find(p => p.name === item.dataset.name);
            inputEl.value = selectedObj ? selectedObj.frName : item.dataset.name;
            currentSelectedPokemon = item.dataset.name;
        }
    });
}

/**
 * Sélectionne une suggestion (clic ou touche Entrée).
 * @param {string} pokemonName - Le nom en minuscules du Pokémon sélectionné (interne)
 */
function selectSuggestion(pokemonName) {
    currentSelectedPokemon = pokemonName;
    const selectedObj = allPokemonNames.find(p => p.name === pokemonName);
    inputEl.value = selectedObj ? selectedObj.frName : pokemonName;
    guessBtnEl.disabled = false;
    closeAutocomplete();
    inputEl.focus();
}

// ─── Construction des lignes d'essais ─────────────────────────────────────────

/**
 * Crée et insère une nouvelle ligne d'essai dans le tableau,
 * puis déclenche l'animation de flip en cascade.
 *
 * @param {Object} pokemon    - Données du Pokémon essayé
 * @param {Object} comparison - Résultat de la comparaison (de game.js)
 * @param {boolean} skipAnimation - Permet de zapper l'animation lors du chargement de la sauvegarde
 */
function addGuessRow(pokemon, comparison, skipAnimation = false) {
    // Définition des 8 colonnes d'attributs (dans le nouvel ordre d'affichage demandé)
    const columns = [
        {
            key:     "type1",
            value:   comparison.type1,
            display: translateType(comparison.type1.display),
        },
        {
            key:     "type2",
            value:   comparison.type2,
            display: comparison.type2.display === "Aucun"
                ? "Aucun"
                : translateType(comparison.type2.display),
        },
        {
            key:     "stage",
            value:   comparison.stage,
            display: comparison.stage.display,
        },
        {
            key:     "fullyEvolved",
            value:   comparison.fullyEvolved,
            display: comparison.fullyEvolved.display,
        },
        {
            key:     "weightKg",
            value:   comparison.weightKg,
            display: comparison.weightKg.display,
        },
        {
            key:     "heightM",
            value:   comparison.heightM,
            display: comparison.heightM.display,
        },
        {
            key:     "color",
            value:   comparison.color,
            display: translateColor(comparison.color.display),
        },
        {
            key:     "generation",
            value:   comparison.generation,
            display: comparison.generation.display,
        },
    ];

    // ── Création de la ligne ─────────────────────────────────────────
    const row = document.createElement("div");
    row.className   = "guess-row guess-row--attempt";
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", `Essai : ${pokemon.displayName}`);

    // ── Cellule sprite (1ère colonne, pas de flip) ───────────────────
    const spriteCell = document.createElement("div");
    spriteCell.className = "cell cell--sprite";
    spriteCell.setAttribute("role", "cell");

    const spriteImg      = document.createElement("img");
    spriteImg.src        = pokemon.sprite;
    spriteImg.alt        = pokemon.displayName;
    spriteImg.title      = pokemon.displayName;

    spriteCell.appendChild(spriteImg);
    row.appendChild(spriteCell);

    // ── Cellules d'attributs (avec animation flip) ───────────────────
    columns.forEach((col, index) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.setAttribute("role", "cell");

        // Structure pour le flip 3D :
        // .cell > .cell-flipper > (.cell-front + .cell-back)
        const flipper   = document.createElement("div");
        flipper.className = "cell-flipper";

        const front     = document.createElement("div");
        front.className = "cell-front";
        front.textContent = "?";       // contenu visible avant le retournement

        const back      = document.createElement("div");
        back.className  = col.value.correct
            ? "cell-back cell-back--correct"
            : "cell-back cell-back--wrong";

        // Texte affiché sur la face arrière
        back.textContent = col.display;

        // Flèche directionnelle pour les valeurs numériques (gen, poids, taille)
        if (col.value.arrow) {
            const arrow   = document.createElement("span");
            arrow.className    = "direction-arrow";
            // ⬆ si le joueur doit chercher plus haut, ⬇ si plus bas
            arrow.textContent  = col.value.arrow === "up" ? "⬆" : "⬇";
            arrow.setAttribute("aria-label",
                col.value.arrow === "up" ? "Plus élevé" : "Plus bas"
            );
            back.appendChild(arrow);
        }

        flipper.appendChild(front);
        flipper.appendChild(back);
        cell.appendChild(flipper);
        row.appendChild(cell);

        // ── Déclenchement du flip ──────────────
        // Si on restaure une partie, on supprime le délai en cascade
        const flipDelay = skipAnimation ? 0 : index * 120; // ms

        setTimeout(() => {
            flipper.classList.add("flipping");
        }, flipDelay);
    });

    // Insertion de la ligne dans le DOM
    guessesListEl.appendChild(row);

    // Scroll pour voir la nouvelle ligne
    if (!skipAnimation) {
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

// ─── Mise à jour du compteur d'essais ─────────────────────────────────────────

/**
 * Met à jour l'affichage du nombre d'essais effectués.
 */
function updateAttemptsCounter() {
    attemptsCountEl.textContent = window.PokemonGame.getAttemptsCount();
}

// ─── Affichage de l'indice ────────────────────────────────────────────────────

/**
 * Affiche le bandeau d'indice avec le type du Pokémon cible.
 */
function showHint() {
    const target = window.PokemonGame.getTargetPokemon();
    const type1  = translateType(target.type1);
    const type2  = target.type2 ? ` / ${translateType(target.type2)}` : "";

    hintTextEl.textContent = `Indice : ce Pokémon est de type ${type1}${type2}.`;
    hintBannerEl.hidden    = false;
}

// ─── Affichage de la fin de partie ────────────────────────────────────────────

/**
 * Affiche le message de victoire ou de défaite.
 * @param {boolean} isWon - Vrai si le joueur a gagné
 */
function showEndGame(isWon) {
    const target = window.PokemonGame.getTargetPokemon();
    const count  = window.PokemonGame.getAttemptsCount();

    if (isWon) {
        resultTextEl.textContent =
            `🎉 Bravo ! Tu as trouvé ${target.displayName} en ${count} essai(s) !`;
        resultBannerEl.classList.add("victory");
    } else {
        resultTextEl.textContent =
            `😔 Perdu ! Le Pokémon du jour était ${target.displayName}.`;
    }

    resultBannerEl.hidden    = false;
    resultShareBtnEl.hidden  = false;

    // Désactivation des contrôles
    inputEl.disabled         = true;
    guessBtnEl.disabled      = true;
}

// ─── Fonctions de soumission et d'exécution d'un essai ───────────────────────

/**
 * Gère la saisie de l'utilisateur depuis l'UI et lance le tour.
 */
async function handleGuessSubmit() {
    const userInput = currentSelectedPokemon.toLowerCase().trim();

    // Validation : le champ est-il rempli ?
    if (!userInput) {
        shakeInput();
        return;
    }

    // On cherche le Pokémon par nom français OU par nom anglais (interne)
    const foundPokemon = allPokemonNames.find(p =>
        p.frName.toLowerCase() === userInput || p.name === userInput
    );

    // Validation : ce Pokémon existe-t-il dans notre liste ?
    if (!foundPokemon) {
        shakeInput();
        showInputError("Pokémon introuvable !");
        return;
    }

    const pokemonName = foundPokemon.name; // Le vrai nom interne pour le moteur de jeu

    // Validation : déjà essayé ?
    if (window.PokemonGame.hasAlreadyGuessed(pokemonName)) {
        shakeInput();
        showInputError("Déjà essayé !");
        return;
    }

    // Réinitialisation de l'input
    inputEl.value          = "";
    currentSelectedPokemon = "";

    await playTurn(pokemonName, false);
}

/**
 * Joue le tour complet (utilisé par la saisie ET par la restauration de sauvegarde).
 * @param {string} pokemonName - Nom interne du Pokémon
 * @param {boolean} isRestoring - Vrai si on est en train de recharger une sauvegarde
 */
async function playTurn(pokemonName, isRestoring = false) {
    // ── Chargement ──────────────────────────────────────────────────
    setLoading(true);
    if (!isRestoring) guessBtnEl.disabled = true;

    try {
        // Soumission à la logique de jeu (sauvegarde auto dans game.js)
        const result = await window.PokemonGame.makeGuess(pokemonName);

        // Affichage de la ligne de résultat
        addGuessRow(result.pokemon, result.comparison, isRestoring);
        updateAttemptsCounter();

        // Gestion du bouton Indice
        if (window.PokemonGame.gameState.hintUnlocked && !window.PokemonGame.gameState.hintShown && !result.isGameOver) {
            const delay = isRestoring ? 0 : (9 * 120 + 600); // On attend les flips si ce n'est pas une restauration
            setTimeout(() => {
                hintBtnContainerEl.hidden = false;
            }, delay);
        }

        // Fin de partie ?
        if (result.isGameOver) {
            hintBtnContainerEl.hidden = true; // On cache le bouton si la partie est finie
            const flipEndDelay = isRestoring ? 0 : (8 * 120 + 700);
            setTimeout(() => showEndGame(result.isWon), flipEndDelay);
        } else if (!isRestoring) {
            // La partie continue : on réactive le bouton
            guessBtnEl.disabled = false;
        }

    } catch (error) {
        console.error("[Pokémondle] Erreur lors de l'essai :", error);
        if (!isRestoring) {
            showInputError("Erreur réseau, réessaie !");
            guessBtnEl.disabled = false;
        }
    } finally {
        setLoading(false);
    }
}

// ─── Utilitaires UI ───────────────────────────────────────────────────────────

/**
 * Affiche / masque l'indicateur de chargement.
 * @param {boolean} isLoading
 */
function setLoading(isLoading) {
    loadingEl.hidden = !isLoading;
}

/**
 * Déclenche l'animation de secousse sur l'input (erreur de saisie).
 */
function shakeInput() {
    inputEl.classList.remove("shake");
    // On force le reflow pour que l'animation se rejoue même si déjà active
    void inputEl.offsetWidth;
    inputEl.classList.add("shake");
}

/**
 * Affiche un message d'erreur temporaire dans le placeholder de l'input.
 * @param {string} message
 */
function showInputError(message) {
    const original         = inputEl.placeholder;
    inputEl.placeholder    = message;
    inputEl.style.color    = "#e74c3c";

    setTimeout(() => {
        inputEl.placeholder  = original;
        inputEl.style.color  = "";
    }, 1800);
}

/**
 * Copie dans le presse-papier un récapitulatif des essais
 * sous forme d'emojis (style Wordle).
 */
function shareResults() {
    const { guesses } = window.PokemonGame.gameState;
    const count       = guesses.length;
    const maxAttempts = window.PokemonGame.MAX_ATTEMPTS;
    const target      = window.PokemonGame.getTargetPokemon();
    const isWon       = window.PokemonGame.gameState.isWon;

    // Mise à jour de l'ordre des emojis pour correspondre aux nouvelles colonnes
    const lines = guesses.map(({ comparison }) => {
        const keys = ["type1","type2","stage","fullyEvolved","weightKg","heightM","color","generation"];
        return keys.map(k => comparison[k].correct ? "🟩" : "🟥").join("");
    });

    const header = `Pokémondle — ${new Date().toLocaleDateString("fr-FR")}\n`;
    const score  = isWon ? `${count}/${maxAttempts}` : `X/${maxAttempts}`;
    const reveal = isWon ? "" : `\nC'était : ${target.displayName}`;
    const text   = `${header}${score}${reveal}\n\n${lines.join("\n")}`;

    navigator.clipboard.writeText(text).then(() => {
        resultShareBtnEl.textContent = "Copié ! ✅";
        setTimeout(() => {
            resultShareBtnEl.textContent = "Partager 📋";
        }, 2000);
    }).catch(() => {
        // Fallback si clipboard API n'est pas disponible
        alert(text);
    });
}

/**
 * Tente de deviner l'ID Pokémon depuis son nom pour les mini-sprites
 * de l'autocomplétion.
 *
 * @param {string} name - Le nom interne anglais
 * @returns {number}
 */
function getPokemonIdFromName(name) {
    const index = allPokemonNames.findIndex(p => p.name === name);
    return index >= 0 ? index + 1 : 1;
}

// ─── Enregistrement des événements ───────────────────────────────────────────

/**
 * Enregistre tous les écouteurs d'événements de la page.
 * Appelé une seule fois au démarrage.
 */
function registerEventListeners() {

    // ── Saisie dans l'input ─────────────────────────────────────────
    inputEl.addEventListener("input", (event) => {
        const query = event.target.value;
        currentSelectedPokemon = query.toLowerCase().trim();

        // Activation/désactivation du bouton selon si l'input est vide
        guessBtnEl.disabled = !query.trim();

        updateAutocomplete(query);
    });

    // ── Navigation clavier dans l'autocomplétion ────────────────────
    inputEl.addEventListener("keydown", (event) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                navigateAutocomplete("down");
                break;

            case "ArrowUp":
                event.preventDefault();
                navigateAutocomplete("up");
                break;

            case "Enter":
                // Si une suggestion est sélectionnée, on valide la suggestion
                // Sinon, on soumet directement l'essai
                if (selectedSuggestionIndex >= 0) {
                    const items = autocompleteListEl.querySelectorAll(".autocomplete-item");
                    if (items[selectedSuggestionIndex]) {
                        selectSuggestion(items[selectedSuggestionIndex].dataset.name);
                    }
                } else {
                    handleGuessSubmit();
                }
                break;

            case "Escape":
                closeAutocomplete();
                break;
        }
    });

    // ── Clic sur une suggestion ─────────────────────────────────────
    autocompleteListEl.addEventListener("click", (event) => {
        // On remonte le DOM depuis l'élément cliqué pour trouver l'item
        const item = event.target.closest(".autocomplete-item");
        if (item && item.dataset.name) {
            selectSuggestion(item.dataset.name);
        }
    });

    // ── Fermeture de l'autocomplétion au clic extérieur ────────────
    document.addEventListener("click", (event) => {
        if (
            !inputEl.contains(event.target)
            && !autocompleteListEl.contains(event.target)
        ) {
            closeAutocomplete();
        }
    });

    // ── Bouton Valider ──────────────────────────────────────────────
    guessBtnEl.addEventListener("click", handleGuessSubmit);

    // ── Boutons Action (Partager / Indice) ──────────────────────────
    resultShareBtnEl.addEventListener("click", shareResults);

    hintBtnEl.addEventListener("click", () => {
        window.PokemonGame.gameState.hintShown = true;
        window.PokemonGame.saveState();
        hintBtnContainerEl.hidden = true;
        showHint();
    });
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Point d'entrée principal.
 * Lance le chargement du jeu et met en place l'interface.
 */
async function init() {
    // Affichage du chargement pendant l'initialisation
    setLoading(true);
    inputEl.disabled     = true;
    guessBtnEl.disabled  = true;

    try {
        // Initialisation du jeu (charge le Pokémon du jour)
        await window.PokemonGame.initGame();

        // Récupération de la liste des noms (avec traduction) pour l'autocomplétion
        allPokemonNames = await window.PokemonAPI.fetchAllPokemonNamesFR();

        // Mise en place des événements
        registerEventListeners();

        // ── Restauration de la sauvegarde (LocalStorage) ──
        const savedState = window.PokemonGame.loadSavedState();
        if (savedState && savedState.guesses.length > 0) {
            console.info("[Pokémondle] Restauration de la sauvegarde du jour...");

            // On restaure la variable avant de rejouer les tours
            window.PokemonGame.gameState.hintShown = savedState.hintShown;

            // On rejoue instantanément tous les essais sauvegardés
            for (const name of savedState.guesses) {
                await playTurn(name, true);
            }

            // Si le joueur avait déjà affiché l'indice avant de rafraîchir
            if (window.PokemonGame.gameState.hintShown && !window.PokemonGame.gameState.isOver) {
                hintBtnContainerEl.hidden = true;
                showHint();
            }
        }

        // Activation de l'interface si la partie n'est pas déjà finie
        if (!window.PokemonGame.gameState.isOver) {
            inputEl.disabled = false;
            inputEl.focus();
        }

        console.info("[Pokémondle] Jeu initialisé avec succès !");

    } catch (error) {
        console.error("[Pokémondle] Erreur d'initialisation :", error);

        // Message d'erreur dans l'interface
        resultTextEl.textContent =
            "⚠️ Impossible de charger le jeu. Vérifie ta connexion et recharge la page.";
        resultBannerEl.hidden    = false;

    } finally {
        setLoading(false);
    }
}

// ─── Démarrage au chargement du DOM ──────────────────────────────────────────
// On attend que le DOM soit entièrement parsé avant de chercher les éléments.
document.addEventListener("DOMContentLoaded", init);