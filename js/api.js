/**
 * api.js — Couche d'accès à PokéAPI
 * ==================================
 * Responsabilité UNIQUE : communiquer avec PokéAPI et retourner
 * des données propres et structurées. Aucune logique de jeu ici.
 *
 * Stratégie de cache :
 * On utilise deux Map JavaScript (dictionnaires) pour éviter
 * de refaire le même appel réseau deux fois dans la même session.
 * - pokemonCache  : données complètes d'un Pokémon (par nom)
 * - allNamesCache : liste de tous les noms (chargée une seule fois)
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

/** URL de base de PokéAPI */
const API_BASE_URL = "https://pokeapi.co/api/v2";

/**
 * Nombre total de Pokémon à considérer pour le jeu.
 * 1025 = tous les Pokémon jusqu'à la génération 9 complète (Pecharunt inclus).
 */
const POKEMON_COUNT = 1025;

// ─── Cache en mémoire ──────────────────────────────────────────────────────────

/** @type {Map<string, Object>} Cache des données complètes par nom de Pokémon */
const pokemonCache = new Map();

/** @type {string[] | null} Cache de la liste de tous les noms (anglais/interne) */
let allNamesCache = null;

/** @type {Array<{name: string, frName: string}> | null} Cache de la liste des noms FR */
let allNamesFRCache = null;

// ─── Fonctions utilitaires ─────────────────────────────────────────────────────

/**
 * Effectue un appel GET à l'URL donnée et retourne le JSON parsé.
 * Lève une erreur si la réponse HTTP n'est pas OK (ex: 404).
 *
 * @param {string} url - L'URL à appeler
 * @returns {Promise<Object>} - Le corps JSON de la réponse
 * @throws {Error} - Si la réponse est une erreur HTTP
 */
