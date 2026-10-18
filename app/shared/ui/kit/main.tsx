// The gallery's page (`npm run kit`): the kit's fonts and stylesheet, the theme, and every piece.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import './styles.css';
import { gallery } from './gallery.tsx';
import { startTheme } from './theme.tsx';

startTheme();
const host = document.getElementById('kit');
if (host) gallery(host);
