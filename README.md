# 影 AaKATSUKI 影 · Plateforme du clan CODM

Application web mobile-first pour gérer le clan : inscriptions, membres, points, classements, tournois, récompenses, annonces, discipline et journal d'activité. Le blason du clan est affiché en relief 3D (Three.js) en page d'accueil.

Serveur Node.js **sans aucune dépendance npm** : base SQLite intégrée à Node, mots de passe scrypt, sessions en cookie HttpOnly.

## Lancer en local

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm run dev
```

Puis ouvrir http://localhost:3000. Au premier démarrage, la base `data/akatsuki.db` est créée avec les 27 membres du clan (liste dans `server/roster.js`) et la feuille `data/identifiants.txt` donne l'identifiant et le mot de passe provisoire de chacun.

### Comptes des membres

Chaque membre a son propre compte :
- **Identifiant** : simple à taper, sans le 影 ni les symboles (`minato`, `hiruzen`, `kenshin`…). L'adresse e-mail est facultative.
- **Mot de passe provisoire** : à la première connexion, l'appli demande d'en choisir un. Rien d'autre n'est possible avant.
- **Rôles de départ** : 影AK-MINATO影 est super administrateur (maître de clan), [1MMpTggoX++ et 影AK-KİNG sont administrateurs (adjoints). Le reste se change dans la fiche du membre.
- **Points** : tout le monde démarre à zéro. Les étoiles du jeu ne sont pas importées.

La feuille `identifiants.txt` n'est écrite qu'une fois, au tout premier démarrage, et n'est lisible que par le compte du serveur. Envoie chaque accès en message privé, puis supprime le fichier. Pour un membre qui a perdu son accès : Administration → Membres → sa fiche → « Réinitialiser son mot de passe », puis « Copier le message à envoyer ».

Les nouveaux joueurs s'inscrivent eux-mêmes depuis « Rejoindre » en choisissant leur identifiant, puis un responsable valide leur compte.

Pour tester sur ton téléphone (même Wi-Fi) : `HOST=0.0.0.0 npm run dev`, puis ouvre `http://<ip-de-ton-ordinateur>:3000` sur le téléphone.

### Mode démonstration (facultatif)

`DEMO=1 DATA_DIR=data-demo npm run dev` lance une copie fictive avec des points, tournois et récompenses déjà remplis, pour montrer l'appli sans toucher aux vrais comptes.

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Super administrateur (Kurogane) | kurogane | Akatsuki2026! |
| Membre (Yoru) | yoru | Membre2026! |

En mode démo, la page Connexion affiche deux boutons d'accès direct, et le super admin peut réinitialiser les données depuis le menu « Moi ». Sans `DEMO=1`, ces comptes, ces boutons et la réinitialisation n'existent pas.

### Tests

```bash
npm test
```

24 tests d'intégration démarrent un vrai serveur sur une base temporaire et vérifient notamment : aucune fuite de hachés ou d'e-mails, refus d'attribution de points par un membre, rôles non modifiables par soi-même, anti-doublon, historique en ajout seul, débit des récompenses, CSRF, limitation des tentatives de connexion, persistance après redémarrage, et les notifications push de bout en bout (un faux service de push reçoit le message, le test le déchiffre comme un téléphone et vérifie la signature).

## Ce qui est couvert (cahier des charges)

| Phase | Fonctions |
|---|---|
| 1 | Inscription en 3 étapes (statut En attente), connexion, profils, tableau de bord membre, espace admin, attribution individuelle et collective des points, anti-doublon par activité, corrections tracées (jamais de suppression), classement général, historique avec solde avant/après |
| 2 | Calendrier hebdomadaire configurable, séances générées automatiquement, inscriptions aux séances, tournois (8 types, 6 statuts), inscriptions individuelles et en équipe (rejoindre une équipe si autorisé), validation/retrait des inscrits, matchs et scores, validation des résultats avec attribution automatique des points |
| 3 | Catalogue (coût, stock, période, image, statut), demandes avec points réservés, accepter / refuser avec motif / mettre en attente / confirmer la remise, débit à l'acceptation, distinctions, proposition automatique du MVP du mois (remise confirmée à la main) |
| 4 | Saisons (archivage, points permanents vs saisonniers, solde conservé ou remis à zéro), 10 classements (saison, général, semaine, mois, mois dernier, MJ, BR, snipers, AR/SMG, régularité), notifications internes, statistiques sur 8 semaines |
| Transverse | 7 rôles, matrice de permissions modifiable par le super admin, périmètres MJ/BR pour les responsables, sanctions et historique disciplinaire, journal général en lecture seule |

