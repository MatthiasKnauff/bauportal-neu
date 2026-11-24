import { render } from 'solid-js/web';
import { App } from './App';
import './stil.css';

render(() => <App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
