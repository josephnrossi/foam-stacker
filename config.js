/* Single place for branding. Swap BRAND_NAME / logos here to re-skin the game. */
window.FBS_CONFIG = {
  BRAND_NAME: 'Gilman Brothers',
  BRAND_LOGO: 'assets/gilman-logo.png',     // full logo (official PNG from gilmanbrothers.com)
  BRAND_EMBLEM: 'assets/gilman-emblem.png', // lion + shield emblem, printed subtly on board faces
  LOGO_SOURCE: 'https://gilmanbrothers.com/wp-content/uploads/2024/02/gilman-brothers-logo-complete.png',
  EMBLEM_SOURCE: 'https://gilmanbrothers.com/wp-content/uploads/2024/07/GilmanLogo3x6-900dpi.png',
  DEMO: true,
  // Hosts, drawn as pixel art from the uncaptioned family photo on the Our History page (identified by the user).
  HOSTS: [
    { id: 'evan', name: 'Evan Gilman', short: 'Evan' },
    { id: 'cyrus', name: 'Cyrus Gilman', short: 'Cyrus' },
  ],
  HOSTS_SOURCE: 'https://gilmanbrothers.com/our-history/',
  // Guest: pops into Cyrus's spot during the WIDWAW event. Drawn from his labelled headshot on the Contact Us page.
  GUEST: { id: 'bill', name: 'Bill VanHorn', short: 'Bill', title: 'Vice President of Commercial Strategy' },
  GUEST_SOURCE: 'https://gilmanbrothers.com/contact-us/',
  GUEST_PHOTO: 'https://gilmanbrothers.com/wp-content/uploads/2024/02/bill-vanhorn.jpg',
};
