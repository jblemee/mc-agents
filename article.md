# Quand les IA apprennent de leurs erreurs (et qu'Opus joue dans une autre ligue)

*Suite de [Quand des IA survivent dans Minecraft et écrivent leur propre code](https://blog.ut0pia.org/quand-des-ia-survivent-dans-minecraft-et-ecrivent-leur-propre-code)*

---

Dans le premier article, on avait lâché neuf LLM dans un monde Minecraft. Ils écrivaient du JavaScript, mouraient beaucoup, et parfois ils survivaient. Charlie avait accumulé 14 outils. Alice avait du fer. Frank mourrait encore.

Depuis, tout a changé. Pas parce que les agents sont devenus plus intelligents. Parce qu'on a arrêté de les laisser mourir bêtement.

## Le problème : les agents meurent plus vite qu'ils ne pensent

Le constat était brutal. Un cycle LLM, le temps que le modèle reçoive l'état du monde, réfléchisse, écrive du JavaScript, et que le bot l'exécute, prend entre 30 secondes et 3 minutes. Pendant ce temps, le monde Minecraft continue. Les zombies attaquent. La faim baisse. Le creeper explose.

Un agent affamé a beau avoir le plan parfait pour crafter une iron_pickaxe, il meurt de faim avant que le LLM ait fini d'écrire la première ligne de code.

La solution : arrêter de tout confier au LLM.

## Réflexes et stratégie

Un humain qui joue à Minecraft ne réfléchit pas avant de manger. Il ne calcule pas s'il doit fuir un creeper. Ces gestes sont automatiques, du système 1, dirait Kahneman. Le cortex préfrontal, lui, s'occupe de décider où construire la base, quels minerais chercher, comment organiser le coffre.

Nos agents n'avaient que du système 2. Tout passait par le LLM : manger, fuir, miner, planifier. Comme un conducteur débutant qui pense consciemment à chaque mouvement du volant. Ça marche, mais c'est lent, et à la moindre surprise on cale.

On a donc séparé les deux.

Le bot Node.js tourne en permanence et gère les réflexes. Toutes les 5 secondes, il vérifie la faim -- sous 14/20, il mange ce qu'il trouve. Quand il prend des dégâts d'un mob, il réagit dans la seconde : il attaque s'il peut, fuit sinon. Et en dernier recours, la nuit, HP bas, pas d'arme, mob proche, il creuse et se couvre. Le LLM n'est même pas au courant que ça s'est passé.

Le LLM, lui, garde le contrôle de la stratégie. Il planifie les chaînes de crafting, décide où miner, coordonne avec les autres. Mais il n'a plus besoin de penser à manger ou à fuir. Comme un conducteur expérimenté : les réflexes gèrent la pédale et le volant, le cerveau se concentre sur l'itinéraire.

## Des outils au lieu de connaissances brutes

L'ancien système injectait des pages de documentation Mineflayer dans le prompt. Le LLM devait lire, comprendre, puis écrire du JavaScript brut. Ça marchait, parfois. Souvent ça donnait des `Vec3 is not defined` ou des timeouts.

C'est un peu comme donner un manuel de mécanique à quelqu'un et lui demander de changer une roue. Ça va marcher, mais ce sera long et il y aura des erreurs. Mieux vaut lui donner une clé en croix et dire "dévisse les boulons".

On a remplacé les pages de doc par des outils partagés. Chaque outil a un nom, une description, des prérequis, et ce qu'il produit :

```text
mine -- Mine N blocks of a given type.
  Requires: Pickaxe for stone/ore, axe for wood
  Provides: Mined blocks in inventory
```

Le LLM ne voit plus du code à imiter, il voit un catalogue d'outils avec leurs prérequis. Au lieu d'écrire 50 lignes de Mineflayer brut, l'agent écrit :

```javascript
await tools.mine({ block: 'stone', count: 11 })
await tools.craft({ item: 'furnace', count: 1 })
await tools.smelt({ item: 'raw_iron', count: 3 })
```

Trois lignes. Plus de `Vec3 is not defined` à 3h du matin.

C'est la même logique que les réflexes, mais à un autre niveau. Les réflexes sont de la mémoire procédurale, le corps sait comment faire sans y penser. Les outils sont de la mémoire sémantique, on sait que ça existe et ce que ça fait, sans connaître les détails. Le LLM n'a besoin que de la mémoire épisodique : se souvenir de ce qui s'est passé et décider quoi faire ensuite.

## Les bugs qu'on ne voit qu'en regardant jouer

La théorie c'est bien. Mais les vrais problèmes, on ne les trouve qu'assis devant le jeu, en regardant un bot faire n'importe quoi.

Eve a attaqué un objet au sol et s'est fait kick du serveur. Ses réflexes ne faisaient pas la différence entre un zombie et un bout de bois -- comme un chat qui bondit sur une chaussette. Grace a essayé de couper 8 arbres, échoué 8 fois sur le même arbre inaccessible, et déclaré forfait. Comme quelqu'un qui pousse une porte marquée "tirez", encore et encore. Alice a creusé un shelter et s'est retrouvée *plus haut* qu'avant -- le code creusait tous les blocs d'un coup, mais le bot ne tombait pas dans le trou.

Des bugs bêtes. Mais des bugs qu'aucun test unitaire ne trouve. Il faut regarder l'agent jouer, en temps réel, pour voir qu'il s'acharne sur le mauvais arbre ou qu'il tape sur un objet inerte.

## La grande comparaison : GLM-4.7 vs GLM-5 vs Sonnet vs Opus

Six agents en parallèle. Trois sur Claude Sonnet 4.6, trois sur GLM-5. Puis un agent seul sur Claude Opus 4.6. Même monde, même spawn, même system prompt.

### GLM-4.7 : le stagiaire zélé

Le modèle par défaut, le moins cher. Il écrit du code, beaucoup de code. Trop de code. Il génère du JavaScript brut avec des variables non définies, oublie les `await`, et écrit parfois quatre fois dans le même fichier. Chaque écriture écrase la précédente.

C'est l'enfant qui lève la main avant que le prof ait fini la question. Plein d'énergie, pas assez de réflexion.

Taux de survie au premier cycle : ~50%.

### GLM-5 : le stagiaire qui a appris

Nettement mieux. Il structure ses actions, utilise les outils correctement, et panique moins. Mais quand quelque chose échoue, il essaie de coder la solution lui-même au lieu d'utiliser un autre outil. Et là, ça casse.

Charlie (GLM-5) est resté coincé pendant 3 cycles complets dans son trou de shelter, incapable de placer un furnace. Il avait creusé un espace tellement étroit qu'il n'y avait pas de surface libre pour poser quoi que ce soit. Pas la présence d'esprit de creuser un bloc de plus.

Taux de survie au premier cycle : ~70%.

### Claude Sonnet 4.6 : le planificateur

Sonnet réfléchit. Peut-être trop. Il scanne, re-scanne, propose une base dans le chat, re-scanne, propose une autre base. La moitié de son cycle passe en communication.

Mais quand il agit, c'est solide. Bob a récolté 21 raw_iron en un cycle et demi. Alice avait une iron_pickaxe et un plan de ferme avant la fin de la première nuit. Dave a navigué jusqu'à y=32 pour trouver du fer, le sweet spot exact.

Le vrai avantage de Sonnet, c'est qu'il est social. Les trois agents Sonnet discutaient dans le chat, proposaient des emplacements de base, partageaient des coordonnées. Les GLM-5 travaillaient chacun dans leur coin. Comme la différence entre un open space et des bureaux fermés.

Taux de survie au premier cycle : ~90%.

### Claude Opus 4.6 : le joueur

Puis on a lancé Frank sur Opus. Avec `--effort low` pour ne pas attendre 3 minutes par action.

La différence saute aux yeux. Première action, premier cycle :

```
[THINK] Good start -- got wood, bread, and a sword.
        Time to upgrade tools.
```

```javascript
bot.whisper('Plus200', 'Salut ! Je bosse, je me fais des outils.');
await tools.craft({ item: 'acacia_planks', count: 8 });
await tools.craft({ item: 'stick', count: 4 });
await tools.craft({ item: 'wooden_pickaxe', count: 1 });
await tools.mine({ block: 'stone', count: 11 });
```

Une seule action. Il répond au chat en français, craft la chaîne complète bois-planches-bâtons-pioche, et mine 11 blocs de stone. Sonnet fait ça en 2-3 actions. GLM-5 en 4-5.

Action suivante : il détecte le crépuscule (11493 ticks), shelter immédiat, puis mine du stone pendant la nuit.

Frank n'a pas juste survécu. Il a déroulé un plan sans accrocs, comme s'il avait déjà joué à Minecraft avant. C'est la différence entre quelqu'un qui connaît les règles d'un jeu et quelqu'un qui sait y jouer.

Taux de survie au premier cycle : 100% (échantillon de 1, certes).

### Le tableau

| Modèle | Coût relatif | Actions/cycle utiles | Erreurs de code | Coordination | Survie cycle 1 |
|--------|-------------|---------------------|-----------------|-------------|----------------|
| GLM-4.7 | 1x | 1-2 sur 5 | Fréquentes | Aucune | ~50% |
| GLM-5 | ~2x | 3-4 sur 5 | Occasionnelles | Faible | ~70% |
| Sonnet 4.6 | ~10x | 4-5 sur 5 | Rares | Forte | ~90% |
| Opus 4.6 | ~30x | 5 sur 5 | Aucune observée | N/A (solo) | ~100% |

Sonnet a le meilleur ratio coût/efficacité. Opus est bluffant mais 30 fois plus cher. GLM-5 fait le job quand le budget est serré, à condition de tolérer quelques `Vec3 is not defined` de temps en temps.

## Ce qu'on a appris

Les réflexes ont tout changé. Avant, les agents mouraient de faim ou de mobs pendant que le LLM réfléchissait. Maintenant le taux de survie est passé de ~30% à ~80%. Le parallèle avec la cognition humaine n'est pas juste une métaphore, c'est un vrai principe d'architecture. Séparer ce qui demande de la réflexion de ce qui n'en demande pas, c'est ce que fait chaque organisme vivant. Un lézard n'a pas besoin d'un cortex pour fuir un prédateur. Un LLM n'a pas besoin de 30 secondes de compute pour manger du pain.

Les outils, eux, ont tué la catégorie d'erreurs la plus fréquente. Le LLM n'écrit plus de Mineflayer brut. Il manipule des abstractions. Et comme pour les humains, le niveau d'abstraction auquel on pense détermine la complexité de ce qu'on peut accomplir. Personne ne pense en contractions musculaires quand il fait la cuisine. L'agent ne pense plus en `Vec3` quand il mine du fer.

Ce qui m'a le plus surpris, c'est à quel point le modèle de langage change le "caractère" de l'agent. Les GLM sont des travailleurs solitaires. Les Sonnet sont des bavards organisés. Opus a une aisance qui ressemble presque à de l'intuition. Mêmes réflexes, mêmes outils, mêmes règles, mais des personnalités radicalement différentes. Comme si le poids du modèle changeait le tempérament.

## La question qui reste

L'architecture tient. Les agents survivent, minent, craftent, et certains communiquent. Ils se planquent la nuit et ressortent à l'aube.

Mais une chose manque encore : la collaboration réelle. Les agents parlent de construire une base commune. Ils proposent des coordonnées. Parfois, un agent se déplace même vers le point proposé. Mais personne ne pose le premier bloc ensemble. Personne ne dit "je m'occupe du fer, toi du bois". Chaque agent optimise pour lui-même, dans son propre cycle, avec sa propre mémoire.

On pourrait ajouter un système de tâches partagées. Mais ce serait tricher, un peu. Le but n'est pas de construire un système multi-agent optimal. Le but est de voir ce qui *émerge* quand on laisse des LLM se débrouiller.

Et ce qui émerge, pour l'instant, c'est neuf individualistes qui parlent de coopérer sans jamais vraiment coopérer. Ça ressemble étrangement à un serveur Minecraft classique. Ou à un open space.

---

Frank a son fer. Alice a sa ferme. Charlie est toujours coincé dans son trou. Grace essaie de couper un arbre. Et quelque part underground, Opus planifie déjà le prochain coup.

---

## Sources

- [mc-agents sur GitHub](https://github.com/jblemee/mc-agents)
- [Mineflayer](https://github.com/PrismarineJS/mineflayer)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [GLM-4 / BigModel](https://open.bigmodel.cn/)
- [Premier article](https://blog.ut0pia.org/quand-des-ia-survivent-dans-minecraft-et-ecrivent-leur-propre-code)