## Appli installable (PWA)

Le site s'installe comme une appli :
- **Android (Chrome)** : bouton « Installer » sur l'accueil, le tableau de bord et dans « Moi ».
- **iPhone (Safari)** : le même bouton affiche les étapes (Partager, puis « Sur l'écran d'accueil »).

Une fois installée, elle s'ouvre en plein écran avec le blason comme icône, et des raccourcis vers Classement, Tournois et Récompenses (appui long sur l'icône, Android).

**Hors ligne** : le service worker (`sw.js`) garde le site, la 3D, les polices et le dernier état du clan. Sans réseau, l'appli s'ouvre en lecture seule avec un bandeau « Hors ligne » ; les actions sont refusées avec un message clair. Ces données locales sont effacées à la déconnexion.

**Mises à jour** : connecté, le site charge toujours la dernière version. Quand `sw.js` lui-même change, un bandeau « Mettre à jour » apparaît. Si tu modifies la liste des fichiers mis en cache dans `sw.js`, change aussi `VERSION`.

L'installation exige le HTTPS en production (le développement en `localhost` fonctionne sans).

## Notifications sur le téléphone

Chaque membre active les notifications depuis la page **Notifications** (ou la carte du tableau de bord). Elles arrivent même appli fermée, et toucher la notification ouvre la bonne page.

Envoyées automatiquement :
- **pour le membre** : points reçus ou retirés, inscription validée ou refusée, inscription à un tournoi validée, rappel 24 h avant un tournoi, demande de récompense acceptée, refusée ou remise, distinction, sanction, changement de statut ou de rôle ;
- **pour tout le clan** : nouveau membre validé, ouverture des inscriptions d'un tournoi, résultats publiés, nouvelle séance programmée, annonce, nouveau règlement, nouvelle saison, et le **classement de la semaine** (podium) le dimanche à partir de 20 h. Un responsable peut aussi l'envoyer à la main depuis Administration → Vue d'ensemble.

Compatibilité :
- **Android** : Chrome, Edge, Firefox, Samsung Internet, installée ou non.
- **iPhone (iOS 16.4 ou plus récent)** : uniquement depuis l'appli installée sur l'écran d'accueil. L'appli l'explique au membre.
- **Ordinateur** : Chrome, Edge, Firefox, Safari.

Fonctionnement : norme Web Push (chiffrement RFC 8291, identification VAPID RFC 8292), implémentée sans dépendance et vérifiée contre le vecteur de test officiel. C'est gratuit : les messages passent par les services de Google, Apple, Mozilla ou Microsoft, et le serveur refuse d'envoyer ailleurs. Une notification ne part qu'une fois l'opération enregistrée. Un téléphone désabonné est retiré automatiquement, et la déconnexion coupe les notifications de ce compte sur l'appareil.

**Important en production** :
- La clé VAPID est créée au premier démarrage dans `DATA_DIR/vapid.json`. Garde-la avec les sauvegardes : si elle change, tous les membres devront réactiver les notifications.
- Mets `PUSH_SUBJECT=mailto:ton-adresse@exemple.com` (Apple exige un contact valide).

## Sécurité

