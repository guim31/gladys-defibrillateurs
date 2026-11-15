// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, states, widget contents,
// scene outputs, action messages), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object. German
// says "du", Spanish "usted". Names and addresses from Géo'DAE never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const DATA_UNAVAILABLE = {
  en: 'The Géo’DAE file of data.gouv.fr cannot be downloaded, a new attempt is planned.',
  fr: 'Le fichier Géo’DAE de data.gouv.fr ne peut pas être téléchargé, un nouvel essai est prévu.',
  de: 'Die Géo’DAE-Datei von data.gouv.fr kann nicht geladen werden, ein neuer Versuch ist geplant.',
  es: 'No se puede descargar el archivo Géo’DAE de data.gouv.fr, se ha previsto un nuevo intento.',
};

// Feature names, frozen when the device is created (configured language).
export const NAMES = {
  en: {
    distance: 'Nearest defibrillator distance',
    nearest: 'Nearest defibrillator',
    location: 'Exact location',
    access: 'Access',
    hours: 'Availability hours',
    available: 'Available now',
    count: 'Defibrillators in the radius',
    available_count: 'Available now in the radius',
    data_date: 'Data date',
  },
  fr: {
    distance: 'Distance du DAE le plus proche',
    nearest: 'DAE le plus proche',
    location: 'Emplacement précis',
    access: 'Accès',
    hours: 'Horaires de disponibilité',
    available: 'Disponible maintenant',
    count: 'DAE dans le rayon',
    available_count: 'Disponibles maintenant dans le rayon',
    data_date: 'Date des données',
  },
  de: {
    distance: 'Entfernung des nächsten Defibrillators',
    nearest: 'Nächster Defibrillator',
    location: 'Genauer Standort',
    access: 'Zugang',
    hours: 'Verfügbarkeitszeiten',
    available: 'Jetzt verfügbar',
    count: 'Defibrillatoren im Umkreis',
    available_count: 'Jetzt verfügbar im Umkreis',
    data_date: 'Datenstand',
  },
  es: {
    distance: 'Distancia del desfibrilador más cercano',
    nearest: 'Desfibrilador más cercano',
    location: 'Ubicación exacta',
    access: 'Acceso',
    hours: 'Horario de disponibilidad',
    available: 'Disponible ahora',
    count: 'Desfibriladores en el radio',
    available_count: 'Disponibles ahora en el radio',
    data_date: 'Fecha de los datos',
  },
};

export const SHORT_WEEKDAYS = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  fr: ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  es: ['lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.', 'dom.'],
};

