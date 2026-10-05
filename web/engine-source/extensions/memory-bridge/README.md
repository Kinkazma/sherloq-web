# Mémoire système pour SHERLOQ local

Extension facultative Chromium, permission unique `system.memory`. Aucun cookie,
stockage, script injecté, accès aux onglets, lecteur de fichiers ou calcul de sonde.
Elle accepte uniquement les demandes explicites de `http://localhost` et
`http://127.0.0.1`, via le protocole `sherloq-system-memory-v1`.

Dans `chrome://extensions`, activer le mode développeur puis charger ce dossier
comme extension non empaquetée. Copier son identifiant. Le site appelle :

```js
import {readExtensionMemoryHints} from './src/index.js';
import {createWorkerEngine} from './src/worker-client.js';
const resourceHints = await readExtensionMemoryHints(extensionId);
const engine = createWorkerEngine({
  computeProfile: 'maximum', resourceHints, memoryExtensionId: extensionId
});
```

`createWorkerEngine` est exporté par `src/worker-client.js` si l'intégration
importe directement ce module. Faire la lecture juste avant de créer le moteur :
une observation âgée de plus de cinq secondes n'est pas utilisée. Si l'extension
n'est pas présente, ne pas fournir d'identifiant : le fonctionnement portable
reste disponible. Une erreur de permission/communication est rapportée au
client ; elle doit être traitée par son interface avant de choisir le repli.

Pendant un calcul actif, le client relit l'extension toutes les deux secondes,
sans chevauchement. Le moteur réévalue les futures admissions et les caches ;
il confirme les hausses sur deux observations et ignore les petites variations.
Les réservations actives restent valides. Une perte de l'extension conserve le
dernier budget ; elle n'annule pas le calcul. L'API `updateResourceHints(hints)`
permet aussi de transmettre explicitement une observation fraîche.

La mémoire disponible est un instantané système, pas une réservation ni un quota
Chromium. Les limites d'une allocation, de WASM et de WebGPU restent distinctes.
Le profil maximum applique sa fraction de 80 % à cet instantané ; il conserve
le nombre de workers issu du matériel. Aucune baisse permanente de parallélisme.

Le runner autonome accepte `SHERLOQ_MEMORY_EXTENSION=1`. Il charge alors la copie
figée de l'extension dans son profil temporaire, transmet les observations au
moteur et supprime ce profil à la fin. Le drapeau de débogage des extensions est
réservé à cette installation de développement ; il n'est pas requis pour une
extension chargée manuellement. Rien n'est installé dans le profil personnel.

Validation : `node scripts/check-memory-extension-browser.mjs`.
Documentation de l'API : https://developer.chrome.com/docs/extensions/reference/api/system/memory
