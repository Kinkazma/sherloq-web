# Mémoire des résultats ELA

Les vues Énergie et Biome partagent les mêmes cartes scientifiques. Leur publication ne doit pas cumuler les réservations du pic de calcul avec trois copies supplémentaires qui ne sont pas créées.

Le contrat `owned-source-copy` distingue les étapes :

1. Le pipeline admet ses tableaux et ses espaces de travail pendant le calcul.
2. Au retour du calcul, la réservation est transférée vers les buffers encore vivants. Les espaces de travail terminés sont libérés. La croissance persistante du heap du codec reste comptée séparément.
3. Une réservation supplémentaire couvre la copie défensive effectivement créée par `structuredClone`. Le destinataire conserve son enveloppe mémoire propre.

Les résultats repris du cache sont retirés temporairement de son inventaire et protégés par une réservation pendant la copie. L’entrée est remise dans le cache après réussite, annulation ou échec. Les sous-vues sont comptées par leur buffer complet ; les alias d’un même buffer ne sont comptés qu’une fois.

Ce contrat est déclaré pour `ela.energy` et l’analyse historique `ela.biomes`, y compris son chemin segmenté. Les autres opérations conservent leur admission existante jusqu’à qualification de leurs propriétaires. Les insuffisances réelles restent signalées.

Les calculs scientifiques, leurs tableaux, les réglages, la résolution et le nombre de workers ne changent pas. Les tests couvrent la parité native, l’indépendance des sorties et du cache, les réservations après échec et annulation, les sous-vues et la croissance du heap.