export const TEXT = {
  en: {
    deviceName: ({ place }) => `Defibrillators – ${place}`,
    house: 'House',
    none: ({ km }) => `No defibrillator within ${km} km`,
    free: 'Free access',
    restricted: 'Restricted access',
    indoor: 'indoor',
    outdoor: 'outdoor',
    groundFloor: 'ground floor',
    floor: ({ floor }) => `floor ${floor}`,
    notDeclared: 'Hours not declared',
    always: '24/7',
    closed: 'closed',
    holidays: 'public holidays',
    exceptions: 'closed on some dates',
    everyDay: 'every day',
    availableNow: 'Available',
    closedNow: 'Closed now',
    unknownNow: 'Hours?',
    emergency: 'Emergency: call 15 or 112',
    pickPlace: 'Add a place in the Discover tab of the integration.',
    gone: 'The place chosen no longer exists.',
    loading: 'Defibrillators are being downloaded…',
    noData: 'No data yet: the Géo’DAE file could not be downloaded.',
    map: 'Map',
    meters: ({ meters }) => (meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`),
    sentence: ({ place, name, distance, address, where, access, status }) =>
      `Nearest defibrillator to ${place}: ${name}, ${distance}${address ? `, ${address}` : ''}${where ? ` (${where})` : ''}. ${access}, ${status}.`,
    sentenceNone: ({ place, km }) => `No defibrillator within ${km} km of ${place}.`,
    statusAvailable: 'available now',
    statusClosed: 'not available now according to its hours',
    statusUnknown: 'hours not declared',
    noPlace: 'No place is watched: add one in the Discover tab.',
    report: ({ places, items, date }) =>
      `${places} place(s) watched, ${items} defibrillator(s) within 5 km. Data of ${date}.`,
    reportNone: 'No data yet.',
    reportError: ({ error }) => `Last download failed: ${error}`,
    reportNoPlace:
      'No place: set the location of your house in Gladys, or add places in the configuration.',
  },
  fr: {
    deviceName: ({ place }) => `Défibrillateurs – ${place}`,
    house: 'Maison',
    none: ({ km }) => `Aucun DAE à moins de ${km} km`,
    free: 'Accès libre',
    restricted: 'Accès restreint',
    indoor: 'intérieur',
    outdoor: 'extérieur',
    groundFloor: 'rez-de-chaussée',
    floor: ({ floor }) => `étage ${floor}`,
    notDeclared: 'Horaires non déclarés',
    always: '24 h/24, 7 j/7',
    closed: 'fermé',
    holidays: 'jours fériés',
    exceptions: 'fermé à certaines dates',
    everyDay: 'tous les jours',
    availableNow: 'Disponible',
    closedNow: 'Fermé',
    unknownNow: 'Horaires ?',
    emergency: 'Urgence : appelez le 15 ou le 112',
    pickPlace: "Ajoutez un lieu depuis l'onglet Découverte de l'intégration.",
    gone: "Le lieu choisi n'existe plus.",
    loading: 'Téléchargement des défibrillateurs en cours…',
    noData: "Pas encore de données : le fichier Géo’DAE n'a pas pu être téléchargé.",
    map: 'Carte',
    meters: ({ meters }) =>
      meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`,
    sentence: ({ place, name, distance, address, where, access, status }) =>
      `DAE le plus proche de ${place} : ${name}, à ${distance}${address ? `, ${address}` : ''}${where ? ` (${where})` : ''}. ${access}, ${status}.`,
    sentenceNone: ({ place, km }) => `Aucun DAE à moins de ${km} km de ${place}.`,
    statusAvailable: 'disponible maintenant',
    statusClosed: 'pas disponible maintenant selon ses horaires',
    statusUnknown: 'horaires non déclarés',
    noPlace: "Aucun lieu suivi : ajoutez-en un depuis l'onglet Découverte.",
    report: ({ places, items, date }) =>
      `${places} lieu(x) suivi(s), ${items} DAE à moins de 5 km. Données du ${date}.`,
    reportNone: 'Pas encore de données.',
    reportError: ({ error }) => `Le dernier téléchargement a échoué : ${error}`,
    reportNoPlace:
      'Aucun lieu : renseignez la position de votre maison dans Gladys, ou ajoutez des lieux dans la configuration.',
  },
  de: {
    deviceName: ({ place }) => `Defibrillatoren – ${place}`,
    house: 'Haus',
    none: ({ km }) => `Kein Defibrillator im Umkreis von ${km} km`,
    free: 'Frei zugänglich',
    restricted: 'Eingeschränkter Zugang',
    indoor: 'innen',
    outdoor: 'außen',
    groundFloor: 'Erdgeschoss',
    floor: ({ floor }) => `Etage ${floor}`,
    notDeclared: 'Zeiten nicht angegeben',
    always: 'rund um die Uhr',
    closed: 'geschlossen',
    holidays: 'Feiertage',
    exceptions: 'an manchen Tagen geschlossen',
    everyDay: 'täglich',
    availableNow: 'Verfügbar',
    closedNow: 'Geschlossen',
    unknownNow: 'Zeiten?',
    emergency: 'Notfall: ruf 15 oder 112 an',
    pickPlace: 'Füge einen Ort im Tab „Entdecken“ der Integration hinzu.',
    gone: 'Der gewählte Ort existiert nicht mehr.',
    loading: 'Defibrillatoren werden geladen…',
    noData: 'Noch keine Daten: Die Géo’DAE-Datei konnte nicht geladen werden.',
    map: 'Karte',
    meters: ({ meters }) =>
      meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`,
    sentence: ({ place, name, distance, address, where, access, status }) =>
      `Nächster Defibrillator bei ${place}: ${name}, ${distance}${address ? `, ${address}` : ''}${where ? ` (${where})` : ''}. ${access}, ${status}.`,
    sentenceNone: ({ place, km }) => `Kein Defibrillator im Umkreis von ${km} km um ${place}.`,
    statusAvailable: 'jetzt verfügbar',
    statusClosed: 'laut seinen Zeiten jetzt nicht verfügbar',
    statusUnknown: 'Zeiten nicht angegeben',
    noPlace: 'Kein Ort verfolgt: Füge einen im Tab „Entdecken“ hinzu.',
    report: ({ places, items, date }) =>
      `${places} verfolgte(r) Ort(e), ${items} Defibrillator(en) im Umkreis von 5 km. Daten vom ${date}.`,
    reportNone: 'Noch keine Daten.',
    reportError: ({ error }) => `Der letzte Download ist fehlgeschlagen: ${error}`,
    reportNoPlace:
      'Kein Ort: Gib den Standort deines Hauses in Gladys an oder füge Orte in der Konfiguration hinzu.',
  },
  es: {
    deviceName: ({ place }) => `Desfibriladores – ${place}`,
    house: 'Casa',
    none: ({ km }) => `Ningún desfibrilador a menos de ${km} km`,
    free: 'Acceso libre',
    restricted: 'Acceso restringido',
    indoor: 'interior',
    outdoor: 'exterior',
    groundFloor: 'planta baja',
    floor: ({ floor }) => `planta ${floor}`,
    notDeclared: 'Horario no declarado',
    always: '24 h, 7 días',
    closed: 'cerrado',
    holidays: 'festivos',
    exceptions: 'cerrado algunos días',
    everyDay: 'todos los días',
    availableNow: 'Disponible',
    closedNow: 'Cerrado',
    unknownNow: '¿Horario?',
    emergency: 'Emergencia: llame al 15 o al 112',
    pickPlace: 'Añada un lugar desde la pestaña Descubrir de la integración.',
    gone: 'El lugar elegido ya no existe.',
    loading: 'Descargando los desfibriladores…',
    noData: 'Todavía no hay datos: no se ha podido descargar el archivo Géo’DAE.',
    map: 'Mapa',
    meters: ({ meters }) =>
      meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`,
    sentence: ({ place, name, distance, address, where, access, status }) =>
      `Desfibrilador más cercano a ${place}: ${name}, a ${distance}${address ? `, ${address}` : ''}${where ? ` (${where})` : ''}. ${access}, ${status}.`,
    sentenceNone: ({ place, km }) => `Ningún desfibrilador a menos de ${km} km de ${place}.`,
    statusAvailable: 'disponible ahora',
    statusClosed: 'no disponible ahora según su horario',
    statusUnknown: 'horario no declarado',
    noPlace: 'Ningún lugar seguido: añada uno desde la pestaña Descubrir.',
    report: ({ places, items, date }) =>
      `${places} lugar(es) seguido(s), ${items} desfibrilador(es) a menos de 5 km. Datos del ${date}.`,
    reportNone: 'Todavía no hay datos.',
    reportError: ({ error }) => `La última descarga ha fallado: ${error}`,
    reportNoPlace:
      'Ningún lugar: indique la ubicación de su casa en Gladys o añada lugares en la configuración.',
  },
};

export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** The same text in every language of the table: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}
