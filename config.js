/* Single place for branding. Swap BRAND_NAME / logos here to re-skin the game. */
window.FBS_CONFIG = {
  BRAND_NAME: 'Gilman Brothers',
  BRAND_LOGO: 'assets/gilman-logo.png',     // full logo (official PNG from gilmanbrothers.com)
  BRAND_EMBLEM: 'assets/gilman-emblem.png', // lion + shield emblem, printed subtly on board faces
  LOGO_SOURCE: 'https://gilmanbrothers.com/wp-content/uploads/2024/02/gilman-brothers-logo-complete.png',
  EMBLEM_SOURCE: 'https://gilmanbrothers.com/wp-content/uploads/2024/07/GilmanLogo3x6-900dpi.png',
  DEMO: true,
  // Hosts. Neither person has an identified photo on gilmanbrothers.com, so both are neutral placeholder characters.
  HOSTS: [
    { id: 'evan', name: 'Evan Gilman', short: 'Evan', hat: '#f5c542', hatShade: '#cf9a22', shirt: '#2f6fd6', shirtShade: '#1f4fa3', pants: '#343a4f' },
    { id: 'cyrus', name: 'Cyrus Gilman', short: 'Cyrus', hat: '#f2f4f7', hatShade: '#c4cad3', shirt: '#4a9be8', shirtShade: '#2f74bd', pants: '#a88d5f' },
  ],
  HOSTS_SOURCE: 'https://gilmanbrothers.com/our-history/',
};