- **Mots de passe** : scrypt avec sel aléatoire, comparaison en temps constant. 8 caractères minimum, avec lettres et chiffre.
- **Sessions** : jeton aléatoire de 256 bits en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS. Seule l'empreinte SHA-256 du jeton est stockée. Durée 30 jours. Changer son mot de passe déconnecte les autres appareils.
- **Permissions côté serveur** : chaque écriture passe par une liste blanche de 35 opérations (`/api/rpc/:nom`), dont les paramètres sont vérifiés, puis par les règles métier de `js/core.js`, qui contrôlent le rôle de l'utilisateur connecté. Le navigateur ne peut rien modifier directement.
- **Données envoyées** : `server/snapshot.js` filtre selon le visiteur. Un visiteur ne reçoit ni e-mail, ni UID, ni haché, ni membre en attente. Un membre ne voit que ses propres notifications, demandes et sanctions. Le journal est réservé à la permission « journal ».
- **Historique infalsifiable** : des déclencheurs SQL refusent toute modification ou suppression dans `point_transactions` et `audit_logs`, même avec un accès direct à la base. Une correction crée une opération inverse motivée.
- **Requêtes** : JSON obligatoire et contrôle d'origine (protection CSRF), taille limitée à 1 Mo, clés `__proto__` rejetées, images limitées à 300 Ko (JPEG, PNG ou WebP).
- **Limitation** : 8 échecs de connexion par compte et 30 par adresse IP en 15 minutes, 5 inscriptions par heure et par IP.
- **En-têtes** : Content-Security-Policy stricte (aucun script en ligne hors importmap hachée), HSTS en HTTPS, `nosniff`, interdiction d'intégration en iframe.
- **Fichiers** : seuls `index.html`, `css/`, `js/` et `assets/` sont servis. Le code serveur et la base ne sont jamais accessibles.

## Mettre en ligne (VPS CloudPanel + GitHub Actions)

À chaque push sur `main`, le workflow `.github/workflows/ci-cd.yml` :
1. lance les tests (aussi sur chaque pull request) ;
2. copie la nouvelle version sur le VPS dans `~/aakatsuki/releases/<commit>` ;
3. bascule `~/aakatsuki/current` dessus, redémarre le site avec pm2 et vérifie que c'est bien la nouvelle version qui répond. Sinon, il revient tout seul à la version précédente. Les 5 dernières versions sont gardées.

Les données (base, sauvegardes, clés des notifications) sont dans `~/aakatsuki/shared/data` : un déploiement n'y touche jamais.

### Une seule fois : créer le site dans CloudPanel

1. **Sites → Add Site → Create a Node.js Site** : ton domaine, **Node.js 22**, **App Port 3000**, un utilisateur de site (par exemple `aakatsuki`).
2. Dans le site, **SSL/TLS → Actions → New Let's Encrypt Certificate**, une fois le domaine pointé vers l'IP du VPS. Le HTTPS est obligatoire pour l'appli installable et les notifications.

CloudPanel sert alors le domaine en HTTPS et transmet tout au site sur `127.0.0.1:3000`.

### Une seule fois : préparer le VPS

Depuis le dossier du projet, envoie le script, puis lance-le en root avec le nom de l'utilisateur du site :

```bash
scp deploy/setup-cloudpanel.sh root@TON_VPS:/root/
```

```bash
ssh root@TON_VPS bash /root/setup-cloudpanel.sh aakatsuki
```

Le script vérifie Node.js 22.13 ou plus, installe pm2 et le redémarrage automatique au boot, crée `~/aakatsuki` et son fichier de réglages `shared/.env`, crée une clé SSH réservée à GitHub, puis affiche les valeurs des secrets. Si le port de l'appli n'est pas 3000 ou si SSH n'écoute pas sur 22 : `bash /root/setup-cloudpanel.sh aakatsuki 3000 2222`.

Modifie ensuite `/home/aakatsuki/aakatsuki/shared/.env` : `TZ` (fuseau du clan) et `PUSH_SUBJECT` (adresse de contact).

### Une seule fois : les secrets GitHub

Dans le dépôt : Settings → Environments → New environment `production`, puis ajoute ces secrets :

