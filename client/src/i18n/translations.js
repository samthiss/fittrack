// UI-only translation dictionary (device-local, see LanguageContext). Server-generated text
// (report recommendations, food suggestions, nutrient names, API error messages) stays French
// for now — translating those would mean touching the AI prompts and every hardcoded sentence
// server-side, out of scope for this pass.
export const translations = {
  fr: {
    // Navigation
    'nav.journal': 'Journal',
    'nav.recipes': 'Recettes',
    'nav.report': 'Rapport',
    'nav.planning': 'Planning',
    'nav.settings': 'Réglages',

    // Common actions
    'common.save': 'Enregistrer',
    'common.saving': 'Enregistrement…',
    'common.add': 'Ajouter',
    'common.cancel': 'Annuler',
    'common.delete': 'Supprimer',
    'common.edit': 'Modifier',
    'common.close': 'Fermer',
    'common.back': 'Retour',
    'common.search': 'Rechercher',
    'common.loading': 'Chargement…',

    // Account settings
    'account.title': 'Compte',
    'account.language': 'Langue',
    'account.mustChangePassword': 'Pense à définir ton propre mot de passe ci-dessous.',
    'account.currentPassword': 'Mot de passe actuel',
    'account.newPassword': 'Nouveau mot de passe',
    'account.changePassword': 'Changer le mot de passe',
    'account.passwordTooShort': 'Le nouveau mot de passe doit faire au moins 8 caractères.',
    'account.passwordUpdated': 'Mot de passe mis à jour.',
    'account.passwordChangeFailed': 'Échec du changement de mot de passe.',
    'account.logout': 'Se déconnecter',
  },
  en: {
    // Navigation
    'nav.journal': 'Journal',
    'nav.recipes': 'Recipes',
    'nav.report': 'Report',
    'nav.planning': 'Planning',
    'nav.settings': 'Settings',

    // Common actions
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.search': 'Search',
    'common.loading': 'Loading…',

    // Account settings
    'account.title': 'Account',
    'account.language': 'Language',
    'account.mustChangePassword': 'Remember to set your own password below.',
    'account.currentPassword': 'Current password',
    'account.newPassword': 'New password',
    'account.changePassword': 'Change password',
    'account.passwordTooShort': 'The new password must be at least 8 characters long.',
    'account.passwordUpdated': 'Password updated.',
    'account.passwordChangeFailed': 'Failed to change password.',
    'account.logout': 'Log out',
  },
};
