/* Paramètres, français : le texte propre à la page (settings/index.html). Les titres de sections partagés avec l’interface restent dans shared/i18n/strings.js (settings.appearance, settings.privacy, ...). Règles : shared/i18n/APPS-HOWTO.md, shared/i18n/glossary-fr.md. */
window.SlopI18n && window.SlopI18n.add('fr', {
  'settings.page.kicker': 'Paramètres',
  'settings.page.home_aria': '{brand}, accueil',
  'settings.page.sections': 'Sections',
  'settings.page.title_lead': 'Vos',
  'settings.page.title_em': 'choix',
  'settings.page.privacy': 'Slopographic fonctionne dans votre navigateur, et vos fichiers ne quittent jamais votre appareil. Vos choix sur cette page sont enregistrés dans le stockage local de ce navigateur, et nulle part ailleurs. Les statistiques et les publicités sont désactivées tant que vous ne les activez pas, et aucun script tiers ne se charge avant. Vous pouvez changer cela à tout moment.',
  'settings.page.agents': 'Agents IA',

  'settings.consent.analytics': 'Statistiques',
  'settings.consent.analytics_help': 'Google Analytics 4 compte les pages vues, ce qui nous permet de voir les applications utilisées. Désactivé par défaut.',
  'settings.consent.ads': 'Publicités',
  'settings.consent.ads_help': 'Google AdSense peut afficher des publicités sur certaines pages. Désactivé par défaut.',

  'settings.defaults.lede': 'Utilisé pour les nouvelles factures, commandes et écritures du journal, ainsi que pour les nombres, les devises et les dates. La langue du texte de l’application n’est pas modifiée par ces réglages.',
  'settings.defaults.currency': 'Devise par défaut',
  'settings.defaults.currency_help': 'La devise de base du grand livre. Les écritures dans d’autres devises gardent leurs montants et sont converties au taux de leur date.',
  'settings.defaults.locale': 'Paramètres régionaux',
  'settings.defaults.locale_help': 'La façon dont les nombres, les devises et les dates sont écrits. Démarre avec la langue de votre navigateur.',

  'settings.folder.title': 'Dossier local',
  'settings.folder.lede': 'Gardez une copie de vos réglages Slopographic dans un dossier de cet ordinateur. C’est le même dossier que Slop Drive utilise, vous pouvez donc le connecter depuis l’un ou l’autre. Les fichiers ne sont écrits que dans ce dossier, et rien n’est envoyé ailleurs.',
  'settings.folder.see_files': 'Pour voir les fichiers de ce dossier :',
  'settings.folder.open_drive': 'Ouvrir Slop Drive',

  'settings.storage.title': 'Stockage',
  'settings.storage.lede': 'L’espace que ce site occupe dans votre navigateur, et ce qui l’occupe. Vos fichiers, documents et projets enregistrés sont aussi stockés ici. Vider un cache ne supprime que ce qui est refait au besoin.',

  'settings.updates.title': 'Mises à jour',
  'settings.updates.lede': 'Slopographic recherche une nouvelle version à chaque ouverture d’une page. Si une page semble toujours ancienne, chargez la dernière version : les copies hors ligne sont téléchargées à nouveau et la page se recharge. Vos fichiers, documents, réglages et paquets téléchargés sont conservés.',
  'settings.updates.fresh': 'Sur n’importe quelle page, ajouter {fresh} à l’adresse fait la même chose.',
  'settings.updates.refresh': 'Charger la dernière version',

  'settings.rates.lede': 'Les taux sont saisis par vous, ou téléchargés volontairement depuis la Banque centrale européenne. Rien n’est téléchargé sauf si vous activez cette option et appuyez sur le bouton, ou cochez « Mettre à jour à l’ouverture ».',
  'settings.rates.switch_help': 'Permet au bouton Mettre à jour ci-dessous de télécharger les taux de référence quotidiens de la BCE. Désactivé par défaut.',
  'settings.rates.on_open': 'Mettre à jour à l’ouverture',
  'settings.rates.on_open_help': 'Télécharge les taux de la BCE à chaque ouverture de cette page. Nécessite que Taux de change soit activé.',
  'settings.rates.update': 'Mettre à jour les taux depuis la Banque centrale européenne',
  'settings.rates.add_title': 'Ajouter un taux',
  'settings.rates.base': 'Base',
  'settings.rates.quote': 'Cotation',
  'settings.rates.date': 'Date',
  'settings.rates.rate': 'Taux',
  'settings.rates.note': 'Note',
  'settings.rates.save': 'Enregistrer le taux',
  'settings.rates.explain': 'Une unité de la devise de base équivaut au taux exprimé dans la devise de cotation. Les taux enregistrés ne se modifient pas ; pour corriger l’un d’eux, ajoutez une nouvelle ligne pour la date.',
  'settings.rates.recent': 'Taux récents',
  'settings.rates.pair': 'Paire',
  'settings.rates.source': 'Source',

  'settings.apps.lede': 'Options de chaque application. Modifier une option ici ne change que cette application, sauf si sa section indique qu’elle est partagée (la détection de visages est partagée par Slop Drive et Slop Gallery). Réinitialisez une application pour revenir à ses valeurs par défaut.',
  'settings.donate.lede': 'Slopographic est gratuit. Si vous voulez contribuer à sa pérennité, vous pouvez laisser un pourboire dans la Caisse de pourboires.',
});
