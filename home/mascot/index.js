// The homepage's Sloppo: the shared buddy (shared/buddy/) booted with the homepage options —
// on by default, perched on [data-perch] headings and cards, RAGE may unleash chaos by itself,
// knocked cards pile up on the footer. Loaded from index.html as a module.
import { boot } from '../../shared/buddy/boot.js';

boot({ app: 'home', defaultOn: true });
