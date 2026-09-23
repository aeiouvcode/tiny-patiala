import { mountTown } from './main.js';
mountTown(document.body, { root: document.body, night: location.hash === '#night', onNight: n => history.replaceState(null, '', n ? '#night' : location.pathname) });