| Secret | Valeur |
|---|---|
| `VPS_HOST` | IP du VPS |
| `VPS_USER` | l'utilisateur du site CloudPanel |
| `VPS_SSH_KEY` | la clé privée affichée par le script |
| `VPS_KNOWN_HOSTS` | les lignes d'empreinte affichées par le script |
| `VPS_PORT` | seulement si SSH n'écoute pas sur le port 22 |

Facultatif : une variable `APP_DIR` si le site n'est pas dans `~/aakatsuki`. Tu peux aussi exiger ton approbation avant chaque mise en ligne (« Required reviewers » dans l'environnement `production`).

Puis relance le workflow : Actions → CI/CD → Run workflow.

### Premier démarrage en ligne

La base est créée avec un compte par membre de `server/roster.js`. Les mots de passe provisoires sont nouveaux, différents de ceux de ton ordinateur. Lis la feuille, distribue les accès, puis supprime-la :

```bash
ssh root@TON_VPS cat /home/aakatsuki/aakatsuki/shared/data/identifiants.txt
```

```bash
ssh root@TON_VPS rm /home/aakatsuki/aakatsuki/shared/data/identifiants.txt
```

Garde aussi une copie de `shared/data/vapid.json` : sans lui, tous les membres devraient réactiver les notifications.

### Commandes utiles sur le VPS

Connecté avec l'utilisateur du site : `pm2 logs aakatsuki` (journal), `pm2 status` (état), `pm2 restart aakatsuki` (redémarrer).

### Sans CloudPanel

Le `Dockerfile` reste disponible pour un hébergement avec Docker : `docker build -t aakatsuki .` puis `docker run -d --env-file .env -p 127.0.0.1:3000:3000 -v aakatsuki-data:/data aakatsuki`.

### Sauvegardes

Une copie complète de la base est faite au démarrage puis toutes les 24 heures dans `DATA_DIR/backups/` (14 conservées, `BACKUP_KEEP` pour changer). Pour restaurer : arrêter le serveur, remplacer `akatsuki.db` par une sauvegarde, supprimer `akatsuki.db-wal` et `akatsuki.db-shm`, redémarrer. Copie aussi ces sauvegardes ailleurs (stockage externe) : si le disque du serveur est perdu, elles le sont aussi.

## Structure

```
index.html, css/app.css, assets/   site (design system, blason)
js/core.js           règles métier partagées : permissions, points, classements, tournois, récompenses
js/api.js            client : lit l'état envoyé par le serveur, envoie les écritures à l'API
js/main.js, js/ui.js, js/views/   routeur, composants et pages
js/scene3d.js        scène Three.js (blason en relief, nuages, lune, braises)
server/index.js      serveur HTTP : API, sessions, fichiers, en-têtes de sécurité, tâches planifiées
server/store.js      SQLite : une table par entité, écriture transactionnelle, sauvegardes
server/auth.js       scrypt, sessions, limitation des tentatives
server/snapshot.js   filtrage des données par visiteur
server/roster.js     membres du clan créés au premier démarrage
server/seed.js       comptes du clan / données de démonstration
test/api.test.js     tests d'intégration
.github/workflows/   CI/CD : tests, puis déploiement sur le VPS
deploy/              préparation du VPS CloudPanel, mise en service d'une version
```

Tâches automatiques (toutes les heures) : création des séances des deux semaines à venir à partir du calendrier type, rappel des tournois 24 heures avant, purge des sessions expirées.

## Limites connues et suites possibles

- Un seul serveur : la limitation des tentatives est en mémoire, et SQLite convient largement à un clan (des milliers d'opérations). Pour plusieurs serveurs, il faudrait passer à PostgreSQL ; `server/store.js` est le seul fichier à remplacer.
- L'état complet autorisé est renvoyé après chaque action (compressé). C'est adapté à quelques centaines de membres ; au-delà, paginer l'historique des points.
- Mot de passe oublié : un responsable (permission « gérer les membres ») génère un mot de passe provisoire depuis la fiche du membre. La réinitialisation automatique par e-mail n'est pas faite (il faudrait un service d'e-mail comme Resend ou Brevo).
- Intégration Discord ou WhatsApp pour les notifications : non faite.