async function fetchJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status} pour : ${url}`);
    }

    return response.json();
}

// ─── Fonctions de récupération des données ────────────────────────────────────

/**
 * Récupère la liste de tous les noms de Pokémon (jusqu'à POKEMON_COUNT).
 * Résultat mis en cache pour n'appeler l'API qu'une seule fois.
 * (Utilisé par la logique interne du jeu)
 *
 * @returns {Promise<string[]>} - Tableau de noms en minuscules
 */
async function fetchAllPokemonNames() {
    // Si déjà en cache, on retourne directement
    if (allNamesCache !== null) {
        return allNamesCache;
    }

    const data = await fetchJSON(`${API_BASE_URL}/pokemon?limit=${POKEMON_COUNT}`);

    // On ne garde que les noms (l'API retourne des objets {name, url})
    allNamesCache = data.results.map(p => p.name);

    return allNamesCache;
}

/**
 * Récupère la liste de tous les noms avec leur traduction française pour l'autocomplétion.
 * Utilise l'API GraphQL pour tout récupérer en une seule requête.
 * Gère les différentes versions de l'API (v1beta et v1beta2).
 *
 * @returns {Promise<Array<{name: string, frName: string}>>}
 */
async function fetchAllPokemonNamesFR() {
    if (allNamesFRCache !== null) return allNamesFRCache;

    try {
        // Essai 1 : L'URL officielle stable (v1beta2)
        // Attention à bien utiliser _eq et _lte pour la syntaxe Hasura
        const queryV2 = `
        query {
            pokemon_species(where: {id: {_lte: ${POKEMON_COUNT}}}, order_by: {id: asc}) {
                name
                pokemon_species_names(where: {language_id: {_eq: 5}}) {
                    name
                }
            }
        }`;

        const response2 = await fetch("https://graphql.pokeapi.co/v1beta2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queryV2 })
        });

        if (!response2.ok) throw new Error("GraphQL v1beta2 injoignable");

        const json2 = await response2.json();
        if (json2.errors) throw new Error("Erreur de requête GraphQL v1beta2");

        allNamesFRCache = json2.data.pokemon_species.map(species => {
            const frNameObj = species.pokemon_species_names[0];
            return {
                name: species.name, // Nom interne (ex: "bulbasaur")
                frName: frNameObj ? frNameObj.name : capitalizeFirst(species.name) // Affichage (ex: "Bulbizarre")
            };
        });

    } catch (error2) {
        console.warn("[Pokémondle] Erreur sur v1beta2, tentative avec l'ancienne v1beta...", error2);

        try {
            // Essai 2 : L'ancienne norme (v1beta) au cas où la première serait instable
            const queryV1 = `
            query {
                pokemon_v2_pokemonspecies(where: {id: {_lte: ${POKEMON_COUNT}}}, order_by: {id: asc}) {
                    name
                    pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 5}}) {
                        name
                    }
                }
            }`;

            const response = await fetch("https://beta.pokeapi.co/graphql/v1beta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: queryV1 })
            });

            if (!response.ok) throw new Error("GraphQL v1beta injoignable");

            const json = await response.json();
            if (json.errors) throw new Error("Erreur de requête GraphQL v1beta");

            allNamesFRCache = json.data.pokemon_v2_pokemonspecies.map(species => {
                const frNameObj = species.pokemon_v2_pokemonspeciesnames[0];
                return {
                    name: species.name,
                    frName: frNameObj ? frNameObj.name : capitalizeFirst(species.name)
                };
            });

        } catch (error1) {
            console.error("[Pokémondle] Échec total de GraphQL. Fallback vers l'anglais.", error1);
            // Fallback ultime : On charge la liste classique en anglais pour éviter le crash
            const fallbackNames = await fetchAllPokemonNames();
            allNamesFRCache = fallbackNames.map(name => ({
                name,
                frName: capitalizeFirst(name)
            }));
        }
    }

    return allNamesFRCache;
}

/**
 * Récupère les données COMPLÈTES d'un Pokémon (combinaison de plusieurs
 * endpoints PokéAPI) et les met en cache.
 *
 * @param {string} name - Le nom du Pokémon en minuscules (ex: "pikachu")
 * @returns {Promise<PokemonData>} - Objet structuré avec tous les attributs du jeu
 */
async function fetchPokemonData(name) {
    if (pokemonCache.has(name)) {
        return pokemonCache.get(name);
    }

    const pokemonRaw = await fetchJSON(`${API_BASE_URL}/pokemon/${name}`);
    const speciesRaw = await fetchJSON(`${API_BASE_URL}/pokemon-species/${name}`);
    const evoChainRaw = await fetchJSON(speciesRaw.evolution_chain.url);

    // --- Nom en Français ---
    const frNameObj = speciesRaw.names.find(n => n.language.name === "fr");
    const displayName = frNameObj ? frNameObj.name : capitalizeFirst(name);

    // --- Types ---
    const type1 = pokemonRaw.types[0]?.type.name ?? "aucun";
    const type2 = pokemonRaw.types[1]?.type.name ?? null;

    // --- Poids & Taille ---
    const weightKg = pokemonRaw.weight / 10;
    const heightM  = pokemonRaw.height  / 10;

    // --- Couleur principale ---
    const color = speciesRaw.color.name;

    // --- Génération ---
    const generationRaw = speciesRaw.generation.name;
    const generation    = convertRomanToInt(
        generationRaw.replace("generation-", "").toUpperCase()
    );

    // --- Stade d'évolution & entièrement évolué ---
    const { stage, fullyEvolved } = getEvolutionInfo(evoChainRaw.chain, name);

    // --- Sprite officiel ---
    const sprite = pokemonRaw.sprites.front_default;

    const pokemonData = {
        name,
        displayName,
        sprite,
        type1,
        type2,
        stage,
        fullyEvolved,
        color,
        generation,
        weightKg,
        heightM,
    };

    pokemonCache.set(name, pokemonData);

    return pokemonData;
}

/**
 * Analyse récursivement la chaîne d'évolution pour trouver :
 * - Le stade d'évolution du Pokémon cible (1, 2 ou 3)
 * - S'il est entièrement évolué (= dernier maillon de sa branche)
 */
function getEvolutionInfo(chainNode, targetName, depth = 1) {
    if (chainNode.species.name === targetName) {
        return {
            stage:        depth,
            fullyEvolved: chainNode.evolves_to.length === 0,
        };
    }

    for (const nextNode of chainNode.evolves_to) {
        const result = getEvolutionInfo(nextNode, targetName, depth + 1);
        if (result !== null) return result;
    }

    return null;
}

/**
 * Convertit un chiffre romain (I à IX) en entier.
 */
function convertRomanToInt(roman) {
    const table = {
        I: 1, II: 2, III: 3, IV: 4, V: 5,
        VI: 6, VII: 7, VIII: 8, IX: 9,
    };
    return table[roman] ?? 0;
}

/**
 * Met en majuscule la première lettre d'une chaîne.
 */
function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
window.PokemonAPI = {
    fetchAllPokemonNames,
    fetchAllPokemonNamesFR,
    fetchPokemonData,
    POKEMON_COUNT,
};