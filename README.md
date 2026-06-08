# Pokémondle

Pokémondle est un projet personnel qui revisite le concept de Wordle en l'adaptant à l'univers de Pokémon. Ce jeu par navigateur met au défi les joueurs de deviner un Pokémon spécifique chaque jour en se basant sur des indices visuels et textuels.

Ce projet a été l'occasion de concevoir une application web complète en Vanilla JavaScript, sans l'utilisation de frameworks complexes, afin de consolider la manipulation du DOM, la gestion d'état et l'optimisation des appels réseau.

---

## 🎮 Fonctionnalités Principales

* **1025 Pokémon disponibles :** Prise en charge de toutes les créatures jusqu'à la 9ème génération.
* **Recherche optimisée en français :** Mise en place d'une barre de saisie avec autocomplétion dynamique. Les données de traduction sont récupérées efficacement en un seul appel via l'API GraphQL de PokéAPI pour garantir la fluidité de l'interface.
* **Défi quotidien synchronisé :** Le Pokémon à deviner change toutes les 24 heures. Grâce à un algorithme déterministe basé sur la date du jour, tous les joueurs partagent le même défi simultanément.
* **Sauvegarde de la progression :** L'état de la partie est enregistré en temps réel dans le `LocalStorage`. En cas de rechargement de la page, les essais précédents sont instantanément restaurés.
* **Système d'indice progressif :** Un indice optionnel (le type du Pokémon) se débloque uniquement après un certain nombre de tentatives infructueuses afin de préserver l'équilibre et la difficulté du jeu.
* **Interface Rétro :** Le design et les animations s'inspirent des interfaces des consoles portables classiques (Game Boy Advance / Nintendo DS), incluant un mode sombre natif pour le confort visuel.

---

## 💻 Technologies Utilisées

Le projet est construit de manière modulaire en respectant une stricte séparation des responsabilités :

* **HTML5 & CSS3 :** * Structure sémantique.
  * Utilisation approfondie de CSS Grid et Flexbox pour la responsivité.
  * Gestion de thème via les variables CSS et animations 3D fluides (retournement des cartes).
* **Vanilla JavaScript (ES6+) :**
  * Appels réseau asynchrones (`fetch`, `async/await`).
  * Manipulation dynamique du DOM.
  * Optimisation des performances via des structures de cache en mémoire (`Map`).
* **API :** Consommation de l'API REST et du point d'accès GraphQL de [PokéAPI](https://pokeapi.co/).

Jouable sous cette Url :
https://ahmed-muhammad7.github.io/Pokedle/

